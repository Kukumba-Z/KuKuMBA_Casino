import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Minus, Plus, Shield, Volume2, VolumeX, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { GameInfoModal } from '../components/GameInfoModal';
import { GameLayout } from '../components/GameLayout';
import api, { apiError } from '../lib/api';
import { debitLocalBalance } from '../lib/balances';
import { betLimits, clampStake } from '../lib/bets';
import { fmt, useBalances, useCurrencies } from '../lib/hooks';
import { setSoundEnabled, sfx } from '../lib/sound';
import { useAuth } from '../store/auth';
import { useUI } from '../store/ui';
import { toast } from '../store/toast';

const GRID = 25;
const MIN_MINES = 2;
const MAX_MINES = 24;

/** The server's board view (see MinesService.viewOf) — the page renders it verbatim. */
interface MinesView {
  roundId: string;
  phase: 'PLAYING' | 'SETTLED';
  status: 'PLAYING' | 'WON' | 'LOST' | 'PUSH';
  minesCount: number;
  picks: number[];
  safeCount: number;
  currentMultiplier: number;
  nextMultiplier: number | null;
  cashoutAmount: string;
  stake: string;
  currency: string;
  mode: string;
  multipliers: number[];
  autoCashoutAt: number | null;
  serverNow: number;
  /** SETTLED only — the layout is never sent while the round is live. */
  minePositions?: number[];
  boomTile?: number | null;
  multiplier?: number;
  payout?: string;
}

type RecentChip = { status: string; mult: number };

/** Compact multiplier: ×12.55 below a thousand, ×48.04k, ×5.04M above. */
const fmtMult = (m: number) =>
  m >= 1e6 ? `×${(m / 1e6).toFixed(2)}M` : m >= 1000 ? `×${(m / 1000).toFixed(2)}k` : `×${m.toFixed(2)}`;

/** Found crystal — inline SVG, mint/lav facets (no binary assets, design rule). */
function Crystal({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M12 2.5 L19.5 9 L12 21.5 L4.5 9 Z" fill="#7EE7C7" opacity="0.9" />
      <path d="M12 2.5 L19.5 9 L12 12.5 Z" fill="#B79CED" opacity="0.75" />
      <path d="M12 2.5 L4.5 9 L12 12.5 Z" fill="#A8F0DB" opacity="0.85" />
      <path d="M4.5 9 L12 21.5 L12 12.5 Z" fill="#5ED0AE" opacity="0.9" />
    </svg>
  );
}

/** A revealed mine — round bomb with cross-spikes, roul-red. */
function Mine({ className, dim }: { className?: string; dim?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden opacity={dim ? 0.55 : 1}>
      <circle cx="12" cy="12" r="6" fill="#E5484D" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" stroke="#E5484D" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="10" cy="10" r="1.6" fill="rgba(255,255,255,0.55)" />
    </svg>
  );
}

/**
 * KuKuMBA Mines — a 5×5 board against the house. The page is a dumb terminal
 * for the mines API (apps/api/src/modules/games/mines): it only ever submits
 * tile numbers and renders the server's view of the board, so no outcome logic
 * lives here. While the round is live the server never sends mine positions —
 * the full layout arrives only with the settled view.
 */
export default function Mines() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const authed = !!useAuth((s) => s.accessToken);
  const { mode, currency, sound, toggleSound, quick, toggleQuick } = useUI();

  // Keep the sound engine in sync with the persisted preference (as in Roulette).
  useEffect(() => setSoundEnabled(sound), [sound]);

  const [mines, setMines] = useState(3);
  const [minesStr, setMinesStr] = useState('3');
  // Keyed by the mine count so the ladder refetches per board; the admin RTP
  // panel invalidates by the ['mines-info'] prefix, so retunes refresh it live.
  const { data: info } = useQuery({
    queryKey: ['mines-info', mines],
    queryFn: async () => (await api.get('/games/mines', { params: { mines } })).data,
  });
  const { data: balances } = useBalances();
  const { data: currencies } = useCurrencies();
  const { data: seed } = useQuery({ queryKey: ['pf-seed'], enabled: authed, queryFn: async () => (await api.get('/provably-fair/seed')).data });

  const cur = currencies?.find((c) => c.code === currency);
  const limits = useMemo(() => betLimits(cur, mode), [cur, mode]);
  const bal = balances?.find((b) => b.mode === mode && b.currency === currency);

  const [view, setView] = useState<MinesView | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingTile, setPendingTile] = useState<number | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [stakeStr, setStakeStr] = useState('10');
  // Session-only strip of recent rounds (like upgrader's recent spins).
  const [recent, setRecent] = useState<RecentChip[]>([]);
  // Auto-cashout deadline mapped onto the local clock (server clocks may differ).
  const deadlineRef = useRef<number | null>(null);
  const settledRounds = useRef(new Set<string>());
  const ladderRef = useRef<HTMLDivElement | null>(null);
  const [, forceTick] = useState(0);

  const playing = view?.phase === 'PLAYING';

  const stake = clampStake(Number(stakeStr) || limits.min, limits);
  useEffect(() => {
    setStakeStr((s) => String(clampStake(Number(s) || limits.min, limits)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, mode]);
  const setStake = (v: number) => setStakeStr(String(clampStake(v, limits)));
  const stakeNum = Number(stakeStr);
  const outOfRange = stakeStr.trim() !== '' && (stakeNum > limits.max || stakeNum < limits.min);

  const setMinesClamped = (v: number) => {
    const m = Math.min(MAX_MINES, Math.max(MIN_MINES, Math.round(Number(v) || MIN_MINES)));
    setMines(m);
    setMinesStr(String(m));
  };
  // Free typing (digits only); the canonical `mines` follows only valid values,
  // and blur snaps the field back to the canon (same pattern as the stake input).
  const onMinesInput = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 2);
    setMinesStr(digits);
    const n = Number(digits);
    if (digits !== '' && n >= MIN_MINES && n <= MAX_MINES) setMines(n);
  };

  /** Fold a server view into the page: sounds, deadline, recent, wallet caches. */
  const applyView = (data: MinesView, opts?: { silent?: boolean }) => {
    deadlineRef.current = data.autoCashoutAt != null ? Date.now() + (data.autoCashoutAt - data.serverNow) : null;
    setView(data);
    if (data.phase === 'SETTLED' && !settledRounds.current.has(data.roundId)) {
      settledRounds.current.add(data.roundId);
      if (!opts?.silent) {
        if (data.status === 'LOST') sfx.boom();
        else if (data.status === 'WON') sfx.win();
      }
      setRecent((r) => [{ status: data.status, mult: data.multiplier ?? 0 }, ...r].slice(0, 10));
      qc.invalidateQueries({ queryKey: ['balances'] });
      qc.invalidateQueries({ queryKey: ['my-bonuses'] }); // live wagering progress
      qc.invalidateQueries({ queryKey: ['pf-seed'] });
    }
  };

  // Re-attach to a board left open by a reload/navigation (pattern Ponyjack.tsx).
  const reattached = useRef(false);
  useEffect(() => {
    if (!authed || reattached.current) return;
    reattached.current = true;
    (async () => {
      try {
        const { data } = await api.get('/games/mines/active');
        if (data.active) {
          applyView(data, { silent: true });
          setMinesClamped(data.minesCount);
        }
      } catch {
        /* nothing to re-attach */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  // 1s heartbeat while a board is open: drives the auto-cashout countdown and,
  // once the deadline passes, polls the round so the sweeper's verdict lands.
  useEffect(() => {
    if (!playing || !view) return;
    const id = window.setInterval(async () => {
      forceTick((x) => x + 1);
      const dl = deadlineRef.current;
      if (dl != null && Date.now() > dl + 1500 && !busy) {
        try {
          const { data } = await api.get(`/games/mines/round/${view.roundId}`);
          if (data.phase === 'SETTLED') applyView(data);
        } catch {
          /* transient — next tick retries */
        }
      }
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, view?.roundId, busy]);

  // Keep the "next step" chip of the cashout ladder in sight as the run deepens.
  useEffect(() => {
    const el = ladderRef.current;
    if (!el || !view) return;
    const chip = el.children[Math.min(view.safeCount, el.children.length - 1)] as HTMLElement | undefined;
    if (chip) el.scrollTo({ left: chip.offsetLeft - el.clientWidth / 2 + chip.clientWidth / 2, behavior: quick ? 'auto' : 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.safeCount, view?.roundId]);

  const start = async () => {
    if (!authed) {
      toast.error(t('mines.needLogin'));
      return;
    }
    if (busy || playing) return;
    if (outOfRange) {
      toast.error(`${t('roulette.limits')}: ${fmt(limits.min, 2)}–${fmt(limits.max, 2)} ${currency}`);
      return;
    }
    setBusy(true);
    sfx.chip();
    try {
      const { data } = await api.post('/games/mines/start', { stake, currency, mode, mines });
      debitLocalBalance(qc, currency, mode, stake);
      applyView(data);
    } catch (e) {
      toast.error(apiError(e));
    }
    setBusy(false);
  };

  const pick = async (tile: number) => {
    if (!view || !playing || busy) return;
    setBusy(true);
    setPendingTile(tile);
    try {
      const { data } = await api.post('/games/mines/pick', { roundId: view.roundId, tile });
      // The board renders ONLY the server's answer — no client-side outcome logic.
      if (data.phase === 'PLAYING' || data.status === 'WON') {
        if (data.status !== 'WON') sfx.reveal(data.safeCount);
      }
      applyView(data);
    } catch (e) {
      toast.error(apiError(e));
    }
    setPendingTile(null);
    setBusy(false);
  };

  const cashout = async () => {
    if (!view || !playing || busy || view.safeCount < 1) return;
    setBusy(true);
    try {
      const { data } = await api.post('/games/mines/cashout', { roundId: view.roundId });
      applyView(data);
    } catch (e) {
      toast.error(apiError(e));
    }
    setBusy(false);
  };

  const secondsLeft = deadlineRef.current != null ? Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)) : null;

  // The ladder to draw: the live round's snapshot when playing, else the info's.
  const ladder: number[] = (playing ? view?.multipliers : info?.multipliers) ?? [];
  const safeCount = view?.safeCount ?? 0;
  const nextMult = playing ? view?.nextMultiplier ?? null : null;
  const nextCashout = nextMult != null ? Number(view!.stake) * nextMult : null;
  const minesOnBoard = playing || view?.phase === 'SETTLED' ? view!.minesCount : mines;
  const safeLeft = GRID - minesOnBoard - safeCount;

  const message = useMemo(() => {
    if (!view) return { text: '', cls: '', sub: '' };
    if (view.phase === 'PLAYING') {
      const sub = secondsLeft != null && secondsLeft <= 20 ? t('mines.autoIn', { s: secondsLeft }) : '';
      return view.safeCount === 0
        ? { text: t('mines.pickFirst'), cls: 'text-white/70', sub }
        : { text: `${fmtMult(view.currentMultiplier)}`, cls: 'text-mint', sub };
    }
    if (view.status === 'WON') {
      const full = view.safeCount === GRID - view.minesCount;
      return { text: full ? t('mines.fullClear') : t('mines.win'), cls: full ? 'holo-text' : 'text-mint', sub: `+${fmt(view.payout ?? 0, 2)} ${view.currency}` };
    }
    if (view.status === 'PUSH') return { text: t('mines.push'), cls: 'text-white/75', sub: '' };
    return { text: t('mines.lose'), cls: 'text-roul-red', sub: `−${fmt(view.stake, 2)} ${view.currency}` };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, secondsLeft, t]);

  const scrollLadder = (dir: -1 | 1) => ladderRef.current?.scrollBy({ left: dir * ladderRef.current.clientWidth * 0.7, behavior: 'smooth' });

  const chipCls = (c: RecentChip) =>
    c.status === 'WON' ? 'border-white/10 bg-white/5 text-mint' : c.status === 'PUSH' ? 'border-white/10 bg-white/5 text-white/60' : 'border-roul-red/25 bg-roul-red/10 text-roul-red/70';

  // ── board tiles: everything below renders the server view verbatim ──
  const settledView = view?.phase === 'SETTLED' ? view : null;
  const opened = new Set(view?.picks ?? []);
  const mineSet = new Set(settledView?.minePositions ?? []);

  const tileFace = (i: number) => {
    if (settledView) {
      if (mineSet.has(i)) return <Mine className="h-1/2 w-1/2" dim={settledView.boomTile !== i} />;
      if (opened.has(i)) return <Crystal className="h-1/2 w-1/2" />;
      return null;
    }
    if (opened.has(i)) return <Crystal className="h-1/2 w-1/2" />;
    return null;
  };

  const tileCls = (i: number) => {
    const base = `relative grid aspect-square place-items-center rounded-2xl border transition ${quick ? 'duration-75' : 'duration-200'}`;
    if (settledView) {
      if (settledView.boomTile === i) return `${base} border-roul-red bg-roul-red/20`;
      if (mineSet.has(i)) return `${base} border-roul-red/30 bg-roul-red/[0.06] opacity-70`;
      if (opened.has(i)) return `${base} border-mint/30 bg-mint/[0.07] shadow-glow-mint`;
      return `${base} border-white/10 bg-white/[0.03] opacity-40`;
    }
    if (opened.has(i)) return `${base} border-mint/30 bg-mint/[0.07] shadow-glow-mint`;
    if (playing) {
      const pending = pendingTile === i;
      return `${base} border-white/10 bg-white/[0.03] ${pending ? 'animate-pulse border-white/30' : 'hover:border-white/30 hover:bg-white/[0.07] cursor-pointer'}`;
    }
    return `${base} border-white/10 bg-white/[0.03] opacity-60`;
  };

  return (
    <GameLayout
      aside={
        <>
          <div className="card flex flex-col gap-4 p-5">
            {/* stake */}
            <div>
              <div className="mb-2 text-xs font-semibold text-white/55">{t('mines.stake')}</div>
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
                    aria-label={t('mines.stake')}
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

            {/* mine count: stepper + presets */}
            <div>
              <div className="mb-2 text-xs font-semibold text-white/55">{t('mines.minesLabel')}</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setMinesClamped(mines - 1)} className="btn-ghost !px-3" disabled={busy || playing || mines <= MIN_MINES} aria-label="−1">
                  <Minus size={16} />
                </button>
                <input
                  value={minesStr}
                  onChange={(e) => onMinesInput(e.target.value)}
                  onBlur={() => setMinesClamped(Number(minesStr) || mines)}
                  inputMode="numeric"
                  disabled={busy || playing}
                  aria-label={t('mines.minesLabel')}
                  className="input flex-1 !py-2.5 text-center font-display text-lg font-black tabular-nums"
                />
                <button onClick={() => setMinesClamped(mines + 1)} className="btn-ghost !px-3" disabled={busy || playing || mines >= MAX_MINES} aria-label="+1">
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {/* main action: start the round / cash out */}
            {playing ? (
              <button onClick={cashout} disabled={busy || safeCount < 1} className="crash-action btn-crash-mint">
                <span className="font-display text-lg font-black">{t('mines.cashout')}</span>
                <span className="text-sm font-bold opacity-85">
                  {safeCount >= 1 ? `${fmt(view!.cashoutAmount, 2)} ${view!.currency}` : t('mines.pickFirstShort')}
                </span>
              </button>
            ) : (
              <button onClick={start} disabled={busy || !(info?.enabled ?? true)} className="crash-action btn-crash-primary">
                <span className="font-display text-lg font-black">{t('mines.play')}</span>
                <span className="text-sm font-bold opacity-85">{fmt(stake, 2)} {currency}</span>
              </button>
            )}
            {!authed && (
              <div className="text-center text-sm text-white/50">
                <Link to="/login" className="text-lav hover:underline">{t('common.login')}</Link> · {t('mines.needLogin')}
              </div>
            )}
          </div>

          {/* recent rounds — this visit only; last 10 as a 2×5 grid */}
          <div className="card p-3.5">
            <div className="mb-2 text-[11px] font-bold tracking-wider text-white/45">{t('mines.recent')}</div>
            {recent.length === 0 ? (
              <span className="text-sm text-white/35">{t('mines.recentEmpty')}</span>
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
          {/* counters above the board — one line always; labels are desktop-only */}
          <div className="flex items-center justify-center gap-2 px-10">
            <span className="chip text-[11px] font-bold">
              <Crystal className="h-3.5 w-3.5" />
              <span className="tabular-nums text-mint">{Math.max(0, safeLeft)}</span>
              <span className="hidden text-white/50 sm:inline">{t('mines.safeLeft')}</span>
            </span>
            <span className="chip text-[11px] font-bold">
              <Mine className="h-3.5 w-3.5" />
              <span className="tabular-nums text-roul-red">{minesOnBoard}</span>
              <span className="hidden text-white/50 sm:inline">{t('mines.minesOnField')}</span>
            </span>
          </div>

          {/* verdict / progress strip — mounted only while a round exists, so an
              idle scene has no dead space between the counters and the board */}
          {view && (
            <div className="grid h-12 place-items-center text-center">
              <div>
                <div className={`font-display text-lg font-black sm:text-xl ${message.cls}`}>{message.text}</div>
                <div className="h-4 text-xs font-bold tabular-nums text-white/60">{message.sub}</div>
              </div>
            </div>
          )}

          {/* the 5×5 board (kept compact on phones) */}
          <div className="grid w-full max-w-[300px] grid-cols-5 gap-1.5 sm:max-w-[420px] sm:gap-2">
            {Array.from({ length: GRID }, (_, i) => (
              <button
                key={i}
                onClick={() => pick(i)}
                disabled={!playing || busy || opened.has(i)}
                aria-label={`${t('mines.tile')} ${i + 1}`}
                className={tileCls(i)}
              >
                <span className={`grid h-full w-full place-items-center ${quick ? '' : 'animate-fadeup'}`}>{tileFace(i)}</span>
              </button>
            ))}
          </div>

          {/* the cashout ladder: upcoming multipliers, current step lit */}
          <div className="w-full max-w-[420px]">
            <div className="flex items-center gap-1.5">
              <button onClick={() => scrollLadder(-1)} className="btn-ghost !p-1.5" aria-label="‹">
                <ChevronLeft size={14} />
              </button>
              <div ref={ladderRef} className="flex flex-1 gap-1.5 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {ladder.map((m, i) => {
                  const k = i + 1;
                  const passed = (playing || settledView) && k <= safeCount;
                  const next = playing && k === safeCount + 1;
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
              {nextCashout != null ? `${t('mines.nextMult')}: ${fmt(nextCashout, 2)} ${view!.currency}` : ''}
            </div>
          </div>
        </div>

        {/* corner controls — sound / info / turbo, as in Upgrader */}
        <button
          type="button"
          onClick={toggleSound}
          className="absolute left-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-night/55 text-white/70 backdrop-blur transition hover:bg-white/10"
          aria-label={sound ? t('roulette.soundOff') : t('roulette.soundOn')}
          title={sound ? t('roulette.soundOff') : t('roulette.soundOn')}
        >
          {sound ? <Volume2 size={18} /> : <VolumeX size={18} className="text-white/40" />}
        </button>
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-night/55 text-mint backdrop-blur transition hover:bg-white/10"
          aria-label={t('roulette.info')}
          title={t('roulette.info')}
        >
          <Shield size={18} />
        </button>
        <button
          type="button"
          onClick={toggleQuick}
          aria-pressed={quick}
          aria-label={t('roulette.quickPlay')}
          title={t('roulette.quickPlay')}
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
        title={<span className="holo-text">{info?.name ?? t('mines.title')}</span>}
        rtp={info?.rtp ?? 0.99}
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
