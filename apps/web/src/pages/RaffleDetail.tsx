import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Coins, Dices, ShieldCheck, Ticket, Users } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import RaffleDraw from '../components/RaffleDraw';
import api, { apiError } from '../lib/api';
import { fmt } from '../lib/hooks';
import { enumLabel } from '../lib/labels';
import { getSocket } from '../lib/socket';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';

export default function RaffleDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const en = i18n.language?.startsWith('en');
  const qc = useQueryClient();
  const authed = !!useAuth((s) => s.accessToken);
  const isAdmin = useAuth((s) => s.user?.role) === 'ADMIN';

  const { data: r } = useQuery({ queryKey: ['raffle', id], queryFn: async () => (await api.get(`/raffles/${id}`)).data });
  // Participant handles for the draw reel — only needed once a winner exists.
  const { data: parts } = useQuery({
    queryKey: ['raffle-parts', id],
    enabled: !!r && r.status === 'COMPLETED',
    queryFn: async () => (await api.get(`/raffles/${id}/participants`)).data,
  });

  // Live updates: the cron may draw this raffle while the page is open.
  useEffect(() => {
    const s = getSocket();
    const handler = (p: any) => {
      if (p?.raffleId === id) qc.invalidateQueries({ queryKey: ['raffle', id] });
    };
    s.on('raffle', handler);
    return () => {
      s.off('raffle', handler);
    };
  }, [id, qc]);

  const join = async () => {
    try {
      await api.post(`/raffles/${id}/join`);
      toast.success(t('raffles.joined'));
      qc.invalidateQueries({ queryKey: ['raffle', id] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const draw = async () => {
    try {
      await api.post(`/raffles/${id}/draw`, {});
      qc.invalidateQueries({ queryKey: ['raffle', id] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  if (!r) return <div className="text-white/40">{t('common.loading')}</div>;

  const hasConditions = r.requiresDeposit || r.audience !== 'ALL';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="card space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold">{r.title}</h1>
          <span className={`chip ${r.status === 'OPEN' ? 'text-mint' : 'text-white/50'}`}>{enumLabel('raffleStatus', r.status)}</span>
        </div>
        <p className="text-white/60">{en ? r.descriptionEn : r.descriptionRu}</p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t('raffles.prize')} value={`${fmt(r.prizePool)} ${r.currency}`} />
          <Stat label={t('raffles.winners')} value={r.winnersCount} />
          <Stat label={t('raffles.participants')} value={r.participants} />
          <Stat label={t('raffles.entry')} value={Number(r.entryCost) > 0 ? `${fmt(r.entryCost)} ${r.currency}` : t('raffles.free')} />
        </div>

        {(r.drawAt || r.myTickets > 0) && (
          <div className="flex flex-wrap gap-3 text-sm text-white/60">
            {r.drawAt && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock size={15} className="text-bubble" /> {t('raffles.drawAt')}: {new Date(r.drawAt).toLocaleString(en ? 'en-GB' : 'ru-RU')}
              </span>
            )}
            {r.myTickets > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Ticket size={15} className="text-mint" /> {t('raffles.myTickets')}: {r.myTickets}
              </span>
            )}
          </div>
        )}

        {hasConditions && (
          <div className="rounded-xl bg-black/30 p-4">
            <div className="mb-2 text-[11px] uppercase tracking-wide text-white/40">{t('raffles.conditions')}</div>
            <div className="flex flex-wrap gap-2 text-sm">
              {r.audience !== 'ALL' && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5">
                  <Users size={14} className="text-bubble" /> {enumLabel('raffleAudience', r.audience)}
                </span>
              )}
              {r.requiresDeposit && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5">
                  <Coins size={14} className="text-sun" />
                  {r.minDeposit && Number(r.minDeposit) > 0
                    ? `${t('raffles.minDeposit')} ${fmt(r.minDeposit)} ${r.currency}`
                    : t('raffles.requiresDeposit')}
                  {r.depositWithinDays ? ` · ${t('raffles.depositWindow')} ${r.depositWithinDays} ${t('raffles.days')}` : ''}
                </span>
              )}
            </div>
          </div>
        )}

        {r.status === 'OPEN' && authed && (
          <button onClick={join} className="btn-primary w-full">{t('raffles.join')}</button>
        )}
        {r.status === 'OPEN' && !authed && (
          <div className="rounded-xl bg-black/30 px-4 py-3 text-center text-sm text-white/50">{t('raffles.loginToJoin')}</div>
        )}
        {r.status === 'OPEN' && isAdmin && (
          <button onClick={draw} className="btn-soft inline-flex w-full items-center justify-center gap-2">
            <Dices size={18} /> {t('raffles.drawAdmin')}
          </button>
        )}
      </div>

      {/* Provably-fair draw reel — plays through to the real winner(s). */}
      {r.status === 'COMPLETED' && r.winners?.length > 0 && (
        <RaffleDraw participants={parts ?? []} winners={r.winners} currency={r.currency} />
      )}

      <div className="card p-6 text-xs text-white/50">
        <div className="mb-2 flex items-center gap-1.5 font-semibold text-white/70">
          <ShieldCheck size={15} className="text-mint" /> {t('raffles.provablyFair')}
        </div>
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
