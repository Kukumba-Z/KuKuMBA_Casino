import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/api';
import { fmt } from '../../../lib/hooks';
import { Field } from '../shared/Field';
import { Table } from '../shared/Table';
import { useAct } from '../shared/useAct';

const LEVEL_BLANK = {
  level: '', name: '', icon: '', color: '', depositRequiredUsd: '0', wagerRequiredUsd: '0',
  cashbackPercent: '0', rakebackPercent: '0', perksRu: '', perksEn: '',
};

export function VipTab() {
  const { t } = useTranslation();
  const { data: levels } = useQuery({ queryKey: ['adm-vip'], queryFn: async () => (await api.get('/admin/vip-levels')).data });
  const { data: settings } = useQuery({ queryKey: ['adm-set'], queryFn: async () => (await api.get('/admin/settings')).data });
  const [form, setForm] = useState<any>(LEVEL_BLANK);
  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));
  const act = useAct('adm-vip', 'vip-levels', 'adm-set');

  const save = async () => {
    const ok = await act(() =>
      api.post('/admin/vip-levels', {
        level: Number(form.level),
        name: form.name,
        icon: form.icon || undefined,
        color: form.color || undefined,
        depositRequiredUsd: String(form.depositRequiredUsd || '0'),
        wagerRequiredUsd: String(form.wagerRequiredUsd || '0'),
        cashbackPercent: Number(form.cashbackPercent) || 0,
        rakebackPercent: Number(form.rakebackPercent) || 0,
        perksRu: form.perksRu || undefined,
        perksEn: form.perksEn || undefined,
      }), t('admin.common.saved'));
    if (ok) setForm(LEVEL_BLANK);
  };
  const edit = (l: any) =>
    setForm({
      level: String(l.level), name: l.name, icon: l.icon ?? '', color: l.color ?? '',
      depositRequiredUsd: fmt(l.depositRequiredUsd), wagerRequiredUsd: fmt(l.wagerRequiredUsd),
      cashbackPercent: String(l.cashbackPercent ?? 0), rakebackPercent: String(l.rakebackPercent ?? 0),
      perksRu: l.perksRu ?? '', perksEn: l.perksEn ?? '',
    });
  const del = async (level: number) => {
    if (!confirm(t('admin.vip.deleteConfirm', { level }))) return;
    await act(() => api.delete(`/admin/vip-levels/${level}`), t('admin.common.deleted'));
  };

  const periodDays = settings?.find?.((s: any) => s.key === 'cashback.periodDays')?.value ?? 7;
  const savePeriod = (raw: string) => {
    const v = Math.max(1, Math.floor(Number(raw) || 7));
    return act(() => api.post('/admin/settings', { key: 'cashback.periodDays', value: v }), t('admin.common.saved'));
  };

  return (
    <div className="space-y-3">
      {/* Cashback settings: the accrual window lives in AppSettings; per-level
          percentages are edited right in the ladder below; wagering terms come
          from the 'cashback' bonus row on the Bonuses tab. */}
      <div className="card flex flex-wrap items-end gap-4 p-4">
        <div>
          <label className="label">{t('admin.vip.cashbackPeriod')}</label>
          <input
            key={String(periodDays)}
            className="input w-32"
            type="number"
            min="1"
            step="1"
            defaultValue={Number(periodDays)}
            onBlur={(e) => Number(e.target.value) !== Number(periodDays) && savePeriod(e.target.value)}
          />
          <p className="mt-1 text-xs text-white/40">{t('admin.vip.cashbackPeriodHint')}</p>
        </div>
        <p className="max-w-md text-xs text-white/40">{t('admin.vip.cashbackNote')}</p>
      </div>

      <div className="card space-y-3 p-4">
        <div className="text-sm font-semibold text-white/70">{t('admin.vip.formTitle')}</div>
        <div className="flex flex-wrap gap-3">
          <Field label={t('admin.vip.level')}><input className="input w-20" type="number" min={0} value={form.level} onChange={(e) => set({ level: e.target.value })} /></Field>
          <Field label={t('admin.common.name')}><input className="input w-44" value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label={t('admin.vip.icon')} hint={t('admin.vip.iconHint')}><input className="input w-32" value={form.icon} onChange={(e) => set({ icon: e.target.value })} /></Field>
          <Field label={t('admin.vip.color')}>
            <div className="flex items-center gap-1.5">
              <input type="color" className="h-9 w-10 cursor-pointer rounded-lg border border-white/10 bg-transparent" value={/^#[0-9a-f]{6}$/i.test(form.color) ? form.color : '#a78bfa'} onChange={(e) => set({ color: e.target.value })} />
              <input className="input w-28" placeholder="#a78bfa" value={form.color} onChange={(e) => set({ color: e.target.value })} />
            </div>
          </Field>
          <Field label={t('admin.vip.depositReq')}><input className="input w-32" value={form.depositRequiredUsd} onChange={(e) => set({ depositRequiredUsd: e.target.value })} /></Field>
          <Field label={t('admin.vip.wagerReq')}><input className="input w-32" value={form.wagerRequiredUsd} onChange={(e) => set({ wagerRequiredUsd: e.target.value })} /></Field>
          <Field label={t('admin.vip.cashbackPct')}><input className="input w-24" value={form.cashbackPercent} onChange={(e) => set({ cashbackPercent: e.target.value })} /></Field>
          <Field label={t('admin.vip.rakebackPct')}><input className="input w-24" value={form.rakebackPercent} onChange={(e) => set({ rakebackPercent: e.target.value })} /></Field>
        </div>
        <div className="flex flex-wrap gap-3">
          <Field label={t('admin.vip.perksRu')}><input className="input w-72" value={form.perksRu} onChange={(e) => set({ perksRu: e.target.value })} /></Field>
          <Field label={t('admin.vip.perksEn')}><input className="input w-72" value={form.perksEn} onChange={(e) => set({ perksEn: e.target.value })} /></Field>
        </div>
        <div className="flex gap-2">
          <button onClick={save} className="btn-primary" disabled={form.level === '' || !form.name}>{t('admin.common.save')}</button>
          {form.level !== '' && <button onClick={() => setForm(LEVEL_BLANK)} className="btn-ghost text-sm">{t('admin.common.clear')}</button>}
        </div>
      </div>

      <Table
        rows={levels ?? []}
        rowKey={(l: any) => String(l.level)}
        defaultSort={{ key: 'level', dir: 'asc' }}
        columns={[
          { key: 'level', label: t('admin.vip.level'), sortValue: (l: any) => l.level, render: (l: any) => <span className="font-bold">{l.level}</span> },
          {
            key: 'name',
            label: t('admin.common.name'),
            sortValue: (l: any) => l.name,
            render: (l: any) => (
              <button onClick={() => edit(l)} className="inline-flex items-center gap-2 text-lav hover:underline">
                {l.color && <span className="inline-block h-3 w-3 rounded-full border border-white/20" style={{ background: l.color }} />}
                {l.name}
              </button>
            ),
          },
          { key: 'deposit', label: t('admin.vip.depositReq'), sortValue: (l: any) => Number(l.depositRequiredUsd), render: (l: any) => `$${fmt(l.depositRequiredUsd)}` },
          { key: 'wager', label: t('admin.vip.wagerReq'), sortValue: (l: any) => Number(l.wagerRequiredUsd), render: (l: any) => `$${fmt(l.wagerRequiredUsd)}` },
          { key: 'cashback', label: t('admin.vip.cashbackPct'), sortValue: (l: any) => l.cashbackPercent, render: (l: any) => `${l.cashbackPercent}%` },
          { key: 'rakeback', label: t('admin.vip.rakebackPct'), sortValue: (l: any) => l.rakebackPercent, render: (l: any) => `${l.rakebackPercent}%` },
          { key: 'perks', label: t('admin.vip.perks'), render: (l: any) => <span className="text-xs text-white/50">{l.perksRu || l.perksEn || '—'}</span> },
          {
            key: 'act',
            label: '',
            render: (l: any) =>
              l.level === 0 ? (
                <span className="text-white/25 text-xs" title={t('admin.vip.baseProtected')}>—</span>
              ) : (
                <button onClick={() => del(l.level)} className="text-xs text-roul-red hover:underline">{t('admin.common.delete')}</button>
              ),
          },
        ]}
      />
    </div>
  );
}
