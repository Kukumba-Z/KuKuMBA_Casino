import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { resumeAudio, setSoundEnabled, sfx } from '../../lib/sound';

/**
 * KuKuMBA Upgrader wheel — a pure PRESENTER, exactly like the roulette wheel and
 * the plinko engine: every ruble of truth comes from the upgrader API. `spinTo`
 * animates the EXACT server-resolved stop angle, so what you watch is what
 * settled. The lit win-sector is drawn as the arc [0, chance) from the SAME zero
 * reference (12 o'clock) the needle angle is measured from — so "needle inside
 * the arc" is identically the server's `win` (float < chance). Do not move the
 * arc and the needle into different reference frames.
 */
export interface UpgraderWheelHandle {
  /** Spin the needle to the server angle (angleBp ∈ 0..9999) and reveal win/lose. */
  spinTo(angleBp: number, win: boolean, multiplier: number): void;
  resumeAudio(): void;
  setSound(on: boolean): void;
  setFast(fast: boolean): void;
}

interface UpgraderWheelProps {
  /** Current selected win chance as a fraction (0..1) — sizes the lit arc. */
  chance: number;
  /** Current derived multiplier — the big centre readout. */
  multiplier: number;
  /** Fired when the needle lands (page reveals the settled balance here). */
  onLand?: () => void;
  idleText?: string;
  winText?: string;
  loseText?: string;
  size?: number;
}

/** deg 0 = 12 o'clock, increasing clockwise (matches the CSS needle rotation). */
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

/** Risk heat: a tiny chance (fat ×) burns red, a big chance (thin ×) cools mint. */
function arcColor(chance: number): string {
  if (chance <= 0.05) return '#E5484D'; // roul-red
  if (chance <= 0.2) return '#FFB25C'; // warm orange
  if (chance <= 0.5) return '#FFD86E'; // sun
  return '#7EE7C7'; // mint
}

function lighten(hex: string, amt: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const f = (v: number) => Math.round(v + (255 - v) * amt);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

/** Clean multiplier text — whole ≥100, two decimals below. */
function fmtMult(m: number): string {
  if (!Number.isFinite(m)) return '—';
  if (m >= 100) return String(Math.round(m));
  return (Math.round(m * 100) / 100).toFixed(2);
}

export const UpgraderWheel = forwardRef<UpgraderWheelHandle, UpgraderWheelProps>(function UpgraderWheel(
  { chance, multiplier, onLand, idleText, winText, loseText, size = 320 },
  ref,
) {
  const cx = size / 2;
  const cy = size / 2;
  const rRim = size / 2 - 3;
  const rTickOuter = size / 2 - 8;
  const rTickInner = size / 2 - 18;
  const rArcOuter = size / 2 - 10;
  const rArcInner = size / 2 - 26;
  const rNeedle = size / 2 - 30;
  const rHub = size * 0.3;

  const [rot, setRot] = useState(0);
  const [dur, setDur] = useState(3200);
  const [landed, setLanded] = useState(true);
  // Result of the last completed spin — recolours the centre (null = neutral/idle).
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
    spinTo(angleBp: number, win: boolean) {
      if (landTimer.current) window.clearTimeout(landTimer.current);
      const fast = fastRef.current;
      // Final needle angle = the server stop point; add whole turns "for drama".
      const theta = (angleBp / 10000) * 360;
      const current = rotRef.current;
      const TURNS = fast ? 2 : 6;
      const next = current + 360 * TURNS + (((theta - (current % 360)) % 360) + 360) % 360;
      rotRef.current = next;
      const ms = fast ? 260 : 3200;
      pendingWinRef.current = win;
      landedRef.current = false;
      setDur(ms);
      setResult(null); // neutral while spinning
      setLanded(false);
      setRot(next);
      sfx.arrowSpin(ms); // spinning-needle whoosh over the whole travel
      // Reveal on transitionend; this timer is the reduced-motion / no-fire fallback.
      landTimer.current = window.setTimeout(land, ms + 120);
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

  // Idle/live arc reflects the current selection; a spin never changes chance mid-air.
  const arcDeg = Math.min(359.999, Math.max(0, chance * 360));
  const col = arcColor(chance);
  const light = lighten(col, 0.35);

  // Minor tick every 6°, a longer major tick every 30°.
  const ticks = Array.from({ length: 60 }, (_, i) => i * 6);

  const hubRing =
    result == null ? 'ring-white/10' : result.win ? 'ring-mint/70 shadow-glow-mint' : 'ring-roul-red/70';
  const hubBg = result == null ? 'bg-holo-soft' : result.win ? 'bg-mint/15' : 'bg-roul-red/15';

  const pctVal = chance * 100;
  const pct = pctVal < 10 ? pctVal.toFixed(2) : pctVal.toFixed(1);

  return (
    <div className="relative mx-auto aspect-square w-full" style={{ maxWidth: size }}>
      {/* Clip the rotating needle SVG so its square box can't overflow the page
          sideways while it spins (same guard as the roulette wheel). */}
      <div className="absolute inset-0 overflow-hidden rounded-full">
        {/* Static wheel: rim, tick scale, lit win-arc. */}
        <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`}>
          <defs>
            <linearGradient id="upg-arc" x1="0" y1="0" x2="1" y2="1">
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

          {/* base disc + rim + arc track */}
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

          {/* lit win-sector: the arc [0, chance) from 12 o'clock, clockwise */}
          <path d={segPath(cx, cy, rArcOuter, rArcInner, 0, arcDeg)} fill="url(#upg-arc)" filter="url(#upg-glow)" opacity="0.95" />
          {/* bright start marker at the zero reference so a tiny arc is still visible */}
          <line x1={cx} y1={cy - rArcInner} x2={cx} y2={cy - rArcOuter} stroke={light} strokeWidth="2" />

          {/* scale labels: 0/100% at top, 50% at bottom */}
          <text x={cx} y={cy - rHub - 6} fill="rgba(255,255,255,0.55)" fontSize="10" fontWeight="700" textAnchor="middle">
            0 / 100%
          </text>
          <text x={cx} y={cy + rHub + 13} fill="rgba(255,255,255,0.45)" fontSize="10" fontWeight="700" textAnchor="middle">
            50%
          </text>
        </svg>

        {/* Rotating needle overlay — spins around the shared centre with a CSS
            transition; points to 12 o'clock at rot=0, i.e. the arc's zero point. */}
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
            transition: `transform ${dur}ms cubic-bezier(0.16, 1, 0.3, 1)`,
          }}
        >
          <g filter="url(#upg-glow)">
            {/* counterweight tail */}
            <path d={`M${cx - 5},${cy} L${cx + 5},${cy} L${cx},${cy + rHub * 0.5} Z`} fill="rgba(255,255,255,0.35)" />
            {/* the pointer */}
            <path d={`M${cx},${cy - rNeedle} L${cx + 5.5},${cy} L${cx - 5.5},${cy} Z`} fill="#FFFFFF" />
            <circle cx={cx} cy={cy - rNeedle} r="4.5" fill="#FFFFFF" />
          </g>
          <circle cx={cx} cy={cy} r="7" fill="#EDE7FF" stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
        </svg>
      </div>

      {/* Centre readout — multiplier + chance; recolours on the result. */}
      <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
        <div
          className={`grid place-items-center rounded-full text-center ring-2 transition-colors duration-300 ${hubRing} ${hubBg}`}
          style={{ width: rHub * 2, height: rHub * 2 }}
        >
          <div>
            {result != null && landed ? (
              <div className={`text-[11px] font-bold uppercase tracking-widest ${result.win ? 'text-mint' : 'text-roul-red'}`}>
                {result.win ? winText : loseText}
              </div>
            ) : (
              <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40">{idleText}</div>
            )}
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
