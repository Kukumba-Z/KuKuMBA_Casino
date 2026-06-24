import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import api, { apiError } from '../lib/api';
import { fmt } from '../lib/hooks';
import { useAuth } from '../store/auth';

export default function Bonuses() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const authed = !!useAuth((s) => s.accessToken);
  const en = i18n.language?.startsWith('en');
  const { data: catalog } = useQuery({ queryKey: ['bonuses'], queryFn: async () => (await api.get('/bonuses')).data });
  const { data: mine } = useQuery({ queryKey: ['my-bonuses'], enabled: authed, queryFn: async () => (await api.get('/bonuses/me')).data });
  const [msg, setMsg] = useState('');

  const claim = async (key: string) => {
    setMsg('');
    try {
      await api.post(`/bonuses/${key}/claim`);
      setMsg('✅ ' + key);
      qc.invalidateQueries({ queryKey: ['balances'] });
      qc.invalidateQueries({ queryKey: ['my-bonuses'] });
    } catch (e) {
      setMsg('⚠ ' + apiError(e));
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">🎁 {t('nav.bonuses')}</h1>
      {msg && <div className="chip">{msg}</div>}
      <div className="grid gap-4 md:grid-cols-3">
        {(catalog ?? []).map((b: any) => (
          <div key={b.id} className="card flex flex-col p-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-lg font-bold">{b.name}</span>
              <span className="chip">{b.type}</span>
            </div>
            <p className="flex-1 text-sm text-white/55">{en ? b.descriptionEn : b.descriptionRu}</p>
            <div className="mt-3 text-sm text-white/70">
              {b.percent ? `${b.percent}%` : `${fmt(b.amount)} ${b.currency}`}
              {b.wagerMultiplier ? ` · wager x${b.wagerMultiplier}` : ''}
            </div>
            {['WELCOME', 'NO_DEPOSIT'].includes(b.type) ? (
              authed ? (
                <button onClick={() => claim(b.key)} className="btn-primary mt-3">{t('common.claim')}</button>
              ) : (
                <Link to="/login" className="btn-ghost mt-3 text-center">{t('common.login')}</Link>
              )
            ) : (
              <div className="mt-3 text-center text-xs text-white/40">Применяется автоматически</div>
            )}
          </div>
        ))}
      </div>

      {authed && mine && mine.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 text-lg font-bold">Мои бонусы / My bonuses</h2>
          <div className="space-y-2">
            {mine.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-sm">
                <span>{m.name}</span>
                <span className="tabular-nums">{fmt(m.amount)} {m.currency} · {m.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
