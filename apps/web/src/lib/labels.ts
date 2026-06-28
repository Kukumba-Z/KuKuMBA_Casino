import i18n from '../i18n';
import type { Currency } from './hooks';

/** Fallback humanizer: `NO_DEPOSIT` → "No deposit", `SESSION_TIME` → "Session time". */
function humanize(v: string): string {
  const s = v.replace(/_/g, ' ').trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Turn a raw DB enum value into a human label. Looks up `enums.<category>.<VALUE>`
 * in i18n and falls back to a humanized form, so the UI never shows raw
 * UPPER_SNAKE_CASE. One helper for the whole site (bonuses, wallet, tickets,
 * raffles, profile, admin…).
 */
export function enumLabel(category: string, value?: string | null): string {
  if (!value) return '—';
  return i18n.t(`enums.${category}.${value}`, { defaultValue: humanize(value) });
}

/**
 * Currency display: the human name (e.g. "Tether"), never the code twice
 * ("TON TON"). Pair with the symbol for an "₮ Tether" style label.
 */
export function currencyLabel(c?: Pick<Currency, 'code' | 'name' | 'symbol'>): string {
  if (!c) return '';
  return c.name || c.code;
}
