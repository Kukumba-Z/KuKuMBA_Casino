import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { D } from '../../common/utils/money';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class PromocodesService {
  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private notifications: NotificationsService,
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
      } else if (promo.type === 'VIP_XP') {
        await tx.user.update({
          where: { id: userId },
          data: { vipXp: { increment: promo.vipXp ?? 0 } },
        });
      } else if (promo.type === 'BONUS' || promo.type === 'FREEBET') {
        const bonus = promo.bonusKey
          ? await tx.bonus.findUnique({ where: { key: promo.bonusKey } })
          : null;
        const amount = D(promo.amount.gt(0) ? promo.amount : (bonus?.amount ?? 0));
        await tx.userBonus.create({
          data: {
            userId,
            bonusId: bonus?.id,
            name: bonus?.name ?? `Promo ${promo.code}`,
            amount,
            currency: promo.currency ?? bonus?.currency ?? 'DEMO',
            mode: promo.mode,
            wagerRequired: amount.mul(bonus?.wagerMultiplier ?? 0),
            status: 'ACTIVE',
          },
        });
        await this.wallet.apply(tx, {
          userId,
          type: 'BONUS',
          currency: promo.currency ?? bonus?.currency ?? 'DEMO',
          mode: promo.mode,
          amount,
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
