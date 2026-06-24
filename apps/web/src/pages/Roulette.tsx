import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChatBox } from '../components/ChatBox';
import { RouletteWheel } from '../components/RouletteWheel';
import api, { apiError } from '../lib/api';
import { fmt, useBalances } from '../lib/hooks';
import { useAuth } from '../store/auth';
import { useUI } from '../store/ui';

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const cellColor = (n: number) => (n === 0 ? 'bg-roul-green' : RED.has(n) ? 'bg-roul-red' : 'bg-roul-black');

const TOP = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];
const MID = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35];
const BOT = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];
const CHIPS = [1, 5, 10, 25, 100, 500];

export default function Roulette() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const authed = !!useAuth((s) => s.accessToken);
  const { mode, currency } = useUI();

  const { data: info } = useQuery({ queryKey: ['roulette-info'], queryFn: async () => (await api.get('/games/roulette')).data });
  const { data: balances } = useBalances();
  const { data: seed } = useQuery({ queryKey: ['pf-seed'], enabled: authed, queryFn: async () => (await api.get('/provably-fair/seed')).data });
  const { data: history } = useQuery({ queryKey: ['roul-history'], enabled: authed, queryFn: async () => (await api.get('/games/roulette/history?limit=18')).data });

  const [chip, setChip] = useState(10);
  const [bets, setBets] = useState<Record<string, number>>({});
  const [spinId, setSpinId] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const [last, setLast] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const bal = balances?.find((b) => b.mode === mode && b.currency === currency);
  const total = Object.values(bets).reduce((a, b) => a + b, 0);
  const multOf = (type: string) => info?.bets?.find((b: any) => b.type === type)?.multiplier ?? 0;

  const add = (key: string) => setBets((p) => ({ ...p, [key]: (p[key] || 0) + chip }));
  const clear = () => setBets({});

  const toApi = () =>
    Object.entries(bets).map(([key, stake]) =>
      key.startsWith('N:')
        ? { betType: 'STRAIGHT', selection: { number: Number(key.slice(2)) }, stake }
        : { betType: key, stake },
    );

  const spin = async () => {
    setErr('');
    if (!authed) {
      setErr(t('roulette.needLogin'));
      return;
    }
    const apiBets = toApi();
    if (!apiBets.length) return;
    setBusy(true);
    try {
      const { data } = await api.post('/games/roulette/play', { currency, mode, bets: apiBets });
      setResult(data.outcome);
      setSpinId((x) => x + 1);
      setLast(data);
      clear();
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['balances'] });
        qc.invalidateQueries({ queryKey: ['roul-history'] });
        qc.invalidateQueries({ queryKey: ['pf-seed'] });
      }, 150);
    } catch (e) {
      setErr(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const rotateSeed = async () => {
    await api.post('/provably-fair/seed/rotate', {});
    qc.invalidateQueries({ queryKey: ['pf-seed'] });
  };

  const Cell = ({ k, label, cls = '', wide = false }: { k: string; label: any; cls?: string; wide?: boolean }) => (
    <button
      onClick={() => add(k)}
      className={`relative grid place-items-center rounded-lg border border-white/10 text-sm font-bold transition hover:brightness-125 ${cls} ${wide ? 'py-2' : 'aspect-square'}`}
    >
      {label}
      {bets[k] ? (
        <span className="absolute -right-1.5 -top-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-sun px-1 text-[11px] font-extrabold text-night shadow">
          {bets[k]}
        </span>
      ) : null}
    </button>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {/* Wheel + result */}
        <div className="card flex flex-col items-center gap-5 p-6 md:flex-row md:items-center md:justify-around">
          <RouletteWheel result={result} spinId={spinId} />
          <div className="text-center md:text-left">
            <h1 className="text-2xl font-extrabold">
              <span className="holo-text">{t('roulette.title')}</span>
            </h1>
            <p className="mt-1 text-sm text-white/50">RTP {((info?.rtp ?? 0.99) * 100).toFixed(0)}% · provably-fair</p>

            {last && (
              <div className={`mt-4 rounded-2xl px-4 py-3 ${Number(last.net) >= 0 ? 'bg-mint/15 text-mint' : 'bg-roul-red/15 text-roul-red'}`}>
                <div className="text-lg font-bold">
                  {Number(last.net) >= 0 ? `🎉 ${t('roulette.won')}` : `🍀 ${t('roulette.lost')}`}
                </div>
                <div className="text-sm">
                  {t('roulette.result')}: <b>{last.outcome}</b> · {Number(last.net) >= 0 ? '+' : ''}
                  {fmt(last.net, 4)} {last.currency}
                </div>
              </div>
            )}

            {/* recent outcomes */}
            {history && history.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {history.slice(0, 12).map((r: any) => (
                  <span key={r.id} className={`grid h-7 w-7 place-items-center rounded-lg text-xs font-bold ${cellColor(r.outcome)}`}>
                    {r.outcome}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Betting board */}
        <div className="card space-y-4 p-5">
          {/* chips + balance */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-white/50">{t('roulette.chooseChip')}:</span>
              {CHIPS.map((c) => (
                <button
                  key={c}
                  onClick={() => setChip(c)}
                  className={`grid h-10 w-10 place-items-center rounded-full text-xs font-bold transition ${
                    chip === c ? 'bg-holo text-night shadow-glow' : 'bg-white/5 hover:bg-white/10'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="text-sm text-white/60">
              {t('common.balance')}: <b className="text-white">{fmt(bal?.amount ?? 0, 2)} {currency}</b>
              <span className="ml-2 chip">{mode === 'DEMO' ? t('common.demo') : t('common.real')}</span>
            </div>
          </div>

          {/* numbers */}
          <div className="flex gap-1.5">
            <Cell k="N:0" label="0" cls="bg-roul-green !aspect-auto w-12 self-stretch" />
            <div className="grid flex-1 grid-cols-12 gap-1.5">
              {[TOP, MID, BOT].map((row, ri) => (
                <div key={ri} className="contents">
                  {row.map((n) => (
                    <Cell key={n} k={`N:${n}`} label={n} cls={`${cellColor(n)} text-white`} />
                  ))}
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              {['COLUMN_3', 'COLUMN_2', 'COLUMN_1'].map((c) => (
                <Cell key={c} k={c} label="2:1" cls="bg-white/5 w-12 !aspect-auto flex-1" />
              ))}
            </div>
          </div>

          {/* dozens */}
          <div className="grid grid-cols-3 gap-1.5">
            <Cell k="DOZEN_1" label="1–12" cls="bg-white/5" wide />
            <Cell k="DOZEN_2" label="13–24" cls="bg-white/5" wide />
            <Cell k="DOZEN_3" label="25–36" cls="bg-white/5" wide />
          </div>

          {/* even-money */}
          <div className="grid grid-cols-6 gap-1.5">
            <Cell k="LOW" label="1–18" cls="bg-white/5" wide />
            <Cell k="EVEN" label={t('roulette.even')} cls="bg-white/5" wide />
            <Cell k="RED" label={t('roulette.red')} cls="bg-roul-red" wide />
            <Cell k="BLACK" label={t('roulette.black')} cls="bg-roul-black" wide />
            <Cell k="ODD" label={t('roulette.odd')} cls="bg-white/5" wide />
            <Cell k="HIGH" label="19–36" cls="bg-white/5" wide />
          </div>

          {/* controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="text-sm">
              {t('roulette.totalBet')}: <b className="text-lg tabular-nums">{total}</b> {currency}
            </div>
            <div className="flex gap-2">
              <button onClick={clear} className="btn-ghost" disabled={!total}>
                {t('roulette.clear')}
              </button>
              <button onClick={spin} className="btn-primary min-w-32 text-lg" disabled={busy || !total}>
                {busy ? '…' : `🎯 ${t('common.spin')}`}
              </button>
            </div>
          </div>
          {err && <div className="rounded-xl bg-roul-red/15 px-3 py-2 text-sm text-roul-red">{err}</div>}
          {!authed && (
            <div className="text-center text-sm text-white/50">
              <Link to="/login" className="text-lav hover:underline">
                {t('common.login')}
              </Link>{' '}
              · {t('roulette.needLogin')}
            </div>
          )}
        </div>

        {/* Provably fair */}
        {authed && seed && (
          <div className="card space-y-3 p-5">
            <h2 className="text-lg font-bold">🔐 {t('roulette.provablyFair')}</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t('roulette.serverHash')} value={seed.serverSeedHash} mono />
              <Field label={t('roulette.clientSeed')} value={seed.clientSeed} mono />
              <Field label={t('roulette.nonce')} value={String(seed.nonce)} />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={rotateSeed} className="btn-soft text-sm">
                ♻ {t('roulette.rotate')}
              </button>
              <span className="text-xs text-white/40">
                Хеш публикуется до спина — результат нельзя подделать.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* side: chat */}
      <div className="space-y-6">
        <ChatBox />
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl bg-black/30 p-3">
      <div className="mb-1 text-xs text-white/40">{label}</div>
      <div className={`truncate text-sm ${mono ? 'font-mono' : ''}`} title={value}>
        {value}
      </div>
    </div>
  );
}
