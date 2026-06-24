import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useBalances, useOnline } from '../lib/hooks';
import { fmt } from '../lib/hooks';
import i18n from '../i18n';
import { useAuth } from '../store/auth';
import { useUI } from '../store/ui';
import { Logo, Mascot } from './Mascot';

const NAV = [
  { to: '/', key: 'lobby', end: true },
  { to: '/roulette', key: 'roulette' },
  { to: '/raffles', key: 'raffles' },
  { to: '/bonuses', key: 'bonuses' },
  { to: '/vip', key: 'vip' },
  { to: '/referrals', key: 'referrals' },
];

function LangSwitch() {
  const [, setT] = useState(0);
  const set = (lng: string) => {
    i18n.changeLanguage(lng);
    setT((x) => x + 1);
  };
  return (
    <div className="flex overflow-hidden rounded-xl border border-white/10 text-xs">
      {['ru', 'en'].map((l) => (
        <button
          key={l}
          onClick={() => set(l)}
          className={`px-2.5 py-1.5 uppercase transition ${
            i18n.language?.startsWith(l) ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function BalancePill() {
  const { t } = useTranslation();
  const { mode, setMode, currency } = useUI();
  const { data: balances } = useBalances();
  const bal = balances?.find((b) => b.mode === mode && b.currency === currency);
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 p-1 pl-1.5">
      <div className="flex overflow-hidden rounded-xl text-xs font-semibold">
        <button
          onClick={() => setMode('DEMO')}
          className={`px-2 py-1 transition ${mode === 'DEMO' ? 'bg-lav/30 text-white' : 'text-white/50'}`}
        >
          {t('common.demo')}
        </button>
        <button
          onClick={() => setMode('REAL')}
          className={`px-2 py-1 transition ${mode === 'REAL' ? 'bg-mint/25 text-white' : 'text-white/50'}`}
        >
          {t('common.real')}
        </button>
      </div>
      <div className="px-1.5 text-sm font-bold tabular-nums">
        {fmt(bal?.amount ?? '0', 4)} <span className="text-white/40">{currency}</span>
      </div>
      <Link to="/wallet" className="btn-primary !px-3 !py-1.5 text-sm">
        +
      </Link>
    </div>
  );
}

function Bell() {
  const { data } = useQuery({
    queryKey: ['unread'],
    queryFn: async () => (await api.get('/notifications/unread-count')).data,
    refetchInterval: 20_000,
  });
  const count = data?.count ?? 0;
  return (
    <Link to="/notifications" className="relative grid h-10 w-10 place-items-center rounded-xl hover:bg-white/5">
      <span className="text-lg">🔔</span>
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-bubble px-1 text-[11px] font-bold text-night">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  );
}

function AccountMenu() {
  const { user, clear } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const logout = async () => {
    try {
      await api.post('/auth/logout', { refreshToken: useAuth.getState().refreshToken });
    } catch {
      /* ignore */
    }
    clear();
    navigate('/');
  };
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 py-1 pl-1 pr-3 hover:bg-white/10"
      >
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-holo text-night">
          <Mascot size={22} />
        </span>
        <span className="hidden text-sm font-semibold sm:block">{user?.username}</span>
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 w-52 overflow-hidden rounded-2xl border border-white/10 bg-surface-2 shadow-card"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="border-b border-white/10 px-4 py-3 text-xs text-white/50">
            ID #{user?.accountId} · {user?.role}
          </div>
          {[
            ['/profile', 'Профиль / Profile'],
            ['/wallet', 'Кошелёк / Wallet'],
            ['/cashback', 'Кешбэк / Cashback'],
            ['/promo', 'Промокоды / Promo'],
            ['/support', 'Поддержка / Support'],
          ].map(([to, label]) => (
            <Link
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm hover:bg-white/5"
            >
              {label}
            </Link>
          ))}
          {user?.role === 'ADMIN' && (
            <Link to="/admin" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm text-sun hover:bg-white/5">
              ⚙ Admin
            </Link>
          )}
          <button onClick={logout} className="block w-full px-4 py-2.5 text-left text-sm text-bubble hover:bg-white/5">
            Выйти / Log out
          </button>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { t } = useTranslation();
  const authed = !!useAuth((s) => s.accessToken);
  const online = useOnline();

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 glass border-b border-white/10">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
          <Link to="/">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => `nav-link !py-2 text-sm ${isActive ? 'nav-link-active' : ''}`}
              >
                {t(`nav.${n.key}`)}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <span className="chip hidden sm:inline-flex">
              <span className="h-2 w-2 rounded-full bg-mint shadow-glow-mint" />
              {Math.max(online.sockets, 1)} {t('common.online')}
            </span>
            {authed && <BalancePill />}
            <LangSwitch />
            {authed && <Bell />}
            {authed ? (
              <AccountMenu />
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login" className="btn-ghost text-sm">
                  {t('common.login')}
                </Link>
                <Link to="/register" className="btn-primary text-sm">
                  {t('common.register')}
                </Link>
              </div>
            )}
          </div>
        </div>
        {/* mobile nav */}
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-xl px-3 py-1.5 text-sm ${isActive ? 'bg-white/10 text-white' : 'text-white/60'}`
              }
            >
              {t(`nav.${n.key}`)}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}

function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="mt-10 border-t border-white/10 bg-black/20">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-white/50">{t('brand.tagline')}. 18+. Provably-fair · RTP 99%.</p>
        </div>
        <FooterCol title={t('nav.lobby')} links={[['/', t('nav.lobby')], ['/roulette', t('nav.roulette')], ['/raffles', t('nav.raffles')], ['/vip', t('nav.vip')]]} />
        <FooterCol title={t('nav.profile')} links={[['/wallet', t('nav.wallet')], ['/bonuses', t('nav.bonuses')], ['/promo', t('nav.promo')], ['/referrals', t('nav.referrals')]]} />
        <FooterCol
          title="Инфо / Info"
          links={[
            ['/page/about', t('nav.about')],
            ['/page/responsible-gaming', t('nav.responsible')],
            ['/page/private-game', 'Приватная игра'],
            ['/page/contacts', t('nav.contacts')],
            ['/page/terms', 'Условия / Terms'],
          ]}
        />
      </div>
      <div className="border-t border-white/10 px-4 py-4 text-center text-xs text-white/40">
        © {new Date().getFullYear()} KuKuMBA · Играйте ответственно · Demo & Real
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="mb-3 text-sm font-semibold text-white/80">{title}</div>
      <ul className="space-y-2 text-sm">
        {links.map(([to, label]) => (
          <li key={to}>
            <Link to={to} className="text-white/50 transition hover:text-white">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
