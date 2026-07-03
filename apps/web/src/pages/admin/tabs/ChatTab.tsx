import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/api';
import { useAct } from '../shared/useAct';

export function ChatTab() {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['adm-chat'],
    queryFn: async () => (await api.get('/admin/chat?take=100')).data,
    refetchInterval: 10_000,
  });
  const act = useAct('adm-chat');
  const isMuted = (m: any) => m.mutedUntil && new Date(m.mutedUntil) > new Date();

  return (
    <div className="card p-4">
      <div className="mb-3 text-sm text-white/55">{t('admin.chat.hint')}</div>
      <div className="space-y-1.5">
        {(data ?? []).map((m: any) => (
          <div key={m.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${m.deleted ? 'bg-roul-red/5 text-white/30' : 'bg-white/[0.03]'}`}>
            <span className="w-32 shrink-0 truncate text-white/45">{m.username} <span className="text-white/25">#{m.accountId}</span></span>
            <span className={`min-w-0 flex-1 truncate ${m.deleted ? 'line-through' : ''}`}>{m.body}</span>
            {isMuted(m) && <span className="chip shrink-0 text-[10px] text-roul-red">{t('admin.chat.muted')}</span>}
            <span className="shrink-0 text-xs text-white/25">{new Date(m.createdAt).toLocaleTimeString()}</span>
            <div className="flex shrink-0 gap-1">
              {!m.deleted && (
                <button
                  onClick={() => act(() => api.delete(`/admin/chat/${m.id}`), t('admin.common.deleted'))}
                  className="btn-ghost !px-2 !py-1 text-xs text-roul-red"
                  title={t('admin.chat.deleteMsg')}
                >
                  <X size={13} />
                </button>
              )}
              {isMuted(m) ? (
                <button onClick={() => act(() => api.post(`/admin/users/${m.userId}/mute`, { minutes: 0 }), t('admin.chat.unmuted'))} className="btn-ghost !px-2 !py-1 text-xs text-mint">
                  {t('admin.chat.unmute')}
                </button>
              ) : (
                <button onClick={() => act(() => api.post(`/admin/users/${m.userId}/mute`, { minutes: 60 }), t('admin.chat.muted60'))} className="btn-ghost !px-2 !py-1 text-xs">
                  {t('admin.chat.mute60')}
                </button>
              )}
            </div>
          </div>
        ))}
        {(data ?? []).length === 0 && <div className="py-4 text-center text-white/40">—</div>}
      </div>
    </div>
  );
}
