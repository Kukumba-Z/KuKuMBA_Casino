import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api, { apiError } from '../lib/api';

export default function Promo() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const { data: mine } = useQuery({ queryKey: ['promo-me'], queryFn: async () => (await api.get('/promocodes/me')).data });

  const redeem = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    try {
      const { data } = await api.post('/promocodes/redeem', { code });
      setMsg(`✅ ${data.type} ${data.amount ? `+${data.amount} ${data.currency}` : ''}`);
      setCode('');
      qc.invalidateQueries({ queryKey: ['balances'] });
      qc.invalidateQueries({ queryKey: ['promo-me'] });
    } catch (e) {
      setErr(apiError(e));
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-extrabold">🏷 {t('nav.promo')}</h1>
      <form onSubmit={redeem} className="card space-y-3 p-6">
        <label className="label">Введите промокод / Enter a promo code</label>
        <div className="flex gap-2">
          <input className="input uppercase" value={code} onChange={(e) => setCode(e.target.value)} placeholder="KUKUMBA" />
          <button className="btn-primary">{t('common.claim')}</button>
        </div>
        {msg && <div className="text-sm text-mint">{msg}</div>}
        {err && <div className="text-sm text-roul-red">{err}</div>}
        <p className="text-xs text-white/40">Попробуйте: KUKUMBA, WELCOME50, VIPBOOST</p>
      </form>

      <div className="card p-5">
        <h2 className="mb-3 text-lg font-bold">{t('common.history')}</h2>
        <div className="space-y-2">
          {(mine ?? []).map((r: any) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-sm">
              <span className="font-mono">{r.promoCode?.code}</span>
              <span className="text-white/50">{new Date(r.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
          {(!mine || mine.length === 0) && <div className="py-3 text-center text-white/40">{t('common.empty')}</div>}
        </div>
      </div>
    </div>
  );
}
