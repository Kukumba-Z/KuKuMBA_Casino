import { BadRequestException } from '@nestjs/common';

/**
 * KuKuMBA Upgrader math — pure functions, no DB, fully testable (mirrors
 * roulette.engine / plinko.engine / crash.engine).
 *
 * Upgrader is, mathematically, "roulette on a single sector": the player picks a
 * win chance and the payout follows the exact same flat-house-edge law as every
 * roulette bet —
 *
 *   multiplier(chance) = RTP / chance          // gross, includes the stake
 *   expectedReturn     = chance * multiplier   // = RTP  — a flat edge on ANY chance
 *
 * A needle spins around a wheel and stops at a provably-fair float ∈ [0,1); the
 * lit win-sector is the arc [0, chance) drawn from the very same zero reference
 * the needle angle is measured from, so "needle inside the sector" is identically
 * `float < chance` — the picture and the settlement can never disagree. Nothing
 * about the spin is rigged: the stop point is uniform (same seed chain as the
 * roulette). Only the payout carries the edge, and RTP is admin-tunable per game
 * (Game.rtp), read at bet time and snapshotted on the bet row so an RTP edit
 * never rewrites a spin already resolved.
 */

// Chance bounds as a FRACTION (0.01% … 99%).
export const UPGRADER_MIN_CHANCE = 0.0001; // 0.01%
export const UPGRADER_MAX_CHANCE = 0.99; // 99%

/** Validate/clamp the win chance; throws BAD_CHANCE / CHANCE_OUT_OF_RANGE on junk. */
export function normalizeChance(chance: unknown): number {
  const c = Number(chance);
  if (!Number.isFinite(c)) throw new BadRequestException('BAD_CHANCE');
  if (c < UPGRADER_MIN_CHANCE || c > UPGRADER_MAX_CHANCE)
    throw new BadRequestException('CHANCE_OUT_OF_RANGE');
  return c;
}

/**
 * Gross multiplier: RTP / chance — a flat house edge, exactly like roulette's
 * `multiplierFor = RTP / probability`. A garbage RTP falls back to 0.99 rather
 * than exploding (mirrors plinko/roulette).
 */
export function multiplierFor(chance: number, rtp: number): number {
  const target = rtp > 0 && rtp <= 1 ? rtp : 0.99;
  return target / chance;
}

export interface UpgraderSettlement {
  win: boolean;
  /** Gross multiplier (payout is 0 on a loss, but the multiplier is unchanged). */
  multiplier: number;
  /** stake × multiplier on a win, else 0. */
  payout: number;
  /** The needle stop point in "beeps", 0..9999, for the animation and audit. */
  angleBp: number;
}

/**
 * Settle a single spin from a fair float ∈ [0,1). Numbers only (the DB layer uses
 * Decimal). The win-zone is the half-open interval [0, chance): landing exactly on
 * `chance` is a loss, which keeps the picture (arc drawn as [0, chance)) and the
 * settlement identical.
 */
export function settle(chance: number, float: number, stake: number, rtp: number): UpgraderSettlement {
  const f = float >= 0 && float < 1 ? float : 0;
  const win = f < chance; // win-zone = [0, chance)
  const multiplier = multiplierFor(chance, rtp);
  return { win, multiplier, payout: win ? stake * multiplier : 0, angleBp: Math.floor(f * 10000) };
}
