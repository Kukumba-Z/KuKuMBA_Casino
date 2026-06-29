import { BadRequestException, Injectable } from '@nestjs/common';
import { WalletMode } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { tableMaxStake } from '../../../common/utils/bet-limits';
import { isOriginalGame } from '../../../common/utils/games';
import { D, roundTo } from '../../../common/utils/money';
import { SettingsService } from '../../../config/settings.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { rouletteResult } from '../../provably-fair/provably-fair.crypto';
import { ProvablyFairService } from '../../provably-fair/provably-fair.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { ReferralsService } from '../../referrals/referrals.service';
import { VipService } from '../../vip/vip.service';
import { WalletService } from '../../wallet/wallet.service';
import { BET_TYPES, BETS, colorOf } from './roulette.constants';
import { isWin, multiplierFor, validateBet } from './roulette.engine';

export interface PlaceBetInput {
  betType: string;
  selection?: any;
  stake: number | string;
}

@Injectable()
export class RouletteService {
  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private pf: ProvablyFairService,
    private settings: SettingsService,
    private vip: VipService,
    private referrals: ReferralsService,
    private realtime: RealtimeService,
    private notifications: NotificationsService,
  ) {}

  async game() {
    return this.prisma.game.findUnique({ where: { key: 'roulette' } });
  }

  /** Everything the UI needs to render the table: pockets, bet types, live multipliers. */
  async info() {
    const game = await this.game();
    const rtp = game?.rtp ?? (await this.settings.rtp());
    const bets = BET_TYPES.map((t) => ({
      type: t,
      labelRu: BETS[t].labelRu,
      labelEn: BETS[t].labelEn,
      winningCount: BETS[t].winningCount,
      multiplier: Number(multiplierFor(t, rtp).toFixed(4)),
    }));
    const pockets = Array.from({ length: 37 }, (_, n) => ({ n, color: colorOf(n) }));
    return {
      key: 'roulette',
      name: game?.name ?? 'KuKuMBA Roulette',
      rtp,
      houseEdge: Number((1 - rtp).toFixed(4)),
      minBet: game?.minBet?.toFixed() ?? '0.1',
      maxBet: game?.maxBet?.toFixed() ?? '100000',
      enabled: game?.enabled ?? true,
      descriptionRu: game?.descriptionRu,
      descriptionEn: game?.descriptionEn,
      bets,
      pockets,
    };
  }

  async play(
    userId: string,
    dto: { bets: PlaceBetInput[]; currency: string; mode: WalletMode },
  ) {
    const game = await this.prisma.game.findUnique({ where: { key: 'roulette' } });
    if (!game || !game.enabled) throw new BadRequestException('GAME_DISABLED');

    const mode: WalletMode = dto.mode === 'DEMO' ? 'DEMO' : 'REAL';
    const currency = dto.currency;
    const cur = await this.prisma.currency.findUnique({ where: { code: currency } });
    if (!cur || !cur.enabled) throw new BadRequestException('CURRENCY_DISABLED');
    if (mode === 'DEMO' && currency !== 'DEMO') throw new BadRequestException('DEMO_MODE_USES_DEMO_CURRENCY');
    if (mode === 'REAL' && currency === 'DEMO') throw new BadRequestException('REAL_MODE_REQUIRES_REAL_CURRENCY');
    // Demo coins are only for trying our own games — reject demo on provider titles.
    if (mode === 'DEMO' && !isOriginalGame(game.provider)) throw new BadRequestException('DEMO_ONLY_ORIGINALS');

    if (!dto.bets?.length) throw new BadRequestException('NO_BETS');
    if (dto.bets.length > 50) throw new BadRequestException('TOO_MANY_BETS');

    const rtp = game.rtp ?? (await this.settings.rtp());
    let total = D(0);
    for (const b of dto.bets) {
      validateBet(b.betType, b.selection);
      const stake = D(b.stake);
      if (stake.lte(0)) throw new BadRequestException('BAD_STAKE');
      if (stake.lt(game.minBet)) throw new BadRequestException('STAKE_BELOW_MIN');
      if (stake.gt(game.maxBet)) throw new BadRequestException('STAKE_ABOVE_MAX');
      total = total.plus(stake);
    }

    // Whole-table limit (anti-martingale): the sum of all bets may not exceed the
    // per-currency cap, mirrored from the web client so UI and server agree.
    const tableCap = tableMaxStake(cur.usdRate?.toString(), mode === 'DEMO' || currency === 'DEMO');
    if (total.gt(tableCap)) throw new BadRequestException('TABLE_LIMIT_EXCEEDED');

    const result = await this.prisma.$transaction(async (tx) => {
      // 1) take the stakes
      await this.wallet.apply(tx, {
        userId,
        type: 'BET',
        currency,
        mode,
        amount: total.neg(),
        refType: 'roulette',
        description: 'Roulette bet',
      });

      // 2) draw the pocket (provably fair)
      const seed = await this.pf.consume(tx, userId);
      const outcome = rouletteResult(seed.serverSeed, seed.clientSeed, seed.nonce);
      const outcomeColor = colorOf(outcome);

      const round = await tx.gameRound.create({
        data: {
          gameId: game.id,
          userId,
          seedId: seed.id,
          serverSeedHash: seed.serverSeedHash,
          clientSeed: seed.clientSeed,
          nonce: seed.nonce,
          outcome,
          outcomeColor,
          currency,
          mode,
          totalStake: total,
        },
      });

      // 3) settle each bet
      let totalPayout = D(0);
      const betRows = [];
      for (const b of dto.bets) {
        const stake = D(b.stake);
        const mult = multiplierFor(b.betType as any, rtp);
        const win = isWin(b.betType as any, b.selection, outcome);
        // Round the credit to the currency's precision so a 10 ×2 pays exactly
        // 20.00, not 20.0006 (the RTP-exact multiplier carries tiny dust).
        const payout = win ? roundTo(stake.mul(mult), cur.decimals) : D(0);
        totalPayout = totalPayout.plus(payout);
        betRows.push(
          await tx.bet.create({
            data: {
              roundId: round.id,
              gameId: game.id,
              userId,
              betType: b.betType,
              selection: b.selection ?? {},
              stake,
              currency,
              mode,
              multiplier: D(mult),
              payout,
              status: win ? 'WON' : 'LOST',
            },
          }),
        );
      }

      // 4) pay winnings
      if (totalPayout.gt(0)) {
        await this.wallet.apply(tx, {
          userId,
          type: 'WIN',
          currency,
          mode,
          amount: totalPayout,
          refType: 'roulette',
          refId: round.id,
          description: 'Roulette win',
        });
      }
      await tx.gameRound.update({ where: { id: round.id }, data: { totalPayout } });

      // 5) loyalty side-effects
      const usd = total.mul(cur.usdRate).toNumber();
      const vipRes = await this.vip.addWager(tx, userId, usd);
      const refRes = await this.referrals.onWager(tx, userId, total, currency, mode);

      const balRow = await tx.balance.findUnique({
        where: { userId_currency_mode: { userId, currency, mode } },
      });

      return { round, bets: betRows, outcome, outcomeColor, totalPayout, balRow, vipRes, refRes, seed };
    });

    // post-commit broadcasts & notifications (never block the bet)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, accountId: true },
    });
    const feed = {
      roundId: result.round.id,
      game: game.name,
      username: user?.username,
      accountId: user?.accountId,
      outcome: result.outcome,
      color: result.outcomeColor,
      stake: total.toFixed(),
      payout: result.totalPayout.toFixed(),
      currency,
      mode,
      at: Date.now(),
    };
    this.realtime.liveBet(feed);
    if (result.totalPayout.gt(total.mul(10))) this.realtime.bigWin(feed);

    if (result.vipRes?.leveledUp) {
      this.notifications.notify(userId, {
        type: 'VIP',
        titleRu: 'Новый VIP-уровень!',
        titleEn: 'New VIP level!',
        bodyRu: `Поздравляем! Вы достигли уровня ${result.vipRes.name}.`,
        bodyEn: `Congrats! You reached ${result.vipRes.name}.`,
        data: { level: result.vipRes.level },
      });
    }
    if (result.refRes) {
      this.notifications.notify(result.refRes.referrerId, {
        type: 'REFERRAL',
        titleRu: 'Реферальное вознаграждение',
        titleEn: 'Referral reward',
        bodyRu: `Вам начислено ${result.refRes.amount.toFixed()} ${currency} от реферала.`,
        bodyEn: `You earned ${result.refRes.amount.toFixed()} ${currency} from a referral.`,
      });
    }

    return {
      roundId: result.round.id,
      outcome: result.outcome,
      color: result.outcomeColor,
      currency,
      mode,
      totalStake: total.toFixed(),
      totalPayout: result.totalPayout.toFixed(),
      net: result.totalPayout.minus(total).toFixed(),
      balance: result.balRow?.amount.toFixed(),
      bets: result.bets.map((b) => ({
        id: b.id,
        betType: b.betType,
        selection: b.selection,
        stake: b.stake.toFixed(),
        multiplier: b.multiplier.toFixed(),
        payout: b.payout.toFixed(),
        status: b.status,
      })),
      provablyFair: {
        serverSeedHash: result.seed.serverSeedHash,
        clientSeed: result.seed.clientSeed,
        nonce: result.seed.nonce,
      },
    };
  }

  history(userId: string, limit = 30) {
    return this.prisma.gameRound.findMany({
      where: { userId },
      include: { bets: true },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
  }

  async liveFeed(limit = 100) {
    const rounds = await this.prisma.gameRound.findMany({
      // Public live feed shows real-money rounds only (demo play stays private).
      where: { mode: 'REAL' },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      include: { user: { select: { username: true, accountId: true } }, game: { select: { name: true } } },
    });
    return rounds.map((r) => ({
      roundId: r.id,
      game: r.game.name,
      username: r.user.username,
      accountId: r.user.accountId,
      outcome: r.outcome,
      color: r.outcomeColor,
      stake: r.totalStake.toFixed(),
      payout: r.totalPayout.toFixed(),
      currency: r.currency,
      mode: r.mode,
      at: r.createdAt.getTime(),
    }));
  }

  /** Recent BIG wins (payout ≥ 10× stake, real money) — a rolling leaderboard
   *  feed, newest first, that the lobby tops up live via the 'bigwin' socket. */
  async bigWins(limit = 500) {
    const rounds = await this.prisma.gameRound.findMany({
      where: { mode: 'REAL', totalPayout: { gt: 0 } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
      include: { user: { select: { username: true, accountId: true } }, game: { select: { name: true } } },
    });
    return rounds
      .filter((r) => r.totalPayout.gte(r.totalStake.mul(10)))
      .map((r) => ({
        roundId: r.id,
        game: r.game.name,
        username: r.user.username,
        accountId: r.user.accountId,
        stake: r.totalStake.toFixed(),
        payout: r.totalPayout.toFixed(),
        currency: r.currency,
        mode: r.mode,
        at: r.createdAt.getTime(),
      }));
  }
}
