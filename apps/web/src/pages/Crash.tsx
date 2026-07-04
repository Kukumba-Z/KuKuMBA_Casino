import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Shield, Volume2, VolumeX, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { GameInfoModal } from '../components/GameInfoModal';
import { GameLayout } from '../components/GameLayout';
import { CrashScene } from '../components/crash/CrashScene';
import { CrashEngine } from '../components/crash/engine';
import type { CrashStatePayload } from '../components/crash/engine';
import api, { apiError } from '../lib/api';
import { betLimits, clampStake, roundStake } from '../lib/bets';
import { fmt, useBalances, useCurrencies } from '../lib/hooks';
import { getSocket } from '../lib/socket';
import { useAuth } from '../store/auth';
import { useUI } from '../store/ui';
import { toast } from '../store/toast';

type Phase = 'idle' | 'running' | 'crashed';

const fmtMult = (m: number) =>
  m >= 1e6 ? (m / 1e6).toFixed(2) + 'M' : m >= 1e5 ? Math.round(m / 1e3) + 'K' : m >= 1e4 ? (m / 1e3).toFixed(1) + 'K' : m >= 100 ? Math.round(m).toString() : m.toFixed(2);

/**
 * VODKA WIN Crash — the page is a thin HUD around the canvas engine; every
 * ruble of truth comes from the crash API (see apps/api/src/modules/games/crash):
 *  - normal round: POST play → engine climbs the shared time curve blind (the
 *    server never reveals the crash point mid-round), the page polls the round
 *    and finishes the scene with settleFromServer();
 *  - turbo (the shared "quick play" toggle, like roulette's instant spins):
 *    the server settles in the bet transaction and the engine replays the
 *    known outcome instantly. Turbo needs an auto-cashout target.
 */
export default function Crash() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const authed = !!useAuth((s) => s.accessToken);
  const { mode, currency, sound, toggleSound, quick, toggleQuick } = useUI();

  const { data: info } = useQuery({ queryKey: ['crash-info'], queryFn: async () => (await api.get('/games/crash')).data });
  const { data: balances } = useBalances();
  const { data: currencies } = useCurrencies();
  const { data: seed } = useQuery({ queryKey: ['pf-seed'], enabled: authed, queryFn: async () => (await api.get('/provably-fair/seed')).data });

  const cur = currencies?.find((c) => c.code === currency);
  const limits = useMemo(() => betLimits(cur, mode), [cur, mode]);
  const bal = balances?.find((b) => b.mode === mode && b.currency === currency);

  const engineRef = useRef<CrashEngine | null>(null);
  const prevPhase = useRef<Phase>('idle');
  // The active server round; `settled` flips exactly once (poll/cashout race-safe).
  const roundRef = useRef<{ id: string; autoAt: number | null; settled: boolean } | null>(null);
  const pollTimer = useRef<number | null>(null);
  const lastPoll = useRef(0);

  const [phase, setPhase] = useState<Phase>('idle');
  const [mult, setMult] = useState(1);
  const [stakeStr, setStakeStr] = useState('10');
  const [autoOn, setAutoOn] = useState(false);
  const [autoStr, setAutoStr] = useState('2.00');
  const [needAuto, setNeedAuto] = useState(false);
  const [betPlaced, setBetPlaced] = useState(false);
  const [betStake, setBetStake] = useState(0);
  // Currency the flying bet was placed in (can differ from the picker after a reload).
  const [betCur, setBetCur] = useState('');
  const [cashedAt, setCashedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  // Session-only strip of recent crash points (like the roulette's recent numbers).
  const [recent, setRecent] = useState<number[]>([]);

  const stake = clampStake(Number(stakeStr) || limits.min, limits);
  useEffect(() => {
    setStakeStr((s) => String(clampStake(Number(s) || limits.min, limits)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, mode]);
  const setStake = (v: number) => setStakeStr(String(clampStake(v, limits)));
  const stakeNum = Number(stakeStr);
  const outOfRange = stakeStr.trim() !== '' && (stakeNum > limits.max || stakeNum < limits.min);

  const stopPoll = () => {
    if (pollTimer.current) window.clearInterval(pollTimer.current);
    pollTimer.current = null;
  };
  useEffect(() => () => stopPoll(), []);

  /** Fold a final server verdict into the scene + wallet (idempotent). */
  const applySettled = (data: any) => {
    const r = roundRef.current;
    if (!r || r.settled || data.status === 'RUNNING') return;
    r.settled = true;
    stopPoll();
    const won = data.status === 'WON';
    engineRef.current?.settleFromServer(Number(data.crashPoint), won ? Number(data.multiplier) : null);
    setCashedAt(won ? Number(data.multiplier) : null);
    qc.invalidateQueries({ queryKey: ['balances'] });
    qc.invalidateQueries({ queryKey: ['my-bonuses'] }); // live wagering progress
    qc.invalidateQueries({ queryKey: ['pf-seed'] });
  };

  const poll = async () => {
    const r = roundRef.current;
    if (!r || r.settled) return;
    lastPoll.current = Date.now();
    try {
      const { data } = await api.get(`/games/crash/round/${r.id}`);
      applySettled(data);
    } catch {
      /* transient network hiccup — the next tick retries; the server sweeper
         guarantees the round settles even if the tab dies */
    }
  };
  const startPoll = () => {
    stopPoll();
    // Backup only — the verdict normally arrives instantly over the socket
    // (crash:settle). This still guarantees a resolution if the push is missed.
    pollTimer.current = window.setInterval(poll, 500);
  };

  const onState = (s: CrashStatePayload) => {
    if (s.phase === 'idle' && prevPhase.current !== 'idle') {
      setBetPlaced(false);
      setBetStake(0);
      setCashedAt(null);
    }
    prevPhase.current = s.phase as Phase;
    setPhase(s.phase as Phase);
    setMult(s.multiplier);
    // Server round with an auto-cashout: once the curve passes the target the
    // verdict is already decided server-side — ask for it right away.
    const r = roundRef.current;
    if (s.phase === 'running' && r && !r.settled && r.autoAt && s.multiplier >= r.autoAt && Date.now() - lastPoll.current > 250) {
      void poll();
    }
  };
  const onRoundEnd = (crashPoint: number) => setRecent((h) => [crashPoint, ...h].slice(0, 10));

  // Instant verdict: the server pushes crash:settle the moment the round is
  // decided (crash point passed / auto-cashout hit), so the scene resolves on
  // the true multiplier within a network hop — no display lag, no poll wait.
  const applySettledRef = useRef(applySettled);
  applySettledRef.current = applySettled;
  useEffect(() => {
    if (!authed) return;
    const s = getSocket();
    const onSettle = (data: any) => {
      const r = roundRef.current;
      if (r && !r.settled && data?.roundId === r.id) applySettledRef.current(data);
    };
    s.on('crash:settle', onSettle);
    return () => { s.off('crash:settle', onSettle); };
  }, [authed]);

  // Re-attach to a round left flying by a reload/navigation: restore the HUD,
  // sync the curve by the server clock and resume polling for the verdict.
  const reattached = useRef(false);
  useEffect(() => {
    if (!authed || reattached.current) return;
    reattached.current = true;
    (async () => {
      try {
        const { data } = await api.get('/games/crash/active');
        if (!data.active) return;
        const auto = data.autoCashout ? Number(data.autoCashout) : null;
        roundRef.current = { id: data.roundId, autoAt: auto, settled: false };
        setBetPlaced(true);
        setBetStake(Number(data.stake));
        setBetCur(data.currency);
        setCashedAt(null);
        engineRef.current?.placeBet(auto, null, Math.max(0, Number(data.serverNow) - Number(data.startedAt)));
        startPoll();
      } catch {
        /* nothing to re-attach */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  const autoNum = Number(autoStr);
  const autoValid = isFinite(autoNum) && autoNum >= 1.01;

  const placeBet = async () => {
    engineRef.current?.resumeAudio();
    if (!authed) {
      toast.error(t('crash.needLogin'));
      return;
    }
    if (phase !== 'idle' || busy) return;
    if (autoOn && !autoValid) {
      setNeedAuto(true);
      toast.error(t('crash.needAutoHint'));
      return;
    }
    // Turbo settles by the auto-cashout target — it must be set.
    if (quick && (!autoOn || !autoValid)) {
      setNeedAuto(true);
      toast.error(t('crash.turboNeedsAuto'));
      return;
    }
    setBusy(true);
    setNeedAuto(false);
    const auto = autoOn && autoValid ? roundStake(autoNum, 2) : null;
    const t0 = performance.now();
    try {
      const { data } = await api.post('/games/crash/play', {
        stake,
        currency,
        mode,
        ...(auto ? { autoCashout: auto } : {}),
        ...(quick ? { instant: true } : {}),
      });
      const rtt = performance.now() - t0;
      setBetPlaced(true);
      setBetStake(stake);
      setBetCur(currency);
      setCashedAt(null);
      setNeedAuto(false);
      qc.invalidateQueries({ queryKey: ['balances'] });
      if (data.status === 'RUNNING') {
        roundRef.current = { id: data.roundId, autoAt: auto, settled: false };
        // Sync the local curve with the server clock (half the RTT ≈ the lag).
        const elapsedMs = Math.max(0, Number(data.serverNow) - Number(data.startedAt)) + rtt / 2;
        engineRef.current?.placeBet(auto, null, elapsedMs);
        startPoll();
      } else {
        // Turbo: the server already settled — replay the known outcome.
        roundRef.current = { id: data.roundId, autoAt: auto, settled: true };
        engineRef.current?.placeBet(auto, Number(data.crashPoint), 0);
        setCashedAt(data.status === 'WON' ? Number(data.multiplier) : null);
        qc.invalidateQueries({ queryKey: ['my-bonuses'] });
        qc.invalidateQueries({ queryKey: ['pf-seed'] });
      }
    } catch (e) {
      toast.error(apiError(e));
    }
    setBusy(false);
  };

  const cashOut = async () => {
    const r = roundRef.current;
    if (!r || r.settled || busy) return;
    setBusy(true);
    try {
      // Cash out at the multiplier the player actually SEES (the scene lags the
      // server clock a touch — see RENDER_LAG_MS). The server clamps this to its
      // own elapsed time, so it can only ever settle *earlier/lower*, never more.
      const atMultiplier = engineRef.current?.getDisplayMult();
      const { data } = await api.post('/games/crash/cashout', { roundId: r.id, atMultiplier });
      applySettled(data);
    } catch (e) {
      toast.error(apiError(e));
      void poll();
    }
    setBusy(false);
  };

  const onAction = () => {
    if (phase === 'idle') void placeBet();
    else if (phase === 'running' && betPlaced && cashedAt == null && !quick) void cashOut();
  };

  const autoArmed = betPlaced && cashedAt == null && roundRef.current?.autoAt != null && mult >= (roundRef.current?.autoAt ?? Infinity);
  const action = useMemo(() => {
    if (phase === 'idle')
      return { label: t('crash.placeBet'), sub: `${fmt(stake, 2)} ${currency}`, cls: 'btn-crash-primary', disabled: busy };
    if (phase === 'running') {
      if (betPlaced && cashedAt == null && quick) return { label: t('crash.turboRunning'), sub: '', cls: 'btn-crash-turbo', disabled: true };
      if (betPlaced && cashedAt == null && autoArmed) return { label: t('crash.autoFiring'), sub: '', cls: 'btn-crash-turbo', disabled: true };
      if (betPlaced && cashedAt == null)
        return { label: t('crash.cashout'), sub: `${fmt(betStake * mult, 2)} ${betCur || currency}`, cls: 'btn-crash-mint', disabled: busy };
      if (cashedAt != null) return { label: t('crash.survived'), sub: `@ ${fmtMult(cashedAt)}×`, cls: 'btn-crash-done', disabled: true };
      return { label: t('crash.waiting'), sub: '', cls: 'btn-crash-mute', disabled: true };
    }
    if (betPlaced && cashedAt == null) return { label: t('crash.busted'), sub: '', cls: 'btn-crash-lose', disabled: true };
    if (cashedAt != null) return { label: t('crash.survived'), sub: `@ ${fmtMult(cashedAt)}×`, cls: 'btn-crash-done', disabled: true };
    return { label: t('crash.nextBet'), sub: '', cls: 'btn-crash-mute', disabled: true };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, betPlaced, cashedAt, betStake, betCur, mult, stake, quick, busy, currency, autoArmed, t]);

  const histColor = (v: number) => (v < 2 ? 'text-roul-red' : v < 10 ? 'text-sky' : v < 100 ? 'text-mint' : v < 1e4 ? 'text-sun' : 'text-bubble');

  const sceneTexts = useMemo(
    () => ({
      idle: t('crash.sceneIdle'),
      lost: t('crash.sceneLost'),
      won: t('crash.sceneWon'),
      finale: t('crash.sceneFinale'),
    }),
    [t],
  );

  return (
    <GameLayout
      aside={
        <>
          <div className="card flex flex-col gap-4 p-5">
            <div>
              <div className="mb-2 text-xs font-semibold text-white/55">{t('crash.stake')}</div>
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
                    disabled={busy || phase === 'running'}
                    aria-invalid={outOfRange}
                    aria-label={t('crash.stake')}
                    className={`input !py-3 pr-14 text-right font-extrabold tabular-nums ${outOfRange ? '!border-roul-red' : ''}`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-white/40">
                    {currency}
                  </span>
                </div>
                <button onClick={() => setStake(stake / 2)} className="btn-ghost !px-3" disabled={busy}>½</button>
                <button onClick={() => setStake(stake * 2)} className="btn-ghost !px-3" disabled={busy}>2×</button>
                <button
                  onClick={() => setStake(Math.min(limits.max, Number(bal?.amount ?? limits.max)))}
                  className="btn-ghost !px-3 text-xs"
                  disabled={busy}
                >
                  {t('roulette.maxBtn')}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3">
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => { setAutoOn((a) => !a); setNeedAuto(false); }}
                  aria-pressed={autoOn}
                  className={`relative h-6 w-11 rounded-full transition ${autoOn ? 'bg-mint' : 'bg-white/15'}`}
                >
                  <span className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-night transition-all ${autoOn ? 'left-[23px]' : 'left-[3px]'}`} />
                </button>
                <span className="text-sm font-semibold text-white/80">{t('crash.autoCashout')}</span>
              </div>
              <div className="relative w-28">
                <input
                  value={autoStr}
                  onChange={(e) => { setAutoStr(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')); setNeedAuto(false); }}
                  inputMode="decimal"
                  aria-invalid={needAuto}
                  aria-label={t('crash.autoCashout')}
                  className={`input !py-2 pr-7 text-right font-bold tabular-nums ${needAuto ? '!border-sun' : ''}`}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-extrabold text-white/45">×</span>
              </div>
            </div>

            <button onClick={onAction} disabled={action.disabled} className={`crash-action ${action.cls}`}>
              <span className="font-display text-lg font-black">{action.label}</span>
              {action.sub && <span className="text-sm font-bold opacity-85">{action.sub}</span>}
            </button>
            {!authed && (
              <div className="text-center text-sm text-white/50">
                <Link to="/login" className="text-lav hover:underline">
                  {t('common.login')}
                </Link>{' '}
                · {t('crash.needLogin')}
              </div>
            )}
          </div>

          {/* recent rounds — this visit only; cleared when leaving the page */}
          <div className="card p-3.5">
            <div className="mb-2 text-[11px] font-bold tracking-wider text-white/45">{t('crash.recent')}</div>
            <div className="flex flex-wrap gap-1.5">
              {recent.length === 0 && <span className="text-sm text-white/35">{t('crash.recentEmpty')}</span>}
              {recent.map((v, i) => (
                <span key={i} className={`rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-display text-xs font-extrabold ${histColor(v)}`}>
                  {fmtMult(v)}×
                </span>
              ))}
            </div>
          </div>
        </>
      }
    >
      {/* Scene */}
      <div className="card relative overflow-hidden">
        <div className="relative">
          <CrashScene engineRef={engineRef} onState={onState} onRoundEnd={onRoundEnd} sound={sound} fast={quick} texts={sceneTexts} />

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
          {/* Quick play (турбо) — the same persisted toggle roulette uses. */}
          <button
            type="button"
            onClick={() => { toggleQuick(); setNeedAuto(false); }}
            aria-pressed={quick}
            disabled={phase === 'running'}
            aria-label={t('roulette.quickPlay')}
            title={t('roulette.quickPlay')}
            className={`absolute bottom-3 left-3 z-10 grid h-9 w-9 place-items-center rounded-xl border backdrop-blur transition disabled:opacity-50 ${
              quick ? 'border-sun/40 bg-sun/20 text-sun' : 'border-white/10 bg-night/55 text-white/70 hover:bg-white/10'
            }`}
          >
            <Zap size={18} />
          </button>
        </div>
      </div>

      {/* Info, rules & fairness — same shared dialog as roulette. */}
      <GameInfoModal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title={<span className="holo-text">{info?.name ?? t('crash.title')}</span>}
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
