import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api, { apiError } from '../../../../lib/api';
import { can, fmt, type AdminMe } from '../../../../lib/hooks';
import { enumLabel } from '../../../../lib/labels';
import { toast } from '../../../../store/toast';

/**
 * The user's recent bets with the two reversal actions (bets.manage):
 * refund — stake back on a LOST/PUSH bet; rollback — full undo incl. winnings.
 */
export function BetsPanel({ userId, me, refresh }: { userId: string; me: AdminMe; refresh: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const { data: bets } = useQuery({
    queryKey: ['adm-user-bets', userId],
    enabled: show,
    queryFn: async () => (await api.get(`/admin/users/${userId}/bets?take=25`)).data,
  });
  const canReverse = can(me, 'bets.manage');

  const reverse = async (kind: 'refund' | 'rollback', bet: any) => {
    const msg = kind === 'refund'
      ? t('admin.users.refundConfirm', { stake: fmt(bet.stake, 2), currency: bet.currency })
      : t('admin.users.rollbackConfirm', { stake: fmt(bet.stake, 2), payout: fmt(bet.payout, 2), currency: bet.currency });
    if (!confirm(msg)) return;
    const reason = window.prompt(t('admin.common.reasonOptional')) ?? undefined;
    try {
      await api.post(`/admin/bets/${bet.id}/${kind}`, { reason });
      qc.invalidateQueries({ queryKey: ['adm-user-bets', userId] });
      refresh();
      toast.success(kind === 'refund' ? t('admin.users.refunded') : t('admin.users.rolledBack'));
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div>
      <button onClick={() => setShow((s) => !s)} className="text-sm text-lav hover:underline">
        {show ? t('admin.users.hideBets') : t('admin.users.showBets')}
      </button>
      {show && (
        <div className="mt-2 max-h-72 space-y-1 overflow-y-auto text-xs">
          {(bets ?? []).map((b: any) => (
            <div key={b.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5">
              <span className="min-w-0 truncate">
                {b.betType} · {b.outcome ?? '—'} · <span className="text-white/40">{enumLabel('betStatus', b.status)}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className={Number(b.payout) > 0 ? 'text-mint' : 'text-white/40'}>
                  {Number(b.payout) > 0 ? `+${fmt(b.payout, 2)}` : `−${fmt(b.stake, 2)}`} {b.currency}
                </span>
                {canReverse && (b.status === 'LOST' || b.status === 'PUSH') && (
                  <button onClick={() => reverse('refund', b)} className="text-lav hover:underline" title={t('admin.users.refundHint')}>
                    {t('admin.users.refund')}
                  </button>
                )}
                {canReverse && ['WON', 'LOST', 'PUSH'].includes(b.status) && (
                  <button onClick={() => reverse('rollback', b)} className="text-roul-red hover:underline" title={t('admin.users.rollbackHint')}>
                    {t('admin.users.rollback')}
                  </button>
                )}
              </span>
            </div>
          ))}
          {(bets ?? []).length === 0 && <div className="py-2 text-center text-white/30">—</div>}
        </div>
      )}
    </div>
  );
}
