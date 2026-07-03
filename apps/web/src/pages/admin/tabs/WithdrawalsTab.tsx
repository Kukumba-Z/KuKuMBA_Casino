import { useQuery } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../../components/Modal';
import { StatusChip } from '../../../components/StatusChip';
import api from '../../../lib/api';
import { fmt } from '../../../lib/hooks';
import { when } from '../shared/format';
import { Table } from '../shared/Table';
import { useAct } from '../shared/useAct';

export function WithdrawalsTab() {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ['adm-wd'], queryFn: async () => (await api.get('/admin/withdrawals')).data });
  const act = useAct('adm-wd');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const approve = (id: string) => act(() => api.post(`/admin/withdrawals/${id}/approve`), t('admin.withdrawals.approved'));
  const reject = async () => {
    if (!rejectId) return;
    const ok = await act(() => api.post(`/admin/withdrawals/${rejectId}/reject`, { reason }), t('admin.withdrawals.rejected'));
    if (ok) {
      setRejectId(null);
      setReason('');
    }
  };

  return (
    <>
      <Table
        rows={data ?? []}
        defaultSort={{ key: 'when', dir: 'desc' }}
        columns={[
          { key: 'user', label: t('admin.common.user'), sortValue: (w: any) => w.user?.username ?? '', render: (w: any) => `${w.user?.username} #${w.user?.accountId}` },
          { key: 'amount', label: t('admin.common.amount'), sortValue: (w: any) => Number(w.amount), render: (w: any) => `${fmt(w.amount)} ${w.currency}` },
          { key: 'address', label: t('admin.withdrawals.address'), render: (w: any) => <span className="font-mono text-xs">{w.address}</span> },
          { key: 'status', label: t('admin.common.status'), sortValue: (w: any) => w.status, render: (w: any) => <StatusChip category="withdrawalStatus" value={w.status} /> },
          {
            key: 'reason',
            label: t('admin.common.reason'),
            render: (w: any) => (w.meta?.reason ? <span className="text-xs text-white/50">{w.meta.reason}</span> : <span className="text-white/30">—</span>),
          },
          { key: 'when', label: t('admin.common.when'), sortValue: (w: any) => +new Date(w.createdAt), render: (w: any) => when(w.createdAt) },
          {
            key: 'act',
            label: '',
            render: (w: any) =>
              w.status === 'PENDING' || w.status === 'PROCESSING' ? (
                <span className="flex gap-1">
                  {w.status === 'PENDING' && (
                    <button onClick={() => approve(w.id)} className="btn-soft inline-flex items-center gap-1 text-xs" title={t('admin.withdrawals.approve')}>
                      <Check size={13} />
                    </button>
                  )}
                  <button onClick={() => setRejectId(w.id)} className="btn-ghost inline-flex items-center gap-1 text-xs" title={t('admin.withdrawals.reject')}>
                    <X size={13} />
                  </button>
                </span>
              ) : (
                <span className="text-white/30">—</span>
              ),
          },
        ]}
      />
      <Modal open={!!rejectId} onClose={() => setRejectId(null)} title={t('admin.withdrawals.rejectTitle')}>
        <div className="space-y-3">
          <p className="text-sm text-white/55">{t('admin.withdrawals.rejectHint')}</p>
          <textarea
            className="input min-h-24 w-full"
            placeholder={t('admin.common.reason')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setRejectId(null)} className="btn-ghost text-sm">{t('common.cancel')}</button>
            <button onClick={reject} className="btn-primary text-sm" disabled={reason.trim().length < 2}>
              {t('admin.withdrawals.reject')}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
