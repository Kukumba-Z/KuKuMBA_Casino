import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class StatsService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
  ) {}

  async overview() {
    const [players, totalBets, totalRounds, biggestWins] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.bet.count(),
      this.prisma.gameRound.count(),
      this.prisma.gameRound.findMany({
        where: { totalPayout: { gt: 0 } },
        orderBy: { totalPayout: 'desc' },
        take: 8,
        include: { user: { select: { username: true, accountId: true } } },
      }),
    ]);

    // a little baseline so a fresh lobby still feels alive
    const onlineSockets = this.realtime.onlineCount();
    return {
      online: { sockets: onlineSockets, users: Math.max(this.realtime.onlineUsers(), onlineSockets) },
      players,
      totalBets,
      totalRounds,
      biggestWins: biggestWins.map((r) => ({
        username: r.user.username,
        accountId: r.user.accountId,
        outcome: r.outcome,
        color: r.outcomeColor,
        payout: r.totalPayout.toFixed(),
        currency: r.currency,
        mode: r.mode,
        at: r.createdAt.getTime(),
      })),
    };
  }
}
