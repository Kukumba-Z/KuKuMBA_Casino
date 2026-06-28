import { Search, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GameCard, isOriginal } from '../components/GameCard';
import type { Game } from '../lib/hooks';
import { useGameFilters, useGames } from '../lib/hooks';

export default function Games() {
  const { t } = useTranslation();
  const [provider, setProvider] = useState('ALL');
  const [q, setQ] = useState('');

  const { data: filters } = useGameFilters();
  const { data: games, isLoading } = useGames({ provider, q });
  const providers = filters?.providers ?? [];

  const all = games ?? [];
  const originals = all.filter(isOriginal);
  const providerGames = all.filter((g) => !isOriginal(g));
  const grouped = provider === 'ALL'; // when a provider is picked, show a flat list

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold sm:text-3xl">
          <span className="holo-text">{t('games.title')}</span>
        </h1>
        <p className="text-sm text-white/55">{t('games.subtitle')}</p>
      </header>

      {/* search + provider dropdown */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('games.search')}
            className="input !py-2.5 !pl-10"
          />
        </div>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="input !w-full !py-2.5 sm:!w-56"
          aria-label={t('games.provider')}
        >
          <option value="ALL">{t('games.allProviders')}</option>
          {providers.map((p) => (
            <option key={p.key} value={p.key}>
              {p.key} ({p.count})
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl bg-white/[0.04]" />
          ))}
        </div>
      ) : all.length === 0 ? (
        <div className="card grid place-items-center p-10 text-center text-sm text-white/45">{t('games.empty')}</div>
      ) : grouped ? (
        <div className="space-y-8">
          {originals.length > 0 && (
            <Section icon title={t('games.originals')} games={originals} />
          )}
          {providerGames.length > 0 && <Section title={t('games.providers')} games={providerGames} />}
        </div>
      ) : (
        <Grid games={all} />
      )}
    </div>
  );
}

function Section({ title, games, icon }: { title: string; games: Game[]; icon?: boolean }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        {icon && <Sparkles size={18} className="text-lav" />}
        {title}
        <span className="text-sm font-normal text-white/35">{games.length}</span>
      </h2>
      <Grid games={games} />
    </section>
  );
}

function Grid({ games }: { games: Game[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {games.map((g) => (
        <GameCard key={g.key} game={g} />
      ))}
    </div>
  );
}
