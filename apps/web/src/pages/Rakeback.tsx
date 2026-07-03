import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Repeat } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import api, { apiError } from '../lib/api';
import { fmt } from '../lib/hooks';
import { toast } from '../store/toast';

/**
 * Rakeback hub: the player's share of the house edge, accrued on every real
 * bet regardless of the outcome, collectable at any moment with no wagering.
 */
export default function Rakeback({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['rakeback'], queryFn: async () => (await api.get('/rakeback/status')).data });

  const claim = async () => {
    try {
      await api.post('/rakeback/claim');
      toast.success(t('common.done'));
      qc.invalidateQueries({ queryKey: ['rakeback'] });
      qc.invalidateQueries({ queryKey: ['balances'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const items = data?.items ?? [];
  const percent = data?.percent ?? 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {!embedded && (
        <h1 className="flex items-center gap-2 text-2xl font-extrabold">
          <Repeat size={24} className="text-sky" /> {t('nav.rakeback')}
        </h1>
      )}
      <div className="card space-y-4 p-6 text-center">
        <div className="text-sm text-white/50">{t('rakeback.percentLabel')}</div>
        <div className="holo-text text-5xl font-extrabold">{percent}%</div>

        {percent <= 0 && (
          <div className="rounded-xl bg-white/[0.03] px-4 py-3 text-sm text-white/60">
            {t('rakeback.locked')}{' '}
            <Link to="/bonuses?tab=vip" className="font-semibold text-lav hover:underline">VIP</Link>
          </div>
        )}

        {items.length > 0 ? (
          <div className="space-y-2">
            {items.map((i: any) => (
              <div key={i.currency} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-2">
                <span className="text-white/60">{t('rakeback.available')} ({i.currency})</span>
                <span className="font-bold text-sky">+{fmt(i.amount, 4)} {i.currency}</span>
              </div>
            ))}
            <button onClick={claim} className="btn-primary w-full">{t('common.claim')}</button>
          </div>
        ) : (
          <div className="text-white/40">{t('rakeback.none')}</div>
        )}
      </div>
      <p className="text-center text-xs text-white/40">{t('rakeback.note')}</p>
    </div>
  );
}
