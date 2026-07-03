import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/api';
import { fmt } from '../../../lib/hooks';
import { enumLabel } from '../../../lib/labels';
import { CurrencySelect } from '../shared/CurrencySelect';
import { Field } from '../shared/Field';
import { DEPOSIT_WINDOWS, toLocalInput } from '../shared/format';
import { Table } from '../shared/Table';
import { useAct } from '../shared/useAct';

const BONUS_BLANK = {
  key: '', name: '', type: 'NO_DEPOSIT', currency: 'USD', amount: '0', percent: '',
  wagerMultiplier: '0', minDeposit: '', maxAmount: '', requiresDeposit: false, depositWithinDays: '',
  sticky: true, maxCashoutMultiplier: '', maxCashout: '', availableUntil: '', wagerPeriodHours: '',
  descriptionRu: '', descriptionEn: '',
};
const BONUS_TYPES = ['NO_DEPOSIT', 'WELCOME', 'DEPOSIT', 'RELOAD', 'FREEBET', 'CASHBACK'];

export function BonusesTab() {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ['adm-bonuses'], queryFn: async () => (await api.get('/admin/bonuses')).data });
  const [form, setForm] = useState<any>(BONUS_BLANK);
  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));
  const isDeposit = form.type === 'DEPOSIT' || form.type === 'RELOAD';
  const act = useAct('adm-bonuses');

  const edit = (b: any) => setForm({
    key: b.key, name: b.name, type: b.type, currency: b.currency ?? 'USD', amount: fmt(b.amount),
    percent: b.percent ?? '', wagerMultiplier: String(b.wagerMultiplier ?? 0), minDeposit: b.minDeposit ? fmt(b.minDeposit) : '',
    maxAmount: b.maxAmount ? fmt(b.maxAmount) : '', requiresDeposit: !!b.requiresDeposit, depositWithinDays: b.depositWithinDays ?? '',
    sticky: b.sticky ?? true, maxCashoutMultiplier: b.maxCashoutMultiplier ?? '', maxCashout: b.maxCashout ? fmt(b.maxCashout) : '',
    availableUntil: toLocalInput(b.availableUntil), wagerPeriodHours: b.wagerPeriodHours ?? '',
    descriptionRu: b.descriptionRu ?? '', descriptionEn: b.descriptionEn ?? '',
  });
  const save = async () => {
    const ok = await act(() =>
      api.post('/admin/bonuses', {
        ...form,
        percent: form.percent ? Number(form.percent) : null,
        wagerMultiplier: Number(form.wagerMultiplier) || 0,
        minDeposit: form.minDeposit || null,
        maxAmount: form.maxAmount || null,
        depositWithinDays: form.depositWithinDays ? Number(form.depositWithinDays) : null,
        maxCashoutMultiplier: form.maxCashoutMultiplier ? Number(form.maxCashoutMultiplier) : null,
        maxCashout: form.maxCashout || null,
        availableUntil: form.availableUntil ? new Date(form.availableUntil).toISOString() : null,
        wagerPeriodHours: form.wagerPeriodHours ? Number(form.wagerPeriodHours) : null,
      }), t('admin.common.saved'));
    if (ok) setForm(BONUS_BLANK);
  };
  const del = async (key: string) => {
    if (!confirm(t('admin.bonuses.deleteConfirm', { key }))) return;
    await act(() => api.delete(`/admin/bonuses/${key}`), t('admin.common.deleted'));
  };

  return (
    <div className="space-y-3">
      <div className="card space-y-4 p-4">
        <p className="text-xs text-white/45">{t('admin.bonuses.hint')}</p>
        <div className="flex flex-wrap gap-3">
          <Field label={t('admin.bonuses.key')}><input className="input w-36" value={form.key} onChange={(e) => set({ key: e.target.value })} /></Field>
          <Field label={t('admin.common.name')}><input className="input w-44" value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label={t('admin.common.type')}>
            <select className="input w-44" value={form.type} onChange={(e) => set({ type: e.target.value })}>
              {BONUS_TYPES.map((tp) => <option key={tp} value={tp}>{enumLabel('bonusType', tp)}</option>)}
            </select>
          </Field>
          <Field label={t('admin.common.currency')}>
            <CurrencySelect className="input w-40" value={form.currency} onChange={(code) => set({ currency: code })} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-3">
          <Field label={t('admin.bonuses.amountFixed')} hint={isDeposit ? t('admin.bonuses.amountFixedHintDep') : t('admin.bonuses.amountFixedHint')}>
            <input className="input w-28" value={form.amount} onChange={(e) => set({ amount: e.target.value })} />
          </Field>
          {isDeposit && (
            <Field label={t('admin.bonuses.percent')} hint={t('admin.bonuses.percentHint')}>
              <input className="input w-28" value={form.percent} onChange={(e) => set({ percent: e.target.value })} />
            </Field>
          )}
          {isDeposit && <Field label={t('admin.bonuses.maxAmount')}><input className="input w-28" value={form.maxAmount} onChange={(e) => set({ maxAmount: e.target.value })} /></Field>}
          {isDeposit && <Field label={t('admin.bonuses.minDeposit')}><input className="input w-28" value={form.minDeposit} onChange={(e) => set({ minDeposit: e.target.value })} /></Field>}
        </div>
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white/40">{t('admin.wager.section')}</div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('admin.wager.multiplier')} hint={t('admin.wager.multiplierHint')}><input className="input w-20" value={form.wagerMultiplier} onChange={(e) => set({ wagerMultiplier: e.target.value })} /></Field>
            <Field label={t('admin.wager.periodH')} hint={t('admin.wager.periodHint')}><input className="input w-28" value={form.wagerPeriodHours} onChange={(e) => set({ wagerPeriodHours: e.target.value })} /></Field>
            <Field label={t('admin.wager.maxCashoutX')}><input className="input w-24" value={form.maxCashoutMultiplier} onChange={(e) => set({ maxCashoutMultiplier: e.target.value })} /></Field>
            <Field label={t('admin.wager.maxCashout')}><input className="input w-28" value={form.maxCashout} onChange={(e) => set({ maxCashout: e.target.value })} /></Field>
            <label className="flex items-center gap-1.5 pb-2 text-sm text-white/70">
              <input type="checkbox" checked={form.sticky} onChange={(e) => set({ sticky: e.target.checked })} /> {t('admin.wager.sticky')}
            </label>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('admin.bonuses.availableUntil')} hint={t('admin.bonuses.availableUntilHint')}>
            <input type="datetime-local" className="input w-56" value={form.availableUntil} onChange={(e) => set({ availableUntil: e.target.value })} />
          </Field>
        </div>
        {!isDeposit && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-1.5 pb-2 text-sm text-white/70">
              <input type="checkbox" checked={form.requiresDeposit} onChange={(e) => set({ requiresDeposit: e.target.checked })} /> {t('admin.depositGate.required')}
            </label>
            {form.requiresDeposit && (
              <>
                <Field label={t('admin.depositGate.minUsd')}><input className="input w-32" value={form.minDeposit} onChange={(e) => set({ minDeposit: e.target.value })} /></Field>
                <Field label={t('admin.depositGate.within')}>
                  <select className="input w-32" value={form.depositWithinDays} onChange={(e) => set({ depositWithinDays: e.target.value })}>
                    <option value="">{t('admin.depositGate.allTime')}</option>
                    {DEPOSIT_WINDOWS.map((d) => <option key={d} value={d}>{t('admin.depositGate.days', { count: d })}</option>)}
                  </select>
                </Field>
              </>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <Field label={t('admin.common.descriptionRu')}><input className="input w-64" value={form.descriptionRu} onChange={(e) => set({ descriptionRu: e.target.value })} /></Field>
          <Field label={t('admin.common.descriptionEn')}><input className="input w-64" value={form.descriptionEn} onChange={(e) => set({ descriptionEn: e.target.value })} /></Field>
        </div>
        <div className="flex gap-2">
          <button onClick={save} className="btn-primary" disabled={!form.key || !form.name}>{t('admin.bonuses.save')}</button>
          {form.key && <button onClick={() => setForm(BONUS_BLANK)} className="btn-ghost text-sm">{t('admin.common.clear')}</button>}
        </div>
      </div>
      <Table
        rows={data ?? []}
        defaultSort={{ key: 'key', dir: 'asc' }}
        columns={[
          { key: 'key', label: t('admin.bonuses.keyCol'), sortValue: (b: any) => b.key, render: (b: any) => <span className="font-mono text-xs">{b.key}</span> },
          { key: 'name', label: t('admin.common.name'), sortValue: (b: any) => b.name, render: (b: any) => b.name },
          { key: 'type', label: t('admin.common.type'), sortValue: (b: any) => b.type, render: (b: any) => enumLabel('bonusType', b.type) },
          {
            key: 'amount',
            label: t('admin.common.amount'),
            sortValue: (b: any) => Number(b.amount),
            render: (b: any) => `${fmt(b.amount)} ${b.currency ?? ''}${b.percent ? ` / ${b.percent}%` : ''}`,
          },
          {
            key: 'wager',
            label: t('admin.wager.multiplier'),
            sortValue: (b: any) => b.wagerMultiplier ?? 0,
            render: (b: any) =>
              b.wagerMultiplier ? `×${b.wagerMultiplier}${b.wagerPeriodHours ? ` · ${b.wagerPeriodHours}${t('bonuses.hoursShort')}` : ''}${b.sticky ? ' 🔒' : ''}` : '—',
          },
          {
            key: 'until',
            label: t('admin.bonuses.untilCol'),
            sortValue: (b: any) => (b.availableUntil ? +new Date(b.availableUntil) : 0),
            render: (b: any) => (b.availableUntil ? new Date(b.availableUntil).toLocaleDateString() : '—'),
          },
          {
            key: 'enabled',
            label: t('admin.common.enabled'),
            sortValue: (b: any) => (b.enabled ? 1 : 0),
            render: (b: any) => (b.enabled ? t('admin.common.yes') : t('admin.common.no')),
          },
          {
            key: 'act',
            label: '',
            render: (b: any) => (
              <span className="flex gap-2">
                <button onClick={() => edit(b)} className="text-xs text-lav hover:underline">{t('admin.common.edit')}</button>
                <button onClick={() => del(b.key)} className="text-xs text-roul-red hover:underline">{t('admin.common.delete')}</button>
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
