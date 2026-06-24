import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { fmt } from '../lib/hooks';
import { useAuth } from '../store/auth';

export default function Vip() {
  const { t, i18n } = useTranslation();
  const en = i18n.language?.startsWith('en');
  const authed = !!useAuth((s) => s.accessToken);
  const { data: levels } = useQuery({ queryKey: ['vip-levels'], queryFn: async () => (await api.get('/vip/levels')).data });
  const { data: status } = useQuery({ queryKey: ['vip-status'], enabled: authed, queryFn: async () => (await api.get('/vip/status')).data });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">👑 {t('vip.title')}</h1>

      {authed && status && (
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase text-white/40">{t('vip.level')}</div>
              <div className="text-3xl font-extrabold holo-text">{status.current?.name} · {status.level}</div>
            </div>
            <div className="text-right text-sm text-white/60">
              <div>{t('vip.cashback')}: <b className="text-mint">{status.current?.cashbackPercent}%</b></div>
              <div>{t('vip.rakeback')}: <b className="text-sky">{status.current?.rakebackPercent}%</b></div>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-white/50">
              <span>XP {fmt(status.xp, 0)}</span>
              {status.next && <span>{status.next.name}: {fmt(status.next.xpRequired, 0)}</span>}
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-black/40">
              <div className="h-full rounded-full bg-holo" style={{ width: `${Math.round((status.progress ?? 0) * 100)}%` }} />
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(levels ?? []).map((l: any) => (
          <div
            key={l.level}
            className="card p-5"
            style={{ boxShadow: status?.level === l.level ? `0 0 40px -12px ${l.color}` : undefined }}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-lg font-bold" style={{ color: l.color }}>{l.name}</span>
              <span className="chip">LVL {l.level}</span>
            </div>
            <div className="text-sm text-white/60">XP: {fmt(l.xpRequired, 0)}</div>
            <div className="mt-2 space-y-1 text-sm">
              <div>💸 {t('vip.cashback')}: {l.cashbackPercent}%</div>
              <div>🔁 {t('vip.rakeback')}: {l.rakebackPercent}%</div>
              <div className="text-white/50">{en ? l.perksEn : l.perksRu}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
