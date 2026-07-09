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
import { ProvablyFairService } from '../../provably-fair/provably-fair.service';
import { RakebackService } from '../../rakeback/rakeback.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { ReferralsService } from '../../referrals/referrals.service';
import { StatsService } from '../../stats/stats.service';
import { VipService } from '../../vip/vip.service';
import { WalletService } from '../../wallet/wallet.service';
import {
  cashout as engineCashout,
  MINES_GRID,
  MINES_MAX,
  MINES_MIN,
  minePositions,
  MinesState,
  multiplierFor,
  multiplierLadder,
  normalizeMines,
  replay,
  Seeds,
} from './mines.engine';

type Tx = Prisma.TransactionClient;

/** A pending board with no action for this long is auto-resolved by the sweeper. */
export const MINES_ACTION_TIMEOUT_MS = 120_000;

export interface StartInput {
  stake: number | string;
  currency: string;
  mode: WalletMode;
  mines: number;
}

/** The Bet.selection snapshot — the ONLY persisted round state (plus the seed). */
interface MinesSelection {
  rtp: number;
  minesCount: number;
  picks: number[];
  lastActionAt: number;
}

/** A PENDING mines bet with everything needed to replay its board. */
type PendingBet = Prisma.BetGetPayload<{ include: { round: { include: { seed: true } } } }>;

/**
 * KuKuMBA Mines — single-player minesweeper against the house, the grid-board
 * sibling of the ponyjack module and its exact server-side mirror:
 *
 *  - the layout is provably fair (same seed chain / nonce as roulette; swap #i
 *    of the Fisher–Yates shuffle uses cursor = i) and the WHOLE board — mine
 *    positions included — is a pure function of the committed seed + the pick
 *    log, so nothing secret is ever stored in a queryable column;
 *  - the server replays that function on every read/write: a client can only
 *    submit tile numbers, never state, and an illegal pick can't reach the money;
 *  - while the round is PENDING the mine positions appear in NO API response;
 *    the full layout (minePositions, boomTile) is revealed only in the settled view;
 *  - abandoned rounds are auto-resolved by a sweeper after a generous timeout
 *    (auto-cashout with ≥1 open, stake refund as PUSH with none), so the
 *    player's money is never stuck.
 *
 * RTP is admin-tunable per game (Game.rtp), read at start time and snapshotted
 * on the bet row so an RTP edit never changes a board already in play.
 */
@Injectable()
export class MinesService {
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
    return this.prisma.game.findUnique({ where: { key: 'mines' } });
  }

  /** Everything the UI needs: RTP, limits, and the cashout ladder for a chosen m. */
  async info(minesInput?: number) {
    const game = await this.game();
    const rtp = game?.rtp ?? (await this.settings.rtp());
    const mines =
      minesInput && Number.isInteger(minesInput) && minesInput >= MINES_MIN && minesInput <= MINES_MAX
        ? minesInput
        : 3;
    return {
      key: 'mines',
      name: game?.name ?? 'KuKuMBA Mines',
      rtp,
      houseEdge: Number((1 - rtp).toFixed(4)),
      minBet: game?.minBet?.toFixed() ?? '0.1',
      maxBet: game?.maxBet?.toFixed() ?? '100000',
      enabled: game?.enabled ?? true,
      descriptionRu: game?.descriptionRu,
      descriptionEn: game?.descriptionEn,
      minMines: MINES_MIN,
      maxMines: MINES_MAX,
      gridSize: MINES_GRID,
      actionTimeoutMs: MINES_ACTION_TIMEOUT_MS,
      mines,
      // The cashout ladder (mult at k = 1..25−m) — the UI draws it and reads
      // the "next multiplier" from it (the mines analogue of plinko's table).
      multipliers: multiplierLadder(mines, rtp).map((x) => Number(x.toFixed(4))),
    };
  }

  /** Start a round: take the stake, commit the seed, hide the mines. */
  async start(userId: string, dto: StartInput) {
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

    // Validate the board (throws MINES_BAD_COUNT on anything but an int 2..24).
    const minesCount = normalizeMines(dto.mines);

    const stake = D(dto.stake);
    if (stake.lte(0)) throw new BadRequestException('BAD_STAKE');
    if (stake.lt(game.minBet)) throw new BadRequestException('STAKE_BELOW_MIN');
    if (stake.gt(game.maxBet)) throw new BadRequestException('STAKE_ABOVE_MAX');
    const cap = tableMaxStake(cur.usdRate?.toString(), mode === 'DEMO' || currency === 'DEMO');
    if (stake.gt(cap)) throw new BadRequestException('TABLE_LIMIT_EXCEEDED');

    // One board per player: sweep a timed-out round, refuse to stack on a live one.
    const active = await this.pending(userId);
    if (active) {
      const swept = await this.sweepIfExpired(active);
      if (!swept) throw new BadRequestException('MINES_ROUND_ACTIVE');
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
        refType: 'mines',
        description: 'Mines bet',
      });

      // 2) commit the seed — the layout is now fixed (and stored nowhere)
      const seed = await this.pf.consume(tx, userId);
      const seeds: Seeds = { serverSeed: seed.serverSeed, clientSeed: seed.clientSeed, nonce: seed.nonce };
      const state = replay(seeds, minesCount, []);

      // 3) open the round. outcome/color stay neutral until it settles — the
      //    mine positions must not be readable anywhere while money is in play.
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
      const selection: MinesSelection = {
        // RTP snapshot: THIS round always settles at the RTP it was bought at,
        // even if an admin retunes the game mid-round.
        rtp,
        minesCount,
        picks: [],
        lastActionAt: Date.now(),
      };
      const bet = await tx.bet.create({
        data: {
          roundId: round.id,
          gameId: game.id,
          userId,
          betType: 'MINES',
          selection: selection as any,
          stake,
          currency,
          mode,
          multiplier: D(0),
          payout: D(0),
          status: 'PENDING',
        },
      });
      return { round, bet, state };
    });

    return this.viewOf(result.bet, result.round, result.state, {
      balance: await this.balanceOf(userId, currency, mode),
    });
  }

  /** Open one tile. A boom or a full clear settles inside the same transaction. */
  async pick(userId: string, roundId: string, tile: number) {
    const bet = await this.betOf(userId, roundId);
    if (!bet) throw new NotFoundException('ROUND_NOT_FOUND');
    if (bet.status !== 'PENDING') return this.finalView(roundId, userId);

    const settledInTx = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockPending(tx, bet.id);
      if (!locked) return { raced: true as const, settled: null, state: null, bet: null };

      const sel = this.selectionOf(locked);
      const seeds = this.seedsOf(bet);
      // Replay before and after the pick: the log itself is the legality check —
      // an out-of-range, repeated or post-settle tile throws before money moves.
      const before = replay(seeds, sel.minesCount, sel.picks);
      if (before.phase === 'SETTLED') {
        // A log that already ended but never settled means a crashed settlement —
        // finish it now (idempotent under the row lock).
        const settled = await this.applySettlement(tx, locked.id, before);
        return { raced: false as const, settled, state: before, bet: settled.bet };
      }
      const picks = [...sel.picks, tile];
      const state = replay(seeds, sel.minesCount, picks); // throws on anything illegal

      const newSel: MinesSelection = { ...sel, picks, lastActionAt: Date.now() };
      const updatedBet = await tx.bet.update({
        where: { id: locked.id },
        data: { selection: newSel as any },
      });

      if (state.phase === 'SETTLED') {
        const settled = await this.applySettlement(tx, locked.id, state);
        return { raced: false as const, settled, state, bet: settled.bet };
      }
      return { raced: false as const, settled: null, state, bet: { ...updatedBet, round: locked.round } };
    });

    if (settledInTx.raced) return this.finalView(roundId, userId);
    if (settledInTx.settled) {
      await this.afterSettle(settledInTx.settled);
      return this.viewOf(settledInTx.settled.bet, settledInTx.settled.round, settledInTx.state!, {
        balance: settledInTx.settled.balance,
      });
    }
    const b = settledInTx.bet as any;
    return this.viewOf(b, b.round, settledInTx.state!, {
      balance: await this.balanceOf(userId, b.currency, b.mode),
    });
  }

  /** Cash out at the current multiplier (requires at least one safe open). */
  async cashout(userId: string, roundId: string) {
    const bet = await this.betOf(userId, roundId);
    if (!bet) throw new NotFoundException('ROUND_NOT_FOUND');
    // Idempotency: a cashout landing on an already settled round returns the
    // final view instead of erroring (same as a ponyjack action).
    if (bet.status !== 'PENDING') return this.finalView(roundId, userId);

    const settledInTx = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockPending(tx, bet.id);
      if (!locked) return { raced: true as const, settled: null, state: null };

      const sel = this.selectionOf(locked);
      const seeds = this.seedsOf(bet);
      const live = replay(seeds, sel.minesCount, sel.picks);
      // A log that already ended settles as-is; otherwise cash out (throws
      // MINES_NOTHING_TO_CASHOUT with zero opens).
      const state = live.phase === 'SETTLED' ? live : engineCashout(seeds, sel.minesCount, live);
      const settled = await this.applySettlement(tx, locked.id, state);
      return { raced: false as const, settled, state };
    });

    if (settledInTx.raced) return this.finalView(roundId, userId);
    await this.afterSettle(settledInTx.settled!);
    return this.viewOf(settledInTx.settled!.bet, settledInTx.settled!.round, settledInTx.state!, {
      balance: settledInTx.settled!.balance,
    });
  }

  /** Round state for a (re)connecting client. Never reveals the mines early. */
  async state(userId: string, roundId: string) {
    const bet = await this.betOf(userId, roundId);
    if (!bet) throw new NotFoundException('ROUND_NOT_FOUND');
    if (bet.status !== 'PENDING') return this.finalView(roundId, userId);
    const sel = this.selectionOf(bet);
    const state = replay(this.seedsOf(bet), sel.minesCount, sel.picks);
    return this.viewOf(bet, bet.round, state, {});
  }

  /** The player's still-open board, if any — lets the page re-attach after a reload. */
  async activeRound(userId: string) {
    const bet = await this.pending(userId);
    if (!bet) return { active: false };
    if (await this.sweepIfExpired(bet)) return { active: false };
    const sel = this.selectionOf(bet);
    const state = replay(this.seedsOf(bet), sel.minesCount, sel.picks);
    return { active: true, ...(await this.viewOf(bet, bet.round, state, {})) };
  }

  /** The player's settled rounds, newest first (real money only). */
  async history(userId: string, limit = 30) {
    const rounds = await this.prisma.gameRound.findMany({
      where: {
        userId,
        mode: 'REAL',
        game: { key: 'mines' },
        bets: { none: { status: 'PENDING' } },
      },
      include: { bets: true },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
    return rounds.map((r) => {
      const bet = r.bets[0];
      const sel = (bet?.selection ?? {}) as Partial<MinesSelection>;
      return {
        roundId: r.id,
        status: bet?.status ?? 'LOST',
        minesCount: sel.minesCount ?? null,
        safeCount: r.outcome,
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
   * Safety net for abandoned boards (closed tab, dead connection): pending
   * rounds with no action for MINES_ACTION_TIMEOUT_MS are auto-resolved —
   * cashed out at the current multiplier with ≥1 open, refunded as a PUSH with
   * none — so the player's money is never stuck in-flight.
   */
  @Interval(15_000)
  async sweep() {
    const pending = await this.prisma.bet.findMany({
      where: { status: 'PENDING', game: { key: 'mines' } },
      include: { round: { include: { seed: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    for (const bet of pending) {
      try {
        await this.sweepIfExpired(bet);
      } catch {
        /* next tick retries; settlement is idempotent under the row lock */
      }
    }
  }

  // ── internals ─────────────────────────────────────────────────────────

  private betOf(userId: string, roundId: string) {
    return this.prisma.bet.findFirst({
      where: { roundId, userId, game: { key: 'mines' } },
      include: { round: { include: { seed: true } } },
    });
  }

  private pending(userId: string) {
    return this.prisma.bet.findFirst({
      where: { userId, status: 'PENDING', game: { key: 'mines' } },
      include: { round: { include: { seed: true } } },
    });
  }

  private selectionOf(bet: { selection: any }): MinesSelection {
    const sel = (bet.selection ?? {}) as Partial<MinesSelection>;
    return {
      rtp: Number(sel.rtp) || 0.99,
      minesCount: Number(sel.minesCount) || MINES_MIN,
      picks: Array.isArray(sel.picks) ? (sel.picks as number[]) : [],
      lastActionAt: Number(sel.lastActionAt) || 0,
    };
  }

  private seedsOf(bet: PendingBet): Seeds {
    return {
      serverSeed: bet.round.seed.serverSeed,
      clientSeed: bet.round.clientSeed,
      nonce: bet.round.nonce,
    };
  }

  /**
   * Resolve a round whose action timer ran out: auto-cashout at the current
   * multiplier with ≥1 safe open, stake refund as a PUSH (multiplier 1) with
   * none. Returns true if it settled. Idempotent under the row lock.
   */
  private async sweepIfExpired(bet: PendingBet): Promise<boolean> {
    const sel = this.selectionOf(bet);
    const last = sel.lastActionAt || bet.round.createdAt.getTime();
    if (Date.now() - last < MINES_ACTION_TIMEOUT_MS) return false;
    const seeds = this.seedsOf(bet);
    const settled = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockPending(tx, bet.id);
      if (!locked) return null;
      const cur = this.selectionOf(locked);
      const live = replay(seeds, cur.minesCount, cur.picks);
      const state: MinesState =
        live.phase === 'SETTLED'
          ? live
          : live.safeCount >= 1
            ? engineCashout(seeds, cur.minesCount, live)
            : // nothing opened: refund the stake as a PUSH (win with k=0 pays ×1)
              { ...live, phase: 'SETTLED', win: true, mines: minePositions(seeds, cur.minesCount) };
      return this.applySettlement(tx, locked.id, state);
    });
    if (settled) await this.afterSettle(settled);
    return !!settled;
  }

  /** Row-lock the bet and confirm it is still PENDING (idempotent settlement). */
  private async lockPending(tx: Tx, betId: string) {
    await tx.$queryRawUnsafe('SELECT 1 FROM "Bet" WHERE id = $1 FOR UPDATE', betId);
    const bet = await tx.bet.findUnique({ where: { id: betId }, include: { round: true } });
    return bet && bet.status === 'PENDING' ? bet : null;
  }

  /**
   * The one place money moves at close: pays the cashout, finalizes the bet +
   * round (revealing the layout via the now-public state) and runs the loyalty
   * side-effects — VIP wager track, rakeback, referrals, bonus wagering.
   */
  private async applySettlement(tx: Tx, betId: string, state: MinesState) {
    const bet = await tx.bet.findUnique({ where: { id: betId }, include: { round: true } });
    if (!bet || bet.status === 'WON' || bet.status === 'LOST' || bet.status === 'PUSH') {
      throw new Error('BET_ALREADY_SETTLED');
    }
    const sel = this.selectionOf(bet);
    const cur = await tx.currency.findUnique({ where: { code: bet.currency } });
    const decimals = cur?.decimals ?? 2;
    const usdRate = cur?.usdRate ?? D(1);

    // A win with zero opens exists only as the sweeper's refund: multiplier 1,
    // payout = stake, status PUSH. Any real cashout carries the ladder value.
    const mult = state.win ? (state.safeCount >= 1 ? multiplierFor(sel.minesCount, state.safeCount, sel.rtp) : 1) : 0;
    // Round the credit to the currency's precision (same rule as roulette).
    const payout = state.win ? roundTo(bet.stake.mul(D(mult)), decimals) : D(0);
    if (payout.gt(0)) {
      await this.wallet.apply(tx, {
        userId: bet.userId,
        type: 'WIN',
        currency: bet.currency,
        mode: bet.mode,
        amount: payout,
        refType: 'mines',
        refId: bet.roundId,
        description: state.safeCount >= 1 ? 'Mines cashout' : 'Mines refund',
      });
    }

    const status = !state.win ? 'LOST' : state.safeCount >= 1 ? 'WON' : 'PUSH';
    const updatedBet = await tx.bet.update({
      where: { id: bet.id },
      data: { status, multiplier: D(mult), payout },
    });
    const round = await tx.gameRound.update({
      where: { id: bet.roundId },
      data: {
        // The number of safe opens becomes the public outcome only now.
        outcome: state.safeCount,
        outcomeColor: status === 'WON' ? 'green' : status === 'PUSH' ? 'push' : 'red',
        totalPayout: payout,
      },
    });

    // Loyalty side-effects — REAL money only (demo chips are free play).
    let vipRes: Awaited<ReturnType<VipService['addWager']>> | null = null;
    if (bet.mode === 'REAL') {
      const usd = bet.stake.mul(usdRate).toNumber();
      vipRes = await this.vip.addWager(tx, bet.userId, usd);
      await this.rakeback.accrue(tx, bet.userId, bet.currency, bet.stake, Math.max(0, 1 - sel.rtp));
      await this.referrals.onRoundSettled(tx, bet.userId, bet.currency, bet.mode, bet.stake, payout);
    }
    // Advance bonus wagering after the win is paid, so the balance-wipeout
    // check sees the settled balance (same ordering as roulette).
    const bonusRes = await this.bonuses.onWager(tx, bet.userId, bet.currency, bet.mode, bet.stake, usdRate);

    const balRow = await tx.balance.findUnique({
      where: {
        userId_currency_mode: { userId: bet.userId, currency: bet.currency, mode: bet.mode },
      },
    });

    return {
      bet: updatedBet,
      round,
      state,
      vipRes,
      bonusRes,
      balance: balRow?.amount.toFixed(),
    };
  }

  /** Post-commit broadcasts & notifications — never block the settlement. */
  private async afterSettle(settled: Awaited<ReturnType<MinesService['applySettlement']>>) {
    const { bet, round } = settled;
    const [user, game, cur] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: bet.userId },
        select: { username: true, accountId: true },
      }),
      this.game(),
      this.prisma.currency.findUnique({ where: { code: bet.currency } }),
    ]);
    const usdRate = cur?.usdRate ?? D(1);

    // Per-round bookkeeping: counters, lifetime stats, history prune.
    void this.stats.recordRound({ userId: bet.userId, bets: 1, stake: bet.stake.toFixed() });

    // Public ticker + all-time leaderboards are real-money only, like roulette.
    if (bet.mode === 'REAL' && game) {
      const feed = {
        roundId: round.id,
        game: game.name,
        gameKey: game.key,
        category: game.category,
        username: user?.username,
        accountId: user?.accountId,
        outcome: round.outcome,
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

  private async balanceOf(userId: string, currency: string, mode: WalletMode) {
    const bal = await this.prisma.balance.findUnique({
      where: { userId_currency_mode: { userId, currency, mode } },
    });
    return bal?.amount.toFixed();
  }

  /** The settled round as the client sees it (layout now public). */
  private async finalView(roundId: string, userId: string) {
    const bet = await this.betOf(userId, roundId);
    if (!bet) throw new NotFoundException('ROUND_NOT_FOUND');
    const sel = this.selectionOf(bet);
    const seeds = this.seedsOf(bet);
    let state = replay(seeds, sel.minesCount, sel.picks);
    // A cashed-out round replays as PLAYING (the log never hit a mine) — flip
    // it to the settled shape so the view exposes the layout.
    if (state.phase !== 'SETTLED' && bet.status !== 'PENDING') {
      state = { ...state, phase: 'SETTLED', win: bet.status !== 'LOST', mines: minePositions(seeds, sel.minesCount) };
    }
    return this.viewOf(bet, bet.round, state, {
      balance: await this.balanceOf(userId, bet.currency, bet.mode),
    });
  }

  /**
   * Everything the board UI renders. While the round runs the payload carries
   * the pick log and the ladder — the mine positions exist nowhere in it.
   */
  private async viewOf(
    bet: {
      id: string;
      roundId: string;
      currency: string;
      mode: WalletMode;
      stake: Prisma.Decimal;
      multiplier: Prisma.Decimal;
      payout: Prisma.Decimal;
      status: string;
      selection: any;
    },
    round: { id: string; serverSeedHash: string; clientSeed: string; nonce: number },
    state: MinesState,
    extra: { balance?: string },
  ) {
    const sel = this.selectionOf(bet);
    const cur = await this.prisma.currency.findUnique({ where: { code: bet.currency } });
    const decimals = cur?.decimals ?? 2;
    const playing = state.phase === 'PLAYING';
    const currentMult = state.safeCount >= 1 ? multiplierFor(sel.minesCount, state.safeCount, sel.rtp) : 0;
    const nextMult =
      state.safeCount < MINES_GRID - sel.minesCount
        ? multiplierFor(sel.minesCount, state.safeCount + 1, sel.rtp)
        : null;
    return {
      roundId: round.id,
      phase: playing ? ('PLAYING' as const) : ('SETTLED' as const),
      status: playing ? 'PLAYING' : bet.status,
      minesCount: sel.minesCount,
      picks: state.picks,
      safeCount: state.safeCount,
      currentMultiplier: Number(currentMult.toFixed(4)),
      nextMultiplier: nextMult != null ? Number(nextMult.toFixed(4)) : null,
      cashoutAmount: state.safeCount >= 1 ? roundTo(bet.stake.mul(D(currentMult)), decimals).toFixed() : '0',
      stake: bet.stake.toFixed(),
      currency: bet.currency,
      mode: bet.mode,
      multipliers: multiplierLadder(sel.minesCount, sel.rtp).map((x) => Number(x.toFixed(4))),
      autoCashoutAt: playing ? sel.lastActionAt + MINES_ACTION_TIMEOUT_MS : null,
      serverNow: Date.now(),
      balance: extra.balance,
      // The layout is public only once settled — never while money is in play.
      ...(playing
        ? {}
        : {
            minePositions: state.mines,
            boomTile: state.boomTile,
            multiplier: D(bet.multiplier).toNumber(),
            payout: bet.payout.toFixed(),
          }),
      provablyFair: {
        serverSeedHash: round.serverSeedHash,
        clientSeed: round.clientSeed,
        nonce: round.nonce,
      },
    };
  }
}
