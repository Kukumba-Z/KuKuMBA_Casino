/**
 * Semantic status colours — one source of truth for the whole site, so every
 * status reads at a glance instead of a wall of grey chips:
 *   positive (green)  — done well: completed, resolved, verified, active…
 *   warning  (amber)  — needs attention / in progress: pending, processing…
 *   danger   (red)    — bad/terminal: failed, rejected, closed, banned…
 *   info     (blue)   — neutral-in-progress: open, answered, approved…
 *   neutral  (grey)   — no signal: draft, none, expired, demo…
 */
export type Tone = 'positive' | 'warning' | 'danger' | 'info' | 'neutral';

/** Soft, on-brand chip styling per tone. Overrides the base `.chip` colours. */
export const TONE_CLASS: Record<Tone, string> = {
  positive: 'border-mint/30 bg-mint/10 text-mint',
  warning: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  danger: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  info: 'border-sky/30 bg-sky/10 text-sky',
  neutral: 'border-white/10 bg-white/5 text-white/55',
};

// Per-enum value → tone. Keys mirror the i18n `enums.<category>` namespaces.
const TONES: Record<string, Record<string, Tone>> = {
  ticketStatus: { OPEN: 'info', PENDING: 'warning', ANSWERED: 'info', RESOLVED: 'positive', CLOSED: 'danger' },
  ticketPriority: { LOW: 'neutral', NORMAL: 'info', HIGH: 'warning', URGENT: 'danger' },
  depositStatus: { PENDING: 'warning', CONFIRMING: 'info', COMPLETED: 'positive', FAILED: 'danger', EXPIRED: 'neutral' },
  withdrawalStatus: {
    PENDING: 'warning', APPROVED: 'info', PROCESSING: 'info', COMPLETED: 'positive', REJECTED: 'danger', FAILED: 'danger',
  },
  bonusStatus: {
    ACTIVE: 'positive', WAGERING: 'warning', COMPLETED: 'positive', EXPIRED: 'neutral', CANCELLED: 'danger', FORFEITED: 'danger',
  },
  kycStatus: { NONE: 'neutral', PENDING: 'warning', VERIFIED: 'positive', REJECTED: 'danger' },
  raffleStatus: { DRAFT: 'neutral', OPEN: 'positive', DRAWING: 'warning', COMPLETED: 'info', CANCELLED: 'danger' },
  userStatus: { ACTIVE: 'positive', SUSPENDED: 'warning', BANNED: 'danger', SELF_EXCLUDED: 'danger' },
  txStatus: { PENDING: 'warning', COMPLETED: 'positive', FAILED: 'danger', CANCELLED: 'neutral' },
  gameStatus: { LIVE: 'positive', COMING_SOON: 'neutral', DISABLED: 'danger' },
  mode: { REAL: 'positive', DEMO: 'neutral' },
};

/** Tone for a (category, value); falls back to neutral for unmapped values. */
export function statusTone(category: string, value?: string | null): Tone {
  if (!value) return 'neutral';
  return TONES[category]?.[value] ?? 'neutral';
}

/** Chip classes for a (category, value) — combine with the base `.chip`. */
export function statusClass(category: string, value?: string | null): string {
  return TONE_CLASS[statusTone(category, value)];
}
