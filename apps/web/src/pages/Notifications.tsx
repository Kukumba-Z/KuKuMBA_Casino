import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { getSocket } from '../lib/socket';

export default function Notifications() {
  const { t, i18n } = useTranslation();
  const en = i18n.language?.startsWith('en');
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['notifications'], queryFn: async () => (await api.get('/notifications?limit=50')).data });

  useEffect(() => {
    const s = getSocket();
    const onN = () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['unread'] });
    };
    s.on('notification', onN);
    return () => {
      s.off('notification', onN);
    };
  }, [qc]);

  const readAll = async () => {
    await api.post('/notifications/read-all');
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['unread'] });
  };
  const read = async (id: string) => {
    await api.post(`/notifications/${id}/read`);
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['unread'] });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold">
          <Bell size={24} className="text-sun" /> {t('nav.notifications')}
        </h1>
        <button onClick={readAll} className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10">
          <CheckCheck size={14} /> {t('common.readAll')}
        </button>
      </div>
      <div className="space-y-2">
        {(data ?? []).map((n: any) => (
          <button
            key={n.id}
            onClick={() => !n.readAt && read(n.id)}
            className={`card w-full p-4 text-left transition ${n.readAt ? 'opacity-60' : 'border-lav/30'}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold">{en ? n.titleEn : n.titleRu}</span>
              <span className="text-xs text-white/40">{new Date(n.createdAt).toLocaleString()}</span>
            </div>
            <div className="mt-1 text-sm text-white/60">{en ? n.bodyEn : n.bodyRu}</div>
          </button>
        ))}
        {(!data || data.length === 0) && <div className="card p-8 text-center text-white/40">{t('common.empty')}</div>}
      </div>
    </div>
  );
}
