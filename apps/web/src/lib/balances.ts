import type { QueryClient } from '@tanstack/react-query';
import type { Balance } from './hooks';

/**
 * Optimistic local adjustments to the balance cache, so the wallet chip reacts
 * to game events at the exact moment the player SEES them — not when the server
 * happened to settle (games settle in the bet transaction, so the authoritative
 * balance is final long before the animation resolves).
 *
 *  - debit the stake the instant a bet is placed (100 → 90 on a 10 bet);
 *  - credit each win the instant ITS OWN animation lands (plinko fires many
 *    balls at once — each landing adds exactly that ball's payout, never the
 *    whole batch);
 *  - when everything on screen has resolved, an invalidateQueries resyncs the
 *    cache with the server truth.
 *
 * Safe no-op when the cache isn't populated yet (e.g. before the first fetch).
 */
function adjustLocalBalance(
  qc: QueryClient,
  currency: string,
  mode: 'DEMO' | 'REAL',
  delta: number,
) {
  qc.setQueryData<Balance[]>(['balances'], (old) =>
    old?.map((b) =>
      b.currency === currency && b.mode === mode
        ? { ...b, amount: String(Math.max(0, Number(b.amount) + delta)) }
        : b,
    ),
  );
}

/** Subtract a just-placed stake from the local balance. */
export function debitLocalBalance(
  qc: QueryClient,
  currency: string,
  mode: 'DEMO' | 'REAL',
  amount: number,
) {
  if (amount > 0) adjustLocalBalance(qc, currency, mode, -amount);
}

/** Add a single settled win to the local balance (one ball, one credit). */
export function creditLocalBalance(
  qc: QueryClient,
  currency: string,
  mode: 'DEMO' | 'REAL',
  amount: number,
) {
  if (amount > 0) adjustLocalBalance(qc, currency, mode, amount);
}
