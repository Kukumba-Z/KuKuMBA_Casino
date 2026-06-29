import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import api, { apiError } from '../lib/api';
import { fmt, useBalances, useCurrencies } from '../lib/hooks';
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
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
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
  const list = (currencies ?? []).filter((c) => (mode === 'DEMO' ? c.type === 'DEMO' : c.type !== 'DEMO'));

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-black/30 py-1.5 pl-2.5 pr-2 transition hover:bg-black/40"
        >
          <span className={`h-2 w-2 rounded-full ${mode === 'DEMO' ? 'bg-lav' : 'bg-mint'}`} />
          <span className="text-sm font-bold tabular-nums">{fmt(current, 2)}</span>
          <span className="text-xs text-white/45">{currency}</span>
          <ChevronDown size={14} className={`text-white/40 transition ${open ? 'rotate-180' : ''}`} />
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
            <Link
              to="/wallet"
              onClick={() => setOpen(false)}
              className="block border-t border-white/10 px-3 py-2.5 text-center text-sm font-semibold text-lav hover:bg-white/5"
            >
              {t('nav.wallet')}
            </Link>
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
    </div>
  );
}
