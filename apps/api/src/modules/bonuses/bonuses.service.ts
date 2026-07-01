import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Bonus, BonusStatus, Prisma, WalletMode } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { D, ZERO } from '../../common/utils/money';
import { SettingsService } from '../../config/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletService } from '../wallet/wallet.service';

type Tx = Prisma.TransactionClient;
type Dec = Prisma.Decimal;

// Default cap on promocode activations per user per rolling 30 days. 0/negative
// (or the admin clearing it) means "no monthly limit". Overridable via the
// AppSetting `promo.monthlyLimitPerUser`.
const MONTHLY_PROMO_DEFAULT = 5;

/** Statuses that still owe wagering — these lock withdrawals and keep progressing. */
export const WAGERING_STATUSES: BonusStatus[] = ['ACTIVE', 'WAGERING'];

/** Terminal states a player can never revive (used to drop the "claimed" block). */
export const TERMINAL_STATUSES: BonusStatus[] = ['LOST', 'EXPIRED', 'CANCELLED', 'FORFEITED'];

const min = (a: Dec, b: Dec) => (a.lt(b) ? a : b);
const max = (a: Dec, b: Dec) => (a.gt(b) ? a : b);

/** Deposit-eligibility terms shared by claim / promo (mirrors the raffle gate). */
export interface DepositTerms {
  requiresDeposit?: boolean;
  minDeposit?: Dec | null; // USD-equivalent minimum
  depositWithinDays?: number | null; // recent-deposit window
}

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

  /**
   * Deposit gate shared by promo redeem + bonus claim. A qualifying REAL deposit
   * must exist, optionally within `depositWithinDays`, and reach `minDeposit`
   * (USD-equivalent so a deposit in ANY currency counts). Mirrors the raffle gate.
   */
  async assertDepositEligible(userId: string, terms: DepositTerms) {
    if (!terms.requiresDeposit) return;
    const where: Prisma.DepositWhereInput = { userId, mode: 'REAL', status: 'COMPLETED' };
    if (terms.depositWithinDays) {
      where.createdAt = { gte: new Date(Date.now() - terms.depositWithinDays * 86_400_000) };
    }
    const fail = terms.depositWithinDays ? 'DEPOSIT_RECENT_REQUIRED' : 'DEPOSIT_REQUIRED';
    const byCurrency = await this.prisma.deposit.groupBy({ by: ['currency'], where, _max: { amount: true } });
    if (!byCurrency.length) throw new BadRequestException(fail);
    if (terms.minDeposit) {
      const rates = await this.usdRates();
      const ok = byCurrency.some((g) => {
        const m = g._max.amount;
        if (!m) return false;
        return D(m).mul(rates.get(g.currency) ?? ZERO).gte(terms.minDeposit!);
      });
      if (!ok) throw new BadRequestException(fail);
    }
  }

  /** Throw if the user has hit the monthly promocode-activation cap. */
  async assertPromoMonthlyLimit(userId: string) {
    const limit = Number(await this.settings.get('promo.monthlyLimitPerUser', MONTHLY_PROMO_DEFAULT));
    if (!Number.isFinite(limit) || limit <= 0) return; // disabled
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const used = await this.prisma.promoRedemption.count({ where: { userId, createdAt: { gte: since } } });
    if (used >= limit) throw new BadRequestException('PROMO_MONTHLY_LIMIT');
  }

  /** No stacking: refuse a new wagered bonus while one is still being wagered. */
  async assertNoActiveWager(userId: string) {
    const n = await this.prisma.userBonus.count({ where: { userId, status: { in: WAGERING_STATUSES } } });
    if (n > 0) throw new BadRequestException('BONUS_STACKING');
  }

  /** code → USD rate for every currency (used for cross-currency wager + gates). */
  private async usdRates(client: Tx | PrismaService = this.prisma): Promise<Map<string, Dec>> {
    const curs = await client.currency.findMany({ select: { code: true, usdRate: true } });
    return new Map(curs.map((c) => [c.code, c.usdRate]));
  }

  // ── Grant + wagering engine ─────────────────────────────────────────────────

  /**
   * Create a UserBonus + credit its funds in one place, reused by claim, promo
   * redemption, deposit-match and admin personal grants. A bonus with no wagering
   * requirement is marked COMPLETED immediately (never locks a withdrawal). The
   * cashout cap resolves the smaller of the absolute and the ×amount limits.
   */
  async grantBonus(
    tx: Tx,
    opts: {
      userId: string;
      bonusId?: string;
      name: string;
      amount: Dec;
      currency: string;
      mode: WalletMode;
      wagerMultiplier: number;
      sticky?: boolean;
      maxCashout?: Dec | null; // absolute cap
      maxCashoutMultiplier?: number | null; // ×amount cap
      baseline?: Dec; // player's own funds already present (deposit); shielded from caps
      credit?: boolean; // false = only attach the wager obligation (funds credited elsewhere)
      refType: string;
      refId?: string;
      description: string;
    },
  ) {
    const required = opts.amount.mul(opts.wagerMultiplier || 0);
    const status: BonusStatus = required.gt(0) ? 'ACTIVE' : 'COMPLETED';

    // Cashout cap only matters while there is a wager to clear.
    let cap: Dec | null = null;
    if (required.gt(0)) {
      if (opts.maxCashout != null) cap = D(opts.maxCashout);
      if (opts.maxCashoutMultiplier != null && opts.maxCashoutMultiplier > 0) {
        const m = opts.amount.mul(opts.maxCashoutMultiplier);
        cap = cap == null ? m : min(cap, m);
      }
    }

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
        sticky: required.gt(0) ? !!opts.sticky : false,
        maxCashout: cap,
        baseline: opts.baseline ?? ZERO,
      },
    });
    if (opts.credit === false) return; // funds already credited by the caller (e.g. cashback)
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
   * unfinished bonus in ANY currency — the stake is converted into the bonus
   * currency via USD rates, so a bonus taken in USD keeps clearing after the
   * player converts to another currency. On clearing, sticky/cashout terms settle
   * the balance. If the player's whole REAL balance (USD-normalised) is wiped
   * while wagering, the bonus is marked LOST. Returns names for notifications.
   */
  async onWager(
    tx: Tx,
    userId: string,
    playCurrency: string,
    mode: WalletMode,
    stake: Dec,
    playUsdRate: Dec | number,
  ): Promise<{ completed: string[]; lost: string[] }> {
    const events = { completed: [] as string[], lost: [] as string[] };
    if (mode !== 'REAL') return events; // demo play is free, never wagered

    const ub = await tx.userBonus.findFirst({
      where: { userId, mode: 'REAL', status: { in: WAGERING_STATUSES } },
      orderBy: { createdAt: 'asc' },
    });
    if (!ub) return events;

    const rates = await this.usdRates(tx);
    const rPlay = D(rates.get(playCurrency) ?? playUsdRate ?? 0);

    // Convert this stake into the bonus currency (1:1 if same currency).
    let contribution = stake;
    if (ub.currency !== playCurrency) {
      const rBonus = rates.get(ub.currency) ?? ZERO;
      contribution = rBonus.gt(0) ? stake.mul(rPlay).div(rBonus) : ZERO;
    }

    const required = D(ub.wagerRequired);
    let progress = D(ub.wagerProgress).plus(contribution);
    let status: BonusStatus = 'WAGERING';
    if (required.gt(0) && progress.gte(required)) {
      progress = required;
      status = 'COMPLETED';
    }
    await tx.userBonus.update({ where: { id: ub.id }, data: { wagerProgress: progress, status } });
    if (status === 'COMPLETED') {
      await this.settle(tx, ub, { forfeit: false });
      events.completed.push(ub.name);
    }

    // Wipe-out check: if the total REAL balance (USD-normalised) is ~0 while any
    // bonus is still wagering, it can no longer be cleared → LOST.
    const stuck = await tx.userBonus.findMany({ where: { userId, mode: 'REAL', status: { in: WAGERING_STATUSES } } });
    if (stuck.length) {
      const balances = await tx.balance.findMany({ where: { userId, mode: 'REAL' } });
      let totalUsd = ZERO;
      for (const b of balances) totalUsd = totalUsd.plus(D(b.amount).mul(rates.get(b.currency) ?? ZERO));
      if (totalUsd.lte(D('0.00000001'))) {
        for (const b of stuck) {
          await tx.userBonus.update({ where: { id: b.id }, data: { status: 'LOST' } });
          events.lost.push(b.name);
        }
      }
    }
    return events;
  }

  /**
   * Terminal settlement under the "real money spent first" model: the bonus
   * principal is the last money standing, so losses eat the player's own funds
   * before the bonus. When the principal is removed (always on cancel/`forfeit`;
   * on a sticky clear) the player keeps `current − principal`; winnings above
   * their own funds are then capped at `maxCashout`. The excess is debited from
   * the bonus-currency balance. Returns the removed amount (for notifications).
   */
  private async settle(tx: Tx, ub: { id: string; userId: string; currency: string; amount: Dec; baseline: Dec; sticky: boolean; maxCashout: Dec | null; name: string }, opts: { forfeit: boolean }): Promise<Dec> {
    const bal = await tx.balance.findUnique({
      where: { userId_currency_mode: { userId: ub.userId, currency: ub.currency, mode: 'REAL' } },
    });
    const current = bal ? D(bal.amount) : ZERO;
    if (current.lte(0)) return ZERO;

    const baseline = D(ub.baseline);
    const principal = D(ub.amount);
    const removePrincipal = opts.forfeit || ub.sticky;

    // Real money first: the bonus principal is the last money spent.
    let keep = removePrincipal ? max(current.minus(principal), ZERO) : current;
    // Cap winnings above the player's own funds (+ the bonus if it's cashable).
    if (ub.maxCashout != null) {
      const ceiling = baseline.plus(removePrincipal ? ZERO : principal).plus(D(ub.maxCashout));
      keep = min(keep, ceiling);
    }

    const debit = current.minus(keep);
    if (debit.gt(0)) {
      await this.wallet.apply(tx, {
        userId: ub.userId,
        type: 'BONUS',
        currency: ub.currency,
        mode: 'REAL',
        amount: debit.negated(),
        allowNegative: true,
        refType: opts.forfeit ? 'bonus-cancel' : 'bonus-settle',
        refId: ub.id,
        description: `Bonus ${opts.forfeit ? 'cancelled' : 'settled'} ${ub.name}`,
      });
    }
    return debit.gt(0) ? debit : ZERO;
  }

  /**
   * Player cancels a live bonus: forfeit it. Under "real money first" the bonus
   * principal is the last money standing, so the whole bonus is removed and the
   * player keeps their remaining real funds (e.g. deposit 1000 + 1000 bonus, lose
   * 500 → 1500, cancel → keep 500). The bonus is marked FORFEITED so it stops
   * locking withdrawals.
   */
  async cancelBonus(userId: string, id: string) {
    const ub = await this.prisma.userBonus.findFirst({ where: { id, userId } });
    if (!ub) throw new NotFoundException('BONUS_NOT_FOUND');
    if (!WAGERING_STATUSES.includes(ub.status)) throw new BadRequestException('BONUS_NOT_CANCELLABLE');

    await this.prisma.$transaction(async (tx) => {
      await this.settle(tx, ub, { forfeit: true });
      await tx.userBonus.update({ where: { id: ub.id }, data: { status: 'FORFEITED' } });
    });

    await this.notifications.notify(userId, {
      type: 'BONUS',
      titleRu: 'Бонус отменён',
      titleEn: 'Bonus cancelled',
      bodyRu: `Бонус «${ub.name}» отменён, бонусные средства списаны.`,
      bodyEn: `The "${ub.name}" bonus was cancelled; bonus funds were removed.`,
    });
    return { ok: true };
  }

  /**
   * The single deposit-match bonus that would apply to `deposit` in `currency`,
   * with its computed amount, or null. DEPOSIT (welcome) applies once per user;
   * RELOAD applies each qualifying deposit; both respect minDeposit.
   * amount = min(deposit × percent%, maxAmount) (or the flat amount).
   */
  private async pickDepositBonus(client: Tx | PrismaService, userId: string, currency: string, deposit: Dec): Promise<{ bonus: Bonus; amount: Dec } | null> {
    const bonuses = await client.bonus.findMany({
      where: { enabled: true, currency, type: { in: ['DEPOSIT', 'RELOAD'] } },
      orderBy: { createdAt: 'asc' },
    });
    for (const b of bonuses) {
      if (b.minDeposit && deposit.lt(D(b.minDeposit))) continue;
      if (b.type === 'DEPOSIT') {
        const already = await client.userBonus.count({ where: { userId, bonusId: b.id } });
        if (already > 0) continue; // first-deposit match applies once
      }
      let amount = b.percent ? deposit.mul(b.percent).div(100) : D(b.amount);
      if (b.maxAmount && amount.gt(D(b.maxAmount))) amount = D(b.maxAmount);
      if (amount.lte(0)) continue;
      return { bonus: b, amount };
    }
    return null;
  }

  /**
   * Preview shown before a deposit so the player knows exactly what they'll get
   * (percent/amount, total, wager, sticky, cashout cap) and can opt out. Returns
   * null when nothing applies; `blockedByWager` flags that it won't apply until
   * the current bonus is cleared (no stacking).
   */
  async depositOffer(userId: string, currency: string, amount: string) {
    const deposit = D(amount || 0);
    if (!currency || currency === 'DEMO' || deposit.lte(0)) return null;
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { bonusAccess: true } });
    if (u && u.bonusAccess === false) return null;
    const pick = await this.pickDepositBonus(this.prisma, userId, currency, deposit);
    if (!pick) return null;
    const { bonus: b, amount: bonusAmount } = pick;
    let cap = b.maxCashout ? D(b.maxCashout) : null;
    if (b.maxCashoutMultiplier && b.maxCashoutMultiplier > 0) {
      const m = bonusAmount.mul(b.maxCashoutMultiplier);
      cap = cap == null ? m : min(cap, m);
    }
    const active = await this.prisma.userBonus.count({ where: { userId, status: { in: WAGERING_STATUSES } } });
    return {
      name: b.name,
      percent: b.percent ?? null,
      currency,
      bonusAmount: bonusAmount.toFixed(),
      total: deposit.plus(bonusAmount).toFixed(),
      wagerMultiplier: b.wagerMultiplier,
      sticky: b.sticky,
      maxCashout: cap ? cap.toFixed() : null,
      blockedByWager: active > 0,
    };
  }

  /**
   * Auto-apply a deposit-match bonus when a deposit is credited. Called inside the
   * confirm-deposit transaction. Respects the per-user block, no-stacking and
   * minDeposit. The deposit itself becomes the `baseline` so cashout caps never
   * eat own money. Returns the granted bonus (for a notification), or null.
   */
  async applyDepositBonuses(tx: Tx, userId: string, currency: string, deposit: Dec) {
    const u = await tx.user.findUnique({ where: { id: userId }, select: { bonusAccess: true } });
    if (u && u.bonusAccess === false) return null;
    // No stacking: skip auto-apply while another bonus is still being wagered.
    const active = await tx.userBonus.count({ where: { userId, status: { in: WAGERING_STATUSES } } });
    if (active > 0) return null;
    const pick = await this.pickDepositBonus(tx, userId, currency, deposit);
    if (!pick) return null;
    const { bonus: b, amount } = pick;
    await this.grantBonus(tx, {
      userId,
      bonusId: b.id,
      name: b.name,
      amount,
      currency,
      mode: 'REAL',
      wagerMultiplier: b.wagerMultiplier,
      sticky: b.sticky,
      maxCashout: b.maxCashout,
      maxCashoutMultiplier: b.maxCashoutMultiplier,
      baseline: deposit, // own deposit is shielded from sticky/cashout
      refType: 'deposit-bonus',
      refId: b.id,
      description: `Deposit bonus ${b.name}`,
    });
    return { name: b.name, amount: amount.toFixed(), currency, wagerMultiplier: b.wagerMultiplier, sticky: b.sticky };
  }

  /** Fire user notifications for bonuses that just cleared / were lost (post-commit). */
  notifyWagerEvents(userId: string, events: { completed: string[]; lost: string[] }) {
    for (const name of events.completed) {
      void this.notifications.notify(userId, {
        type: 'BONUS',
        titleRu: 'Бонус отыгран',
        titleEn: 'Bonus cleared',
        bodyRu: `Бонус «${name}» полностью отыгран — выигрыш доступен к выводу.`,
        bodyEn: `The "${name}" bonus is fully wagered — winnings are now withdrawable.`,
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
    await this.assertNoActiveWager(userId); // no stacking
    await this.assertDepositEligible(userId, {
      requiresDeposit: bonus.requiresDeposit,
      minDeposit: bonus.minDeposit,
      depositWithinDays: bonus.depositWithinDays,
    });

    // Once per account: a bonus that ended (lost/cancelled/cleared) can't be re-claimed.
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
        sticky: bonus.sticky,
        maxCashout: bonus.maxCashout,
        maxCashoutMultiplier: bonus.maxCashoutMultiplier,
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
