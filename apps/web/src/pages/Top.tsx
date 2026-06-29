import { Trophy, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isOriginal } from '../components/GameCard';
import { WinHeader, WinRow } from '../components/WinRow';
import api from '../lib/api';
import { useGames } from '../lib/hooks';
import { getSocket } from '../lib/socket';

type Tab = 'wins' | 'x';

const xOf = (r: any) => (Number(r.stake) > 0 ? Number(r.payout) / Number(r.stake) : 0);

/** All-time leaderboards: top 500 biggest wins (by USD) and top 500 multipliers,
 *  filterable by KuKuMBA Originals game, updating live via the 'bet' socket. */
export default function Top() {
  const { t } = useTranslation();
  const { data: games } = useGames();
  const originGames = useMemo(() => (games ?? []).filter(isOriginal), [games]);

  const [tab, setTab] = useState<Tab>('wins');
  const [game, setGame] = useState(''); // '' = all games
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    let alive = true;
    const q = game ? `&game=${encodeURIComponent(game)}` : '';
    api.get(`/leaderboards/${tab}?limit=500${q}`).then((r) => { if (alive) setRows(r.data); }).catch(() => {});
    const s = getSocket();
    // Fold each new real-money round into the current board, re-ranked and capped at 500.
    const onBet = (b: any) => {
      if (b.mode === 'DEMO' || !(Number(b.payout) > 0)) return;
      if (game && b.gameKey !== game) return;
      if (tab === 'x' && !(Number(b.stake) > 0)) return;
      setRows((prev) => {
        if (prev.some((w) => w.roundId === b.roundId)) return prev;
        const next = [...prev, b];
        next.sort(tab === 'wins' ? (a, c) => Number(c.usd) - Number(a.usd) : (a, c) => xOf(c) - xOf(a));
        return next.slice(0, 500);
      });
    };
    s.on('bet', onBet);
    return () => { alive = false; s.off('bet', onBet); };
  }, [tab, game]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold"><span className="holo-text">{t('top.title')}</span></h1>
        <p className="mt-1 text-sm text-white/50">{t('top.subtitle')}</p>
      </div>

      {/* which leaderboard */}
      <div className="flex gap-2">
        <TabBtn active={tab === 'wins'} onClick={() => setTab('wins')} icon={Trophy} label={t('top.wins')} />
        <TabBtn active={tab === 'x'} onClick={() => setTab('x')} icon={Zap} label={t('top.x')} />
      </div>

      {/* filter by game (KuKuMBA Originals) */}
      {originGames.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <FilterChip active={game === ''} onClick={() => setGame('')} label={t('top.all')} />
          {originGames.map((g) => (
            <FilterChip key={g.key} active={game === g.key} onClick={() => setGame(g.key)} label={g.name} />
          ))}
        </div>
      )}

      <div className="card p-4 sm:p-5">
        {rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-white/40">{t('common.empty')}</div>
        ) : (
          <>
            <WinHeader />
            <div className="max-h-[72vh] space-y-1.5 overflow-y-auto pr-1">
              {rows.map((w) => (
                <WinRow key={w.roundId} f={w} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition ${
        active ? 'border-lav/40 bg-white/10 text-white' : 'border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]'
      }`}
    >
      <Icon size={16} className={active ? 'text-lav' : 'text-white/50'} /> {label}
    </button>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        active ? 'border-mint/40 bg-mint/15 text-white' : 'border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]'
      }`}
    >
      {label}
    </button>
  );
}
