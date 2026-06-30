import { useTranslation } from 'react-i18next';
import { fmt } from '../lib/hooks';
import { categoryMeta } from './GameCard';
import { GameIcon } from './GameIcon';
import { fmtWhen } from './WinRow';

// Shared 5-col template (no nick — it's the player's own history):
// game · date · stake · coeff · result.
const HIST_GRID = 'grid-cols-[minmax(0,1.3fr)_auto_auto_auto_auto]';

/** Column header row matching the history-row grid. */
export function HistoryHeader() {
  const { t } = useTranslation();
  return (
    <div className={`mb-1.5 grid ${HIST_GRID} items-center gap-2 px-2.5 text-[11px] uppercase tracking-wide text-white/35`}>
      <span>{t('lobby.colGame')}</span>
      <span className="text-right">{t('lobby.colDate')}</span>
      <span className="text-right">{t('lobby.colStake')}</span>
      <span className="text-right">{t('lobby.colCoeff')}</span>
      <span className="text-right">{t('lobby.colWin')}</span>
    </div>
  );
}

/** One row of the player's own game history: game · date · stake · coeff · result. */
export function HistoryRow({ f }: { f: any }) {
  const { t } = useTranslation();
  const win = Number(f.payout) > 0;
  const meta = categoryMeta(f.category ?? 'ROULETTE');
  return (
    <div className={`grid ${HIST_GRID} items-center gap-2 rounded-xl bg-white/[0.03] px-2.5 py-2 text-xs sm:text-sm`}>
      <div className="flex min-w-0 items-center gap-2">
        <GameIcon category={f.category} />
        <span className="truncate text-white/70">{t(meta.labelKey)}</span>
      </div>
      <span className="whitespace-nowrap text-right tabular-nums text-white/40">{fmtWhen(f.at)}</span>
      <span className="text-right tabular-nums text-white/55">{fmt(f.stake, 2)}</span>
      <span className="text-right tabular-nums text-white/45">{Number(f.coeff).toFixed(2)}×</span>
      <span className={`text-right tabular-nums font-semibold ${win ? 'text-mint' : 'text-white/35'}`}>
        {win ? fmt(f.payout, 2) : '—'}
        {win && <span className="ml-1 text-[10px] font-normal text-white/35">{f.currency}</span>}
      </span>
    </div>
  );
}
