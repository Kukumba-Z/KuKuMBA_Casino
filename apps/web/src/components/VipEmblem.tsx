import type { ReactNode } from 'react';

/**
 * Hand-drawn SVG emblems of the VIP ladder (My Little Pony cutie-mark style).
 * The DB stores an icon KEY (`VipLevel.icon`); this registry maps it to vector
 * art so emblems render crisply at any size and inherit the rank colour via
 * `currentColor` — no emoji, no platform differences. Adding a new emblem is
 * one entry here + its key in the seed/admin.
 *
 * All glyphs share a 24×24 viewBox and the stroke style set on the <svg> root;
 * solid details opt in with fill="currentColor" / stroke="none".
 */
const GLYPHS: Record<string, ReactNode> = {
  // 0 · Foal — a lucky horseshoe
  horseshoe: (
    <>
      <path d="M6.5 20.5c-3-5.5-3.5-11 0-14.5C8 4.5 10 3.8 12 3.8s4 .7 5.5 2.2c3.5 3.5 3 9 0 14.5" />
      <path d="M4.5 20.5h4M15.5 20.5h4" />
    </>
  ),
  // 1 · Apple Bloom — an apple
  apple: (
    <>
      <path d="M12 7.5C9.5 5.8 5 6.7 4.5 11c-.4 3.8 2.5 8.6 5.5 9.6 1 .3 3 .3 4 0 3-1 5.9-5.8 5.5-9.6C19 6.7 14.5 5.8 12 7.5z" />
      <path d="M12 7.5V4.5" />
      <path d="M12 4.8c1.6-2 3.8-2.3 5-1.5-.7 1.9-2.9 2.9-5 1.5z" fill="currentColor" stroke="none" />
    </>
  ),
  // 2 · Sweetie Belle — a bell
  bell: (
    <>
      <path d="M12 3.5a1.4 1.4 0 0 1 1.4 1.4v.5A6.2 6.2 0 0 1 18 11.5v3.6l1.8 2.7H4.2L6 15.1v-3.6a6.2 6.2 0 0 1 4.6-6.1v-.5A1.4 1.4 0 0 1 12 3.5z" />
      <circle cx="12" cy="20.3" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  // 3 · Scootaloo — a kick scooter
  scooter: (
    <>
      <circle cx="6.3" cy="18.3" r="2.2" />
      <circle cx="17.7" cy="18.3" r="2.2" />
      <path d="M8.5 18.3h5M13.5 18.3l3.4-11.6M14.5 6.7h4.8" />
    </>
  ),
  // 4 · Bon Bon — a wrapped candy
  candy: (
    <>
      <ellipse cx="12" cy="12" rx="4.6" ry="3.6" />
      <path d="M7.4 12L3.6 9.3c-.4 1.8-.4 3.6 0 5.4L7.4 12z" fill="currentColor" stroke="none" />
      <path d="M16.6 12l3.8-2.7c.4 1.8.4 3.6 0 5.4L16.6 12z" fill="currentColor" stroke="none" />
    </>
  ),
  // 5 · Lyra Heartstrings — a lyre
  lyre: (
    <>
      <path d="M7 4c-2 5.5-1.8 10 .8 15M17 4c2 5.5 1.8 10-.8 15" />
      <path d="M7.4 8.5h9.2M8.2 19h7.6" />
      <path d="M10 8.5V19M12 8.5V19M14 8.5V19" strokeWidth="1.2" />
    </>
  ),
  // 6 · Derpy Hooves — her bubbles cutie mark
  bubbles: (
    <>
      <circle cx="9" cy="8.5" r="4" />
      <circle cx="16.8" cy="13.5" r="2.6" />
      <circle cx="10.5" cy="17.8" r="1.8" />
    </>
  ),
  // 7 · DJ Pon-3 — headphones
  headphones: (
    <>
      <path d="M4.5 15.5v-3a7.5 7.5 0 0 1 15 0v3" />
      <rect x="3.4" y="14" width="4" height="6" rx="1.6" fill="currentColor" stroke="none" />
      <rect x="16.6" y="14" width="4" height="6" rx="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  // 8 · Octavia Melody — beamed music notes
  notes: (
    <>
      <path d="M9.3 16.5V6.8L17.3 4.6v9.7" />
      <ellipse cx="7.4" cy="16.7" rx="2" ry="1.5" fill="currentColor" stroke="none" />
      <ellipse cx="15.4" cy="14.5" rx="2" ry="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  // 9 · Big McIntosh — a cut apple half
  'apple-half': (
    <>
      <path d="M12 5.5v15" />
      <path d="M12 5.5a7.5 7.5 0 0 1 0 15" />
      <path d="M12 5.5C8 5.5 4.5 8.8 4.5 13s3.5 7.5 7.5 7.5" strokeDasharray="1.5 2.6" strokeWidth="1.3" />
      <ellipse cx="15.2" cy="12.9" rx="1" ry="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  // 10 · Spitfire — a Wonderbolts flame
  flame: (
    <>
      <path d="M12 3.2c.6 3.8-3.8 6-3.8 10.3a5.3 5.3 0 0 0 10.6.3c.2-3-1.6-4.7-2.6-6.5-.7 1.5-1.5 2.1-2.6 2.3.6-2 .3-4.3-1.6-6.4z" />
      <path d="M12 20.5c-1.6-.6-2.4-2.3-1.7-3.9.5-1.2 1.3-1.7 1.7-3 .4 1.3 1.2 1.8 1.7 3 .7 1.6-.1 3.3-1.7 3.9z" fill="currentColor" stroke="none" />
    </>
  ),
  // 11 · Trixie — the Great and Powerful wizard hat
  'wizard-hat': (
    <>
      <path d="M12 3.2L7.4 15.2M12 3.2l4.6 12" />
      <path d="M4 16.8c0 1.3 3.6 2.3 8 2.3s8-1 8-2.3-3.6-2.3-8-2.3-8 1-8 2.3z" />
      <path d="M12 8.2l.7 1.5 1.6.2-1.2 1.1.3 1.6-1.4-.8-1.4.8.3-1.6-1.2-1.1 1.6-.2z" fill="currentColor" stroke="none" />
    </>
  ),
  // 12 · Starlight Glimmer — a big sparkle with satellites
  sparkle: (
    <>
      <path d="M12 4.2l1.7 5.6 5.6 1.7-5.6 1.7-1.7 5.6-1.7-5.6-5.6-1.7 5.6-1.7z" fill="currentColor" stroke="none" />
      <circle cx="18.6" cy="5.2" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="5.6" cy="18.6" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  // 13 · Applejack — a cowboy hat
  'cowboy-hat': (
    <>
      <path d="M8.2 13.8V9.6c0-2.1 1.6-3.8 3.8-3.8s3.8 1.7 3.8 3.8v4.2" />
      <path d="M3.4 14.2c2.2 2.4 15 2.4 17.2 0-1 2.4-4 3.8-8.6 3.8s-7.6-1.4-8.6-3.8z" />
    </>
  ),
  // 14 · Pinkie Pie — a party balloon
  balloon: (
    <>
      <ellipse cx="12" cy="9.4" rx="5.2" ry="6.2" />
      <path d="M10.8 15.9h2.4L12 17.8z" fill="currentColor" stroke="none" />
      <path d="M12 17.8c-1.8 1.4 1.8 2.4-.6 4.2" />
    </>
  ),
  // 15 · Fluttershy — a butterfly
  butterfly: (
    <>
      <path d="M12 8.5v9.5" />
      <path d="M11 7.8L9.2 5M13 7.8L14.8 5" />
      <path d="M11.5 11.5C9 6.5 3.6 7.2 4.4 11.6c.6 3.4 4.4 4.5 7.1 2.4" />
      <path d="M12.5 11.5c2.5-5 7.9-4.3 7.1.1-.6 3.4-4.4 4.5-7.1 2.4" />
    </>
  ),
  // 16 · Rarity — a faceted gem
  gem: (
    <>
      <path d="M7.2 4.5h9.6l3.7 4.8L12 20.5 3.5 9.3z" />
      <path d="M3.5 9.3h17M7.2 4.5L12 9.3l4.8-4.8M12 9.3v11.2" strokeWidth="1.2" />
    </>
  ),
  // 17 · Rainbow Dash — her lightning bolt
  bolt: (
    <path d="M13.4 3.2L5.4 13.6h4.6L8.2 20.8l8.4-10.9h-4.7l1.5-6.7z" fill="currentColor" stroke="none" />
  ),
  // 18 · Twilight Sparkle — her six-pointed star
  star6: (
    <>
      <path d="M12 3.4l7.4 12.9H4.6z" />
      <path d="M12 20.6L4.6 7.7h14.8z" />
    </>
  ),
  // 19 · Princess Luna — a crescent moon
  moon: (
    <path d="M19.8 14.7A8.6 8.6 0 1 1 9.3 4.2a7 7 0 1 0 10.5 10.5z" fill="currentColor" stroke="none" />
  ),
  // 20 · Princess Celestia — the sun
  sun: (
    <>
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7" />
    </>
  ),
};

/** Emblem keys available for VipLevel.icon (exported for admin tooling/tests). */
export const VIP_EMBLEM_KEYS = Object.keys(GLYPHS);

export function VipEmblem({
  icon,
  color,
  size = 14,
  className = '',
  title,
}: {
  icon?: string | null;
  /** Rank colour; omit to inherit the surrounding text colour. */
  color?: string | null;
  size?: number;
  className?: string;
  title?: string;
}) {
  if (!icon) return null;
  // Unknown key (e.g. a custom level an admin typo'd) falls back to a sparkle.
  const glyph = GLYPHS[icon] ?? GLYPHS.sparkle;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`inline-block shrink-0 align-[-0.12em] ${className}`}
      style={color ? { color } : undefined}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {glyph}
    </svg>
  );
}
