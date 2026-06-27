import { CircleDot, Dices, Gamepad2, Gem, Radio, ShieldCheck, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Game } from '../lib/hooks';

/** Per-category visual identity (icon + gradient accent for the thumbnail). */
const CATEGORY: Record<string, { icon: LucideIcon; grad: string; labelKey: string }> = {
  ROULETTE: { icon: CircleDot, grad: 'from-roul-red/30 to-lav/30', labelKey: 'games.catRoulette' },
  SLOTS: { icon: Gem, grad: 'from-sun/30 to-bubble/30', labelKey: 'games.catSlots' },
  LIVE: { icon: Radio, grad: 'from-mint/30 to-sky/30', labelKey: 'games.catLive' },
  MINIGAME: { icon: Dices, grad: 'from-sky/30 to-lav/30', labelKey: 'games.catMinigame' },
};
const FALLBACK = { icon: Gamepad2, grad: 'from-white/10 to-white/5', labelKey: 'games.catOther' };

export function categoryMeta(category: string) {
  return CATEGORY[category] ?? FALLBACK;
}

export function GameCard({ game }: { game: Game }) {
  const { t } = useTranslation();
  const meta = categoryMeta(game.category);
  const Icon = meta.icon;
  const live = game.status === 'LIVE' && !!game.route;

  const inner = (
    <div
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition ${
        live ? 'hover:border-white/25 hover:shadow-glow' : ''
      }`}
    >
      {/* thumbnail */}
      <div className={`relative aspect-[4/3] w-full bg-gradient-to-br ${meta.grad}`}>
        {game.thumbnail ? (
          <img src={game.thumbnail} alt={game.name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <Icon size={40} className="text-white/70" />
          </div>
        )}
        {/* RTP badge */}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white/90 backdrop-blur">
          <ShieldCheck size={11} className="text-mint" /> {t('games.rtp')} {game.rtpPercent}%
        </span>
        {/* coming-soon veil */}
        {!live && (
          <div className="absolute inset-0 grid place-items-center bg-night/55 backdrop-blur-[1px]">
            <span className="chip border-white/20 bg-black/40 text-xs font-semibold uppercase tracking-wide text-white/80">
              {t('games.comingSoon')}
            </span>
          </div>
        )}
      </div>

      {/* body */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 p-3">
        <div className="truncate text-sm font-bold">{game.name}</div>
        <div className="truncate text-xs text-white/45">{game.provider}</div>
        {live && (
          <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-xl bg-holo px-3 py-1 text-xs font-bold text-night shadow-glow transition group-hover:brightness-105">
            {t('games.play')}
          </span>
        )}
      </div>
    </div>
  );

  return live ? (
    <Link to={game.route!} className="block h-full">
      {inner}
    </Link>
  ) : (
    <div className="h-full cursor-default" aria-disabled>
      {inner}
    </div>
  );
}
