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
import { floatFromSeeds } from '../../provably-fair/provably-fair.crypto';
import { ProvablyFairService } from '../../provably-fair/provably-fair.service';
import { RakebackService } from '../../rakeback/rakeback.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { ReferralsService } from '../../referrals/referrals.service';
import { StatsService } from '../../stats/stats.service';
import { VipService } from '../../vip/vip.service';
import { WalletService } from '../../wallet/wallet.service';
import {
  maxChanceFor,
  multiplierFor,
  normalizeChance,
  settle,
  UPGRADER_MIN_CHANCE,
  UPGRADER_MIN_MULTIPLIER,
} from './upgrader.engine';

export interface UpgraderPlayInput {
  stake: number | string;
  currency: string;
  mode: WalletMode;
  /** Canonical win chance as a fraction (0.0001 … 0.99). */
  chance: number;
}

/** Clamp any input to the supported chance range (for `info` display only). */
function clampChance(c: number, maxChance: number): number {
  if (!Number.isFinite(c)) return 0.5;
  return Math.min(maxChance, Math.max(UPGRADER_MIN_CHANCE, c));
}

/**
 * KuKuMBA Upgrader — single-player, single-shot spin: the exact server-side mirror
 * of the plinko/roulette modules (bet → provably-fair outcome → settle, all inside
 * one transaction; no in-flight state, so no sweeper is needed).
 *
 *  - the stop point is provably fair (same seed chain / nonce as the roulette) and
 *    settles atomically with the bet; the win-zone is the arc [0, chance), so a win
 *    is identically `float < chance` — the wheel picture and the settlement agree;
 *  - the payout is a flat house edge (multiplier = RTP / chance), exactly like a
 *    roulette bet — nothing about the spin is rigged, only the payout carries edge;
 *  - RTP is admin-tunable per game (Game.rtp), read at bet time and snapshotted on
 *    the bet row so an RTP edit never rewrites a spin already resolved.
 */
@Injectable()
export class UpgraderService implements OnModuleInit {
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
      // no-op top-up if upgrader boots first. Kept for symmetry with roulette.
      if (this.realtime.recentBets().length === 0) {
        this.realtime.seedBets(await this.recentFromDb(15));
      }
    } catch {
      /* DB not ready yet — the buffer simply fills as bets come in */
    }
  }

  async game() {
    return this.prisma.game.findUnique({ where: { key: 'upgrader' } });
  }

  /**
   * Everything the UI needs to render the wheel: RTP, limits, the chance range,
   * the chosen chance and the derived multiplier at the current RTP (so the
   * two linked inputs — chance ↔ multiplier — start in sync).
   */
  async info(chanceInput?: number) {
    const game = await this.game();
    const rtp = game?.rtp ?? (await this.settings.rtp());
    const maxChance = maxChanceFor(rtp); // ≤ rtp / 1.02 — a spin always pays ≥ ×1.02
    const chance = clampChance(chanceInput ?? 0.5, maxChance); // default 50%
    return {
      key: 'upgrader',
      name: game?.name ?? 'KuKuMBA Upgrader',
      rtp,
      houseEdge: Number((1 - rtp).toFixed(4)),
      minBet: game?.minBet?.toFixed() ?? '0.1',
      maxBet: game?.maxBet?.toFixed() ?? '100000',
      enabled: game?.enabled ?? true,
      descriptionRu: game?.descriptionRu,
      descriptionEn: game?.descriptionEn,
      minChance: UPGRADER_MIN_CHANCE,
      maxChance,
      minMultiplier: UPGRADER_MIN_MULTIPLIER,
      chance,
      // The multiplier is always derived — the client shows exactly this value.
      multiplier: Number(multiplierFor(chance, rtp).toFixed(4)),
    };
  }

  async play(userId: string, dto: UpgraderPlayInput) {
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

    const rtp = game.rtp ?? (await this.settings.rtp());

    // Canonical win chance (throws BAD_CHANCE / CHANCE_OUT_OF_RANGE on anything
    // bad; the maximum is RTP-dependent so a spin always pays ≥ ×1.02).
    const chance = normalizeChance(dto.chance, rtp);

    const stake = D(dto.stake);
    if (stake.lte(0)) throw new BadRequestException('BAD_STAKE');
    if (stake.lt(game.minBet)) throw new BadRequestException('STAKE_BELOW_MIN');
    if (stake.gt(game.maxBet)) throw new BadRequestException('STAKE_ABOVE_MAX');
    const cap = tableMaxStake(cur.usdRate?.toString(), mode === 'DEMO' || currency === 'DEMO');
    if (stake.gt(cap)) throw new BadRequestException('TABLE_LIMIT_EXCEEDED');

    const result = await this.prisma.$transaction(async (tx) => {
      // 1) take the stake
      await this.wallet.apply(tx, {
        userId,
        type: 'BET',
        currency,
        mode,
        amount: stake.neg(),
        refType: 'upgrader',
        description: 'Upgrader bet',
      });

      // 2) spin the needle (provably fair) — same seed chain as roulette/crash
      const seed = await this.pf.consume(tx, userId);
      const float = floatFromSeeds(seed.serverSeed, seed.clientSeed, seed.nonce);
      const { win, multiplier, angleBp } = settle(chance, float, stake.toNumber(), rtp);
      // Round the credit to the currency's precision so a 10 ×1.98 pays exactly
      // 19.80, not 19.8000…, with no sub-cent dust from the raw multiplier.
      const payout = win ? roundTo(stake.mul(D(multiplier)), cur.decimals) : D(0);

      const status = win ? 'WON' : 'LOST'; // no push — a miss burns the stake
      const outcomeColor = win ? 'green' : 'red';

      const round = await tx.gameRound.create({
        data: {
          gameId: game.id,
          userId,
          seedId: seed.id,
          serverSeedHash: seed.serverSeedHash,
          clientSeed: seed.clientSeed,
          nonce: seed.nonce,
          // The needle stop point in beeps (0..9999) is the public outcome.
          outcome: angleBp,
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
          betType: 'UPGRADER',
          // RTP snapshot + the params this spin was bought on, for auditing.
          selection: { chance, multiplier, rtp, angleBp },
          stake,
          currency,
          mode,
          multiplier: D(multiplier),
          payout,
          status,
        },
      });

      // 3) pay winnings (only on a win — a miss returns nothing)
      if (payout.gt(0)) {
        await this.wallet.apply(tx, {
          userId,
          type: 'WIN',
          currency,
          mode,
          amount: payout,
          refType: 'upgrader',
          refId: round.id,
          description: 'Upgrader win',
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

      return { round, bet, win, multiplier, payout, status, angleBp, balRow, vipRes, bonusRes, seed };
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
      outcome: result.angleBp,
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
      chance,
      // The gross multiplier the server applied.
      multiplier: result.multiplier,
      win: result.win,
      // The needle stop point (0..9999) so the client animates the EXACT server angle.
      angleBp: result.angleBp,
      status: result.status,
      currency,
      mode,
      stake: stake.toFixed(),
      payout: result.payout.toFixed(),
      net: result.payout.minus(stake).toFixed(),
      balance: result.balRow?.amount.toFixed(),
      provablyFair: {
        serverSeedHash: result.seed.serverSeedHash,
        clientSeed: result.seed.clientSeed,
        nonce: result.seed.nonce,
      },
    };
  }

  /** The player's settled upgrader spins, newest first (real money only). */
  async history(userId: string, limit = 30) {
    const rounds = await this.prisma.gameRound.findMany({
      where: { userId, mode: 'REAL', game: { key: 'upgrader' } },
      include: { bets: true },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
    return rounds.map((r) => {
      const bet = r.bets[0];
      const sel = (bet?.selection ?? {}) as any;
      return {
        roundId: r.id,
        chance: sel.chance ?? null,
        multiplier: bet ? bet.multiplier.toNumber() : 0,
        angleBp: r.outcome,
        win: bet ? bet.status === 'WON' : r.outcomeColor === 'green',
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
