import { useTranslation } from 'react-i18next';
import { fmt } from '../lib/hooks';
import { categoryMeta } from './GameCard';
import { GameIcon } from './GameIcon';

/** Short "DD.MM HH:MM" timestamp (accepts a ms number or an ISO string). */
export function fmtWhen(at: string | number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * One shared bet/win row for the live ticker, the all-time leaderboards and the
 * player's own history. The identity column stacks vertically — game name, then
 * nick, then date — so nothing gets truncated and the numeric columns (stake ·
 * coeff · win) line up regardless of how long a name is. No header row needed.
 *
 *  - `showNick`   — hide for the player's own history (it's all them).
 *  - `dashOnLoss` — history shows "—" for a losing round; tickers show the 0 payout.
 */
export function BetRow({
  f,
  showNick = true,
  dashOnLoss = false,
}: {
  f: any;
  showNick?: boolean;
  dashOnLoss?: boolean;
}) {
  const { t } = useTranslation();
  const stake = Number(f.stake);
  const coeff = f.coeff != null ? Number(f.coeff) : stake > 0 ? Number(f.payout) / stake : 0;
  const win = Number(f.payout) > 0;
  const meta = categoryMeta(f.category ?? 'ROULETTE');
  return (
    <div className="grid animate-fadeup grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 rounded-xl bg-white/[0.03] px-2.5 py-2 text-xs sm:text-sm">
      <div className="flex min-w-0 items-center gap-2.5">
        <GameIcon category={f.category} />
        <div className="min-w-0 leading-tight">
          <div className="truncate font-medium text-white/80">{t(meta.labelKey)}</div>
          {showNick && <div className="truncate text-white/60">{f.username}</div>}
          <div className="mt-0.5 text-[11px] tabular-nums text-white/35">{fmtWhen(f.at)}</div>
        </div>
      </div>
      <span className="text-right tabular-nums text-white/55">{fmt(f.stake, 2)}</span>
      <span className="text-right tabular-nums text-white/45">{coeff.toFixed(2)}×</span>
      <span className={`text-right tabular-nums font-semibold ${win ? 'text-mint' : 'text-white/35'}`}>
        {win || !dashOnLoss ? fmt(f.payout, 2) : '—'}
        {win && <span className="ml-1 text-[10px] font-normal text-white/35">{f.currency}</span>}
      </span>
    </div>
  );
}

/** Leaderboard row: a win, with the winner's nick. */
export function WinRow({ f }: { f: any }) {
  return <BetRow f={f} />;
}
