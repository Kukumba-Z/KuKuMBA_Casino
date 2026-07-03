import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Bell,
  Gift,
  IdCard,
  LifeBuoy,
  type LucideIcon,
  PartyPopper,
  ShieldAlert,
  Sparkles,
  Tag,
  Trophy,
  Users,
} from 'lucide-react';
import { useVipBadges } from '../lib/hooks';
import { VipEmblem } from './VipEmblem';

/** Per-type glyph + accent for a notification row (keys = NotificationType). */
const TYPES: Record<string, { icon: LucideIcon; className: string }> = {
  SYSTEM: { icon: Bell, className: 'text-white/50' },
  DEPOSIT: { icon: ArrowDownToLine, className: 'text-mint' },
  WITHDRAWAL: { icon: ArrowUpFromLine, className: 'text-sky' },
  WIN: { icon: Trophy, className: 'text-sun' },
  BONUS: { icon: Gift, className: 'text-lav' },
  PROMO: { icon: Tag, className: 'text-sun' },
  REFERRAL: { icon: Users, className: 'text-sky' },
  KYC: { icon: IdCard, className: 'text-mint' },
  RAFFLE: { icon: PartyPopper, className: 'text-bubble' },
  VIP: { icon: Sparkles, className: 'text-sun' },
  SUPPORT: { icon: LifeBuoy, className: 'text-sky' },
  SECURITY: { icon: ShieldAlert, className: 'text-roul-red' },
};

/**
 * The leading icon of a notification. VIP level-ups carry the reached level in
 * `data.level`, so they show that rank's SVG emblem in its colour; every other
 * type gets its themed glyph.
 */
export function NotificationIcon({ type, data, size = 16 }: { type?: string; data?: any; size?: number }) {
  const { data: badges } = useVipBadges();
  const level = type === 'VIP' ? Number(data?.level) : NaN;
  const badge = Number.isInteger(level) ? badges?.[level] : undefined;
  if (badge?.icon) {
    return <VipEmblem icon={badge.icon} color={badge.color} size={size} title={badge.name} />;
  }
  const def = TYPES[type ?? 'SYSTEM'] ?? TYPES.SYSTEM;
  const Icon = def.icon;
  return <Icon size={size} className={`shrink-0 ${def.className}`} />;
}
