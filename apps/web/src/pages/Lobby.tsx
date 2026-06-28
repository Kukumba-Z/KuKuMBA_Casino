import { useQuery } from '@tanstack/react-query';
import { ArrowRight, LayoutGrid, ShieldCheck, Sparkles, Trophy, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { GameCard } from '../components/GameCard';
import { Mascot } from '../components/Mascot';
import api from '../lib/api';
import { fmt, useGames } from '../lib/hooks';
import { getSocket } from '../lib/socket';

const pocketColor = (c: string) =>
  c === 'red' ? 'bg-roul-red' : c === 'green' ? 'bg-roul-green' : 'bg-roul-black border border-white/15';

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
        <BiggestWins wins={stats?.biggestWins ?? []} />
      </div>

      {/* Slim trust strip (replaces the bulky feature cards) */}
      <section className="card flex flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-4 text-sm">
        <TrustItem icon={ShieldCheck} accent="text-mint" label={t('lobby.fair')} />
        <TrustItem icon={Zap} accent="text-sun" label={t('lobby.fastPayouts')} />
        <TrustItem icon={Sparkles} accent="text-sky" label={t('lobby.moreSoon')} />
      </section>
    </div>
  );

  function LiveBets() {
    const [bets, setBets] = useState<any[]>([]);
    useEffect(() => {
      api.get('/games/roulette/live?limit=12').then((r) => setBets(r.data));
      const s = getSocket();
      // Only real-money action in the public feed — demo play stays private.
      const onBet = (b: any) => { if (b.mode !== 'DEMO') setBets((prev) => [b, ...prev].slice(0, 12)); };
      s.on('bet', onBet);
      return () => {
        s.off('bet', onBet);
      };
    }, []);
    return (
      <div className="card p-5">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
          <span className="h-2 w-2 animate-pulse rounded-full bg-mint" /> {t('lobby.liveBets')}
        </h2>
        <div className="space-y-1.5">
          {bets.length === 0 && <div className="py-6 text-center text-sm text-white/40">{t('common.empty')}</div>}
          {bets.map((b, i) => {
            const win = Number(b.payout) > 0;
            return (
              <div key={b.roundId + i} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-sm">
                <div className="flex items-center gap-2.5">
                  <span className={`grid h-7 w-7 place-items-center rounded-lg text-xs font-bold ${pocketColor(b.color)}`}>{b.outcome}</span>
                  <span className="font-medium">{b.username}</span>
                </div>
                <div className={`tabular-nums font-semibold ${win ? 'text-mint' : 'text-white/40'}`}>
                  {win ? `+${fmt(b.payout, 2)}` : `−${fmt(b.stake, 2)}`} {b.currency}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
}

function TrustItem({ icon: Icon, label, accent }: { icon: any; label: string; accent: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-white/70">
      <Icon size={16} className={accent} /> {label}
    </span>
  );
}

function BiggestWins({ wins }: { wins: any[] }) {
  const { t } = useTranslation();
  return (
    <div className="card p-5">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
        <Trophy size={18} className="text-sun" /> {t('lobby.biggestWins')}
      </h2>
      <div className="space-y-1.5">
        {wins.length === 0 && <div className="py-6 text-center text-sm text-white/40">{t('common.empty')}</div>}
        {wins.map((w, i) => (
          <div key={i} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-sm">
            <span className="font-medium">{w.username}</span>
            <span className="font-semibold tabular-nums text-sun">
              +{fmt(w.payout, 2)} {w.currency}
            </span>
          </div>
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
