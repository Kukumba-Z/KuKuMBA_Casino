import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, Gem, WalletMinimal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Mascot } from '../components/Mascot';
import api, { apiError } from '../lib/api';
import { fmt, useBalances, useCurrencies } from '../lib/hooks';
import { enumLabel } from '../lib/labels';
import { toast } from '../store/toast';

export default function Wallet() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: currencies } = useCurrencies();
  const { data: balances } = useBalances();
  // Accounts are fiat-only (USD/EUR/RUB); crypto is a future gateway rail, not a held balance.
  const realCurrencies = useMemo(() => (currencies ?? []).filter((c) => c.type === 'FIAT'), [currencies]);

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold">
        <WalletMinimal size={24} className="text-mint" /> {t('wallet.title')}
      </h1>

      {/* balances */}
      <div className="card p-5">
        <h2 className="mb-4 text-lg font-bold">{t('wallet.yourBalances')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(balances ?? []).map((b) => (
            <div key={b.currency + b.mode} className="flex items-center justify-between rounded-2xl bg-black/30 p-4">
              <div>
                <div className="text-xs uppercase text-white/40">{enumLabel('mode', b.mode)}</div>
                <div className="text-xl font-bold tabular-nums">
                  {fmt(b.amount, 6)} <span className="text-white/50">{b.currency}</span>
                </div>
              </div>
              {b.mode === 'DEMO' ? <Mascot size={30} /> : <Gem size={26} className="text-sky" />}
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
  const [currency, setCurrency] = useState('USD');
  const [amount, setAmount] = useState('100');
  const [deposit, setDeposit] = useState<any>(null);
  const [applyBonus, setApplyBonus] = useState(true);
  const [err, setErr] = useState('');

  // Debounce the amount so we don't hammer the offer endpoint on each keystroke.
  const [debAmount, setDebAmount] = useState(amount);
  useEffect(() => {
    const id = setTimeout(() => setDebAmount(amount), 350);
    return () => clearTimeout(id);
  }, [amount]);

  // What deposit-match bonus (if any) will apply to this currency + amount.
  const { data: offer } = useQuery({
    queryKey: ['deposit-offer', currency, debAmount],
    enabled: !deposit && Number(debAmount) > 0,
    queryFn: async () => (await api.get(`/bonuses/deposit-offer?currency=${currency}&amount=${debAmount}`)).data,
  });

  const create = async () => {
    setErr('');
    try {
      const { data } = await api.post('/payments/deposits', { currency, amount, applyBonus });
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
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <ArrowDownToLine size={18} className="text-mint" /> {t('wallet.newDeposit')}
      </h2>
      <div>
        <label className="label">{t('common.currency')}</label>
        <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {currencies.map((c) => (
            <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">{t('common.amount')}</label>
        <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      </div>

      {/* Deposit-bonus offer: shown before depositing so there are no surprises. */}
      {!deposit && offer && (
        offer.blockedByWager ? (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-xs text-white/45">
            {t('wallet.bonusBlocked')}
          </div>
        ) : (
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-sun/30 bg-sun/[0.06] p-3">
            <input type="checkbox" className="mt-1" checked={applyBonus} onChange={(e) => setApplyBonus(e.target.checked)} />
            <span className="text-sm">
              <span className="font-semibold text-sun">🎁 {t('wallet.bonusOffer')}</span>
              <span className="mt-0.5 block text-white/75">
                {offer.percent ? `+${offer.percent}%` : `+${fmt(offer.bonusAmount)} ${offer.currency}`} · +{fmt(offer.bonusAmount)} {offer.currency} · {t('wallet.bonusTotal')} {fmt(offer.total)} {offer.currency}
              </span>
              <span className="mt-0.5 block text-[11px] text-white/45">
                {offer.wagerMultiplier ? `${t('bonuses.wagerTitle')} ×${offer.wagerMultiplier}` : t('bonuses.autoApplied')}
                {offer.sticky ? ` · ${t('bonuses.sticky')}` : ''}
                {offer.maxCashout ? ` · ${t('bonuses.maxCashout')} ${fmt(offer.maxCashout)} ${offer.currency}` : ''}
              </span>
            </span>
          </label>
        )
      )}

      {!deposit ? (
        <button onClick={create} className="btn-primary w-full">{t('common.deposit')}</button>
      ) : (
        <div className="space-y-2 rounded-2xl bg-black/30 p-4">
          <div className="text-xs text-white/40">{t('wallet.depositRef')} ({deposit.currency})</div>
          <div className="break-all rounded-lg bg-black/40 p-2 font-mono text-sm">{deposit.address}</div>
          <div className="text-xs text-white/40">{t('wallet.sandboxHint')}</div>
          <button onClick={confirm} className="btn-soft w-full">{t('wallet.confirmSandbox')}</button>
        </div>
      )}
      {err && <div className="text-sm text-roul-red">{err}</div>}
    </div>
  );
}

function WithdrawCard({ currencies, onDone }: { currencies: any[]; onDone: () => void }) {
  const { t } = useTranslation();
  const [currency, setCurrency] = useState('USD');
  const [amount, setAmount] = useState('10');
  const [address, setAddress] = useState('');

  const submit = async () => {
    try {
      await api.post('/payments/withdrawals', { currency, amount, address });
      toast.success(t('wallet.withdrawCreated'));
      setAddress('');
      onDone();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="card space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <ArrowUpFromLine size={18} className="text-sun" /> {t('wallet.requestWithdraw')}
      </h2>
      <div>
        <label className="label">{t('common.currency')}</label>
        <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {currencies.map((c) => (
            <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">{t('common.amount')}</label>
        <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      </div>
      <div>
        <label className="label">{t('wallet.payoutDetails')}</label>
        <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t('wallet.payoutPlaceholder')} />
      </div>
      <button onClick={submit} className="btn-ghost w-full" disabled={!address}>{t('common.withdraw')}</button>
    </div>
  );
}

// Category chips for the wallet history. Keys map to server-side groups in
// wallet.service (TX_GROUPS); 'all' sends no group. Gameplay (BET/WIN) is never
// shown here — it lives in game history on the profile.
const TX_GROUPS = ['all', 'deposits', 'withdrawals', 'bonuses', 'cashback', 'raffles', 'other'] as const;

function Transactions() {
  const { t } = useTranslation();
  const [group, setGroup] = useState<(typeof TX_GROUPS)[number]>('all');
  const { data } = useQuery({
    queryKey: ['txs', group],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '30', kind: 'money' });
      if (group !== 'all') params.set('group', group);
      return (await api.get(`/wallet/transactions?${params.toString()}`)).data;
    },
  });
  return (
    <div className="card p-5">
      <h2 className="mb-3 text-lg font-bold">{t('wallet.transactions')}</h2>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {TX_GROUPS.map((g) => (
          <button
            key={g}
            onClick={() => setGroup(g)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${group === g ? 'border-lav/40 bg-lav/15 text-lav' : 'border-white/10 bg-white/[0.03] text-white/60 hover:text-white'}`}
          >
            {t(`wallet.txGroups.${g}`)}
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        {(data ?? []).map((x: any) => (
          <div key={x.id} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="chip !px-2 !py-0.5 text-[10px]">{enumLabel('txType', x.type)}</span>
              <span className="text-white/50">{new Date(x.createdAt).toLocaleString()}</span>
            </div>
            <div className={`tabular-nums font-semibold ${x.direction === 'CREDIT' ? 'text-mint' : 'text-white/60'}`}>
              {x.direction === 'CREDIT' ? '+' : '−'}
              {fmt(x.amount, 6)} {x.currency} <span className="text-white/30">({enumLabel('mode', x.mode)})</span>
            </div>
          </div>
        ))}
        {(!data || data.length === 0) && <div className="py-4 text-center text-white/40">{t('common.empty')}</div>}
      </div>
      <p className="mt-3 text-xs text-white/40">
        {t('wallet.gameHistoryHint')}{' '}
        <Link to="/profile" className="text-lav hover:underline">
          {t('profile.history')}
        </Link>
      </p>
    </div>
  );
}
