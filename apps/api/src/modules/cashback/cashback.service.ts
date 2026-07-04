import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { D, ZERO } from '../../common/utils/money';
import { SettingsService } from '../../config/settings.service';
import { BonusesService } from '../bonuses/bonuses.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletService } from '../wallet/wallet.service';

type Dec = Prisma.Decimal;

/** Fallback accrual window when the cashback.periodDays setting is unset. */
const DEFAULT_PERIOD_DAYS = 7;

/**
 * Weekly cashback on the player's net cash-in:
 *
 *   cashback = (deposits − withdrawals over the trailing 7 days) × VIP percent
 *
 * Both sides are aggregated in USD-equivalent across ALL currencies (so a
 * deposit-in-USD / withdraw-in-RUB round-trip via conversion can't inflate the
 * base), and the payout lands in the currency the player deposited the most
 * that week, floored to its precision. The wagering terms (×3 by default) come
 * from the CASHBACK bonus config row, so they stay admin-tunable data.
 */
@Injectable()
export class CashbackService {
  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private notifications: NotificationsService,
    private bonuses: BonusesService,
    private settings: SettingsService,
  ) {}

  /** Admin-tunable accrual window (cashback.periodDays app setting). */
  private async periodDays(): Promise<number> {
    const raw = Number(await this.settings.get('cashback.periodDays', DEFAULT_PERIOD_DAYS));
    return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_PERIOD_DAYS;
  }

  private async compute(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const vip = await this.prisma.vipLevel.findUnique({ where: { level: user?.vipLevel ?? 0 } });
    const percent = vip?.cashbackPercent ?? 0;

    const periodDays = await this.periodDays();
    const periodMs = periodDays * 24 * 60 * 60 * 1000;
    const last = await this.prisma.cashbackClaim.findFirst({
      where: { userId, status: 'CLAIMED' },
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    const nextClaimAt = last ? new Date(last.createdAt.getTime() + periodMs) : null;
    const onCooldown = !!nextClaimAt && nextClaimAt > now;
    const since = new Date(now.getTime() - periodMs);

    const [deposits, withdrawals, currencies] = await Promise.all([
      this.prisma.deposit.groupBy({
        by: ['currency'],
        where: { userId, mode: 'REAL', status: 'COMPLETED', createdAt: { gte: since } },
        _sum: { amount: true },
      }),
      this.prisma.withdrawal.groupBy({
        by: ['currency'],
        // Everything that took (or is taking) money out; rejected/failed ones
        // were refunded, so they don't reduce the week's net cash-in.
        where: { userId, createdAt: { gte: since }, status: { notIn: ['REJECTED', 'FAILED'] } },
        _sum: { amount: true, fee: true },
      }),
      this.prisma.currency.findMany({ select: { code: true, usdRate: true, decimals: true } }),
    ]);
    const rates = new Map(currencies.map((c) => [c.code, D(c.usdRate)]));
    const decimals = new Map(currencies.map((c) => [c.code, c.decimals]));

    let depositsUsd = ZERO;
    let withdrawalsUsd = ZERO;
    // USD value deposited per currency — picks the payout currency below.
    const depUsdByCurrency = new Map<string, Dec>();
    for (const d of deposits) {
      const usd = D(d._sum.amount ?? 0).mul(rates.get(d.currency) ?? ZERO);
      depositsUsd = depositsUsd.plus(usd);
      depUsdByCurrency.set(d.currency, usd);
    }
    for (const w of withdrawals) {
      const out = D(w._sum.amount ?? 0).plus(D(w._sum.fee ?? 0));
      withdrawalsUsd = withdrawalsUsd.plus(out.mul(rates.get(w.currency) ?? ZERO));
    }

    const netUsd = depositsUsd.minus(withdrawalsUsd);
    const cashbackUsd = netUsd.gt(0) ? netUsd.mul(percent).div(100) : ZERO;

    // Pay in the week's dominant deposit currency, floored to its precision —
    // the kopecks are simply dropped, never minted.
    let payout: { currency: string; amount: Dec } | null = null;
    if (cashbackUsd.gt(0)) {
      let bestCurrency: string | null = null;
      let bestUsd = ZERO;
      for (const [currency, usd] of depUsdByCurrency) {
        if (usd.gt(bestUsd)) {
          bestUsd = usd;
          bestCurrency = currency;
        }
      }
      if (bestCurrency) {
        const rate = rates.get(bestCurrency) ?? ZERO;
        const amount = rate.gt(0)
          ? cashbackUsd.div(rate).toDecimalPlaces(decimals.get(bestCurrency) ?? 2, Prisma.Decimal.ROUND_DOWN)
          : ZERO;
        if (amount.gt(0)) payout = { currency: bestCurrency, amount };
      }
    }

    return { percent, periodDays, since, now, nextClaimAt, onCooldown, depositsUsd, withdrawalsUsd, netUsd, payout };
  }

  async status(userId: string) {
    const c = await this.compute(userId);
    // The wagering terms shown next to the claim button come from the config.
    const cfg = await this.cashbackConfig();
    return {
      percent: c.percent,
      periodDays: c.periodDays,
      since: c.since,
      onCooldown: c.onCooldown,
      nextClaimAt: c.nextClaimAt,
      depositsUsd: c.depositsUsd.toFixed(2),
      withdrawalsUsd: c.withdrawalsUsd.toFixed(2),
      netUsd: c.netUsd.toFixed(2),
      wagerMultiplier: cfg?.wagerMultiplier ?? 0,
      claimable: c.payout
        ? [{ currency: c.payout.currency, mode: 'REAL' as const, cashback: c.payout.amount.toFixed() }]
        : [],
    };
  }

  /** The CASHBACK bonus row holds the wagering terms (×3 seeded; admin-tunable). */
  private cashbackConfig() {
    return this.prisma.bonus.findFirst({
      where: { type: 'CASHBACK', enabled: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async claim(userId: string) {
    await this.bonuses.assertBonusAccess(userId);
    const { percent, periodDays, since, now, onCooldown, netUsd, payout } = await this.compute(userId);
    if (onCooldown) throw new BadRequestException('CASHBACK_ON_COOLDOWN');
    if (!payout) throw new BadRequestException('NOTHING_TO_CLAIM');

    const cfg = await this.cashbackConfig();
    const wager = cfg?.wagerMultiplier ?? 0;

    await this.prisma.$transaction(async (tx) => {
      // Serialize claims per user and re-check the cooldown INSIDE the
      // transaction — the pre-check above is only a UX fast-path, so two
      // parallel claims must not both pay out.
      await tx.$queryRawUnsafe('SELECT 1 FROM "User" WHERE id = $1 FOR UPDATE', userId);
      const last = await tx.cashbackClaim.findFirst({
        where: { userId, status: 'CLAIMED' },
        orderBy: { createdAt: 'desc' },
      });
      if (last && last.createdAt.getTime() + periodDays * 86_400_000 > Date.now()) {
        throw new BadRequestException('CASHBACK_ON_COOLDOWN');
      }
      await this.wallet.apply(tx, {
        userId,
        type: 'CASHBACK',
        currency: payout.currency,
        mode: 'REAL',
        amount: payout.amount,
        refType: 'cashback',
        description: 'Weekly cashback',
      });
      if (cfg && wager > 0) {
        // Attach the wager obligation without re-crediting (money added above).
        await this.bonuses.grantBonus(tx, {
          userId,
          bonusId: cfg.id,
          name: cfg.name,
          amount: payout.amount,
          currency: payout.currency,
          mode: 'REAL',
          wagerMultiplier: wager,
          sticky: cfg.sticky,
          maxCashout: cfg.maxCashout,
          maxCashoutMultiplier: cfg.maxCashoutMultiplier,
          wagerPeriodHours: cfg.wagerPeriodHours,
          credit: false,
          refType: 'cashback',
          refId: cfg.id,
          description: `Cashback wager ${cfg.name}`,
        });
      }
      await tx.cashbackClaim.create({
        data: {
          userId,
          periodStart: since,
          periodEnd: now,
          currency: payout.currency,
          mode: 'REAL',
          baseUsd: netUsd,
          percent,
          amount: payout.amount,
          status: 'CLAIMED',
          claimedAt: now,
        },
      });
    });

    await this.notifications.notify(userId, {
      type: 'BONUS',
      titleRu: 'Кешбэк получен',
      titleEn: 'Cashback claimed',
      bodyRu: wager > 0 ? `Кешбэк зачислен на баланс. Вейджер ×${wager}.` : 'Ваш кешбэк зачислен на баланс.',
      bodyEn: wager > 0 ? `Cashback credited. Wagering ×${wager}.` : 'Your cashback has been credited.',
    });
    return {
      ok: true,
      credited: [{ currency: payout.currency, mode: 'REAL', amount: payout.amount.toFixed() }],
    };
  }
}
