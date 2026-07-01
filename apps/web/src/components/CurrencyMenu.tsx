import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, ArrowUpDown, ChevronDown, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import api, { apiError } from '../lib/api';
import { fmt, useBalances, useCurrencies, useMyBonuses } from '../lib/hooks';
import { currencyLabel } from '../lib/labels';
import { useUI } from '../store/ui';
import { toast } from '../store/toast';
import { Modal } from './Modal';

/**
 * Balance display + account switcher. Tap to open a dropdown: choose Demo/Real
 * and the currency, each row showing its balance. The "+" jumps to the wallet.
 */
export function CurrencyMenu() {
  const { t } = useTranslation();
  const { mode, setMode, currency, setCurrency } = useUI();
  const { data: currencies } = useCurrencies();
  const { data: balances } = useBalances();
  const { data: myBonuses } = useMyBonuses();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const claimDemo = async () => {
    setClaiming(true);
    try {
      await api.post('/wallet/demo/topup');
      await qc.invalidateQueries({ queryKey: ['balances'] });
      toast.success(t('demoTopup.done'));
      setTopupOpen(false);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setClaiming(false);
    }
  };

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const balOf = (code: string) =>
    balances?.find((b) => b.mode === mode && b.currency === code)?.amount ?? '0';
  const current = balOf(currency);
  const list = (currencies ?? []).filter((c) => (mode === 'DEMO' ? c.type === 'DEMO' : c.type === 'FIAT'));

  // Wagering progress for the active mode+currency: sum of any bonuses still
  // being wagered. Drives the thin bar under the balance + the dropdown detail.
  const wagerBonuses = (myBonuses ?? []).filter(
    (b) => (b.status === 'ACTIVE' || b.status === 'WAGERING') && b.mode === mode && b.currency === currency,
  );
  const wagerReq = wagerBonuses.reduce((s, b) => s + Number(b.wagerRequired), 0);
  const wagerDone = wagerBonuses.reduce((s, b) => s + Math.min(Number(b.wagerProgress), Number(b.wagerRequired)), 0);
  const wagerPct = wagerReq > 0 ? Math.min(100, Math.round((wagerDone / wagerReq) * 100)) : null;

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="relative flex items-center gap-1.5 overflow-hidden rounded-2xl border border-white/10 bg-black/30 py-1.5 pl-2.5 pr-2 transition hover:bg-black/40"
        >
          <span className={`h-2 w-2 rounded-full ${mode === 'DEMO' ? 'bg-lav' : 'bg-mint'}`} />
          <span className="text-sm font-bold tabular-nums">{fmt(current, 2)}</span>
          <span className="text-xs text-white/45">{currency}</span>
          <ChevronDown size={14} className={`text-white/40 transition ${open ? 'rotate-180' : ''}`} />
          {/* Wagering progress — a simple bar when collapsed; details in the dropdown. */}
          {wagerPct != null && (
            <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10" aria-label={`${t('bonuses.wagerTitle')} ${wagerPct}%`}>
              <span className="block h-full bg-sun" style={{ width: `${wagerPct}%` }} />
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-white/10 bg-surface-2 shadow-card">
            <div className="grid grid-cols-2 gap-1 p-1.5">
              {(['DEMO', 'REAL'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-xl py-1.5 text-xs font-semibold transition ${
                    mode === m ? (m === 'DEMO' ? 'bg-lav/25 text-white' : 'bg-mint/20 text-white') : 'text-white/50 hover:bg-white/5'
                  }`}
                >
                  {m === 'DEMO' ? t('common.demo') : t('common.real')}
                </button>
              ))}
            </div>
            {wagerPct != null && (
              <div className="border-t border-white/10 px-3 py-2.5">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-semibold text-sun">{t('bonuses.wagerTitle')}</span>
                  <span className="tabular-nums text-white/60">
                    {fmt(wagerDone, 2)} / {fmt(wagerReq, 2)} {currency} · {wagerPct}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full rounded-full bg-sun" style={{ width: `${wagerPct}%` }} />
                </div>
              </div>
            )}
            <div className="max-h-64 overflow-y-auto border-t border-white/10 py-1">
              {list.map((c) => (
                <div
                  key={c.code}
                  className={`flex w-full items-center ${currency === c.code ? 'bg-white/5' : ''}`}
                >
                  <button
                    onClick={() => {
                      setCurrency(c.code);
                      setOpen(false);
                    }}
                    className="flex flex-1 items-center justify-between px-3 py-2 text-sm transition hover:bg-white/5"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-6 text-center text-white/40">{c.symbol || c.code}</span>
                      <span className="font-medium">{currencyLabel(c)}</span>
                    </span>
                    <span className="tabular-nums text-white/70">{fmt(balOf(c.code), 4)}</span>
                  </button>
                  {c.type === 'DEMO' && (
                    <button
                      onClick={() => {
                        setOpen(false);
                        setTopupOpen(true);
                      }}
                      className="mr-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-lav/20 text-lav transition hover:bg-lav/30"
                      aria-label={t('demoTopup.add')}
                      title={t('demoTopup.add')}
                    >
                      <Plus size={15} />
                    </button>
                  )}
                </div>
              ))}
              {list.length === 0 && (
                <div className="px-3 py-3 text-center text-xs text-white/40">{t('common.loading')}</div>
              )}
            </div>
            {mode === 'REAL' ? (
              <div className="grid grid-cols-2 border-t border-white/10">
                <button
                  onClick={() => {
                    setOpen(false);
                    setConvertOpen(true);
                  }}
                  className="flex items-center justify-center gap-1.5 border-r border-white/10 px-3 py-2.5 text-sm font-semibold text-mint hover:bg-white/5"
                >
                  <ArrowLeftRight size={15} /> {t('convert.button')}
                </button>
                <Link
                  to="/wallet"
                  onClick={() => setOpen(false)}
                  className="px-3 py-2.5 text-center text-sm font-semibold text-lav hover:bg-white/5"
                >
                  {t('nav.wallet')}
                </Link>
              </div>
            ) : (
              <Link
                to="/wallet"
                onClick={() => setOpen(false)}
                className="block border-t border-white/10 px-3 py-2.5 text-center text-sm font-semibold text-lav hover:bg-white/5"
              >
                {t('nav.wallet')}
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Quick deposit shortcut — desktop only; on mobile the dropdown's wallet
          link (and the demo "+") cover this, keeping the slim top bar uncluttered. */}
      <Link to="/wallet" className="btn-primary !hidden !rounded-xl !px-2 !py-1.5 lg:!inline-flex" aria-label={t('common.deposit')}>
        <Plus size={16} />
      </Link>

      <Modal open={topupOpen} onClose={() => setTopupOpen(false)} title={t('demoTopup.title')}>
        <p className="text-sm leading-relaxed text-white/70">{t('demoTopup.desc')}</p>
        <button onClick={claimDemo} disabled={claiming} className="btn-primary mt-4 w-full disabled:opacity-60">
          {t('demoTopup.claim')}
        </button>
      </Modal>

      <ConvertModal open={convertOpen} onClose={() => setConvertOpen(false)} />
    </div>
  );
}

/**
 * Convert one real fiat balance into another (e.g. deposit in USD, play in RUB).
 * The preview uses each currency's USD rate; the server re-checks and floors to
 * the target currency's precision, so what you see matches what you get.
 */
function ConvertModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { currency, setCurrency } = useUI();
  const { data: currencies } = useCurrencies();
  const { data: balances } = useBalances();
  // Live FX snapshot ("1 unit = X USD" + when it was refreshed) drives the rate shown.
  const { data: fx } = useQuery({
    queryKey: ['fx-rates'],
    queryFn: async () => (await api.get('/wallet/rates')).data,
    enabled: open,
    staleTime: 60_000,
  });
  const fiats = useMemo(() => (currencies ?? []).filter((c) => c.type === 'FIAT'), [currencies]);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  // Seed sensible defaults each time the dialog opens: from = active currency.
  useEffect(() => {
    if (!open || !fiats.length) return;
    const f = fiats.some((c) => c.code === currency) ? currency : fiats[0].code;
    const tCode = (fiats.find((c) => c.code !== f) ?? fiats[0]).code;
    setFrom(f);
    setTo(tCode);
    setAmount('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fiats]);

  // Prefer the live snapshot; fall back to the currency's stored rate.
  const rateOf = (code: string) => Number(fx?.usd?.[code] ?? fiats.find((c) => c.code === code)?.usdRate ?? 0);
  const toDecimals = fiats.find((c) => c.code === to)?.decimals ?? 2;
  const bal = balances?.find((b) => b.mode === 'REAL' && b.currency === from)?.amount ?? '0';
  const amt = Number(amount);
  const rFrom = rateOf(from);
  const rTo = rateOf(to);
  const preview = amt > 0 && rFrom > 0 && rTo > 0 ? (amt * rFrom) / rTo : 0;
  const overBalance = amt > Number(bal);
  const canSubmit = !!from && !!to && from !== to && amt > 0 && !overBalance && preview > 0 && !busy;

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/wallet/convert', { from, to, amount });
      await qc.invalidateQueries({ queryKey: ['balances'] });
      toast.success(t('convert.done'));
      setCurrency(to); // switch the active wallet to the currency you just topped up
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const options = (exclude: string) =>
    fiats
      .filter((c) => c.code !== exclude)
      .map((c) => (
        <option key={c.code} value={c.code}>
          {c.code} — {c.name}
        </option>
      ));

  return (
    <Modal open={open} onClose={onClose} title={t('convert.title')}>
      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="label !mb-0">{t('convert.from')}</label>
            <span className="text-xs text-white/45">
              {t('convert.balance')}: <span className="tabular-nums text-white/70">{fmt(bal, 2)} {from}</span>
            </span>
          </div>
          <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
            {options(to)}
          </select>
        </div>

        <div>
          <label className="label">{t('convert.amount')}</label>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0"
            />
            <button type="button" onClick={() => setAmount(String(Number(bal)))} className="btn-soft shrink-0 !px-3">
              {t('convert.max')}
            </button>
          </div>
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={swap}
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10"
            aria-label={t('convert.swap')}
          >
            <ArrowUpDown size={16} />
          </button>
        </div>

        <div>
          <label className="label">{t('convert.to')}</label>
          <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
            {options(from)}
          </select>
        </div>

        <div className="rounded-2xl bg-black/30 p-4 text-center">
          <div className="text-xs uppercase tracking-wide text-white/40">{t('convert.youGet')}</div>
          <div className="text-2xl font-extrabold tabular-nums text-mint">
            {fmt(preview, Math.min(toDecimals, 8))} <span className="text-white/50">{to}</span>
          </div>
          {rFrom > 0 && rTo > 0 && (
            <div className="mt-1 flex items-center justify-center gap-1.5 text-[11px] text-white/45">
              <span>1 {from} ≈ {fmt(rFrom / rTo, 6)} {to}</span>
              {fx?.live && <span className="rounded bg-mint/15 px-1.5 py-0.5 font-semibold text-mint">{t('convert.live')}</span>}
            </div>
          )}
          {fx?.updatedAt && (
            <div className="mt-0.5 text-[10px] text-white/30">
              {t('convert.updated')}: {new Date(fx.updatedAt).toLocaleString()}
            </div>
          )}
        </div>

        {overBalance && <div className="text-sm text-roul-red">{t('errors.INSUFFICIENT_FUNDS')}</div>}

        <button onClick={submit} disabled={!canSubmit} className="btn-primary w-full disabled:opacity-60">
          {t('convert.submit')}
        </button>
      </div>
    </Modal>
  );
}
