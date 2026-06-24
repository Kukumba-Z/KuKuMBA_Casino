import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api, { apiError } from '../lib/api';
import { fmt, useBalances, useCurrencies } from '../lib/hooks';

export default function Wallet() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: currencies } = useCurrencies();
  const { data: balances } = useBalances();
  const realCurrencies = useMemo(() => (currencies ?? []).filter((c) => c.type !== 'DEMO'), [currencies]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">💼 {t('wallet.title')}</h1>

      {/* balances */}
      <div className="card p-5">
        <h2 className="mb-4 text-lg font-bold">{t('wallet.yourBalances')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(balances ?? []).map((b) => (
            <div key={b.currency + b.mode} className="flex items-center justify-between rounded-2xl bg-black/30 p-4">
              <div>
                <div className="text-xs uppercase text-white/40">{b.mode}</div>
                <div className="text-xl font-bold tabular-nums">
                  {fmt(b.amount, 6)} <span className="text-white/50">{b.currency}</span>
                </div>
              </div>
              <span className="text-2xl">{b.mode === 'DEMO' ? '🦄' : '💎'}</span>
            </div>
          ))}
          {(!balances || balances.length === 0) && <div className="text-white/40">{t('common.loading')}</div>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DepositCard currencies={realCurrencies} onDone={() => qc.invalidateQueries({ queryKey: ['balances'] })} />
        <WithdrawCard currencies={realCurrencies} onDone={() => qc.invalidateQueries({ queryKey: ['balances'] })} />
      </div>

      <Transactions />
    </div>
  );
}

function DepositCard({ currencies, onDone }: { currencies: any[]; onDone: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [currency, setCurrency] = useState('USDT');
  const [network, setNetwork] = useState('TRC20');
  const [amount, setAmount] = useState('100');
  const [deposit, setDeposit] = useState<any>(null);
  const [err, setErr] = useState('');
  const cur = currencies.find((c) => c.code === currency);

  const create = async () => {
    setErr('');
    try {
      const { data } = await api.post('/payments/deposits', {
        currency,
        network: cur?.type === 'CRYPTO' ? network : undefined,
        amount,
      });
      setDeposit(data);
    } catch (e) {
      setErr(apiError(e));
    }
  };
  const confirm = async () => {
    try {
      await api.post(`/payments/deposits/${deposit.id}/confirm`);
      setDeposit(null);
      onDone();
      qc.invalidateQueries({ queryKey: ['balances'] });
    } catch (e) {
      setErr(apiError(e));
    }
  };

  return (
    <div className="card space-y-3 p-5">
      <h2 className="text-lg font-bold">⬇ {t('wallet.newDeposit')}</h2>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t('common.currency')}</label>
          <select className="input" value={currency} onChange={(e) => { setCurrency(e.target.value); const c = currencies.find((x) => x.code === e.target.value); setNetwork(c?.networks?.[0] || ''); }}>
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
            ))}
          </select>
        </div>
        {cur?.type === 'CRYPTO' && cur.networks.length > 0 && (
          <div>
            <label className="label">{t('common.network')}</label>
            <select className="input" value={network} onChange={(e) => setNetwork(e.target.value)}>
              {cur.networks.map((n: string) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div>
        <label className="label">{t('common.amount')}</label>
        <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      </div>
      {!deposit ? (
        <button onClick={create} className="btn-primary w-full">{t('common.deposit')}</button>
      ) : (
        <div className="space-y-2 rounded-2xl bg-black/30 p-4">
          <div className="text-xs text-white/40">{t('wallet.depositAddr')} ({deposit.network || deposit.currency})</div>
          <div className="break-all rounded-lg bg-black/40 p-2 font-mono text-sm">{deposit.address}</div>
          <div className="text-xs text-white/40">
            Песочница: реальные деньги не двигаются. Нажмите, чтобы сымитировать поступление.
          </div>
          <button onClick={confirm} className="btn-soft w-full">{t('wallet.confirmSandbox')}</button>
        </div>
      )}
      {err && <div className="text-sm text-roul-red">{err}</div>}
    </div>
  );
}

function WithdrawCard({ currencies, onDone }: { currencies: any[]; onDone: () => void }) {
  const { t } = useTranslation();
  const [currency, setCurrency] = useState('USDT');
  const [network, setNetwork] = useState('TRC20');
  const [amount, setAmount] = useState('10');
  const [address, setAddress] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const cur = currencies.find((c) => c.code === currency);

  const submit = async () => {
    setErr('');
    setMsg('');
    try {
      await api.post('/payments/withdrawals', {
        currency,
        network: cur?.type === 'CRYPTO' ? network : undefined,
        amount,
        address,
      });
      setMsg('Заявка создана и ожидает проверки. / Request created, pending review.');
      onDone();
    } catch (e) {
      setErr(apiError(e));
    }
  };

  return (
    <div className="card space-y-3 p-5">
      <h2 className="text-lg font-bold">⬆ {t('wallet.requestWithdraw')}</h2>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t('common.currency')}</label>
          <select className="input" value={currency} onChange={(e) => { setCurrency(e.target.value); const c = currencies.find((x) => x.code === e.target.value); setNetwork(c?.networks?.[0] || ''); }}>
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>{c.code}</option>
            ))}
          </select>
        </div>
        {cur?.type === 'CRYPTO' && cur.networks.length > 0 && (
          <div>
            <label className="label">{t('common.network')}</label>
            <select className="input" value={network} onChange={(e) => setNetwork(e.target.value)}>
              {cur.networks.map((n: string) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div>
        <label className="label">{t('common.amount')}</label>
        <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      </div>
      <div>
        <label className="label">{t('wallet.address')}</label>
        <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x… / T…" />
      </div>
      <button onClick={submit} className="btn-ghost w-full" disabled={!address}>{t('common.withdraw')}</button>
      {msg && <div className="text-sm text-mint">{msg}</div>}
      {err && <div className="text-sm text-roul-red">{err}</div>}
    </div>
  );
}

function Transactions() {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ['txs'], queryFn: async () => (await api.get('/wallet/transactions?limit=30')).data });
  return (
    <div className="card p-5">
      <h2 className="mb-3 text-lg font-bold">{t('wallet.transactions')}</h2>
      <div className="space-y-1.5">
        {(data ?? []).map((x: any) => (
          <div key={x.id} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="chip !px-2 !py-0.5 text-[10px]">{x.type}</span>
              <span className="text-white/50">{new Date(x.createdAt).toLocaleString()}</span>
            </div>
            <div className={`tabular-nums font-semibold ${x.direction === 'CREDIT' ? 'text-mint' : 'text-white/60'}`}>
              {x.direction === 'CREDIT' ? '+' : '−'}
              {fmt(x.amount, 6)} {x.currency} <span className="text-white/30">({x.mode})</span>
            </div>
          </div>
        ))}
        {(!data || data.length === 0) && <div className="py-4 text-center text-white/40">{t('common.empty')}</div>}
      </div>
    </div>
  );
}
