import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Shield, Volume2, VolumeX, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { GameInfoModal } from '../components/GameInfoModal';
import { GameLayout } from '../components/GameLayout';
import { Coin } from '../components/sexcoin/Coin';
import { PenisFace, VaginaFace } from '../components/sexcoin/CoinFaces';
import { SexcoinSynth } from '../components/sexcoin/synth';
import api, { apiError } from '../lib/api';
import { creditLocalBalance, debitLocalBalance } from '../lib/balances';
import { betLimits, clampStake } from '../lib/bets';
import { fmt, useBalances, useCurrencies } from '../lib/hooks';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import { useUI } from '../store/ui';

type CoinSide = 'penis' | 'vagina';

/** The server's round view (see SexcoinService.viewOf) — rendered verbatim. */
interface SexcoinView {
  roundId: string;
  phase: 'PLAYING' | 'SETTLED';
  status: 'PLAYING' | 'WON' | 'LOST' | 'PUSH';
  guesses: CoinSide[];
  results: CoinSide[];
  streak: number;
  busted: boolean;
  maxStreak: number;
  currentMultiplier: number;
  nextMultiplier: number | null;
  cashoutAmount: string;
  stake: string;
  currency: string;
  mode: string;
  multipliers: number[];
  autoCashoutAt: number | null;
  serverNow: number;
  /** SETTLED only. */
  multiplier?: number;
  payout?: string;
}

type RecentChip = { status: string; mult: number };

/** Compact multiplier: ×1.94 below a thousand, ×48.04k, ×1.02M above. */
const fmtMult = (m: number) =>
  m >= 1e6 ? `×${(m / 1e6).toFixed(2)}M` : m >= 1000 ? `×${(m / 1000).toFixed(2)}k` : `×${m.toFixed(2)}`;

/**
 * Sexcoin — the 18+ streak coinflip. The page is a dumb terminal for the
 * sexcoin API (apps/api/src/modules/games/sexcoin): it only ever submits coin
 * sides and renders the server's view of the series, so no outcome logic lives
 * here. The 3D coin (components/sexcoin/Coin) plays the throw the server
 * already settled; the verdict is folded in when the animation lands.
 */
export default function Sexcoin() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const authed = !!useAuth((s) => s.accessToken);
  const { mode, currency, sound, toggleSound, quick, toggleQuick } = useUI();

  // The game's own synth (boudoir loop + coin SFX). Constructing the class is
  // free — the AudioContext appears only on unlock(), i.e. the first gesture.
  const synthRef = useRef<SexcoinSynth | null>(null);
  const synth = () => (synthRef.current ??= new SexcoinSynth());
  useEffect(() => {
    const unlock = () => synth().unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      synthRef.current?.destroy();
      synthRef.current = null;
    };
  }, []);
  useEffect(() => synth().setSound(sound), [sound]);

  // The admin RTP panel refetches by this key, so retunes land live.
  const { data: info } = useQuery({
    queryKey: ['game', 'sexcoin'],
    queryFn: async () => (await api.get('/games/sexcoin')).data,
  });
  const { data: balances } = useBalances();
  const { data: currencies } = useCurrencies();
  const { data: seed } = useQuery({ queryKey: ['pf-seed'], enabled: authed, queryFn: async () => (await api.get('/provably-fair/seed')).data });

  const cur = currencies?.find((c) => c.code === currency);
  const limits = useMemo(() => betLimits(cur, mode), [cur, mode]);
  const bal = balances?.find((b) => b.mode === mode && b.currency === currency);

  const [view, setView] = useState<SexcoinView | null>(null);
  const [busy, setBusy] = useState(false);
  const [flying, setFlying] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [stakeStr, setStakeStr] = useState('10');
  // Session-only strip of recent series (like the mines recent chips).
  const [recent, setRecent] = useState<RecentChip[]>([]);
  // The coin: cumulative rotation is page-owned, the Coin just obeys it.
  const [rotation, setRotation] = useState(0);
  const [spinMs, setSpinMs] = useState(0);
  const [spinId, setSpinId] = useState(0);
  const pendingViewRef = useRef<SexcoinView | null>(null);
  // Auto-cashout deadline mapped onto the local clock (server clocks may differ).
  const deadlineRef = useRef<number | null>(null);
  const settledRounds = useRef(new Set<string>());
  const ladderRef = useRef<HTMLDivElement | null>(null);
  const [, forceTick] = useState(0);

  const playing = view?.phase === 'PLAYING';
  const streak = view?.streak ?? 0;

  const stake = clampStake(Number(stakeStr) || limits.min, limits);
  useEffect(() => {
    setStakeStr((s) => String(clampStake(Number(s) || limits.min, limits)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, mode]);
  const setStake = (v: number) => setStakeStr(String(clampStake(v, limits)));
  const stakeNum = Number(stakeStr);
  const outOfRange = stakeStr.trim() !== '' && (stakeNum > limits.max || stakeNum < limits.min);

  /** Where the disc must stop to show `side` face-on, with 6–8 showy turns. */
  const targetFor = (current: number, side: CoinSide, turns: number) => {
    const desired = side === 'penis' ? 0 : 180;
    const mod = ((current % 360) + 360) % 360;
    const delta = (desired - mod + 360) % 360;
    return current + turns * 360 + delta;
  };

  /** Fold a server view into the page: deadline, stingers, chips, wallet caches. */
  const applyView = (data: SexcoinView, opts?: { silent?: boolean; viaCashout?: boolean }) => {
    deadlineRef.current = data.autoCashoutAt != null ? Date.now() + (data.autoCashoutAt - data.serverNow) : null;
    setView(data);
    if (data.phase === 'SETTLED' && !settledRounds.current.has(data.roundId)) {
      settledRounds.current.add(data.roundId);
      if (!opts?.silent) {
        if (data.status === 'LOST') synth().lose();
        else if (data.status === 'WON') (opts?.viaCashout ? synth().cashout() : synth().win());
      }
      // Credit the wallet chip the moment the verdict is ON SCREEN; the
      // invalidate below resyncs with the server truth right after.
      if (!opts?.silent) creditLocalBalance(qc, data.currency, data.mode as 'DEMO' | 'REAL', Number(data.payout ?? 0));
      setRecent((r) => [{ status: data.status, mult: data.multiplier ?? 0 }, ...r].slice(0, 10));
      qc.invalidateQueries({ queryKey: ['balances'] });
      qc.invalidateQueries({ queryKey: ['my-bonuses'] }); // live wagering progress
      qc.invalidateQueries({ queryKey: ['pf-seed'] });
    }
  };

  // Re-attach to a series left open by a reload/navigation (pattern Mines.tsx).
  const reattached = useRef(false);
  useEffect(() => {
    if (!authed || reattached.current) return;
    reattached.current = true;
    (async () => {
      try {
        const { data } = await api.get('/games/sexcoin/active');
        if (data.active) {
          applyView(data, { silent: true });
          const last = data.results?.[data.results.length - 1] as CoinSide | undefined;
          if (last) setRotation(last === 'penis' ? 0 : 180); // snap, no spin
        }
      } catch {
        /* nothing to re-attach */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  // 1s heartbeat while a series is open: drives the auto-cashout countdown
  // and, once the deadline passes, polls the round so the sweeper's verdict lands.
  useEffect(() => {
    if (!playing || !view) return;
    const id = window.setInterval(async () => {
      forceTick((x) => x + 1);
      const dl = deadlineRef.current;
      if (dl != null && Date.now() > dl + 1500 && !busy) {
        try {
          const { data } = await api.get(`/games/sexcoin/round/${view.roundId}`);
          if (data.phase === 'SETTLED') applyView(data);
        } catch {
          /* transient — next tick retries */
        }
      }
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, view?.roundId, busy]);

  // Keep the "next step" chip of the ladder in sight as the streak deepens.
  useEffect(() => {
    const el = ladderRef.current;
    if (!el || !view) return;
    const chip = el.children[Math.min(streak, el.children.length - 1)] as HTMLElement | undefined;
    if (chip) el.scrollTo({ left: chip.offsetLeft - el.clientWidth / 2 + chip.clientWidth / 2, behavior: quick ? 'auto' : 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streak, view?.roundId]);

  // Music intensity follows the streak (crash-tier style).
  useEffect(() => {
    synth().setIntensity(playing ? streak : 0);
  }, [playing, streak]);

  const start = async () => {
    if (!authed) {
      toast.error(t('sexcoin.needLogin'));
      return;
    }
    if (busy || playing) return;
    if (outOfRange) {
      toast.error(`${t('roulette.limits')}: ${fmt(limits.min, 2)}–${fmt(limits.max, 2)} ${currency}`);
      return;
    }
    setBusy(true);
    synth().click();
    try {
      const { data } = await api.post('/games/sexcoin/start', { stake, currency, mode });
      debitLocalBalance(qc, currency, mode, stake);
      applyView(data);
    } catch (e) {
      toast.error(apiError(e));
    }
    setBusy(false);
  };

  const flip = async (guess: CoinSide) => {
    if (!view || !playing || busy || flying) return;
    setBusy(true);
    synth().click();
    try {
      const { data } = (await api.post('/games/sexcoin/flip', { roundId: view.roundId, guess })) as { data: SexcoinView };
      const landed = data.results[data.results.length - 1];
      if (quick) {
        // Turbo: no animation, no throw sound — the verdict lands instantly.
        setSpinMs(0);
        setSpinId((x) => x + 1);
        setRotation((r) => targetFor(r, landed, 0));
        applyView(data);
        if (data.phase === 'PLAYING') synth().correct(data.streak);
        setBusy(false);
      } else {
        const dur = 2200 + Math.random() * 400; // 2.2–2.6 s, roulette-style ease-out
        pendingViewRef.current = data;
        setFlying(true);
        setSpinMs(dur);
        setSpinId((x) => x + 1);
        setRotation((r) => targetFor(r, landed, 6 + Math.floor(Math.random() * 3)));
        synth().flip(dur);
        // busy stays on until the coin lands (onLanded below)
      }
    } catch (e) {
      toast.error(apiError(e));
      setBusy(false);
    }
  };

  /** The coin touched down: clink, then fold in the server verdict. */
  const onLanded = () => {
    if (!pendingViewRef.current) return;
    synth().land();
    const data = pendingViewRef.current;
    pendingViewRef.current = null;
    setFlying(false);
    applyView(data);
    if (data.phase === 'PLAYING') synth().correct(data.streak);
    setBusy(false);
  };

  const cashout = async () => {
    if (!view || !playing || busy || flying || streak < 1) return;
    setBusy(true);
    try {
      const { data } = await api.post('/games/sexcoin/cashout', { roundId: view.roundId });
      applyView(data, { viaCashout: true });
    } catch (e) {
      toast.error(apiError(e));
    }
    setBusy(false);
  };

  const secondsLeft = deadlineRef.current != null ? Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)) : null;

  // The ladder to draw: the live round's snapshot when playing, else the info's.
  const ladder: number[] = (playing ? view?.multipliers : info?.multipliers) ?? [];
  const maxStreak: number = view?.maxStreak ?? info?.maxStreak ?? 20;
  const nextMult = playing ? view?.nextMultiplier ?? null : null;
  const nextCashout = nextMult != null ? Number(view!.stake) * nextMult : null;

  const message = useMemo(() => {
    if (!view) return { text: '', cls: '', sub: '' };
    if (flying) return { text: t('sexcoin.flipping'), cls: 'text-white/70', sub: '' };
    if (view.phase === 'PLAYING') {
      const sub = secondsLeft != null && secondsLeft <= 20 ? t('sexcoin.autoIn', { s: secondsLeft }) : '';
      return view.streak === 0
        ? { text: t('sexcoin.chooseSide'), cls: 'text-white/70', sub }
        : { text: fmtMult(view.currentMultiplier), cls: 'text-mint', sub };
    }
    if (view.status === 'WON') {
      const capped = view.streak >= maxStreak;
      return { text: capped ? t('sexcoin.capWin') : t('sexcoin.win'), cls: capped ? 'holo-text' : 'text-mint', sub: `+${fmt(view.payout ?? 0, 2)} ${view.currency}` };
    }
    if (view.status === 'PUSH') return { text: t('sexcoin.push'), cls: 'text-white/75', sub: '' };
    return { text: t('sexcoin.lose'), cls: 'text-roul-red', sub: `−${fmt(view.stake, 2)} ${view.currency}` };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, flying, secondsLeft, t]);

  const glow: 'idle' | 'win' | 'lose' =
    !flying && view?.phase === 'SETTLED' ? (view.status === 'LOST' ? 'lose' : view.status === 'WON' ? 'win' : 'idle') : 'idle';

  const scrollLadder = (dir: -1 | 1) => ladderRef.current?.scrollBy({ left: dir * ladderRef.current.clientWidth * 0.7, behavior: 'smooth' });

  const chipCls = (c: RecentChip) =>
    c.status === 'WON' ? 'border-white/10 bg-white/5 text-mint' : c.status === 'PUSH' ? 'border-white/10 bg-white/5 text-white/60' : 'border-roul-red/25 bg-roul-red/10 text-roul-red/70';

  const sideBtnCls =
    'flex flex-col items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 transition hover:border-white/30 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-white/10 disabled:hover:bg-white/[0.03]';

  return (
    <GameLayout
      aside={
        <>
          <div className="card flex flex-col gap-4 p-5">
            {/* stake */}
            <div>
              <div className="mb-2 text-xs font-semibold text-white/55">{t('sexcoin.stake')}</div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  {outOfRange && (
                    <div className="absolute bottom-full left-0 z-20 mb-1 rounded-lg border border-white/10 bg-night px-2.5 py-1.5 text-[11px] font-medium text-white/80 shadow-card">
                      {t('roulette.limits')}: {fmt(limits.min, 2)}–{fmt(limits.max, 2)} {currency}
                    </div>
                  )}
                  <input
                    value={stakeStr}
                    onChange={(e) => setStakeStr(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
                    onBlur={() => setStakeStr(String(stake))}
                    inputMode="decimal"
                    disabled={busy || playing}
                    aria-invalid={outOfRange}
                    aria-label={t('sexcoin.stake')}
                    className={`input !py-3 pr-14 text-right font-extrabold tabular-nums ${outOfRange ? '!border-roul-red' : ''}`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-white/40">{currency}</span>
                </div>
                <button onClick={() => setStake(stake / 2)} className="btn-ghost !px-3" disabled={busy || playing}>½</button>
                <button onClick={() => setStake(stake * 2)} className="btn-ghost !px-3" disabled={busy || playing}>2×</button>
                <button
                  onClick={() => setStake(Math.min(limits.max, Number(bal?.amount ?? limits.max)))}
                  className="btn-ghost !px-3 text-xs"
                  disabled={busy || playing}
                >
                  {t('roulette.maxBtn')}
                </button>
              </div>
            </div>

            {/* main action: play → cash out over the two coin-side buttons */}
            {playing ? (
              <>
                <button onClick={cashout} disabled={busy || flying || streak < 1} className="crash-action btn-crash-mint">
                  <span className="font-display text-lg font-black">{t('sexcoin.cashout')}</span>
                  <span className="text-sm font-bold opacity-85">
                    {streak >= 1 ? `${fmt(view!.cashoutAmount, 2)} ${view!.currency}` : t('sexcoin.firstFlipShort')}
                  </span>
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => flip('penis')} disabled={busy || flying} className={sideBtnCls} aria-label={t('sexcoin.penis')}>
                    <PenisFace className="h-16 w-16" />
                    <span className="font-display text-sm font-black text-sun">{t('sexcoin.penis')}</span>
                  </button>
                  <button onClick={() => flip('vagina')} disabled={busy || flying} className={sideBtnCls} aria-label={t('sexcoin.vagina')}>
                    <VaginaFace className="h-16 w-16" />
                    <span className="font-display text-sm font-black text-bubble">{t('sexcoin.vagina')}</span>
                  </button>
                </div>
              </>
            ) : (
              <button onClick={start} disabled={busy || !(info?.enabled ?? true)} className="crash-action btn-crash-primary">
                <span className="font-display text-lg font-black">{t('sexcoin.play')}</span>
                <span className="text-sm font-bold opacity-85">{fmt(stake, 2)} {currency}</span>
              </button>
            )}
            {!authed && (
              <div className="text-center text-sm text-white/50">
                <Link to="/login" className="text-lav hover:underline">{t('common.login')}</Link> · {t('sexcoin.needLogin')}
              </div>
            )}
          </div>

          {/* recent series — this visit only; last 10 as a 2×5 grid */}
          <div className="card p-3.5">
            <div className="mb-2 text-[11px] font-bold tracking-wider text-white/45">{t('sexcoin.recent')}</div>
            {recent.length === 0 ? (
              <span className="text-sm text-white/35">{t('sexcoin.recentEmpty')}</span>
            ) : (
              <div className="grid grid-cols-5 gap-1.5">
                {recent.map((r, i) => (
                  <span key={i} className={`truncate rounded-lg border px-1 py-1 text-center font-display text-xs font-extrabold ${chipCls(r)}`}>
                    {fmtMult(r.mult)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </>
      }
    >
      {/* Scene */}
      <div className="card relative overflow-hidden">
        <div className="relative flex flex-col items-center gap-3 px-4 py-4 sm:gap-4 sm:px-6 sm:py-6">
          {/* counters above the coin — series depth and the live coefficient */}
          <div className="flex items-center justify-center gap-2 px-10">
            <span className="chip text-[11px] font-bold">
              <span className="text-white/50">{t('sexcoin.series')}</span>
              <span className="tabular-nums text-sun">{streak}</span>
              <span className="hidden text-white/35 sm:inline">/ {maxStreak}</span>
            </span>
            <span className="chip text-[11px] font-bold">
              <span className="text-white/50">{t('sexcoin.current')}</span>
              <span className="tabular-nums text-mint">{streak >= 1 && view ? fmtMult(view.currentMultiplier) : '—'}</span>
            </span>
          </div>

          {/* verdict / progress strip — mounted only while a round exists */}
          {view && (
            <div className="grid h-12 place-items-center text-center">
              <div>
                <div className={`font-display text-lg font-black sm:text-xl ${message.cls}`}>{message.text}</div>
                <div className="h-4 text-xs font-bold tabular-nums text-white/60">{message.sub}</div>
              </div>
            </div>
          )}

          {/* the coin on its glass podium */}
          <div className="glass grid w-full max-w-[420px] place-items-center rounded-3xl px-4 py-6 sm:py-8">
            <Coin rotation={rotation} spinMs={spinMs} spinId={spinId} onLanded={onLanded} glow={glow} size={216} />
          </div>

          {/* the multiplier ladder: upcoming steps, current lit */}
          <div className="w-full max-w-[420px]">
            <div className="flex items-center gap-1.5">
              <button onClick={() => scrollLadder(-1)} className="btn-ghost !p-1.5" aria-label="‹">
                <ChevronLeft size={14} />
              </button>
              <div ref={ladderRef} className="flex flex-1 gap-1.5 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {ladder.map((m, i) => {
                  const k = i + 1;
                  const passed = view != null && k <= streak;
                  const next = playing && !flying && k === streak + 1;
                  return (
                    <span
                      key={k}
                      className={`shrink-0 rounded-lg border px-2 py-1.5 text-center font-display text-[11px] font-extrabold tabular-nums transition ${
                        passed
                          ? 'border-mint/40 bg-mint/15 text-mint'
                          : next
                            ? 'border-sun/50 bg-sun/15 text-sun'
                            : 'border-white/10 bg-white/[0.03] text-white/55'
                      }`}
                    >
                      <span className="mr-1 text-[9px] font-bold text-white/35">{k}</span>
                      {fmtMult(m)}
                    </span>
                  );
                })}
              </div>
              <button onClick={() => scrollLadder(1)} className="btn-ghost !p-1.5" aria-label="›">
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="mt-1.5 h-4 text-center text-xs font-bold tabular-nums text-white/45">
              {nextCashout != null
                ? `${t('sexcoin.nextMult')}: ${fmt(nextCashout, 2)} ${view!.currency}`
                : ladder.length > 0 && !playing
                  ? `${t('sexcoin.potential')}: ${fmt(stake * ladder[0], 2)} ${currency}`
                  : ''}
            </div>
          </div>
        </div>

        {/* corner controls — sound / info / turbo, as in Mines */}
        <button
          type="button"
          onClick={toggleSound}
          className="absolute left-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-night/55 text-white/70 backdrop-blur transition hover:bg-white/10"
          aria-label={sound ? t('sexcoin.soundOff') : t('sexcoin.soundOn')}
          title={sound ? t('sexcoin.soundOff') : t('sexcoin.soundOn')}
        >
          {sound ? <Volume2 size={18} /> : <VolumeX size={18} className="text-white/40" />}
        </button>
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-night/55 text-mint backdrop-blur transition hover:bg-white/10"
          aria-label={t('sexcoin.info')}
          title={t('sexcoin.info')}
        >
          <Shield size={18} />
        </button>
        <button
          type="button"
          onClick={toggleQuick}
          aria-pressed={quick}
          aria-label={t('sexcoin.quickPlay')}
          title={t('sexcoin.quickPlay')}
          className={`absolute bottom-3 left-3 z-10 grid h-9 w-9 place-items-center rounded-xl border backdrop-blur transition ${
            quick ? 'border-sun/40 bg-sun/20 text-sun' : 'border-white/10 bg-night/55 text-white/70 hover:bg-white/10'
          }`}
        >
          <Zap size={18} />
        </button>
      </div>

      {/* Info, rules & fairness — the shared dialog. */}
      <GameInfoModal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title={<span className="holo-text">{info?.name ?? t('sexcoin.title')}</span>}
        rtp={info?.rtp ?? 0.97}
        descriptionRu={info?.descriptionRu}
        descriptionEn={info?.descriptionEn}
        limits={limits}
        currency={currency}
        seed={authed ? seed : null}
        onRotateSeed={async () => {
          try {
            await api.post('/provably-fair/seed/rotate', {});
            qc.invalidateQueries({ queryKey: ['pf-seed'] });
            toast.success(t('roulette.rotated'));
          } catch (e) {
            toast.error(apiError(e));
          }
        }}
      />
    </GameLayout>
  );
}
