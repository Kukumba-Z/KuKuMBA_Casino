import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/api';
import { Table } from '../shared/Table';
import { useAct } from '../shared/useAct';

export function ContentTab() {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ['adm-content'], queryFn: async () => (await api.get('/admin/content')).data });
  const [form, setForm] = useState({ key: '', locale: 'ru', title: '', body: '' });
  const act = useAct('adm-content');
  const save = () => act(() => api.post('/admin/content', form), t('admin.common.saved'));
  return (
    <div className="space-y-3">
      <div className="card space-y-2 p-4">
        <div className="flex flex-wrap gap-2">
          <input className="input w-40" placeholder={t('admin.content.keyPh')} value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} />
          <select className="input w-24" value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })}>
            <option>ru</option>
            <option>en</option>
          </select>
          <input className="input flex-1" placeholder={t('admin.content.titlePh')} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <textarea className="input min-h-32" placeholder={t('admin.content.bodyPh')} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        <button onClick={save} className="btn-primary" disabled={!form.key}>{t('admin.common.save')}</button>
      </div>
      <Table
        rows={data ?? []}
        rowKey={(c: any) => `${c.key}:${c.locale}`}
        defaultSort={{ key: 'key', dir: 'asc' }}
        columns={[
          {
            key: 'key',
            label: t('admin.common.key'),
            sortValue: (c: any) => c.key,
            render: (c: any) => (
              <button onClick={() => setForm({ key: c.key, locale: c.locale, title: c.title, body: c.body })} className="text-lav hover:underline">
                {c.key}
              </button>
            ),
          },
          { key: 'locale', label: t('admin.content.locale'), sortValue: (c: any) => c.locale, render: (c: any) => c.locale },
          { key: 'title', label: t('admin.content.title'), sortValue: (c: any) => c.title, render: (c: any) => c.title },
        ]}
      />
    </div>
  );
}
