import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/api';
import { enumLabel } from '../../../lib/labels';
import { Table } from '../shared/Table';
import { useAct } from '../shared/useAct';

export function CurrenciesTab() {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ['adm-cur'], queryFn: async () => (await api.get('/admin/currencies')).data });
  const act = useAct('adm-cur', 'currencies');
  const save = (c: any, patch: any) =>
    act(() => api.post('/admin/currencies', { ...c, ...patch }), `${c.code} · ${t('admin.common.saved')}`);
  return (
    <Table
      rows={data ?? []}
      rowKey={(c: any) => c.code}
      defaultSort={{ key: 'sort', dir: 'asc' }}
      columns={[
        { key: 'code', label: t('admin.currencies.code'), sortValue: (c: any) => c.code, render: (c: any) => <span className="font-semibold">{c.code}</span> },
        { key: 'type', label: t('admin.common.type'), sortValue: (c: any) => c.type, render: (c: any) => enumLabel('currencyType', c.type) },
        { key: 'networks', label: t('admin.currencies.networks'), render: (c: any) => (c.networks ?? []).join(', ') || '—' },
        {
          key: 'rate',
          label: t('admin.currencies.usdRate'),
          sortValue: (c: any) => Number(c.usdRate),
          render: (c: any) => (
            <input
              className="input w-24 !py-1"
              defaultValue={c.usdRate}
              onBlur={(e) => e.target.value !== String(c.usdRate) && save(c, { usdRate: e.target.value })}
            />
          ),
        },
        { key: 'sort', label: t('admin.currencies.sort'), sortValue: (c: any) => c.sortOrder ?? 0, render: (c: any) => c.sortOrder ?? 0 },
        {
          key: 'enabled',
          label: t('admin.common.enabled'),
          sortValue: (c: any) => (c.enabled ? 1 : 0),
          render: (c: any) => (
            <button onClick={() => save(c, { enabled: !c.enabled })} className={`chip ${c.enabled ? 'text-mint' : 'text-white/40'}`}>
              {c.enabled ? t('admin.common.on') : t('admin.common.off')}
            </button>
          ),
        },
      ]}
    />
  );
}
