import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BetStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { D } from '../../common/utils/money';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletService } from '../wallet/wallet.service';

/**
 * Admin bet reversal. Two distinct operations:
 *
 * - refund   — return the stake only. Allowed for LOST/PUSH bets (a WON bet
 *              keeps its payout, so refunding the stake on top would gift
 *              money — use rollback instead).
 * - rollback — undo the bet entirely: stake back AND the payout (if any)
 *              debited back. Allowed for WON/LOST/PUSH bets.
 *
 * Both flip the bet to VOID with an atomic compare-and-set, so a bet can be
 * reversed exactly once no matter how many concurrent clicks arrive. The
 * GameRound stays untouched — it is the immutable provably-fair record; the
 * reversal context lives on the ledger rows and the audit log.
 */
@Injectable()
export class BetsAdminService {
  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private notifications: NotificationsService,
  ) {}

  private async loadBet(betId: string) {
    const bet = await this.prisma.bet.findUnique({
      where: { id: betId },
      include: { game: { select: { name: true, key: true } } },
    });
    if (!bet) throw new NotFoundException('BET_NOT_FOUND');
    return bet;
  }

  async refund(betId: string, reason?: string) {
    const bet = await this.loadBet(betId);
    const allowed: BetStatus[] = ['LOST', 'PUSH'];
    if (bet.status === 'VOID') throw new BadRequestException('BET_ALREADY_REVERSED');
    if (!allowed.includes(bet.status)) throw new BadRequestException('BET_NOT_REFUNDABLE');

    const tx = await this.wallet.runInTx(async (tx) => {
      const claimed = await tx.bet.updateMany({
        where: { id: bet.id, status: { in: allowed } },
        data: { status: 'VOID' },
      });
      if (claimed.count === 0) throw new BadRequestException('BET_ALREADY_REVERSED');
      return this.wallet.apply(tx, {
        userId: bet.userId,
        type: 'REFUND',
        currency: bet.currency,
        mode: bet.mode,
        amount: D(bet.stake),
        refType: 'bet',
        refId: bet.id,
        description: `Bet refund: ${bet.game?.name ?? bet.betType}`,
        meta: { originalStatus: bet.status, stake: bet.stake.toFixed(), reason },
      });
    });

    await this.notifications.notify(bet.userId, {
      type: 'SYSTEM',
      titleRu: 'Ставка возвращена',
      titleEn: 'Bet refunded',
      bodyRu: `Ставка ${bet.stake.toFixed()} ${bet.currency} возвращена на баланс.`,
      bodyEn: `Your ${bet.stake.toFixed()} ${bet.currency} stake was refunded.`,
    });
    return { ok: true, ledgerTxId: tx.id };
  }

  async rollback(betId: string, reason?: string) {
    const bet = await this.loadBet(betId);
    const allowed: BetStatus[] = ['WON', 'LOST', 'PUSH'];
    if (bet.status === 'VOID') throw new BadRequestException('BET_ALREADY_REVERSED');
    if (!allowed.includes(bet.status)) throw new BadRequestException('BET_NOT_REVERSIBLE');
    const payout = D(bet.payout);

    await this.wallet.runInTx(async (tx) => {
      const claimed = await tx.bet.updateMany({
        where: { id: bet.id, status: { in: allowed } },
        data: { status: 'VOID' },
      });
      if (claimed.count === 0) throw new BadRequestException('BET_ALREADY_REVERSED');
      await this.wallet.apply(tx, {
        userId: bet.userId,
        type: 'ROLLBACK',
        currency: bet.currency,
        mode: bet.mode,
        amount: D(bet.stake),
        refType: 'bet',
        refId: bet.id,
        description: `Bet rollback (stake): ${bet.game?.name ?? bet.betType}`,
        meta: { originalStatus: bet.status, stake: bet.stake.toFixed(), payout: payout.toFixed(), reason },
      });
      if (payout.gt(0)) {
        // The player may have already spent the win — the reversal must not be
        // blockable by that, so the balance is allowed to go negative here.
        await this.wallet.apply(tx, {
          userId: bet.userId,
          type: 'ROLLBACK',
          currency: bet.currency,
          mode: bet.mode,
          amount: payout.neg(),
          allowNegative: true,
          refType: 'bet',
          refId: bet.id,
          description: `Bet rollback (payout): ${bet.game?.name ?? bet.betType}`,
          meta: { originalStatus: bet.status, stake: bet.stake.toFixed(), payout: payout.toFixed(), reason },
        });
        // A rolled-back win must not keep its leaderboard placement.
        await tx.leaderboardEntry.deleteMany({ where: { roundId: bet.roundId } });
      }
    });

    await this.notifications.notify(bet.userId, {
      type: 'SYSTEM',
      titleRu: 'Ставка отменена',
      titleEn: 'Bet rolled back',
      bodyRu: `Ставка отменена: стейк ${bet.stake.toFixed()} ${bet.currency} возвращён${payout.gt(0) ? `, выигрыш ${payout.toFixed()} ${bet.currency} списан` : ''}.`,
      bodyEn: `Bet rolled back: ${bet.stake.toFixed()} ${bet.currency} stake returned${payout.gt(0) ? `, ${payout.toFixed()} ${bet.currency} winnings reversed` : ''}.`,
    });
    return { ok: true };
  }
}
