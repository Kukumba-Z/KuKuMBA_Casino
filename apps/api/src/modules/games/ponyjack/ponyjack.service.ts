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
  availableActions,
  blackjackMultiplier,
  cardValue,
  grossReturnMult,
  handValue,
  isBust,
  autoFinishActions,
  PONYJACK_ACTIONS,
  PonyjackAction,
  PonyjackState,
  replay,
  Seeds,
  winMultiplier,
} from './ponyjack.engine';

type Tx = Prisma.TransactionClient;

/** A pending hand with no action for this long is auto-stood by the sweeper. */
export const PONYJACK_ACTION_TIMEOUT_MS = 120_000;

export interface DealInput {
  stake: number | string;
  currency: string;
  mode: WalletMode;
}

/** The Bet.selection snapshot — the ONLY persisted round state (plus the seed). */
interface PonySelection {
  rtp: number;
  baseStake: string;
  actions: PonyjackAction[];
  lastActionAt: number;
}

/** A PENDING ponyjack bet with everything needed to replay its table. */
type PendingBet = Prisma.BetGetPayload<{ include: { round: { include: { seed: true } } } }>;

/**
 * Ponyjack — single-player blackjack, the card-table sibling of the crash
 * module and its exact server-side mirror:
 *
 *  - every card is provably fair (same seed chain / nonce as roulette; the
 *    per-card cursor is the draw index) and the WHOLE table — dealer hole card
 *    included — is a pure function of the committed seed + the action log, so
 *    nothing secret is ever stored in a queryable column;
 *  - the server replays that function on every read/write: a client can only
 *    submit actions, never state, and an illegal action can't reach the money;
 *  - DOUBLE / SPLIT buy their extra stake inside the action transaction, so a
 *    failed debit rolls the action back atomically;
 *  - abandoned rounds are auto-stood by a sweeper after a generous timeout, so
 *    money can't get stuck in-flight.
 *
 * RTP is admin-tunable per game (Game.rtp), read at deal time and snapshotted
 * on the bet row so an RTP edit never changes a hand already on the table.
 */
@Injectable()
export class PonyjackService {
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
    return this.prisma.game.findUnique({ where: { key: 'ponyjack' } });
  }

  /** Everything the UI needs: RTP, limits and the payout table at that RTP. */
  async info() {
    const game = await this.game();
    const rtp = game?.rtp ?? (await this.settings.rtp());
    return {
      key: 'ponyjack',
      name: game?.name ?? 'Ponyjack',
      rtp,
      houseEdge: Number((1 - rtp).toFixed(4)),
      minBet: game?.minBet?.toFixed() ?? '0.1',
      maxBet: game?.maxBet?.toFixed() ?? '100000',
      enabled: game?.enabled ?? true,
      descriptionRu: game?.descriptionRu,
      descriptionEn: game?.descriptionEn,
      actionTimeoutMs: PONYJACK_ACTION_TIMEOUT_MS,
      bets: [
        {
          type: 'WIN',
          labelRu: 'Победа над дилером',
          labelEn: 'Beat the dealer',
          multiplier: Number(winMultiplier(rtp).toFixed(4)),
        },
        {
          type: 'BLACKJACK',
          labelRu: 'Понижек (21 с раздачи)',
          labelEn: 'Ponyjack (natural 21)',
          multiplier: Number(blackjackMultiplier(rtp).toFixed(4)),
        },
        { type: 'PUSH', labelRu: 'Ничья — возврат ставки', labelEn: 'Push — stake returned', multiplier: 1 },
      ],
    };
  }

  /** Start a round: take the stake, commit the seed, deal. Naturals settle here. */
  async deal(userId: string, dto: DealInput) {
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

    // One table per player: sweep a timed-out round, refuse to stack on a live one.
    const active = await this.pending(userId);
    if (active) {
      const swept = await this.sweepIfExpired(active);
      if (!swept) throw new BadRequestException('PONYJACK_ROUND_ACTIVE');
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
        refType: 'ponyjack',
        description: 'Ponyjack bet',
      });

      // 2) commit the seed and deal — the whole shoe is now fixed
      const seed = await this.pf.consume(tx, userId);
      const seeds: Seeds = { serverSeed: seed.serverSeed, clientSeed: seed.clientSeed, nonce: seed.nonce };
      const state = replay(seeds, []);

      // 3) open the round. outcome/color stay neutral until it settles — the
      //    dealer's hole card must not be readable anywhere while money is in play.
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
      const selection: PonySelection = {
        // RTP snapshot: THIS round always settles at the RTP it was bought at,
        // even if an admin retunes the game mid-hand.
        rtp,
        baseStake: stake.toFixed(),
        actions: [],
        lastActionAt: Date.now(),
      };
      const bet = await tx.bet.create({
        data: {
          roundId: round.id,
          gameId: game.id,
          userId,
          betType: 'PONYJACK',
          selection: selection as any,
          stake,
          currency,
          mode,
          multiplier: D(0),
          payout: D(0),
          status: 'PENDING',
        },
      });

      // 4) a natural on either side settles inside the deal transaction
      if (state.phase === 'SETTLED') {
        const settled = await this.applySettlement(tx, bet.id, state);
        return { round, bet, state, settled, seed };
      }
      return { round, bet, state, settled: null, seed };
    });

    if (result.settled) await this.afterSettle(result.settled);
    return this.viewOf(result.settled?.bet ?? result.bet, result.settled?.round ?? result.round, result.state, {
      balance: result.settled?.balance ?? (await this.balanceOf(userId, currency, mode)),
    });
  }

  /** Apply one player action. Money for DOUBLE/SPLIT moves in the same transaction. */
  async act(userId: string, roundId: string, action: string) {
    if (!PONYJACK_ACTIONS.includes(action as PonyjackAction)) throw new BadRequestException('PJ_UNKNOWN_ACTION');
    const bet = await this.prisma.bet.findFirst({
      where: { roundId, userId, game: { key: 'ponyjack' } },
      include: { round: { include: { seed: true } } },
    });
    if (!bet) throw new NotFoundException('ROUND_NOT_FOUND');
    if (bet.status !== 'PENDING') return this.finalView(bet.roundId, userId);

    const settledInTx = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockPending(tx, bet.id);
      if (!locked) return { raced: true as const, settled: null, state: null, bet: null };

      const sel = this.selectionOf(locked);
      const seeds = this.seedsOf(bet);
      const before = replay(seeds, sel.actions);
      const legal = availableActions(before)[action.toLowerCase() as Lowercase<PonyjackAction>];
      if (!legal) throw new BadRequestException('PJ_ILLEGAL_ACTION');

      // DOUBLE/SPLIT buy one extra base stake; a failed debit rolls it all back.
      const base = D(sel.baseStake);
      if (action === 'DOUBLE' || action === 'SPLIT') {
        await this.wallet.apply(tx, {
          userId,
          type: 'BET',
          currency: locked.currency,
          mode: locked.mode,
          amount: base.neg(),
          refType: 'ponyjack',
          refId: locked.roundId,
          description: action === 'DOUBLE' ? 'Ponyjack double' : 'Ponyjack split',
        });
      }

      const actions = [...sel.actions, action as PonyjackAction];
      const state = replay(seeds, actions); // throws on anything illegal
      const totalStake = base.mul(state.phase === 'SETTLED' ? state.stakeMult : this.liveStakeMult(state));

      const newSel: PonySelection = { ...sel, actions, lastActionAt: Date.now() };
      const updatedBet = await tx.bet.update({
        where: { id: locked.id },
        data: { selection: newSel as any, stake: totalStake },
      });
      const updatedRound = await tx.gameRound.update({
        where: { id: locked.roundId },
        data: { totalStake },
      });

      if (state.phase === 'SETTLED') {
        const settled = await this.applySettlement(tx, locked.id, state);
        return { raced: false as const, settled, state, bet: settled.bet };
      }
      return { raced: false as const, settled: null, state, bet: { ...updatedBet, round: updatedRound } };
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

  /** Round state for a (re)connecting client. Never reveals the hole card early. */
  async state(userId: string, roundId: string) {
    const bet = await this.prisma.bet.findFirst({
      where: { roundId, userId, game: { key: 'ponyjack' } },
      include: { round: { include: { seed: true } } },
    });
    if (!bet) throw new NotFoundException('ROUND_NOT_FOUND');
    if (bet.status !== 'PENDING') return this.finalView(roundId, userId);
    const state = replay(this.seedsOf(bet), this.selectionOf(bet).actions);
    return this.viewOf(bet, bet.round, state, {});
  }

  /** The player's still-open table, if any — lets the page re-attach after a reload. */
  async activeRound(userId: string) {
    const bet = await this.pending(userId);
    if (!bet) return { active: false };
    if (await this.sweepIfExpired(bet)) return { active: false };
    const state = replay(this.seedsOf(bet), this.selectionOf(bet).actions);
    return { active: true, ...(await this.viewOf(bet, bet.round, state, {})) };
  }

  /** The player's settled rounds, newest first (real money only). */
  async history(userId: string, limit = 30) {
    const rounds = await this.prisma.gameRound.findMany({
      where: {
        userId,
        mode: 'REAL',
        game: { key: 'ponyjack' },
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
        status: bet?.status ?? 'LOST',
        dealerTotal: r.outcome,
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
   * Safety net for abandoned tables (closed tab, dead connection): pending
   * hands with no action for PONYJACK_ACTION_TIMEOUT_MS are auto-stood, so the
   * round settles fairly and the player's money is never stuck.
   */
  @Interval(15_000)
  async sweep() {
    const pending = await this.prisma.bet.findMany({
      where: { status: 'PENDING', game: { key: 'ponyjack' } },
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

  private pending(userId: string) {
    return this.prisma.bet.findFirst({
      where: { userId, status: 'PENDING', game: { key: 'ponyjack' } },
      include: { round: { include: { seed: true } } },
    });
  }

  private selectionOf(bet: { selection: any }): PonySelection {
    const sel = (bet.selection ?? {}) as Partial<PonySelection>;
    return {
      rtp: Number(sel.rtp) || 0.995,
      baseStake: String(sel.baseStake ?? '0'),
      actions: Array.isArray(sel.actions) ? (sel.actions as PonyjackAction[]) : [],
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

  /** Total stake multiplier while the round is still open (doubles + split hands). */
  private liveStakeMult(state: PonyjackState): number {
    return state.hands.reduce((sum, h) => sum + h.stakeMult, 0);
  }

  /** Auto-stand a round whose action timer ran out. Returns true if it settled. */
  private async sweepIfExpired(bet: PendingBet): Promise<boolean> {
    const sel = this.selectionOf(bet);
    const last = sel.lastActionAt || bet.round.createdAt.getTime();
    if (Date.now() - last < PONYJACK_ACTION_TIMEOUT_MS) return false;
    const seeds = this.seedsOf(bet);
    const settled = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockPending(tx, bet.id);
      if (!locked) return null;
      const cur = this.selectionOf(locked);
      const actions = autoFinishActions(seeds, cur.actions);
      const state = replay(seeds, actions);
      await tx.bet.update({
        where: { id: locked.id },
        data: { selection: { ...cur, actions, lastActionAt: Date.now() } as any },
      });
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
   * The one place money settles: pays the return, finalizes the bet + round
   * (revealing the dealer's hand via the now-public action log) and runs the
   * loyalty side-effects — VIP wager track, rakeback, referrals, bonus wagering.
   */
  private async applySettlement(tx: Tx, betId: string, state: PonyjackState) {
    const bet = await tx.bet.findUnique({ where: { id: betId }, include: { round: true } });
    if (!bet || bet.status === 'WON' || bet.status === 'LOST' || bet.status === 'PUSH') {
      throw new Error('BET_ALREADY_SETTLED');
    }
    const sel = this.selectionOf(bet);
    const cur = await tx.currency.findUnique({ where: { code: bet.currency } });
    const decimals = cur?.decimals ?? 2;
    const usdRate = cur?.usdRate ?? D(1);

    const base = D(sel.baseStake);
    const totalStake = base.mul(state.stakeMult);
    // Round the credit to the currency's precision (same rule as roulette).
    const payout = roundTo(base.mul(grossReturnMult(state, sel.rtp)), decimals);
    if (payout.gt(0)) {
      await this.wallet.apply(tx, {
        userId: bet.userId,
        type: 'WIN',
        currency: bet.currency,
        mode: bet.mode,
        amount: payout,
        refType: 'ponyjack',
        refId: bet.roundId,
        description: payout.gt(totalStake) ? 'Ponyjack win' : 'Ponyjack push',
      });
    }

    const status = payout.gt(totalStake) ? 'WON' : payout.eq(totalStake) && payout.gt(0) ? 'PUSH' : 'LOST';
    const updatedBet = await tx.bet.update({
      where: { id: bet.id },
      data: {
        status,
        stake: totalStake,
        multiplier: totalStake.gt(0) ? payout.div(totalStake) : D(0),
        payout,
      },
    });
    const round = await tx.gameRound.update({
      where: { id: bet.roundId },
      data: {
        // The dealer's final total becomes public only now.
        outcome: state.dealerTotal,
        outcomeColor: status === 'WON' ? 'green' : status === 'PUSH' ? 'push' : 'red',
        totalStake,
        totalPayout: payout,
      },
    });

    // Loyalty side-effects — REAL money only (demo chips are free play).
    let vipRes: Awaited<ReturnType<VipService['addWager']>> | null = null;
    if (bet.mode === 'REAL') {
      const usd = totalStake.mul(usdRate).toNumber();
      vipRes = await this.vip.addWager(tx, bet.userId, usd);
      await this.rakeback.accrue(tx, bet.userId, bet.currency, totalStake, Math.max(0, 1 - sel.rtp));
      await this.referrals.onRoundSettled(tx, bet.userId, bet.currency, bet.mode, totalStake, payout);
    }
    // Advance bonus wagering after the win is paid, so the balance-wipeout
    // check sees the settled balance (same ordering as roulette).
    const bonusRes = await this.bonuses.onWager(tx, bet.userId, bet.currency, bet.mode, totalStake, usdRate);

    const balRow = await tx.balance.findUnique({
      where: {
        userId_currency_mode: { userId: bet.userId, currency: bet.currency, mode: bet.mode },
      },
    });

    return {
      bet: updatedBet,
      round,
      state,
      totalStake,
      vipRes,
      bonusRes,
      balance: balRow?.amount.toFixed(),
    };
  }

  /** Post-commit broadcasts & notifications — never block the settlement. */
  private async afterSettle(settled: Awaited<ReturnType<PonyjackService['applySettlement']>>) {
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

    // Per-round bookkeeping: counters, lifetime stats, history prune. Counted at
    // settlement so doubles/splits are included in the wagered total.
    void this.stats.recordRound({ userId: bet.userId, bets: 1, stake: settled.totalStake.toFixed() });

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

  /** The settled round as the client sees it (dealer hand now public). */
  private async finalView(roundId: string, userId: string) {
    const bet = await this.prisma.bet.findFirst({
      where: { roundId, userId, game: { key: 'ponyjack' } },
      include: { round: { include: { seed: true } } },
    });
    if (!bet) throw new NotFoundException('ROUND_NOT_FOUND');
    const state = replay(this.seedsOf(bet), this.selectionOf(bet).actions);
    return this.viewOf(bet, bet.round, state, {
      balance: await this.balanceOf(userId, bet.currency, bet.mode),
    });
  }

  /**
   * Everything the table UI renders. While the round runs the dealer shows only
   * the up card — the hole card exists nowhere in the payload.
   */
  private async viewOf(
    bet: { id: string; currency: string; mode: WalletMode; payout: Prisma.Decimal; stake: Prisma.Decimal; status: string; selection: any },
    round: { id: string; serverSeedHash: string; clientSeed: string; nonce: number },
    state: PonyjackState,
    extra: { balance?: string },
  ) {
    const sel = this.selectionOf(bet);
    const playing = state.phase === 'PLAYER';
    const base = D(sel.baseStake);
    const totalStake = base.mul(playing ? this.liveStakeMult(state) : state.stakeMult);
    return {
      roundId: round.id,
      phase: state.phase,
      status: playing ? 'PLAYING' : bet.status,
      hands: state.hands.map((h) => ({
        cards: h.cards,
        ...handValue(h.cards),
        busted: isBust(h.cards),
        doubled: h.doubled,
        fromSplit: h.fromSplit,
        done: h.done,
        result: h.result ?? null,
      })),
      // Named activeHand (not `active`) so /active's boolean flag survives the spread.
      activeHand: state.active,
      actions: availableActions(state),
      dealer: playing
        ? { cards: [state.dealer[0]], hiddenCount: 1, total: cardValue(state.dealer[0]), hidden: true }
        : { cards: state.dealer, hiddenCount: 0, ...handValue(state.dealer), hidden: false },
      stake: base.toFixed(),
      totalStake: totalStake.toFixed(),
      payout: playing ? '0' : bet.payout.toFixed(),
      currency: bet.currency,
      mode: bet.mode,
      multipliers: {
        win: Number(winMultiplier(sel.rtp).toFixed(4)),
        blackjack: Number(blackjackMultiplier(sel.rtp).toFixed(4)),
      },
      autoStandAt: playing ? sel.lastActionAt + PONYJACK_ACTION_TIMEOUT_MS : null,
      serverNow: Date.now(),
      balance: extra.balance,
      provablyFair: {
        serverSeedHash: round.serverSeedHash,
        clientSeed: round.clientSeed,
        nonce: round.nonce,
      },
    };
  }
}
