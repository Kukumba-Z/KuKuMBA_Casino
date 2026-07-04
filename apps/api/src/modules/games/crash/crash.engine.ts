import { CRASH_MAX_MULT, crashFromFloat } from '../../provably-fair/provably-fair.crypto';

/**
 * Crash math — pure functions, no DB, fully testable (mirrors roulette.engine).
 *
 * RTP is exactly configurable, like roulette: the crash point is drawn so that
 * P(crash ≥ m) = RTP / m, hence cashing out at ANY target m returns
 * m · RTP / m = RTP in expectation — a flat edge on every strategy. Nothing
 * about the curve is rigged: the entropy is the same uniform provably-fair
 * float the roulette uses; only the payout mapping carries the edge.
 *
 * The multiplier GROWTH CURVE is pure presentation timing, but it must be
 * identical on the server and the web client (the server validates a cashout
 * by *time*, never by a client-reported multiplier). The prototype's frame
 * step was  d(ln m)/dt = K / (1 + 0.5·log10 m) ; integrating gives the closed
 * form used below, so both sides compute the exact same m(t):
 *
 *   t(m) = (ln m + A·ln²m) / K          with A = 0.25 / ln 10, K = 0.26
 *   m(t) = exp( (√(1 + 4·A·K·t) − 1) / (2A) )
 *
 * Client mirror: apps/web/src/components/crash/engine.ts (CURVE_K / CURVE_A).
 */
export const CURVE_K = 0.26;
export const CURVE_A = 0.25 / Math.LN10;

export { CRASH_MAX_MULT };

/** Floor to 2 decimals — multipliers are always presented (and paid) this way.
 *  The epsilon absorbs binary-float dust so an exact target like 1.15 never
 *  collapses to 1.14 (floor(1.15 × 100) is 114 in IEEE doubles). */
export const floorMult = (m: number): number => Math.floor(m * 100 + 1e-9) / 100;

/** Crash point for a fair float at the configured RTP (house edge = 1 − rtp). */
export function crashPointFor(float: number, rtp: number): number {
  const edge = rtp > 0 && rtp <= 1 ? 1 - rtp : 0.01;
  return crashFromFloat(float, edge);
}

/** Deterministic multiplier after `seconds` of flight (≥ 1, capped). */
export function multiplierAt(seconds: number): number {
  if (!(seconds > 0)) return 1;
  const L = (Math.sqrt(1 + 4 * CURVE_A * CURVE_K * seconds) - 1) / (2 * CURVE_A);
  return Math.min(CRASH_MAX_MULT, Math.exp(L));
}

/** Inverse of multiplierAt: seconds needed to reach multiplier `m`. */
export function secondsToReach(m: number): number {
  const c = Math.min(Math.max(m, 1), CRASH_MAX_MULT);
  const L = Math.log(c);
  return (L + CURVE_A * L * L) / CURVE_K;
}

/** Does a bet with this auto-cashout survive the given crash point? */
export function autoCashoutWins(autoCashout: number, crashPoint: number): boolean {
  // Equality wins: "crash ≥ target" is the survival event the RTP math prices.
  return autoCashout <= crashPoint;
}

/** Validate a client-supplied auto-cashout target. */
export function isValidAutoCashout(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v) && v >= 1.01 && v <= CRASH_MAX_MULT;
}
