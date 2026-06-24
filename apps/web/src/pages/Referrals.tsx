import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { fmt } from '../lib/hooks';

export default function Referrals() {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ['referrals'], queryFn: async () => (await api.get('/referrals/me')).data });
  const [copied, setCopied] = useState(false);
  const link = data ? `${location.origin}/register?ref=${data.code}` : '';

  const copy = () => {
    navigator.clipboard?.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">🤝 {t('nav.referrals')}</h1>

      <div className="card space-y-4 p-6">
        <div>
          <label className="label">Ваш реферальный код / Your code</label>
          <div className="text-3xl font-extrabold holo-text">{data?.code ?? '…'}</div>
        </div>
        <div>
          <label className="label">Ссылка / Link</label>
          <div className="flex gap-2">
            <input readOnly className="input font-mono text-sm" value={link} />
            <button onClick={copy} className="btn-soft whitespace-nowrap">
              {copied ? t('common.copied') : t('common.copy')}
            </button>
          </div>
        </div>
        <p className="text-sm text-white/50">
          Приглашайте друзей и получайте комиссию с каждой их ставки. / Invite friends and earn a commission on every bet.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="stat">
          <div className="text-xs uppercase text-white/40">Рефералов</div>
          <div className="text-2xl font-extrabold text-sky">{data?.referralsCount ?? 0}</div>
        </div>
        {(data?.earnings ?? []).slice(0, 2).map((e: any) => (
          <div key={e.currency + e.mode} className="stat">
            <div className="text-xs uppercase text-white/40">Доход {e.currency}</div>
            <div className="text-2xl font-extrabold text-mint">{fmt(e.amount, 4)}</div>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <h2 className="mb-3 text-lg font-bold">Ваши рефералы / Referred users</h2>
        <div className="space-y-2">
          {(data?.referrals ?? []).map((r: any) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-sm">
              <span>{r.username} <span className="text-white/40">#{r.accountId}</span></span>
              <span className="text-white/50">{new Date(r.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
          {(!data?.referrals || data.referrals.length === 0) && <div className="py-3 text-center text-white/40">{t('common.empty')}</div>}
        </div>
      </div>
    </div>
  );
}
