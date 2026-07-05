import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Shield, Volume2, VolumeX, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { GameInfoModal } from '../components/GameInfoModal';
import { GameLayout } from '../components/GameLayout';
import { PlinkoScene } from '../components/plinko/PlinkoScene';
import { fmtMult, PlinkoEngine, type PlinkoDropInfo } from '../components/plinko/engine';
import api, { apiError } from '../lib/api';
import { debitLocalBalance } from '../lib/balances';
import { betLimits, clampStake } from '../lib/bets';
import { fmt, useBalances, useCurrencies } from '../lib/hooks';
import { useAuth } from '../store/auth';
import { useUI } from '../store/ui';
import { toast } from '../store/toast';

type Risk = 'LOW' | 'MEDIUM' | 'HIGH';
const RISKS: Risk[] = ['LOW', 'MEDIUM', 'HIGH'];
const ROWS = Array.from({ length: 9 }, (_, i) => 8 + i); // 8..16

/** Recent-drop chip colour by multiplier — mirrors the board's heat map. */
const chipColor = (m: number) =>
  m < 1 ? 'text-sky' : m < 1.5 ? 'text-mint' : m < 3 ? 'text-sun' : m < 12 ? 'text-[#FFB25C]' : m < 60 ? 'text-bubble' : 'text-roul-red';

/**
 * KuKuMBA Plinko — a thin HUD around the canvas engine; every ruble of truth
 * comes from the plinko API (apps/api/src/modules/games/plinko):
 *  - POST play settles the whole drop server-side (provably-fair path + slot)
 *    and returns it; the engine just animates that exact ball, so what you watch
 *    is what settled. The balance refresh is held until the ball lands, so the
 *    number never changes before the ball reaches its slot.
 */
export default function Plinko() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const authed = !!useAuth((s) => s.accessToken);
  const { mode, currency, sound, toggleSound, quick, toggleQuick } = useUI();

  const [risk, setRisk] = useState<Risk>('LOW');
  const [rows, setRows] = useState(8);

  const { data: info } = useQuery({
    queryKey: ['plinko-info', risk, rows],
    queryFn: async () => (await api.get(`/games/plinko?risk=${risk}&rows=${rows}`)).data,
  });
  const { data: balances } = useBalances();
  const { data: currencies } = useCurrencies();
  const { data: seed } = useQuery({ queryKey: ['pf-seed'], enabled: authed, queryFn: async () => (await api.get('/provably-fair/seed')).data });

  const cur = currencies?.find((c) => c.code === currency);
  const limits = useMemo(() => betLimits(cur, mode), [cur, mode]);
  const bal = balances?.find((b) => b.mode === mode && b.currency === currency);

  const engineRef = useRef<PlinkoEngine | null>(null);
  // Balls still dropping — kept in state so changing risk/rows is gated reactively
  // (a mid-flight re-layout would strand a ball on stale geometry).
  const [flying, setFlying] = useState(0);

  const [stakeStr, setStakeStr] = useState('10');
  const [busy, setBusy] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [recent, setRecent] = useState<number[]>([]);

  const stake = clampStake(Number(stakeStr) || limits.min, limits);
  useEffect(() => {
    setStakeStr((s) => String(clampStake(Number(s) || limits.min, limits)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, mode]);
  const setStake = (v: number) => setStakeStr(String(clampStake(v, limits)));
  const stakeNum = Number(stakeStr);
  const outOfRange = stakeStr.trim() !== '' && (stakeNum > limits.max || stakeNum < limits.min);

  // Push the payout table + geometry into the engine whenever the board changes.
  const mults: number[] = info?.multipliers ?? [];
  useEffect(() => {
    if (!engineRef.current || mults.length !== rows + 1) return;
    engineRef.current.setConfig(
      rows,
      mults.map((m) => ({ mult: m, label: fmtMult(m) })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, risk, info?.multipliers]);

  const onLand = (d: PlinkoDropInfo) => {
    setFlying((f) => Math.max(0, f - 1));
    setRecent((h) => [d.mult, ...h].slice(0, 12));
    // Reveal the settled balance exactly when the ball lands (not before).
    qc.invalidateQueries({ queryKey: ['balances'] });
    qc.invalidateQueries({ queryKey: ['my-bonuses'] });
    qc.invalidateQueries({ queryKey: ['pf-seed'] });
  };

  const drop = async () => {
    engineRef.current?.resumeAudio();
    if (!authed) {
      toast.error(t('plinko.needLogin'));
      return;
    }
    if (busy) return;
    if (outOfRange) {
      toast.error(`${t('roulette.limits')}: ${fmt(limits.min, 2)}–${fmt(limits.max, 2)} ${currency}`);
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post('/games/plinko/play', { stake, currency, mode, risk, rows });
      // Show the stake debit at once (100 → 90); the true settled balance is
      // revealed when the ball lands (onLand invalidates ['balances']).
      debitLocalBalance(qc, currency, mode, stake);
      setFlying((f) => f + 1);
      // Animate the exact server path; balance refresh happens on landing.
      engineRef.current?.drop(data.path, data.slot, data.multiplier, { payout: data.payout });
      // In quick mode the drop is near-instant; the debit still shows on land.
    } catch (e) {
      toast.error(apiError(e));
    }
    setBusy(false);
  };

  const boardBusy = flying > 0;

  return (
    <GameLayout
      aside={
        <>
          <div className="card flex flex-col gap-4 p-5">
            {/* stake */}
            <div>
              <div className="mb-2 text-xs font-semibold text-white/55">{t('plinko.stake')}</div>
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
                    disabled={busy}
                    aria-invalid={outOfRange}
                    aria-label={t('plinko.stake')}
                    className={`input !py-3 pr-14 text-right font-extrabold tabular-nums ${outOfRange ? '!border-roul-red' : ''}`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-white/40">{currency}</span>
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

            {/* risk + rows */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1.5 text-xs font-semibold text-white/55">{t('plinko.risk')}</div>
                <select
                  value={risk}
                  onChange={(e) => setRisk(e.target.value as Risk)}
                  disabled={boardBusy}
                  aria-label={t('plinko.risk')}
                  className="input !py-2.5"
                >
                  {RISKS.map((r) => (
                    <option key={r} value={r}>{t(`plinko.risk${r[0] + r.slice(1).toLowerCase()}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="mb-1.5 text-xs font-semibold text-white/55">{t('plinko.pins')}</div>
                <select
                  value={rows}
                  onChange={(e) => setRows(Number(e.target.value))}
                  disabled={boardBusy}
                  aria-label={t('plinko.pins')}
                  className="input !py-2.5"
                >
                  {ROWS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>

            <button onClick={drop} disabled={busy} className="crash-action btn-crash-primary">
              <span className="font-display text-lg font-black">{t('plinko.play')}</span>
              <span className="text-sm font-bold opacity-85">{fmt(stake, 2)} {currency}</span>
            </button>
            {!authed && (
              <div className="text-center text-sm text-white/50">
                <Link to="/login" className="text-lav hover:underline">{t('common.login')}</Link> · {t('plinko.needLogin')}
              </div>
            )}
          </div>

          {/* recent drops — this visit only */}
          <div className="card p-3.5">
            <div className="mb-2 text-[11px] font-bold tracking-wider text-white/45">{t('plinko.recent')}</div>
            <div className="flex flex-wrap gap-1.5">
              {recent.length === 0 && <span className="text-sm text-white/35">{t('plinko.recentEmpty')}</span>}
              {recent.map((v, i) => (
                <span key={i} className={`rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-display text-xs font-extrabold ${chipColor(v)}`}>
                  ×{fmtMult(v)}
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
          <PlinkoScene engineRef={engineRef} onLand={onLand} sound={sound} fast={quick} texts={{ idle: t('plinko.sceneIdle') }} />

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
          {/* Quick play (турбо) — near-instant drops, the shared persisted toggle. */}
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
      </div>

      {/* Info, rules & fairness — the shared dialog. */}
      <GameInfoModal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title={<span className="holo-text">{info?.name ?? t('plinko.title')}</span>}
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
