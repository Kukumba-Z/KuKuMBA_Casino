import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../../components/Modal';
import { StatusChip } from '../../../components/StatusChip';
import { TicketThread } from '../../../components/TicketThread';
import api from '../../../lib/api';
import { when } from '../shared/format';
import { Table } from '../shared/Table';

export function TicketsTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['adm-tickets'], queryFn: async () => (await api.get('/admin/tickets')).data });
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <>
      <Table
        rows={data ?? []}
        defaultSort={{ key: 'updated', dir: 'desc' }}
        columns={[
          { key: 'user', label: t('admin.common.user'), sortValue: (x: any) => x.user?.username ?? '', render: (x: any) => `${x.user?.username} #${x.user?.accountId}` },
          { key: 'subject', label: t('admin.tickets.subject'), sortValue: (x: any) => x.subject, render: (x: any) => x.subject },
          {
            key: 'category',
            label: t('admin.tickets.category'),
            sortValue: (x: any) => x.category,
            render: (x: any) => t(`support.categories.${x.category}`, { defaultValue: x.category }),
          },
          { key: 'status', label: t('admin.common.status'), sortValue: (x: any) => x.status, render: (x: any) => <StatusChip category="ticketStatus" value={x.status} /> },
          { key: 'updated', label: t('admin.tickets.updated'), sortValue: (x: any) => +new Date(x.updatedAt), render: (x: any) => when(x.updatedAt) },
          {
            key: 'act',
            label: '',
            render: (x: any) => (
              <button onClick={() => setOpenId(x.id)} className="btn-soft px-3 py-1.5 text-xs">{t('support.open')}</button>
            ),
          },
        ]}
      />
      <Modal open={!!openId} onClose={() => setOpenId(null)} title={t('support.title')}>
        {openId && (
          <TicketThread ticketId={openId} base="/admin" admin onChanged={() => qc.invalidateQueries({ queryKey: ['adm-tickets'] })} />
        )}
      </Modal>
    </>
  );
}
