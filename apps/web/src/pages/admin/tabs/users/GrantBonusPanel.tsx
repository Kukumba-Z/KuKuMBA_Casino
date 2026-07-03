import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../../lib/api';
import { CurrencySelect } from '../../shared/CurrencySelect';

/** Grant a one-off personal bonus to this user (routes through the wagering engine). */
export function GrantBonusPanel({ id, act }: { id: string; act: (fn: () => Promise<any>, ok?: string) => Promise<any> }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: 'Personal bonus', amount: '10', currency: 'USD', wagerMultiplier: '0', wagerPeriodHours: '', sticky: true, maxCashoutMultiplier: '', maxCashout: '' });
  const set = (patch: any) => setF((s) => ({ ...s, ...patch }));
  const grant = () =>
    act(() => api.post(`/admin/users/${id}/grant-bonus`, {
      name: f.name, amount: f.amount, currency: f.currency,
      wagerMultiplier: Number(f.wagerMultiplier) || 0, sticky: f.sticky,
      wagerPeriodHours: f.wagerPeriodHours ? Number(f.wagerPeriodHours) : null,
      maxCashoutMultiplier: f.maxCashoutMultiplier ? Number(f.maxCashoutMultiplier) : null,
      maxCashout: f.maxCashout || null,
    }), t('admin.users.bonusGranted'));
  return (
    <div className="space-y-2 rounded-xl bg-black/30 p-3">
      <button onClick={() => setOpen((o) => !o)} className="text-xs font-semibold uppercase tracking-wide text-white/50 hover:text-white">
        {open ? '▾' : '▸'} {t('admin.users.personalBonus')}
      </button>
      {open && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <input className="input flex-1 !py-1.5" placeholder={t('admin.common.name')} value={f.name} onChange={(e) => set({ name: e.target.value })} />
            <input className="input w-24 !py-1.5" placeholder={t('admin.common.amount')} value={f.amount} onChange={(e) => set({ amount: e.target.value })} />
            <CurrencySelect className="input w-36 !py-1.5" value={f.currency} onChange={(code) => set({ currency: code })} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input className="input w-20 !py-1.5" title={t('admin.wager.multiplier')} placeholder="wager×" value={f.wagerMultiplier} onChange={(e) => set({ wagerMultiplier: e.target.value })} />
            <input className="input w-24 !py-1.5" title={t('admin.wager.periodH')} placeholder={t('admin.wager.periodPh')} value={f.wagerPeriodHours} onChange={(e) => set({ wagerPeriodHours: e.target.value })} />
            <input className="input w-24 !py-1.5" title={t('admin.wager.maxCashoutX')} placeholder="cashout×" value={f.maxCashoutMultiplier} onChange={(e) => set({ maxCashoutMultiplier: e.target.value })} />
            <input className="input w-28 !py-1.5" title={t('admin.wager.maxCashout')} placeholder={t('admin.wager.maxCashoutPh')} value={f.maxCashout} onChange={(e) => set({ maxCashout: e.target.value })} />
            <label className="flex items-center gap-1.5 text-sm text-white/70">
              <input type="checkbox" checked={f.sticky} onChange={(e) => set({ sticky: e.target.checked })} /> {t('admin.wager.stickyShort')}
            </label>
            <button onClick={grant} className="btn-soft ml-auto text-sm">{t('admin.users.grant')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
