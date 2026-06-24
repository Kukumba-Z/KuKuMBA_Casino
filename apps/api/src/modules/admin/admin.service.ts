import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { genPromoCode } from '../../common/utils/ids';
import { D } from '../../common/utils/money';
import { SettingsService } from '../../config/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { WalletService } from '../wallet/wallet.service';

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

  // ── Users ────────────────────────────────────────────────────────────────
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

  async setUserStatus(adminId: string, id: string, status: UserStatus) {
    await this.prisma.user.update({ where: { id }, data: { status } });
    await this.audit(adminId, 'user.status', 'user', id, { status });
    return { ok: true };
  }

  async setUserRole(adminId: string, id: string, role: UserRole) {
    await this.prisma.user.update({ where: { id }, data: { role } });
    await this.audit(adminId, 'user.role', 'user', id, { role });
    return { ok: true };
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
      titleRu: approve ? 'KYC подтверждён ✅' : 'KYC отклонён',
      titleEn: approve ? 'KYC approved ✅' : 'KYC rejected',
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

  // ── Payments ───────────────────────────────────────────────────────────────
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

  // ── Promo codes ──────────────────────────────────────────────────────────
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
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        enabled: dto.enabled ?? true,
      },
    });
    await this.audit(adminId, 'promo.create', 'promo', promo.id, { code });
    return promo;
  }

  async updatePromocode(adminId: string, id: string, dto: any) {
    const data: any = {};
    for (const k of ['enabled', 'maxRedemptions', 'perUserLimit', 'vipXp']) if (dto[k] !== undefined) data[k] = dto[k];
    if (dto.amount !== undefined) data.amount = D(dto.amount);
    if (dto.expiresAt !== undefined) data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    const promo = await this.prisma.promoCode.update({ where: { id }, data });
    await this.audit(adminId, 'promo.update', 'promo', id, dto);
    return promo;
  }

  // ── Bonuses ────────────────────────────────────────────────────────────────
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

  // ── Currencies ───────────────────────────────────────────────────────────
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

  // ── Settings ─────────────────────────────────────────────────────────────
  listSettings() {
    return this.settings.all();
  }

  async setSetting(adminId: string, key: string, value: any) {
    const res = await this.settings.set(key, value);
    await this.audit(adminId, 'setting.set', 'setting', key, { value });
    return res;
  }

  // ── Content ────────────────────────────────────────────────────────────────
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

  // ── Misc ─────────────────────────────────────────────────────────────────
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
    return { ok: true };
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
