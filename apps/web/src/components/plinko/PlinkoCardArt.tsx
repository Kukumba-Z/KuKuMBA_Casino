/** KuKuMBA Plinko — bespoke lobby-card art (like the crash drunk / roulette wheel
 *  thumbs). A static snapshot of the board: a glowing pastel ball mid-drop over a
 *  peg triangle, landing toward a hot edge slot. Palette mirrors the engine. */
export function PlinkoCardArt() {
  const pins: [number, number][] = [];
  const rows = 6;
  const top = 26;
  const cx = 100;
  const gap = 15;
  const rh = 15;
  for (let i = 0; i < rows; i++) {
    const count = i + 3;
    for (let j = 0; j < count; j++) {
      pins.push([cx + (j - (count - 1) / 2) * gap, top + i * rh]);
    }
  }
  const slots = ['#E5484D', '#FF8FD0', '#FFB25C', '#7EE7C7', '#7CC4FF', '#7EE7C7', '#FFB25C', '#FF8FD0', '#E5484D'];
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
        <radialGradient id="plk-ball" cx="0.38" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#FFF4CE" />
          <stop offset="0.5" stopColor="#FFD86E" />
          <stop offset="1" stopColor="#F0A93C" />
        </radialGradient>
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

      {/* slots */}
      {slots.map((c, s) => (
        <g key={s}>
          <rect x={cx + (s - 4) * gap - slotW / 2} y={slotY} width={slotW} height="16" rx="3" fill={c} opacity="0.92" />
        </g>
      ))}
      {/* highlighted hot edge slot */}
      <rect x={cx + (0 - 4) * gap - slotW / 2 - 1} y={slotY - 2} width={slotW + 2} height="20" rx="4" fill="none" stroke="#FFE7A0" strokeWidth="1.6" opacity="0.9" />

      {/* trail + ball mid-drop */}
      <circle cx="128" cy="60" r="4.5" fill="rgba(255,216,110,0.18)" />
      <circle cx="132" cy="72" r="6" fill="rgba(255,216,110,0.28)" />
      <g>
        <circle cx="135" cy="86" r="8.5" fill="url(#plk-ball)" stroke="rgba(80,50,10,0.4)" strokeWidth="1.2" />
        {/* cute face */}
        <circle cx="132" cy="84.5" r="1.3" fill="#191430" />
        <circle cx="138" cy="84.5" r="1.3" fill="#191430" />
        <path d="M132 89c1.5 1.6 4.5 1.6 6 0" fill="none" stroke="#191430" strokeWidth="1" strokeLinecap="round" />
        <circle cx="129.5" cy="87" r="1.4" fill="rgba(229,72,77,0.3)" />
        <circle cx="140.5" cy="87" r="1.4" fill="rgba(229,72,77,0.3)" />
      </g>

      <rect width="200" height="150" fill="url(#plk-vig)" />
    </svg>
  );
}
