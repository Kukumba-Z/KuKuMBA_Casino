import { useId } from 'react';

/**
 * Sexcoin coin faces — inline SVG only (no binary assets, design rule). Both
 * faces read as embossed metal: a reeded outer ring (гурт), a radial metal
 * gradient with the light falling from the top-left, an inner bevel and an
 * edge vignette. The relief itself is layered vector art — base silhouette
 * drop-shadowed onto the field, gradient body, half-tone shading and blurred
 * highlights — the same "pseudo-volume from stacked paths" technique as the
 * other bespoke card arts, pushed further.
 *
 *  - PenisFace ("heads"): a gold coin (sun palette) with a flesh-tone relief.
 *  - VaginaFace ("tails"): a rose/lavender coin (bubble/lav palette).
 *
 * Gradient ids are namespaced via useId so any number of faces can coexist on
 * one page (the big coin, the side-pick buttons, the lobby card).
 */

/** Shared coin body: rim, reeding, inner field, bevel highlight, vignette. */
function CoinBlank({
  id,
  children,
}: {
  id: (s: string) => string;
  children?: React.ReactNode;
}) {
  return (
    <>
      {/* outer disc + rim */}
      <circle cx="100" cy="100" r="98" fill={`url(#${id('metal')})`} />
      {/* reeded edge — the notched гурт ring */}
      <circle
        cx="100"
        cy="100"
        r="93.5"
        fill="none"
        stroke={`url(#${id('reed')})`}
        strokeWidth="7"
        strokeDasharray="2.6 3.4"
        opacity="0.85"
      />
      {/* inner field: a slightly deeper tone + a crisp bevel line */}
      <circle cx="100" cy="100" r="82" fill={`url(#${id('metal')})`} />
      <circle cx="100" cy="100" r="82" fill={`url(#${id('field')})`} />
      <circle cx="100" cy="100" r="82" fill="none" stroke="rgba(60,25,10,0.35)" strokeWidth="1.4" />
      {/* bevel highlight arc (light from the top-left) */}
      <path
        d="M38 66 A72 72 0 0 1 118 31"
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="2.6"
        strokeLinecap="round"
        filter={`url(#${id('soft')})`}
      />
      {/* lower-right inner shade closes the bevel illusion */}
      <path
        d="M164 128 A72 72 0 0 1 90 170"
        fill="none"
        stroke="rgba(30,10,20,0.35)"
        strokeWidth="3"
        strokeLinecap="round"
        filter={`url(#${id('soft')})`}
      />
      {children}
      {/* edge vignette on top of everything */}
      <circle cx="100" cy="100" r="98" fill={`url(#${id('vig')})`} />
      {/* one broad top-left sheen so the metal catches the light */}
      <ellipse cx="72" cy="58" rx="52" ry="34" fill="rgba(255,255,255,0.14)" filter={`url(#${id('blur3')})`} />
    </>
  );
}

/** Tiny diamond notches around the inner ring — the coin's "legend". */
function LegendNotches({ color }: { color: string }) {
  return (
    <g fill={color} opacity="0.55">
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const x = 100 + Math.cos(a) * 88;
        const y = 100 + Math.sin(a) * 88;
        return <path key={i} d={`M${x} ${y - 2.6} L${x + 2} ${y} L${x} ${y + 2.6} L${x - 2} ${y} Z`} />;
      })}
    </g>
  );
}

/* Relief path data (viewBox 200×200, figure centred) — shared between the
 * shadow pass and the painted pass so the two always match. */
const P_SHAFT = 'M86 128 C83 108 85 86 90 64 L110 64 C115 86 117 108 114 128 C106 121 94 121 86 128 Z';
const P_GLANS = 'M84 73 C83 54 91 41 100 37 C109 41 117 54 116 73 C110 68 105 66 100 66 C95 66 90 68 84 73 Z';
const P_BALL_L = 'M85 121 C71 124 64 136 66 147 C68 158 78 164 89 162 C99 160 105 150 103 139 C101 128 95 119 85 121 Z';
const P_BALL_R = 'M115 121 C129 124 136 136 134 147 C132 158 122 164 111 162 C101 160 95 150 97 139 C99 128 105 119 115 121 Z';

/** «Орёл» — the gold face with the embossed phallus relief. */
export function PenisFace({ className }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (s: string) => `pfc-${s}-${uid}`;
  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-hidden>
      <defs>
        <radialGradient id={id('metal')} cx="0.35" cy="0.28" r="1">
          <stop offset="0" stopColor="#FFEDB0" />
          <stop offset="0.42" stopColor="#FFD86E" />
          <stop offset="0.78" stopColor="#DCA843" />
          <stop offset="1" stopColor="#9E7220" />
        </radialGradient>
        <radialGradient id={id('field')} cx="0.5" cy="0.5" r="0.62">
          <stop offset="0.75" stopColor="rgba(140,90,20,0)" />
          <stop offset="1" stopColor="rgba(140,90,20,0.28)" />
        </radialGradient>
        <linearGradient id={id('reed')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#B98A2E" />
          <stop offset="1" stopColor="#7A5314" />
        </linearGradient>
        <radialGradient id={id('vig')} cx="0.5" cy="0.5" r="0.72">
          <stop offset="0.72" stopColor="rgba(0,0,0,0)" />
          <stop offset="1" stopColor="rgba(40,20,0,0.4)" />
        </radialGradient>
        {/* flesh tones (same family as the crash character's skin) */}
        <linearGradient id={id('flesh')} x1="0" y1="0" x2="1" y2="0.25">
          <stop offset="0" stopColor="#F9DDB8" />
          <stop offset="0.5" stopColor="#F2C9A0" />
          <stop offset="1" stopColor="#DFA070" />
        </linearGradient>
        <radialGradient id={id('glans')} cx="0.42" cy="0.32" r="0.95">
          <stop offset="0" stopColor="#F2B08C" />
          <stop offset="0.6" stopColor="#E8906E" />
          <stop offset="1" stopColor="#D1755A" />
        </radialGradient>
        <radialGradient id={id('ball')} cx="0.38" cy="0.32" r="0.95">
          <stop offset="0" stopColor="#F6D2A8" />
          <stop offset="0.65" stopColor="#EDBB8B" />
          <stop offset="1" stopColor="#D69A67" />
        </radialGradient>
        <filter id={id('soft')} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
        <filter id={id('blur3')} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <filter id={id('relief')} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>

      <CoinBlank id={id}>
        <LegendNotches color="#8A5F19" />

        {/* cast shadow — the whole silhouette pressed into the coin */}
        <g fill="rgba(70,35,5,0.4)" filter={`url(#${id('relief')})`} transform="translate(3.6 4.4)">
          <path d={P_BALL_L} />
          <path d={P_BALL_R} />
          <path d={P_SHAFT} />
          <path d={P_GLANS} />
        </g>

        {/* ── the relief itself ── */}
        {/* testicles */}
        <path d={P_BALL_L} fill={`url(#${id('ball')})`} />
        <path d={P_BALL_R} fill={`url(#${id('ball')})`} />
        {/* central raphe crease between them */}
        <path d="M100 126 C98 136 98 148 100 158" fill="none" stroke="rgba(150,85,40,0.5)" strokeWidth="2.2" strokeLinecap="round" filter={`url(#${id('soft')})`} />
        {/* under-shade where the shaft overlaps them */}
        <path d="M86 127 C94 121 106 121 114 127" fill="none" stroke="rgba(140,70,30,0.4)" strokeWidth="5" strokeLinecap="round" filter={`url(#${id('relief')})`} />

        {/* shaft */}
        <path d={P_SHAFT} fill={`url(#${id('flesh')})`} />
        {/* right-side half-tone (form shadow) */}
        <path d="M110 122 C113 106 113 88 108 74" fill="none" stroke="rgba(160,80,40,0.4)" strokeWidth="5.5" strokeLinecap="round" filter={`url(#${id('relief')})`} />
        {/* left-side blurred highlight */}
        <path d="M90 120 C87 104 88 88 93 75" fill="none" stroke="rgba(255,244,220,0.6)" strokeWidth="3.4" strokeLinecap="round" filter={`url(#${id('soft')})`} />
        {/* a subtle vein for the pseudo-realistic volume */}
        <path d="M97 120 C93 108 99 96 95 84" fill="none" stroke="rgba(190,110,80,0.45)" strokeWidth="1.9" strokeLinecap="round" filter={`url(#${id('soft')})`} />

        {/* glans */}
        <path d={P_GLANS} fill={`url(#${id('glans')})`} />
        {/* corona ridge shadow where the helmet meets the shaft */}
        <path d="M85 73 Q100 79 115 73" fill="none" stroke="rgba(150,60,40,0.5)" strokeWidth="2.8" strokeLinecap="round" filter={`url(#${id('soft')})`} />
        {/* meatus */}
        <path d="M100 44 L100 52" stroke="rgba(140,55,35,0.6)" strokeWidth="2" strokeLinecap="round" />
        {/* glans highlight */}
        <ellipse cx="94" cy="50" rx="4.6" ry="7.5" fill="rgba(255,235,220,0.5)" filter={`url(#${id('soft')})`} />
        {/* testicle highlights */}
        <ellipse cx="78" cy="136" rx="5" ry="7" fill="rgba(255,240,215,0.4)" filter={`url(#${id('soft')})`} />
        <ellipse cx="108" cy="136" rx="4" ry="6" fill="rgba(255,240,215,0.3)" filter={`url(#${id('soft')})`} />

        {/* sparkles — the coin catches the light */}
        <path d="M146 60 l2.2 5 5 2.2 -5 2.2 -2.2 5 -2.2 -5 -5 -2.2 5 -2.2 Z" fill="rgba(255,250,220,0.8)" />
        <path d="M52 130 l1.6 3.6 3.6 1.6 -3.6 1.6 -1.6 3.6 -1.6 -3.6 -3.6 -1.6 3.6 -1.6 Z" fill="rgba(255,250,220,0.6)" />
      </CoinBlank>
    </svg>
  );
}

/* Vulva relief path data. */
const P_MONS = 'M100 46 C77 68 67 96 71 122 C75 147 87 160 100 163 C113 160 125 147 129 122 C133 96 123 68 100 46 Z';
const P_INNER = 'M100 64 C90 82 86 105 90 128 C93 143 96 150 100 155 C104 150 107 143 110 128 C114 105 110 82 100 64 Z';
const P_HOOD = 'M100 60 C95 66 93.5 73 95.5 79 C97 83.5 99 86 100 87 C101 86 103 83.5 104.5 79 C106.5 73 105 66 100 60 Z';

/** «Решка» — the rose/lavender face with the embossed vulva relief. */
export function VaginaFace({ className }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (s: string) => `vfc-${s}-${uid}`;
  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-hidden>
      <defs>
        <radialGradient id={id('metal')} cx="0.35" cy="0.28" r="1">
          <stop offset="0" stopColor="#FFD9EE" />
          <stop offset="0.42" stopColor="#FF8FD0" />
          <stop offset="0.78" stopColor="#C963A5" />
          <stop offset="1" stopColor="#83396C" />
        </radialGradient>
        <radialGradient id={id('field')} cx="0.5" cy="0.5" r="0.62">
          <stop offset="0.75" stopColor="rgba(120,40,90,0)" />
          <stop offset="1" stopColor="rgba(120,40,90,0.3)" />
        </radialGradient>
        <linearGradient id={id('reed')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#B15A93" />
          <stop offset="1" stopColor="#6B2C58" />
        </linearGradient>
        <radialGradient id={id('vig')} cx="0.5" cy="0.5" r="0.72">
          <stop offset="0.72" stopColor="rgba(0,0,0,0)" />
          <stop offset="1" stopColor="rgba(40,0,30,0.42)" />
        </radialGradient>
        {/* rose flesh + lavender half-tones (bubble/lav palette) */}
        <linearGradient id={id('outer')} x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0" stopColor="#F7C4DC" />
          <stop offset="0.5" stopColor="#F0A8C9" />
          <stop offset="1" stopColor="#CE7BAC" />
        </linearGradient>
        <linearGradient id={id('inner')} x1="0" y1="0" x2="1" y2="0.2">
          <stop offset="0" stopColor="#EC9FC2" />
          <stop offset="0.55" stopColor="#DD7FA9" />
          <stop offset="1" stopColor="#B85587" />
        </linearGradient>
        <radialGradient id={id('hood')} cx="0.4" cy="0.3" r="1">
          <stop offset="0" stopColor="#E893B8" />
          <stop offset="1" stopColor="#C05E8F" />
        </radialGradient>
        <filter id={id('soft')} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
        <filter id={id('blur3')} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <filter id={id('relief')} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>

      <CoinBlank id={id}>
        <LegendNotches color="#7C3564" />

        {/* cast shadow of the whole relief */}
        <g fill="rgba(90,20,60,0.42)" filter={`url(#${id('relief')})`} transform="translate(3.6 4.4)">
          <path d={P_MONS} />
        </g>

        {/* ── the relief itself ── */}
        {/* outer labia — the broad almond */}
        <path d={P_MONS} fill={`url(#${id('outer')})`} />
        {/* outer creases: soft folds either side */}
        <path d="M92 62 C82 84 79 108 85 134 C88 146 93 154 97 158" fill="none" stroke="rgba(150,60,110,0.42)" strokeWidth="4.5" strokeLinecap="round" filter={`url(#${id('relief')})`} />
        <path d="M108 62 C118 84 121 108 115 134 C112 146 107 154 103 158" fill="none" stroke="rgba(150,60,110,0.42)" strokeWidth="4.5" strokeLinecap="round" filter={`url(#${id('relief')})`} />
        {/* top-left mons highlight */}
        <path d="M90 60 C82 74 78 90 79 106" fill="none" stroke="rgba(255,235,246,0.55)" strokeWidth="3.4" strokeLinecap="round" filter={`url(#${id('soft')})`} />

        {/* inner labia — the nested almond */}
        <path d={P_INNER} fill={`url(#${id('inner')})`} />
        {/* right form shadow + left highlight on the inner petals */}
        <path d="M107 82 C110 100 109 122 104 142" fill="none" stroke="rgba(140,45,95,0.45)" strokeWidth="4" strokeLinecap="round" filter={`url(#${id('relief')})`} />
        <path d="M94 84 C91 102 92 122 96 140" fill="none" stroke="rgba(255,230,242,0.5)" strokeWidth="2.6" strokeLinecap="round" filter={`url(#${id('soft')})`} />

        {/* clitoral hood + clitoris */}
        <path d={P_HOOD} fill={`url(#${id('hood')})`} />
        <circle cx="100" cy="80" r="2.7" fill="#A43C71" />
        <circle cx="99" cy="79" r="1" fill="rgba(255,220,236,0.7)" />

        {/* the central cleft */}
        <path d="M100 88 C99.4 106 99.4 126 100 148" fill="none" stroke="rgba(130,35,85,0.75)" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M100 88 C99.4 106 99.4 126 100 148" fill="none" stroke="rgba(80,15,50,0.35)" strokeWidth="5" strokeLinecap="round" filter={`url(#${id('relief')})`} />

        {/* sparkles in lav */}
        <path d="M148 64 l2.2 5 5 2.2 -5 2.2 -2.2 5 -2.2 -5 -5 -2.2 5 -2.2 Z" fill="rgba(233,222,255,0.85)" />
        <path d="M54 128 l1.6 3.6 3.6 1.6 -3.6 1.6 -1.6 3.6 -1.6 -3.6 -3.6 -1.6 3.6 -1.6 Z" fill="rgba(233,222,255,0.6)" />
      </CoinBlank>
    </svg>
  );
}
