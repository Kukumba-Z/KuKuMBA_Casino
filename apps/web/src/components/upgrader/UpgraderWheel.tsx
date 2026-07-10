import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { resumeAudio, setSoundEnabled, sfx } from '../../lib/sound';

/**
 * KuKuMBA Upgrader wheel — a pure PRESENTER, exactly like the roulette wheel and
 * the plinko engine: every ruble of truth comes from the upgrader API. `spinTo`
 * animates the server-resolved outcome, so what you watch is what settled.
 *
 * The lit win-zone is drawn SYMMETRIC about 12 o'clock: it grows clockwise AND
 * counter-clockwise from the top as the chance rises, meeting at the bottom at
 * 100%. To keep "arrow inside the lit zone ⇔ server win" identically true, the
 * server float is remapped onto the dial measure-preservingly: win floats
 * [0, chance) spread uniformly across the lit zone, lose floats [chance, 1)
 * across the dark rest — the landing spot stays uniform on the dial and the
 * picture can never disagree with the settlement.
 *
 * The needle is not a centre hand: it ORBITS the rim (a dart riding the wheel's
 * outer ring, like a moon around a planet) and stops over the zone or past it.
 */
export interface UpgraderWheelHandle {
  /** Spin the dart to the server outcome (angleBp ∈ 0..9999) for the bet's chance. */
  spinTo(angleBp: number, win: boolean, chance: number): void;
  resumeAudio(): void;
  setSound(on: boolean): void;
  setFast(fast: boolean): void;
}

interface UpgraderWheelProps {
  /** Current selected win chance as a fraction (0..1) — sizes the lit zone. */
  chance: number;
  /** Current derived multiplier — the big centre readout. */
  multiplier: number;
  /** Largest playable chance at the live RTP — normalises the heat colour scale. */
  maxChance?: number;
  /** Fired when the dart lands (page reveals the settled balance here). */
  onLand?: () => void;
  winText?: string;
  loseText?: string;
  size?: number;
}

/** deg 0 = 12 o'clock, increasing clockwise (matches the CSS rotation). */
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/** Annular sector between radii rO/rI from angle a0 to a1 (deg, clockwise). */
function segPath(cx: number, cy: number, rO: number, rI: number, a0: number, a1: number) {
  const [x0, y0] = polar(cx, cy, rO, a0);
  const [x1, y1] = polar(cx, cy, rO, a1);
  const [x2, y2] = polar(cx, cy, rI, a1);
  const [x3, y3] = polar(cx, cy, rI, a0);
  const large = a1 - a0 <= 180 ? 0 : 1;
  return `M${x0},${y0} A${rO},${rO} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${rI},${rI} 0 ${large} 0 ${x3},${y3} Z`;
}

/** Continuous risk heat: red (tiny chance) → orange → gold → mint (big chance). */
const HEAT: Array<[number, [number, number, number]]> = [
  [0, [229, 72, 77]], // roul-red
  [0.35, [255, 178, 92]], // warm orange
  [0.65, [255, 216, 110]], // sun
  [1, [126, 231, 199]], // mint
];
function heatRgb(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < HEAT.length; i++) {
    const [t0, c0] = HEAT[i - 1];
    const [t1, c1] = HEAT[i];
    if (x <= t1) {
      const k = (x - t0) / (t1 - t0);
      return [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * k)) as [number, number, number];
    }
  }
  return HEAT[HEAT.length - 1][1];
}
const rgbStr = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;
const lightenRgb = (c: [number, number, number], amt: number) =>
  rgbStr([0, 1, 2].map((j) => Math.round(c[j] + (255 - c[j]) * amt)) as [number, number, number]);

/**
 * Measure-preserving float → dial angle (deg from 12 o'clock, clockwise).
 * Win floats fill the symmetric lit zone [-c·180°, +c·180°]; lose floats fill
 * the rest. The `win` flag picks the branch so bp quantisation at the boundary
 * can never put the dart on the wrong side of the line.
 */
function visualTheta(float: number, win: boolean, chance: number): number {
  const c = Math.min(Math.max(chance, 0.0001), 0.99);
  if (win) {
    const u = Math.min(Math.max(float / c, 0.002), 0.998); // 0..1 across the win zone
    return (u - 0.5) * c * 360; // -c·180° .. +c·180°
  }
  const v = Math.min(Math.max((float - c) / (1 - c), 0.002), 0.998);
  return c * 180 + v * (1 - c) * 360; // c·180° .. 360° - c·180°
}

/** Clean multiplier text — whole ≥100, two decimals below. */
function fmtMult(m: number): string {
  if (!Number.isFinite(m)) return '—';
  if (m >= 100) return String(Math.round(m));
  return (Math.round(m * 100) / 100).toFixed(2);
}

// Slow, suspenseful travel: fast launch, then a long creeping tail — the end
// slope of the curve is zero, so the dart eases to rest instead of snapping.
const SPIN_MS = 5600;
const SPIN_EASE = 'cubic-bezier(0.12, 0.75, 0.18, 1)';
const FAST_MS = 260;

export const UpgraderWheel = forwardRef<UpgraderWheelHandle, UpgraderWheelProps>(function UpgraderWheel(
  { chance, multiplier, maxChance = 0.99 / 1.02, onLand, winText, loseText, size = 320 },
  ref,
) {
  const cx = size / 2;
  const cy = size / 2;
  const rRim = size / 2 - 3;
  const rTickOuter = size / 2 - 8;
  const rTickInner = size / 2 - 18;
  const rArcOuter = size / 2 - 10;
  const rArcInner = size / 2 - 26;
  const rHub = size * 0.28;

  const [rot, setRot] = useState(0);
  const [dur, setDur] = useState(SPIN_MS);
  const [landed, setLanded] = useState(true);
  // Result of the last completed spin — recolours the centre (null = neutral).
  const [result, setResult] = useState<{ win: boolean } | null>(null);

  const rotRef = useRef(0);
  const fastRef = useRef(false);
  const pendingWinRef = useRef(false);
  const landedRef = useRef(true); // closure-safe guard against a double land()
  const landTimer = useRef<number | null>(null);

  const land = () => {
    if (landedRef.current) return; // transitionend + fallback timer both call this
    landedRef.current = true;
    if (landTimer.current) {
      window.clearTimeout(landTimer.current);
      landTimer.current = null;
    }
    const win = pendingWinRef.current;
    setLanded(true);
    setResult({ win });
    if (win) sfx.win();
    else sfx.lose();
    onLand?.();
  };

  useImperativeHandle(ref, () => ({
    spinTo(angleBp: number, win: boolean, betChance: number) {
      if (landTimer.current) window.clearTimeout(landTimer.current);
      const fast = fastRef.current;
      // Reconstruct the fair float and remap it onto the symmetric dial.
      const float = Math.min(Math.max(angleBp / 10000, 0), 0.9999);
      const theta = visualTheta(float, win, betChance);
      const current = rotRef.current;
      const TURNS = fast ? 2 : 5;
      const next = current + 360 * TURNS + (((theta - (current % 360)) % 360) + 360) % 360;
      rotRef.current = next;
      const ms = fast ? FAST_MS : SPIN_MS;
      pendingWinRef.current = win;
      landedRef.current = false;
      setDur(ms);
      setResult(null); // neutral while spinning
      setLanded(false);
      setRot(next);
      sfx.arrowSpin(ms); // spinning-needle whoosh over the whole travel
      // Reveal on transitionend; this timer is the reduced-motion / no-fire fallback.
      landTimer.current = window.setTimeout(land, ms + 150);
    },
    resumeAudio() {
      resumeAudio();
    },
    setSound(on: boolean) {
      setSoundEnabled(on);
    },
    setFast(fast: boolean) {
      fastRef.current = fast;
    },
  }));

  // Adjusting the chance (only possible between spins) drops the win/lose colour
  // and returns the centre to the neutral live preview.
  useEffect(() => {
    setResult(null);
  }, [chance]);

  // The lit zone grows BOTH ways from 12 o'clock: ±(chance·180°).
  const halfDeg = Math.min(179.999, Math.max(0.02, chance * 180));
  // Heat colour normalised over the playable range: max chance = pure mint.
  const rgb = heatRgb(chance / Math.max(chance, maxChance));
  const col = rgbStr(rgb);
  const light = lightenRgb(rgb, 0.35);

  // Minor tick every 6°, a longer major tick every 30°.
  const ticks = Array.from({ length: 60 }, (_, i) => i * 6);

  const hubRing =
    result == null ? 'ring-white/10' : result.win ? 'ring-mint/70 shadow-glow-mint' : 'ring-roul-red/70';
  const hubBg = result == null ? 'bg-holo-soft' : result.win ? 'bg-mint/15' : 'bg-roul-red/15';

  const pctVal = chance * 100;
  const pct = pctVal < 10 ? pctVal.toFixed(2) : pctVal.toFixed(1);

  // Orbiting dart: a sleek pointer riding the rim ring, tip aimed at the centre.
  const dartTipR = rArcInner - 5;
  const dartBaseR = rRim - 1;
  const dartPath = `M${cx},${cy - dartTipR} L${cx - 6.5},${cy - dartBaseR} L${cx + 6.5},${cy - dartBaseR} Z`;

  return (
    <div className="relative mx-auto aspect-square w-full" style={{ maxWidth: size }}>
      {/* Clip the rotating layer so its square box can't overflow the page
          sideways while it spins (same guard as the roulette wheel). A plain
          rectangular clip on purpose — everything painted lives inside the
          inscribed circle anyway, and an axis-aligned clip is free on the
          compositor, while a border-radius mask over an animated layer forces
          main-thread work every frame (visible judder on 120 Hz screens). */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Static wheel: rim, tick scale, lit win-zone. */}
        <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`}>
          <defs>
            <linearGradient id="upg-arc" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={light} />
              <stop offset="1" stopColor={col} />
            </linearGradient>
            <filter id="upg-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* base disc + rim + zone track */}
          <circle cx={cx} cy={cy} r={rRim} fill="#0B0817" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
          <circle
            cx={cx}
            cy={cy}
            r={(rArcOuter + rArcInner) / 2}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={rArcOuter - rArcInner}
          />

          {/* tick scale */}
          {ticks.map((deg) => {
            const major = deg % 30 === 0;
            const [x0, y0] = polar(cx, cy, rTickOuter, deg);
            const [x1, y1] = polar(cx, cy, major ? rTickInner : rTickInner + 5, deg);
            return (
              <line
                key={deg}
                x1={x0}
                y1={y0}
                x2={x1}
                y2={y1}
                stroke={major ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.22)'}
                strokeWidth={major ? 2 : 1}
              />
            );
          })}

          {/* lit win-zone: symmetric about 12 o'clock, growing both ways from the top */}
          <path
            d={segPath(cx, cy, rArcOuter, rArcInner, -halfDeg, halfDeg)}
            fill="url(#upg-arc)"
            filter="url(#upg-glow)"
            opacity="0.95"
          />
          {/* zero reference marker at the very top */}
          <line x1={cx} y1={cy - rArcInner} x2={cx} y2={cy - rArcOuter} stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />

          {/* scale labels: 0% at top, 50% at the sides, 100% at the bottom */}
          <text x={cx} y={cy - rHub - 8} fill="rgba(255,255,255,0.55)" fontSize="10" fontWeight="700" textAnchor="middle">
            0%
          </text>
          <text x={cx} y={cy + rHub + 15} fill="rgba(255,255,255,0.45)" fontSize="10" fontWeight="700" textAnchor="middle">
            100%
          </text>
          <text x={cx - rHub - 8} y={cy + 3} fill="rgba(255,255,255,0.35)" fontSize="9" fontWeight="700" textAnchor="end">
            50%
          </text>
          <text x={cx + rHub + 8} y={cy + 3} fill="rgba(255,255,255,0.35)" fontSize="9" fontWeight="700" textAnchor="start">
            50%
          </text>
        </svg>

        {/* Orbiting dart — rides the rim around the wheel (a moon on its orbit)
            with a CSS transition; sits at 12 o'clock at rot=0, the zone's centre.
            `will-change: transform` pins the layer to the compositor so the spin
            interpolates off the main thread at the display's native refresh rate.
            No SVG filter in here on purpose: a blur inside a transforming layer
            forces per-frame main-thread re-rasterisation, which is exactly the
            120 Hz judder — the glow is baked with layered strokes instead. */}
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${size} ${size}`}
          className="absolute inset-0"
          onTransitionEnd={(e) => {
            if ((e as any).propertyName === 'transform') land();
          }}
          style={{
            transform: `rotate(${rot}deg)`,
            transformOrigin: 'center',
            transition: `transform ${dur}ms ${SPIN_EASE}`,
            willChange: 'transform',
          }}
        >
          {/* a clean dart, no balls: soft baked halo + bright body + dark keyline
              so it pops on both the dark rim and the lit zone */}
          <path d={dartPath} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="7" strokeLinejoin="round" />
          <path d={dartPath} fill="none" stroke="rgba(255,216,110,0.4)" strokeWidth="3.5" strokeLinejoin="round" />
          <path d={dartPath} fill="#FFFFFF" stroke="rgba(11,8,23,0.55)" strokeWidth="1" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Centre readout — multiplier + chance; recolours on the result. The
          result label lives in a fixed-height slot so the numbers never jump. */}
      <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
        <div
          className={`grid place-items-center rounded-full text-center ring-2 transition-colors duration-300 ${hubRing} ${hubBg}`}
          style={{ width: rHub * 2, height: rHub * 2 }}
        >
          <div>
            <div
              className={`h-4 text-[11px] font-bold uppercase tracking-widest transition-opacity duration-200 ${
                result != null && landed
                  ? result.win
                    ? 'text-mint opacity-100'
                    : 'text-roul-red opacity-100'
                  : 'opacity-0'
              }`}
            >
              {result != null ? (result.win ? winText : loseText) : ' '}
            </div>
            <div
              className={`font-display text-2xl font-black tabular-nums ${
                result != null && landed ? (result.win ? 'text-mint' : 'text-roul-red') : 'holo-text'
              }`}
            >
              ×{fmtMult(multiplier)}
            </div>
            <div className="text-xs font-bold tabular-nums text-white/55">{pct}%</div>
          </div>
        </div>
      </div>
    </div>
  );
});
