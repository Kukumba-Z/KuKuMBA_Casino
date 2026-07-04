import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma, WalletMode } from '@prisma/client';
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
  autoCashoutWins,
  CRASH_MAX_MULT,
  crashPointFor,
  CURVE_A,
  CURVE_K,
  floorMult,
  isValidAutoCashout,
  multiplierAt,
  secondsToReach,
} from './crash.engine';

type Tx = Prisma.TransactionClient;

export interface CrashPlayInput {
  stake: number | string;
  currency: string;
  mode: WalletMode;
  /** Auto-cashout target (≥ 1.01). Required for `instant`. */
  autoCashout?: number;
  /** Turbo: settle the whole round in the bet transaction (needs autoCashout). */
  instant?: boolean;
}

/** What a settlement decided — computed from server time, never from the client. */
interface Settlement {
  win: boolean;
  /** Cashout multiplier on a win (already floored to 2 dp). */
  multiplier: number;
  crashPoint: number;
}

/**
 * VODKA WIN Crash — single-player crash, the exact server-side mirror of the
 * roulette module:
 *
 *  - the crash point is provably fair (same seed chain / nonce as roulette) and
 *    is fixed inside the bet transaction; it is NEVER sent to the client while
 *    the round is running (a player who knows it plays at ~14.7× RTP);
 *  - it is not even stored while running — it's recomputed from the committed
 *    seed + nonce on every read, so nothing secret sits in a queryable column;
 *  - the multiplier is a deterministic function of SERVER time (closed-form
 *    curve shared with the web engine), so a cashout is validated by elapsed
 *    time — a client-reported multiplier is never trusted;
 *  - abandoned rounds are settled by a sweeper (auto-cashout target honoured,
 *    otherwise lost at the crash point), so money can't get stuck in-flight.
 *
 * RTP is admin-tunable per game (Game.rtp), read at bet time and snapshotted
 * on the bet row so an RTP edit never changes a round already in the air.
 */
@Injectable()
export class CrashService {
  /**
   * Per-round settlement timers. A running round is proactively settled the
   * instant its outcome is decided by the clock (auto-cashout target reached, or
   * the crash point passed) and the result is pushed to the player's socket —
   * so the scene resolves on the true multiplier within a network hop, without
   * the display having to lag the server. The 5s sweeper is the backstop for
   * anything these timers miss (e.g. a process restart).
   */
  private settleTimers = new Map<string, NodeJS.Timeout>();

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

  async game() {
    return this.prisma.game.findUnique({ where: { key: 'crash' } });
  }

  /** Everything the UI needs: RTP, limits and the shared growth-curve constants. */
  async info() {
    const game = await this.game();
    const rtp = game?.rtp ?? (await this.settings.rtp());
    return {
      key: 'crash',
      name: game?.name ?? 'VODKA WIN Crash',
      rtp,
      houseEdge: Number((1 - rtp).toFixed(4)),
      minBet: game?.minBet?.toFixed() ?? '0.1',
      maxBet: game?.maxBet?.toFixed() ?? '100000',
      enabled: game?.enabled ?? true,
      descriptionRu: game?.descriptionRu,
      descriptionEn: game?.descriptionEn,
      maxMultiplier: CRASH_MAX_MULT,
      // The deterministic multiplier curve (t(m) = (ln m + A·ln²m)/K) — published
      // so anyone can recheck that cashouts were validated by time honestly.
      curve: { k: CURVE_K, a: CURVE_A },
    };
  }

  async play(userId: string, dto: CrashPlayInput) {
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

    const stake = D(dto.stake);
    if (stake.lte(0)) throw new BadRequestException('BAD_STAKE');
    if (stake.lt(game.minBet)) throw new BadRequestException('STAKE_BELOW_MIN');
    if (stake.gt(game.maxBet)) throw new BadRequestException('STAKE_ABOVE_MAX');
    const cap = tableMaxStake(cur.usdRate?.toString(), mode === 'DEMO' || currency === 'DEMO');
    if (stake.gt(cap)) throw new BadRequestException('TABLE_LIMIT_EXCEEDED');

    const autoCashout = dto.autoCashout ?? null;
    if (autoCashout !== null && !isValidAutoCashout(autoCashout)) {
      throw new BadRequestException('BAD_AUTO_CASHOUT');
    }
    if (dto.instant && autoCashout === null) throw new BadRequestException('AUTO_CASHOUT_REQUIRED');

    // One active round per player: settle a finished-but-unswept one, refuse
    // to stack a second bet on a genuinely running one.
    const active = await this.prisma.bet.findFirst({
      where: { userId, status: 'PENDING', game: { key: 'crash' } },
      include: { round: { include: { seed: true } } },
    });
    if (active) {
      const settled = await this.settleIfDue(active);
      if (!settled) throw new BadRequestException('CRASH_ROUND_ACTIVE');
    }

    const rtp = game.rtp ?? (await this.settings.rtp());

    const result = await this.prisma.$transaction(async (tx) => {
      // 1) take the stake
      await this.wallet.apply(tx, {
        userId,
        type: 'BET',
        currency,
        mode,
        amount: stake.neg(),
        refType: 'crash',
        description: 'Crash bet',
      });

      // 2) fix the crash point (provably fair) — same seed chain as roulette
      const seed = await this.pf.consume(tx, userId);
      const crashPoint = crashPointFor(
        floatFromSeeds(seed.serverSeed, seed.clientSeed, seed.nonce),
        rtp,
      );

      // 3) open the round. outcome/color stay neutral until the round settles —
      //    the crash point must not be readable anywhere while money is in play.
      const round = await tx.gameRound.create({
        data: {
          gameId: game.id,
          userId,
          seedId: seed.id,
          serverSeedHash: seed.serverSeedHash,
          clientSeed: seed.clientSeed,
          nonce: seed.nonce,
          outcome: 0,
          outcomeColor: 'pending',
          currency,
          mode,
          totalStake: stake,
        },
      });
      const bet = await tx.bet.create({
        data: {
          roundId: round.id,
          gameId: game.id,
          userId,
          betType: 'CRASH',
          // RTP snapshot: settlement of THIS round always uses the RTP it was
          // bought at, even if an admin retunes the game mid-flight.
          selection: { autoCashout, rtp },
          stake,
          currency,
          mode,
          multiplier: D(0),
          payout: D(0),
          status: 'PENDING',
        },
      });

      // 4) turbo resolves inside the same transaction — the roulette flow
      if (dto.instant) {
        const win = autoCashoutWins(autoCashout!, crashPoint);
        const settled = await this.applySettlement(tx, bet.id, {
          win,
          multiplier: win ? floorMult(autoCashout!) : 0,
          crashPoint,
        });
        return { round, bet, settled, seed, crashPoint };
      }
      return { round, bet, settled: null, seed, crashPoint };
    });

    // Live round: arm the proactive settle-and-push at the moment the clock
    // decides the outcome (crashPoint stays server-side — only used here).
    if (!result.settled) {
      this.armSettleTimer(
        result.bet.id,
        result.round.id,
        result.round.userId,
        result.round.createdAt,
        result.crashPoint,
        autoCashout,
      );
    }

    // Per-round bookkeeping: counters, lifetime stats, history prune (fire & forget).
    void this.stats.recordRound({ userId, bets: 1, stake: stake.toFixed() });

    if (result.settled) {
      await this.afterSettle(result.settled);
      return {
        roundId: result.round.id,
        status: result.settled.bet.status,
        crashPoint: result.settled.crashPoint,
        multiplier: result.settled.bet.multiplier.toNumber(),
        stake: stake.toFixed(),
        payout: result.settled.bet.payout.toFixed(),
        balance: result.settled.balance,
        currency,
        mode,
        provablyFair: this.pfView(result.round),
      };
    }

    return {
      roundId: result.round.id,
      status: 'RUNNING',
      stake: stake.toFixed(),
      currency,
      mode,
      autoCashout,
      startedAt: result.round.createdAt.getTime(),
      serverNow: Date.now(),
      provablyFair: this.pfView(result.round),
    };
  }

  /**
   * Cash out a running round. The multiplier is derived from SERVER elapsed
   * time on the shared curve; if the curve already passed the crash point the
   * round is settled as lost (or as an auto-cashout win if that fired first).
   * Always returns the final round state instead of throwing on "too late".
   */
  async cashOut(userId: string, roundId: string, atMultiplier?: number) {
    const bet = await this.prisma.bet.findFirst({
      where: { roundId, userId, game: { key: 'crash' } },
      include: { round: { include: { seed: true } } },
    });
    if (!bet) throw new NotFoundException('ROUND_NOT_FOUND');
    if (bet.status !== 'PENDING') return this.finalView(bet.roundId);

    const crashPoint = this.crashPointOf(bet);
    const settled = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockPending(tx, bet.id);
      if (!locked) return null; // sweeper/poll got there first
      const elapsed = (Date.now() - bet.round.createdAt.getTime()) / 1000;
      const due = this.dueSettlement(locked, crashPoint, elapsed);
      if (due) return this.applySettlement(tx, bet.id, due);
      // Still alive by server time → honour the multiplier the player actually
      // SAW (the scene runs a touch behind the server clock). Clamp it to the
      // live value so a client can only ever cash out *earlier/lower*, never
      // beyond what the server clock allows — the money truth stays server-side.
      const live = multiplierAt(elapsed);
      const shown = atMultiplier && atMultiplier > 1 ? Math.min(atMultiplier, live) : live;
      const m = floorMult(shown);
      const win = m < crashPoint;
      return this.applySettlement(tx, bet.id, { win, multiplier: win ? m : 0, crashPoint });
    });
    if (settled) await this.afterSettle(settled);
    return this.finalView(roundId);
  }

  /**
   * Round state for the polling client. Lazily settles a round whose outcome is
   * already decided by the clock (crash passed / auto-cashout reached); while
   * genuinely running it reveals nothing but the elapsed time.
   */
  async state(userId: string, roundId: string) {
    const bet = await this.prisma.bet.findFirst({
      where: { roundId, userId, game: { key: 'crash' } },
      include: { round: { include: { seed: true } } },
    });
    if (!bet) throw new NotFoundException('ROUND_NOT_FOUND');
    if (bet.status === 'PENDING') {
      const settled = await this.settleIfDue(bet);
      if (!settled) {
        return {
          roundId,
          status: 'RUNNING',
          startedAt: bet.round.createdAt.getTime(),
          serverNow: Date.now(),
        };
      }
    }
    return this.finalView(roundId);
  }

  /**
   * The player's still-running round, if any — lets the page re-attach to the
   * flight (and the CASH OUT button) after a reload or navigation.
   */
  async activeRound(userId: string) {
    const bet = await this.prisma.bet.findFirst({
      where: { userId, status: 'PENDING', game: { key: 'crash' } },
      include: { round: { include: { seed: true } } },
    });
    if (!bet) return { active: false };
    if (await this.settleIfDue(bet)) return { active: false };
    return {
      active: true,
      roundId: bet.roundId,
      stake: bet.stake.toFixed(),
      currency: bet.currency,
      mode: bet.mode,
      autoCashout: Number((bet.selection as any)?.autoCashout) || null,
      startedAt: bet.round.createdAt.getTime(),
      serverNow: Date.now(),
    };
  }

  /** The player's settled crash rounds, newest first (real money only). */
  async history(userId: string, limit = 30) {
    const rounds = await this.prisma.gameRound.findMany({
      where: {
        userId,
        mode: 'REAL',
        game: { key: 'crash' },
        bets: { none: { status: 'PENDING' } },
      },
      include: { bets: true },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
    return rounds.map((r) => {
      const bet = r.bets[0];
      return {
        roundId: r.id,
        crashPoint: r.outcome / 100,
        multiplier: bet ? bet.multiplier.toNumber() : 0,
        stake: r.totalStake.toFixed(),
        payout: r.totalPayout.toFixed(),
        currency: r.currency,
        mode: r.mode,
        at: r.createdAt.getTime(),
      };
    });
  }

  /** Public live feed — the shared in-memory ticker (all games, last ≤15). */
  liveFeed() {
    return this.realtime.recentBets();
  }

  /**
   * Safety net for abandoned rounds (closed tab, dead connection): every few
   * seconds settle everything the clock has already decided.
   */
  @Interval(5_000)
  async sweep() {
    const pending = await this.prisma.bet.findMany({
      where: { status: 'PENDING', game: { key: 'crash' } },
      include: { round: { include: { seed: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    for (const bet of pending) {
      try {
        await this.settleIfDue(bet);
      } catch {
        /* next tick retries; settlement is idempotent under the row lock */
      }
    }
  }

  // ── internals ─────────────────────────────────────────────────────────

  /**
   * Arm (or re-arm) the timer that settles a live round the instant its outcome
   * is fixed by the clock: an auto-cashout win lands at secondsToReach(target),
   * everything else at secondsToReach(crashPoint). Settlement itself is the
   * idempotent, row-locked path shared with polls/sweeper/cashout, so a timer
   * firing next to any of them is a harmless no-op.
   */
  private armSettleTimer(
    betId: string,
    roundId: string,
    userId: string,
    createdAt: Date,
    crashPoint: number,
    autoCashout: number | null,
  ) {
    const winsAuto = !!(autoCashout && autoCashoutWins(autoCashout, crashPoint));
    const settleAtSec = winsAuto ? secondsToReach(autoCashout!) : secondsToReach(crashPoint);
    // +40ms guard so the elapsed clock has definitely crossed the point.
    const delay = Math.max(0, settleAtSec * 1000 - (Date.now() - createdAt.getTime()) + 40);
    this.clearSettleTimer(betId);
    this.settleTimers.set(
      betId,
      setTimeout(() => {
        this.settleTimers.delete(betId);
        // Reveal a LOSS to the scene at once: the crash point is fixed and a loss
        // moves no money (the stake was already taken), so the number can land on
        // the true crash without waiting for the settlement's DB work. Wins keep
        // their own reveal path (auto-cashout poll / post-commit push) so no
        // payout ever shows before the balance reflects it.
        if (!winsAuto) {
          this.realtime.toUser(userId, 'crash:settle', {
            roundId,
            status: 'LOST',
            crashPoint,
            multiplier: 0,
          });
        }
        void this.settleBetById(betId);
      }, delay),
    );
  }

  private clearSettleTimer(betId: string) {
    const timer = this.settleTimers.get(betId);
    if (timer) {
      clearTimeout(timer);
      this.settleTimers.delete(betId);
    }
  }

  /** Timer target: load the still-pending bet and settle it if the clock is due. */
  private async settleBetById(betId: string) {
    const bet = await this.prisma.bet.findFirst({
      where: { id: betId, status: 'PENDING', game: { key: 'crash' } },
      include: { round: { include: { seed: true } } },
    });
    if (bet) await this.settleIfDue(bet);
  }

  private pfView(round: { serverSeedHash: string; clientSeed: string; nonce: number }) {
    return {
      serverSeedHash: round.serverSeedHash,
      clientSeed: round.clientSeed,
      nonce: round.nonce,
    };
  }

  /** Recompute the round's crash point from its committed seed chain. */
  private crashPointOf(bet: {
    selection: any;
    round: { clientSeed: string; nonce: number; seed: { serverSeed: string } };
  }): number {
    const rtp = Number(bet.selection?.rtp) || 0.99;
    return crashPointFor(
      floatFromSeeds(bet.round.seed.serverSeed, bet.round.clientSeed, bet.round.nonce),
      rtp,
    );
  }

  /**
   * What the clock has already decided for a PENDING bet, if anything:
   *  - auto-cashout target reached and survives → win at the target;
   *  - the 1M cap reached → jackpot is paid even without a cashout;
   *  - crash point passed → lost. Otherwise the round is still in the air.
   */
  private dueSettlement(
    bet: { selection: any },
    crashPoint: number,
    elapsed: number,
  ): Settlement | null {
    const auto = Number(bet.selection?.autoCashout) || null;
    if (auto && autoCashoutWins(auto, crashPoint) && elapsed >= secondsToReach(auto)) {
      return { win: true, multiplier: floorMult(auto), crashPoint };
    }
    if (crashPoint >= CRASH_MAX_MULT && elapsed >= secondsToReach(CRASH_MAX_MULT)) {
      return { win: true, multiplier: CRASH_MAX_MULT, crashPoint };
    }
    if (elapsed >= secondsToReach(crashPoint)) {
      return { win: false, multiplier: 0, crashPoint };
    }
    return null;
  }

  /** Settle a bet if its outcome is already decided. Returns true if it settled. */
  private async settleIfDue(bet: {
    id: string;
    selection: any;
    round: { createdAt: Date; clientSeed: string; nonce: number; seed: { serverSeed: string } };
  }): Promise<boolean> {
    const crashPoint = this.crashPointOf(bet);
    const elapsed = (Date.now() - bet.round.createdAt.getTime()) / 1000;
    const due = this.dueSettlement(bet, crashPoint, elapsed);
    if (!due) return false;
    const settled = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockPending(tx, bet.id);
      if (!locked) return null;
      return this.applySettlement(tx, bet.id, due);
    });
    if (settled) await this.afterSettle(settled);
    return true;
  }

  /** Row-lock the bet and confirm it is still PENDING (idempotent settlement). */
  private async lockPending(tx: Tx, betId: string) {
    await tx.$queryRawUnsafe('SELECT 1 FROM "Bet" WHERE id = $1 FOR UPDATE', betId);
    const bet = await tx.bet.findUnique({ where: { id: betId }, include: { round: true } });
    return bet && bet.status === 'PENDING' ? bet : null;
  }

  /**
   * The one place money settles: pays the win, finalizes the bet + round
   * (revealing the crash point) and runs the loyalty side-effects — VIP wager
   * track, rakeback on the house edge, referral revenue share, bonus wagering.
   */
  private async applySettlement(tx: Tx, betId: string, s: Settlement) {
    const bet = await tx.bet.findUnique({ where: { id: betId }, include: { round: true } });
    if (!bet || bet.status === 'WON' || bet.status === 'LOST') throw new Error('BET_ALREADY_SETTLED');

    const cur = await tx.currency.findUnique({ where: { code: bet.currency } });
    const decimals = cur?.decimals ?? 2;
    const usdRate = cur?.usdRate ?? D(1);
    const finale = s.win && s.crashPoint >= CRASH_MAX_MULT;

    // Round the credit to the currency's precision (same rule as roulette).
    const payout = s.win ? roundTo(bet.stake.mul(D(s.multiplier)), decimals) : D(0);
    if (payout.gt(0)) {
      await this.wallet.apply(tx, {
        userId: bet.userId,
        type: 'WIN',
        currency: bet.currency,
        mode: bet.mode,
        amount: payout,
        refType: 'crash',
        refId: bet.roundId,
        description: finale ? 'Crash jackpot' : 'Crash cashout',
      });
    }

    const updatedBet = await tx.bet.update({
      where: { id: bet.id },
      data: { status: s.win ? 'WON' : 'LOST', multiplier: D(s.multiplier), payout },
    });
    const round = await tx.gameRound.update({
      where: { id: bet.roundId },
      data: {
        // The crash point becomes public only now — stored in hundredths.
        outcome: Math.round(s.crashPoint * 100),
        outcomeColor: s.win ? 'green' : 'red',
        totalPayout: payout,
      },
    });

    // Loyalty side-effects — REAL money only (demo chips are free play).
    const rtp = Number((bet.selection as any)?.rtp) || 0.99;
    let vipRes: Awaited<ReturnType<VipService['addWager']>> | null = null;
    if (bet.mode === 'REAL') {
      const usd = bet.stake.mul(usdRate).toNumber();
      vipRes = await this.vip.addWager(tx, bet.userId, usd);
      await this.rakeback.accrue(tx, bet.userId, bet.currency, bet.stake, Math.max(0, 1 - rtp));
      await this.referrals.onRoundSettled(tx, bet.userId, bet.currency, bet.mode, bet.stake, payout);
    }
    // Advance bonus wagering after the win is paid, so the balance-wipeout
    // check sees the settled balance (same ordering as roulette).
    const bonusRes = await this.bonuses.onWager(
      tx,
      bet.userId,
      bet.currency,
      bet.mode,
      bet.stake,
      usdRate,
    );

    const balRow = await tx.balance.findUnique({
      where: {
        userId_currency_mode: { userId: bet.userId, currency: bet.currency, mode: bet.mode },
      },
    });

    return {
      bet: updatedBet,
      round,
      crashPoint: s.crashPoint,
      finale,
      vipRes,
      bonusRes,
      balance: balRow?.amount.toFixed(),
    };
  }

  /** Post-commit broadcasts & notifications — never block the settlement. */
  private async afterSettle(settled: Awaited<ReturnType<CrashService['applySettlement']>>) {
    const { bet, round, crashPoint } = settled;
    // The round is done — retire its settle timer and push the verdict straight
    // to the player's socket so the scene resolves on the true multiplier at
    // once (no polling lag), regardless of which path did the settling.
    this.clearSettleTimer(bet.id);
    this.realtime.toUser(bet.userId, 'crash:settle', {
      roundId: round.id,
      status: bet.status,
      crashPoint,
      multiplier: bet.multiplier.toNumber(),
    });
    const [user, game, cur] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: bet.userId },
        select: { username: true, accountId: true },
      }),
      this.game(),
      this.prisma.currency.findUnique({ where: { code: bet.currency } }),
    ]);
    const usdRate = cur?.usdRate ?? D(1);

    // Public ticker + all-time leaderboards are real-money only, like roulette.
    if (bet.mode === 'REAL' && game) {
      const feed = {
        roundId: round.id,
        game: game.name,
        gameKey: game.key,
        category: game.category,
        username: user?.username,
        accountId: user?.accountId,
        outcome: crashPoint,
        color: round.outcomeColor,
        stake: round.totalStake.toFixed(),
        payout: round.totalPayout.toFixed(),
        usd: round.totalPayout.mul(usdRate).toNumber(),
        currency: bet.currency,
        mode: bet.mode,
        at: Date.now(),
      };
      this.realtime.liveBet(feed);
      void this.leaderboards.record({
        roundId: round.id,
        gameKey: game.key,
        gameName: game.name,
        category: game.category,
        username: user?.username ?? '',
        accountId: user?.accountId ?? 0,
        currency: bet.currency,
        stake: round.totalStake.toFixed(),
        payout: round.totalPayout.toFixed(),
        usd: round.totalPayout.mul(usdRate).toNumber(),
        coeff: round.totalStake.gt(0) ? round.totalPayout.div(round.totalStake).toNumber() : 0,
        at: new Date(),
      });
    }

    if (settled.vipRes?.leveledUp) {
      this.notifications.notify(bet.userId, {
        type: 'VIP',
        titleRu: 'Новый VIP-уровень!',
        titleEn: 'New VIP level!',
        bodyRu: `Поздравляем! Вы достигли уровня ${settled.vipRes.name}.`,
        bodyEn: `Congrats! You reached ${settled.vipRes.name}.`,
        data: { level: settled.vipRes.level },
      });
    }
    if (settled.bonusRes) this.bonuses.notifyWagerEvents(bet.userId, settled.bonusRes);
  }

  /** The settled round as the client sees it (crash point now public). */
  private async finalView(roundId: string) {
    const round = await this.prisma.gameRound.findUnique({
      where: { id: roundId },
      include: { bets: true },
    });
    if (!round) throw new NotFoundException('ROUND_NOT_FOUND');
    const bet = round.bets[0];
    const bal = await this.prisma.balance.findUnique({
      where: {
        userId_currency_mode: { userId: round.userId, currency: round.currency, mode: round.mode },
      },
    });
    return {
      roundId: round.id,
      status: bet?.status ?? 'LOST',
      crashPoint: round.outcome / 100,
      multiplier: bet ? bet.multiplier.toNumber() : 0,
      stake: round.totalStake.toFixed(),
      payout: round.totalPayout.toFixed(),
      balance: bal?.amount.toFixed(),
      currency: round.currency,
      mode: round.mode,
      provablyFair: this.pfView(round),
    };
  }
}
