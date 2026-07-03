import { useCurrencies, type Currency } from '../../../lib/hooks';

/**
 * The one true currency picker for admin forms — options come from
 * /wallet/currencies, so a typo'd or non-existent code can never be submitted.
 */
export function CurrencySelect({
  value,
  onChange,
  types,
  allowEmpty,
  className,
}: {
  value: string;
  onChange: (code: string, currency?: Currency) => void;
  /** Restrict the list, e.g. ['FIAT'] for raffles. Omit for all enabled currencies. */
  types?: Currency['type'][];
  allowEmpty?: boolean;
  className?: string;
}) {
  const { data: currencies } = useCurrencies();
  const opts = (currencies ?? []).filter((c) => !types || types.includes(c.type));
  return (
    <select
      className={className ?? 'input'}
      value={value}
      onChange={(e) => onChange(e.target.value, opts.find((c) => c.code === e.target.value))}
    >
      {(allowEmpty || !opts.some((c) => c.code === value)) && <option value={allowEmpty ? '' : value}>{allowEmpty ? '—' : value}</option>}
      {opts.map((c) => (
        <option key={c.code} value={c.code}>
          {c.code} — {c.name}
        </option>
      ))}
    </select>
  );
}
