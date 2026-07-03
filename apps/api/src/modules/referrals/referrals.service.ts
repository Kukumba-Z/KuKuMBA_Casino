import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, WalletMode } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { D, ZERO } from '../../common/utils/money';
import { SettingsService } from '../../config/settings.service';
import { WalletService } from '../wallet/wallet.service';

type Tx = Prisma.TransactionClient;
type Dec = Prisma.Decimal;

/** Default referrer share of a referral's net losses (revenue share). */
const DEFAULT_LOSS_COMMISSION = 0.1;

/**
 * Referral program — revenue share on NET LOSSES (the industry "RevShare on
 * NGR" model): the referrer earns `share × (stake − payout)` of every settled
 * REAL round of their referrals. Wins push the per-referral carryover negative,
 * and later losses must refill that hole before anything new is earned — so
 * total commission can never exceed the referrer's share of what the referral
 * actually lost, and the casino never pays commission out of its own pocket.
 *
 * Earnings collect into per-currency claimable balances (with full per-referral
 * statistics); claiming credits the wallet floored to the currency's precision.
 */
@Injectable()
export class ReferralsService {
  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private settings: SettingsService,
  ) {}

  /** The revenue-share rate (fraction, e.g. 0.1 = 10%) — admin-tunable setting. */
  private async rate(): Promise<Dec> {
    return D(await this.settings.get('referral.lossCommission', DEFAULT_LOSS_COMMISSION));
  }

  async myStats(userId: string) {
    const [user, referrals, commissions, balances, recent, rate, currencies] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } }),
      this.prisma.user.findMany({
        where: { referredById: userId },
        select: { id: true, username: true, accountId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.referralCommission.findMany({ where: { referrerId: userId } }),
      this.prisma.referralBalance.findMany({ where: { referrerId: userId } }),
      this.prisma.referralEarning.findMany({
        where: { referrerId: userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { referred: { select: { username: true, accountId: true } } },
      }),
      this.rate(),
      this.prisma.currency.findMany({ select: { code: true, usdRate: true } }),
    ]);
    const rates = new Map(currencies.map((c) => [c.code, D(c.usdRate)]));
    const toUsd = (amount: Dec, currency: string) => amount.mul(rates.get(currency) ?? ZERO);

    // Lifetime earned per referral, USD-normalised across currencies.
    const earnedByReferral = new Map<string, Dec>();
    for (const c of commissions) {
      const prev = earnedByReferral.get(c.referredId) ?? ZERO;
      earnedByReferral.set(c.referredId, prev.plus(toUsd(D(c.earned), c.currency)));
    }

    let claimableUsd = ZERO;
    let earnedTotalUsd = ZERO;
    for (const b of balances) {
      claimableUsd = claimableUsd.plus(toUsd(D(b.amount), b.currency));
      earnedTotalUsd = earnedTotalUsd.plus(toUsd(D(b.earnedTotal), b.currency));
    }

    return {
      code: user?.referralCode,
      link: `/register?ref=${user?.referralCode}`,
      percent: rate.mul(100).toNumber(),
      referralsCount: referrals.length,
      // Referrals that have actually generated commission at least once.
      activeReferralsCount: [...earnedByReferral.values()].filter((v) => v.gt(0)).length,
      claimable: balances
        .filter((b) => D(b.amount).gt(0))
        .map((b) => ({ currency: b.currency, amount: D(b.amount).toFixed() })),
      claimableUsd: claimableUsd.toFixed(2),
      earnedTotalUsd: earnedTotalUsd.toFixed(2),
      referrals: referrals.map((r) => ({
        id: r.id,
        username: r.username,
        accountId: r.accountId,
        createdAt: r.createdAt,
        earnedUsd: (earnedByReferral.get(r.id) ?? ZERO).toFixed(2),
      })),
      recent: recent.map((e) => ({
        id: e.id,
        currency: e.currency,
        amount: D(e.amount).toFixed(),
        from: e.referred ? { username: e.referred.username, accountId: e.referred.accountId } : null,
        createdAt: e.createdAt,
      })),
    };
  }

  /**
   * Settle the referral commission for one finished REAL round, inside the bet
   * transaction. `pending` is the negative-carryover buffer per (referral,
   * currency); whenever it turns positive it is flushed into the referrer's
   * claimable balance (atomically — concurrent rounds can't double-flush).
   */
  async onRoundSettled(
    tx: Tx,
    userId: string,
    currency: string,
    mode: WalletMode,
    stake: Dec,
    payout: Dec,
  ): Promise<void> {
    if (mode !== 'REAL') return; // demo play is free — it never generates commission
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { referredById: true },
    });
    if (!user?.referredById) return;

    const rate = await this.rate();
    if (rate.lte(0)) return;
    const delta = stake.minus(payout).mul(rate);
    if (delta.isZero()) return;

    const referrerId = user.referredById;
    const row = await tx.referralCommission.upsert({
      where: { referrerId_referredId_currency: { referrerId, referredId: userId, currency } },
      create: { referrerId, referredId: userId, currency, pending: delta },
      update: { pending: { increment: delta } },
    });
    const pending = D(row.pending);
    if (pending.lte(0)) return;

    // Flush the earned part by exact decrement so a concurrent round that
    // already moved some of it can never make us pay the same money twice.
    const flushed = await tx.referralCommission.updateMany({
      where: { id: row.id, pending: { gte: pending } },
      data: { pending: { decrement: pending }, earned: { increment: pending } },
    });
    if (flushed.count === 0) return;
    await tx.referralBalance.upsert({
      where: { referrerId_currency: { referrerId, currency } },
      create: { referrerId, currency, amount: pending, earnedTotal: pending },
      update: { amount: { increment: pending }, earnedTotal: { increment: pending } },
    });
    await tx.referralEarning.create({
      data: {
        referrerId,
        referredId: userId,
        currency,
        mode: 'REAL',
        amount: pending,
        type: 'loss_commission',
      },
    });
  }

  /**
   * Pay out every positive commission balance to the wallet, floored to the
   * currency's precision — the kopecks stay on the balance rather than being
   * minted or lost. Guarded updates make a double-click harmless.
   */
  async claim(userId: string) {
    const [balances, currencies] = await Promise.all([
      this.prisma.referralBalance.findMany({ where: { referrerId: userId } }),
      this.prisma.currency.findMany({ select: { code: true, decimals: true } }),
    ]);
    const decimals = new Map(currencies.map((c) => [c.code, c.decimals]));

    const credited: { currency: string; amount: string }[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const b of balances) {
        const payout = D(b.amount).toDecimalPlaces(
          decimals.get(b.currency) ?? 2,
          Prisma.Decimal.ROUND_DOWN,
        );
        if (payout.lte(0)) continue;
        const taken = await tx.referralBalance.updateMany({
          where: { id: b.id, amount: { gte: payout } },
          data: { amount: { decrement: payout } },
        });
        if (taken.count === 0) continue;
        await this.wallet.apply(tx, {
          userId,
          type: 'REFERRAL',
          currency: b.currency,
          mode: 'REAL',
          amount: payout,
          refType: 'referral',
          description: 'Referral commission',
        });
        credited.push({ currency: b.currency, amount: payout.toFixed() });
      }
    });
    if (!credited.length) throw new BadRequestException('NOTHING_TO_CLAIM');
    return { ok: true, credited };
  }
}
