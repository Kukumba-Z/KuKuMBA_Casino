import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api, { apiError } from '../../../lib/api';
import { toast } from '../../../store/toast';
import { Table } from '../shared/Table';

/** Our own in-house games (vs. third-party provider titles) — brand-name match,
 *  same rule the lobby uses. Only these have an engine that reads Game.rtp. */
const isOriginal = (provider?: string) => /kukumba/i.test(provider ?? '');

export function SettingsTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['adm-set'], queryFn: async () => (await api.get('/admin/settings')).data });
  // Per-game RTP lives on each Game row (Game.rtp) — the engine, payouts and the
  // in-game fairness panel all read it. We list every live original here so each
  // gets its own knob (roulette, crash, ponyjack, plinko … and anything new),
  // instead of hard-coding a couple. The global `game.rtp` AppSetting is only a
  // fallback for games without a column value, so it isn't surfaced as a knob.
  const { data: games } = useQuery({ queryKey: ['adm-games'], queryFn: async () => (await api.get('/admin/games')).data });
  const rtpGames = ((games ?? []) as any[])
    .filter((g) => g.status === 'LIVE' && g.route && isOriginal(g.provider))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const save = async (k = key, raw = value) => {
    if (!k) return;
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
  const saveGameRtp = async (gameKey: string, label: string, raw: string) => {
    try {
      const { data: g } = await api.patch(`/admin/games/${gameKey}`, { rtp: Number(raw) });
      qc.invalidateQueries({ queryKey: ['adm-games'] });
      qc.invalidateQueries({ queryKey: ['games'] });
      qc.invalidateQueries({ queryKey: [`${gameKey}-info`] }); // live in-game refresh
      toast.success(`${label} → ${(g.rtp * 100).toFixed(2)}%`);
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const setting = (k: string) => data?.find?.((s: any) => s.key === k)?.value;

  return (
    <div className="space-y-3">
      {/* Per-game RTP — one knob per live original, data-driven from the catalog. */}
      <div className="card space-y-3 p-4">
        <div>
          <div className="text-sm font-semibold text-white/80">{t('admin.settings.gameRtpTitle')}</div>
          <p className="mt-1 max-w-3xl text-xs text-white/40">{t('admin.settings.gameRtpHint')}</p>
        </div>
        <div className="flex flex-wrap gap-4">
          {rtpGames.length === 0 && <p className="text-sm text-white/40">…</p>}
          {rtpGames.map((g) => (
            <div key={g.key}>
              <label className="label">{g.name}</label>
              <input
                key={g.rtp}
                className="input w-40"
                type="number"
                step="0.001"
                min="0.5"
                max="1"
                defaultValue={g.rtp}
                onBlur={(e) => saveGameRtp(g.key, g.name, e.target.value)}
              />
              <p className="mt-1 text-[11px] tabular-nums text-white/35">
                {(g.rtp * 100).toFixed(2)}% · {t('admin.settings.edge')} {((1 - g.rtp) * 100).toFixed(2)}%
              </p>
            </div>
          ))}
        </div>
        <p className="text-xs text-white/40">{t('admin.settings.rtpHint')}</p>
      </div>

      {/* Operational knobs unrelated to RTP. */}
      <div className="card flex flex-wrap items-end gap-3 p-4">
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
      </div>

      {/* Advanced: raw AppSetting editor. Game RTP is set above, not here. */}
      <div className="card space-y-2 p-4">
        <div className="text-sm font-semibold text-white/70">{t('admin.settings.advancedTitle')}</div>
        <p className="text-xs text-white/40">{t('admin.settings.advancedHint')}</p>
        <div className="flex flex-wrap items-end gap-2">
          <input className="input w-56" placeholder="key" value={key} onChange={(e) => setKey(e.target.value)} />
          <input className="input w-40" placeholder="value (JSON)" value={value} onChange={(e) => setValue(e.target.value)} />
          <button onClick={() => save()} className="btn-primary" disabled={!key}>{t('admin.common.save')}</button>
        </div>
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
