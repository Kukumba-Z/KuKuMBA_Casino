import { PenisFace, VaginaFace } from './CoinFaces';

/** Sexcoin — bespoke lobby-card art (like CrashCardArt / MinesCardArt). The
 *  two coin faces in a light spread over a night backdrop with neon rose/lav
 *  glows, sparks between them and the holo "SEXCOIN" wordmark. The RTP and
 *  Originals badges are added by GameCard itself. */
export function SexcoinCardArt() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <svg
        viewBox="0 0 200 150"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-hidden
      >
        <defs>
          <linearGradient id="sxc-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#231a3d" />
            <stop offset="0.55" stopColor="#150f2c" />
            <stop offset="1" stopColor="#0b0817" />
          </linearGradient>
          <radialGradient id="sxc-glow1" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="rgba(255,143,208,0.35)" />
            <stop offset="1" stopColor="rgba(255,143,208,0)" />
          </radialGradient>
          <radialGradient id="sxc-glow2" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="rgba(183,156,237,0.34)" />
            <stop offset="1" stopColor="rgba(183,156,237,0)" />
          </radialGradient>
          <radialGradient id="sxc-vig" cx="0.5" cy="0.5" r="0.75">
            <stop offset="0.6" stopColor="rgba(0,0,0,0)" />
            <stop offset="1" stopColor="rgba(0,0,0,0.42)" />
          </radialGradient>
          <linearGradient id="sxc-holo" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#7EE7C7" />
            <stop offset="0.35" stopColor="#7CC4FF" />
            <stop offset="0.7" stopColor="#B79CED" />
            <stop offset="1" stopColor="#FF8FD0" />
          </linearGradient>
        </defs>

        <rect width="200" height="150" fill="url(#sxc-bg)" />
        {/* neon rose / lavender ambience */}
        <circle cx="52" cy="44" r="66" fill="url(#sxc-glow1)" />
        <circle cx="152" cy="96" r="70" fill="url(#sxc-glow2)" />

        {/* sparks flying between the coins */}
        {[
          [96, 52, 2.2, 0.9],
          [104, 78, 1.4, 0.65],
          [92, 96, 1.8, 0.75],
          [110, 40, 1.2, 0.55],
          [100, 118, 1.5, 0.6],
        ].map(([x, y, r, o], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="#FFD86E" opacity={o} />
        ))}
        <path d="M99 60 l1.8 4.2 4.2 1.8 -4.2 1.8 -1.8 4.2 -1.8 -4.2 -4.2 -1.8 4.2 -1.8 Z" fill="rgba(255,250,225,0.9)" />

        {/* the holo wordmark (Unbounded, like the .holo-text utility) */}
        <text
          x="100"
          y="139"
          textAnchor="middle"
          fill="url(#sxc-holo)"
          fontFamily="Unbounded, sans-serif"
          fontSize="15"
          fontWeight="900"
          letterSpacing="2.5"
        >
          SEXCOIN
        </text>
      </svg>

      {/* the two faces, gently fanned with a shared shadow (HTML overlay keeps
          the face SVGs reusable without nested-svg id juggling) */}
      <div className="absolute left-[13%] top-[12%] w-[42%] -rotate-12 drop-shadow-[0_8px_16px_rgba(0,0,0,0.55)]">
        <PenisFace className="h-full w-full" />
      </div>
      <div className="absolute right-[13%] top-[26%] w-[42%] rotate-12 drop-shadow-[0_8px_16px_rgba(0,0,0,0.55)]">
        <VaginaFace className="h-full w-full" />
      </div>
    </div>
  );
}
