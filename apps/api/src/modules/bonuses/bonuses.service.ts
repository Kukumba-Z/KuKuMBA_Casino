import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { D } from '../../common/utils/money';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class BonusesService {
  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private notifications: NotificationsService,
  ) {}

  /** Public catalog of available bonuses. */
  catalog() {
    return this.prisma.bonus.findMany({ where: { enabled: true }, orderBy: { createdAt: 'asc' } });
  }

  myBonuses(userId: string) {
    return this.prisma.userBonus.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async claim(userId: string, key: string) {
    const bonus = await this.prisma.bonus.findUnique({ where: { key } });
    if (!bonus || !bonus.enabled) throw new NotFoundException('BONUS_NOT_FOUND');
    if (!['NO_DEPOSIT', 'WELCOME'].includes(bonus.type)) {
      throw new BadRequestException('BONUS_NOT_CLAIMABLE'); // deposit/reload bonuses apply automatically
    }
    const existing = await this.prisma.userBonus.findFirst({ where: { userId, bonusId: bonus.id } });
    if (existing) throw new BadRequestException('ALREADY_CLAIMED');

    const amount = D(bonus.amount);
    const currency = bonus.currency ?? 'DEMO';
    const mode = currency === 'DEMO' ? 'DEMO' : 'REAL';

    await this.prisma.$transaction(async (tx) => {
      await tx.userBonus.create({
        data: {
          userId,
          bonusId: bonus.id,
          name: bonus.name,
          amount,
          currency,
          mode,
          wagerRequired: amount.mul(bonus.wagerMultiplier),
          status: 'ACTIVE',
        },
      });
      await this.wallet.apply(tx, {
        userId,
        type: 'BONUS',
        currency,
        mode,
        amount,
        refType: 'bonus',
        refId: bonus.id,
        description: `Bonus ${bonus.name}`,
      });
    });

    await this.notifications.notify(userId, {
      type: 'BONUS',
      titleRu: 'Бонус начислен 🎉',
      titleEn: 'Bonus credited 🎉',
      bodyRu: `Вы получили бонус «${bonus.name}».`,
      bodyEn: `You claimed the "${bonus.name}" bonus.`,
    });
    return { ok: true };
  }
}
