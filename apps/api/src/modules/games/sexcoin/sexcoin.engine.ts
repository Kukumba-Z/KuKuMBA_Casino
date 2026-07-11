import { BadRequestException } from '@nestjs/common';
import { CoinSide, sexcoinFlip } from '../../provably-fair/provably-fair.crypto';

/**
 * KuKuMBA Sexcoin math — pure functions, no DB, fully testable (mirrors
 * mines.engine / ponyjack.engine).
 *
 * A streak coinflip: the player guesses a side ('penis' is heads, 'vagina' is
 * tails), every correct flip doubles the ladder, one miss burns the stake, and
 * the win can be collected at any depth. Fairness model: flip #i of a series
 * draws its float from the provably-fair seed chain with cursor = i (same
 * chain / nonce as roulette; ONE nonce covers the whole series, exactly like a
 * mines board). Nothing about a round is stored while money is in play: the
 * results are a deterministic function of (serverSeed, clientSeed, nonce) +
 * the guess log, recomputed from the committed seed on every read.
 *
 * Payout law — the same one every game here obeys: the coin is HONEST,
 * P(penis) = P(vagina) = 0.5, and the edge lives ONLY in the multiplier
 * (multiplier = RTP / probability, like roulette / crash / mines):
 *
 *   mult(k) = RTP × 2^k   (rounded to 2 dp for display & payout)
 *
 * so the expected cashout at ANY depth is 0.5^k × RTP × 2^k = RTP × stake — a
 * flat edge. At the default RTP 0.97 the ladder runs ×1.94 → ×3.88 → ×7.76 → …
 * The series is capped at MAX_STREAK = 20 (≈ ×1,017,000 at RTP 0.97 — the same
 * spirit as crash's ×1,000,000 cap); reaching the cap force-collects the win.
 *
 * RTP is admin-tunable per game (Game.rtp), read at start time and snapshotted
 * on the bet row so an RTP edit never changes a series already in flight. A
 * garbage RTP falls back to 0.97 rather than exploding (mirrors mines).
 */
export const MAX_STREAK = 20;

export type { CoinSide };

export interface SeedTuple {
  serverSeed: string;
  clientSeed: string;
  nonce: number;
}

/** Side of one flip from a provably-fair float: < 0.5 → 'penis', else 'vagina'. */
export function flipResult(float: number): CoinSide {
  return float < 0.5 ? 'penis' : 'vagina';
}

/** Validate a guess; throws SEXCOIN_BAD_GUESS on anything but a coin side. */
export function normalizeGuess(guess: unknown): CoinSide {
  if (guess !== 'penis' && guess !== 'vagina') {
    throw new BadRequestException('SEXCOIN_BAD_GUESS');
  }
  return guess;
}

/**
 * Gross cashout multiplier after k correct flips: RTP × 2^k, rounded to 2 dp
 * (what the UI shows is exactly what settles). k = 0 gives RTP < 1, which is
 * why cashing out before the first flip is refused.
 */
export function multiplierFor(k: number, rtp: number): number {
  const target = rtp > 0 && rtp <= 1 ? rtp : 0.97;
  return Math.round(target * Math.pow(2, k) * 100) / 100;
}

/** The whole ladder: mult at k = 1 .. MAX_STREAK (the UI renders it). */
export function multiplierLadder(rtp: number): number[] {
  return Array.from({ length: MAX_STREAK }, (_, i) => multiplierFor(i + 1, rtp));
}

export interface SexcoinState {
  /** The fair result of every flip taken so far (public — the player saw them). */
  results: CoinSide[];
  /** Correct guesses in a row; the series ends on the first miss. */
  streak: number;
  /** True once a flip missed — the stake is burnt, the series is over. */
  busted: boolean;
}

/**
 * Replay a whole series from the committed seed chain + the guess log. Pure
 * and deterministic — the service persists only the guesses and recomputes
 * this on every read/write. Throws on any illegal log (bad side, a guess after
 * a miss, or past the cap), so a tampered log can never reach the money path.
 * The cap itself settles in the service: streak === MAX_STREAK force-collects.
 */
export function replay(seeds: SeedTuple, guesses: CoinSide[]): SexcoinState {
  const state: SexcoinState = { results: [], streak: 0, busted: false };
  for (let i = 0; i < guesses.length; i++) {
    if (state.busted || state.streak >= MAX_STREAK) {
      throw new BadRequestException('SEXCOIN_ROUND_OVER');
    }
    const guess = normalizeGuess(guesses[i]);
    const result = sexcoinFlip(seeds.serverSeed, seeds.clientSeed, seeds.nonce, i);
    state.results.push(result);
    if (result === guess) state.streak++;
    else state.busted = true;
  }
  return state;
}
