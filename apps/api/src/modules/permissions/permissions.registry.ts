import { UserRole } from '@prisma/client';

/**
 * The capability catalog. This is the *registry* of what the admin surface can
 * do — a structural list, not configurable data. Whether a given role may use a
 * capability is configurable (RolePermission table), but the set of capabilities
 * is fixed by the code that implements them.
 */
export interface PermissionDef {
  key: string;
  group: string;
  labelRu: string;
  labelEn: string;
}

export const PERMISSIONS = [
  // overview
  { key: 'dashboard.view', group: 'overview', labelRu: 'Дашборд и статистика', labelEn: 'Dashboard & stats' },
  // users
  { key: 'users.view', group: 'users', labelRu: 'Просмотр пользователей', labelEn: 'View users' },
  { key: 'users.ban', group: 'users', labelRu: 'Бан / разбан', labelEn: 'Ban / unban' },
  { key: 'users.edit', group: 'users', labelRu: 'Редактировать профиль / сброс пароля', labelEn: 'Edit profile / reset password' },
  { key: 'users.role', group: 'users', labelRu: 'Менять роли', labelEn: 'Change roles' },
  { key: 'users.vip', group: 'users', labelRu: 'Менять VIP', labelEn: 'Adjust VIP' },
  { key: 'kyc.review', group: 'users', labelRu: 'Проверка KYC', labelEn: 'Review KYC' },
  // finance
  { key: 'users.balance', group: 'finance', labelRu: 'Корректировка баланса', labelEn: 'Adjust balance' },
  { key: 'deposits.manage', group: 'finance', labelRu: 'Депозиты', labelEn: 'Deposits' },
  { key: 'withdrawals.manage', group: 'finance', labelRu: 'Выводы', labelEn: 'Withdrawals' },
  { key: 'transactions.view', group: 'finance', labelRu: 'Просмотр транзакций', labelEn: 'View transactions' },
  { key: 'currencies.manage', group: 'finance', labelRu: 'Валюты', labelEn: 'Currencies' },
  { key: 'bets.manage', group: 'finance', labelRu: 'Возврат / откат ставок', labelEn: 'Refund / rollback bets' },
  // games & engagement
  { key: 'games.manage', group: 'games', labelRu: 'Управление играми', labelEn: 'Manage games' },
  { key: 'providers.manage', group: 'games', labelRu: 'Провайдеры и агрегаторы', labelEn: 'Providers & aggregators' },
  { key: 'promo.manage', group: 'engagement', labelRu: 'Промокоды', labelEn: 'Promo codes' },
  { key: 'bonuses.manage', group: 'engagement', labelRu: 'Бонусы', labelEn: 'Bonuses' },
  { key: 'raffles.manage', group: 'engagement', labelRu: 'Розыгрыши', labelEn: 'Raffles' },
  { key: 'vip.manage', group: 'engagement', labelRu: 'VIP-уровни и кешбэк', labelEn: 'VIP levels & cashback' },
  { key: 'notifications.send', group: 'engagement', labelRu: 'Рассылки и уведомления', labelEn: 'Broadcasts & notifications' },
  // support & system
  { key: 'chat.moderate', group: 'support', labelRu: 'Модерация чата', labelEn: 'Moderate chat' },
  { key: 'tickets.manage', group: 'support', labelRu: 'Тикеты поддержки', labelEn: 'Support tickets' },
  { key: 'content.manage', group: 'system', labelRu: 'Контент-страницы', labelEn: 'Content pages' },
  { key: 'settings.manage', group: 'system', labelRu: 'Настройки платформы', labelEn: 'Platform settings' },
  { key: 'roles.manage', group: 'system', labelRu: 'Роли и права', labelEn: 'Roles & permissions' },
  { key: 'audit.view', group: 'system', labelRu: 'Журнал аудита', labelEn: 'Audit log' },
] as const satisfies readonly PermissionDef[];

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key) as PermissionKey[];

/** Non-admin roles whose grants are stored/editable. ADMIN is implicit-all. */
export const MANAGED_ROLES: UserRole[] = [UserRole.MODERATOR, UserRole.SUPPORT];

/** Roles allowed to reach the admin surface at all. */
export const STAFF_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.MODERATOR, UserRole.SUPPORT];

/**
 * Sensible, safe defaults seeded on first run (editable afterwards in the UI).
 * Finance / roles / settings stay ADMIN-only by default.
 */
export const DEFAULT_GRANTS: Record<string, PermissionKey[]> = {
  [UserRole.SUPPORT]: ['dashboard.view', 'users.view', 'kyc.review', 'tickets.manage', 'chat.moderate'],
  [UserRole.MODERATOR]: ['dashboard.view', 'users.view', 'users.ban', 'chat.moderate', 'tickets.manage'],
};
