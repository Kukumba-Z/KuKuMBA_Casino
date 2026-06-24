import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import api, { apiError } from '../lib/api';
import { fmt } from '../lib/hooks';
import { useAuth } from '../store/auth';

export default function RaffleDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const en = i18n.language?.startsWith('en');
  const qc = useQueryClient();
  const authed = !!useAuth((s) => s.accessToken);
  const isAdmin = useAuth((s) => s.user?.role) === 'ADMIN';
  const [msg, setMsg] = useState('');

  const { data: r } = useQuery({ queryKey: ['raffle', id], queryFn: async () => (await api.get(`/raffles/${id}`)).data });

  const join = async () => {
    setMsg('');
    try {
      await api.post(`/raffles/${id}/join`);
      setMsg('✅ Вы участвуете! / You joined!');
      qc.invalidateQueries({ queryKey: ['raffle', id] });
    } catch (e) {
      setMsg('⚠ ' + apiError(e));
    }
  };
  const draw = async () => {
    try {
      await api.post(`/raffles/${id}/draw`, {});
      qc.invalidateQueries({ queryKey: ['raffle', id] });
    } catch (e) {
      setMsg('⚠ ' + apiError(e));
    }
  };

  if (!r) return <div className="text-white/40">{t('common.loading')}</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="card space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold">{r.title}</h1>
          <span className={`chip ${r.status === 'OPEN' ? 'text-mint' : 'text-white/50'}`}>{r.status}</span>
        </div>
        <p className="text-white/60">{en ? r.descriptionEn : r.descriptionRu}</p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t('raffles.prize')} value={`${fmt(r.prizePool)} ${r.currency}`} />
          <Stat label={t('raffles.winners')} value={r.winnersCount} />
          <Stat label={t('raffles.participants')} value={r.participants} />
          <Stat label={t('raffles.entry')} value={Number(r.entryCost) > 0 ? `${fmt(r.entryCost)} ${r.currency}` : t('raffles.free')} />
        </div>

        {r.status === 'OPEN' && authed && (
          <button onClick={join} className="btn-primary w-full">{t('raffles.join')}</button>
        )}
        {r.status === 'OPEN' && isAdmin && (
          <button onClick={draw} className="btn-soft w-full">🎲 Провести розыгрыш (admin)</button>
        )}
        {msg && <div className="text-center text-sm">{msg}</div>}
      </div>

      {r.winners && r.winners.length > 0 && (
        <div className="card p-6">
          <h2 className="mb-3 text-lg font-bold">🏆 Победители / Winners</h2>
          <div className="space-y-2">
            {r.winners.map((w: any, i: number) => (
              <div key={i} className="flex items-center justify-between rounded-xl bg-holo-soft px-4 py-3">
                <span className="font-bold">#{w.rank} {w.username}</span>
                <span className="font-extrabold text-sun">+{fmt(w.prize)} {r.currency}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-6 text-xs text-white/50">
        <div className="mb-2 font-semibold text-white/70">🔐 Provably-fair</div>
        <div className="break-all">serverSeedHash: <span className="font-mono">{r.serverSeedHash}</span></div>
        {r.serverSeed && <div className="break-all">serverSeed: <span className="font-mono">{r.serverSeed}</span></div>}
        {r.clientSeed && <div className="break-all">clientSeed: <span className="font-mono">{r.clientSeed}</span></div>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl bg-black/30 px-3 py-2">
      <div className="text-[11px] uppercase text-white/40">{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  );
}
