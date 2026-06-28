import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Tag } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api, { apiError } from '../lib/api';
import { enumLabel } from '../lib/labels';
import { toast } from '../store/toast';

export default function Promo({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const { data: mine } = useQuery({ queryKey: ['promo-me'], queryFn: async () => (await api.get('/promocodes/me')).data });

  const redeem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/promocodes/redeem', { code });
      toast.success(`${enumLabel('promoType', data.type)}${data.amount && Number(data.amount) ? ` · +${data.amount} ${data.currency}` : ''}`);
      setCode('');
      qc.invalidateQueries({ queryKey: ['balances'] });
      qc.invalidateQueries({ queryKey: ['promo-me'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {!embedded && (
        <h1 className="flex items-center gap-2 text-2xl font-extrabold">
          <Tag size={24} className="text-sun" /> {t('nav.promo')}
        </h1>
      )}
      <form onSubmit={redeem} className="card space-y-3 p-6">
        <label className="label">{t('promo.enter')}</label>
        <div className="flex gap-2">
          <input className="input uppercase" value={code} onChange={(e) => setCode(e.target.value)} placeholder="KUKUMBA" />
          <button className="btn-primary">{t('common.claim')}</button>
        </div>
        <p className="text-xs text-white/40">{t('promo.hint')}</p>
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
