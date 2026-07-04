import { useId } from 'react';
import { Celestia, Rarity, RainbowDash, TwilightSparkle } from './ponies';

/**
 * One Ponyjack playing card (viewBox 100×140, scales with its container).
 * Cards come from the engine as 0..51: rank = card % 13 (0=A … 12=K),
 * suit = ⌊card / 13⌋ (0=♠ 1=♥ 2=♦ 3=♣) — keep in sync with ponyjack.engine.
 *
 * Court cards carry the pony portraits (J = Rainbow Dash, Q = Rarity,
 * K = Celestia) and the ace is a Twilight Sparkle medallion; number cards use
 * classic pip layouts. `card == null` (or `back`) renders the card back — the
 * dealer's hole card is exactly that: the server hasn't revealed it.
 */

export const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const SUIT_RED = '#E5397E';
const SUIT_DARK = '#3A2F63';

const SUIT_PATHS = [
  // ♠
  'M0 -6 C3 -2 6 0 6 3 a4 4 0 0 1 -7 2.6 q1.4 3.4 3 4.4 h-8 q1.6 -1 3 -4.4 a4 4 0 0 1 -7 -2.6 c0 -3 3 -5 6 -9 Z',
  // ♥
  'M0,4.8 C-1.2,1.6 -6.4,-0.8 -6.4,-4 C-6.4,-6.4 -4.4,-8 -2.4,-8 C-1,-8 0,-7.2 0,-6 C0,-7.2 1,-8 2.4,-8 C4.4,-8 6.4,-6.4 6.4,-4 C6.4,-0.8 1.2,1.6 0,4.8 Z',
  // ♦
  'M0 -7 L5.2 0 L0 7 L-5.2 0 Z',
  // ♣
  'M0 -7.6 a3.4 3.4 0 0 1 3.3 4.4 a3.4 3.4 0 1 1 -2 6 q1 2.8 2.6 3.8 h-7.8 q1.6 -1 2.6 -3.8 a3.4 3.4 0 1 1 -2 -6 a3.4 3.4 0 0 1 3.3 -4.4 Z',
];

export const suitColor = (suit: number) => (suit === 1 || suit === 2 ? SUIT_RED : SUIT_DARK);

function Pip({ suit, x, y, scale = 1 }: { suit: number; x: number; y: number; scale?: number }) {
  return <path d={SUIT_PATHS[suit]} fill={suitColor(suit)} transform={`translate(${x} ${y}) scale(${scale})`} />;
}

/** Classic pip layouts for 2..10 (rank index 1..9). */
const L = 34;
const R = 66;
const C = 50;
const PIP_LAYOUT: Record<number, [number, number][]> = {
  1: [[C, 44], [C, 96]],
  2: [[C, 40], [C, 70], [C, 100]],
  3: [[L, 44], [R, 44], [L, 96], [R, 96]],
  4: [[L, 44], [R, 44], [C, 70], [L, 96], [R, 96]],
  5: [[L, 40], [R, 40], [L, 70], [R, 70], [L, 100], [R, 100]],
  6: [[L, 40], [R, 40], [C, 55], [L, 70], [R, 70], [L, 100], [R, 100]],
  7: [[L, 40], [R, 40], [C, 55], [L, 70], [R, 70], [C, 85], [L, 100], [R, 100]],
  8: [[L, 38], [R, 38], [C, 48.5], [L, 58.7], [R, 58.7], [L, 79.3], [R, 79.3], [L, 100], [R, 100]],
  9: [[L, 38], [R, 38], [C, 48.5], [L, 58.7], [R, 58.7], [C, 89.5], [L, 79.3], [R, 79.3], [L, 100], [R, 100]],
};

function Corner({ rank, suit }: { rank: number; suit: number }) {
  const label = RANK_LABELS[rank];
  return (
    <g fill={suitColor(suit)}>
      <text
        x={label === '10' ? 3.5 : 7}
        y="20"
        fontFamily="Unbounded, system-ui, sans-serif"
        fontWeight="900"
        fontSize={label === '10' ? 12 : 14}
      >
        {label}
      </text>
      <Pip suit={suit} x={13} y={30} scale={0.62} />
    </g>
  );
}

function CourtPony({ rank }: { rank: number }) {
  if (rank === 10) return <RainbowDash />;
  if (rank === 11) return <Rarity />;
  return <Celestia />;
}

function CardBack() {
  const id = useId();
  return (
    <>
      <rect x="1.5" y="1.5" width="97" height="137" rx="10" fill="#1B1640" stroke="#4A3D80" strokeWidth="2" />
      <defs>
        <linearGradient id={`${id}-holo`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#B79CED" />
          <stop offset=".3" stopColor="#7CC4FF" />
          <stop offset=".55" stopColor="#7EE7C7" />
          <stop offset=".8" stopColor="#FFD86E" />
          <stop offset="1" stopColor="#FF8FD0" />
        </linearGradient>
        <pattern id={`${id}-star`} width="18" height="18" patternUnits="userSpaceOnUse">
          <path d="M9 3 l1.4 3.2 3.4 .4 -2.5 2.3 .7 3.4 -3 -1.7 -3 1.7 .7 -3.4 -2.5 -2.3 3.4 -.4 Z" fill="#5E4BA0" opacity=".5" />
        </pattern>
      </defs>
      <rect x="8" y="8" width="84" height="124" rx="7" fill={`url(#${id}-star)`} stroke="#6C5BB0" strokeWidth="1.6" />
      {/* lucky horseshoe emblem */}
      <g transform="translate(50 70)">
        <circle r="21" fill="#241B52" stroke="#6C5BB0" strokeWidth="1.5" />
        <path
          d="M-11 12 A 14.5 14.5 0 1 1 11 12 L 6.5 12 A 9.5 9.5 0 1 0 -6.5 12 Z"
          fill={`url(#${id}-holo)`}
          stroke="#160f1e"
          strokeWidth="1.6"
        />
        <path d="M9 -13 l2 -2.4 M12.6 -7.6 l2.8 -1.4 M-9 -13 l-2 -2.4 M-12.6 -7.6 l-2.8 -1.4" stroke="#FFD86E" strokeWidth="1.6" strokeLinecap="round" />
      </g>
    </>
  );
}

function CardFace({ card }: { card: number }) {
  const id = useId();
  const rank = card % 13;
  const suit = Math.floor(card / 13);
  const court = rank >= 10;
  const ace = rank === 0;
  return (
    <>
      <rect x="1.5" y="1.5" width="97" height="137" rx="10" fill="#FBF9FF" stroke="#CDC3E8" strokeWidth="2" />
      <Corner rank={rank} suit={suit} />
      <g transform="rotate(180 50 70)">
        <Corner rank={rank} suit={suit} />
      </g>

      {court && (
        <g>
          <clipPath id={`${id}-frame`}>
            <rect x="22" y="24" width="56" height="92" rx="8" />
          </clipPath>
          <rect x="22" y="24" width="56" height="92" rx="8" fill="#F2ECFC" stroke="#D9CDF2" strokeWidth="1.5" />
          <Pip suit={suit} x={50} y={33} scale={0.55} />
          <g clipPath={`url(#${id}-frame)`}>
            <g transform="translate(12 42) scale(.75)">
              <CourtPony rank={rank} />
            </g>
          </g>
          <rect x="22" y="24" width="56" height="92" rx="8" fill="none" stroke="#D9CDF2" strokeWidth="1.5" />
        </g>
      )}

      {ace && (
        <g>
          <clipPath id={`${id}-med`}>
            <circle cx="50" cy="70" r="33" />
          </clipPath>
          <circle cx="50" cy="70" r="33" fill="#F2ECFC" stroke="#D9CDF2" strokeWidth="1.5" />
          <g clipPath={`url(#${id}-med)`}>
            <g transform="translate(15 37) scale(.72)">
              <TwilightSparkle />
            </g>
          </g>
          <circle cx="50" cy="70" r="33" fill="none" stroke="#D9CDF2" strokeWidth="1.5" />
          <path d="M26 32 l1.6 3.6 3.8 .5 -2.8 2.6 .8 3.8 -3.4 -1.9 -3.4 1.9 .8 -3.8 -2.8 -2.6 3.8 -.5 Z" fill="#B79CED" opacity=".85" />
          <path d="M76 100 l1.3 2.9 3.1 .4 -2.3 2.1 .6 3.1 -2.7 -1.5 -2.7 1.5 .6 -3.1 -2.3 -2.1 3.1 -.4 Z" fill="#FF8FD0" opacity=".85" />
        </g>
      )}

      {!court && !ace && PIP_LAYOUT[rank].map(([x, y], i) => <Pip key={i} suit={suit} x={x} y={y} />)}
    </>
  );
}

export function PlayingCard({ card, className = '' }: { card?: number | null; className?: string }) {
  return (
    <svg viewBox="0 0 100 140" className={className} role="img" aria-hidden>
      {card == null ? <CardBack /> : <CardFace card={card} />}
    </svg>
  );
}
