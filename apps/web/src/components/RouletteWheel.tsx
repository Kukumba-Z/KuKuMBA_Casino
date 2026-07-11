import { useEffect, useRef, useState } from 'react';
import { Mascot } from './Mascot';

// Keep in sync with the CSS transition below; the page reveals the result after this.
export const SPIN_MS = 4500;

// Real European wheel order (visual only — fairness comes from the RNG, not the layout).
const EURO = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31,
  9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const SEG = 360 / 37;

const colorOf = (n: number) => (n === 0 ? '#30A46C' : RED.has(n) ? '#E5484D' : '#272042');

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function segPath(cx: number, cy: number, rO: number, rI: number, a0: number, a1: number) {
  const [x0, y0] = polar(cx, cy, rO, a0);
  const [x1, y1] = polar(cx, cy, rO, a1);
  const [x2, y2] = polar(cx, cy, rI, a1);
  const [x3, y3] = polar(cx, cy, rI, a0);
  const large = a1 - a0 <= 180 ? 0 : 1;
  return `M${x0},${y0} A${rO},${rO} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${rI},${rI} 0 ${large} 0 ${x3},${y3} Z`;
}

export function RouletteWheel({
  result,
  spinId,
  size = 320,
  spinMs = SPIN_MS,
}: {
  result: number | null;
  spinId: number;
  size?: number;
  /** Spin animation duration. 0 = "quick play": snap straight to the result. */
  spinMs?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const rO = size / 2 - 4;
  const rI = size / 2 - 34;
  const rText = (rO + rI) / 2;

  const [rot, setRot] = useState(0);
  const [ballRot, setBallRot] = useState(0);
  const [landed, setLanded] = useState(true);
  const rotRef = useRef(0);
  const ballRef = useRef(0);

  useEffect(() => {
    if (result == null || spinId === 0) return;
    const idx = EURO.indexOf(result);
    // Settle at a RANDOM screen angle each spin (not always the top) so the
    // landing spot is a surprise — the ball and the winning pocket both end up
    // at this angle, and you only learn the number once it rests there.
    const theta = Math.random() * 360;

    // Wheel: rotate so pocket `idx` (drawn at idx*SEG locally) lands at `theta`.
    const current = rotRef.current;
    const mod = ((current % 360) + 360) % 360;
    const wantRot = ((theta - idx * SEG) % 360 + 360) % 360;
    const next = current + 360 * 6 + ((wantRot - mod) % 360 + 360) % 360; // 6 turns then settle
    rotRef.current = next;
    setRot(next);

    // Ball: orbits the opposite way ~9 turns and rests at the same `theta`.
    const b = ballRef.current;
    const bmod = ((b % 360) + 360) % 360;
    const ballNext = b - 360 * 9 + (((theta - bmod) % 360 + 360) % 360);
    ballRef.current = ballNext;
    setBallRot(ballNext);

    // Quick play (spinMs <= 0): the wheel/ball jump to the final spot with a
    // zero-length transition, so reveal the number immediately — no waiting.
    if (spinMs <= 0) {
      setLanded(true);
      return;
    }
    setLanded(false);
    // fallback in case transitionend doesn't fire (reduced motion etc.)
    const tm = setTimeout(() => setLanded(true), spinMs + 120);
    return () => clearTimeout(tm);
  }, [spinId, result]);

  const showNumber = result != null && landed;
  const resultBg =
    result == null ? '' : result === 0 ? 'bg-roul-green' : RED.has(result) ? 'bg-roul-red' : 'bg-roul-black';

  return (
    <div className="relative mx-auto aspect-square w-full" style={{ maxWidth: size }}>
      {/* clip the rotating square SVG: its corners sweep outside the box while it
          spins (and rest there when it settles at an angle), which otherwise
          overflows the page horizontally and shifts the whole layout sideways.
          Rectangular clip + will-change on purpose: everything painted lives
          inside the inscribed circle, an axis-aligned clip is free on the
          compositor, and a border-radius mask over an animated layer forces
          main-thread work every frame (judder on 120 Hz screens). */}
      <div className="absolute inset-0 overflow-hidden">
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${size} ${size}`}
          onTransitionEnd={(e) => {
            if ((e as any).propertyName === 'transform') setLanded(true);
          }}
          style={{
            transform: `rotate(${rot}deg)`,
            transition: `transform ${spinMs}ms cubic-bezier(0.16, 1, 0.3, 1)`,
            willChange: 'transform',
          }}
        >
          <circle cx={cx} cy={cy} r={rO + 3} fill="#0B0817" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
          {EURO.map((n, i) => {
            const a0 = i * SEG - SEG / 2;
            const a1 = i * SEG + SEG / 2;
            const [tx, ty] = polar(cx, cy, rText, i * SEG);
            return (
              <g key={n}>
                <path d={segPath(cx, cy, rO, rI, a0, a1)} fill={colorOf(n)} stroke="rgba(0,0,0,0.35)" strokeWidth="0.5" />
                <text
                  x={tx}
                  y={ty}
                  fill="white"
                  fontSize="11"
                  fontWeight="700"
                  textAnchor="middle"
                  dominantBaseline="central"
                  transform={`rotate(${i * SEG}, ${tx}, ${ty})`}
                >
                  {n}
                </text>
              </g>
            );
          })}
          <circle cx={cx} cy={cy} r={rI} fill="#14102A" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
        </svg>
      </div>

      {/* the ball — orbits the rim while spinning and settles at a random angle.
          Bright with a glow + a soft trailing halo so it's easy to follow. */}
      <div
        className="pointer-events-none absolute inset-0 z-[15]"
        style={{
          transform: `rotate(${ballRot}deg)`,
          transition: `transform ${spinMs}ms cubic-bezier(0.18, 0.7, 0.12, 1)`,
          willChange: 'transform',
        }}
      >
        {/* trailing halo (slightly behind the ball along the rim) */}
        <div
          className="absolute left-1/2 h-[7%] w-[7%] -translate-x-1/2 rounded-full bg-white/40 blur-[3px]"
          style={{ top: '2.4%' }}
        />
        {/* the ball itself */}
        <div
          className="absolute left-1/2 h-[6%] w-[6%] -translate-x-1/2 rounded-full bg-white ring-2 ring-sun/70 shadow-[0_0_16px_5px_rgba(255,255,255,0.95)]"
          style={{ top: '2.6%' }}
        />
      </div>

      <div className="absolute inset-0 z-10 grid place-items-center">
        <div
          className={`grid h-24 w-24 place-items-center rounded-full text-center shadow-glow ring-2 ring-white/15 transition-colors duration-300 ${
            showNumber ? `${resultBg} text-white` : 'bg-holo-soft'
          }`}
        >
          {showNumber ? (
            <div>
              <div className="text-3xl font-extrabold tabular-nums">{result}</div>
              <div className="text-[10px] uppercase tracking-widest text-white/70">
                {result === 0 ? 'zero' : RED.has(result) ? 'red' : 'black'}
              </div>
            </div>
          ) : (
            <Mascot size={44} />
          )}
        </div>
      </div>
    </div>
  );
}
