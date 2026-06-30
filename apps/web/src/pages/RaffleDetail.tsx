import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Coins, Dices, ShieldCheck, Ticket, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
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

  // Live, synchronized draw: when the server starts a draw it pushes the winners +
  // participant handles so every open client spins the same reel at the same time.
  // Winners/notifications only land once the reel finishes (see the API service).
  const [live, setLive] = useState<{ winners: any[]; participants: any[] } | null>(null);
  useEffect(() => {
    const s = getSocket();
    const handler = (p: any) => {
      if (p?.raffleId !== id) return;
      if (p.phase === 'draw' && Array.isArray(p.winners)) {
        setLive({ winners: p.winners, participants: p.participants ?? [] });
        qc.invalidateQueries({ queryKey: ['raffle', id] });
      } else {
        // Draw finished, a participant joined, or it was cancelled — just refresh.
        qc.invalidateQueries({ queryKey: ['raffle', id] });
        qc.invalidateQueries({ queryKey: ['raffle-parts', id] });
      }
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
                    ? `${t('raffles.minDeposit')} $${fmt(r.minDeposit)}`
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

      {/* Provably-fair draw reel. Live runs spin in real time for everyone watching;
          an already-completed raffle just shows its landed result (no re-spin). */}
      {live ? (
        <RaffleDraw participants={live.participants} winners={live.winners} currency={r.currency} autoPlay />
      ) : r.status === 'COMPLETED' && r.winners?.length > 0 ? (
        <RaffleDraw participants={parts ?? []} winners={r.winners} currency={r.currency} autoPlay={false} />
      ) : r.status === 'DRAWING' ? (
        <div className="card p-6 text-center">
          <div className="flex items-center justify-center gap-2 font-bold">
            <Dices size={18} className="animate-pulse text-bubble" /> {t('raffles.drawing')}
          </div>
          <div className="mt-1 text-sm text-white/50">{t('raffles.drawingSub')}</div>
        </div>
      ) : null}

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
