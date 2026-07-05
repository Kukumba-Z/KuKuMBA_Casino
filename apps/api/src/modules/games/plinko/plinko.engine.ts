import { BadRequestException } from '@nestjs/common';
import { floatFromSeeds } from '../../provably-fair/provably-fair.crypto';

/**
 * KuKuMBA Plinko math — pure functions, no DB, fully testable (mirrors
 * roulette.engine / crash.engine / ponyjack.engine).
 *
 * Fairness model: the ball falls through `rows` pins; at each pin it goes left
 * or right on an INDEPENDENT fair coin flip drawn from the provably-fair seed
 * chain — direction #i = float(serverSeed, clientSeed, nonce, cursor=i) < 0.5.
 * After the last pin the ball rests in slot `k` = number of "right" moves, so
 * the landing slot follows the binomial distribution P(k) = C(rows,k) / 2^rows:
 * the middle slots are hit far more often than the edges. That is exactly why
 * the edge slots carry the huge multipliers and the centre the tiny ones —
 * nothing about the drop is rigged, the coin is fair, only the payout table
 * carries the edge.
 *
 * RTP is configurable the same way roulette is ("only the payout table carries
 * the edge"). Each (risk, rows) has a canonical multiplier SHAPE whose own
 * binomial-weighted expected value is `baseRtp`; the live table is that shape
 * scaled by `rtp / baseRtp` toward the admin-tuned RTP, then rounded to clean,
 * display-exact multipliers so the payout is always exactly `stake × the ×` the
 * player sees (no sub-cent dust). The realized RTP therefore sits within a hair
 * of the configured value, an RTP retune still flows into the payouts, and the
 * coin stays fair — see `multipliers()`.
 */

export const PLINKO_RISKS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type PlinkoRisk = (typeof PLINKO_RISKS)[number];

export const PLINKO_MIN_ROWS = 8;
export const PLINKO_MAX_ROWS = 16;

/**
 * Canonical multiplier shapes per risk and row count (industry-standard Plinko
 * curves). Each array has `rows + 1` entries, is symmetric, and rises from the
 * centre out to the edges. These are only the SHAPE — the live table is this
 * scaled to the configured RTP (see `multipliers`).
 */
const BASE_TABLES: Record<PlinkoRisk, Record<number, number[]>> = {
  LOW: {
    8: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    9: [5.6, 2, 1.6, 1, 0.7, 0.7, 1, 1.6, 2, 5.6],
    10: [8.9, 3, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 3, 8.9],
    11: [8.4, 3, 1.9, 1.3, 1, 0.7, 0.7, 1, 1.3, 1.9, 3, 8.4],
    12: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    13: [8.1, 4, 3, 1.9, 1.2, 0.9, 0.7, 0.7, 0.9, 1.2, 1.9, 3, 4, 8.1],
    14: [7.1, 4, 1.9, 1.4, 1.3, 1.1, 1, 0.5, 1, 1.1, 1.3, 1.4, 1.9, 4, 7.1],
    15: [15, 8, 3, 2, 1.5, 1.1, 1, 0.7, 0.7, 1, 1.1, 1.5, 2, 3, 8, 15],
    16: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
  },
  MEDIUM: {
    8: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    9: [18, 4, 1.7, 0.9, 0.5, 0.5, 0.9, 1.7, 4, 18],
    10: [22, 5, 2, 1.4, 0.6, 0.4, 0.6, 1.4, 2, 5, 22],
    11: [24, 6, 3, 1.8, 0.7, 0.5, 0.5, 0.7, 1.8, 3, 6, 24],
    12: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    13: [43, 13, 6, 3, 1.3, 0.7, 0.4, 0.4, 0.7, 1.3, 3, 6, 13, 43],
    14: [58, 15, 7, 4, 1.9, 1, 0.5, 0.2, 0.5, 1, 1.9, 4, 7, 15, 58],
    15: [88, 18, 11, 5, 3, 1.3, 0.5, 0.3, 0.3, 0.5, 1.3, 3, 5, 11, 18, 88],
    16: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
  },
  HIGH: {
    8: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
    9: [43, 7, 2, 0.6, 0.2, 0.2, 0.6, 2, 7, 43],
    10: [76, 10, 3, 0.9, 0.3, 0.2, 0.3, 0.9, 3, 10, 76],
    11: [120, 14, 5.2, 1.4, 0.4, 0.2, 0.2, 0.4, 1.4, 5.2, 14, 120],
    12: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
    13: [260, 37, 11, 4, 1, 0.2, 0.2, 0.2, 0.2, 1, 4, 11, 37, 260],
    14: [420, 56, 18, 5, 1.9, 0.3, 0.2, 0.2, 0.2, 0.3, 1.9, 5, 18, 56, 420],
    15: [620, 83, 27, 8, 3, 0.5, 0.2, 0.2, 0.2, 0.2, 0.5, 3, 8, 27, 83, 620],
    16: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
};

export function isValidRisk(v: unknown): v is PlinkoRisk {
  return typeof v === 'string' && (PLINKO_RISKS as readonly string[]).includes(v);
}

export function isValidRows(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= PLINKO_MIN_ROWS && v <= PLINKO_MAX_ROWS;
}

/** Normalise/validate a (risk, rows) pair, throwing on anything unsupported. */
export function normalizeConfig(risk: unknown, rows: unknown): { risk: PlinkoRisk; rows: number } {
  const r = typeof risk === 'string' ? (risk.toUpperCase() as PlinkoRisk) : risk;
  if (!isValidRisk(r)) throw new BadRequestException('BAD_RISK');
  if (!isValidRows(rows)) throw new BadRequestException('BAD_ROWS');
  return { risk: r, rows };
}

/** Binomial coefficient C(n, k) — exact for the row counts we support (n ≤ 16). */
export function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let c = 1;
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
  return Math.round(c);
}

/** Probability the ball lands in slot `k` on a fair `rows`-pin board. */
export function slotProbability(rows: number, k: number): number {
  return binomial(rows, k) / Math.pow(2, rows);
}

/** The canonical (unscaled) multiplier shape for a (risk, rows). */
export function baseTable(risk: PlinkoRisk, rows: number): number[] {
  const table = BASE_TABLES[risk]?.[rows];
  if (!table) throw new BadRequestException('BAD_PLINKO_CONFIG');
  return table;
}

/** Binomial-weighted expected value of the canonical shape — its natural RTP. */
export function baseRtp(risk: PlinkoRisk, rows: number): number {
  const table = baseTable(risk, rows);
  let ev = 0;
  for (let k = 0; k <= rows; k++) ev += slotProbability(rows, k) * table[k];
  return ev;
}

/**
 * The LIVE payout table: the canonical shape scaled toward the target RTP, then
 * rounded to CLEAN, display-exact multipliers — whole numbers at ×100+ and two
 * decimals below. This is deliberate: the payout is always exactly
 * `stake × the multiplier the player sees`, with no sub-cent dust appearing
 * "from nowhere" (a ×1 slot returns exactly the stake, a ×0.4 exactly 0.4×).
 * The scale is applied before rounding, so an RTP retune still flows into the
 * payouts and the realized return stays within a hair of the configured value;
 * two-decimal granularity is a negligible edge next to a clean, honest payout.
 * Returns one multiplier per slot (length `rows + 1`).
 */
export function multipliers(risk: PlinkoRisk, rows: number, rtp: number): number[] {
  const table = baseTable(risk, rows);
  const target = rtp > 0 && rtp <= 1 ? rtp : 0.99;
  const scale = target / baseRtp(risk, rows);
  return table.map((m) => {
    const v = m * scale;
    return v >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
  });
}

/**
 * The ball's path: `rows` independent fair left/right choices from the seed
 * chain (cursor = pin index). `false` = left, `true` = right. Landing slot is
 * the count of rights — exactly the same primitive the roulette/crash use.
 */
export function plinkoPath(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  rows: number,
): boolean[] {
  const path: boolean[] = [];
  for (let i = 0; i < rows; i++) {
    path.push(floatFromSeeds(serverSeed, clientSeed, nonce, i) >= 0.5);
  }
  return path;
}

/** Landing slot index (0..rows) — the number of right moves in the path. */
export function slotOf(path: boolean[]): number {
  return path.reduce((sum, right) => sum + (right ? 1 : 0), 0);
}

export interface PlinkoSettlement {
  slot: number;
  multiplier: number;
  /** Gross amount returned to the player (stake × multiplier). */
  payout: number;
}

/** Settle a single drop given its landing slot. Numbers only (DB uses Decimal). */
export function settle(
  risk: PlinkoRisk,
  rows: number,
  slot: number,
  stake: number,
  rtp: number,
): PlinkoSettlement {
  const table = multipliers(risk, rows, rtp);
  const multiplier = table[Math.max(0, Math.min(rows, slot))];
  return { slot, multiplier, payout: stake * multiplier };
}
