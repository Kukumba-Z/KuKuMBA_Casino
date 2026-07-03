import { useQuery } from '@tanstack/react-query';
import { Ban, MicOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import api, { apiError } from '../lib/api';
import { can, useAdminMe, useVipBadges } from '../lib/hooks';
import { enumLabel } from '../lib/labels';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import { Modal } from './Modal';
import { VipEmblem } from './VipEmblem';

/** Tap a chat nickname → mini profile (id, registered, VIP). Staff with
 *  `chat.moderate` also get mute / ban-from-chat (reusing the admin mute
 *  endpoint — ban is just a far-future mute). */
export function ChatUserPopover({ user, onClose }: { user: any; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: me } = useAdminMe();
  const myId = useAuth((s) => s.user?.id);
  // Moderation needs the permission, a known target, and never applies to yourself.
  const staff = can(me, 'chat.moderate') && !!user.userId && user.userId !== myId;

  const { data: card } = useQuery({
    queryKey: ['user-card', user.accountId],
    enabled: user.accountId != null,
    queryFn: async () => (await api.get(`/users/${user.accountId}/card`)).data,
  });
  const { data: vipBadges } = useVipBadges();

  const mute = async (minutes: number, ok: string) => {
    if (!user.userId) return;
    try {
      await api.post(`/admin/users/${user.userId}/mute`, { minutes });
      toast.success(ok);
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const registered = card?.createdAt ? new Date(card.createdAt).toLocaleDateString() : null;
  const vipLevel = user.vipLevel ?? card?.vipLevel ?? 0;
  const badge = vipBadges?.[vipLevel];

  return (
    <Modal open onClose={onClose} title={user.username}>
      <div className="space-y-3 text-sm">
        <Row label={t('common.accountId')} value={`#${user.accountId ?? card?.accountId ?? '—'}`} />
        <Row
          label="VIP"
          value={
            badge ? (
              <span className="inline-flex items-center gap-1.5">
                <VipEmblem icon={badge.icon} color={badge.color} size={15} />
                {badge.name} · {vipLevel}
              </span>
            ) : (
              String(vipLevel)
            )
          }
        />
        {user.role && user.role !== 'USER' && <Row label={t('chat.role')} value={enumLabel('role', user.role)} />}
        {registered && <Row label={t('chat.registered')} value={registered} />}

        {staff && (
          <div className="space-y-2 border-t border-white/10 pt-3">
            <div className="text-xs uppercase tracking-wide text-white/40">{t('chat.moderation')}</div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => mute(60, t('chat.muted'))} className="btn-ghost inline-flex items-center justify-center gap-1.5 text-sm">
                <MicOff size={15} /> {t('chat.mute')}
              </button>
              <button onClick={() => mute(60 * 24 * 3650, t('chat.banned'))} className="btn-ghost inline-flex items-center justify-center gap-1.5 text-sm text-bubble">
                <Ban size={15} /> {t('chat.ban')}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/45">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
