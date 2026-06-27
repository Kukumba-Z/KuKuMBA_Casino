import {
  BadgePercent,
  Gift,
  Home,
  LayoutGrid,
  LifeBuoy,
  type LucideIcon,
  PartyPopper,
  Shield,
  Sparkles,
  Tag,
  Ticket,
  User,
  Users,
} from 'lucide-react';

export interface NavItem {
  to: string;
  /** i18n key under `nav.*` */
  key: string;
  icon: LucideIcon;
  end?: boolean;
  /** visual accent (used for the live-raffle tab) */
  accent?: boolean;
}

// Primary tabs shared by the mobile bottom bar and the desktop top bar.
export const HOME: NavItem = { to: '/', key: 'lobby', icon: Home, end: true };
export const GAMES: NavItem = { to: '/games', key: 'games', icon: LayoutGrid };
export const BONUSES: NavItem = { to: '/bonuses', key: 'bonuses', icon: Gift };
export const PROFILE: NavItem = { to: '/profile', key: 'profile', icon: User };
export const RAFFLES: NavItem = { to: '/raffles', key: 'raffles', icon: PartyPopper, accent: true };
export const ADMIN: NavItem = { to: '/admin', key: 'admin', icon: Shield };

// Items inside the "More" sheet (mobile) / account menu (desktop).
export const MORE_ITEMS: NavItem[] = [{ to: '/support', key: 'support', icon: LifeBuoy }];

// Sub-tabs of the Bonuses hub (cashback / promo / vip / referrals live here now).
export interface BonusTab {
  key: string;
  icon: LucideIcon;
}
export const BONUS_TABS: BonusTab[] = [
  { key: 'bonuses', icon: Gift },
  { key: 'cashback', icon: BadgePercent },
  { key: 'promo', icon: Tag },
  { key: 'vip', icon: Sparkles },
  { key: 'referrals', icon: Users },
];

/** Build the ordered list of bottom-bar tabs for the current state. */
export function bottomTabs(opts: { raffleActive: boolean }): NavItem[] {
  const tabs: NavItem[] = [HOME, GAMES, BONUSES];
  if (opts.raffleActive) tabs.push(RAFFLES);
  return tabs;
}

/** Desktop top-bar primary links. */
export function desktopTabs(opts: { raffleActive: boolean }): NavItem[] {
  const tabs: NavItem[] = [HOME, GAMES, BONUSES];
  if (opts.raffleActive) tabs.push(RAFFLES);
  return tabs;
}

export const ICONS = { LayoutGrid, Ticket, PartyPopper } as const;
