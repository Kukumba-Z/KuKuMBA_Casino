/** Allowed qualifying-deposit windows (days) — mirrors the API's DEPOSIT_WINDOWS. */
export const DEPOSIT_WINDOWS = [1, 7, 14, 30];

/** ISO → value for <input type="datetime-local"> (local time, minute precision). */
export function toLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

/** Epoch/date → compact local date-time string for table cells. */
export function when(v: string | number | Date): string {
  return new Date(v).toLocaleString();
}
