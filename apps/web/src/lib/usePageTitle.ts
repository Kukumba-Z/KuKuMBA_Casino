import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

const BRAND = 'KuKuMBA';
const HOME_TITLE = 'KuKuMBA — милое онлайн-казино';

/** Route → i18n nav key. Keeps titles data-driven and localized. */
const ROUTE_TITLE: Record<string, string> = {
  '/games': 'nav.games',
  '/roulette': 'nav.roulette',
  '/top': 'top.title',
  '/bonuses': 'nav.bonuses',
  '/raffles': 'nav.raffles',
  '/profile': 'nav.profile',
  '/wallet': 'nav.wallet',
  '/support': 'nav.support',
  '/notifications': 'nav.notifications',
  '/admin': 'nav.admin',
};

/** Sets `document.title` per route as "<Section> · KuKuMBA"; the lobby uses the
 *  full brand line. Re-runs on language change so titles stay localized. */
export function usePageTitle() {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  useEffect(() => {
    const key = ROUTE_TITLE[pathname];
    document.title = key ? `${t(key)} · ${BRAND}` : HOME_TITLE;
  }, [pathname, t, i18n.language]);
}
