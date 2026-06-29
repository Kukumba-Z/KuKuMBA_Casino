import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgePercent } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api, { apiError } from '../lib/api';
import { fmt } from '../lib/hooks';
import { toast } from '../store/toast';

/** Compact "2d 4h" / "4h 12m" / "12m" countdown to the next weekly claim. */
function countdown(toIso?: string | null): string {
  if (!toIso) return '';
  const ms = new Date(toIso).getTime() - Date.now();
  if (ms <= 0) return '';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function Cashback({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['cashback'], queryFn: async () => (await api.get('/cashback/status')).data });

  const claim = async () => {
    try {
      await api.post('/cashback/claim');
      toast.success(t('common.done'));
      qc.invalidateQueries({ queryKey: ['cashback'] });
      qc.invalidateQueries({ queryKey: ['balances'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const items = data?.claimable ?? [];
  const has = items.length > 0;
  const onCooldown = !!data?.onCooldown;
  const next = countdown(data?.nextClaimAt);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {!embedded && (
        <h1 className="flex items-center gap-2 text-2xl font-extrabold">
          <BadgePercent size={24} className="text-mint" /> {t('nav.cashback')}
        </h1>
      )}
      <div className="card space-y-4 p-6 text-center">
        <div className="text-sm text-white/50">{t('cashback.percentLabel')}</div>
        <div className="holo-text text-5xl font-extrabold">{data?.percent ?? 0}%</div>
        {onCooldown ? (
          <div className="rounded-xl bg-white/[0.03] px-4 py-3 text-sm text-white/60">
            {t('cashback.nextClaim')}: <span className="font-bold text-white/80">{next}</span>
          </div>
        ) : has ? (
          <div className="space-y-2">
            {items.map((i: any) => (
              <div key={i.currency} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-2">
                <span className="text-white/60">{t('cashback.available')} ({i.currency})</span>
                <span className="font-bold text-mint">+{fmt(i.cashback, 4)} {i.currency}</span>
              </div>
            ))}
            <button onClick={claim} className="btn-primary w-full">{t('common.claim')}</button>
          </div>
        ) : (
          <div className="text-white/40">{t('cashback.none')}</div>
        )}
      </div>
      <p className="text-center text-xs text-white/40">{t('cashback.weeklyNote')}</p>
    </div>
  );
}
