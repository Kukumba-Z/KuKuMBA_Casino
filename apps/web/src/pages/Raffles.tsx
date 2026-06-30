import { useQuery } from '@tanstack/react-query';
import { Coins, PartyPopper, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { fmt } from '../lib/hooks';
import { enumLabel } from '../lib/labels';

export default function Raffles() {
  const { t, i18n } = useTranslation();
  const en = i18n.language?.startsWith('en');
  const { data } = useQuery({ queryKey: ['raffles'], queryFn: async () => (await api.get('/raffles')).data });

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold">
        <PartyPopper size={24} className="text-bubble" /> {t('raffles.title')}
      </h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(data ?? []).map((r: any) => (
          <Link key={r.id} to={`/raffles/${r.id}`} className="card flex flex-col p-5 transition hover:shadow-glow">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-lg font-bold">{r.title}</span>
              <span className={`chip ${r.status === 'OPEN' ? 'text-mint' : 'text-white/50'}`}>
                {enumLabel('raffleStatus', r.status)}
              </span>
            </div>
            <p className="flex-1 text-sm text-white/55">{en ? r.descriptionEn : r.descriptionRu}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <Info label={t('raffles.prize')} value={`${fmt(r.prizePool)} ${r.currency}`} />
              <Info label={t('raffles.winners')} value={r.winnersCount} />
              <Info label={t('raffles.participants')} value={r.participants} />
              <Info label={t('raffles.entry')} value={Number(r.entryCost) > 0 ? `${fmt(r.entryCost)} ${r.currency}` : t('raffles.free')} />
            </div>
            {(r.requiresDeposit || r.audience !== 'ALL') && (
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                {r.audience !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-white/60">
                    <Users size={12} className="text-bubble" /> {enumLabel('raffleAudience', r.audience)}
                  </span>
                )}
                {r.requiresDeposit && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-white/60">
                    <Coins size={12} className="text-sun" />
                    {r.minDeposit && Number(r.minDeposit) > 0
                      ? `${t('raffles.minDeposit')} $${fmt(r.minDeposit)}`
                      : t('raffles.requiresDeposit')}
                  </span>
                )}
              </div>
            )}
          </Link>
        ))}
        {(!data || data.length === 0) && <div className="text-white/40">{t('common.empty')}</div>}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg bg-black/30 px-3 py-2">
      <div className="text-[11px] uppercase text-white/40">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
