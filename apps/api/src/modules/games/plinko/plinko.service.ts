import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { WalletMode } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { tableMaxStake } from '../../../common/utils/bet-limits';
import { isOriginalGame } from '../../../common/utils/games';
import { D, roundTo } from '../../../common/utils/money';
import { SettingsService } from '../../../config/settings.service';
import { BonusesService } from '../../bonuses/bonuses.service';
import { LeaderboardsService } from '../../leaderboards/leaderboards.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { ProvablyFairService } from '../../provably-fair/provably-fair.service';
import { RakebackService } from '../../rakeback/rakeback.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { ReferralsService } from '../../referrals/referrals.service';
import { StatsService } from '../../stats/stats.service';
import { VipService } from '../../vip/vip.service';
import { WalletService } from '../../wallet/wallet.service';
import {
  multipliers,
  normalizeConfig,
  PLINKO_MAX_ROWS,
  PLINKO_MIN_ROWS,
  PLINKO_RISKS,
  PlinkoRisk,
  plinkoPath,
  settle,
  slotOf,
} from './plinko.engine';

export interface PlinkoPlayInput {
  stake: number | string;
  currency: string;
  mode: WalletMode;
  risk: string;
  rows: number;
}

/**
 * KuKuMBA Plinko — single-player, single-shot drop: the exact server-side mirror
 * of the roulette module (bet → provably-fair outcome → settle, all inside one
 * transaction; no in-flight state, so no sweeper is needed).
 *
 *  - the landing slot is provably fair (same seed chain / nonce as roulette; the
 *    per-pin cursor is the left/right coin index) and settles atomically with
 *    the bet, exactly like a roulette spin;
 *  - the ball falls on a fair binomial (the middle is likeliest, the edges rare)
 *    — nothing about the drop is rigged; only the payout table carries the edge;
 *  - RTP is admin-tunable per game (Game.rtp), read at bet time and snapshotted
 *    on the bet row so an RTP edit never rewrites a drop already resolved.
 */
@Injectable()
export class PlinkoService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private pf: ProvablyFairService,
    private settings: SettingsService,
    private vip: VipService,
    private rakeback: RakebackService,
    private referrals: ReferralsService,
    private realtime: RealtimeService,
    private notifications: NotificationsService,
    private leaderboards: LeaderboardsService,
    private stats: StatsService,
    private bonuses: BonusesService,
  ) {}

  /** Seed the live-bet ticker buffer from the DB so it isn't empty after a restart. */
  async onModuleInit() {
    try {
      // Roulette already seeds the shared buffer on boot; this is a harmless
      // no-op top-up if plinko boots first. Kept for symmetry with roulette.
      if (this.realtime.recentBets().length === 0) {
        this.realtime.seedBets(await this.recentFromDb(15));
      }
    } catch {
      /* DB not ready yet — the buffer simply fills as bets come in */
    }
  }

  async game() {
    return this.prisma.game.findUnique({ where: { key: 'plinko' } });
  }

  /**
   * Everything the UI needs to render the board: RTP, limits, the supported
   * risk levels and row range, and the live payout table for a chosen
   * (risk, rows) at the current RTP.
   */
  async info(riskInput?: string, rowsInput?: number) {
    const game = await this.game();
    const rtp = game?.rtp ?? (await this.settings.rtp());
    const risk: PlinkoRisk =
      riskInput && (PLINKO_RISKS as readonly string[]).includes(riskInput.toUpperCase())
        ? (riskInput.toUpperCase() as PlinkoRisk)
        : 'LOW';
    const rows =
      rowsInput && Number.isInteger(rowsInput) && rowsInput >= PLINKO_MIN_ROWS && rowsInput <= PLINKO_MAX_ROWS
        ? rowsInput
        : 8;
    return {
      key: 'plinko',
      name: game?.name ?? 'KuKuMBA Plinko',
      rtp,
      houseEdge: Number((1 - rtp).toFixed(4)),
      minBet: game?.minBet?.toFixed() ?? '0.1',
      maxBet: game?.maxBet?.toFixed() ?? '100000',
      enabled: game?.enabled ?? true,
      descriptionRu: game?.descriptionRu,
      descriptionEn: game?.descriptionEn,
      risks: PLINKO_RISKS,
      minRows: PLINKO_MIN_ROWS,
      maxRows: PLINKO_MAX_ROWS,
      risk,
      rows,
      // Live payout table for the requested board (centre-minimal, edge-maximal).
      multipliers: multipliers(risk, rows, rtp),
    };
  }

  async play(userId: string, dto: PlinkoPlayInput) {
    const game = await this.game();
    if (!game || !game.enabled || game.status !== 'LIVE') throw new BadRequestException('GAME_DISABLED');

    const mode: WalletMode = dto.mode === 'DEMO' ? 'DEMO' : 'REAL';
    const currency = dto.currency;
    const cur = await this.prisma.currency.findUnique({ where: { code: currency } });
    if (!cur || !cur.enabled) throw new BadRequestException('CURRENCY_DISABLED');
    if (mode === 'DEMO' && currency !== 'DEMO') throw new BadRequestException('DEMO_MODE_USES_DEMO_CURRENCY');
    if (mode === 'REAL' && currency === 'DEMO') throw new BadRequestException('REAL_MODE_REQUIRES_REAL_CURRENCY');
    // Demo coins are only for trying our own games — reject demo on provider titles.
    if (mode === 'DEMO' && !isOriginalGame(game.provider)) throw new BadRequestException('DEMO_ONLY_ORIGINALS');

    // Validate the board (throws BAD_RISK / BAD_ROWS on anything unsupported).
    const { risk, rows } = normalizeConfig(dto.risk, dto.rows);

    const stake = D(dto.stake);
    if (stake.lte(0)) throw new BadRequestException('BAD_STAKE');
    if (stake.lt(game.minBet)) throw new BadRequestException('STAKE_BELOW_MIN');
    if (stake.gt(game.maxBet)) throw new BadRequestException('STAKE_ABOVE_MAX');
    const cap = tableMaxStake(cur.usdRate?.toString(), mode === 'DEMO' || currency === 'DEMO');
    if (stake.gt(cap)) throw new BadRequestException('TABLE_LIMIT_EXCEEDED');

    const rtp = game.rtp ?? (await this.settings.rtp());

    const result = await this.prisma.$transaction(async (tx) => {
      // 1) take the stake
      await this.wallet.apply(tx, {
        userId,
        type: 'BET',
        currency,
        mode,
        amount: stake.neg(),
        refType: 'plinko',
        description: 'Plinko bet',
      });

      // 2) drop the ball (provably fair) — same seed chain as roulette/crash
      const seed = await this.pf.consume(tx, userId);
      const path = plinkoPath(seed.serverSeed, seed.clientSeed, seed.nonce, rows);
      const slot = slotOf(path);
      const { multiplier, payout: grossPayout } = settle(risk, rows, slot, stake.toNumber(), rtp);
      // Round the credit to the currency's precision so a 10 ×2 pays exactly
      // 20.00, not 20.0006 (the RTP-exact multiplier carries tiny dust).
      const payout = roundTo(stake.mul(D(multiplier)), cur.decimals);

      // Status semantics mirror ponyjack: a drop that returns MORE than the
      // stake is a win, less is a loss, and an exact return is a push. Every
      // plinko slot returns something, but the middle can pay < 1×.
      const status = payout.gt(stake) ? 'WON' : payout.lt(stake) ? 'LOST' : 'PUSH';
      const outcomeColor = status === 'WON' ? 'green' : status === 'PUSH' ? 'push' : 'red';

      const round = await tx.gameRound.create({
        data: {
          gameId: game.id,
          userId,
          seedId: seed.id,
          serverSeedHash: seed.serverSeedHash,
          clientSeed: seed.clientSeed,
          nonce: seed.nonce,
          // The landing slot (0..rows) is the public outcome for this game.
          outcome: slot,
          outcomeColor,
          currency,
          mode,
          totalStake: stake,
          totalPayout: payout,
        },
      });

      const bet = await tx.bet.create({
        data: {
          roundId: round.id,
          gameId: game.id,
          userId,
          betType: 'PLINKO',
          // RTP snapshot + the board this drop was bought on, for auditing.
          selection: { risk, rows, slot, rtp },
          stake,
          currency,
          mode,
          multiplier: D(multiplier),
          payout,
          status,
        },
      });

      // 3) pay winnings (every slot returns something, so payout > 0 always)
      if (payout.gt(0)) {
        await this.wallet.apply(tx, {
          userId,
          type: 'WIN',
          currency,
          mode,
          amount: payout,
          refType: 'plinko',
          refId: round.id,
          description: 'Plinko win',
        });
      }

      // 4) loyalty side-effects — REAL money only (demo chips are free play):
      //    VIP wager track, rakeback on the house edge, referral revenue share.
      let vipRes: Awaited<ReturnType<VipService['addWager']>> | null = null;
      if (mode === 'REAL') {
        const usd = stake.mul(cur.usdRate).toNumber();
        vipRes = await this.vip.addWager(tx, userId, usd);
        await this.rakeback.accrue(tx, userId, currency, stake, Math.max(0, 1 - rtp));
        await this.referrals.onRoundSettled(tx, userId, currency, mode, stake, payout);
      }
      // Advance any active bonus wagering with this stake (REAL only). Runs after
      // the win is paid so the balance-wipeout check sees the settled balance.
      const bonusRes = await this.bonuses.onWager(tx, userId, currency, mode, stake, cur.usdRate);

      const balRow = await tx.balance.findUnique({
        where: { userId_currency_mode: { userId, currency, mode } },
      });

      return { round, bet, path, slot, multiplier, payout, status, balRow, vipRes, bonusRes, seed };
    });

    // post-commit broadcasts & notifications (never block the bet)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, accountId: true },
    });
    const feed = {
      roundId: result.round.id,
      game: game.name,
      gameKey: game.key,
      category: game.category,
      username: user?.username,
      accountId: user?.accountId,
      outcome: result.slot,
      color: result.round.outcomeColor,
      stake: stake.toFixed(),
      payout: result.payout.toFixed(),
      // USD-equivalent of the payout — lets the all-time "biggest wins" leaderboard
      // rank fairly across currencies without a per-client rate lookup.
      usd: result.payout.mul(cur.usdRate).toNumber(),
      currency,
      mode,
      at: Date.now(),
    };
    // The public ticker and the all-time leaderboards are real-money only —
    // demo play is just test chips and stays private. Fire-and-forget so neither
    // ever blocks the bet.
    if (mode === 'REAL') {
      this.realtime.liveBet(feed);
      void this.leaderboards.record({
        roundId: result.round.id,
        gameKey: game.key,
        gameName: game.name,
        category: game.category,
        username: user?.username ?? '',
        accountId: user?.accountId ?? 0,
        currency,
        stake: stake.toFixed(),
        payout: result.payout.toFixed(),
        usd: result.payout.mul(cur.usdRate).toNumber(),
        coeff: result.multiplier,
        at: new Date(),
      });
    }
    // Per-round bookkeeping: persistent counters, lifetime stats, history prune.
    void this.stats.recordRound({ userId, bets: 1, stake: stake.toFixed() });

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
    if (result.bonusRes) this.bonuses.notifyWagerEvents(userId, result.bonusRes);

    return {
      roundId: result.round.id,
      risk,
      rows,
      // The full left/right path so the client can animate the exact drop the
      // server rolled (true = right); the landing slot is the count of rights.
      path: result.path,
      slot: result.slot,
      multiplier: result.multiplier,
      status: result.status,
      currency,
      mode,
      stake: stake.toFixed(),
      payout: result.payout.toFixed(),
      net: result.payout.minus(stake).toFixed(),
      balance: result.balRow?.amount.toFixed(),
      // The live payout table this drop was settled against (client renders it).
      multipliers: multipliers(risk, rows, rtp),
      provablyFair: {
        serverSeedHash: result.seed.serverSeedHash,
        clientSeed: result.seed.clientSeed,
        nonce: result.seed.nonce,
      },
    };
  }

  /** The player's settled plinko drops, newest first (real money only). */
  async history(userId: string, limit = 30) {
    const rounds = await this.prisma.gameRound.findMany({
      where: { userId, mode: 'REAL', game: { key: 'plinko' } },
      include: { bets: true },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
    return rounds.map((r) => {
      const bet = r.bets[0];
      const sel = (bet?.selection ?? {}) as any;
      return {
        roundId: r.id,
        risk: sel.risk ?? 'LOW',
        rows: sel.rows ?? 8,
        slot: r.outcome,
        multiplier: bet ? bet.multiplier.toNumber() : 0,
        stake: r.totalStake.toFixed(),
        payout: r.totalPayout.toFixed(),
        currency: r.currency,
        mode: r.mode,
        at: r.createdAt.getTime(),
      };
    });
  }

  /** Public live feed — served from the in-memory ticker buffer (last ≤15). */
  liveFeed() {
    return this.realtime.recentBets();
  }

  /** Newest real-money rounds straight from the DB — only used to seed the buffer. */
  private async recentFromDb(limit = 15) {
    const rounds = await this.prisma.gameRound.findMany({
      where: { mode: 'REAL', bets: { none: { status: 'PENDING' } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 15),
      include: {
        user: { select: { username: true, accountId: true } },
        game: { select: { name: true, key: true, category: true } },
      },
    });
    return rounds.map((r) => ({
      roundId: r.id,
      game: r.game.name,
      gameKey: r.game.key,
      category: r.game.category,
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
}
