import { useTranslation } from 'react-i18next';
import { fmt } from '../lib/hooks';
import { categoryMeta } from './GameCard';
import { GameIcon } from './GameIcon';

// Shared 6-col template so the header and rows line up:
// game · player · date · coeff · stake · win.
export const WIN_GRID = 'grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto_auto_auto_auto]';

/** Short "DD.MM HH:MM" timestamp (accepts a ms number or an ISO string). */
function fmtWhen(at: string | number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Column header row matching the win-row grid. */
export function WinHeader() {
  const { t } = useTranslation();
  return (
    <div className={`mb-1.5 grid ${WIN_GRID} items-center gap-2 px-2.5 text-[11px] uppercase tracking-wide text-white/35`}>
      <span>{t('lobby.colGame')}</span>
      <span>{t('lobby.colPlayer')}</span>
      <span className="text-right">{t('lobby.colDate')}</span>
      <span className="text-right">{t('lobby.colCoeff')}</span>
      <span className="text-right">{t('lobby.colStake')}</span>
      <span className="text-right">{t('lobby.colWin')}</span>
    </div>
  );
}

/** One leaderboard row: game · player(nick) · date · coeff · stake · win. */
export function WinRow({ f }: { f: any }) {
  const { t } = useTranslation();
  const stake = Number(f.stake);
  const coeff = f.coeff != null ? Number(f.coeff) : stake > 0 ? Number(f.payout) / stake : 0;
  const meta = categoryMeta(f.category ?? 'ROULETTE');
  return (
    <div className={`grid animate-fadeup ${WIN_GRID} items-center gap-2 rounded-xl bg-white/[0.03] px-2.5 py-2 text-xs sm:text-sm`}>
      <div className="flex min-w-0 items-center gap-2">
        <GameIcon category={f.category} />
        <span className="truncate text-white/70">{t(meta.labelKey)}</span>
      </div>
      <span className="truncate font-medium">{f.username}</span>
      <span className="whitespace-nowrap text-right tabular-nums text-white/40">{fmtWhen(f.at)}</span>
      <span className="text-right tabular-nums text-white/45">{coeff.toFixed(2)}×</span>
      <span className="text-right tabular-nums text-white/55">{fmt(f.stake, 2)}</span>
      <span className="text-right tabular-nums font-semibold text-mint">
        {fmt(f.payout, 2)}
        <span className="ml-1 text-[10px] font-normal text-white/35">{f.currency}</span>
      </span>
    </div>
  );
}
