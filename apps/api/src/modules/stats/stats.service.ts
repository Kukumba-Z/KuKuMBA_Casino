import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

const HISTORY_KEEP_PER_USER = 1000; // matches the profile history depth

/** A finished round's bookkeeping inputs. */
export interface RoundStat {
  userId: string;
  bets: number; // how many bets were in the round
  stake: string; // total stake of the round
}

@Injectable()
export class StatsService {
  private readonly log = new Logger(StatsService.name);
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
  ) {}

  async overview() {
    const [players, rounds, bets, biggestWins] = await Promise.all([
      this.prisma.user.count(),
      this.counter('rounds'),
      this.counter('bets'),
      this.prisma.gameRound.findMany({
        // Real-money wins only — the public leaderboard never shows demo play.
        where: { totalPayout: { gt: 0 }, mode: 'REAL' },
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
      totalBets: bets,
      totalRounds: rounds,
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

  /**
   * Per-round bookkeeping, called fire-and-forget after a round commits:
   *  - bump the persistent global counters (so lobby totals keep growing even as
   *    GameRound is pruned),
   *  - bump the player's lifetime stats (durable across pruning),
   *  - prune the player's rounds beyond the kept window (bets cascade).
   * Never throws — stats must never break a bet.
   */
  async recordRound({ userId, bets, stake }: RoundStat): Promise<void> {
    try {
      await Promise.all([
        this.bump('rounds', 1),
        this.bump('bets', bets),
        this.prisma.user.update({
          where: { id: userId },
          data: { lifetimeBets: { increment: bets }, lifetimeWagered: { increment: stake } },
        }),
      ]);
      await this.pruneUserRounds(userId);
    } catch (e) {
      this.log.warn(`recordRound failed: ${String(e)}`);
    }
  }

  /** Read a counter's value (0 if it doesn't exist yet — backfilled by reconcile). */
  private async counter(key: string): Promise<number> {
    const c = await this.prisma.counter.findUnique({ where: { key } });
    return c?.value ?? 0;
  }

  private bump(key: string, by: number) {
    return this.prisma.counter.upsert({
      where: { key },
      create: { key, value: by },
      update: { value: { increment: by } },
    });
  }

  /** Keep only the latest N rounds for a user (the oldest beyond N are removed). */
  private pruneUserRounds(userId: string) {
    return this.prisma.$executeRawUnsafe(
      `DELETE FROM "GameRound" WHERE "userId" = $1 AND "id" IN (
         SELECT "id" FROM "GameRound" WHERE "userId" = $1 ORDER BY "createdAt" DESC OFFSET ${HISTORY_KEEP_PER_USER}
       )`,
      userId,
    );
  }
}
