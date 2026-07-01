import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { genPromoCode } from '../../common/utils/ids';
import { D } from '../../common/utils/money';
import { SettingsService } from '../../config/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { PermissionsService } from '../permissions/permissions.service';
import { RealtimeService } from '../realtime/realtime.service';
import { WalletService } from '../wallet/wallet.service';
import { BonusesService } from '../bonuses/bonuses.service';

/**
 * Accept RTP as a fraction (0.973) or a percentage (97.3) — both are common —
 * and validate the range, so a stray percentage can never silently break the
 * payout math.
 */
function normalizeRtp(raw: any): number {
  let n = Number(raw);
  if (!isFinite(n) || n <= 0) throw new BadRequestException('RTP_INVALID');
  if (n > 1) n = n / 100; // e.g. 97.3 → 0.973
  if (n <= 0 || n > 1) throw new BadRequestException('RTP_OUT_OF_RANGE');
  return Number(n.toFixed(4));
}

/**
 * The admin backend — a single, modular surface the admin SPA talks to. Every
 * mutating action writes an AuditLog entry so operator activity is traceable.
 */
@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private payments: PaymentsService,
    private settings: SettingsService,
    private notifications: NotificationsService,
    private realtime: RealtimeService,
    private permissions: PermissionsService,
    private bonuses: BonusesService,
  ) {}

  private audit(actorId: string, action: string, targetType?: string, targetId?: string, meta?: any) {
    return this.prisma.auditLog.create({
      data: { actorId, action, targetType, targetId, meta },
    });
  }

  async dashboard() {
    const [users, pendingDeposits, pendingWithdrawals, openRaffles, openTickets, rounds, kycPending] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.deposit.count({ where: { status: 'PENDING' } }),
        this.prisma.withdrawal.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } }),
        this.prisma.raffle.count({ where: { status: 'OPEN' } }),
        this.prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'PENDING'] } } }),
        this.prisma.gameRound.count(),
        this.prisma.user.count({ where: { kycStatus: 'PENDING' } }),
      ]);
    return { users, pendingDeposits, pendingWithdrawals, openRaffles, openTickets, rounds, kycPending };
  }

  // ── Users ────────────────────────────────────────────────────────────
  async listUsers(q?: string, skip = 0, take = 25) {
    const where: Prisma.UserWhereInput = q
      ? {
          OR: [
            { username: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            ...(Number.isInteger(+q) ? [{ accountId: +q }] : []),
          ],
        }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: Math.min(take, 100),
        select: {
          id: true,
          accountId: true,
          username: true,
          email: true,
          role: true,
          status: true,
          kycStatus: true,
          vipLevel: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total };
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { balances: true, kycCase: { include: { documents: true } } },
    });
    if (!user) throw new NotFoundException('USER_NOT_FOUND');
    const { passwordHash, twoFactorSecret, ...safe } = user as any;
    return safe;
  }

  async setUserStatus(adminId: string, id: string, status: UserStatus, reason?: string) {
    await this.prisma.user.update({ where: { id }, data: { status } });
    if (status === 'BANNED' || status === 'SUSPENDED') {
      // force the account offline immediately
      await this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await this.audit(adminId, 'user.status', 'user', id, { status, reason });
    await this.notifications.notify(id, {
      type: 'SYSTEM',
      titleRu: status === 'BANNED' ? 'Аккаунт заблокирован' : status === 'ACTIVE' ? 'Аккаунт восстановлен' : 'Статус аккаунта изменён',
      titleEn: status === 'BANNED' ? 'Account banned' : status === 'ACTIVE' ? 'Account restored' : 'Account status changed',
      bodyRu: reason ? `Причина: ${reason}` : `Новый статус: ${status}.`,
      bodyEn: reason ? `Reason: ${reason}` : `New status: ${status}.`,
    });
    return { ok: true };
  }

  /** Grant or revoke a user's access to bonuses, promocodes and cashback. */
  async setBonusAccess(adminId: string, id: string, allowed: boolean) {
    const user = await this.prisma.user.update({ where: { id }, data: { bonusAccess: allowed } });
    await this.audit(adminId, 'user.bonusAccess', 'user', id, { allowed });
    return { ok: true, bonusAccess: user.bonusAccess };
  }

  // ── Expanded user tools ───────────────────────────────────────────────
  async notifyUser(adminId: string, userId: string, dto: { titleRu: string; titleEn: string; bodyRu?: string; bodyEn?: string }) {
    if (!dto.titleRu || !dto.titleEn) throw new BadRequestException('TITLE_REQUIRED');
    await this.notifications.notify(userId, {
      type: 'SYSTEM',
      titleRu: dto.titleRu,
      titleEn: dto.titleEn,
      bodyRu: dto.bodyRu ?? '',
      bodyEn: dto.bodyEn ?? '',
    });
    await this.audit(adminId, 'user.notify', 'user', userId, { titleRu: dto.titleRu });
    return { ok: true };
  }

  /** Set a new password (random if omitted). Revokes sessions and returns the value once. */
  async resetUserPassword(adminId: string, userId: string, newPassword?: string) {
    const password = newPassword && newPassword.length >= 6 ? newPassword : randomBytes(6).toString('base64url');
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(password, 10) } });
    await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit(adminId, 'user.password_reset', 'user', userId);
    await this.notifications.notify(userId, {
      type: 'SYSTEM',
      titleRu: 'Пароль сброшен',
      titleEn: 'Password reset',
      bodyRu: 'Администратор сбросил ваш пароль. Войдите с новым паролем.',
      bodyEn: 'An admin reset your password. Sign in with the new one.',
    });
    return { password };
  }

  async updateUserAccount(adminId: string, userId: string, dto: { email?: string; username?: string; emailVerified?: boolean }) {
    const data: Prisma.UserUpdateInput = {};
    if (dto.email !== undefined) data.email = dto.email.trim().toLowerCase();
    if (dto.username !== undefined) data.username = dto.username.trim();
    if (dto.emailVerified !== undefined) data.emailVerified = dto.emailVerified;
    if (Object.keys(data).length === 0) return { ok: true };
    try {
      await this.prisma.user.update({ where: { id: userId }, data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('EMAIL_OR_USERNAME_TAKEN');
      }
      throw e;
    }
    await this.audit(adminId, 'user.edit', 'user', userId, { ...data });
    return { ok: true };
  }

  async listSessions(userId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, userAgent: true, ip: true, createdAt: true, lastUsedAt: true, expiresAt: true, revokedAt: true },
    });
    return sessions.map((s) => ({ ...s, active: !s.revokedAt && s.expiresAt > new Date() }));
  }

  async revokeSessions(adminId: string, userId: string) {
    const res = await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit(adminId, 'user.revoke_sessions', 'user', userId, { count: res.count });
    return { ok: true, count: res.count };
  }

  async userBets(userId: string, take = 25) {
    const bets = await this.prisma.bet.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 100),
      include: { round: { select: { outcome: true, outcomeColor: true } } },
    });
    return bets.map((b) => ({
      id: b.id,
      betType: b.betType,
      stake: b.stake.toFixed(),
      payout: b.payout.toFixed(),
      currency: b.currency,
      mode: b.mode,
      status: b.status,
      outcome: b.round?.outcome,
      color: b.round?.outcomeColor,
      createdAt: b.createdAt,
    }));
  }

  async setUserRole(adminId: string, id: string, role: UserRole) {
    if (!Object.values(UserRole).includes(role)) throw new BadRequestException('INVALID_ROLE');
    await this.prisma.user.update({ where: { id }, data: { role } });
    await this.audit(adminId, 'user.role', 'user', id, { role });
    return { ok: true };
  }

  // ── Roles & permissions (RBAC) ────────────────────────────────────────
  /** What the current operator is allowed to do — drives the admin SPA. */
  async operatorContext(user: { id: string; role: UserRole }) {
    return {
      role: user.role,
      isAdmin: user.role === UserRole.ADMIN,
      permissions: await this.permissions.allowedFor(user.role),
    };
  }

  permissionMatrix() {
    return this.permissions.matrix();
  }

  async setRolePermission(adminId: string, role: UserRole, permission: string, allowed: boolean) {
    const res = await this.permissions.setPermission(role, permission, allowed);
    await this.audit(adminId, 'permission.set', 'role', role, { permission, allowed });
    return res;
  }

  async adjustBalance(
    adminId: string,
    dto: { userId: string; currency: string; mode: 'DEMO' | 'REAL'; amount: string; reason?: string },
  ) {
    const tx = await this.wallet.applyStandalone({
      userId: dto.userId,
      type: 'ADMIN_ADJUST',
      currency: dto.currency,
      mode: dto.mode as any,
      amount: D(dto.amount),
      allowNegative: true,
      refType: 'admin',
      description: dto.reason || 'Manual adjustment',
    });
    await this.audit(adminId, 'balance.adjust', 'user', dto.userId, dto);
    await this.notifications.notify(dto.userId, {
      type: 'SYSTEM',
      titleRu: 'Корректировка баланса',
      titleEn: 'Balance adjustment',
      bodyRu: `Администратор изменил ваш баланс: ${dto.amount} ${dto.currency}.`,
      bodyEn: `An admin adjusted your balance by ${dto.amount} ${dto.currency}.`,
    });
    return tx;
  }

  async reviewKyc(adminId: string, userId: string, approve: boolean, note?: string) {
    const status = approve ? 'VERIFIED' : 'REJECTED';
    await this.prisma.$transaction([
      this.prisma.kycCase.updateMany({
        where: { userId },
        data: { status, reviewerId: adminId, reviewNote: note, reviewedAt: new Date() },
      }),
      this.prisma.user.update({ where: { id: userId }, data: { kycStatus: status } }),
    ]);
    await this.audit(adminId, 'kyc.review', 'user', userId, { approve, note });
    await this.notifications.notify(userId, {
      type: 'KYC',
      titleRu: approve ? 'KYC подтверждён' : 'KYC отклонён',
      titleEn: approve ? 'KYC approved' : 'KYC rejected',
      bodyRu: approve ? 'Верификация пройдена.' : `Причина: ${note || '—'}`,
      bodyEn: approve ? 'Your identity is verified.' : `Reason: ${note || '—'}`,
    });
    return { ok: true };
  }

  async setVip(adminId: string, userId: string, level: number, xp?: number) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { vipLevel: level, ...(xp !== undefined ? { vipXp: xp } : {}) },
    });
    await this.audit(adminId, 'user.vip', 'user', userId, { level, xp });
    return { ok: true };
  }

  // ── Payments ────────────────────────────────────────────────────────
  listDeposits(status?: string) {
    return this.prisma.deposit.findMany({
      where: status ? { status: status as any } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { username: true, accountId: true } } },
    });
  }

  async confirmDeposit(adminId: string, id: string) {
    const res = await this.payments.confirmDeposit(id, { byAdmin: true });
    await this.audit(adminId, 'deposit.confirm', 'deposit', id);
    return res;
  }

  listWithdrawals(status?: string) {
    return this.prisma.withdrawal.findMany({
      where: status ? { status: status as any } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { username: true, accountId: true } } },
    });
  }

  async approveWithdrawal(adminId: string, id: string) {
    const res = await this.payments.approveWithdrawal(adminId, id);
    await this.audit(adminId, 'withdrawal.approve', 'withdrawal', id);
    return res;
  }

  async rejectWithdrawal(adminId: string, id: string, reason?: string) {
    const res = await this.payments.rejectWithdrawal(adminId, id, reason);
    await this.audit(adminId, 'withdrawal.reject', 'withdrawal', id, { reason });
    return res;
  }

  // ── Promo codes ────────────────────────────────────────────────
  listPromocodes() {
    return this.prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async createPromocode(adminId: string, dto: any) {
    const code = (dto.code || genPromoCode()).toUpperCase();
    const promo = await this.prisma.promoCode.create({
      data: {
        code,
        type: dto.type ?? 'BALANCE',
        currency: dto.currency ?? 'DEMO',
        amount: D(dto.amount ?? 0),
        bonusKey: dto.bonusKey,
        vipXp: dto.vipXp,
        mode: dto.mode ?? (dto.currency && dto.currency !== 'DEMO' ? 'REAL' : 'DEMO'),
        maxRedemptions: dto.maxRedemptions ?? null,
        perUserLimit: dto.perUserLimit ?? 1,
        requiresDeposit: !!dto.requiresDeposit,
        depositWithinDays: dto.depositWithinDays ? Number(dto.depositWithinDays) : null,
        minDeposit: dto.minDeposit ? D(dto.minDeposit) : null,
        wagerMultiplier: dto.wagerMultiplier ? Number(dto.wagerMultiplier) : 0,
        sticky: dto.sticky ?? true,
        maxCashoutMultiplier: dto.maxCashoutMultiplier ? Number(dto.maxCashoutMultiplier) : null,
        maxCashout: dto.maxCashout ? D(dto.maxCashout) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        enabled: dto.enabled ?? true,
      },
    });
    await this.audit(adminId, 'promo.create', 'promo', promo.id, { code });
    return promo;
  }

  async updatePromocode(adminId: string, id: string, dto: any) {
    const data: any = {};
    for (const k of ['enabled', 'maxRedemptions', 'perUserLimit', 'vipXp', 'requiresDeposit', 'depositWithinDays', 'wagerMultiplier', 'sticky', 'maxCashoutMultiplier']) if (dto[k] !== undefined) data[k] = dto[k];
    if (dto.amount !== undefined) data.amount = D(dto.amount);
    if (dto.minDeposit !== undefined) data.minDeposit = dto.minDeposit ? D(dto.minDeposit) : null;
    if (dto.maxCashout !== undefined) data.maxCashout = dto.maxCashout ? D(dto.maxCashout) : null;
    if (dto.expiresAt !== undefined) data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    const promo = await this.prisma.promoCode.update({ where: { id }, data });
    await this.audit(adminId, 'promo.update', 'promo', id, dto);
    return promo;
  }

  // ── Bonuses ──────────────────────────────────────────────────────────
  listBonuses() {
    return this.prisma.bonus.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async upsertBonus(adminId: string, dto: any) {
    const data = {
      name: dto.name,
      type: dto.type ?? 'NO_DEPOSIT',
      currency: dto.currency ?? 'DEMO',
      amount: D(dto.amount ?? 0),
      percent: dto.percent ?? null,
      maxAmount: dto.maxAmount ? D(dto.maxAmount) : null,
      wagerMultiplier: dto.wagerMultiplier ?? 0,
      minDeposit: dto.minDeposit ? D(dto.minDeposit) : null,
      requiresDeposit: !!dto.requiresDeposit,
      depositWithinDays: dto.depositWithinDays ? Number(dto.depositWithinDays) : null,
      sticky: dto.sticky ?? true,
      maxCashoutMultiplier: dto.maxCashoutMultiplier ? Number(dto.maxCashoutMultiplier) : null,
      maxCashout: dto.maxCashout ? D(dto.maxCashout) : null,
      enabled: dto.enabled ?? true,
      descriptionRu: dto.descriptionRu,
      descriptionEn: dto.descriptionEn,
    };
    const bonus = await this.prisma.bonus.upsert({
      where: { key: dto.key },
      create: { key: dto.key, ...data },
      update: data,
    });
    await this.audit(adminId, 'bonus.upsert', 'bonus', bonus.id, { key: dto.key });
    return bonus;
  }

  /**
   * Grant a one-off personal bonus to a single user (no catalog row needed).
   * Routes through the shared wagering engine so sticky/cashout/wager all apply.
   */
  async grantUserBonus(adminId: string, userId: string, dto: any) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('USER_NOT_FOUND');
    const currency = dto.currency || 'USD';
    const amount = D(dto.amount ?? 0);
    if (amount.lte(0)) throw new BadRequestException('BAD_AMOUNT');
    await this.wallet.runInTx((tx) =>
      this.bonuses.grantBonus(tx, {
        userId,
        name: dto.name || 'Personal bonus',
        amount,
        currency,
        mode: currency === 'DEMO' ? 'DEMO' : 'REAL',
        wagerMultiplier: Number(dto.wagerMultiplier) || 0,
        sticky: dto.sticky ?? true,
        maxCashout: dto.maxCashout ? D(dto.maxCashout) : null,
        maxCashoutMultiplier: dto.maxCashoutMultiplier ? Number(dto.maxCashoutMultiplier) : null,
        refType: 'admin-grant',
        description: dto.name || 'Personal bonus',
      }),
    );
    await this.audit(adminId, 'bonus.grant', 'user', userId, { name: dto.name, amount: amount.toFixed(), currency });
    await this.notifications.notify(userId, {
      type: 'BONUS',
      titleRu: 'Начислен бонус',
      titleEn: 'Bonus granted',
      bodyRu: `Вам начислен бонус «${dto.name || 'Personal bonus'}».`,
      bodyEn: `You received the "${dto.name || 'Personal bonus'}" bonus.`,
    });
    return { ok: true };
  }

  // ── Games (catalog CRUD) ──────────────────────────────────────────────
  listGames() {
    return this.prisma.game.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  }

  async upsertGame(adminId: string, dto: any) {
    if (!dto.key) throw new BadRequestException('KEY_REQUIRED');
    const data = {
      name: dto.name ?? dto.key,
      type: dto.type ?? 'slots',
      category: dto.category ?? 'SLOTS',
      provider: dto.provider ?? 'KuKuMBA Originals',
      status: dto.status === 'COMING_SOON' ? 'COMING_SOON' : 'LIVE',
      route: dto.route || null,
      rtp: dto.rtp !== undefined && dto.rtp !== '' ? normalizeRtp(dto.rtp) : 0.97,
      minBet: D(dto.minBet ?? 0.1),
      maxBet: D(dto.maxBet ?? 100000),
      descriptionRu: dto.descriptionRu ?? null,
      descriptionEn: dto.descriptionEn ?? null,
      thumbnail: dto.thumbnail || null,
      sortOrder: dto.sortOrder !== undefined ? Number(dto.sortOrder) : 0,
      enabled: dto.enabled ?? true,
    };
    const game = await this.prisma.game.upsert({
      where: { key: dto.key },
      create: { key: dto.key, ...data },
      update: data,
    });
    await this.audit(adminId, 'game.upsert', 'game', game.id, { key: dto.key });
    return game;
  }

  /**
   * Partial update of a single game — only the provided fields change, so an
   * RTP tweak never resets the rest of the row (unlike upsert, which fills
   * missing fields with defaults). This is the authoritative RTP control:
   * roulette reads `game.rtp`, so a change here flows to the engine, payouts
   * and the in-game info/fairness panel.
   */
  async patchGame(adminId: string, key: string, dto: any) {
    const game = await this.prisma.game.findUnique({ where: { key } });
    if (!game) throw new NotFoundException('GAME_NOT_FOUND');
    const data: Prisma.GameUpdateInput = {};
    if (dto.rtp !== undefined && dto.rtp !== '') data.rtp = normalizeRtp(dto.rtp);
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.status !== undefined) data.status = dto.status === 'COMING_SOON' ? 'COMING_SOON' : 'LIVE';
    if (dto.minBet !== undefined && dto.minBet !== '') data.minBet = D(dto.minBet);
    if (dto.maxBet !== undefined && dto.maxBet !== '') data.maxBet = D(dto.maxBet);
    if (dto.enabled !== undefined) data.enabled = !!dto.enabled;
    if (dto.sortOrder !== undefined && dto.sortOrder !== '') data.sortOrder = Number(dto.sortOrder);
    if (Object.keys(data).length === 0) throw new BadRequestException('NO_FIELDS');
    const updated = await this.prisma.game.update({ where: { key }, data });
    await this.audit(adminId, 'game.patch', 'game', updated.id, { key, fields: Object.keys(data) });
    return updated;
  }

  async deleteGame(adminId: string, key: string) {
    const game = await this.prisma.game.findUnique({ where: { key } });
    if (!game) throw new NotFoundException('GAME_NOT_FOUND');
    const rounds = await this.prisma.gameRound.count({ where: { gameId: game.id } });
    if (rounds > 0) throw new BadRequestException('GAME_HAS_HISTORY_DISABLE_INSTEAD');
    await this.prisma.game.delete({ where: { key } });
    await this.audit(adminId, 'game.delete', 'game', game.id, { key });
    return { ok: true };
  }

  // ── Currencies ────────────────────────────────────────────────
  listCurrencies() {
    return this.prisma.currency.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async upsertCurrency(adminId: string, dto: any) {
    const data = {
      name: dto.name,
      type: dto.type,
      symbol: dto.symbol,
      decimals: dto.decimals ?? 2,
      networks: dto.networks ?? [],
      minDeposit: D(dto.minDeposit ?? 0),
      minWithdrawal: D(dto.minWithdrawal ?? 0),
      usdRate: D(dto.usdRate ?? 1),
      enabled: dto.enabled ?? true,
      sortOrder: dto.sortOrder ?? 0,
    };
    const cur = await this.prisma.currency.upsert({
      where: { code: dto.code },
      create: { code: dto.code, ...data },
      update: data,
    });
    await this.audit(adminId, 'currency.upsert', 'currency', cur.code);
    return cur;
  }

  // ── Settings ────────────────────────────────────────────────────
  listSettings() {
    return this.settings.all();
  }

  async setSetting(adminId: string, key: string, value: any) {
    const res = await this.settings.set(key, value);
    await this.audit(adminId, 'setting.set', 'setting', key, { value });
    return res;
  }

  // ── Content ──────────────────────────────────────────────────────────
  listContent() {
    return this.prisma.contentPage.findMany({ orderBy: [{ key: 'asc' }, { locale: 'asc' }] });
  }

  async upsertContent(adminId: string, dto: any) {
    const page = await this.prisma.contentPage.upsert({
      where: { key_locale: { key: dto.key, locale: dto.locale } },
      create: { key: dto.key, locale: dto.locale, title: dto.title, body: dto.body },
      update: { title: dto.title, body: dto.body },
    });
    await this.audit(adminId, 'content.upsert', 'content', `${dto.key}:${dto.locale}`);
    return page;
  }

  // ── Misc ────────────────────────────────────────────────────────────
  listTickets(status?: string) {
    return this.prisma.supportTicket.findMany({
      where: status ? { status: status as any } : {},
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: { user: { select: { username: true, accountId: true } } },
    });
  }

  async deleteChatMessage(adminId: string, id: string) {
    await this.prisma.chatMessage.update({ where: { id }, data: { deleted: true } });
    await this.audit(adminId, 'chat.delete', 'chat', id);
    this.realtime.emit('chat:deleted', { id });
    return { ok: true };
  }

  /** Recent chat messages (incl. deleted) with the author's id/accountId for moderation. */
  async listChat(room = 'global', take = 80) {
    const msgs = await this.prisma.chatMessage.findMany({
      where: { room },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 200),
      include: { user: { select: { accountId: true, chatMutedUntil: true } } },
    });
    return msgs.map((m) => ({
      id: m.id,
      room: m.room,
      userId: m.userId,
      accountId: m.user?.accountId,
      username: m.username,
      body: m.body,
      deleted: m.deleted,
      createdAt: m.createdAt,
      mutedUntil: m.user?.chatMutedUntil,
    }));
  }

  /** Mute a user in chat for N minutes (0 ⇒ unmute). */
  async muteUser(adminId: string, userId: string, minutes: number) {
    const until = minutes > 0 ? new Date(Date.now() + minutes * 60_000) : null;
    await this.prisma.user.update({ where: { id: userId }, data: { chatMutedUntil: until } });
    await this.audit(adminId, until ? 'chat.mute' : 'chat.unmute', 'user', userId, { minutes });
    await this.notifications.notify(userId, {
      type: 'SYSTEM',
      titleRu: until ? 'Чат ограничен' : 'Чат снова доступен',
      titleEn: until ? 'Chat restricted' : 'Chat restored',
      bodyRu: until ? `Вы не можете писать в чат до ${until.toLocaleString('ru')}.` : 'Ограничение чата снято.',
      bodyEn: until ? `You cannot post in chat until ${until.toISOString()}.` : 'Your chat restriction was lifted.',
    });
    return { ok: true, mutedUntil: until };
  }

  /**
   * Fan a single announcement out to every (optionally KYC-verified) user. We
   * persist with createMany for efficiency, then emit one global socket event so
   * connected clients refresh their bell without a per-user push storm.
   */
  async broadcast(
    adminId: string,
    dto: { titleRu: string; titleEn: string; bodyRu: string; bodyEn: string; onlyVerified?: boolean },
  ) {
    if (!dto.titleRu || !dto.titleEn) throw new BadRequestException('TITLE_REQUIRED');
    const where: Prisma.UserWhereInput = dto.onlyVerified ? { kycStatus: 'VERIFIED' } : {};
    const users = await this.prisma.user.findMany({ where, select: { id: true } });
    if (users.length > 0) {
      await this.prisma.notification.createMany({
        data: users.map((u) => ({
          userId: u.id,
          type: 'SYSTEM' as const,
          titleRu: dto.titleRu,
          titleEn: dto.titleEn,
          bodyRu: dto.bodyRu ?? '',
          bodyEn: dto.bodyEn ?? '',
        })),
      });
      this.realtime.emit('notification', { broadcast: true });
    }
    await this.audit(adminId, 'broadcast', 'notification', undefined, { count: users.length });
    return { count: users.length };
  }

  auditLog(take = 100) {
    return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: Math.min(take, 300) });
  }

  recentTransactions(take = 100) {
    return this.prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 300),
      include: { user: { select: { username: true, accountId: true } } },
    });
  }
}
