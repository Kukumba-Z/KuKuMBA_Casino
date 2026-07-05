/** KuKuMBA Plinko glyph — a peg-triangle icon so Plinko is recognisable in the
 *  live-bets ticker, leaderboards and game history (a plain triangle read as any
 *  minigame). Drop-in for a lucide icon: takes `size`/`className`, strokes/fills
 *  with `currentColor`. Mirrors the board — narrow top, wide base, pins inside. */
export function PlinkoGlyph({ size = 24, className }: { size?: number | string; className?: string }) {
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
      {/* board outline */}
      <path d="M12 3.5 20.5 20.5 3.5 20.5 Z" />
      {/* pins — a widening pyramid, like the real drop board */}
      <g fill="currentColor" stroke="none">
        <circle cx="12" cy="9" r="1.05" />
        <circle cx="9.2" cy="13.5" r="1.05" />
        <circle cx="14.8" cy="13.5" r="1.05" />
        <circle cx="6.6" cy="18" r="1.05" />
        <circle cx="12" cy="18" r="1.05" />
        <circle cx="17.4" cy="18" r="1.05" />
      </g>
    </svg>
  );
}
