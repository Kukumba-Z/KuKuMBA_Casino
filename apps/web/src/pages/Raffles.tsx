import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { fmt } from '../lib/hooks';

export default function Raffles() {
  const { t, i18n } = useTranslation();
  const en = i18n.language?.startsWith('en');
  const { data } = useQuery({ queryKey: ['raffles'], queryFn: async () => (await api.get('/raffles')).data });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">🎉 {t('raffles.title')}</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(data ?? []).map((r: any) => (
          <Link key={r.id} to={`/raffles/${r.id}`} className="card flex flex-col p-5 transition hover:shadow-glow">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-lg font-bold">{r.title}</span>
              <span className={`chip ${r.status === 'OPEN' ? 'text-mint' : 'text-white/50'}`}>
                {r.status === 'OPEN' ? t('raffles.open') : t('raffles.drawn')}
              </span>
            </div>
            <p className="flex-1 text-sm text-white/55">{en ? r.descriptionEn : r.descriptionRu}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <Info label={t('raffles.prize')} value={`${fmt(r.prizePool)} ${r.currency}`} />
              <Info label={t('raffles.winners')} value={r.winnersCount} />
              <Info label={t('raffles.participants')} value={r.participants} />
              <Info label={t('raffles.entry')} value={Number(r.entryCost) > 0 ? `${fmt(r.entryCost)} ${r.currency}` : t('raffles.free')} />
            </div>
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
