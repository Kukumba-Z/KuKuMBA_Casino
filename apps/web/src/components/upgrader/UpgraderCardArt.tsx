/** KuKuMBA Upgrader — bespoke lobby-card art (like the plinko board / roulette
 *  wheel thumbs). A static snapshot of the neon wheel: a tick scale, a glowing
 *  gradient win-arc from 12 o'clock, and a bright needle frozen mid-spin over a
 *  centre readout. Palette mirrors the wheel component. */
export function UpgraderCardArt() {
  const cx = 100;
  const cy = 78;
  const rTickO = 60;
  const rTickI = 52;
  const rArcO = 58;
  const rArcI = 44;

  const polar = (r: number, deg: number): [number, number] => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const seg = (rO: number, rI: number, a0: number, a1: number) => {
    const [x0, y0] = polar(rO, a0);
    const [x1, y1] = polar(rO, a1);
    const [x2, y2] = polar(rI, a1);
    const [x3, y3] = polar(rI, a0);
    const large = a1 - a0 <= 180 ? 0 : 1;
    return `M${x0},${y0} A${rO},${rO} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${rI},${rI} 0 ${large} 0 ${x3},${y3} Z`;
  };
  const ticks = Array.from({ length: 36 }, (_, i) => i * 10);
  // needle frozen just inside the lit arc
  const needleDeg = 58;
  const [nx, ny] = polar(rArcI - 4, needleDeg);

  return (
    <svg viewBox="0 0 200 150" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" role="img" aria-hidden>
      <defs>
        <linearGradient id="upgc-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a1533" />
          <stop offset="0.55" stopColor="#120e26" />
          <stop offset="1" stopColor="#0b0817" />
        </linearGradient>
        <linearGradient id="upgc-arc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7EE7C7" />
          <stop offset="0.5" stopColor="#FFD86E" />
          <stop offset="1" stopColor="#E5484D" />
        </linearGradient>
        <filter id="upgc-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="upgc-vig" cx="0.5" cy="0.5" r="0.75">
          <stop offset="0.6" stopColor="rgba(0,0,0,0)" />
          <stop offset="1" stopColor="rgba(0,0,0,0.4)" />
        </radialGradient>
      </defs>

      <rect width="200" height="150" fill="url(#upgc-bg)" />
      <circle cx="42" cy="30" r="60" fill="rgba(124,196,255,0.12)" />
      <circle cx="165" cy="45" r="60" fill="rgba(255,143,208,0.12)" />

      {/* rim */}
      <circle cx={cx} cy={cy} r={rTickO + 2} fill="#0B0817" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />

      {/* tick scale */}
      {ticks.map((deg, i) => {
        const major = deg % 30 === 0;
        const [x0, y0] = polar(rTickO, deg);
        const [x1, y1] = polar(major ? rTickI : rTickI + 3, deg);
        return (
          <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={major ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.22)'} strokeWidth={major ? 1.4 : 0.8} />
        );
      })}

      {/* lit win-arc from 12 o'clock */}
      <path d={seg(rArcO, rArcI, 0, 72)} fill="url(#upgc-arc)" filter="url(#upgc-glow)" opacity="0.95" />

      {/* needle */}
      <g filter="url(#upgc-glow)">
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx={nx} cy={ny} r="3" fill="#FFFFFF" />
      </g>

      {/* centre hub */}
      <circle cx={cx} cy={cy} r="22" fill="#14102A" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" />
      <text x={cx} y={cy - 1} fill="#FFD86E" fontSize="12" fontWeight="800" textAnchor="middle" fontFamily="Unbounded, system-ui, sans-serif">
        ×5.0
      </text>
      <text x={cx} y={cy + 11} fill="rgba(255,255,255,0.6)" fontSize="7.5" fontWeight="700" textAnchor="middle">
        20%
      </text>

      <rect width="200" height="150" fill="url(#upgc-vig)" />
    </svg>
  );
}
