import { Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GameCard, categoryMeta } from '../components/GameCard';
import { useGameFilters, useGames } from '../lib/hooks';

export default function Games() {
  const { t } = useTranslation();
  const [category, setCategory] = useState('ALL');
  const [provider, setProvider] = useState('ALL');
  const [q, setQ] = useState('');

  const { data: filters } = useGameFilters();
  const { data: games, isLoading } = useGames({ category, provider, q });

  const categories = filters?.categories ?? [];
  const providers = filters?.providers ?? [];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold sm:text-3xl">
          <span className="holo-text">{t('games.title')}</span>
        </h1>
        <p className="text-sm text-white/55">{t('games.subtitle')}</p>
      </header>

      {/* search */}
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('games.search')}
          className="input !py-2.5 !pl-10"
        />
      </div>

      {/* category chips — horizontal scroll on mobile, no page overflow */}
      <div className="-mx-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-2">
          <Chip active={category === 'ALL'} onClick={() => setCategory('ALL')}>
            {t('games.all')}
          </Chip>
          {categories.map((c) => (
            <Chip key={c.key} active={category === c.key} onClick={() => setCategory(c.key)}>
              {t(categoryMeta(c.key).labelKey)} <span className="text-white/40">{c.count}</span>
            </Chip>
          ))}
        </div>
      </div>

      {/* provider filter */}
      {providers.length > 1 && (
        <div className="-mx-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
          <div className="flex w-max gap-2">
            <Chip small active={provider === 'ALL'} onClick={() => setProvider('ALL')}>
              {t('games.allProviders')}
            </Chip>
            {providers.map((p) => (
              <Chip key={p.key} small active={provider === p.key} onClick={() => setProvider(p.key)}>
                {p.key}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl bg-white/[0.04]" />
          ))}
        </div>
      ) : games && games.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {games.map((g) => (
            <GameCard key={g.key} game={g} />
          ))}
        </div>
      ) : (
        <div className="card grid place-items-center p-10 text-center text-sm text-white/45">{t('games.empty')}</div>
      )}
    </div>
  );
}

function Chip({
  active,
  small,
  onClick,
  children,
}: {
  active: boolean;
  small?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 ${small ? 'py-1 text-xs' : 'py-1.5 text-sm'} font-medium transition ${
        active
          ? 'border-transparent bg-holo text-night shadow-glow'
          : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  );
}
