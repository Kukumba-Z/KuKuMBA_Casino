import type { ReactNode } from 'react';

/** Labelled admin form field with an optional hint line. */
export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-white/60">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-white/35">{hint}</span>}
    </label>
  );
}

/** Compact variant used in dense grid forms (uppercase micro-label). */
export function L({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-white/40">{label}</div>
      {children}
    </label>
  );
}
