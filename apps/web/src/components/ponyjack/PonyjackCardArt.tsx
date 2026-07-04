import { PlayingCard } from './PlayingCard';

/** Ponyjack — bespoke lobby-card art (like roulette's live wheel and the crash
 *  scene snapshot): a winning natural fanned on the night felt — the Twilight
 *  ace and the Rainbow Dash jack — under a holo "21" chip. */
export function PonyjackCardArt() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-[#2b1e55] via-[#191338] to-night">
      {/* table glow */}
      <div className="absolute -left-8 -top-10 h-32 w-32 rounded-full bg-bubble/20 blur-2xl" />
      <div className="absolute -right-6 bottom-0 h-28 w-28 rounded-full bg-mint/15 blur-2xl" />
      {/* felt arc */}
      <div className="absolute -bottom-[55%] left-1/2 h-[90%] w-[130%] -translate-x-1/2 rounded-[50%] border-t-2 border-white/10 bg-white/[0.03]" />

      {/* the fanned natural: A + pony jack = Ponyjack */}
      <PlayingCard
        card={13}
        className="absolute left-1/2 top-1/2 h-[68%] -translate-x-[88%] -translate-y-[54%] -rotate-12 drop-shadow-[0_10px_18px_rgba(0,0,0,0.55)]"
      />
      <PlayingCard
        card={10}
        className="absolute left-1/2 top-1/2 h-[68%] -translate-x-[16%] -translate-y-[46%] rotate-[10deg] drop-shadow-[0_10px_18px_rgba(0,0,0,0.55)]"
      />

      {/* sparkles */}
      <svg viewBox="0 0 200 150" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <path d="M28 116 l2 4.6 5 .6 -3.7 3.4 1 5 -4.3 -2.5 -4.3 2.5 1 -5 -3.7 -3.4 5 -.6 Z" fill="#B79CED" opacity=".7" />
        <path d="M172 34 l1.6 3.7 4 .5 -3 2.7 .8 4 -3.4 -2 -3.4 2 .8 -4 -3 -2.7 4 -.5 Z" fill="#FF8FD0" opacity=".7" />
        <circle cx="152" cy="118" r="2" fill="#7EE7C7" opacity=".7" />
        <circle cx="46" cy="28" r="1.6" fill="#FFD86E" opacity=".8" />
      </svg>

      {/* 21 chip */}
      <span className="absolute bottom-2 right-2 rounded-xl bg-holo px-2.5 py-1 font-display text-sm font-black text-night shadow-glow">
        21
      </span>
    </div>
  );
}
