import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api, { apiError } from '../../../lib/api';
import { toast } from '../../../store/toast';
import { Table } from '../shared/Table';

export function SettingsTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['adm-set'], queryFn: async () => (await api.get('/admin/settings')).data });
  // The roulette's live RTP is the game row's column — the engine, payouts and
  // the in-game info/fairness panel all read it. Edit it here (not the AppSetting,
  // which the per-game column shadows).
  const { data: roul } = useQuery({ queryKey: ['adm-roulette'], queryFn: async () => (await api.get('/games/roulette')).data });
  const [key, setKey] = useState('game.rtp');
  const [value, setValue] = useState('0.973');
  const save = async (k = key, raw = value) => {
    let v: any = raw;
    try { v = JSON.parse(raw); } catch { /* keep string */ }
    try {
      await api.post('/admin/settings', { key: k, value: v });
      qc.invalidateQueries({ queryKey: ['adm-set'] });
      toast.success(`${k} · ${t('admin.common.saved')}`);
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const saveRtp = async (raw: string) => {
    try {
      const { data: g } = await api.patch('/admin/games/roulette', { rtp: Number(raw) });
      qc.invalidateQueries({ queryKey: ['adm-roulette'] });
      qc.invalidateQueries({ queryKey: ['roulette-info'] });
      qc.invalidateQueries({ queryKey: ['games'] });
      toast.success(`${t('admin.settings.rouletteRtp')} → ${(g.rtp * 100).toFixed(2)}%`);
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const setting = (k: string) => data?.find?.((s: any) => s.key === k)?.value;
  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">{t('admin.settings.rouletteRtp')}</label>
          <input
            key={roul?.rtp}
            className="input w-40"
            type="number"
            step="0.001"
            min="0.5"
            max="1"
            defaultValue={roul?.rtp ?? 0.973}
            onBlur={(e) => saveRtp(e.target.value)}
          />
          <p className="mt-1 text-xs text-white/40">{t('admin.settings.rtpHint')}</p>
        </div>
        <div>
          <label className="label">{t('admin.settings.promoLimit')}</label>
          <input
            key={setting('promo.monthlyLimitPerUser') ?? 'promo-lim'}
            className="input w-40"
            type="number"
            step="1"
            min="0"
            defaultValue={Number(setting('promo.monthlyLimitPerUser') ?? 5)}
            onBlur={(e) => save('promo.monthlyLimitPerUser', String(Math.max(0, Math.floor(Number(e.target.value) || 0))))}
          />
          <p className="mt-1 text-xs text-white/40">{t('admin.settings.promoLimitHint')}</p>
        </div>
        <p className="text-xs text-white/40">{t('admin.settings.jsonHint')}</p>
      </div>
      <div className="card flex flex-wrap items-end gap-2 p-4">
        <input className="input w-56" value={key} onChange={(e) => setKey(e.target.value)} />
        <input className="input w-40" value={value} onChange={(e) => setValue(e.target.value)} />
        <button onClick={() => save()} className="btn-primary">{t('admin.common.save')}</button>
      </div>
      <Table
        rows={data ?? []}
        rowKey={(s: any) => s.key}
        defaultSort={{ key: 'key', dir: 'asc' }}
        columns={[
          { key: 'key', label: t('admin.common.key'), sortValue: (s: any) => s.key, render: (s: any) => <span className="font-mono text-xs">{s.key}</span> },
          { key: 'value', label: t('admin.common.value'), render: (s: any) => JSON.stringify(s.value) },
        ]}
      />
    </div>
  );
}
