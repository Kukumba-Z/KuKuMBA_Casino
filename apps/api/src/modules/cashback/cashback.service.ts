import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { D, ZERO } from '../../common/utils/money';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletService } from '../wallet/wallet.service';

/** Cashback is a weekly perk: claimable once every 7 days. */
const PERIOD_DAYS = 7;
const PERIOD_MS = PERIOD_DAYS * 24 * 60 * 60 * 1000;

/**
 * Cashback = a slice of NET REAL losses over the trailing 7 days, sized by VIP
 * level, claimable once per week. Demo play never counts (demo is free). Losses
 * are computed per currency so it's correct across the multi-currency wallet.
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
    const now = new Date();
    const nextClaimAt = last ? new Date(last.createdAt.getTime() + PERIOD_MS) : null;
    const onCooldown = !!nextClaimAt && nextClaimAt > now;

    // Cashback covers REAL net losses over the trailing 7 days. The weekly
    // cooldown guarantees this window never overlaps a previous claim.
    const since = new Date(now.getTime() - PERIOD_MS);

    const [bets, wins] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['currency'],
        where: { userId, type: 'BET', mode: 'REAL', createdAt: { gte: since } },
        _sum: { amount: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['currency'],
        where: { userId, type: 'WIN', mode: 'REAL', createdAt: { gte: since } },
        _sum: { amount: true },
      }),
    ]);

    const map = new Map<string, { currency: string; netLoss: any }>();
    for (const b of bets) {
      map.set(b.currency, { currency: b.currency, netLoss: D(b._sum.amount ?? 0) });
    }
    for (const w of wins) {
      const cur = map.get(w.currency);
      if (cur) cur.netLoss = cur.netLoss.minus(D(w._sum.amount ?? 0));
    }

    const items = [...map.values()]
      .map((it) => ({
        currency: it.currency,
        netLoss: it.netLoss,
        cashback: it.netLoss.gt(0) ? it.netLoss.mul(percent / 100) : ZERO,
      }))
      .filter((it) => it.cashback.gt(0));

    return { percent, since, items, now, nextClaimAt, onCooldown };
  }

  async status(userId: string) {
    const { percent, since, items, nextClaimAt, onCooldown } = await this.compute(userId);
    return {
      percent,
      periodDays: PERIOD_DAYS,
      since,
      onCooldown,
      nextClaimAt,
      claimable: items.map((i) => ({
        currency: i.currency,
        mode: 'REAL' as const,
        netLoss: i.netLoss.toFixed(),
        cashback: i.cashback.toFixed(),
      })),
    };
  }

  async claim(userId: string) {
    const { percent, since, items, now, onCooldown } = await this.compute(userId);
    if (onCooldown) throw new BadRequestException('CASHBACK_ON_COOLDOWN');
    if (!items.length) throw new BadRequestException('NOTHING_TO_CLAIM');

    const credited: any[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const it of items) {
        await this.wallet.apply(tx, {
          userId,
          type: 'CASHBACK',
          currency: it.currency,
          mode: 'REAL',
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
            mode: 'REAL',
            netLoss: it.netLoss,
            percent,
            amount: it.cashback,
            status: 'CLAIMED',
            claimedAt: now,
          },
        });
        credited.push({ currency: it.currency, mode: 'REAL', amount: it.cashback.toFixed() });
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
