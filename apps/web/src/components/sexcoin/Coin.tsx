import { useEffect, useRef } from 'react';
import { PenisFace, VaginaFace } from './CoinFaces';

/**
 * The 3D coin — pure CSS, no canvas. A perspective container holds a
 * preserve-3d disc with the two SVG faces back-to-back (backface-visibility:
 * hidden, the vagina face pre-rotated 180°), so rotating the disc around Y
 * flips between them. The parent owns the cumulative rotation (deg): 0 (mod
 * 360) shows the penis face, 180 shows the vagina face; a throw is "current
 * rotation + N full turns + the target offset" with a long ease-out
 * (cubic-bezier(0.16,1,0.3,1) — the same deceleration as the roulette wheel).
 * Landing is reported via onTransitionEnd with a timeout fallback (reduced
 * motion, hidden tab), the RouletteWheel pattern.
 *
 * The throw itself is sold by a wrapper that rides the `sexcoin-toss`
 * keyframe arc (index.css) in sync with the spin: the coin leaps up, hangs,
 * falls back with a little bounce — and rests SMALLER than it flies (scale
 * .86 vs up to 1.1), while a ground shadow underneath plays the inverse arc.
 * There is deliberately NO separate edge plane: a quad locked at 90° to the
 * faces rasterises as a stray dashed line on mobile GPUs whenever the coin is
 * face-on. The reeded rings baked into the faces carry the edge illusion.
 */
export function Coin({
  rotation,
  spinMs,
  spinId,
  onLanded,
  glow = 'idle',
  size = 220,
  className,
}: {
  /** Cumulative Y rotation in degrees (parent-owned). */
  rotation: number;
  /** Transition duration for the CURRENT move; 0 = snap instantly. */
  spinMs: number;
  /** Bumped by the parent on every throw — keys the landing callbacks. */
  spinId: number;
  onLanded?: () => void;
  glow?: 'idle' | 'win' | 'lose';
  size?: number;
  className?: string;
}) {
  const landedRef = useRef(-1);

  const land = () => {
    if (landedRef.current === spinId) return;
    landedRef.current = spinId;
    onLanded?.();
  };

  // Timeout fallback in case transitionend doesn't fire (reduced motion etc.).
  useEffect(() => {
    if (spinId === 0) return;
    if (spinMs <= 0) {
      land();
      return;
    }
    const tm = setTimeout(land, spinMs + 150);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinId]);

  const flying = spinMs > 0;

  const glowColor =
    glow === 'win'
      ? 'rgba(126,231,199,0.4)'
      : glow === 'lose'
        ? 'rgba(229,72,77,0.38)'
        : 'rgba(255,216,110,0.22)';

  return (
    <div className={`relative ${className ?? ''}`} style={{ width: size, height: size, perspective: size * 5 }}>
      {/* soft radial glow behind the coin — warm at rest, verdict-coloured */}
      <div
        className="absolute -inset-8 rounded-full blur-2xl transition-colors duration-500"
        style={{ background: `radial-gradient(circle, ${glowColor} 0%, rgba(0,0,0,0) 68%)` }}
        aria-hidden
      />
      {/* ground shadow — shrinks & fades while the coin is airborne */}
      <div
        aria-hidden
        className="absolute left-1/2 rounded-[50%]"
        style={{
          width: size * 0.66,
          height: size * 0.12,
          bottom: -size * 0.05,
          marginLeft: -size * 0.33,
          background: 'radial-gradient(ellipse, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 70%)',
          opacity: 0.55,
          animation: flying ? `sexcoin-toss-shadow ${spinMs}ms` : 'none',
          willChange: 'transform, opacity',
        }}
      />
      {/* the throw arc: up, hang, drop, bounce — resting smaller than in flight.
          The parent resets spinMs to 0 on landing, so `animation: none` always
          separates two throws and the keyframes restart cleanly every flip;
          first/last frames equal the base transform below, so there is never a
          jump entering or leaving the animation. */}
      <div
        className="h-full w-full"
        style={{
          transform: 'translateY(0) scale(0.86)',
          animation: flying ? `sexcoin-toss ${spinMs}ms` : 'none',
          willChange: 'transform',
        }}
      >
        <div
          className="relative h-full w-full"
          style={{
            transformStyle: 'preserve-3d',
            transform: `rotateY(${rotation}deg)`,
            transition: spinMs > 0 ? `transform ${spinMs}ms cubic-bezier(0.16, 1, 0.3, 1)` : 'none',
            willChange: 'transform',
          }}
          onTransitionEnd={(e) => {
            if (e.propertyName === 'transform') land();
          }}
        >
          <div className="absolute inset-0 [backface-visibility:hidden]">
            <PenisFace className="h-full w-full" />
          </div>
          <div className="absolute inset-0 [backface-visibility:hidden]" style={{ transform: 'rotateY(180deg)' }}>
            <VaginaFace className="h-full w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
