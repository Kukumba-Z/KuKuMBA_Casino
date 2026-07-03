import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusChip } from '../../../components/StatusChip';
import api from '../../../lib/api';
import { fmt } from '../../../lib/hooks';
import { enumLabel } from '../../../lib/labels';
import { when } from '../shared/format';
import { Table } from '../shared/Table';
import { useAct } from '../shared/useAct';

const STATUSES = ['PENDING', 'CONFIRMING', 'COMPLETED', 'FAILED', 'EXPIRED'];

export function DepositsTab() {
  const { t } = useTranslation();
  const [status, setStatus] = useState('PENDING');
  const { data } = useQuery({
    queryKey: ['adm-deps', status],
    queryFn: async () => (await api.get(`/admin/deposits${status ? `?status=${status}` : ''}`)).data,
  });
  const act = useAct(['adm-deps', status]);
  const confirm = (id: string) => act(() => api.post(`/admin/deposits/${id}/confirm`), t('admin.deposits.confirmed'));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-white/40">{t('admin.common.status')}:</span>
        <select className="input !w-44 !py-1.5" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('admin.common.all')}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{enumLabel('depositStatus', s)}</option>)}
        </select>
      </div>
      <Table
        rows={data ?? []}
        defaultSort={{ key: 'when', dir: 'desc' }}
        columns={[
          { key: 'user', label: t('admin.common.user'), sortValue: (d: any) => d.user?.username ?? '', render: (d: any) => `${d.user?.username} #${d.user?.accountId}` },
          {
            key: 'amount',
            label: t('admin.common.amount'),
            sortValue: (d: any) => Number(d.amount),
            render: (d: any) => `${fmt(d.amount)} ${d.currency} (${d.network ?? '-'})`,
          },
          { key: 'status', label: t('admin.common.status'), sortValue: (d: any) => d.status, render: (d: any) => <StatusChip category="depositStatus" value={d.status} /> },
          { key: 'when', label: t('admin.common.when'), sortValue: (d: any) => +new Date(d.createdAt), render: (d: any) => when(d.createdAt) },
          {
            key: 'act',
            label: '',
            render: (d: any) =>
              d.status === 'PENDING' || d.status === 'CONFIRMING' ? (
                <button onClick={() => confirm(d.id)} className="btn-soft text-xs">{t('admin.deposits.confirm')}</button>
              ) : (
                <span className="text-white/30">—</span>
              ),
          },
        ]}
      />
    </div>
  );
}
