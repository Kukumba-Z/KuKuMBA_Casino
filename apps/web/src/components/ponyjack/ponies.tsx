import { useId } from 'react';

/**
 * Ponyjack court ponies — hand-drawn SVG portraits of the My Little Pony cast,
 * each a <g> in a 0..100 box (face left, chest running past the bottom edge so
 * card frames can crop it cleanly). Recognisability comes from the canon
 * palette + mane + accessories + cutie mark:
 *
 *   J — Rainbow Dash   (cyan coat, spiky rainbow mane, cloud-and-bolt mark)
 *   Q — Rarity         (white unicorn, curled royal-purple coif, diamonds)
 *   K — Princess Celestia (white alicorn, aurora mane, crown, sun mark)
 *   A — Twilight Sparkle  (lavender unicorn, striped indigo mane, star mark)
 *
 * clipPath ids come from useId() — many cards render at once and SVG ids are
 * global to the document.
 */

/** Shared outline ink (matches the site's dark-ink cartoon style). */
const OUT = '#241a3e';

function Eye({ iris, lashes = false, shadow }: { iris: string; lashes?: boolean; shadow?: string }) {
  return (
    <g>
      {shadow && <path d="M33.4 39.4 q6 -3.2 11.6 -0.4 l0.6 1.6 q-6 -2.8 -12 0.2 Z" fill={shadow} opacity=".9" />}
      <ellipse cx="39" cy="47" rx="6.4" ry="8" fill="#fff" stroke={OUT} strokeWidth="1.6" />
      <circle cx="40" cy="48.5" r="3.7" fill={iris} />
      <circle cx="40" cy="48.5" r="1.7" fill="#160f1e" />
      <circle cx="38.6" cy="46" r="1.2" fill="#fff" />
      <path d="M33 40.5 q6 -3.6 12.4 -0.6" fill="none" stroke={OUT} strokeWidth="1.8" strokeLinecap="round" />
      {lashes && (
        <path d="M33.5 40 l-3 -2.4 M36.5 38.6 l-2 -3 M40.5 38.2 l-0.6 -3.4" stroke={OUT} strokeWidth="1.4" strokeLinecap="round" />
      )}
    </g>
  );
}

function Muzzle({ coat, blushOpacity = 0.35 }: { coat: string; blushOpacity?: number }) {
  return (
    <g>
      <ellipse cx="26" cy="56" rx="12" ry="9.5" fill={coat} stroke={OUT} strokeWidth="2" />
      <circle cx="21" cy="53" r="1.2" fill={OUT} />
      <path d="M17 61 q4.5 3.5 10 1.8" fill="none" stroke={OUT} strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="30" cy="60" r="3.2" fill="#FF8FD0" opacity={blushOpacity} />
    </g>
  );
}

/** Neck + chest; runs past y=100 so card frames crop it without a seam. */
function Chest({ coat }: { coat: string }) {
  return <path d="M34 62 Q28 86 31 112 L79 112 Q83 76 64 60 Z" fill={coat} stroke={OUT} strokeWidth="2.4" strokeLinejoin="round" />;
}

function Head({ coat }: { coat: string }) {
  return <ellipse cx="48" cy="46" rx="24" ry="22" fill={coat} stroke={OUT} strokeWidth="2.4" />;
}

function Ear({ coat, d = 'M60 24 l8 -13 l7 13 z' }: { coat: string; d?: string }) {
  return <path d={d} fill={coat} stroke={OUT} strokeWidth="2" strokeLinejoin="round" />;
}

function Horn({ d, shade, hatch }: { d: string; shade: string; hatch: string }) {
  return (
    <g>
      <path d={d} fill={shade} stroke={OUT} strokeWidth="1.8" strokeLinejoin="round" />
      <path d={hatch} stroke={OUT} strokeWidth="1" opacity=".55" strokeLinecap="round" />
    </g>
  );
}

export function RainbowDash() {
  const id = useId();
  const COAT = '#6ED6FF';
  const backD = 'M62 24 Q90 30 88 62 L70 56 Q82 44 62 34 Z';
  const bangsD =
    'M70 15 Q44 2 24 16 Q12 26 10 44 L20 38 Q19 48 26 52 L31 40 Q33 50 43 52 L42 39 Q52 42 60 36 L52 28 Q64 31 72 25 Z';
  const boltD = 'M6 2 L-2 13 L3 13 L-3 24 L10 11 L5 11 Z';
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <clipPath id={`${id}-b`}>
        <path d={backD} />
      </clipPath>
      <g clipPath={`url(#${id}-b)`}>
        <rect x="58" y="20" width="34" height="8" fill="#E5484D" />
        <rect x="58" y="28" width="34" height="8" fill="#FF9A3D" />
        <rect x="58" y="36" width="34" height="8" fill="#FFD86E" />
        <rect x="58" y="44" width="34" height="8" fill="#59D08C" />
        <rect x="58" y="52" width="34" height="10" fill="#4FB7F0" />
      </g>
      <path d={backD} fill="none" stroke={OUT} strokeWidth="2" />
      <Chest coat={COAT} />
      <Head coat={COAT} />
      <Muzzle coat={COAT} />
      <clipPath id={`${id}-f`}>
        <path d={bangsD} />
      </clipPath>
      <g clipPath={`url(#${id}-f)`}>
        <path d="M74 12 Q44 -2 6 34 L6 42 Q44 6 74 20 Z" fill="#E5484D" />
        <path d="M74 20 Q44 6 6 42 L6 50 Q44 14 74 28 Z" fill="#FF9A3D" />
        <path d="M74 28 Q44 14 6 50 L6 58 Q44 22 74 36 Z" fill="#FFD86E" />
        <path d="M74 36 Q44 22 6 58 L6 66 Q44 30 74 44 Z" fill="#59D08C" />
        <path d="M74 44 Q44 30 6 66 L6 74 Q44 38 74 52 Z" fill="#4FB7F0" />
        <path d="M74 52 Q44 38 6 74 L6 88 Q44 52 74 66 Z" fill="#8E7BF0" />
      </g>
      <path d={bangsD} fill="none" stroke={OUT} strokeWidth="2" />
      <Ear coat={COAT} d="M61 24 l8 -13 l7 15 z" />
      <Eye iris="#E5397E" />
      {/* cutie mark: cloud + tri-colour lightning bolt */}
      <g transform="translate(70 70)">
        <clipPath id={`${id}-m`}>
          <path d={boltD} />
        </clipPath>
        <g clipPath={`url(#${id}-m)`}>
          <rect x="-8" y="0" width="9" height="26" fill="#E5484D" />
          <rect x="1" y="0" width="5" height="26" fill="#FFD86E" />
          <rect x="6" y="0" width="10" height="26" fill="#4FB7F0" />
        </g>
        <path d={boltD} fill="none" stroke={OUT} strokeWidth="1.4" />
        <circle cx="0" cy="0" r="5" fill="#fff" stroke={OUT} strokeWidth="1.2" />
        <circle cx="7" cy="-2" r="4.2" fill="#fff" stroke={OUT} strokeWidth="1.2" />
        <circle cx="13" cy="1" r="3.4" fill="#fff" stroke={OUT} strokeWidth="1.2" />
        <path d="M-4 3 Q6 6 15 3.6" fill="#fff" stroke="none" />
      </g>
    </g>
  );
}

export function Rarity() {
  const COAT = '#F7F2FD';
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {/* back mane cascade with a curl */}
      <path d="M64 22 Q90 32 86 58 Q84 74 66 84 Q76 66 70 52 Q66 42 58 36 Z" fill="#9B6DE8" stroke={OUT} strokeWidth="2" />
      <path d="M66 82 Q58 88 52 84 Q60 80 62 74" fill="#9B6DE8" stroke={OUT} strokeWidth="2" />
      <path d="M70 34 Q80 44 76 60" fill="none" stroke="#7A4FD0" strokeWidth="2" />
      <Chest coat={COAT} />
      <Head coat={COAT} />
      <Muzzle coat={COAT} blushOpacity={0.3} />
      <Ear coat={COAT} />
      <Horn d="M42 27 l4 -21 l9 17 z" shade="#EFE6FB" hatch="M45 18 l8 -2.2 M46.5 12 l6 -1.8" />
      {/* signature glossy comma-curl fringe */}
      <path
        d="M64 18 Q34 2 20 18 Q8 32 20 42 Q32 50 40 40 Q46 32 38 27 Q30 23 27 31 Q25 36 31 38"
        fill="#9B6DE8"
        stroke={OUT}
        strokeWidth="2"
      />
      <path d="M58 16 Q34 8 22 22" fill="none" stroke="#7A4FD0" strokeWidth="2.4" />
      <path d="M20 40 Q30 46 38 38" fill="none" stroke="#7A4FD0" strokeWidth="2" />
      <Eye iris="#58A6FF" lashes shadow="#BFD4F7" />
      {/* cutie mark: three diamonds */}
      <g transform="translate(74 78)" stroke={OUT} strokeWidth="1.2">
        <path d="M0 -7 L5 0 L0 7 L-5 0 Z" fill="#7CC4FF" />
        <path d="M-9 -1 L-5.5 3.5 L-9 8 L-12.5 3.5 Z" fill="#A5D8FF" />
        <path d="M9 -1 L12.5 3.5 L9 8 L5.5 3.5 Z" fill="#A5D8FF" />
        <path d="M0 -7 L5 0 L-5 0 Z" fill="#A5D8FF" stroke="none" opacity=".8" />
      </g>
    </g>
  );
}

export function Celestia() {
  const id = useId();
  const COAT = '#FDFAFF';
  const backD = 'M60 14 Q92 22 90 52 Q88 78 64 88 Q78 66 70 50 Q64 38 54 32 Z';
  const frontD = 'M58 18 Q34 6 20 20 Q10 30 12 44 Q20 34 30 36 Q24 44 30 50 Q36 42 44 42 Q52 42 58 34 Z';
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {/* flowing aurora mane behind */}
      <clipPath id={`${id}-b`}>
        <path d={backD} />
      </clipPath>
      <g clipPath={`url(#${id}-b)`}>
        <path d="M50 10 Q96 18 92 92 L74 92 Q84 30 48 22 Z" fill="#7EE7C7" />
        <path d="M56 16 Q92 26 86 92 L70 92 Q80 36 52 28 Z" fill="#7CC4FF" />
        <path d="M60 24 Q88 34 80 92 L66 92 Q76 42 56 34 Z" fill="#B79CED" />
        <path d="M62 32 Q82 42 74 92 L60 92 Q70 50 58 40 Z" fill="#FF8FD0" />
      </g>
      <path d={backD} fill="none" stroke={OUT} strokeWidth="2" />
      <Chest coat={COAT} />
      {/* gold collar */}
      <path d="M31 92 Q52 82 79 94 L79 104 L31 104 Z" fill="#FFD86E" stroke={OUT} strokeWidth="2" />
      <circle cx="54" cy="92" r="3.2" fill="#B87FE8" stroke={OUT} strokeWidth="1.4" />
      <Head coat={COAT} />
      <Muzzle coat={COAT} blushOpacity={0.3} />
      <Ear coat={COAT} d="M64 27 l7 -11 l6 13 z" />
      <Horn d="M42 27 l5 -25 l10 21 z" shade="#F3EBFC" hatch="M45 16 l9 -2.6 M47 9 l7 -2" />
      {/* crown between horn and ear */}
      <path d="M54 20 l3 -10 l5 6 l5 -8 l4 11 z" fill="#FFD86E" stroke={OUT} strokeWidth="1.8" />
      <circle cx="62" cy="15" r="2" fill="#B87FE8" stroke={OUT} strokeWidth="1" />
      {/* front aurora fringe */}
      <clipPath id={`${id}-f`}>
        <path d={frontD} />
      </clipPath>
      <g clipPath={`url(#${id}-f)`}>
        <path d="M62 12 Q26 2 6 44 L14 52 Q30 14 62 22 Z" fill="#7EE7C7" />
        <path d="M62 22 Q30 14 14 52 L22 58 Q36 24 62 32 Z" fill="#7CC4FF" />
        <path d="M62 32 Q36 24 22 58 L34 64 Q42 34 62 42 Z" fill="#B79CED" />
        <path d="M62 42 Q42 34 34 64 L52 70 Q50 44 62 52 Z" fill="#FF8FD0" />
      </g>
      <path d={frontD} fill="none" stroke={OUT} strokeWidth="2" />
      <Eye iris="#C455D6" lashes />
      {/* cutie mark: the sun */}
      <g transform="translate(78 72)">
        <circle r="4.6" fill="#FFD86E" stroke={OUT} strokeWidth="1.2" />
        <g fill="#FFD86E" stroke={OUT} strokeWidth="1">
          <path d="M0 -10 L2 -5.4 L-2 -5.4 Z" />
          <path d="M0 10 L2 5.4 L-2 5.4 Z" />
          <path d="M-10 0 L-5.4 -2 L-5.4 2 Z" />
          <path d="M10 0 L5.4 -2 L5.4 2 Z" />
          <path d="M-7.1 -7.1 L-3 -5.6 L-5.6 -3 Z" />
          <path d="M7.1 -7.1 L5.6 -3 L3 -5.6 Z" />
          <path d="M-7.1 7.1 L-5.6 3 L-3 5.6 Z" />
          <path d="M7.1 7.1 L3 5.6 L5.6 3 Z" />
        </g>
      </g>
    </g>
  );
}

export function TwilightSparkle() {
  const id = useId();
  const COAT = '#B48CF2';
  const backD = 'M60 18 Q84 26 84 50 L82 88 L64 88 Q70 60 62 40 Q58 30 54 28 Z';
  const frontD = 'M64 16 Q40 4 24 16 Q12 26 12 42 L20 46 Q22 32 30 28 L32 44 L40 46 L40 30 Q50 34 58 30 Z';
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {/* straight back mane with the pink/violet stripe */}
      <clipPath id={`${id}-b`}>
        <path d={backD} />
      </clipPath>
      <g clipPath={`url(#${id}-b)`}>
        <rect x="50" y="10" width="40" height="84" fill="#33285E" />
        <path d="M60 10 L74 10 L78 94 L66 94 Z" fill="#8E5FD8" />
        <path d="M70 10 L78 10 L81 94 L74 94 Z" fill="#FF6FB5" />
      </g>
      <path d={backD} fill="none" stroke={OUT} strokeWidth="2" />
      <Chest coat={COAT} />
      <Head coat={COAT} />
      <Muzzle coat={COAT} blushOpacity={0.35} />
      <Ear coat={COAT} />
      <Horn d="M46 26 l5 -20 l8 17 z" shade={COAT} hatch="M49 18 l7 -2 M51 12 l5 -1.6" />
      {/* blunt striped fringe */}
      <clipPath id={`${id}-f`}>
        <path d={frontD} />
      </clipPath>
      <g clipPath={`url(#${id}-f)`}>
        <rect x="6" y="0" width="70" height="52" fill="#33285E" />
        <path d="M30 2 L44 2 L36 52 L24 52 Z" fill="#FF6FB5" />
        <path d="M44 2 L54 2 L46 52 L36 52 Z" fill="#8E5FD8" />
      </g>
      <path d={frontD} fill="none" stroke={OUT} strokeWidth="2" />
      <Eye iris="#7B4FC9" />
      {/* cutie mark: the big magenta star + sparkles */}
      <g transform="translate(75 77)">
        <path
          d="M0 -9 L2.6 -3 L9 -3 L4 1.4 L6 8 L0 4.2 L-6 8 L-4 1.4 L-9 -3 L-2.6 -3 Z"
          fill="#E64FC4"
          stroke={OUT}
          strokeWidth="1.2"
        />
        <circle cx="9" cy="-8" r="1.4" fill="#fff" />
        <circle cx="-9" cy="-6" r="1.1" fill="#fff" />
        <circle cx="7" cy="9" r="1.1" fill="#fff" />
      </g>
    </g>
  );
}
