import { enumLabel } from '../lib/labels';
import { statusClass } from '../lib/status';

/**
 * A status pill coloured by semantic tone (see lib/status). One component for
 * every status on the site — tickets, deposits, withdrawals, bonuses, KYC,
 * raffles, users… — so colours stay consistent and meaningful everywhere.
 */
export function StatusChip({
  category,
  value,
  prefix,
  className = '',
}: {
  category: string;
  value?: string | null;
  /** Optional leading label, e.g. "KYC" or "Priority". */
  prefix?: string;
  className?: string;
}) {
  return (
    <span className={`chip ${statusClass(category, value)} ${className}`}>
      {prefix ? `${prefix}: ` : ''}
      {enumLabel(category, value)}
    </span>
  );
}
