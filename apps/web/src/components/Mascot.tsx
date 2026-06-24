/** KuKuMBA mascot — a tiny pastel unicorn head. Pure SVG, no deps. */
export function Mascot({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <defs>
        <linearGradient id="mane" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#B79CED" />
          <stop offset="0.4" stopColor="#7CC4FF" />
          <stop offset="0.7" stopColor="#7EE7C7" />
          <stop offset="1" stopColor="#FF8FD0" />
        </linearGradient>
        <linearGradient id="horn" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFD86E" />
          <stop offset="1" stopColor="#FF8FD0" />
        </linearGradient>
      </defs>
      {/* mane */}
      <path d="M20 16C10 22 8 38 16 50c-10-2-14-16-8-28 3-6 8-8 12-6z" fill="url(#mane)" />
      {/* head */}
      <path
        d="M24 14c10-2 22 4 24 16 1 7-2 16-9 20-8 5-19 3-23-5-5-9-3-26 8-31z"
        fill="#F4ECFF"
      />
      {/* horn */}
      <path d="M30 6l5 12-9-3 4-9z" fill="url(#horn)" />
      {/* cheek */}
      <circle cx="40" cy="36" r="3.4" fill="#FF8FD0" opacity="0.55" />
      {/* eye */}
      <circle cx="34" cy="30" r="3" fill="#241B52" />
      <circle cx="35.2" cy="29" r="1" fill="#fff" />
      {/* nostril */}
      <circle cx="47" cy="40" r="1.4" fill="#C9B6E8" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <Mascot size={34} />
      <span className="font-display text-xl font-extrabold tracking-tight">
        <span className="holo-text">KuKuMBA</span>
      </span>
    </div>
  );
}
