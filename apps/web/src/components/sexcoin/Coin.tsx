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
 * The edge is a pseudo-гурт: a thin slab rotated 90° around Y whose repeating
 * linear-gradient reads as reeding whenever the coin passes edge-on.
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

  const glowColor =
    glow === 'win'
      ? 'rgba(126,231,199,0.4)'
      : glow === 'lose'
        ? 'rgba(229,72,77,0.38)'
        : 'rgba(255,216,110,0.22)';

  const thickness = Math.max(8, size * 0.055);

  return (
    <div className={`relative ${className ?? ''}`} style={{ width: size, height: size, perspective: size * 5 }}>
      {/* soft radial glow behind the coin — warm at rest, verdict-coloured */}
      <div
        className="absolute -inset-8 rounded-full blur-2xl transition-colors duration-500"
        style={{ background: `radial-gradient(circle, ${glowColor} 0%, rgba(0,0,0,0) 68%)` }}
        aria-hidden
      />
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
        {/* pseudo-гурт: a reeded slab visible when the coin passes edge-on */}
        <div
          aria-hidden
          className="absolute top-0 h-full rounded-[2px]"
          style={{
            width: thickness,
            left: `calc(50% - ${thickness / 2}px)`,
            transform: 'rotateY(90deg)',
            background:
              'repeating-linear-gradient(180deg, #c9a044 0 3px, #8a6a1e 3px 6px)',
            boxShadow: 'inset 0 0 6px rgba(0,0,0,0.5)',
          }}
        />
        <div className="absolute inset-0 [backface-visibility:hidden]">
          <PenisFace className="h-full w-full drop-shadow-[0_10px_24px_rgba(0,0,0,0.45)]" />
        </div>
        <div className="absolute inset-0 [backface-visibility:hidden]" style={{ transform: 'rotateY(180deg)' }}>
          <VaginaFace className="h-full w-full drop-shadow-[0_10px_24px_rgba(0,0,0,0.45)]" />
        </div>
      </div>
    </div>
  );
}
