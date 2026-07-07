import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Shield, Volume2, VolumeX, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { GameInfoModal } from '../components/GameInfoModal';
import { GameLayout } from '../components/GameLayout';
import { UpgraderWheel, type UpgraderWheelHandle } from '../components/upgrader/UpgraderWheel';
import api, { apiError } from '../lib/api';
import { debitLocalBalance } from '../lib/balances';
import { betLimits, clampStake } from '../lib/bets';
import { fmt, useBalances, useCurrencies } from '../lib/hooks';
import { setSoundEnabled } from '../lib/sound';
import { useAuth } from '../store/auth';
import { useUI } from '../store/ui';
import { toast } from '../store/toast';

const DEFAULT_MIN_CHANCE = 0.0001; // 0.01%
const DEFAULT_MAX_CHANCE = 0.99; // 99%

/** Recent-result chip colour by multiplier — mirrors the wheel's risk heat map. */
const chipColor = (m: number) =>
  m < 1.5 ? 'text-mint' : m < 3 ? 'text-sun' : m < 12 ? 'text-[#FFB25C]' : m < 60 ? 'text-bubble' : 'text-roul-red';

const cleanMult = (m: number) => (m >= 100 ? String(Math.round(m)) : (Math.round(m * 100) / 100).toFixed(2));

/**
 * KuKuMBA Upgrader — a thin HUD around the SVG wheel; every ruble of truth comes
 * from the upgrader API (apps/api/src/modules/games/upgrader):
 *  - POST play settles the whole spin server-side (provably-fair stop point) and
 *    returns it; the wheel just animates that exact needle angle, so what you
 *    watch is what settled. The balance refresh is held until the needle lands.
 *  - The two linked inputs (chance % ↔ multiplier ×) are pure UI: the canon is
 *    `chance` (a fraction) and only `chance` is sent — the server derives the
 *    multiplier and snapshots the RTP on the bet.
 */
export default function Upgrader() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const authed = !!useAuth((s) => s.accessToken);
  const { mode, currency, sound, toggleSound, quick, toggleQuick } = useUI();

  // Canonical win chance as a FRACTION (0.0001..0.99). Everything derives from it.
  const [chance, setChance] = useState(0.5);
  const [chancePctStr, setChancePctStr] = useState('50');
  const [multStr, setMultStr] = useState('1.98');

  const { data: info } = useQuery({
    queryKey: ['upgrader-info', chance],
    queryFn: async () => (await api.get(`/games/upgrader?chance=${chance}`)).data,
  });
  const { data: balances } = useBalances();
  const { data: currencies } = useCurrencies();
  const { data: seed } = useQuery({ queryKey: ['pf-seed'], enabled: authed, queryFn: async () => (await api.get('/provably-fair/seed')).data });

  const MIN = info?.minChance ?? DEFAULT_MIN_CHANCE;
  const MAX = info?.maxChance ?? DEFAULT_MAX_CHANCE;
  const rtp = info?.rtp ?? 0.99;
  const clampChance = (c: number) => Math.min(MAX, Math.max(MIN, c));
  // The multiplier is always derived from the canonical chance at the live RTP.
  const multiplier = rtp / chance;

  const cur = currencies?.find((c) => c.code === currency);
  const limits = useMemo(() => betLimits(cur, mode), [cur, mode]);
  const bal = balances?.find((b) => b.mode === mode && b.currency === currency);

  const wheelRef = useRef<UpgraderWheelHandle | null>(null);
  const pendingRef = useRef<{ mult: number; win: boolean } | null>(null);

  const [stakeStr, setStakeStr] = useState('10');
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [recent, setRecent] = useState<{ mult: number; win: boolean }[]>([]);

  const stake = clampStake(Number(stakeStr) || limits.min, limits);
  useEffect(() => {
    setStakeStr((s) => String(clampStake(Number(s) || limits.min, limits)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, mode]);
  const setStake = (v: number) => setStakeStr(String(clampStake(v, limits)));
  const stakeNum = Number(stakeStr);
  const outOfRange = stakeStr.trim() !== '' && (stakeNum > limits.max || stakeNum < limits.min);

  // Keep the sound engine and the wheel's quick-play in sync with the prefs.
  useEffect(() => setSoundEnabled(sound), [sound]);
  useEffect(() => wheelRef.current?.setFast(quick), [quick]);
  // When the admin retunes RTP, the derived multiplier field follows live.
  useEffect(() => {
    setMultStr(cleanMult(rtp / chance));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rtp]);

  // ── the two linked inputs — canon is `chance`, multiplier is derived ──
  const onChancePct = (v: string) => {
    setChancePctStr(v);
    const pct = Number(v);
    if (v.trim() !== '' && Number.isFinite(pct)) {
      const c = clampChance(pct / 100);
      setChance(c);
      setMultStr(cleanMult(rtp / c));
    }
  };
  const onMult = (v: string) => {
    setMultStr(v);
    const m = Number(v);
    if (v.trim() !== '' && Number.isFinite(m) && m > 0) {
      const c = clampChance(rtp / m);
      setChance(c);
      setChancePctStr((c * 100).toFixed(2));
    }
  };
  const syncInputs = () => {
    setChancePctStr((chance * 100).toFixed(2));
    setMultStr(cleanMult(rtp / chance));
  };
  const onSlider = (pct: number) => {
    const c = clampChance(pct / 100);
    setChance(c);
    setChancePctStr((c * 100).toFixed(2));
    setMultStr(cleanMult(rtp / c));
  };

  const onLand = () => {
    setSpinning(false);
    const r = pendingRef.current;
    if (r) setRecent((h) => [r, ...h].slice(0, 12));
    // Reveal the settled balance exactly when the needle lands (not before).
    qc.invalidateQueries({ queryKey: ['balances'] });
    qc.invalidateQueries({ queryKey: ['my-bonuses'] });
    qc.invalidateQueries({ queryKey: ['pf-seed'] });
  };

  const spin = async () => {
    wheelRef.current?.resumeAudio();
    if (!authed) {
      toast.error(t('upgrader.needLogin'));
      return;
    }
    if (busy || spinning) return;
    if (outOfRange) {
      toast.error(`${t('roulette.limits')}: ${fmt(limits.min, 2)}–${fmt(limits.max, 2)} ${currency}`);
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post('/games/upgrader/play', { stake, currency, mode, chance });
      // Show the stake debit at once (100 → 90); the true settled balance is
      // revealed when the needle lands (onLand invalidates ['balances']).
      debitLocalBalance(qc, currency, mode, stake);
      pendingRef.current = { mult: data.multiplier, win: data.win };
      setSpinning(true);
      // Animate the EXACT server angle; the balance refresh happens on landing.
      wheelRef.current?.spinTo(data.angleBp, data.win, data.multiplier);
    } catch (e) {
      toast.error(apiError(e));
    }
    setBusy(false);
  };

  const disabled = busy || spinning;

  return (
    <GameLayout
      aside={
        <>
          <div className="card flex flex-col gap-4 p-5">
            {/* stake */}
            <div>
              <div className="mb-2 text-xs font-semibold text-white/55">{t('upgrader.stake')}</div>
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
                    disabled={disabled}
                    aria-invalid={outOfRange}
                    aria-label={t('upgrader.stake')}
                    className={`input !py-3 pr-14 text-right font-extrabold tabular-nums ${outOfRange ? '!border-roul-red' : ''}`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-white/40">{currency}</span>
                </div>
                <button onClick={() => setStake(stake / 2)} className="btn-ghost !px-3" disabled={disabled}>½</button>
                <button onClick={() => setStake(stake * 2)} className="btn-ghost !px-3" disabled={disabled}>2×</button>
                <button
                  onClick={() => setStake(Math.min(limits.max, Number(bal?.amount ?? limits.max)))}
                  className="btn-ghost !px-3 text-xs"
                  disabled={disabled}
                >
                  {t('roulette.maxBtn')}
                </button>
              </div>
            </div>

            {/* chance ↔ multiplier (linked; canon = chance) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1.5 text-xs font-semibold text-white/55">{t('upgrader.chance')}</div>
                <div className="relative">
                  <input
                    value={chancePctStr}
                    onChange={(e) => onChancePct(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
                    onBlur={syncInputs}
                    inputMode="decimal"
                    disabled={disabled}
                    aria-label={t('upgrader.chance')}
                    className="input !py-2.5 pr-7 text-right font-bold tabular-nums"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-white/40">%</span>
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-xs font-semibold text-white/55">{t('upgrader.multiplier')}</div>
                <div className="relative">
                  <input
                    value={multStr}
                    onChange={(e) => onMult(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
                    onBlur={syncInputs}
                    inputMode="decimal"
                    disabled={disabled}
                    aria-label={t('upgrader.multiplier')}
                    className="input !py-2.5 pl-7 text-right font-bold tabular-nums"
                  />
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-white/40">×</span>
                </div>
              </div>
            </div>

            {/* quick chance slider */}
            <input
              type="range"
              min={Math.max(1, MIN * 100)}
              max={MAX * 100}
              step={0.5}
              value={Math.min(MAX * 100, Math.max(MIN * 100, chance * 100))}
              onChange={(e) => onSlider(Number(e.target.value))}
              disabled={disabled}
              aria-label={t('upgrader.chance')}
              className="w-full accent-lav"
            />

            <button onClick={spin} disabled={disabled} className="crash-action btn-crash-primary">
              <span className="font-display text-lg font-black">{t('upgrader.play')}</span>
              <span className="text-sm font-bold opacity-85">{fmt(stake, 2)} {currency}</span>
            </button>
            {!authed && (
              <div className="text-center text-sm text-white/50">
                <Link to="/login" className="text-lav hover:underline">{t('common.login')}</Link> · {t('upgrader.needLogin')}
              </div>
            )}
          </div>

          {/* recent results — this visit only */}
          <div className="card p-3.5">
            <div className="mb-2 text-[11px] font-bold tracking-wider text-white/45">{t('upgrader.recent')}</div>
            <div className="flex flex-wrap gap-1.5">
              {recent.length === 0 && <span className="text-sm text-white/35">{t('upgrader.recentEmpty')}</span>}
              {recent.map((r, i) => (
                <span
                  key={i}
                  className={`rounded-lg border px-2.5 py-1 font-display text-xs font-extrabold ${
                    r.win ? `border-white/10 bg-white/5 ${chipColor(r.mult)}` : 'border-roul-red/25 bg-roul-red/10 text-roul-red/70'
                  }`}
                >
                  ×{cleanMult(r.mult)}
                </span>
              ))}
            </div>
          </div>
        </>
      }
    >
      {/* Scene */}
      <div className="card relative overflow-hidden">
        <div className="relative grid place-items-center p-4 sm:p-6">
          <div className="w-full max-w-[360px]">
            <UpgraderWheel
              ref={wheelRef}
              chance={chance}
              multiplier={multiplier}
              onLand={onLand}
              idleText={t('upgrader.sceneIdle')}
              winText={t('upgrader.win')}
              loseText={t('upgrader.lose')}
            />
          </div>

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
          {/* Quick play (турбо) — near-instant spins, the shared persisted toggle. */}
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
        title={<span className="holo-text">{info?.name ?? t('upgrader.title')}</span>}
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
