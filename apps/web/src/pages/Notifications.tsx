import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NotificationIcon } from '../components/NotificationIcon';
import api from '../lib/api';
import { getSocket } from '../lib/socket';

// The server keeps only the latest 20 per user (older ones are deleted), so we
// ask for that many — the full kept window.
const KEEP = 20;

export default function Notifications() {
  const { t, i18n } = useTranslation();
  const en = i18n.language?.startsWith('en');
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['notifications'], queryFn: async () => (await api.get(`/notifications?limit=${KEEP}`)).data });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['unread'] });
  };

  useEffect(() => {
    const s = getSocket();
    s.on('notification', refresh);
    return () => {
      s.off('notification', refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc]);

  const readAll = async () => {
    await api.post('/notifications/read-all');
    refresh();
  };
  const read = async (id: string) => {
    await api.post(`/notifications/${id}/read`);
    refresh();
  };
  const remove = async (id: string) => {
    await api.delete(`/notifications/${id}`);
    refresh();
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
          <div
            key={n.id}
            className={`card flex items-start gap-2 p-4 transition ${n.readAt ? 'opacity-60' : 'border-lav/30'}`}
          >
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/5">
              <NotificationIcon type={n.type} data={n.data} size={16} />
            </span>
            <button onClick={() => !n.readAt && read(n.id)} className="min-w-0 flex-1 text-left">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{en ? n.titleEn : n.titleRu}</span>
                <span className="shrink-0 text-xs text-white/40">{new Date(n.createdAt).toLocaleString()}</span>
              </div>
              <div className="mt-1 text-sm text-white/60">{en ? n.bodyEn : n.bodyRu}</div>
            </button>
            <button
              onClick={() => remove(n.id)}
              aria-label={t('common.delete')}
              title={t('common.delete')}
              className="shrink-0 rounded-lg p-1.5 text-white/40 transition hover:bg-white/10 hover:text-rose-300"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {(!data || data.length === 0) && <div className="card p-8 text-center text-white/40">{t('common.empty')}</div>}
      </div>
    </div>
  );
}
