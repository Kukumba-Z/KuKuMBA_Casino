import { BadRequestException, Injectable } from '@nestjs/common';
import { WalletMode } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { D, ZERO } from '../../common/utils/money';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletService } from '../wallet/wallet.service';

/**
 * Cashback = a slice of NET losses since the last claim, sized by VIP level.
 * Computed per (currency, mode) so it's correct across the multi-currency wallet.
 */
@Injectable()
export class CashbackService {
  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private notifications: NotificationsService,
  ) {}

  private async compute(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const vip = await this.prisma.vipLevel.findUnique({ where: { level: user?.vipLevel ?? 0 } });
    const percent = vip?.cashbackPercent ?? 0;

    const last = await this.prisma.cashbackClaim.findFirst({
      where: { userId, status: 'CLAIMED' },
      orderBy: { createdAt: 'desc' },
    });
    const since = last?.createdAt ?? user?.createdAt ?? new Date(0);

    const [bets, wins] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['currency', 'mode'],
        where: { userId, type: 'BET', createdAt: { gte: since } },
        _sum: { amount: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['currency', 'mode'],
        where: { userId, type: 'WIN', createdAt: { gte: since } },
        _sum: { amount: true },
      }),
    ]);

    const key = (c: string, m: string) => `${c}:${m}`;
    const map = new Map<string, { currency: string; mode: WalletMode; netLoss: any }>();
    for (const b of bets) {
      map.set(key(b.currency, b.mode), {
        currency: b.currency,
        mode: b.mode,
        netLoss: D(b._sum.amount ?? 0),
      });
    }
    for (const w of wins) {
      const k = key(w.currency, w.mode);
      const cur = map.get(k);
      if (cur) cur.netLoss = cur.netLoss.minus(D(w._sum.amount ?? 0));
    }

    const items = [...map.values()]
      .map((it) => ({
        currency: it.currency,
        mode: it.mode,
        netLoss: it.netLoss,
        cashback: it.netLoss.gt(0) ? it.netLoss.mul(percent / 100) : ZERO,
      }))
      .filter((it) => it.cashback.gt(0));

    return { percent, since, items };
  }

  async status(userId: string) {
    const { percent, since, items } = await this.compute(userId);
    return {
      percent,
      since,
      claimable: items.map((i) => ({
        currency: i.currency,
        mode: i.mode,
        netLoss: i.netLoss.toFixed(),
        cashback: i.cashback.toFixed(),
      })),
    };
  }

  async claim(userId: string) {
    const { percent, since, items } = await this.compute(userId);
    if (!items.length) throw new BadRequestException('NOTHING_TO_CLAIM');

    const now = new Date();
    const credited: any[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const it of items) {
        await this.wallet.apply(tx, {
          userId,
          type: 'CASHBACK',
          currency: it.currency,
          mode: it.mode,
          amount: it.cashback,
          refType: 'cashback',
          description: 'Cashback',
        });
        await tx.cashbackClaim.create({
          data: {
            userId,
            periodStart: since,
            periodEnd: now,
            currency: it.currency,
            mode: it.mode,
            netLoss: it.netLoss,
            percent,
            amount: it.cashback,
            status: 'CLAIMED',
            claimedAt: now,
          },
        });
        credited.push({ currency: it.currency, mode: it.mode, amount: it.cashback.toFixed() });
      }
    });

    await this.notifications.notify(userId, {
      type: 'BONUS',
      titleRu: 'Кешбэк получен',
      titleEn: 'Cashback claimed',
      bodyRu: 'Ваш кешбэк зачислен на баланс.',
      bodyEn: 'Your cashback has been credited.',
    });
    return { ok: true, credited };
  }
}
