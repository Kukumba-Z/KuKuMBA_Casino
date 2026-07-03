import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api, { apiError } from '../../../lib/api';
import { enumLabel } from '../../../lib/labels';
import { toast } from '../../../store/toast';
import { Field } from '../shared/Field';
import { when } from '../shared/format';
import { Table } from '../shared/Table';
import { useAct } from '../shared/useAct';

const PROVIDER_BLANK = { key: '', name: '', kind: 'MOCK', baseUrl: '', apiKey: '', webhookSecret: '', enabled: true };
const KINDS = ['MOCK', 'GENERIC_SEAMLESS'];

export function ProvidersTab() {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ['adm-providers'], queryFn: async () => (await api.get('/admin/providers')).data });
  const { data: games } = useQuery({ queryKey: ['adm-games'], queryFn: async () => (await api.get('/admin/games')).data });
  const [form, setForm] = useState<any>(PROVIDER_BLANK);
  const [masked, setMasked] = useState<{ apiKey?: string | null; webhookSecret?: string | null }>({});
  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));
  const act = useAct('adm-providers');

  const save = async () => {
    const ok = await act(() =>
      api.post('/admin/providers', {
        key: form.key,
        name: form.name,
        kind: form.kind,
        baseUrl: form.baseUrl || undefined,
        // Secrets are write-only: blank keeps the stored value.
        apiKey: form.apiKey || undefined,
        webhookSecret: form.webhookSecret || undefined,
        enabled: !!form.enabled,
      }), t('admin.common.saved'));
    if (ok) {
      setForm(PROVIDER_BLANK);
      setMasked({});
    }
  };
  const edit = (p: any) => {
    setForm({ key: p.key, name: p.name, kind: p.kind, baseUrl: p.baseUrl ?? '', apiKey: '', webhookSecret: '', enabled: p.enabled });
    setMasked({ apiKey: p.apiKeyMasked, webhookSecret: p.webhookSecretMasked });
  };
  const toggle = (p: any) =>
    act(() => api.post('/admin/providers', { key: p.key, name: p.name, kind: p.kind, baseUrl: p.baseUrl ?? undefined, enabled: !p.enabled }), t('admin.common.saved'));
  const del = async (p: any) => {
    if (!confirm(t('admin.providers.deleteConfirm', { name: p.name }))) return;
    await act(() => api.delete(`/admin/providers/${p.key}`), t('admin.common.deleted'));
  };
  // Smoke-test the launch loop with the first game mapped to this provider.
  const testLaunch = async (p: any) => {
    const game = (games ?? []).find((g: any) => g.providerRefId === p.id && g.enabled && g.status === 'LIVE');
    if (!game) {
      toast.error(t('admin.providers.noMappedGame'));
      return;
    }
    try {
      const { data: res } = await api.post('/providers/launch', { gameKey: game.key, currency: 'USD', mode: 'REAL' });
      window.prompt(t('admin.providers.launchUrl'), res.url);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="space-y-3">
      <div className="card p-4 text-sm text-white/55">{t('admin.providers.hint')}</div>
      <div className="card space-y-3 p-4">
        <div className="text-sm font-semibold text-white/70">{t('admin.providers.formTitle')}</div>
        <div className="flex flex-wrap gap-3">
          <Field label={t('admin.providers.key')} hint={t('admin.providers.keyHint')}>
            <input className="input w-36" value={form.key} onChange={(e) => set({ key: e.target.value })} placeholder="slotegrator" />
          </Field>
          <Field label={t('admin.common.name')}><input className="input w-48" value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label={t('admin.providers.kind')} hint={t('admin.providers.kindHint')}>
            <select className="input w-44" value={form.kind} onChange={(e) => set({ kind: e.target.value })}>
              {KINDS.map((k) => <option key={k} value={k}>{enumLabel('providerKind', k)}</option>)}
            </select>
          </Field>
          <Field label={t('admin.providers.baseUrl')} hint={t('admin.providers.baseUrlHint')}>
            <input className="input w-72" value={form.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} placeholder="https://launch.aggregator.com/game" />
          </Field>
        </div>
        <div className="flex flex-wrap gap-3">
          <Field label={t('admin.providers.apiKey')} hint={masked.apiKey ? t('admin.providers.secretKeepHint', { masked: masked.apiKey }) : t('admin.providers.secretHint')}>
            <input className="input w-64" type="password" autoComplete="new-password" value={form.apiKey} onChange={(e) => set({ apiKey: e.target.value })} placeholder={masked.apiKey ?? ''} />
          </Field>
          <Field label={t('admin.providers.webhookSecret')} hint={masked.webhookSecret ? t('admin.providers.secretKeepHint', { masked: masked.webhookSecret }) : t('admin.providers.webhookSecretHint')}>
            <input className="input w-64" type="password" autoComplete="new-password" value={form.webhookSecret} onChange={(e) => set({ webhookSecret: e.target.value })} placeholder={masked.webhookSecret ?? ''} />
          </Field>
          <label className="flex items-end gap-1.5 pb-2 text-sm text-white/60">
            <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> {t('admin.common.enabled')}
          </label>
        </div>
        {form.key && (
          <p className="text-xs text-white/40">
            {t('admin.providers.callbackUrl')}: <span className="font-mono">/api/providers/{form.key}/callback/(balance|bet|win|rollback)</span>
          </p>
        )}
        <div className="flex gap-2">
          <button onClick={save} className="btn-primary" disabled={!form.key || !form.name}>{t('admin.common.save')}</button>
          {form.key && <button onClick={() => { setForm(PROVIDER_BLANK); setMasked({}); }} className="btn-ghost text-sm">{t('admin.common.clear')}</button>}
        </div>
      </div>

      <Table
        rows={data ?? []}
        rowKey={(p: any) => p.key}
        defaultSort={{ key: 'name', dir: 'asc' }}
        columns={[
          { key: 'key', label: t('admin.providers.key'), sortValue: (p: any) => p.key, render: (p: any) => <span className="font-mono text-xs">{p.key}</span> },
          {
            key: 'name',
            label: t('admin.common.name'),
            sortValue: (p: any) => p.name,
            render: (p: any) => <button onClick={() => edit(p)} className="text-lav hover:underline">{p.name}</button>,
          },
          { key: 'kind', label: t('admin.providers.kind'), sortValue: (p: any) => p.kind, render: (p: any) => enumLabel('providerKind', p.kind) },
          {
            key: 'secrets',
            label: t('admin.providers.secrets'),
            render: (p: any) => (
              <span className="font-mono text-xs text-white/50">
                {p.apiKeyMasked ?? '—'} / {p.webhookSecretMasked ?? '—'}
              </span>
            ),
          },
          { key: 'games', label: t('admin.providers.games'), sortValue: (p: any) => p.games ?? 0, render: (p: any) => p.games },
          { key: 'tx', label: t('admin.providers.transactions'), sortValue: (p: any) => p.transactions ?? 0, render: (p: any) => p.transactions },
          { key: 'updated', label: t('admin.common.when'), sortValue: (p: any) => +new Date(p.updatedAt), render: (p: any) => when(p.updatedAt) },
          {
            key: 'enabled',
            label: t('admin.common.enabled'),
            sortValue: (p: any) => (p.enabled ? 1 : 0),
            render: (p: any) => (
              <button onClick={() => toggle(p)} className={`chip ${p.enabled ? 'text-mint' : 'text-white/40'}`}>
                {p.enabled ? t('admin.common.on') : t('admin.common.off')}
              </button>
            ),
          },
          {
            key: 'act',
            label: '',
            render: (p: any) => (
              <span className="flex gap-2">
                <button onClick={() => testLaunch(p)} className="text-xs text-lav hover:underline">{t('admin.providers.testLaunch')}</button>
                {p.games > 0 ? (
                  <span className="text-xs text-white/25" title={t('admin.providers.deleteBlockedHint')}>{t('admin.common.delete')}</span>
                ) : (
                  <button onClick={() => del(p)} className="text-xs text-roul-red hover:underline">{t('admin.common.delete')}</button>
                )}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
