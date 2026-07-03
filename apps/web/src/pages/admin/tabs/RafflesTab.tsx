import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusChip } from '../../../components/StatusChip';
import api from '../../../lib/api';
import { fmt } from '../../../lib/hooks';
import { enumLabel } from '../../../lib/labels';
import { CurrencySelect } from '../shared/CurrencySelect';
import { L } from '../shared/Field';
import { DEPOSIT_WINDOWS, toLocalInput } from '../shared/format';
import { Table } from '../shared/Table';
import { useAct } from '../shared/useAct';

const RAFFLE_BLANK = {
  title: 'New Giveaway',
  descriptionRu: '',
  descriptionEn: '',
  currency: 'USD',
  mode: 'REAL',
  prizePool: '500',
  winnersCount: 3,
  entryCost: '0',
  maxEntriesPerUser: 1,
  drawAt: '',
  closesAt: '',
  requiresDeposit: false,
  minDeposit: '',
  depositWithinDays: '',
  minVipLevel: '',
  audience: 'ALL',
  partnerId: '',
};

export function RafflesTab() {
  const { t } = useTranslation();
  // Staff management goes through /admin/raffles (raffles.manage + audit);
  // the public ['raffles'] cache is invalidated too so the player list refreshes.
  const { data } = useQuery({ queryKey: ['adm-raffles'], queryFn: async () => (await api.get('/admin/raffles')).data });
  const [form, setForm] = useState<any>(RAFFLE_BLANK);
  const [editId, setEditId] = useState<string | null>(null);
  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));
  const act = useAct('adm-raffles', 'raffles');

  const payload = () => ({
    title: form.title,
    descriptionRu: form.descriptionRu || undefined,
    descriptionEn: form.descriptionEn || undefined,
    currency: form.currency,
    mode: 'REAL',
    prizePool: String(form.prizePool),
    winnersCount: Number(form.winnersCount) || 1,
    entryCost: String(form.entryCost || '0'),
    maxEntriesPerUser: Number(form.maxEntriesPerUser) || 1,
    drawAt: form.drawAt ? new Date(form.drawAt).toISOString() : editId ? null : undefined,
    closesAt: form.closesAt ? new Date(form.closesAt).toISOString() : editId ? null : undefined,
    requiresDeposit: !!form.requiresDeposit,
    minDeposit: form.requiresDeposit && form.minDeposit ? String(form.minDeposit) : null,
    depositWithinDays: form.requiresDeposit && form.depositWithinDays ? Number(form.depositWithinDays) : null,
    minVipLevel: form.minVipLevel !== '' ? Number(form.minVipLevel) : null,
    audience: form.audience,
    partnerId: form.audience === 'PARTNER_REFERRALS' ? form.partnerId || undefined : null,
  });

  const reset = () => {
    setEditId(null);
    setForm(RAFFLE_BLANK);
  };
  const submit = async () => {
    const ok = editId
      ? await act(() => api.patch(`/admin/raffles/${editId}`, payload()), t('admin.raffles.updated'))
      : await act(() => api.post('/admin/raffles', payload()), t('admin.raffles.created'));
    if (ok) reset();
  };
  const edit = (r: any) => {
    setEditId(r.id);
    setForm({
      title: r.title,
      descriptionRu: r.descriptionRu ?? '',
      descriptionEn: r.descriptionEn ?? '',
      currency: r.currency,
      mode: r.mode,
      prizePool: r.prizePool,
      winnersCount: r.winnersCount,
      entryCost: r.entryCost,
      maxEntriesPerUser: r.maxEntriesPerUser,
      drawAt: toLocalInput(r.drawAt),
      closesAt: toLocalInput(r.closesAt),
      requiresDeposit: !!r.requiresDeposit,
      minDeposit: r.minDeposit ?? '',
      depositWithinDays: r.depositWithinDays ?? '',
      minVipLevel: r.minVipLevel ?? '',
      audience: r.audience ?? 'ALL',
      partnerId: r.partnerId ?? '',
    });
  };
  const draw = (id: string) => act(() => api.post(`/admin/raffles/${id}/draw`, {}), t('admin.raffles.drawn'));
  const cancel = async (id: string) => {
    if (!confirm(t('admin.raffles.cancelConfirm'))) return;
    const ok = await act(() => api.post(`/admin/raffles/${id}/cancel`), t('admin.raffles.cancelled'));
    if (ok && editId === id) reset();
  };

  return (
    <div className="space-y-3">
      <div className="card space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">{editId ? t('admin.raffles.editTitle') : t('admin.raffles.newTitle')}</h3>
          {editId && <button onClick={reset} className="chip text-xs text-white/60">{t('admin.common.newInstead')}</button>}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <L label={t('admin.raffles.title')}><input className="input" value={form.title} onChange={(e) => set({ title: e.target.value })} /></L>
          <L label={t('admin.raffles.currencyFiat')}>
            <CurrencySelect className="input" value={form.currency} onChange={(code) => set({ currency: code })} types={['FIAT']} />
          </L>
          <L label={t('admin.raffles.prizePool')}><input className="input" value={form.prizePool} onChange={(e) => set({ prizePool: e.target.value })} /></L>
          <L label={t('admin.raffles.winners')}><input className="input" type="number" min={1} value={form.winnersCount} onChange={(e) => set({ winnersCount: +e.target.value })} /></L>
          <L label={t('admin.raffles.entryCost')}><input className="input" value={form.entryCost} onChange={(e) => set({ entryCost: e.target.value })} /></L>
          <L label={t('admin.raffles.maxEntries')}><input className="input" type="number" min={1} value={form.maxEntriesPerUser} onChange={(e) => set({ maxEntriesPerUser: +e.target.value })} /></L>
          <L label={t('admin.raffles.drawAt')}><input className="input" type="datetime-local" value={form.drawAt} onChange={(e) => set({ drawAt: e.target.value })} /></L>
          <L label={t('admin.raffles.closesAt')}><input className="input" type="datetime-local" value={form.closesAt} onChange={(e) => set({ closesAt: e.target.value })} /></L>
          <L label={t('admin.raffles.audience')}>
            <select className="input" value={form.audience} onChange={(e) => set({ audience: e.target.value })}>
              <option value="ALL">{enumLabel('raffleAudience', 'ALL')}</option>
              <option value="PARTNER_REFERRALS">{enumLabel('raffleAudience', 'PARTNER_REFERRALS')}</option>
            </select>
          </L>
          {form.audience === 'PARTNER_REFERRALS' && (
            <L label={t('admin.raffles.partnerId')}><input className="input" value={form.partnerId} onChange={(e) => set({ partnerId: e.target.value })} placeholder="user id" /></L>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <L label={t('admin.common.descriptionRu')}><input className="input" value={form.descriptionRu} onChange={(e) => set({ descriptionRu: e.target.value })} /></L>
          <L label={t('admin.common.descriptionEn')}><input className="input" value={form.descriptionEn} onChange={(e) => set({ descriptionEn: e.target.value })} /></L>
          <L label={t('admin.raffles.minVip')}>
            <input className="input" type="number" min={0} value={form.minVipLevel} onChange={(e) => set({ minVipLevel: e.target.value })} placeholder={t('admin.raffles.minVipPh')} />
          </L>
          <L label={t('admin.depositGate.required')}>
            <label className="flex h-9 items-center gap-2 text-sm">
              <input type="checkbox" checked={form.requiresDeposit} onChange={(e) => set({ requiresDeposit: e.target.checked })} />
              <span className="text-white/60">{t('admin.raffles.enableConditions')}</span>
            </label>
          </L>
          {form.requiresDeposit && (
            <>
              <L label={t('admin.depositGate.minUsd')}><input className="input" value={form.minDeposit} onChange={(e) => set({ minDeposit: e.target.value })} /></L>
              <L label={t('admin.depositGate.within')}>
                <select className="input" value={form.depositWithinDays} onChange={(e) => set({ depositWithinDays: e.target.value })}>
                  <option value="">{t('admin.depositGate.allTime')}</option>
                  {DEPOSIT_WINDOWS.map((d) => <option key={d} value={d}>{t('admin.depositGate.days', { count: d })}</option>)}
                </select>
              </L>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={submit} className="btn-primary" disabled={!form.currency}>
            {editId ? t('admin.common.save') : t('admin.common.create')}
          </button>
          {editId && <button onClick={() => cancel(editId)} className="btn-soft text-rose-300">{t('admin.raffles.cancel')}</button>}
        </div>
      </div>
      <Table
        rows={data ?? []}
        defaultSort={{ key: 'status', dir: 'asc' }}
        columns={[
          { key: 'title', label: t('admin.raffles.title'), sortValue: (r: any) => r.title, render: (r: any) => r.title },
          { key: 'prize', label: t('admin.raffles.prizeCol'), sortValue: (r: any) => Number(r.prizePool), render: (r: any) => `${fmt(r.prizePool)} ${r.currency}` },
          { key: 'audience', label: t('admin.raffles.audience'), sortValue: (r: any) => r.audience, render: (r: any) => enumLabel('raffleAudience', r.audience) },
          { key: 'participants', label: t('admin.raffles.participants'), sortValue: (r: any) => r.participants ?? 0, render: (r: any) => r.participants },
          { key: 'status', label: t('admin.common.status'), sortValue: (r: any) => r.status, render: (r: any) => <StatusChip category="raffleStatus" value={r.status} /> },
          {
            key: 'act',
            label: '',
            render: (r: any) => (
              <div className="flex gap-1.5">
                {(r.status === 'OPEN' || r.status === 'DRAFT') && <button onClick={() => edit(r)} className="btn-soft text-xs">{t('admin.common.edit')}</button>}
                {r.status === 'OPEN' && <button onClick={() => draw(r.id)} className="btn-soft text-xs">{t('admin.raffles.draw')}</button>}
                {r.status !== 'COMPLETED' && r.status !== 'CANCELLED' && (
                  <button onClick={() => cancel(r.id)} className="btn-soft text-xs text-rose-300">{t('common.cancel')}</button>
                )}
                {(r.status === 'COMPLETED' || r.status === 'CANCELLED') && <span className="text-white/30">—</span>}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
