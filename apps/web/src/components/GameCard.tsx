import { Beer, CircleDot, Club, Dices, Gamepad2, Gem, Radio, ShieldCheck, Sparkles, Triangle, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Game } from '../lib/hooks';
import { CrashCardArt } from './crash/CrashCardArt';
import { PlinkoCardArt } from './plinko/PlinkoCardArt';
import { PonyjackCardArt } from './ponyjack/PonyjackCardArt';
import { RouletteWheel } from './RouletteWheel';

/** Per-category visual identity (icon + gradient accent for the thumbnail). */
const CATEGORY: Record<string, { icon: LucideIcon; grad: string; labelKey: string }> = {
  ROULETTE: { icon: CircleDot, grad: 'from-roul-red/30 to-lav/30', labelKey: 'games.catRoulette' },
  CARDS: { icon: Club, grad: 'from-bubble/30 to-lav/30', labelKey: 'games.catCards' },
  SLOTS: { icon: Gem, grad: 'from-sun/30 to-bubble/30', labelKey: 'games.catSlots' },
  LIVE: { icon: Radio, grad: 'from-mint/30 to-sky/30', labelKey: 'games.catLive' },
  MINIGAME: { icon: Dices, grad: 'from-sky/30 to-lav/30', labelKey: 'games.catMinigame' },
};
const FALLBACK = { icon: Gamepad2, grad: 'from-white/10 to-white/5', labelKey: 'games.catOther' };

export function categoryMeta(category: string) {
  return CATEGORY[category] ?? FALLBACK;
}

/** Per-game visual identity for originals whose look shouldn't collapse into the
 *  generic category (crash is a drinking game, not "dice"). Keyed by Game.key. */
const GAME: Record<string, { icon: LucideIcon; grad: string }> = {
  crash: { icon: Beer, grad: 'from-sun/30 to-roul-red/30' },
  ponyjack: { icon: Club, grad: 'from-bubble/30 to-lav/30' },
  plinko: { icon: Triangle, grad: 'from-sky/30 to-bubble/30' },
};

export function gameMeta(gameKey?: string) {
  return gameKey ? GAME[gameKey] ?? null : null;
}

/** Our own titles (vs. third-party provider games). Brand-name match keeps it
 *  data-driven — no per-game hardcoding. */
export function isOriginal(game: Pick<Game, 'provider'>) {
  return /kukumba/i.test(game.provider ?? '');
}

/** Thumbnail art when a game has no uploaded image. Originals get bespoke art
 *  (a real mini roulette wheel) so they look like games, not a stray icon. */
function GameArt({ game }: { game: Game }) {
  const meta = categoryMeta(game.category);
  if (game.thumbnail) {
    return <img src={game.thumbnail} alt={game.name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />;
  }
  if (game.key === 'crash') {
    return <CrashCardArt />;
  }
  if (game.key === 'ponyjack') {
    return <PonyjackCardArt />;
  }
  if (game.key === 'plinko') {
    return <PlinkoCardArt />;
  }
  if (game.category === 'ROULETTE') {
    return (
      <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-roul-red/25 via-lav/20 to-night">
        <div className="w-[78%] max-w-[150px]">
          <RouletteWheel result={null} spinId={0} size={200} />
        </div>
      </div>
    );
  }
  const Icon = meta.icon;
  return (
    <div className={`absolute inset-0 grid place-items-center bg-gradient-to-br ${meta.grad}`}>
      <Icon size={44} className="text-white/75 drop-shadow" />
    </div>
  );
}

export function GameCard({ game }: { game: Game }) {
  const { t } = useTranslation();
  const live = game.status === 'LIVE' && !!game.route;
  const original = isOriginal(game);

  const inner = (
    <div
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white/[0.03] transition ${
        original ? 'border-lav/30' : 'border-white/10'
      } ${live ? 'hover:border-white/30 hover:shadow-glow' : ''}`}
    >
      {/* thumbnail */}
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        <GameArt game={game} />
        {/* RTP badge */}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white/90 backdrop-blur">
          <ShieldCheck size={11} className="text-mint" /> {t('games.rtp')} {game.rtpPercent}%
        </span>
        {/* Originals badge */}
        {original && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-holo px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-night shadow">
            <Sparkles size={10} /> {t('games.original')}
          </span>
        )}
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
