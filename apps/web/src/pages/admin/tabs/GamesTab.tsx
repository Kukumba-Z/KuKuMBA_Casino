import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusChip } from '../../../components/StatusChip';
import api from '../../../lib/api';
import { enumLabel } from '../../../lib/labels';
import { Field } from '../shared/Field';
import { Table } from '../shared/Table';
import { useAct } from '../shared/useAct';

const GAME_CATEGORIES = ['ROULETTE', 'CARDS', 'SLOTS', 'LIVE', 'MINIGAME'];
const EMPTY_GAME = {
  key: '', name: '', type: 'slots', category: 'SLOTS', provider: '', status: 'COMING_SOON',
  route: '', rtp: '0.96', sortOrder: '10', enabled: true, descriptionRu: '', descriptionEn: '',
  providerRefId: '', externalId: '',
};

export function GamesTab() {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ['adm-games'], queryFn: async () => (await api.get('/admin/games')).data });
  const { data: providers } = useQuery({ queryKey: ['adm-providers'], queryFn: async () => (await api.get('/admin/providers')).data });
  const [form, setForm] = useState<any>(EMPTY_GAME);
  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));
  const act = useAct('adm-games', 'games', 'game-filters');

  const save = async () => {
    const ok = await act(() =>
      api.post('/admin/games', {
        ...form,
        rtp: Number(form.rtp),
        sortOrder: Number(form.sortOrder),
        providerRefId: form.providerRefId || null,
        externalId: form.externalId || null,
      }), t('admin.common.saved'));
    if (ok) setForm(EMPTY_GAME);
  };
  const toggle = (g: any) => act(() => api.patch(`/admin/games/${g.key}`, { enabled: !g.enabled }), t('admin.common.saved'));
  const del = async (key: string) => {
    if (!confirm(t('admin.games.deleteConfirm', { key }))) return;
    await act(() => api.delete(`/admin/games/${key}`), t('admin.common.deleted'));
  };

  return (
    <div className="space-y-3">
      <div className="card space-y-3 p-4">
        <div className="text-sm font-semibold text-white/70">{t('admin.games.formTitle')}</div>
        <div className="flex flex-wrap gap-3">
          <Field label={t('admin.games.key')}><input className="input w-36" value={form.key} onChange={(e) => set({ key: e.target.value })} /></Field>
          <Field label={t('admin.common.name')}><input className="input w-44" value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label={t('admin.games.providerName')} hint={t('admin.games.providerNameHint')}>
            <input className="input w-40" value={form.provider} onChange={(e) => set({ provider: e.target.value })} />
          </Field>
          <Field label={t('admin.games.category')}>
            <select className="input w-36" value={form.category} onChange={(e) => set({ category: e.target.value })}>
              {GAME_CATEGORIES.map((c) => <option key={c} value={c}>{enumLabel('gameCategory', c)}</option>)}
            </select>
          </Field>
          <Field label={t('admin.common.status')}>
            <select className="input w-40" value={form.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="LIVE">{enumLabel('gameStatus', 'LIVE')}</option>
              <option value="COMING_SOON">{enumLabel('gameStatus', 'COMING_SOON')}</option>
            </select>
          </Field>
          <Field label="RTP" hint={t('admin.games.rtpHint')}><input className="input w-24" value={form.rtp} onChange={(e) => set({ rtp: e.target.value })} /></Field>
          <Field label={t('admin.games.sort')}><input className="input w-20" value={form.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })} /></Field>
          <Field label={t('admin.games.route')} hint={t('admin.games.routeHint')}>
            <input className="input w-40" value={form.route} onChange={(e) => set({ route: e.target.value })} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-3">
          <Field label={t('admin.games.aggregator')} hint={t('admin.games.aggregatorHint')}>
            <select className="input w-48" value={form.providerRefId} onChange={(e) => set({ providerRefId: e.target.value })}>
              <option value="">{t('admin.games.internal')}</option>
              {(providers ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.key})</option>)}
            </select>
          </Field>
          {form.providerRefId && (
            <Field label={t('admin.games.externalId')} hint={t('admin.games.externalIdHint')}>
              <input className="input w-48" value={form.externalId} onChange={(e) => set({ externalId: e.target.value })} />
            </Field>
          )}
          <Field label={t('admin.common.descriptionRu')}><input className="input w-64" value={form.descriptionRu} onChange={(e) => set({ descriptionRu: e.target.value })} /></Field>
          <Field label={t('admin.common.descriptionEn')}><input className="input w-64" value={form.descriptionEn} onChange={(e) => set({ descriptionEn: e.target.value })} /></Field>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-white/60">
            <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> {t('admin.common.enabled')}
          </label>
          <button onClick={save} className="btn-primary" disabled={!form.key}>{t('admin.common.save')}</button>
          {form.key && <button onClick={() => setForm(EMPTY_GAME)} className="btn-ghost text-sm">{t('admin.common.clear')}</button>}
        </div>
      </div>

      <Table
        rows={data ?? []}
        rowKey={(g: any) => g.key}
        defaultSort={{ key: 'sort', dir: 'asc' }}
        columns={[
          {
            key: 'name',
            label: t('admin.common.name'),
            sortValue: (g: any) => g.name,
            render: (g: any) => (
              <button
                onClick={() =>
                  setForm({
                    ...EMPTY_GAME,
                    ...g,
                    rtp: String(g.rtp),
                    sortOrder: String(g.sortOrder ?? 0),
                    route: g.route ?? '',
                    descriptionRu: g.descriptionRu ?? '',
                    descriptionEn: g.descriptionEn ?? '',
                    providerRefId: g.providerRefId ?? '',
                    externalId: g.externalId ?? '',
                  })
                }
                className="text-lav hover:underline"
              >
                {g.name}
              </button>
            ),
          },
          { key: 'category', label: t('admin.games.category'), sortValue: (g: any) => g.category, render: (g: any) => enumLabel('gameCategory', g.category) },
          { key: 'provider', label: t('admin.games.providerName'), sortValue: (g: any) => g.provider, render: (g: any) => g.provider },
          { key: 'rtp', label: 'RTP', sortValue: (g: any) => g.rtp, render: (g: any) => `${(g.rtp * 100).toFixed(2)}%` },
          { key: 'sort', label: t('admin.games.sort'), sortValue: (g: any) => g.sortOrder ?? 0, render: (g: any) => g.sortOrder ?? 0 },
          { key: 'status', label: t('admin.common.status'), sortValue: (g: any) => g.status, render: (g: any) => <StatusChip category="gameStatus" value={g.status} /> },
          {
            key: 'enabled',
            label: t('admin.common.enabled'),
            sortValue: (g: any) => (g.enabled ? 1 : 0),
            render: (g: any) => (
              <button onClick={() => toggle(g)} className={`chip ${g.enabled ? 'border-mint/30 bg-mint/10 text-mint' : 'text-white/40'}`}>
                {g.enabled ? t('admin.common.on') : t('admin.common.off')}
              </button>
            ),
          },
          {
            key: 'act',
            label: '',
            render: (g: any) => (
              <button onClick={() => del(g.key)} className="btn-ghost !px-2 !py-1 text-xs text-roul-red"><X size={13} /></button>
            ),
          },
        ]}
      />
    </div>
  );
}
