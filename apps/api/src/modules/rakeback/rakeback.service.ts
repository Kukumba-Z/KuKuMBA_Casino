import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { D, ZERO } from '../../common/utils/money';
import { BonusesService } from '../bonuses/bonuses.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletService } from '../wallet/wallet.service';

type Tx = Prisma.TransactionClient;
type Dec = Prisma.Decimal;

/**
 * Rakeback returns a slice of the HOUSE EDGE (the casino's theoretical profit),
 * not of the raw turnover — the industry-standard model that can't out-pay the
 * house: per REAL bet the player accrues
 *
 *   stake × houseEdge × VipLevel.rakebackPercent / 100
 *
 * (e.g. roulette edge 2.7%, VIP share 20% ⇒ 0.54% of the stake). Win or lose,
 * the accrual is the same, so it is pure loyalty value funded by the casino's
 * expected margin. Accruals collect per currency and are claimed from the
 * bonuses hub whenever the player wants — instant cash, no wagering.
 */
@Injectable()
export class RakebackService {
  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private notifications: NotificationsService,
    private bonuses: BonusesService,
  ) {}

  /**
   * Accrue rakeback for one REAL bet inside the bet transaction. The caller
   * passes the game's house edge (1 − RTP) so any future game plugs in.
   */
  async accrue(tx: Tx, userId: string, currency: string, stake: Dec, houseEdge: number) {
    if (!(houseEdge > 0) || stake.lte(0)) return;
    const user = await tx.user.findUnique({ where: { id: userId }, select: { vipLevel: true } });
    const level = await tx.vipLevel.findUnique({ where: { level: user?.vipLevel ?? 0 } });
    const percent = level?.rakebackPercent ?? 0;
    if (percent <= 0) return;
    const amount = stake.mul(houseEdge).mul(percent).div(100);
    if (amount.lte(0)) return;
    await tx.rakebackAccrual.upsert({
      where: { userId_currency: { userId, currency } },
      create: { userId, currency, amount, earnedTotal: amount },
      update: { amount: { increment: amount }, earnedTotal: { increment: amount } },
    });
  }

  async status(userId: string) {
    const [user, accruals, currencies] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { vipLevel: true } }),
      this.prisma.rakebackAccrual.findMany({ where: { userId } }),
      this.prisma.currency.findMany({ select: { code: true, usdRate: true, decimals: true } }),
    ]);
    const level = await this.prisma.vipLevel.findUnique({ where: { level: user?.vipLevel ?? 0 } });
    const rates = new Map(currencies.map((c) => [c.code, D(c.usdRate)]));

    let totalUsd = ZERO;
    const items = [];
    for (const a of accruals) {
      const amount = D(a.amount);
      if (amount.lte(0)) continue;
      totalUsd = totalUsd.plus(amount.mul(rates.get(a.currency) ?? ZERO));
      items.push({ currency: a.currency, amount: amount.toFixed(), earnedTotal: D(a.earnedTotal).toFixed() });
    }
    return {
      percent: level?.rakebackPercent ?? 0,
      vipLevel: user?.vipLevel ?? 0,
      items,
      totalUsd: totalUsd.toFixed(2),
    };
  }

  /**
   * Credit every positive accrual to the wallet, floored to the currency's
   * precision — the sub-cent dust stays accrued instead of being minted or
   * burned. Guarded updates keep a double-click from paying twice.
   */
  async claim(userId: string) {
    await this.bonuses.assertBonusAccess(userId);
    const [accruals, currencies] = await Promise.all([
      this.prisma.rakebackAccrual.findMany({ where: { userId } }),
      this.prisma.currency.findMany({ select: { code: true, decimals: true } }),
    ]);
    const decimals = new Map(currencies.map((c) => [c.code, c.decimals]));

    const credited: { currency: string; amount: string }[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const a of accruals) {
        const payout = D(a.amount).toDecimalPlaces(
          decimals.get(a.currency) ?? 2,
          Prisma.Decimal.ROUND_DOWN,
        );
        if (payout.lte(0)) continue;
        // Atomic guard: only pay if the accrual still holds the amount.
        const taken = await tx.rakebackAccrual.updateMany({
          where: { id: a.id, amount: { gte: payout } },
          data: { amount: { decrement: payout } },
        });
        if (taken.count === 0) continue;
        await this.wallet.apply(tx, {
          userId,
          type: 'RAKEBACK',
          currency: a.currency,
          mode: 'REAL',
          amount: payout,
          refType: 'rakeback',
          description: 'Rakeback',
        });
        credited.push({ currency: a.currency, amount: payout.toFixed() });
      }
    });
    if (!credited.length) throw new BadRequestException('NOTHING_TO_CLAIM');

    await this.notifications.notify(userId, {
      type: 'BONUS',
      titleRu: 'Рейкбэк получен',
      titleEn: 'Rakeback claimed',
      bodyRu: 'Ваш рейкбэк зачислен на баланс.',
      bodyEn: 'Your rakeback has been credited.',
    });
    return { ok: true, credited };
  }
}
