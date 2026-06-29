/** Staff roles that may reach the admin panel (the panel gates features by permission). */
export const STAFF_ROLES = ['ADMIN', 'MODERATOR', 'SUPPORT'];

export const isStaff = (role?: string) => STAFF_ROLES.includes(role ?? '');

/** Default username colour (lav) when no role/VIP colour applies. */
export const DEFAULT_NAME_COLOR = '#B79CED';

/** Distinct name colours so staff/partners stand out in chat. Hex values come
 *  from the design palette (tailwind.config). Regular players fall through to
 *  their VIP-level colour. */
const ROLE_COLORS: Record<string, string> = {
  ADMIN: '#E5484D', // roul.red
  MODERATOR: '#7CC4FF', // sky
  SUPPORT: '#7EE7C7', // mint
  PARTNER: '#FFD86E', // sun
};

/** Short tag shown beside staff/partner names in chat. */
export const ROLE_TAGS: Record<string, string> = {
  ADMIN: 'admin',
  MODERATOR: 'mod',
  SUPPORT: 'staff',
  PARTNER: 'partner',
};

/**
 * One shared resolver for a username colour (chat, leaderboards, …): staff and
 * partners get their role colour; everyone else gets their VIP-level colour
 * (map from /vip/levels). Returns a hex string — never undefined — so callers
 * can always apply it directly.
 */
export function nameColor(
  user: { role?: string; vipLevel?: number },
  vipColors?: Record<number, string>,
): string {
  if (user.role && ROLE_COLORS[user.role]) return ROLE_COLORS[user.role];
  if (user.vipLevel != null && vipColors?.[user.vipLevel]) return vipColors[user.vipLevel];
  return DEFAULT_NAME_COLOR;
}
