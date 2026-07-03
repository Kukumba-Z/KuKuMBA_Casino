import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api, { apiError } from '../lib/api';
import { fmt } from '../lib/hooks';
import { toast } from '../store/toast';

/**
 * Referral hub: revenue share on the referrals' net losses. Shows the program
 * terms, claimable balances, per-referral lifetime earnings and the recent
 * commission history — full transparency for partners.
 */
export default function Referrals({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['referrals'], queryFn: async () => (await api.get('/referrals/me')).data });
  const [copied, setCopied] = useState(false);
  const link = data ? `${location.origin}/register?ref=${data.code}` : '';

  const copy = () => {
    navigator.clipboard?.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const claim = async () => {
    try {
      await api.post('/referrals/claim');
      toast.success(t('common.done'));
      qc.invalidateQueries({ queryKey: ['referrals'] });
      qc.invalidateQueries({ queryKey: ['balances'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const claimable = data?.claimable ?? [];

  return (
    <div className="space-y-6">
      {!embedded && (
        <h1 className="flex items-center gap-2 text-2xl font-extrabold">
          <Users size={24} className="text-sky" /> {t('nav.referrals')}
        </h1>
      )}

      <div className="card space-y-4 p-6">
        <div>
          <label className="label">{t('referrals.yourCode')}</label>
          <div className="holo-text text-3xl font-extrabold">{data?.code ?? '…'}</div>
        </div>
        <div>
          <label className="label">{t('referrals.link')}</label>
          <div className="flex gap-2">
            <input readOnly className="input font-mono text-sm" value={link} />
            <button onClick={copy} className="btn-soft flex items-center gap-2 whitespace-nowrap">
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? t('common.copied') : t('common.copy')}
            </button>
          </div>
        </div>
        <p className="text-sm text-white/50">{t('referrals.desc', { percent: data?.percent ?? 10 })}</p>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="stat">
          <div className="text-xs uppercase text-white/40">{t('referrals.count')}</div>
          <div className="text-2xl font-extrabold text-sky">{data?.referralsCount ?? 0}</div>
        </div>
        <div className="stat">
          <div className="text-xs uppercase text-white/40">{t('referrals.active')}</div>
          <div className="text-2xl font-extrabold text-lav">{data?.activeReferralsCount ?? 0}</div>
        </div>
        <div className="stat">
          <div className="text-xs uppercase text-white/40">{t('referrals.earnedTotal')}</div>
          <div className="text-2xl font-extrabold text-mint">${fmt(data?.earnedTotalUsd, 2)}</div>
        </div>
        <div className="stat">
          <div className="text-xs uppercase text-white/40">{t('referrals.claimableTitle')}</div>
          <div className="text-2xl font-extrabold text-sun">${fmt(data?.claimableUsd, 2)}</div>
        </div>
      </div>

      {/* Claim */}
      <div className="card space-y-3 p-5">
        <h2 className="text-lg font-bold">{t('referrals.claimableTitle')}</h2>
        {claimable.length > 0 ? (
          <>
            {claimable.map((c: any) => (
              <div key={c.currency} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-2 text-sm">
                <span className="text-white/60">{c.currency}</span>
                <span className="font-bold text-mint">+{fmt(c.amount, 4)} {c.currency}</span>
              </div>
            ))}
            <button onClick={claim} className="btn-primary w-full">{t('common.claim')}</button>
          </>
        ) : (
          <div className="py-2 text-center text-sm text-white/40">{t('referrals.nothingToClaim')}</div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Referral list with lifetime earnings */}
        <div className="card p-5">
          <h2 className="mb-3 text-lg font-bold">{t('referrals.list')}</h2>
          <div className="space-y-2">
            {(data?.referrals ?? []).map((r: any) => (
              <div key={r.id} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  {r.username} <span className="text-white/40">#{r.accountId}</span>
                  <span className="ml-2 text-xs text-white/35">{new Date(r.createdAt).toLocaleDateString()}</span>
                </span>
                <span className={`shrink-0 font-semibold tabular-nums ${Number(r.earnedUsd) > 0 ? 'text-mint' : 'text-white/35'}`}>
                  ${fmt(r.earnedUsd, 2)}
                </span>
              </div>
            ))}
            {(!data?.referrals || data.referrals.length === 0) && (
              <div className="py-3 text-center text-white/40">{t('common.empty')}</div>
            )}
          </div>
        </div>

        {/* Recent commission history */}
        <div className="card p-5">
          <h2 className="mb-3 text-lg font-bold">{t('referrals.recent')}</h2>
          <div className="space-y-2">
            {(data?.recent ?? []).map((e: any) => (
              <div key={e.id} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-white/60">
                  {e.from ? `${e.from.username} ` : ''}
                  <span className="text-xs text-white/35">{new Date(e.createdAt).toLocaleString()}</span>
                </span>
                <span className="shrink-0 font-semibold text-mint">+{fmt(e.amount, 4)} {e.currency}</span>
              </div>
            ))}
            {(!data?.recent || data.recent.length === 0) && (
              <div className="py-3 text-center text-white/40">{t('common.empty')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
