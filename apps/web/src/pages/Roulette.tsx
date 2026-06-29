import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Shield, Target, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { GameInfoModal } from '../components/GameInfoModal';
import { GameLayout } from '../components/GameLayout';
import { RouletteWheel, SPIN_MS } from '../components/RouletteWheel';
import api, { apiError } from '../lib/api';
import { betLimits, clampStake, roundStake } from '../lib/bets';
import { fmt, useBalances, useCurrencies } from '../lib/hooks';
import { setSoundEnabled, sfx } from '../lib/sound';
import { useAuth } from '../store/auth';
import { useUI } from '../store/ui';
import { toast } from '../store/toast';

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const cellColor = (n: number) => (n === 0 ? 'bg-roul-green' : RED.has(n) ? 'bg-roul-red' : 'bg-roul-black');

const TOP = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];
const MID = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35];
const BOT = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];
const NUMS = Array.from({ length: 36 }, (_, i) => i + 1); // 1..36, natural order for the portrait board

export default function Roulette() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const authed = !!useAuth((s) => s.accessToken);
  const { mode, currency, sound, toggleSound } = useUI();

  // Keep the sound engine in sync with the persisted preference.
  useEffect(() => setSoundEnabled(sound), [sound]);

  const { data: info } = useQuery({ queryKey: ['roulette-info'], queryFn: async () => (await api.get('/games/roulette')).data });
  const { data: balances } = useBalances();
  const { data: currencies } = useCurrencies();
  const { data: seed } = useQuery({ queryKey: ['pf-seed'], enabled: authed, queryFn: async () => (await api.get('/provably-fair/seed')).data });

  const cur = currencies?.find((c) => c.code === currency);
  const limits = useMemo(() => betLimits(cur, mode), [cur, mode]);

  const [stakeStr, setStakeStr] = useState('10');
  const [bets, setBets] = useState<Record<string, number>>({});
  const [spinId, setSpinId] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  // Recent outcomes are session-only: they live in local state and reset when the
  // player leaves the roulette page (component unmount), so the strip starts empty.
  const [recent, setRecent] = useState<number[]>([]);
  const revealRef = useRef<number | null>(null);

  useEffect(() => () => { if (revealRef.current) window.clearTimeout(revealRef.current); }, []);

  // Effective stake for placing a bet — always within the active currency's limits.
  const stake = clampStake(Number(stakeStr) || limits.min, limits);
  // Re-clamp the visible amount when the currency/mode (and thus the limits) change.
  useEffect(() => {
    setStakeStr((s) => String(clampStake(Number(s) || limits.min, limits)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, mode]);

  const bal = balances?.find((b) => b.mode === mode && b.currency === currency);
  const total = Object.values(bets).reduce((a, b) => a + b, 0);
  const setStake = (v: number) => setStakeStr(String(clampStake(v, limits)));

  // Show a limit hint over the input while the typed amount is out of range.
  const stakeNum = Number(stakeStr);
  const outOfRange = stakeStr.trim() !== '' && (stakeNum > limits.max || stakeNum < limits.min);

  const add = (key: string) => {
    // Whole-table limit: the sum of all bets on the table may not exceed limits.max.
    // This is the anti-martingale guard — repeated clicks stop once the table is full.
    const room = roundStake(limits.max - total, limits.decimals);
    if (room <= 0) {
      toast.info(`${t('roulette.limits')}: ${fmt(limits.max, 2)} ${currency}`);
      return;
    }
    const place = roundStake(Math.min(stake, room), limits.decimals);
    sfx.chip();
    setBets((p) => ({ ...p, [key]: roundStake((p[key] || 0) + place, limits.decimals) }));
  };
  const clear = () => setBets({});

  const toApi = () =>
    Object.entries(bets).map(([key, st]) =>
      key.startsWith('N:')
        ? { betType: 'STRAIGHT', selection: { number: Number(key.slice(2)) }, stake: st }
        : { betType: key, stake: st },
    );

  const spin = async () => {
    if (!authed) {
      toast.error(t('roulette.needLogin'));
      return;
    }
    const apiBets = toApi();
    if (!apiBets.length) return;
    setBusy(true);
    try {
      const { data } = await api.post('/games/roulette/play', { currency, mode, bets: apiBets });
      // Start the wheel spinning toward the outcome…
      setResult(data.outcome);
      setSpinId((x) => x + 1);
      sfx.spin(SPIN_MS);
      clear();
      // …and only reveal the outcome (toast only) + refresh balances once it lands.
      revealRef.current = window.setTimeout(() => {
        setBusy(false);
        qc.invalidateQueries({ queryKey: ['balances'] });
        qc.invalidateQueries({ queryKey: ['pf-seed'] });
        // Session-only history: prepend this spin's outcome (capped at 10, newest first).
        setRecent((r) => [data.outcome, ...r].slice(0, 10));
        // The result is shown in the wheel — games never toast outcomes (only sound).
        if (Number(data.net) > 0) sfx.win();
        else sfx.lose();
      }, SPIN_MS);
    } catch (e) {
      toast.error(apiError(e));
      setBusy(false);
    }
  };

  const rotateSeed = async () => {
    try {
      await api.post('/provably-fair/seed/rotate', {});
      qc.invalidateQueries({ queryKey: ['pf-seed'] });
      toast.success(t('roulette.rotated'));
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const Cell = ({ k, label, cls = '', wide = false }: { k: string; label: any; cls?: string; wide?: boolean }) => (
    <button
      type="button"
      onClick={() => add(k)}
      disabled={busy}
      className={`relative grid place-items-center rounded-lg border border-white/10 text-sm font-bold transition hover:brightness-125 disabled:opacity-60 ${cls} ${wide ? 'py-1.5 sm:py-2' : 'aspect-square'}`}
    >
      {label}
      {bets[k] ? (
        <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-sun px-1 text-[10px] font-extrabold text-night shadow">
          {fmt(bets[k], 2)}
        </span>
      ) : null}
    </button>
  );

  const QuickBtn = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 text-xs font-bold text-white/80 transition hover:bg-white/10 disabled:opacity-50"
    >
      {label}
    </button>
  );

  return (
    <GameLayout>
      {/* Wheel only — title, RTP, description and fairness live behind the shield button. */}
      <div className="card relative flex flex-col items-center gap-3 p-4 sm:p-6">
        <button
          type="button"
          onClick={toggleSound}
          className="absolute left-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10"
          aria-label={sound ? t('roulette.soundOff') : t('roulette.soundOn')}
          title={sound ? t('roulette.soundOff') : t('roulette.soundOn')}
        >
          {sound ? <Volume2 size={18} /> : <VolumeX size={18} className="text-white/40" />}
        </button>
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-mint transition hover:bg-white/10"
          aria-label={t('roulette.info')}
          title={t('roulette.info')}
        >
          <Shield size={18} />
        </button>

        <div className="w-full max-w-[260px] sm:max-w-[300px]">
          <RouletteWheel result={result} spinId={spinId} />
        </div>

        {/* recent outcomes — this visit only; cleared when leaving the page */}
        {recent.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5">
            {recent.map((n, i) => (
              <span key={i} className={`grid h-6 w-6 place-items-center rounded-md text-[11px] font-bold ${cellColor(n)}`}>
                {n}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Betting board */}
      <div className="card space-y-3 p-3 sm:p-5">
        {/* stake input + quick controls */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              {/* Limit hint — appears only while the typed amount is outside the range,
                  and disappears once it's back within min–max. */}
              {outOfRange && (
                <div className="absolute bottom-full left-0 z-20 mb-1 rounded-lg border border-white/10 bg-night px-2.5 py-1.5 text-[11px] font-medium text-white/80 shadow-card">
                  {t('roulette.limits')}: {fmt(limits.min, 2)}–{fmt(limits.max, 2)} {currency}
                </div>
              )}
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold uppercase tracking-wide text-white/40">
                {t('roulette.bet')}
              </span>
              <input
                inputMode="decimal"
                value={stakeStr}
                onChange={(e) => setStakeStr(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
                onBlur={() => setStakeStr(String(stake))}
                disabled={busy}
                aria-invalid={outOfRange}
                className={`input !py-2.5 !pl-16 !pr-14 text-right font-bold tabular-nums ${outOfRange ? '!border-roul-red' : ''}`}
                aria-label={t('roulette.bet')}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-white/40">
                {currency}
              </span>
            </div>
            <QuickBtn label="½" onClick={() => setStake(stake / 2)} />
            <QuickBtn label="2×" onClick={() => setStake(stake * 2)} />
            {/* Max = all-in: the largest amount you can actually wager (your balance,
                but never above the table limit). */}
            <QuickBtn label={t('roulette.maxBtn')} onClick={() => setStake(Math.min(limits.max, Number(bal?.amount ?? limits.max)))} />
          </div>
        </div>

        {/* controls — above the board so the total/clear/spin stay in reach */}
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm">
            {t('roulette.totalBet')}: <b className="text-lg tabular-nums">{fmt(total, 2)}</b> {currency}
          </div>
          <div className="flex gap-2">
            <button onClick={clear} className="btn-ghost !px-3" disabled={busy || !total}>
              {t('roulette.clear')}
            </button>
            <button onClick={spin} className="btn-primary inline-flex min-w-28 items-center justify-center gap-2" disabled={busy || !total}>
              <Target size={18} /> {t('common.spin')}
            </button>
          </div>
        </div>

        {/* bets — uniform vertical gaps (match the number-grid gap). Order:
            numbers, dozens, even-money, then the column (2:1) bets. */}
        <div className="space-y-1">
          {/* mobile (portrait): 0 on top, then 1..36 in a 9-wide grid (1–9 / 10–18 / 19–27 / 28–36) */}
          <div className="space-y-1 sm:hidden">
            <Cell k="N:0" label="0" cls="w-full bg-roul-green !aspect-auto py-2" />
            <div className="grid grid-cols-9 gap-1">
              {NUMS.map((n) => (
                <Cell key={n} k={`N:${n}`} label={n} cls={`${cellColor(n)} text-white`} />
              ))}
            </div>
          </div>

          {/* tablet/desktop: classic 3×12 table, full width, no horizontal scroll */}
          <div className="hidden gap-1 sm:flex">
            <Cell k="N:0" label="0" cls="w-12 self-stretch bg-roul-green !aspect-auto" />
            <div className="grid flex-1 grid-cols-12 gap-1">
              {[TOP, MID, BOT].map((row, ri) => (
                <div key={ri} className="contents">
                  {row.map((n) => (
                    <Cell key={n} k={`N:${n}`} label={n} cls={`${cellColor(n)} text-white`} />
                  ))}
                </div>
              ))}
            </div>
            {/* the three "2:1" boxes sit at the end of each row — standard table convention */}
            <div className="flex w-12 flex-col gap-1">
              {['COLUMN_3', 'COLUMN_2', 'COLUMN_1'].map((c) => (
                <Cell key={c} k={c} label="2:1" cls="flex-1 bg-white/5 !aspect-auto" />
              ))}
            </div>
          </div>

          {/* dozens */}
          <div className="grid grid-cols-3 gap-1">
            <Cell k="DOZEN_1" label="1–12" cls="bg-white/5" wide />
            <Cell k="DOZEN_2" label="13–24" cls="bg-white/5" wide />
            <Cell k="DOZEN_3" label="25–36" cls="bg-white/5" wide />
          </div>

          {/* even-money */}
          <div className="grid grid-cols-3 gap-1 md:grid-cols-6">
            <Cell k="LOW" label="1–18" cls="bg-white/5" wide />
            <Cell k="EVEN" label={t('roulette.even')} cls="bg-white/5" wide />
            <Cell k="RED" label={t('roulette.red')} cls="bg-roul-red" wide />
            <Cell k="BLACK" label={t('roulette.black')} cls="bg-roul-black" wide />
            <Cell k="ODD" label={t('roulette.odd')} cls="bg-white/5" wide />
            <Cell k="HIGH" label="19–36" cls="bg-white/5" wide />
          </div>

          {/* column (2:1) bets — mobile only; on desktop they live in the table above.
              Labelled clearly so "2:1 2:1 2:1" isn't a mystery. */}
          <div className="grid grid-cols-3 gap-1 sm:hidden">
            {[1, 2, 3].map((i) => (
              <Cell
                key={i}
                k={`COLUMN_${i}`}
                cls="bg-white/5 !aspect-auto py-1.5"
                label={
                  <span className="flex flex-col items-center leading-tight">
                    <span>{t('roulette.column')} {i}</span>
                    <span className="text-[9px] font-semibold text-white/45">2:1</span>
                  </span>
                }
              />
            ))}
          </div>
        </div>
        {!authed && (
          <div className="text-center text-sm text-white/50">
            <Link to="/login" className="text-lav hover:underline">
              {t('common.login')}
            </Link>{' '}
            · {t('roulette.needLogin')}
          </div>
        )}
      </div>

      {/* Info, rules & fairness — opened by the shield button on the wheel. */}
      <GameInfoModal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title={<span className="holo-text">{info?.name ?? t('roulette.title')}</span>}
        rtp={info?.rtp ?? 0.973}
        descriptionRu={info?.descriptionRu}
        descriptionEn={info?.descriptionEn}
        bets={info?.bets}
        pockets={info?.pockets?.length}
        limits={limits}
        currency={currency}
        seed={authed ? seed : null}
        onRotateSeed={rotateSeed}
      />
    </GameLayout>
  );
}
