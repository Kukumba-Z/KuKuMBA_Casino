import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Gift, LayoutGrid, ShieldCheck, Sparkles, Trophy, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { GameCard } from '../components/GameCard';
import { Mascot } from '../components/Mascot';
import { Switch } from '../components/Switch';
import { BetRow, WinRow } from '../components/WinRow';
import api from '../lib/api';
import { useGames } from '../lib/hooks';
import { getSocket } from '../lib/socket';
import { useAuth } from '../store/auth';
import { useUI } from '../store/ui';

/** Lobby live-bet ticker: last 15 real-money rounds, real-time with a smooth
 *  fade-in, toggleable. When off it collapses to just the title + switch. */
function LiveBets() {
  const { t } = useTranslation();
  const liveBets = useUI((s) => s.liveBets);
  const toggleLiveBets = useUI((s) => s.toggleLiveBets);
  const [bets, setBets] = useState<any[]>([]);
  useEffect(() => {
    if (!liveBets) return; // off → don't fetch or subscribe
    // Real-money action only — demo play is private (the server excludes it too).
    api.get('/games/roulette/live').then((r) => setBets((r.data ?? []).filter((b: any) => b.mode !== 'DEMO'))).catch(() => {});
    const s = getSocket();
    const onBet = (b: any) => { if (b.mode !== 'DEMO') setBets((prev) => [b, ...prev].slice(0, 15)); };
    s.on('bet', onBet);
    return () => { s.off('bet', onBet); };
  }, [liveBets]);
  return (
    <div className="card p-4 sm:p-5">
      <div className={`flex items-center justify-between gap-2 ${liveBets ? 'mb-4' : ''}`}>
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <span className={`h-2 w-2 rounded-full bg-mint ${liveBets ? 'animate-pulse' : 'opacity-40'}`} /> {t('lobby.liveBets')}
        </h2>
        <Switch checked={liveBets} onChange={toggleLiveBets} label={t('lobby.liveBets')} />
      </div>
      {liveBets && (
        <div className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
          {bets.length === 0 && <div className="py-6 text-center text-sm text-white/40">{t('common.empty')}</div>}
          {bets.map((b) => (
            <BetRow key={b.roundId} f={b} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Compact, unobtrusive value props for guests — shown in place of the
 *  members-only bonuses tab, with a single register CTA. */
function GuestPerks() {
  const { t } = useTranslation();
  const perks: { icon: any; accent: string; title: string; desc: string }[] = [
    { icon: ShieldCheck, accent: 'text-mint', title: t('lobby.fair'), desc: t('lobby.fairDesc') },
    { icon: Gift, accent: 'text-lav', title: t('lobby.bonusProgram'), desc: t('lobby.bonusProgramDesc') },
    { icon: Zap, accent: 'text-sun', title: t('lobby.fastPayouts'), desc: t('lobby.fastPayoutsDesc') },
  ];
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-bold">{t('lobby.guestTitle')}</h2>
        <Link to="/register" className="btn-primary !py-2 text-sm sm:shrink-0">{t('lobby.guestCta')}</Link>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {perks.map((p) => (
          <div key={p.title} className="flex items-start gap-3 rounded-2xl bg-white/[0.03] p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.05]">
              <p.icon size={18} className={p.accent} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{p.title}</div>
              <div className="text-xs text-white/50">{p.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Lobby() {
  const { t } = useTranslation();
  const authed = !!useAuth((s) => s.accessToken);
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

      {/* Guest-only value props (in place of the members-only bonuses tab) */}
      {!authed && <GuestPerks />}

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

      {/* Live activity + all-time leaders — full-width, stacked */}
      <div className="space-y-6">
        <LiveBets />
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

/** Lobby all-time leaderboard: the 10 biggest wins ever (USD-ranked), live, with
 *  an 11th "see more" row opening the full leaderboards page. */
function BiggestWins() {
  const { t } = useTranslation();
  const [wins, setWins] = useState<any[]>([]);
  useEffect(() => {
    api.get('/leaderboards/wins?limit=10').then((r) => setWins(r.data)).catch(() => {});
    const s = getSocket();
    // Fold each new real-money win into the top-10, ranked by USD value.
    const onBet = (b: any) => {
      if (b.mode === 'DEMO' || !(Number(b.payout) > 0)) return;
      setWins((prev) => {
        if (prev.some((w) => w.roundId === b.roundId)) return prev;
        return [...prev, b].sort((a, c) => Number(c.usd) - Number(a.usd)).slice(0, 10);
      });
    };
    s.on('bet', onBet);
    return () => { s.off('bet', onBet); };
  }, []);
  return (
    <div className="card p-4 sm:p-5">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
        <Trophy size={18} className="text-sun" /> {t('lobby.biggestWins')}
      </h2>
      {wins.length === 0 ? (
        <div className="py-6 text-center text-sm text-white/40">{t('common.empty')}</div>
      ) : (
        <div className="space-y-1.5">
          {wins.slice(0, 10).map((w) => (
            <WinRow key={w.roundId} f={w} />
          ))}
        </div>
      )}
      <Link
        to="/top"
        className="mt-2 flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm font-semibold text-lav transition hover:bg-white/[0.06]"
      >
        {t('lobby.seeMore')} <ArrowRight size={15} />
      </Link>
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
