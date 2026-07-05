import type { QueryClient } from '@tanstack/react-query';
import type { Balance } from './hooks';

/**
 * Optimistically debit a stake from the local balance cache so the deduction
 * shows the instant a bet is placed — before the round's animation resolves.
 *
 * Games settle server-side, so the authoritative balance already reflects the
 * final result by the time `play` returns; we deliberately show only the stake
 * debit up front (100 → 90 on a 10 bet) and let a later `invalidateQueries`
 * reveal the true settled balance when the outcome lands (90 → 90 + win). Used
 * by every game so the wallet chip reacts immediately to a bet everywhere.
 *
 * Safe no-op when the cache isn't populated yet (e.g. before the first fetch).
 */
export function debitLocalBalance(
  qc: QueryClient,
  currency: string,
  mode: 'DEMO' | 'REAL',
  amount: number,
) {
  if (!(amount > 0)) return;
  qc.setQueryData<Balance[]>(['balances'], (old) =>
    old?.map((b) =>
      b.currency === currency && b.mode === mode
        ? { ...b, amount: String(Math.max(0, Number(b.amount) - amount)) }
        : b,
    ),
  );
}
