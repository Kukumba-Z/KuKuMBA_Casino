/** VODKA WIN Crash — bespoke lobby-card art (like roulette's live wheel thumb).
 *  A static SVG snapshot of the scene: the office drunk under the lamp, beer in
 *  hand, with the multiplier curve climbing away. Palette mirrors the engine. */
export function CrashCardArt() {
  return (
    <svg
      viewBox="0 0 200 150"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
      role="img"
      aria-hidden
    >
      <defs>
        <linearGradient id="crash-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#241d40" />
          <stop offset="0.55" stopColor="#171232" />
          <stop offset="1" stopColor="#0b0a1c" />
        </linearGradient>
        <linearGradient id="crash-cone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(255,216,110,0.20)" />
          <stop offset="1" stopColor="rgba(255,216,110,0)" />
        </linearGradient>
        <radialGradient id="crash-vig" cx="0.5" cy="0.5" r="0.72">
          <stop offset="0.6" stopColor="rgba(0,0,0,0)" />
          <stop offset="1" stopColor="rgba(0,0,0,0.45)" />
        </radialGradient>
      </defs>

      <rect width="200" height="150" fill="url(#crash-bg)" />

      {/* panoramic window + skyline */}
      <g>
        <rect x="12" y="16" width="52" height="46" fill="rgba(60,80,150,0.22)" />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={15 + i * 12.5} y={30 - (i % 2) * 8} width="9" height={32 + (i % 2) * 8} fill="rgba(18,22,48,0.75)" />
        ))}
        {[
          [17, 34, '#FFD86E'], [22, 42, '#7CC4FF'], [30, 28, '#7CC4FF'], [35, 48, '#FFD86E'],
          [42, 36, '#FFD86E'], [47, 52, '#7CC4FF'], [55, 30, '#FFD86E'], [58, 44, '#7CC4FF'],
        ].map(([x, y, c], i) => (
          <rect key={i} x={x} y={y} width="3" height="2.4" fill={c as string} opacity="0.6" />
        ))}
        <rect x="12" y="16" width="52" height="46" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="2" />
        <path d="M38 16v46M12 39h52" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" />
      </g>

      {/* hanging lamp + warm cone */}
      <path d="M100 0v10" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
      <path d="M92 10h16l-4 6h-8z" fill="#2a2440" />
      <path d="M96 16h8l26 54H70z" fill="url(#crash-cone)" />

      {/* multiplier curve climbing away */}
      <path d="M14 136C60 132 96 116 128 88S176 38 186 22" fill="none" stroke="#7EE7C7" strokeWidth="6" opacity="0.16" strokeLinecap="round" />
      <path d="M14 136C60 132 96 116 128 88S176 38 186 22" fill="none" stroke="#7EE7C7" strokeWidth="2.4" strokeLinecap="round" />
      <text x="150" y="26" fontFamily="Unbounded, system-ui, sans-serif" fontWeight="900" fontSize="15" fill="#7EE7C7" stroke="#191430" strokeWidth="3" paintOrder="stroke">
        2.31×
      </text>

      {/* floor */}
      <path d="M0 120h200" stroke="rgba(255,255,255,0.09)" strokeWidth="2" />
      <ellipse cx="100" cy="122" rx="34" ry="5" fill="rgba(0,0,0,0.32)" />

      {/* ── the office drunk ── */}
      <g stroke="#191430" strokeLinejoin="round">
        {/* legs + shoes */}
        <path d="M88 92l8 0 1 24h-8z" fill="#242040" strokeWidth="2.5" />
        <path d="M104 92l8 0-1 24h-8z" fill="#242040" strokeWidth="2.5" />
        <ellipse cx="87" cy="117" rx="9" ry="4.5" fill="#181227" strokeWidth="2.5" />
        <ellipse cx="113" cy="117" rx="9" ry="4.5" fill="#181227" strokeWidth="2.5" />
        {/* torso (suit) */}
        <path d="M83 62h34l3 32H80z" fill="#312a5c" strokeWidth="3" />
        {/* shirt V + lapels */}
        <path d="M96 62h8l-4 12z" fill="#f4f0fb" strokeWidth="1.6" />
        <path d="M96 62l-7 0 6 14z" fill="#241c3e" strokeWidth="1.6" />
        <path d="M104 62l7 0-6 14z" fill="#241c3e" strokeWidth="1.6" />
        {/* tie */}
        <path d="M98 66h4l2 12-4 4-4-4z" fill="#E5484D" strokeWidth="1.6" />
        {/* far arm resting */}
        <path d="M84 66c-6 4-8 12-6 18" fill="none" stroke="#312a5c" strokeWidth="8" strokeLinecap="round" />
        <path d="M84 66c-6 4-8 12-6 18" fill="none" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="78" cy="86" r="4.5" fill="#F2C9A0" strokeWidth="2" />
        {/* drink arm with the beer mug */}
        <path d="M115 68c8 2 10 8 9 12" fill="none" stroke="#312a5c" strokeWidth="8" strokeLinecap="round" />
        <path d="M115 68c8 2 10 8 9 12" fill="none" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="124" cy="82" r="4.5" fill="#F2C9A0" strokeWidth="2" />
        <g strokeWidth="2">
          <rect x="119" y="64" width="11" height="13" rx="1.5" fill="#e0b85a" />
          <path d="M132 67a4 4 0 010 7" fill="none" />
          <ellipse cx="124.5" cy="64" rx="6.5" ry="2.8" fill="#fff" />
        </g>
        {/* head */}
        <rect x="96" y="56" width="8" height="6" fill="#e5b98f" strokeWidth="2" />
        <ellipse cx="100" cy="43" rx="15.5" ry="16.5" fill="#F2C9A0" strokeWidth="3" />
        <ellipse cx="85" cy="43" rx="2.8" ry="4.2" fill="#F2C9A0" strokeWidth="2" />
        <ellipse cx="115" cy="43" rx="2.8" ry="4.2" fill="#F2C9A0" strokeWidth="2" />
        {/* hair */}
        <path d="M86 38c1-8 8-12 14-12s13 4 14 12c-4-4-9-6-14-6s-10 2-14 6z" fill="#2a2038" strokeWidth="2" />
        {/* eyes */}
        <ellipse cx="94" cy="41" rx="4" ry="4.6" fill="#fbfbfe" strokeWidth="1.8" />
        <ellipse cx="106" cy="41" rx="4" ry="4.6" fill="#fbfbfe" strokeWidth="1.8" />
        <circle cx="94.8" cy="42" r="1.7" fill="#160f1e" stroke="none" />
        <circle cx="106.8" cy="42" r="1.7" fill="#160f1e" stroke="none" />
        {/* brows, nose, grin */}
        <path d="M90 34l7-1.4M110 34l-7-1.4" stroke="#241a2e" strokeWidth="2" strokeLinecap="round" />
        <circle cx="100" cy="47" r="3.4" fill="#d98a6a" strokeWidth="1.8" />
        <path d="M94 52c3 3 9 3 12-.5" fill="none" strokeWidth="2" strokeLinecap="round" />
        {/* blush */}
        <circle cx="90" cy="48" r="3" fill="rgba(229,72,77,0.28)" stroke="none" />
        <circle cx="110" cy="48" r="3" fill="rgba(229,72,77,0.28)" stroke="none" />
      </g>

      {/* floating bubbles */}
      <circle cx="140" cy="52" r="2" fill="rgba(255,255,255,0.4)" />
      <circle cx="146" cy="44" r="1.4" fill="rgba(255,143,208,0.5)" />
      <circle cx="63" cy="84" r="1.6" fill="rgba(124,196,255,0.45)" />

      <rect width="200" height="150" fill="url(#crash-vig)" />
    </svg>
  );
}
