/**
 * Avatar presets — cute pastel tiles. We don't store an uploaded image yet
 * (custom upload lands in Phase 12 with the uploads module); instead the user
 * picks a preset whose key is persisted in `User.avatarUrl` as `preset:<key>`.
 * `avatarBg()` maps that token to a Tailwind tile gradient so the identity card
 * and (later) chat cards render consistently from one source of truth.
 */
export const AVATAR_PRESETS = [
  { key: 'holo', class: 'bg-holo' },
  { key: 'lav', class: 'bg-gradient-to-br from-lav to-sky' },
  { key: 'mint', class: 'bg-gradient-to-br from-mint to-sky' },
  { key: 'bubble', class: 'bg-gradient-to-br from-bubble to-lav' },
  { key: 'sun', class: 'bg-gradient-to-br from-sun to-bubble' },
  { key: 'night', class: 'bg-gradient-to-br from-surface-3 to-surface-2' },
] as const;

export type AvatarPresetKey = (typeof AVATAR_PRESETS)[number]['key'];

const DEFAULT_BG = 'bg-holo-soft';

/** Pull the preset key out of a stored avatarUrl token (`preset:<key>`). */
export function avatarPresetKey(avatarUrl?: string | null): AvatarPresetKey | null {
  if (!avatarUrl || !avatarUrl.startsWith('preset:')) return null;
  const key = avatarUrl.slice('preset:'.length);
  return AVATAR_PRESETS.some((p) => p.key === key) ? (key as AvatarPresetKey) : null;
}

/** Tailwind background class for the identity tile, from a stored avatarUrl. */
export function avatarBg(avatarUrl?: string | null): string {
  const key = avatarPresetKey(avatarUrl);
  return AVATAR_PRESETS.find((p) => p.key === key)?.class ?? DEFAULT_BG;
}
