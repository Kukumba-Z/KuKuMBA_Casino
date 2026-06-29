import { useQuery } from '@tanstack/react-query';
import { ArrowRight, LayoutGrid, ShieldCheck, Sparkles, Trophy, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { GameCard, categoryMeta } from '../components/GameCard';
import { Mascot } from '../components/Mascot';
import { Switch } from '../components/Switch';
import api from '../lib/api';
import { fmt, useGames } from '../lib/hooks';
import { getSocket } from '../lib/socket';
import { useUI } from '../store/ui';

/** One row of a live/big-win feed: "<game> · nick · STAKE → PAYOUT". */
function FeedRow({ f }: { f: any }) {
  const win = Number(f.payout) > 0;
  return (
    <div className="flex animate-fadeup items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        {f.game && <span className="chip max-w-[92px] shrink-0 truncate !px-2 !py-0.5 text-[10px] text-white/55">{f.game}</span>}
        <span className="truncate font-medium">{f.username}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1 tabular-nums">
        <span className="text-white/45">{fmt(f.stake, 2)}</span>
        <ArrowRight size={13} className="text-white/30" />
        <span className={`font-semibold ${win ? 'text-mint' : 'text-white/40'}`}>{fmt(f.payout, 2)}</span>
        <span className="text-white/40">{f.currency}</span>
      </div>
    </div>
  );
}

// Shared 5-column template so the header and rows line up: game · player · stake · coeff · win.
const LIVE_GRID = 'grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto_auto]';

/** Small game tile for a live-bet row — gradient + category icon, echoing the game card. */
function LiveGameIcon({ category }: { category?: string }) {
  const meta = categoryMeta(category ?? 'ROULETTE');
  const Icon = meta.icon;
  return (
    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${meta.grad}`}>
      <Icon size={15} className="text-white/85" />
    </span>
  );
}

/** One live-bet row: game · player(nick) · stake · coeff · win. */
function LiveBetRow({ f }: { f: any }) {
  const { t } = useTranslation();
  const win = Number(f.payout) > 0;
  const stake = Number(f.stake);
  const coeff = stake > 0 ? Number(f.payout) / stake : 0;
  const meta = categoryMeta(f.category ?? 'ROULETTE');
  return (
    <div className={`grid animate-fadeup ${LIVE_GRID} items-center gap-2 rounded-xl bg-white/[0.03] px-2.5 py-2 text-sm`}>
      <div className="flex min-w-0 items-center gap-2">
        <LiveGameIcon category={f.category} />
        <span className="truncate text-white/70">{t(meta.labelKey)}</span>
      </div>
      <span className="truncate font-medium">{f.username}</span>
      <span className="text-right tabular-nums text-white/55">{fmt(f.stake, 2)}</span>
      <span className="text-right tabular-nums text-white/45">{coeff.toFixed(2)}×</span>
      <span className={`text-right tabular-nums font-semibold ${win ? 'text-mint' : 'text-white/35'}`}>
        {fmt(f.payout, 2)}
        <span className="ml-1 text-[10px] font-normal text-white/35">{f.currency}</span>
      </span>
    </div>
  );
}

/** Lobby live-bet ticker: last 15, real-time with a smooth fade-in, toggleable. */
function LiveBets() {
  const { t } = useTranslation();
  const liveBets = useUI((s) => s.liveBets);
  const toggleLiveBets = useUI((s) => s.toggleLiveBets);
  const [bets, setBets] = useState<any[]>([]);
  useEffect(() => {
    if (!liveBets) return; // off → don't fetch or subscribe
    api.get('/games/roulette/live').then((r) => setBets(r.data)).catch(() => {});
    const s = getSocket();
    // Only real-money action in the public feed — demo play stays private. Keep last 15.
    const onBet = (b: any) => { if (b.mode !== 'DEMO') setBets((prev) => [b, ...prev].slice(0, 15)); };
    s.on('bet', onBet);
    return () => { s.off('bet', onBet); };
  }, [liveBets]);
  return (
    <div className="card p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <span className={`h-2 w-2 rounded-full bg-mint ${liveBets ? 'animate-pulse' : 'opacity-40'}`} /> {t('lobby.liveBets')}
        </h2>
        <Switch checked={liveBets} onChange={toggleLiveBets} label={t('lobby.liveBets')} />
      </div>
      {!liveBets ? (
        <div className="py-8 text-center text-sm text-white/40">{t('lobby.liveOff')}</div>
      ) : (
        <>
          <div className={`mb-1.5 grid ${LIVE_GRID} items-center gap-2 px-2.5 text-[11px] uppercase tracking-wide text-white/35`}>
            <span>{t('lobby.colGame')}</span>
            <span>{t('lobby.colPlayer')}</span>
            <span className="text-right">{t('lobby.colStake')}</span>
            <span className="text-right">{t('lobby.colCoeff')}</span>
            <span className="text-right">{t('lobby.colWin')}</span>
          </div>
          <div className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
            {bets.length === 0 && <div className="py-6 text-center text-sm text-white/40">{t('common.empty')}</div>}
            {bets.map((b) => (
              <LiveBetRow key={b.roundId} f={b} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Lobby() {
  const { t } = useTranslation();
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: async () => (await api.get('/stats')).data, refetchInterval: 15000 });
  const { data: games } = useGames();
  const topGames = (games ?? []).slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Hero — slim, one CTA */}
      <section className="card relative overflow-hidden p-5 sm:p-7">
        <div className="pointer-events-none absolute inset-0 bg-holo-soft opacity-70" />
        <div className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full bg-lav/15 blur-3xl" />
        <div className="relative flex items-center gap-6">
          <div className="min-w-0 flex-1">
            <span className="chip mb-3 inline-flex items-center gap-1.5 text-xs">
              <ShieldCheck size={13} className="text-mint" /> Provably-fair · 18+
            </span>
            <h1 className="text-2xl font-extrabold leading-tight sm:text-4xl">
              <span className="holo-text">{t('lobby.heroTitle')}</span>
            </h1>
            <p className="mt-2 max-w-md text-sm text-white/55 sm:text-base">{t('lobby.heroSub')}</p>
            <Link to="/games" className="btn-primary mt-4 inline-flex items-center gap-2">
              <LayoutGrid size={18} /> {t('lobby.allGames')}
            </Link>
          </div>
          <div className="hidden shrink-0 sm:block">
            <div className="animate-float rounded-full bg-holo-soft p-6 shadow-glow">
              <Mascot size={96} />
            </div>
          </div>
        </div>
      </section>

      {/* Popular games */}
      {topGames.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <LayoutGrid size={18} className="text-lav" /> {t('lobby.topGames')}
            </h2>
            <Link to="/games" className="inline-flex items-center gap-1 text-sm text-lav hover:underline">
              {t('lobby.allGames')} <ArrowRight size={15} />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {topGames.map((g) => (
              <GameCard key={g.key} game={g} />
            ))}
          </div>
        </section>
      )}

      {/* Stats — moved below popular games */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('common.online')} value={Math.max(stats?.online?.sockets ?? 0, 1)} accent="text-mint" />
        <Stat label={t('common.players')} value={stats?.players ?? 0} accent="text-sky" />
        <Stat label={t('lobby.rounds')} value={stats?.totalRounds ?? 0} accent="text-lav" />
        <Stat label={t('nav.games')} value={games?.length ?? 0} accent="text-sun" />
      </section>

      {/* Live activity — compact two-up */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LiveBets />
        </div>
        <BiggestWins />
      </div>

      {/* Slim trust strip (replaces the bulky feature cards) */}
      <section className="card flex flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-4 text-sm">
        <TrustItem icon={ShieldCheck} accent="text-mint" label={t('lobby.fair')} />
        <TrustItem icon={Zap} accent="text-sun" label={t('lobby.fastPayouts')} />
        <TrustItem icon={Sparkles} accent="text-sky" label={t('lobby.moreSoon')} />
      </section>
    </div>
  );

}

function TrustItem({ icon: Icon, label, accent }: { icon: any; label: string; accent: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-white/70">
      <Icon size={16} className={accent} /> {label}
    </span>
  );
}

function BiggestWins() {
  const { t } = useTranslation();
  const [wins, setWins] = useState<any[]>([]);
  useEffect(() => {
    api.get('/games/roulette/bigwins?limit=500').then((r) => setWins(r.data)).catch(() => {});
    const s = getSocket();
    // New big wins overshadow old ones; keep the latest 500 in memory.
    const onBigWin = (w: any) => { if (w.mode !== 'DEMO') setWins((prev) => [w, ...prev].slice(0, 500)); };
    s.on('bigwin', onBigWin);
    return () => { s.off('bigwin', onBigWin); };
  }, []);
  return (
    <div className="card p-5">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
        <Trophy size={18} className="text-sun" /> {t('lobby.biggestWins')}
      </h2>
      <div className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
        {wins.length === 0 && <div className="py-6 text-center text-sm text-white/40">{t('common.empty')}</div>}
        {wins.map((w) => (
          <FeedRow key={w.roundId} f={w} />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: any; accent: string }) {
  return (
    <div className="stat">
      <div className="text-xs uppercase tracking-wide text-white/40">{label}</div>
      <div className={`text-2xl font-extrabold tabular-nums ${accent}`}>{value}</div>
    </div>
  );
}
