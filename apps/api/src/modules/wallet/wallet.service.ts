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
