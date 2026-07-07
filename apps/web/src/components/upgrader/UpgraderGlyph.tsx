/** KuKuMBA Upgrader glyph — a gauge/needle icon so Upgrader is recognisable in
 *  the live-bets ticker, leaderboards and game history. Drop-in for a lucide
 *  icon: takes `size`/`className`, strokes with `currentColor`. A dial with a
 *  lit sector and a needle — the wheel-and-arrow in miniature. */
export function UpgraderGlyph({ size = 24, className }: { size?: number | string; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* dial */}
      <circle cx="12" cy="12" r="8.5" />
      {/* lit win-sector arc from 12 o'clock, clockwise ~75° */}
      <path d="M12 3.5 A8.5 8.5 0 0 1 20.2 9.7" strokeWidth={2.6} />
      {/* needle from the centre to the arc */}
      <path d="M12 12 L17 7.6" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
