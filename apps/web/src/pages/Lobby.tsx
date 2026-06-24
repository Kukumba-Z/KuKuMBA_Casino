import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Mascot } from '../components/Mascot';
import api from '../lib/api';
import { fmt } from '../lib/hooks';
import { getSocket } from '../lib/socket';

const pocketColor = (c: string) =>
  c === 'red' ? 'bg-roul-red' : c === 'green' ? 'bg-roul-green' : 'bg-roul-black border border-white/15';

export default function Lobby() {
  const { t } = useTranslation();
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: async () => (await api.get('/stats')).data, refetchInterval: 15000 });
  const { data: raffles } = useQuery({ queryKey: ['raffles'], queryFn: async () => (await api.get('/raffles')).data });
  const openRaffle = raffles?.find((r: any) => r.status === 'OPEN');

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="card relative overflow-hidden p-8 md:p-12">
        <div className="pointer-events-none absolute inset-0 bg-holo-soft" />
        <div className="pointer-events-none absolute -right-10 -top-10 h-64 w-64 rounded-full bg-lav/20 blur-3xl" />
        <div className="relative grid items-center gap-8 md:grid-cols-2">
          <div>
            <span className="chip mb-4">🦄 Provably-fair · RTP 99%</span>
            <h1 className="text-4xl font-extrabold leading-tight md:text-5xl">
              <span className="holo-text">{t('lobby.heroTitle')}</span>
            </h1>
            <p className="mt-4 max-w-md text-white/60">{t('lobby.heroSub')}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/roulette" className="btn-primary text-lg">
                🎯 {t('lobby.playNow')}
              </Link>
              <Link to="/bonuses" className="btn-ghost text-lg">
                🎁 {t('nav.bonuses')}
              </Link>
            </div>
          </div>
          <div className="hidden justify-center md:flex">
            <div className="animate-float rounded-full bg-holo-soft p-10 shadow-glow">
              <Mascot size={150} />
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('common.online')} value={Math.max(stats?.online?.sockets ?? 0, 1)} accent="text-mint" />
        <Stat label={t('common.players')} value={stats?.players ?? 0} accent="text-sky" />
        <Stat label={t('lobby.rounds')} value={stats?.totalRounds ?? 0} accent="text-lav" />
        <Stat label="RTP" value="99%" accent="text-sun" />
      </section>

      {/* Raffle banner */}
      {openRaffle && (
        <Link to={`/raffles/${openRaffle.id}`} className="card flex flex-wrap items-center justify-between gap-4 p-6 transition hover:shadow-glow">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-holo text-2xl text-night">🎉</span>
            <div>
              <div className="text-lg font-bold">{openRaffle.title}</div>
              <div className="text-sm text-white/55">
                {t('raffles.prize')}: {fmt(openRaffle.prizePool)} {openRaffle.currency} · {openRaffle.winnersCount} {t('raffles.winners')} · {openRaffle.participants} {t('raffles.participants')}
              </div>
            </div>
          </div>
          <span className="btn-soft">{t('raffles.join')} →</span>
        </Link>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LiveBets />
        </div>
        <BiggestWins wins={stats?.biggestWins ?? []} />
      </div>

      {/* Feature cards */}
      <section className="grid gap-4 md:grid-cols-3">
        <Feature icon="🔐" title={t('lobby.fair')} desc={t('lobby.fairDesc')} />
        <Feature icon="📈" title="RTP 99%" desc={t('lobby.rtpDesc')} />
        <Feature icon="⚡" title={t('lobby.instant')} desc={t('lobby.instantDesc')} />
      </section>
    </div>
  );

  function LiveBets() {
    const [bets, setBets] = useState<any[]>([]);
    useEffect(() => {
      api.get('/games/roulette/live?limit=15').then((r) => setBets(r.data));
      const s = getSocket();
      const onBet = (b: any) => setBets((prev) => [b, ...prev].slice(0, 15));
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
                  {b.mode === 'DEMO' && <span className="chip !px-2 !py-0.5 text-[10px]">demo</span>}
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

function BiggestWins({ wins }: { wins: any[] }) {
  const { t } = useTranslation();
  return (
    <div className="card p-5">
      <h2 className="mb-4 text-lg font-bold">🏆 {t('lobby.biggestWins')}</h2>
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

function Feature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="card p-6">
      <div className="mb-3 text-3xl">{icon}</div>
      <div className="text-lg font-bold">{title}</div>
      <div className="mt-1 text-sm text-white/55">{desc}</div>
    </div>
  );
}
