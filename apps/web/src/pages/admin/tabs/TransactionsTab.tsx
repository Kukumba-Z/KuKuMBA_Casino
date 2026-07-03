import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/api';
import { fmt } from '../../../lib/hooks';
import { enumLabel } from '../../../lib/labels';
import { when } from '../shared/format';
import { Table } from '../shared/Table';

export function TransactionsTab() {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ['adm-txs'], queryFn: async () => (await api.get('/admin/transactions?take=200')).data });
  return (
    <Table
      rows={data ?? []}
      defaultSort={{ key: 'when', dir: 'desc' }}
      columns={[
        {
          key: 'user',
          label: t('admin.common.user'),
          sortValue: (x: any) => x.user?.username ?? '',
          render: (x: any) => `${x.user?.username ?? '—'} ${x.user?.accountId ? `#${x.user.accountId}` : ''}`,
        },
        { key: 'type', label: t('admin.common.type'), sortValue: (x: any) => x.type, render: (x: any) => enumLabel('txType', x.type) },
        {
          key: 'amount',
          label: t('admin.common.amount'),
          sortValue: (x: any) => Number(x.amount) * (x.direction === 'CREDIT' ? 1 : -1),
          render: (x: any) => (
            <span className={x.direction === 'CREDIT' ? 'text-mint' : 'text-white/60'}>
              {x.direction === 'CREDIT' ? '+' : '−'}{fmt(x.amount, 4)} {x.currency} ({enumLabel('mode', x.mode)})
            </span>
          ),
        },
        { key: 'when', label: t('admin.common.when'), sortValue: (x: any) => +new Date(x.createdAt), render: (x: any) => when(x.createdAt) },
      ]}
    />
  );
}
