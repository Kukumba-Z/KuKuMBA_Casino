import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Coins,
  Crown,
  FileText,
  Gamepad2,
  Gift,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  MessagesSquare,
  PartyPopper,
  Plug,
  Receipt,
  ScrollText,
  Settings as SettingsIcon,
  Shield,
  Tag,
  Users as UsersIcon,
  type LucideIcon,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { AdminMe } from '../../lib/hooks';
import { AuditTab } from './tabs/AuditTab';
import { BonusesTab } from './tabs/BonusesTab';
import { BroadcastTab } from './tabs/BroadcastTab';
import { ChatTab } from './tabs/ChatTab';
import { ContentTab } from './tabs/ContentTab';
import { CurrenciesTab } from './tabs/CurrenciesTab';
import { DashboardTab } from './tabs/DashboardTab';
import { DepositsTab } from './tabs/DepositsTab';
import { GamesTab } from './tabs/GamesTab';
import { PromoTab } from './tabs/PromoTab';
import { ProvidersTab } from './tabs/ProvidersTab';
import { RafflesTab } from './tabs/RafflesTab';
import { RolesTab } from './tabs/RolesTab';
import { SettingsTab } from './tabs/SettingsTab';
import { TicketsTab } from './tabs/TicketsTab';
import { TransactionsTab } from './tabs/TransactionsTab';
import { UsersTab } from './tabs/users/UsersTab';
import { VipTab } from './tabs/VipTab';
import { WithdrawalsTab } from './tabs/WithdrawalsTab';

export interface AdminTab {
  key: string;
  /** i18n key under admin.tabs.* */
  labelKey: string;
  icon: LucideIcon;
  perm: string;
  Component: ComponentType<{ me: AdminMe }>;
}

/** Each tab declares the permission that unlocks it (ADMIN sees all). */
export const TABS: AdminTab[] = [
  { key: 'dashboard', labelKey: 'admin.tabs.dashboard', icon: LayoutDashboard, perm: 'dashboard.view', Component: DashboardTab },
  { key: 'users', labelKey: 'admin.tabs.users', icon: UsersIcon, perm: 'users.view', Component: UsersTab },
  { key: 'roles', labelKey: 'admin.tabs.roles', icon: Shield, perm: 'roles.manage', Component: RolesTab },
  { key: 'deposits', labelKey: 'admin.tabs.deposits', icon: ArrowDownToLine, perm: 'deposits.manage', Component: DepositsTab },
  { key: 'withdrawals', labelKey: 'admin.tabs.withdrawals', icon: ArrowUpFromLine, perm: 'withdrawals.manage', Component: WithdrawalsTab },
  { key: 'promo', labelKey: 'admin.tabs.promo', icon: Tag, perm: 'promo.manage', Component: PromoTab },
  { key: 'games', labelKey: 'admin.tabs.games', icon: Gamepad2, perm: 'games.manage', Component: GamesTab },
  { key: 'providers', labelKey: 'admin.tabs.providers', icon: Plug, perm: 'providers.manage', Component: ProvidersTab },
  { key: 'bonuses', labelKey: 'admin.tabs.bonuses', icon: Gift, perm: 'bonuses.manage', Component: BonusesTab },
  { key: 'raffles', labelKey: 'admin.tabs.raffles', icon: PartyPopper, perm: 'raffles.manage', Component: RafflesTab },
  { key: 'vip', labelKey: 'admin.tabs.vip', icon: Crown, perm: 'vip.manage', Component: VipTab },
  { key: 'currencies', labelKey: 'admin.tabs.currencies', icon: Coins, perm: 'currencies.manage', Component: CurrenciesTab },
  { key: 'broadcast', labelKey: 'admin.tabs.broadcast', icon: Megaphone, perm: 'notifications.send', Component: BroadcastTab },
  { key: 'tickets', labelKey: 'admin.tabs.tickets', icon: LifeBuoy, perm: 'tickets.manage', Component: TicketsTab },
  { key: 'chat', labelKey: 'admin.tabs.chat', icon: MessagesSquare, perm: 'chat.moderate', Component: ChatTab },
  { key: 'transactions', labelKey: 'admin.tabs.transactions', icon: Receipt, perm: 'transactions.view', Component: TransactionsTab },
  { key: 'content', labelKey: 'admin.tabs.content', icon: FileText, perm: 'content.manage', Component: ContentTab },
  { key: 'settings', labelKey: 'admin.tabs.settings', icon: SettingsIcon, perm: 'settings.manage', Component: SettingsTab },
  { key: 'audit', labelKey: 'admin.tabs.audit', icon: ScrollText, perm: 'audit.view', Component: AuditTab },
];
