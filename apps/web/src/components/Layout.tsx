import { useQuery } from '@tanstack/react-query';
import { Bell, LogOut, Menu, Shield, User as UserIcon, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import i18n from '../i18n';
import api from '../lib/api';
import { useOnline } from '../lib/hooks';
import { ADMIN, bottomTabs, desktopTabs, MORE_ITEMS, NavItem } from '../lib/nav';
import { useAuth } from '../store/auth';
import { CurrencyMenu } from './CurrencyMenu';
import { Logo, Mascot } from './Mascot';

/** Is there a live raffle right now? Drives the accent raffle tab. */
function useRaffleActive(): boolean {
  const { data } = useQuery({
    queryKey: ['raffles'],
    queryFn: async () => (await api.get('/raffles')).data,
    refetchInterval: 60_000,
  });
  return Array.isArray(data) && data.some((r: any) => r.status === 'OPEN');
}

function LangSwitch() {
  const [, force] = useState(0);
  const set = (lng: string) => {
    i18n.changeLanguage(lng);
    force((x) => x + 1);
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

function BellLink() {
  const { data } = useQuery({
    queryKey: ['unread'],
    queryFn: async () => (await api.get('/notifications/unread-count')).data,
    refetchInterval: 20_000,
  });
  const count = data?.count ?? 0;
  return (
    <Link
      to="/notifications"
      className="relative grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/5 text-white/90 transition hover:bg-white/10"
      aria-label="Notifications"
    >
      <Bell size={19} />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-bubble px-1 text-[10px] font-bold text-night shadow">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  );
}

function AccountButton() {
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
  const items: [string, string, any][] = [
    ['/profile', 'Профиль / Profile', UserIcon],
    ['/wallet', 'Кошелёк / Wallet', Wallet],
  ];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 py-1 pl-1 pr-3 hover:bg-white/10"
      >
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-holo text-night">
          <Mascot size={22} />
        </span>
        <span className="hidden max-w-28 truncate text-sm font-semibold sm:block">{user?.username}</span>
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-white/10 bg-surface-2 shadow-card"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="border-b border-white/10 px-4 py-3 text-xs text-white/50">
            ID #{user?.accountId} · {user?.role}
          </div>
          {items.map(([to, label, Icon]) => (
            <Link key={to} to={to} onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-white/5">
              <Icon size={16} className="text-white/50" /> {label}
            </Link>
          ))}
          {user?.role === 'ADMIN' && (
            <Link to="/admin" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-sun hover:bg-white/5">
              <Shield size={16} /> Admin
            </Link>
          )}
          <button onClick={logout} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-bubble hover:bg-white/5">
            <LogOut size={16} /> Выйти / Log out
          </button>
        </div>
      )}
    </div>
  );
}

function Tab({ item, accent }: { item: NavItem; accent?: boolean }) {
  const { t } = useTranslation();
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `flex flex-col items-center gap-0.5 py-2 text-[11px] transition ${isActive ? 'text-white' : 'text-white/55'}`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`grid h-7 w-7 place-items-center rounded-xl transition ${
              accent ? 'bg-holo text-night shadow-glow' : isActive ? 'bg-white/10' : ''
            }`}
          >
            <Icon size={18} />
          </span>
          {t(`nav.${item.key}`)}
        </>
      )}
    </NavLink>
  );
}

function BottomNav({ tabs, onMore, moreOpen }: { tabs: NavItem[]; onMore: () => void; moreOpen: boolean }) {
  const { t } = useTranslation();
  const cols = tabs.length + 1;
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 glass border-t border-white/10 lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {tabs.map((tb) => (
          <Tab key={tb.to} item={tb} accent={tb.accent} />
        ))}
        <button
          onClick={onMore}
          className={`flex flex-col items-center gap-0.5 py-2 text-[11px] transition ${moreOpen ? 'text-white' : 'text-white/55'}`}
        >
          <span className={`grid h-7 w-7 place-items-center rounded-xl ${moreOpen ? 'bg-white/10' : ''}`}>
            <Menu size={18} />
          </span>
          {t('nav.more')}
        </button>
      </div>
    </nav>
  );
}

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { user, clear } = useAuth();
  const authed = !!user;
  const navigate = useNavigate();
  const items = [...MORE_ITEMS, ...(user?.role === 'ADMIN' ? [ADMIN] : [])];
  const logout = async () => {
    try {
      await api.post('/auth/logout', { refreshToken: useAuth.getState().refreshToken });
    } catch {
      /* ignore */
    }
    clear();
    onClose();
    navigate('/');
  };
  return (
    <div className={`fixed inset-0 z-50 lg:hidden ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
      <div
        className={`absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-surface-2 p-5 transition-transform duration-200 ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/15" />

        {authed ? (
          <div className="mb-4 flex items-center gap-3 rounded-2xl bg-white/5 p-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-holo text-night">
              <Mascot size={26} />
            </span>
            <div className="min-w-0">
              <div className="truncate font-bold">{user?.username}</div>
              <div className="text-xs text-white/50">ID #{user?.accountId} · {user?.role}</div>
            </div>
          </div>
        ) : (
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Link to="/login" onClick={onClose} className="btn-ghost">{t('common.login')}</Link>
            <Link to="/register" onClick={onClose} className="btn-primary">{t('common.register')}</Link>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <NavLink
                key={it.to}
                to={it.to}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-2xl border border-white/10 px-4 py-3 text-sm ${
                    isActive ? 'bg-white/10 text-white' : 'bg-white/[0.03] text-white/75'
                  }`
                }
              >
                <Icon size={18} className="text-white/55" /> {t(`nav.${it.key}`)}
              </NavLink>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            <Link to="/page/about" onClick={onClose} className="text-white/55 hover:text-white">{t('nav.about')}</Link>
            <Link to="/page/responsible-gaming" onClick={onClose} className="text-white/55 hover:text-white">{t('nav.responsible')}</Link>
            <Link to="/page/contacts" onClick={onClose} className="text-white/55 hover:text-white">{t('nav.contacts')}</Link>
          </div>
          <LangSwitch />
        </div>

        {authed && (
          <button onClick={logout} className="btn-ghost mt-4 flex w-full items-center justify-center gap-2 text-bubble">
            <LogOut size={16} /> {t('common.logout')}
          </button>
        )}
      </div>
    </div>
  );
}

export default function Layout() {
  const { t } = useTranslation();
  const authed = !!useAuth((s) => s.accessToken);
  const raffleActive = useRaffleActive();
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  const dTabs = desktopTabs({ raffleActive });
  const bTabs = bottomTabs({ raffleActive });

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 glass border-b border-white/10">
        {/* Desktop */}
        <div className="mx-auto hidden h-16 max-w-7xl items-center justify-between gap-3 px-4 lg:flex">
          <Link to="/"><Logo /></Link>
          <nav className="flex items-center gap-1">
            {dTabs.map((n) => {
              const Icon = n.icon;
              return (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    `nav-link !py-2 text-sm ${isActive ? 'nav-link-active' : ''} ${n.accent ? 'text-sun' : ''}`
                  }
                >
                  <Icon size={16} /> {t(`nav.${n.key}`)}
                </NavLink>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            {authed && <CurrencyMenu />}
            <LangSwitch />
            {authed && <BellLink />}
            {authed ? (
              <AccountButton />
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login" className="btn-ghost text-sm">{t('common.login')}</Link>
                <Link to="/register" className="btn-primary text-sm">{t('common.register')}</Link>
              </div>
            )}
          </div>
        </div>

        {/* Mobile (slim) */}
        <div className="flex h-14 items-center justify-between gap-2 px-3 lg:hidden">
          <Link to="/"><Logo /></Link>
          <div className="flex items-center gap-1.5">
            {authed ? (
              <>
                <CurrencyMenu />
                <BellLink />
              </>
            ) : (
              <>
                <Link to="/login" className="btn-ghost !px-3 !py-1.5 text-sm">{t('common.login')}</Link>
                <Link to="/register" className="btn-primary !px-3 !py-1.5 text-sm">{t('common.register')}</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-5 sm:px-4 sm:py-6">
        <Outlet />
      </main>

      <Footer />

      <BottomNav tabs={bTabs} onMore={() => setMoreOpen(true)} moreOpen={moreOpen} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
      <div className="h-16 lg:hidden" />
    </div>
  );
}

function Footer() {
  const { t } = useTranslation();
  const online = useOnline();
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => (await api.get('/stats')).data,
    refetchInterval: 30_000,
  });
  return (
    <footer className="mt-8 border-t border-white/10 bg-black/20">
      {/* live trust strip */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-5 gap-y-1.5 px-4 py-3 text-xs text-white/60 sm:text-sm">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-mint shadow-glow-mint" />
          {Math.max(online.sockets, 1)} {t('common.online')}
        </span>
        <span>{stats?.players ?? 0} {t('common.players')}</span>
        <span>{stats?.totalRounds ?? 0} {t('lobby.rounds')}</span>
        <span className="text-white/40">Provably-fair · 18+</span>
      </div>

      {/* full link columns — desktop/tablet only (mobile uses the More sheet) */}
      <div className="mx-auto hidden max-w-7xl gap-8 border-t border-white/10 px-4 py-8 sm:grid sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-white/50">{t('brand.tagline')}. Играйте ответственно.</p>
        </div>
        <FooterCol title={t('nav.lobby')} links={[['/', t('nav.lobby')], ['/games', t('nav.games')], ['/roulette', t('nav.roulette')], ['/bonuses', t('nav.bonuses')]]} />
        <FooterCol title={t('nav.profile')} links={[['/wallet', t('nav.wallet')], ['/profile', t('nav.profile')], ['/notifications', t('nav.notifications')], ['/support', t('nav.support')]]} />
        <FooterCol
          title="Инфо / Info"
          links={[
            ['/page/about', t('nav.about')],
            ['/page/responsible-gaming', t('nav.responsible')],
            ['/page/contacts', t('nav.contacts')],
            ['/page/terms', 'Условия / Terms'],
          ]}
        />
      </div>

      {/* compact link row — mobile only */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-white/10 px-4 py-3 text-xs text-white/50 sm:hidden">
        <Link to="/games" className="hover:text-white">{t('nav.games')}</Link>
        <Link to="/bonuses" className="hover:text-white">{t('nav.bonuses')}</Link>
        <Link to="/page/responsible-gaming" className="hover:text-white">{t('nav.responsible')}</Link>
        <Link to="/page/about" className="hover:text-white">{t('nav.about')}</Link>
        <Link to="/support" className="hover:text-white">{t('nav.support')}</Link>
      </div>

      <div className="border-t border-white/10 px-4 py-3 text-center text-[11px] text-white/40">
        © {new Date().getFullYear()} KuKuMBA · Demo &amp; Real
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
            <Link to={to} className="text-white/50 transition hover:text-white">{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
