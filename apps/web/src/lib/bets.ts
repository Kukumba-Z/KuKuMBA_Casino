import type { Currency } from './hooks';

/**
 * Per-currency stake limits for games, derived from a single source of truth —
 * each currency's `usdRate` — so we never hardcode a table of currencies.
 *
 *  - DEMO play money gets a generous flat cap.
 *  - Real currencies are capped at ~REAL_CAP_USD worth of value, converted via
 *    usdRate and rounded to a friendly number (e.g. USD≈350, RUB≈30000, EUR≈320).
 *  - The minimum is 0.01 in the currency's own units, but never above the max
 *    (high-unit-value crypto like BTC scales its minimum down instead).
 *
 * Tune the two constants below to move every currency at once.
 */
const REAL_CAP_USD = 350; // max real-money stake, expressed in USD-equivalent
const DEMO_MAX = 30000; // max demo stake (play money)
const BASE_MIN = 0.01;

/** Round to 2 significant figures so derived caps read as friendly numbers. */
function niceRound(v: number): number {
  if (!isFinite(v) || v <= 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / mag) * mag;
}

export interface BetLimits {
  min: number;
  max: number;
  decimals: number;
  /** smallest increment / input step for this currency */
  step: number;
}

export function betLimits(currency: Currency | undefined, mode: 'DEMO' | 'REAL'): BetLimits {
  const decimals = currency?.decimals ?? 2;
  const isDemo = mode === 'DEMO' || currency?.code === 'DEMO';
  const rate = currency?.usdRate && currency.usdRate > 0 ? currency.usdRate : 1;

  const max = isDemo ? DEMO_MAX : niceRound(REAL_CAP_USD / rate) || REAL_CAP_USD;
  const min = Math.min(BASE_MIN, max / 100);
  const step = 1 / Math.pow(10, Math.min(decimals, 2)); // 0.01 for fiat/demo

  return { min, max, decimals, step };
}

/** Round a stake to the currency's precision (avoids float dust like 0.30000004). */
export function roundStake(value: number, decimals: number): number {
  const dp = Math.min(decimals, 8);
  return Math.round(value * 10 ** dp) / 10 ** dp;
}

export const clampStake = (value: number, { min, max, decimals }: BetLimits): number =>
  roundStake(Math.min(Math.max(value, min), max), decimals);
