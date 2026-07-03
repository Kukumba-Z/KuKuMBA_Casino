import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { D } from '../../common/utils/money';
import { BonusesService } from '../bonuses/bonuses.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class PromocodesService {
  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private notifications: NotificationsService,
    private bonuses: BonusesService,
  ) {}

  async redeem(userId: string, rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    const promo = await this.prisma.promoCode.findUnique({ where: { code } });
    if (!promo || !promo.enabled) throw new NotFoundException('PROMO_INVALID');
    if (promo.expiresAt && promo.expiresAt < new Date()) throw new BadRequestException('PROMO_EXPIRED');
    if (promo.maxRedemptions && promo.redeemedCount >= promo.maxRedemptions) {
      throw new BadRequestException('PROMO_EXHAUSTED');
    }
    const used = await this.prisma.promoRedemption.count({
      where: { promoCodeId: promo.id, userId },
    });
    if (used >= promo.perUserLimit) throw new BadRequestException('PROMO_ALREADY_USED');

    // Anti-abuse: per-user block, monthly cap, deposit requirement (amount +
    // recent window), and — for wagered bonuses — no stacking.
    await this.bonuses.assertBonusAccess(userId);
    await this.bonuses.assertPromoMonthlyLimit(userId);
    await this.bonuses.assertDepositEligible(userId, {
      requiresDeposit: promo.requiresDeposit,
      minDeposit: promo.minDeposit,
      depositWithinDays: promo.depositWithinDays,
    });
    if (promo.type === 'BONUS' || promo.type === 'FREEBET') await this.bonuses.assertNoActiveWager(userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.promoRedemption.create({ data: { promoCodeId: promo.id, userId } });
      await tx.promoCode.update({ where: { id: promo.id }, data: { redeemedCount: { increment: 1 } } });

      if (promo.type === 'BALANCE') {
        await this.wallet.apply(tx, {
          userId,
          type: 'PROMO',
          currency: promo.currency ?? 'DEMO',
          mode: promo.mode,
          amount: D(promo.amount),
          refType: 'promo',
          refId: promo.id,
          description: `Promo ${promo.code}`,
        });
      } else if (promo.type === 'BONUS' || promo.type === 'FREEBET') {
        const bonus = promo.bonusKey
          ? await tx.bonus.findUnique({ where: { key: promo.bonusKey } })
          : null;
        const amount = D(promo.amount.gt(0) ? promo.amount : (bonus?.amount ?? 0));
        // Grant through the shared engine so wagering is tracked and a zero-wager
        // promo is marked COMPLETED (never locks a withdrawal). The promo's own
        // wager/sticky/cashout terms win, falling back to the linked bonus.
        await this.bonuses.grantBonus(tx, {
          userId,
          bonusId: bonus?.id,
          name: bonus?.name ?? `Promo ${promo.code}`,
          amount,
          currency: promo.currency ?? bonus?.currency ?? 'DEMO',
          mode: promo.mode,
          wagerMultiplier: promo.wagerMultiplier || bonus?.wagerMultiplier || 0,
          sticky: promo.sticky,
          maxCashout: promo.maxCashout ?? bonus?.maxCashout ?? null,
          maxCashoutMultiplier: promo.maxCashoutMultiplier ?? bonus?.maxCashoutMultiplier ?? null,
          wagerPeriodHours: promo.wagerPeriodHours ?? bonus?.wagerPeriodHours ?? null,
          refType: 'promo',
          refId: promo.id,
          description: `Promo bonus ${promo.code}`,
        });
      }
    });

    await this.notifications.notify(userId, {
      type: 'PROMO',
      titleRu: 'Промокод активирован',
      titleEn: 'Promo code redeemed',
      bodyRu: `Промокод ${promo.code} успешно применён.`,
      bodyEn: `Promo code ${promo.code} applied successfully.`,
    });

    return { ok: true, type: promo.type, amount: promo.amount.toFixed(), currency: promo.currency };
  }

  myRedemptions(userId: string) {
    return this.prisma.promoRedemption.findMany({
      where: { userId },
      include: { promoCode: { select: { code: true, type: true, amount: true, currency: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
