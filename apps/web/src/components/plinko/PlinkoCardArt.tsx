/** KuKuMBA Plinko — bespoke lobby-card art (like the crash drunk / roulette wheel
 *  thumbs). A static snapshot of the neon board: a glowing cyan ball whipping
 *  side-to-side down the peg triangle toward a hot edge slot. Palette + ball
 *  mirror the canvas engine (glossy neon sphere, heat-map slots). */
export function PlinkoCardArt() {
  const pins: [number, number][] = [];
  const rows = 6;
  const top = 24;
  const cx = 100;
  const gap = 15;
  const rh = 15;
  for (let i = 0; i < rows; i++) {
    const count = i + 3;
    for (let j = 0; j < count; j++) {
      pins.push([cx + (j - (count - 1) / 2) * gap, top + i * rh]);
    }
  }
  // heat map: cool periwinkle centre → mint → orange → molten-red edges
  const slots = ['#E5484D', '#FF9F5C', '#7EE7C7', '#6C7BE0', '#7EE7C7', '#FF9F5C', '#E5484D'];
  const slotY = top + rows * rh + 6;
  const slotW = gap * 0.86;

  return (
    <svg viewBox="0 0 200 150" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" role="img" aria-hidden>
      <defs>
        <linearGradient id="plk-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a1533" />
          <stop offset="0.55" stopColor="#120e26" />
          <stop offset="1" stopColor="#0b0817" />
        </linearGradient>
        <radialGradient id="plk-ball" cx="0.36" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.32" stopColor="#C6F6FF" />
          <stop offset="0.72" stopColor="#45E3F5" />
          <stop offset="1" stopColor="#1E9FC4" />
        </radialGradient>
        <linearGradient id="plk-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(255,255,255,0.28)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <filter id="plk-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="plk-vig" cx="0.5" cy="0.42" r="0.75">
          <stop offset="0.6" stopColor="rgba(0,0,0,0)" />
          <stop offset="1" stopColor="rgba(0,0,0,0.4)" />
        </radialGradient>
      </defs>

      <rect width="200" height="150" fill="url(#plk-bg)" />
      {/* holo glow spots */}
      <circle cx="42" cy="30" r="60" fill="rgba(124,196,255,0.12)" />
      <circle cx="165" cy="45" r="60" fill="rgba(255,143,208,0.12)" />

      {/* pins */}
      {pins.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2" fill="rgba(214,208,242,0.85)" />
      ))}

      {/* slots — glossy heat-map cells with a top sheen */}
      {slots.map((c, s) => {
        const x = cx + (s - 3) * gap - slotW / 2;
        return (
          <g key={s}>
            <rect x={x} y={slotY} width={slotW} height="16" rx="3.5" fill={c} opacity="0.95" />
            <rect x={x + slotW * 0.12} y={slotY + 1.4} width={slotW * 0.76} height="3.2" rx="1.6" fill="rgba(255,255,255,0.28)" />
          </g>
        );
      })}
      {/* highlighted hot edge slot the ball is racing toward */}
      <rect x={cx + 3 * gap - slotW / 2 - 1.5} y={slotY - 2} width={slotW + 3} height="20" rx="4" fill="none" stroke="#FF9FB0" strokeWidth="1.6" opacity="0.9" />

      {/* neon zig-zag trail — the ball whipping side-to-side down the pins */}
      <path
        d="M100 20 L112 40 L96 58 L120 78 L138 96"
        fill="none"
        stroke="rgba(90,232,255,0.35)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#plk-glow)"
      />

      {/* glossy neon ball mid-drop, leaning toward the edge */}
      <g filter="url(#plk-glow)">
        <circle cx="138" cy="96" r="8.5" fill="url(#plk-ball)" />
        <ellipse cx="134.4" cy="92.4" rx="2.4" ry="1.7" fill="rgba(255,255,255,0.92)" transform="rotate(-34 134.4 92.4)" />
      </g>

      <rect width="200" height="150" fill="url(#plk-vig)" />
    </svg>
  );
}
