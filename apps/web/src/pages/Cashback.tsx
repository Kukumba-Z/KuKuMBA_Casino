import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api, { apiError } from '../lib/api';
import { fmt } from '../lib/hooks';

export default function Cashback() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['cashback'], queryFn: async () => (await api.get('/cashback/status')).data });
  const [msg, setMsg] = useState('');

  const claim = async () => {
    setMsg('');
    try {
      await api.post('/cashback/claim');
      setMsg('✅ Кешбэк зачислен / Cashback credited');
      qc.invalidateQueries({ queryKey: ['cashback'] });
      qc.invalidateQueries({ queryKey: ['balances'] });
    } catch (e) {
      setMsg('⚠ ' + apiError(e));
    }
  };

  const items = data?.claimable ?? [];
  const has = items.length > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-extrabold">💸 {t('nav.cashback')}</h1>
      <div className="card space-y-4 p-6 text-center">
        <div className="text-sm text-white/50">Ваш процент кешбэка (от VIP-уровня)</div>
        <div className="text-5xl font-extrabold holo-text">{data?.percent ?? 0}%</div>
        {has ? (
          <div className="space-y-2">
            {items.map((i: any) => (
              <div key={i.currency + i.mode} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-2">
                <span className="text-white/60">Доступно ({i.currency} {i.mode})</span>
                <span className="font-bold text-mint">+{fmt(i.cashback, 4)} {i.currency}</span>
              </div>
            ))}
            <button onClick={claim} className="btn-primary w-full">{t('common.claim')}</button>
          </div>
        ) : (
          <div className="text-white/40">Нет доступного кешбэка. Делайте ставки, чтобы накопить.</div>
        )}
        {msg && <div className="text-sm">{msg}</div>}
      </div>
      <p className="text-center text-xs text-white/40">
        Кешбэк рассчитывается от чистых потерь с момента последнего получения.
      </p>
    </div>
  );
}
