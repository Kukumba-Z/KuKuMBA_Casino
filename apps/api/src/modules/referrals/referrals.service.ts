import { Injectable } from '@nestjs/common';
import { Prisma, WalletMode } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { D } from '../../common/utils/money';
import { SettingsService } from '../../config/settings.service';
import { WalletService } from '../wallet/wallet.service';

type Tx = Prisma.TransactionClient;

@Injectable()
export class ReferralsService {
  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private settings: SettingsService,
  ) {}

  async myStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    const referrals = await this.prisma.user.findMany({
      where: { referredById: userId },
      select: { id: true, username: true, accountId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const earnings = await this.prisma.referralEarning.groupBy({
      by: ['currency', 'mode'],
      where: { referrerId: userId },
      _sum: { amount: true },
    });
    const recent = await this.prisma.referralEarning.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return {
      code: user?.referralCode,
      link: `/?ref=${user?.referralCode}`,
      referralsCount: referrals.length,
      referrals,
      earnings: earnings.map((e) => ({
        currency: e.currency,
        mode: e.mode,
        amount: (e._sum.amount ?? D(0)).toFixed(),
      })),
      recent,
    };
  }

  /**
   * Pay the referrer a commission whenever their referee wagers.
   * Commission is a small slice of the stake, in the same currency/mode as the bet.
   * Returns the credited referrer (for a post-commit notification), or null.
   */
  async onWager(
    tx: Tx,
    userId: string,
    stake: Prisma.Decimal,
    currency: string,
    mode: WalletMode,
  ): Promise<{ referrerId: string; amount: Prisma.Decimal } | null> {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { referredById: true },
    });
    if (!user?.referredById) return null;

    const rate = Number(await this.settings.get('referral.wagerCommission', 0.005));
    const amount = stake.mul(rate);
    if (amount.lte(0)) return null;

    await this.wallet.apply(tx, {
      userId: user.referredById,
      type: 'REFERRAL',
      currency,
      mode,
      amount,
      refType: 'referral',
      refId: userId,
      description: 'Referral commission',
    });
    await tx.referralEarning.create({
      data: {
        referrerId: user.referredById,
        referredId: userId,
        currency,
        mode,
        amount,
        type: 'wager_commission',
      },
    });
    return { referrerId: user.referredById, amount };
  }
}
