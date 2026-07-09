/** KuKuMBA Mines glyph — a mini board with a mine, so Mines is recognisable in
 *  the live-bets ticker, leaderboards and game history. Drop-in for a lucide
 *  icon: takes `size`/`className`, strokes with `currentColor`. A rounded grid
 *  with one filled "mine" cell and a spark — the 5×5 field in miniature. */
export function MinesGlyph({ size = 24, className }: { size?: number | string; className?: string }) {
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
      {/* board */}
      <rect x="3" y="3" width="18" height="18" rx="3.5" />
      {/* grid lines */}
      <path d="M9 3.5v17M15 3.5v17M3.5 9h17M3.5 15h17" strokeWidth={1.3} opacity={0.7} />
      {/* the mine in the centre cell */}
      <circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none" />
      {/* spark over the top-right cell (an opened crystal) */}
      <path d="M18 4.6l.5 1 .5-1M17.5 6.4h2" strokeWidth={1.2} />
    </svg>
  );
}
