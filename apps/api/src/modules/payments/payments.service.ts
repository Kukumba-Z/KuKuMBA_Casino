import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { D } from '../../common/utils/money';
import { SettingsService } from '../../config/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletService } from '../wallet/wallet.service';
import { PAYMENT_PROVIDER, PaymentProvider } from './providers/provider.interface';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private settings: SettingsService,
    private notifications: NotificationsService,
    @Inject(PAYMENT_PROVIDER) private provider: PaymentProvider,
  ) {}

  private async realCurrency(code: string) {
    const cur = await this.prisma.currency.findUnique({ where: { code } });
    if (!cur || !cur.enabled || cur.type === 'DEMO') {
      throw new BadRequestException('CURRENCY_NOT_AVAILABLE');
    }
    return cur;
  }

  // ── Deposits ──────────────────────────────────────────────────────────────
  async createDeposit(userId: string, dto: { currency: string; network?: string; amount: string }) {
    const cur = await this.realCurrency(dto.currency);
    if (cur.type === 'CRYPTO' && (!dto.network || !cur.networks.includes(dto.network))) {
      throw new BadRequestException('INVALID_NETWORK');
    }
    const amount = D(dto.amount);
    if (amount.lte(0)) throw new BadRequestException('BAD_AMOUNT');
    if (cur.minDeposit && amount.lt(cur.minDeposit)) throw new BadRequestException('BELOW_MIN_DEPOSIT');

    const res = await this.provider.createDeposit({
      userId,
      currency: dto.currency,
      network: dto.network,
      amount: dto.amount,
    });

    return this.prisma.deposit.create({
      data: {
        userId,
        currency: dto.currency,
        network: dto.network,
        amount,
        address: res.address,
        provider: this.provider.name,
        status: 'PENDING',
        meta: { reference: res.reference, expiresAt: res.expiresAt, ...res.meta },
      },
    });
  }

  listDeposits(userId: string) {
    return this.prisma.deposit.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** Credit a deposit. Sandbox self-confirm is allowed only for the mock provider. */
  async confirmDeposit(depositId: string, opts: { byAdmin?: boolean; actorUserId?: string }) {
    const dep = await this.prisma.deposit.findUnique({ where: { id: depositId } });
    if (!dep) throw new NotFoundException('DEPOSIT_NOT_FOUND');
    if (!opts.byAdmin && dep.userId !== opts.actorUserId) throw new ForbiddenException();
    if (!opts.byAdmin && dep.provider !== 'mock') throw new BadRequestException('CANNOT_SELF_CONFIRM');
    if (dep.status === 'COMPLETED') return dep;

    await this.prisma.$transaction(async (tx) => {
      await tx.deposit.update({ where: { id: dep.id }, data: { status: 'COMPLETED' } });
      await this.wallet.apply(tx, {
        userId: dep.userId,
        type: 'DEPOSIT',
        currency: dep.currency,
        mode: 'REAL',
        amount: D(dep.amount),
        refType: 'deposit',
        refId: dep.id,
        description: `Deposit ${dep.currency}`,
      });
    });

    await this.notifications.notify(dep.userId, {
      type: 'DEPOSIT',
      titleRu: 'Депозит зачислен',
      titleEn: 'Deposit credited',
      bodyRu: `${dep.amount.toFixed()} ${dep.currency} зачислено на ваш баланс.`,
      bodyEn: `${dep.amount.toFixed()} ${dep.currency} has been credited.`,
    });
    return this.prisma.deposit.findUnique({ where: { id: dep.id } });
  }

  // ── Withdrawals ───────────────────────────────────────────────────────────
  async createWithdrawal(
    userId: string,
    dto: { currency: string; network?: string; amount: string; address: string },
  ) {
    const cur = await this.realCurrency(dto.currency);
    if (cur.type === 'CRYPTO' && (!dto.network || !cur.networks.includes(dto.network))) {
      throw new BadRequestException('INVALID_NETWORK');
    }
    const amount = D(dto.amount);
    if (amount.lte(0)) throw new BadRequestException('BAD_AMOUNT');
    if (cur.minWithdrawal && amount.lt(cur.minWithdrawal)) {
      throw new BadRequestException('BELOW_MIN_WITHDRAWAL');
    }
    if (!dto.address || dto.address.length < 4) throw new BadRequestException('BAD_ADDRESS');

    const requireKyc = !!(await this.settings.get('payments.requireKycForWithdrawal', false));
    if (requireKyc) {
      const u = await this.prisma.user.findUnique({ where: { id: userId } });
      if (u?.kycStatus !== 'VERIFIED') throw new ForbiddenException('KYC_REQUIRED');
    }

    const fee = D(await this.settings.get(`payments.withdrawalFee.${dto.currency}`, 0));
    const total = amount.plus(fee);

    const withdrawal = await this.prisma.$transaction(async (tx) => {
      const w = await tx.withdrawal.create({
        data: {
          userId,
          currency: dto.currency,
          network: dto.network,
          amount,
          fee,
          address: dto.address,
          provider: this.provider.name,
          status: 'PENDING',
        },
      });
      // hold the funds immediately (refunded on rejection)
      await this.wallet.apply(tx, {
        userId,
        type: 'WITHDRAWAL',
        currency: dto.currency,
        mode: 'REAL',
        amount: total.neg(),
        refType: 'withdrawal',
        refId: w.id,
        description: `Withdrawal request ${dto.currency}`,
      });
      return w;
    });

    await this.notifications.notify(userId, {
      type: 'WITHDRAWAL',
      titleRu: 'Заявка на вывод создана',
      titleEn: 'Withdrawal requested',
      bodyRu: `Вывод ${amount.toFixed()} ${dto.currency} на рассмотрении.`,
      bodyEn: `Withdrawal of ${amount.toFixed()} ${dto.currency} is under review.`,
    });

    // Optional auto-approval (handy for sandbox demos).
    if (await this.settings.get('payments.autoApproveWithdrawals', false)) {
      return this.approveWithdrawal('system', withdrawal.id);
    }
    return withdrawal;
  }

  listWithdrawals(userId: string) {
    return this.prisma.withdrawal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async approveWithdrawal(adminId: string, id: string) {
    const w = await this.prisma.withdrawal.findUnique({ where: { id } });
    if (!w) throw new NotFoundException('WITHDRAWAL_NOT_FOUND');
    if (!['PENDING', 'APPROVED', 'PROCESSING'].includes(w.status)) {
      throw new BadRequestException('NOT_PENDING');
    }
    await this.prisma.withdrawal.update({ where: { id }, data: { status: 'PROCESSING' } });
    const res = await this.provider.createWithdrawal({
      userId: w.userId,
      currency: w.currency,
      network: w.network ?? undefined,
      amount: w.amount.toFixed(),
      address: w.address,
    });
    const updated = await this.prisma.withdrawal.update({
      where: { id },
      data: {
        status: res.status === 'COMPLETED' ? 'COMPLETED' : 'PROCESSING',
        txHash: res.txHash,
        reviewedById: adminId,
        reviewedAt: new Date(),
        meta: res.meta,
      },
    });
    await this.notifications.notify(w.userId, {
      type: 'WITHDRAWAL',
      titleRu: 'Вывод обработан',
      titleEn: 'Withdrawal processed',
      bodyRu: `Вывод ${w.amount.toFixed()} ${w.currency} отправлен.`,
      bodyEn: `Your withdrawal of ${w.amount.toFixed()} ${w.currency} has been sent.`,
    });
    return updated;
  }

  async rejectWithdrawal(adminId: string, id: string, reason?: string) {
    const w = await this.prisma.withdrawal.findUnique({ where: { id } });
    if (!w) throw new NotFoundException('WITHDRAWAL_NOT_FOUND');
    if (!['PENDING', 'APPROVED', 'PROCESSING'].includes(w.status)) {
      throw new BadRequestException('NOT_PENDING');
    }
    await this.prisma.$transaction(async (tx) => {
      await this.wallet.apply(tx, {
        userId: w.userId,
        type: 'ROLLBACK',
        currency: w.currency,
        mode: 'REAL',
        amount: w.amount.plus(w.fee),
        refType: 'withdrawal',
        refId: w.id,
        description: 'Withdrawal refund',
      });
      await tx.withdrawal.update({
        where: { id },
        data: {
          status: 'REJECTED',
          reviewedById: adminId,
          reviewedAt: new Date(),
          meta: { reason },
        },
      });
    });
    await this.notifications.notify(w.userId, {
      type: 'WITHDRAWAL',
      titleRu: 'Вывод отклонён',
      titleEn: 'Withdrawal rejected',
      bodyRu: `Вывод ${w.amount.toFixed()} ${w.currency} отклонён, средства возвращены.`,
      bodyEn: `Your withdrawal of ${w.amount.toFixed()} ${w.currency} was rejected and refunded.`,
    });
    return { ok: true };
  }
}
