import { categoryMeta, gameMeta } from './GameCard';

/** Small game tile — gradient + category icon, echoing the game card. Used in the
 *  live-bets ticker and the win/x leaderboards. Originals with their own visual
 *  identity (crash) override the generic category look via `gameKey`. */
export function GameIcon({ category, gameKey, className = 'h-7 w-7', size = 15 }: { category?: string; gameKey?: string; className?: string; size?: number }) {
  const meta = gameMeta(gameKey) ?? categoryMeta(category ?? 'ROULETTE');
  const Icon = meta.icon;
  return (
    <span className={`grid shrink-0 place-items-center rounded-lg bg-gradient-to-br ${meta.grad} ${className}`}>
      <Icon size={size} className="text-white/85" />
    </span>
  );
}
