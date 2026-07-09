/** KuKuMBA Mines — bespoke lobby-card art (like the plinko board / upgrader
 *  wheel thumbs). A static snapshot of the 5×5 night board: a couple of glowing
 *  mint crystals already found, one red mine peeking out, the rest face-down.
 *  Palette mirrors the game page tiles. */
export function MinesCardArt() {
  const size = 21; // tile
  const gap = 4;
  const bx = 100 - (5 * size + 4 * gap) / 2; // board centred at x=100
  const by = 14;
  const tile = (col: number, row: number) => ({ x: bx + col * (size + gap), y: by + row * (size + gap) });

  // opened crystals and the revealed mine (everything else stays face-down)
  const crystals: Array<[number, number]> = [
    [1, 1],
    [3, 2],
    [2, 3],
  ];
  const mine: [number, number] = [4, 0];
  const opened = new Set([...crystals, mine].map(([c, r]) => `${c}:${r}`));

  const crystalPath = (x: number, y: number) => {
    const cx = x + size / 2;
    const cy = y + size / 2;
    return `M${cx},${cy - 6.5} L${cx + 5.5},${cy - 1} L${cx},${cy + 6.5} L${cx - 5.5},${cy - 1} Z`;
  };

  return (
    <svg viewBox="0 0 200 150" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" role="img" aria-hidden>
      <defs>
        <linearGradient id="minc-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a1533" />
          <stop offset="0.55" stopColor="#120e26" />
          <stop offset="1" stopColor="#0b0817" />
        </linearGradient>
        <linearGradient id="minc-gem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7EE7C7" />
          <stop offset="1" stopColor="#7CC4FF" />
        </linearGradient>
        <filter id="minc-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="minc-vig" cx="0.5" cy="0.5" r="0.75">
          <stop offset="0.6" stopColor="rgba(0,0,0,0)" />
          <stop offset="1" stopColor="rgba(0,0,0,0.4)" />
        </radialGradient>
      </defs>

      <rect width="200" height="150" fill="url(#minc-bg)" />
      <circle cx="40" cy="28" r="55" fill="rgba(126,231,199,0.10)" />
      <circle cx="168" cy="118" r="60" fill="rgba(229,72,77,0.10)" />

      {/* board */}
      {Array.from({ length: 5 }, (_, row) =>
        Array.from({ length: 5 }, (_, col) => {
          const { x, y } = tile(col, row);
          const open = opened.has(`${col}:${row}`);
          return (
            <rect
              key={`${col}:${row}`}
              x={x}
              y={y}
              width={size}
              height={size}
              rx={5}
              fill={open ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)'}
              stroke={open ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.14)'}
              strokeWidth="1"
            />
          );
        }),
      )}

      {/* found crystals */}
      {crystals.map(([c, r], i) => {
        const { x, y } = tile(c, r);
        return <path key={i} d={crystalPath(x, y)} fill="url(#minc-gem)" filter="url(#minc-glow)" opacity="0.95" />;
      })}

      {/* the revealed mine */}
      {(() => {
        const { x, y } = tile(mine[0], mine[1]);
        const cx = x + size / 2;
        const cy = y + size / 2;
        return (
          <g filter="url(#minc-glow)">
            <circle cx={cx} cy={cy} r="5.5" fill="#E5484D" />
            <path d={`M${cx},${cy - 8} v3 M${cx},${cy + 5} v3 M${cx - 8},${cy} h3 M${cx + 5},${cy} h3`} stroke="#E5484D" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx={cx - 1.8} cy={cy - 1.8} r="1.4" fill="rgba(255,255,255,0.55)" />
          </g>
        );
      })()}

      <rect width="200" height="150" fill="url(#minc-vig)" />
    </svg>
  );
}
