import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

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
  usd: number; // payout in USD-equivalent (for fair cross-currency ranking)
  coeff: number; // payout / stake (the "x")
  at: Date;
}

/**
 * All-time leaderboards over every real-money round in the DB. Stateless: each
 * request returns the top N straight from Postgres (capped at 500), so the
 * server never holds a growing list in memory. The DB keeps all rounds (audit /
 * history / provably-fair); we never prune it — we just never return more than N.
 */
@Injectable()
export class LeaderboardsService {
  constructor(private prisma: PrismaService) {}

  private cap(limit?: number): number {
    const n = Math.floor(Number(limit) || 500);
    return Math.max(1, Math.min(n, 500));
  }

  private gameFilter(game?: string): Prisma.Sql {
    return game ? Prisma.sql`AND g."key" = ${game}` : Prisma.empty;
  }

  /** Biggest wins of all time, ranked by USD-equivalent payout. */
  wins(limit?: number, game?: string): Promise<LeaderRow[]> {
    return this.prisma.$queryRaw<LeaderRow[]>(Prisma.sql`
      SELECT gr."id" AS "roundId", g."name" AS "game", g."key" AS "gameKey", g."category" AS "category",
             u."username" AS "username", u."accountId" AS "accountId",
             gr."totalStake"::text AS "stake", gr."totalPayout"::text AS "payout", gr."currency" AS "currency",
             (gr."totalPayout" * c."usdRate")::float8 AS "usd",
             (gr."totalPayout" / NULLIF(gr."totalStake", 0))::float8 AS "coeff",
             gr."createdAt" AS "at"
      FROM "GameRound" gr
      JOIN "Game" g ON g."id" = gr."gameId"
      JOIN "User" u ON u."id" = gr."userId"
      JOIN "Currency" c ON c."code" = gr."currency"
      WHERE gr."mode" = 'REAL' AND gr."totalPayout" > 0
      ${this.gameFilter(game)}
      ORDER BY gr."totalPayout" * c."usdRate" DESC, gr."createdAt" DESC
      LIMIT ${this.cap(limit)}
    `);
  }

  /** Biggest multipliers ("иксы") of all time, ranked by payout / stake. */
  x(limit?: number, game?: string): Promise<LeaderRow[]> {
    return this.prisma.$queryRaw<LeaderRow[]>(Prisma.sql`
      SELECT gr."id" AS "roundId", g."name" AS "game", g."key" AS "gameKey", g."category" AS "category",
             u."username" AS "username", u."accountId" AS "accountId",
             gr."totalStake"::text AS "stake", gr."totalPayout"::text AS "payout", gr."currency" AS "currency",
             (gr."totalPayout" * c."usdRate")::float8 AS "usd",
             (gr."totalPayout" / NULLIF(gr."totalStake", 0))::float8 AS "coeff",
             gr."createdAt" AS "at"
      FROM "GameRound" gr
      JOIN "Game" g ON g."id" = gr."gameId"
      JOIN "User" u ON u."id" = gr."userId"
      JOIN "Currency" c ON c."code" = gr."currency"
      WHERE gr."mode" = 'REAL' AND gr."totalStake" > 0 AND gr."totalPayout" > 0
      ${this.gameFilter(game)}
      ORDER BY gr."totalPayout" / gr."totalStake" DESC, gr."totalPayout" * c."usdRate" DESC
      LIMIT ${this.cap(limit)}
    `);
  }
}
