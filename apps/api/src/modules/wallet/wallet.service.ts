import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, TransactionType, WalletMode } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { D, ZERO } from '../../common/utils/money';

export interface LedgerInput {
  userId: string;
  type: TransactionType;
  currency: string;
  mode: WalletMode;
  /** Signed amount: positive = credit (money in), negative = debit (money out). */
  amount: Prisma.Decimal.Value;
  refType?: string;
  refId?: string;
  description?: string;
  meta?: any;
  /** Permit the balance to go below zero (admin adjustments only). */
  allowNegative?: boolean;
}

type Tx = Prisma.TransactionClient;

/**
 * The wallet is a single-entry, append-only ledger. Every balance mutation is
 * recorded as an immutable Transaction with before/after snapshots, so balances
 * are fully auditable and reconcilable. Rows are locked FOR UPDATE to stay
 * correct under concurrency.
 */
@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  /** Run a function inside a DB transaction (compose multiple ledger ops atomically). */
  runInTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  /** Apply one ledger entry within an existing transaction. */
  async apply(tx: Tx, input: LedgerInput) {
    const delta = D(input.amount);
    const bal = await tx.balance.upsert({
      where: {
        userId_currency_mode: { userId: input.userId, currency: input.currency, mode: input.mode },
      },
      create: { userId: input.userId, currency: input.currency, mode: input.mode, amount: 0, locked: 0 },
      update: {},
    });

    // Lock the row for the rest of the transaction, then re-read the authoritative amount.
    await tx.$queryRawUnsafe('SELECT 1 FROM "Balance" WHERE id = $1 FOR UPDATE', bal.id);
    const locked = await tx.balance.findUnique({ where: { id: bal.id } });

    const before = D(locked.amount);
    const after = before.plus(delta);
    if (after.lt(0) && !input.allowNegative) {
      throw new BadRequestException('INSUFFICIENT_FUNDS');
    }

    await tx.balance.update({ where: { id: bal.id }, data: { amount: after } });

    return tx.transaction.create({
      data: {
        userId: input.userId,
        type: input.type,
        direction: delta.gte(0) ? 'CREDIT' : 'DEBIT',
        currency: input.currency,
        mode: input.mode,
        amount: delta.abs(),
        balanceBefore: before,
        balanceAfter: after,
        refType: input.refType,
        refId: input.refId,
        description: input.description,
        meta: input.meta,
      },
    });
  }

  /** Convenience: apply a single ledger entry in its own transaction. */
  applyStandalone(input: LedgerInput) {
    return this.runInTx((tx) => this.apply(tx, input));
  }

  /**
   * Grant 10,000 demo coins — but only when the player's demo balance is empty.
   * Demo is for trying games, not an infinite faucet. The balance row is locked
   * FOR UPDATE before the check so concurrent claims can't both succeed.
   */
  async demoTopup(userId: string) {
    const DEMO = 'DEMO';
    return this.runInTx(async (tx) => {
      const bal = await tx.balance.upsert({
        where: { userId_currency_mode: { userId, currency: DEMO, mode: 'DEMO' } },
        create: { userId, currency: DEMO, mode: 'DEMO', amount: 0, locked: 0 },
        update: {},
      });
      await tx.$queryRawUnsafe('SELECT 1 FROM "Balance" WHERE id = $1 FOR UPDATE', bal.id);
      const locked = await tx.balance.findUnique({ where: { id: bal.id } });
      if (D(locked.amount).gt(0)) throw new BadRequestException('DEMO_BALANCE_NOT_EMPTY');

      await this.apply(tx, {
        userId,
        type: 'BONUS',
        currency: DEMO,
        mode: 'DEMO',
        amount: 10000,
        refType: 'demo-topup',
        description: 'Demo coins top-up',
      });
      return { ok: true, amount: '10000' };
    });
  }

  /**
   * Convert one real fiat balance into another at the cross-rate derived from each
   * currency's USD rate (e.g. deposit in USD, play in RUB). Demo coins and crypto
   * are not convertible. Both ledger legs share a refId so the pair is auditable.
   * Amounts are floored to each currency's precision, so conversion never mints money.
   */
  async convert(userId: string, fromCode: string, toCode: string, amountInput: string) {
    if (fromCode === toCode) throw new BadRequestException('CONVERT_SAME_CURRENCY');
    const [from, to] = await Promise.all([
      this.prisma.currency.findUnique({ where: { code: fromCode } }),
      this.prisma.currency.findUnique({ where: { code: toCode } }),
    ]);
    const isRealFiat = (c: typeof from): c is NonNullable<typeof from> =>
      !!c && c.enabled && c.type === 'FIAT';
    if (!isRealFiat(from) || !isRealFiat(to)) throw new BadRequestException('CONVERT_CURRENCY_INVALID');

    const amount = D(amountInput).toDecimalPlaces(from.decimals, Prisma.Decimal.ROUND_DOWN);
    if (amount.lte(0)) throw new BadRequestException('BAD_AMOUNT');
    // 1 `from` = from.usdRate USD; 1 `to` = to.usdRate USD ⇒ toAmount = amount·rateFrom/rateTo.
    const toAmount = amount
      .mul(from.usdRate)
      .div(to.usdRate)
      .toDecimalPlaces(to.decimals, Prisma.Decimal.ROUND_DOWN);
    if (toAmount.lte(0)) throw new BadRequestException('CONVERT_TOO_SMALL');

    const ref = randomUUID(); // links the debit + credit legs
    await this.runInTx(async (tx) => {
      await this.apply(tx, {
        userId,
        type: 'CONVERSION',
        currency: fromCode,
        mode: 'REAL',
        amount: amount.neg(),
        refType: 'convert',
        refId: ref,
        description: `Convert ${fromCode} → ${toCode}`,
        meta: { to: toCode, toAmount: toAmount.toFixed() },
      });
      await this.apply(tx, {
        userId,
        type: 'CONVERSION',
        currency: toCode,
        mode: 'REAL',
        amount: toAmount,
        refType: 'convert',
        refId: ref,
        description: `Convert ${fromCode} → ${toCode}`,
        meta: { from: fromCode, fromAmount: amount.toFixed() },
      });
    });

    return {
      from: fromCode,
      to: toCode,
      fromAmount: amount.toFixed(),
      toAmount: toAmount.toFixed(),
      rate: D(from.usdRate).div(to.usdRate).toFixed(),
    };
  }

  /** Current balances for a user (one row per currency × mode). */
  async balances(userId: string) {
    const rows = await this.prisma.balance.findMany({ where: { userId } });
    return rows.map((b) => ({
      currency: b.currency,
      mode: b.mode,
      amount: b.amount.toFixed(),
      locked: b.locked.toFixed(),
    }));
  }

  async balanceOf(userId: string, currency: string, mode: WalletMode): Promise<Prisma.Decimal> {
    const b = await this.prisma.balance.findUnique({
      where: { userId_currency_mode: { userId, currency, mode } },
    });
    return b ? D(b.amount) : ZERO;
  }

  /** Paginated ledger history. */
  async transactions(userId: string, opts: { limit?: number; cursor?: string; type?: TransactionType } = {}) {
    const limit = Math.min(opts.limit ?? 50, 200);
    return this.prisma.transaction.findMany({
      where: { userId, ...(opts.type ? { type: opts.type } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    });
  }
}
