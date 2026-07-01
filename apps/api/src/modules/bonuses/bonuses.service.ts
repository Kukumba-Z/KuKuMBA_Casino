import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BonusStatus, Prisma, WalletMode } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { D } from '../../common/utils/money';
import { SettingsService } from '../../config/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletService } from '../wallet/wallet.service';

type Tx = Prisma.TransactionClient;

// Default cap on promocode activations per user per rolling 30 days. 0/negative
// (or the admin clearing it) means "no monthly limit". Overridable via the
// AppSetting `promo.monthlyLimitPerUser`.
const MONTHLY_PROMO_DEFAULT = 5;

/** Statuses that still owe wagering — these lock withdrawals and keep progressing. */
export const WAGERING_STATUSES: BonusStatus[] = ['ACTIVE', 'WAGERING'];

@Injectable()
export class BonusesService {
  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private notifications: NotificationsService,
    private settings: SettingsService,
  ) {}

  /** Public catalog of available bonuses (REAL money only — demo is free). */
  catalog() {
    return this.prisma.bonus.findMany({
      where: { enabled: true, NOT: { currency: 'DEMO' } },
      orderBy: { createdAt: 'asc' },
    });
  }

  myBonuses(userId: string) {
    return this.prisma.userBonus.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ── Anti-abuse guards (shared by claim / promo / cashback) ──────────────────

  /** Throw if the user has been blocked from bonuses/promocodes by an admin. */
  async assertBonusAccess(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { bonusAccess: true } });
    if (u && u.bonusAccess === false) throw new BadRequestException('BONUS_ACCESS_BLOCKED');
  }

  /** Throw unless the user has at least one completed deposit. */
  async assertHasDeposit(userId: string) {
    const n = await this.prisma.deposit.count({ where: { userId, status: 'COMPLETED' } });
    if (n === 0) throw new BadRequestException('DEPOSIT_REQUIRED');
  }

  /** Throw if the user has hit the monthly promocode-activation cap. */
  async assertPromoMonthlyLimit(userId: string) {
    const limit = Number(await this.settings.get('promo.monthlyLimitPerUser', MONTHLY_PROMO_DEFAULT));
    if (!Number.isFinite(limit) || limit <= 0) return; // disabled
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const used = await this.prisma.promoRedemption.count({ where: { userId, createdAt: { gte: since } } });
    if (used >= limit) throw new BadRequestException('PROMO_MONTHLY_LIMIT');
  }

  // ── Grant + wagering engine ─────────────────────────────────────────────────

  /**
   * Create a UserBonus + credit its funds in one place, reused by claim, promo
   * redemption and deposit-match. A bonus with no wagering requirement is marked
   * COMPLETED immediately so it never locks withdrawals.
   */
  async grantBonus(
    tx: Tx,
    opts: {
      userId: string;
      bonusId?: string;
      name: string;
      amount: Prisma.Decimal;
      currency: string;
      mode: WalletMode;
      wagerMultiplier: number;
      refType: string;
      refId?: string;
      description: string;
    },
  ) {
    const required = opts.amount.mul(opts.wagerMultiplier || 0);
    const status: BonusStatus = required.gt(0) ? 'ACTIVE' : 'COMPLETED';
    await tx.userBonus.create({
      data: {
        userId: opts.userId,
        bonusId: opts.bonusId,
        name: opts.name,
        amount: opts.amount,
        currency: opts.currency,
        mode: opts.mode,
        wagerRequired: required,
        status,
      },
    });
    await this.wallet.apply(tx, {
      userId: opts.userId,
      type: 'BONUS',
      currency: opts.currency,
      mode: opts.mode,
      amount: opts.amount,
      refType: opts.refType,
      refId: opts.refId,
      description: opts.description,
    });
  }

  /**
   * Advance wagering after a REAL bet. Called from the game engine inside the bet
   * transaction (beside vip.addWager / referrals.onWager). Progresses the oldest
   * unfinished bonus in that currency; clears it when the requirement is met; and
   * marks every still-wagering bonus LOST if the balance was wiped out.
   * Returns names of bonuses that just completed / were lost, for notifications.
   */
  async onWager(
    tx: Tx,
    userId: string,
    currency: string,
    mode: WalletMode,
    stake: Prisma.Decimal,
  ): Promise<{ completed: string[]; lost: string[] }> {
    const events = { completed: [] as string[], lost: [] as string[] };
    if (mode !== 'REAL') return events; // demo play is free, never wagered

    const active = await tx.userBonus.findMany({
      where: { userId, currency, mode: 'REAL', status: { in: WAGERING_STATUSES } },
      orderBy: { createdAt: 'asc' },
    });
    if (!active.length) return events;

    // Progress the oldest unfinished bonus by this stake (one at a time, FIFO).
    const ub = active[0];
    const required = D(ub.wagerRequired);
    let progress = D(ub.wagerProgress).plus(stake);
    let status: BonusStatus = 'WAGERING';
    if (required.gt(0) && progress.gte(required)) {
      progress = required;
      status = 'COMPLETED';
    }
    await tx.userBonus.update({ where: { id: ub.id }, data: { wagerProgress: progress, status } });
    if (status === 'COMPLETED') events.completed.push(ub.name);

    // If the real balance is wiped out, any bonus still wagering is lost.
    const bal = await tx.balance.findUnique({
      where: { userId_currency_mode: { userId, currency, mode: 'REAL' } },
    });
    if (bal && D(bal.amount).lte(0)) {
      const stuck = await tx.userBonus.findMany({
        where: { userId, currency, mode: 'REAL', status: { in: WAGERING_STATUSES } },
      });
      for (const b of stuck) {
        await tx.userBonus.update({ where: { id: b.id }, data: { status: 'LOST' } });
        events.lost.push(b.name);
      }
    }
    return events;
  }

  /**
   * Auto-apply deposit-match bonuses when a deposit is credited. Called inside the
   * confirm-deposit transaction. DEPOSIT (welcome) bonuses apply once per user;
   * RELOAD bonuses apply on every qualifying deposit. Respects the per-user block
   * and minDeposit. amount = min(deposit × percent%, maxAmount) (or the flat amount).
   */
  async applyDepositBonuses(tx: Tx, userId: string, currency: string, deposit: Prisma.Decimal) {
    const u = await tx.user.findUnique({ where: { id: userId }, select: { bonusAccess: true } });
    if (u && u.bonusAccess === false) return;
    const bonuses = await tx.bonus.findMany({
      where: { enabled: true, currency, type: { in: ['DEPOSIT', 'RELOAD'] } },
    });
    for (const b of bonuses) {
      if (b.minDeposit && deposit.lt(D(b.minDeposit))) continue;
      if (b.type === 'DEPOSIT') {
        const already = await tx.userBonus.count({ where: { userId, bonusId: b.id } });
        if (already > 0) continue; // first-deposit match applies once
      }
      let amount = b.percent ? deposit.mul(b.percent).div(100) : D(b.amount);
      if (b.maxAmount && amount.gt(D(b.maxAmount))) amount = D(b.maxAmount);
      if (amount.lte(0)) continue;
      await this.grantBonus(tx, {
        userId,
        bonusId: b.id,
        name: b.name,
        amount,
        currency,
        mode: 'REAL',
        wagerMultiplier: b.wagerMultiplier,
        refType: 'deposit-bonus',
        refId: b.id,
        description: `Deposit bonus ${b.name}`,
      });
    }
  }

  /** Fire user notifications for bonuses that just cleared / were lost (post-commit). */
  notifyWagerEvents(userId: string, events: { completed: string[]; lost: string[] }) {
    for (const name of events.completed) {
      void this.notifications.notify(userId, {
        type: 'BONUS',
        titleRu: 'Бонус отыгран',
        titleEn: 'Bonus cleared',
        bodyRu: `Бонус «${name}» полностью отыгран — средства доступны к выводу.`,
        bodyEn: `The "${name}" bonus is fully wagered — funds are now withdrawable.`,
      });
    }
    for (const name of events.lost) {
      void this.notifications.notify(userId, {
        type: 'BONUS',
        titleRu: 'Бонус проигран',
        titleEn: 'Bonus lost',
        bodyRu: `Бонус «${name}» проигран.`,
        bodyEn: `The "${name}" bonus was lost.`,
      });
    }
  }

  // ── Claim (WELCOME / NO_DEPOSIT) ────────────────────────────────────────────

  async claim(userId: string, key: string) {
    const bonus = await this.prisma.bonus.findUnique({ where: { key } });
    if (!bonus || !bonus.enabled) throw new NotFoundException('BONUS_NOT_FOUND');
    if (!['NO_DEPOSIT', 'WELCOME'].includes(bonus.type)) {
      throw new BadRequestException('BONUS_NOT_CLAIMABLE'); // deposit/reload bonuses apply automatically
    }
    await this.assertBonusAccess(userId);
    if (bonus.requiresDeposit) await this.assertHasDeposit(userId);

    const existing = await this.prisma.userBonus.findFirst({ where: { userId, bonusId: bonus.id } });
    if (existing) throw new BadRequestException('ALREADY_CLAIMED');

    const amount = D(bonus.amount);
    const currency = bonus.currency;
    // Bonuses are REAL money only — a demo/unset currency means it's misconfigured.
    if (!currency || currency === 'DEMO') throw new BadRequestException('BONUS_NOT_CLAIMABLE');

    await this.prisma.$transaction((tx) =>
      this.grantBonus(tx, {
        userId,
        bonusId: bonus.id,
        name: bonus.name,
        amount,
        currency,
        mode: 'REAL',
        wagerMultiplier: bonus.wagerMultiplier,
        refType: 'bonus',
        refId: bonus.id,
        description: `Bonus ${bonus.name}`,
      }),
    );

    await this.notifications.notify(userId, {
      type: 'BONUS',
      titleRu: 'Бонус начислен',
      titleEn: 'Bonus credited',
      bodyRu: `Вы получили бонус «${bonus.name}».`,
      bodyEn: `You claimed the "${bonus.name}" bonus.`,
    });
    return { ok: true };
  }
}
