/** Sexcoin glyph — a flipping coin with the Mars & Venus marks, so Sexcoin is
 *  recognisable in the live-bets ticker, leaderboards and game history.
 *  Drop-in for a lucide icon: takes `size`/`className`, strokes with
 *  `currentColor` (same contract as MinesGlyph / PlinkoGlyph). */
export function SexcoinGlyph({ size = 24, className }: { size?: number | string; className?: string }) {
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
      {/* the coin, slightly squashed like mid-flip */}
      <ellipse cx="12" cy="12" rx="9" ry="8.2" />
      {/* Mars arrow (top-right) */}
      <path d="M13.6 10.4l3.2-3.2M17 7.2v2.6M17 7.2h-2.6" strokeWidth={1.6} />
      {/* Venus cross (bottom-left) */}
      <circle cx="10" cy="12.6" r="2.6" strokeWidth={1.6} />
      <path d="M10 15.2v3M8.6 16.9h2.8" strokeWidth={1.6} />
    </svg>
  );
}
