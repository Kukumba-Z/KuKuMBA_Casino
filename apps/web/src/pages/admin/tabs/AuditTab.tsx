import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/api';
import { when } from '../shared/format';
import { Table } from '../shared/Table';

export function AuditTab() {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ['adm-audit'], queryFn: async () => (await api.get('/admin/audit?take=200')).data });
  return (
    <Table
      rows={data ?? []}
      defaultSort={{ key: 'when', dir: 'desc' }}
      columns={[
        {
          key: 'actor',
          label: t('admin.audit.actor'),
          sortValue: (a: any) => a.actorName ?? '',
          render: (a: any) => a.actorName ?? <span className="text-white/30">—</span>,
        },
        // Audit actions are dotted code identifiers (user.status) — intentionally
        // raw in a mono font, this is an operator log, not player-facing UI.
        { key: 'action', label: t('admin.audit.action'), sortValue: (a: any) => a.action, render: (a: any) => <span className="font-mono text-xs">{a.action}</span> },
        {
          key: 'target',
          label: t('admin.audit.target'),
          sortValue: (a: any) => `${a.targetType ?? ''} ${a.targetId ?? ''}`,
          render: (a: any) => `${a.targetType ?? ''} ${a.targetId ?? ''}`,
        },
        { key: 'when', label: t('admin.common.when'), sortValue: (a: any) => +new Date(a.createdAt), render: (a: any) => when(a.createdAt) },
      ]}
    />
  );
}
