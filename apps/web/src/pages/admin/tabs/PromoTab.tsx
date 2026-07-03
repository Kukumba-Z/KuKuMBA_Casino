import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/api';
import { fmt } from '../../../lib/hooks';
import { enumLabel } from '../../../lib/labels';
import { CurrencySelect } from '../shared/CurrencySelect';
import { Field } from '../shared/Field';
import { DEPOSIT_WINDOWS } from '../shared/format';
import { Table } from '../shared/Table';
import { useAct } from '../shared/useAct';

const PROMO_BLANK = {
  code: '', type: 'BALANCE', currency: 'USD', amount: '0', bonusKey: '',
  perUserLimit: '1', maxRedemptions: '', wagerMultiplier: '', wagerPeriodHours: '', sticky: true,
  maxCashoutMultiplier: '', maxCashout: '', requiresDeposit: false, minDeposit: '', depositWithinDays: '',
};

export function PromoTab() {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ['adm-promo'], queryFn: async () => (await api.get('/admin/promocodes')).data });
  const [form, setForm] = useState<any>(PROMO_BLANK);
  const [editId, setEditId] = useState<string | null>(null);
  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));
  const isBonus = form.type === 'BONUS' || form.type === 'FREEBET';
  const act = useAct('adm-promo');

  const payload = () => ({
    ...form,
    perUserLimit: Number(form.perUserLimit) || 1,
    maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
    wagerMultiplier: form.wagerMultiplier ? Number(form.wagerMultiplier) : 0,
    wagerPeriodHours: form.wagerPeriodHours ? Number(form.wagerPeriodHours) : null,
    maxCashoutMultiplier: form.maxCashoutMultiplier ? Number(form.maxCashoutMultiplier) : null,
    maxCashout: form.maxCashout || null,
    minDeposit: form.minDeposit || null,
    depositWithinDays: form.depositWithinDays ? Number(form.depositWithinDays) : null,
    bonusKey: form.bonusKey || undefined,
  });

  const reset = () => {
    setForm(PROMO_BLANK);
    setEditId(null);
  };
  const submit = async () => {
    const ok = editId
      ? await act(() => api.patch(`/admin/promocodes/${editId}`, payload()), t('admin.promo.updated'))
      : await act(() => api.post('/admin/promocodes', payload()), t('admin.promo.created'));
    if (ok) reset();
  };
  const edit = (p: any) => {
    setEditId(p.id);
    setForm({
      code: p.code, type: p.type, currency: p.currency ?? 'USD', amount: fmt(p.amount), bonusKey: p.bonusKey ?? '',
      perUserLimit: String(p.perUserLimit ?? 1), maxRedemptions: p.maxRedemptions ?? '',
      wagerMultiplier: p.wagerMultiplier ? String(p.wagerMultiplier) : '', wagerPeriodHours: p.wagerPeriodHours ?? '',
      sticky: p.sticky ?? true, maxCashoutMultiplier: p.maxCashoutMultiplier ?? '', maxCashout: p.maxCashout ? fmt(p.maxCashout) : '',
      requiresDeposit: !!p.requiresDeposit, minDeposit: p.minDeposit ? fmt(p.minDeposit) : '', depositWithinDays: p.depositWithinDays ?? '',
    });
  };
  const toggle = (p: any) => act(() => api.patch(`/admin/promocodes/${p.id}`, { enabled: !p.enabled }), t('admin.common.saved'));
  const del = async (p: any) => {
    if (!confirm(t('admin.promo.deleteConfirm', { code: p.code }))) return;
    await act(() => api.delete(`/admin/promocodes/${p.id}`), t('admin.promo.deleted'));
  };

  return (
    <div className="space-y-3">
      <div className="card space-y-4 p-4">
        <div className="flex items-center justify-between">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white/40">
            {editId ? t('admin.promo.editTitle', { code: form.code }) : t('admin.promo.basics')}
          </div>
          {editId && <button onClick={reset} className="chip text-xs text-white/60">{t('admin.common.newInstead')}</button>}
        </div>
        <div className="flex flex-wrap gap-3">
          <Field label={t('admin.promo.code')}>
            <input className="input w-40" value={form.code} onChange={(e) => set({ code: e.target.value })} disabled={!!editId} />
          </Field>
          <Field label={t('admin.common.type')}>
            <select className="input w-40" value={form.type} onChange={(e) => set({ type: e.target.value })} disabled={!!editId}>
              {['BALANCE', 'BONUS', 'FREEBET'].map((tp) => (
                <option key={tp} value={tp}>{enumLabel('promoType', tp)}</option>
              ))}
            </select>
          </Field>
          <Field label={t('admin.common.currency')}>
            <CurrencySelect className="input w-40" value={form.currency} onChange={(code) => set({ currency: code })} />
          </Field>
          <Field label={t('admin.common.amount')}><input className="input w-28" value={form.amount} onChange={(e) => set({ amount: e.target.value })} /></Field>
          {isBonus && (
            <Field label={t('admin.promo.bonusKey')} hint={t('admin.promo.bonusKeyHint')}>
              <input className="input w-36" value={form.bonusKey} onChange={(e) => set({ bonusKey: e.target.value })} />
            </Field>
          )}
        </div>
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white/40">{t('admin.promo.limits')}</div>
          <div className="flex flex-wrap gap-3">
            <Field label={t('admin.promo.perUser')}><input className="input w-24" value={form.perUserLimit} onChange={(e) => set({ perUserLimit: e.target.value })} /></Field>
            <Field label={t('admin.promo.total')}><input className="input w-28" value={form.maxRedemptions} onChange={(e) => set({ maxRedemptions: e.target.value })} /></Field>
          </div>
        </div>
        {isBonus && (
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
        )}
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white/40">{t('admin.depositGate.section')}</div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-1.5 pb-2 text-sm text-white/70">
              <input type="checkbox" checked={form.requiresDeposit} onChange={(e) => set({ requiresDeposit: e.target.checked })} /> {t('admin.depositGate.required')}
            </label>
            {form.requiresDeposit && (
              <>
                <Field label={t('admin.depositGate.minUsd')}><input className="input w-32" value={form.minDeposit} onChange={(e) => set({ minDeposit: e.target.value })} /></Field>
                <Field label={t('admin.depositGate.within')} hint={t('admin.depositGate.withinHint')}>
                  <select className="input w-32" value={form.depositWithinDays} onChange={(e) => set({ depositWithinDays: e.target.value })}>
                    <option value="">{t('admin.depositGate.allTime')}</option>
                    {DEPOSIT_WINDOWS.map((d) => <option key={d} value={d}>{t('admin.depositGate.days', { count: d })}</option>)}
                  </select>
                </Field>
              </>
            )}
          </div>
        </div>
        <button onClick={submit} className="btn-primary">{editId ? t('admin.common.save') : t('admin.promo.create')}</button>
      </div>
      <Table
        rows={data ?? []}
        defaultSort={{ key: 'code', dir: 'asc' }}
        columns={[
          { key: 'code', label: t('admin.promo.codeCol'), sortValue: (p: any) => p.code, render: (p: any) => <span className="font-semibold">{p.code}</span> },
          { key: 'type', label: t('admin.common.type'), sortValue: (p: any) => p.type, render: (p: any) => enumLabel('promoType', p.type) },
          { key: 'amount', label: t('admin.common.amount'), sortValue: (p: any) => Number(p.amount), render: (p: any) => `${fmt(p.amount)} ${p.currency ?? ''}` },
          { key: 'wager', label: t('admin.wager.multiplier'), sortValue: (p: any) => p.wagerMultiplier ?? 0, render: (p: any) => (p.wagerMultiplier ? `×${p.wagerMultiplier}` : '—') },
          { key: 'perUser', label: t('admin.promo.perUser'), sortValue: (p: any) => p.perUserLimit ?? 0, render: (p: any) => p.perUserLimit },
          {
            key: 'dep',
            label: t('admin.depositGate.short'),
            render: (p: any) => (p.requiresDeposit ? (p.depositWithinDays ? `✓ ${t('admin.depositGate.days', { count: p.depositWithinDays })}` : '✓') : '—'),
          },
          { key: 'used', label: t('admin.promo.used'), sortValue: (p: any) => p.redeemedCount ?? 0, render: (p: any) => p.redeemedCount },
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
                <button onClick={() => edit(p)} className="text-xs text-lav hover:underline">{t('admin.common.edit')}</button>
                {p.redeemedCount > 0 ? (
                  <span className="text-xs text-white/25" title={t('admin.promo.deleteUsedHint')}>{t('admin.common.delete')}</span>
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
