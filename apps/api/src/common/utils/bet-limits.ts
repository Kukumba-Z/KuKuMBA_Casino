/**
 * Per-currency whole-table stake cap — the server-side mirror of the web client's
 * `betLimits()` (apps/web/src/lib/bets.ts), so the UI and the API agree on the
 * exact limit. The cap is the anti-martingale guard: the sum of all bets placed
 * on a table for one round may never exceed it. Kept as one shared helper so
 * every game (current and future) enforces the same rule identically.
 *
 * Tune the two constants below to move every currency at once.
 */
const REAL_CAP_USD = 350; // max real-money stake, expressed in USD-equivalent
const DEMO_MAX = 30000; // max demo stake (play money)

/** Round to 2 significant figures so derived caps read as friendly numbers. */
function niceRound(v: number): number {
  if (!isFinite(v) || v <= 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / mag) * mag;
}

/**
 * Largest total stake allowed on a table, for the given currency and mode.
 *  - Demo play money gets a flat generous cap.
 *  - Real currencies are capped at ~REAL_CAP_USD worth of value, converted via
 *    the currency's `usdRate` and rounded to a friendly number.
 */
export function tableMaxStake(usdRate: number | string | null | undefined, isDemo: boolean): number {
  if (isDemo) return DEMO_MAX;
  const rate = Number(usdRate);
  const r = isFinite(rate) && rate > 0 ? rate : 1;
  return niceRound(REAL_CAP_USD / r) || REAL_CAP_USD;
}
