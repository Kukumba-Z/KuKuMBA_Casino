import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

const CAP = 500; // rows kept per board — storage is permanently bounded

type Board = 'WINS' | 'X';

/** A finished real-money round, ready to be folded into the leaderboards. */
export interface RecordInput {
  roundId: string;
  gameKey: string;
  gameName: string;
  category: string;
  username: string;
  accountId: number;
  currency: string;
  stake: string;
  payout: string;
  usd: number; // payout in USD-equivalent
  coeff: number; // payout / stake
  at: Date;
}

/** One leaderboard row — shaped to match the live 'bet' socket payload so the
 *  client can fold real-time bets into the same list. */
export interface LeaderRow {
  roundId: string;
  game: string;
  gameKey: string;
  category: string;
  username: string;
  accountId: number;
  stake: string;
  payout: string;
  currency: string;
  usd: number;
  coeff: number;
  at: Date;
}

/**
 * All-time leaderboards backed by a dedicated, permanently-bounded table
 * (≤CAP rows per board). Each finished round is folded in via `record()` and the
 * board is trimmed back to the top CAP, so the leaderboard stays durable even
 * after the source GameRound is pruned by retention — and storage never grows.
 */
@Injectable()
export class LeaderboardsService implements OnModuleInit {
  private readonly log = new Logger(LeaderboardsService.name);
  constructor(private prisma: PrismaService) {}

  /** One-time backfill from existing rounds so the boards aren't empty on first deploy. */
  async onModuleInit() {
    try {
      if ((await this.prisma.leaderboardEntry.count()) === 0) await this.backfill();
    } catch (e) {
      this.log.warn(`leaderboard backfill skipped: ${String(e)}`);
    }
  }

  /** Biggest wins of all time (ranked by USD-equivalent payout). */
  wins(limit?: number, game?: string): Promise<LeaderRow[]> {
    return this.read('WINS', 'usd', limit, game);
  }

  /** Biggest multipliers of all time (ranked by payout / stake). */
  x(limit?: number, game?: string): Promise<LeaderRow[]> {
    return this.read('X', 'coeff', limit, game);
  }

  private async read(board: Board, rank: 'usd' | 'coeff', limit?: number, game?: string): Promise<LeaderRow[]> {
    const rows: any[] = await this.prisma.leaderboardEntry.findMany({
      where: { board, ...(game ? { gameKey: game } : {}) },
      orderBy: rank === 'usd' ? { usd: 'desc' } : { coeff: 'desc' },
      take: this.cap(limit),
    });
    return rows.map((r) => ({
      roundId: r.roundId,
      game: r.gameName,
      gameKey: r.gameKey,
      category: r.category,
      username: r.username,
      accountId: r.accountId,
      stake: typeof r.stake?.toFixed === 'function' ? r.stake.toFixed() : String(r.stake),
      payout: typeof r.payout?.toFixed === 'function' ? r.payout.toFixed() : String(r.payout),
      currency: r.currency,
      usd: r.usd,
      coeff: r.coeff,
      at: r.at,
    }));
  }

  private cap(limit?: number): number {
    const n = Math.floor(Number(limit) || CAP);
    return Math.max(1, Math.min(n, CAP));
  }

  /**
   * Fold a finished real-money win into both boards, then trim each to the top CAP.
   * Call fire-and-forget from a game service so it never blocks a bet.
   */
  async record(input: RecordInput): Promise<void> {
    if (!(Number(input.payout) > 0)) return; // wins only
    const base = {
      roundId: input.roundId, gameKey: input.gameKey, gameName: input.gameName, category: input.category,
      username: input.username, accountId: input.accountId, currency: input.currency,
      stake: input.stake, payout: input.payout, usd: input.usd, coeff: input.coeff, at: input.at,
    };
    try {
      await this.prisma.leaderboardEntry.createMany({
        data: [{ board: 'WINS', ...base }, ...(input.coeff > 0 ? [{ board: 'X', ...base }] : [])],
        skipDuplicates: true,
      });
      await this.trim('WINS', 'usd');
      if (input.coeff > 0) await this.trim('X', 'coeff');
    } catch (e) {
      this.log.warn(`leaderboard record failed: ${String(e)}`);
    }
  }

  /** Keep only the top CAP rows of a board (by the given numeric column). */
  private async trim(board: Board, col: 'usd' | 'coeff'): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM "LeaderboardEntry" WHERE "board" = $1 AND "id" NOT IN (
         SELECT "id" FROM "LeaderboardEntry" WHERE "board" = $1 ORDER BY "${col}" DESC LIMIT ${CAP}
       )`,
      board,
    );
  }

  /** Seed both boards from the surviving GameRound history (best-effort, one-time). */
  private async backfill(): Promise<void> {
    const [wins, xs] = await Promise.all([this.topFromRounds('usd', false), this.topFromRounds('coeff', true)]);
    const data = [
      ...wins.map((r) => ({ board: 'WINS', ...r })),
      ...xs.map((r) => ({ board: 'X', ...r })),
    ];
    if (data.length) {
      await this.prisma.leaderboardEntry.createMany({ data, skipDuplicates: true });
      this.log.log(`leaderboard backfilled: ${data.length} entries`);
    }
  }

  private topFromRounds(rank: 'usd' | 'coeff', needStake: boolean): Promise<RecordInput[]> {
    const order = rank === 'usd'
      ? Prisma.sql`gr."totalPayout" * c."usdRate"`
      : Prisma.sql`gr."totalPayout" / gr."totalStake"`;
    const stakeCond = needStake ? Prisma.sql`AND gr."totalStake" > 0` : Prisma.empty;
    return this.prisma.$queryRaw<RecordInput[]>(Prisma.sql`
      SELECT gr."id" AS "roundId", g."key" AS "gameKey", g."name" AS "gameName", g."category" AS "category",
             u."username" AS "username", u."accountId" AS "accountId", gr."currency" AS "currency",
             gr."totalStake"::text AS "stake", gr."totalPayout"::text AS "payout",
             (gr."totalPayout" * c."usdRate")::float8 AS "usd",
             (gr."totalPayout" / NULLIF(gr."totalStake", 0))::float8 AS "coeff",
             gr."createdAt" AS "at"
      FROM "GameRound" gr
      JOIN "Game" g ON g."id" = gr."gameId"
      JOIN "User" u ON u."id" = gr."userId"
      JOIN "Currency" c ON c."code" = gr."currency"
      WHERE gr."mode" = 'REAL' AND gr."totalPayout" > 0
      ${stakeCond}
      ORDER BY ${order} DESC
      LIMIT ${CAP}
    `);
  }
}
