import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, RaffleAudience, RaffleCreatorType, WalletMode } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { D } from '../../common/utils/money';
import { NotificationsService } from '../notifications/notifications.service';
import {
  floatFromSeeds,
  genClientSeed,
  genServerSeed,
  hashServerSeed,
} from '../provably-fair/provably-fair.crypto';
import { RealtimeService } from '../realtime/realtime.service';
import { WalletService } from '../wallet/wallet.service';

/** Allowed qualifying-deposit windows (days). Kept here so the API and the admin UI agree. */
export const DEPOSIT_WINDOWS = [1, 7, 14, 30] as const;

/** How many completed raffles we keep in storage; older ones are pruned. */
export const COMPLETED_KEEP = 20;

export interface RaffleConditionsDto {
  requiresDeposit?: boolean;
  minDeposit?: string | null;
  depositWithinDays?: number | null;
  minVipLevel?: number | null;
  audience?: RaffleAudience;
  partnerId?: string | null;
}

export interface CreateRaffleDto extends RaffleConditionsDto {
  title: string;
  descriptionRu?: string;
  descriptionEn?: string;
  creatorType?: RaffleCreatorType;
  creatorName?: string;
  currency: string;
  mode?: WalletMode;
  prizePool: string;
  winnersCount?: number;
  entryCost?: string;
  maxEntriesPerUser?: number;
  opensAt?: string;
  closesAt?: string;
  drawAt?: string;
}

export interface UpdateRaffleDto extends RaffleConditionsDto {
  title?: string;
  descriptionRu?: string;
  descriptionEn?: string;
  creatorName?: string;
  currency?: string;
  mode?: WalletMode;
  prizePool?: string;
  winnersCount?: number;
  entryCost?: string;
  maxEntriesPerUser?: number;
  opensAt?: string | null;
  closesAt?: string | null;
  drawAt?: string | null;
}

@Injectable()
export class RafflesService {
  private readonly log = new Logger(RafflesService.name);
  /** Pending reveal timers, so a draw flips to COMPLETED only after the reel lands. */
  private readonly finalizeTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private notifications: NotificationsService,
    private realtime: RealtimeService,
  ) {}

  async list() {
    // Active raffles always show; completed ones are capped at the newest COMPLETED_KEEP.
    const [active, completed] = await Promise.all([
      this.prisma.raffle.findMany({
        where: { status: { in: ['OPEN', 'DRAWING'] } },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { entries: true } }, winners: true },
      }),
      this.prisma.raffle.findMany({
        where: { status: 'COMPLETED' },
        orderBy: { drawAt: 'desc' },
        take: COMPLETED_KEEP,
        include: { _count: { select: { entries: true } }, winners: true },
      }),
    ]);
    return [...active, ...completed].map((r) => this.publicView(r));
  }

  async get(id: string, userId?: string) {
    const r = await this.prisma.raffle.findUnique({
      where: { id },
      include: {
        _count: { select: { entries: true } },
        winners: { include: { user: { select: { username: true, accountId: true } } } },
        entries: userId ? { where: { userId } } : false,
      },
    });
    if (!r) throw new NotFoundException('RAFFLE_NOT_FOUND');
    const view = this.publicView(r);
    (view as any).myTickets = userId ? r.entries?.reduce((s, e) => s + e.tickets, 0) ?? 0 : 0;
    return view;
  }

  /** Distinct participant handles, used by the front-end draw animation. Capped for safety. */
  async participants(id: string) {
    const rows = await this.prisma.raffleEntry.findMany({
      where: { raffleId: id },
      distinct: ['userId'],
      take: 500,
      orderBy: { createdAt: 'asc' },
      select: { user: { select: { username: true, accountId: true } } },
    });
    return rows.map((r) => ({ username: r.user.username, accountId: r.user.accountId }));
  }

  /** The current user's ticket count in a raffle — drives the "you're in" button state. */
  async myEntry(userId: string, raffleId: string) {
    const agg = await this.prisma.raffleEntry.aggregate({
      where: { raffleId, userId },
      _sum: { tickets: true },
    });
    return { tickets: agg._sum.tickets ?? 0 };
  }

  private publicView(r: any) {
    return {
      id: r.id,
      title: r.title,
      descriptionRu: r.descriptionRu,
      descriptionEn: r.descriptionEn,
      creatorType: r.creatorType,
      creatorName: r.creatorName,
      currency: r.currency,
      mode: r.mode,
      prizePool: r.prizePool.toFixed(),
      winnersCount: r.winnersCount,
      entryCost: r.entryCost.toFixed(),
      maxEntriesPerUser: r.maxEntriesPerUser,
      status: r.status,
      participants: r._count?.entries ?? 0,
      opensAt: r.opensAt,
      closesAt: r.closesAt,
      drawAt: r.drawAt,
      // entry conditions
      requiresDeposit: r.requiresDeposit,
      minDeposit: r.minDeposit ? r.minDeposit.toFixed() : null,
      depositWithinDays: r.depositWithinDays,
      minVipLevel: r.minVipLevel,
      audience: r.audience,
      partnerId: r.partnerId,
      serverSeedHash: r.serverSeedHash,
      // serverSeed/clientSeed revealed only once drawn (provably-fair verification)
      serverSeed: r.status === 'COMPLETED' ? r.serverSeed : undefined,
      clientSeed: r.status === 'COMPLETED' ? r.clientSeed : undefined,
      // Winners stay hidden until COMPLETED so an in-progress draw keeps its suspense;
      // live viewers receive them over the socket for the synchronized reel instead.
      winners:
        r.status === 'COMPLETED'
          ? (r.winners ?? []).map((w: any) => ({
              username: w.user?.username,
              accountId: w.user?.accountId,
              prize: w.prize.toFixed(),
              rank: w.rank,
            }))
          : [],
      createdAt: r.createdAt,
    };
  }

  /**
   * Enforce the raffle's entry conditions for a user. Throws a specific
   * BadRequestException the front-end maps to a localized message.
   */
  private async assertEligible(userId: string, raffle: { id: string; currency: string; audience: RaffleAudience; partnerId: string | null; createdById: string | null; requiresDeposit: boolean; minDeposit: Prisma.Decimal | null; depositWithinDays: number | null; minVipLevel: number | null }) {
    // Audience gate: partner-referrals raffles are only open to that partner's referrals.
    if (raffle.audience === 'PARTNER_REFERRALS') {
      const partnerId = raffle.partnerId ?? raffle.createdById;
      const me = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { referredById: true },
      });
      if (!partnerId || me?.referredById !== partnerId) {
        throw new BadRequestException('NOT_PARTNER_REFERRAL');
      }
    }

    // VIP gate: exclusive raffles need a VIP status of the given level or higher.
    if (raffle.minVipLevel != null && raffle.minVipLevel > 0) {
      const me = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { vipLevel: true },
      });
      if ((me?.vipLevel ?? 0) < raffle.minVipLevel) {
        throw new BadRequestException('VIP_LEVEL_REQUIRED');
      }
    }

    // Deposit gate: at least one qualifying real-money deposit, optionally within
    // a recent window. The minimum is denominated in USD, so a deposit in ANY
    // currency counts once converted to USD via the currency's usdRate.
    if (raffle.requiresDeposit) {
      const where: Prisma.DepositWhereInput = {
        userId,
        mode: 'REAL',
        status: 'COMPLETED',
      };
      if (raffle.depositWithinDays) {
        const since = new Date(Date.now() - raffle.depositWithinDays * 86_400_000);
        where.createdAt = { gte: since };
      }
      const fail = raffle.depositWithinDays ? 'DEPOSIT_RECENT_REQUIRED' : 'DEPOSIT_REQUIRED';
      // The largest deposit per currency is the best qualifying candidate.
      const byCurrency = await this.prisma.deposit.groupBy({
        by: ['currency'],
        where,
        _max: { amount: true },
      });
      if (!byCurrency.length) throw new BadRequestException(fail);
      if (raffle.minDeposit) {
        const rates = await this.usdRates();
        const meetsUsd = byCurrency.some((g) => {
          const max = g._max.amount;
          if (!max) return false;
          const rate = rates.get(g.currency) ?? D(0);
          return D(max).mul(rate).gte(raffle.minDeposit!); // USD-equivalent
        });
        if (!meetsUsd) throw new BadRequestException(fail);
      }
    }
  }

  /** A raffle prize must be a real, enabled fiat currency — never demo coins. */
  private async assertRaffleCurrency(code: string) {
    const cur = await this.prisma.currency.findUnique({ where: { code } });
    if (!cur || !cur.enabled || cur.type === 'DEMO') {
      throw new BadRequestException('RAFFLE_CURRENCY_INVALID');
    }
  }

  /** Map of currency code → USD rate (1 unit = X USD), for cross-currency thresholds. */
  private async usdRates(): Promise<Map<string, Prisma.Decimal>> {
    const curs = await this.prisma.currency.findMany({ select: { code: true, usdRate: true } });
    return new Map(curs.map((c) => [c.code, c.usdRate]));
  }

  async join(userId: string, raffleId: string) {
    const raffle = await this.prisma.raffle.findUnique({ where: { id: raffleId } });
    if (!raffle || raffle.status !== 'OPEN') throw new BadRequestException('RAFFLE_NOT_OPEN');
    if (raffle.opensAt && raffle.opensAt > new Date()) throw new BadRequestException('RAFFLE_NOT_OPEN');
    if (raffle.closesAt && raffle.closesAt < new Date()) throw new BadRequestException('RAFFLE_CLOSED');

    await this.assertEligible(userId, raffle);

    const mine = await this.prisma.raffleEntry.aggregate({
      where: { raffleId, userId },
      _sum: { tickets: true },
    });
    if ((mine._sum.tickets ?? 0) >= raffle.maxEntriesPerUser) {
      throw new BadRequestException('MAX_ENTRIES_REACHED');
    }

    await this.prisma.$transaction(async (tx) => {
      if (D(raffle.entryCost).gt(0)) {
        await this.wallet.apply(tx, {
          userId,
          type: 'RAFFLE_ENTRY',
          currency: raffle.currency,
          mode: raffle.mode,
          amount: D(raffle.entryCost).neg(),
          refType: 'raffle',
          refId: raffle.id,
          description: `Raffle entry: ${raffle.title}`,
        });
      }
      await tx.raffleEntry.create({ data: { raffleId, userId, tickets: 1 } });
    });

    const count = await this.prisma.raffleEntry.count({ where: { raffleId } });
    this.realtime.raffleUpdate({ raffleId, participants: count });
    return { ok: true, participants: count };
  }

  async create(adminId: string, dto: CreateRaffleDto) {
    await this.assertRaffleCurrency(dto.currency);
    const serverSeed = genServerSeed();
    const audience = dto.audience ?? 'ALL';
    // A partner raffle for "my referrals" defaults the partner to the creator.
    const partnerId = audience === 'PARTNER_REFERRALS' ? dto.partnerId ?? adminId : null;
    return this.prisma.raffle.create({
      data: {
        title: dto.title,
        descriptionRu: dto.descriptionRu,
        descriptionEn: dto.descriptionEn,
        creatorType: dto.creatorType ?? 'ADMIN',
        creatorName: dto.creatorName,
        createdById: adminId,
        currency: dto.currency,
        mode: 'REAL', // raffles pay out real fiat — no demo-coin giveaways
        prizePool: D(dto.prizePool),
        winnersCount: Math.max(1, dto.winnersCount ?? 1),
        entryCost: D(dto.entryCost ?? 0),
        maxEntriesPerUser: Math.max(1, dto.maxEntriesPerUser ?? 1),
        status: 'OPEN',
        serverSeed,
        serverSeedHash: hashServerSeed(serverSeed),
        opensAt: dto.opensAt ? new Date(dto.opensAt) : undefined,
        closesAt: dto.closesAt ? new Date(dto.closesAt) : undefined,
        drawAt: dto.drawAt ? new Date(dto.drawAt) : undefined,
        requiresDeposit: dto.requiresDeposit ?? false,
        minDeposit: this.normMinDeposit(dto.minDeposit),
        depositWithinDays: this.normWindow(dto.depositWithinDays),
        minVipLevel: this.normVipLevel(dto.minVipLevel),
        audience,
        partnerId,
      },
    });
  }

  async update(id: string, dto: UpdateRaffleDto) {
    const raffle = await this.prisma.raffle.findUnique({ where: { id } });
    if (!raffle) throw new NotFoundException('RAFFLE_NOT_FOUND');
    if (raffle.status === 'COMPLETED' || raffle.status === 'CANCELLED') {
      throw new BadRequestException('RAFFLE_LOCKED');
    }

    if (dto.currency !== undefined) await this.assertRaffleCurrency(dto.currency);

    const data: Prisma.RaffleUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.descriptionRu !== undefined) data.descriptionRu = dto.descriptionRu;
    if (dto.descriptionEn !== undefined) data.descriptionEn = dto.descriptionEn;
    if (dto.creatorName !== undefined) data.creatorName = dto.creatorName;
    if (dto.currency !== undefined) data.currency = dto.currency;
    // Raffles always pay real fiat; ignore any DEMO mode from older clients.
    if (dto.mode !== undefined) data.mode = 'REAL';
    if (dto.prizePool !== undefined) data.prizePool = D(dto.prizePool);
    if (dto.winnersCount !== undefined) data.winnersCount = Math.max(1, dto.winnersCount);
    if (dto.entryCost !== undefined) data.entryCost = D(dto.entryCost);
    if (dto.maxEntriesPerUser !== undefined) data.maxEntriesPerUser = Math.max(1, dto.maxEntriesPerUser);
    if (dto.opensAt !== undefined) data.opensAt = dto.opensAt ? new Date(dto.opensAt) : null;
    if (dto.closesAt !== undefined) data.closesAt = dto.closesAt ? new Date(dto.closesAt) : null;
    if (dto.drawAt !== undefined) data.drawAt = dto.drawAt ? new Date(dto.drawAt) : null;
    if (dto.requiresDeposit !== undefined) data.requiresDeposit = dto.requiresDeposit;
    if (dto.minDeposit !== undefined) data.minDeposit = this.normMinDeposit(dto.minDeposit);
    if (dto.depositWithinDays !== undefined) data.depositWithinDays = this.normWindow(dto.depositWithinDays);
    if (dto.minVipLevel !== undefined) data.minVipLevel = this.normVipLevel(dto.minVipLevel);
    if (dto.audience !== undefined) {
      data.audience = dto.audience;
      // Keep partnerId coherent with the audience.
      if (dto.audience === 'PARTNER_REFERRALS') {
        data.partnerId = dto.partnerId ?? raffle.partnerId ?? raffle.createdById;
      } else {
        data.partnerId = null;
      }
    } else if (dto.partnerId !== undefined) {
      data.partnerId = dto.partnerId;
    }

    await this.prisma.raffle.update({ where: { id }, data });
    return this.get(id);
  }

  /** Cancel an undrawn raffle and refund any paid entry fees. */
  async cancel(id: string) {
    const raffle = await this.prisma.raffle.findUnique({
      where: { id },
      include: { entries: true },
    });
    if (!raffle) throw new NotFoundException('RAFFLE_NOT_FOUND');
    if (raffle.status === 'COMPLETED') throw new BadRequestException('ALREADY_DRAWN');
    if (raffle.status === 'CANCELLED') return this.get(id);

    await this.prisma.$transaction(async (tx) => {
      if (D(raffle.entryCost).gt(0)) {
        // Refund every paid ticket so cancelling never costs a player money.
        for (const e of raffle.entries) {
          await this.wallet.apply(tx, {
            userId: e.userId,
            type: 'REFUND',
            currency: raffle.currency,
            mode: raffle.mode,
            amount: D(raffle.entryCost).mul(e.tickets),
            refType: 'raffle',
            refId: raffle.id,
            description: `Raffle cancelled: ${raffle.title}`,
          });
        }
      }
      await tx.raffle.update({ where: { id }, data: { status: 'CANCELLED' } });
    });

    this.realtime.raffleUpdate({ raffleId: id, status: 'CANCELLED' });
    return this.get(id);
  }

  private normMinDeposit(v?: string | null): Prisma.Decimal | null {
    if (v === undefined || v === null || v === '') return null;
    const d = D(v);
    return d.gt(0) ? d : null;
  }

  private normWindow(v?: number | null): number | null {
    if (v === undefined || v === null) return null;
    return (DEPOSIT_WINDOWS as readonly number[]).includes(v) ? v : null;
  }

  /** VIP entry threshold: a positive integer level, anything else = no gate. */
  private normVipLevel(v?: number | null): number | null {
    if (v === undefined || v === null) return null;
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /**
   * Auto-draw + recovery, every minute:
   *  - draw any OPEN raffle whose drawAt has passed and that has ≥1 entry;
   *  - finalize any raffle stuck in DRAWING whose reveal timer was lost (e.g. a
   *    process restart mid-reveal), so winners are never left unannounced.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async autoDraw() {
    const due = await this.prisma.raffle.findMany({
      where: { status: 'OPEN', drawAt: { not: null, lte: new Date() } },
      select: { id: true, _count: { select: { entries: true } } },
      take: 20,
    });
    for (const r of due) {
      if (r._count.entries === 0) continue; // nothing to draw yet; leave it open
      try {
        await this.draw(r.id);
      } catch (e) {
        this.log.warn(`auto-draw failed for ${r.id}: ${(e as Error).message}`);
      }
    }

    // Recover draws whose in-memory reveal timer never fired (grace > max reveal).
    const stuck = await this.prisma.raffle.findMany({
      where: { status: 'DRAWING', drawAt: { lt: new Date(Date.now() - 90_000) } },
      select: { id: true },
      take: 20,
    });
    for (const r of stuck) {
      await this.finalizeDraw(r.id).catch((e) =>
        this.log.warn(`finalize failed for ${r.id}: ${(e as Error).message}`),
      );
    }
  }

  /**
   * Provably-fair draw. Picks N distinct winners weighted by tickets and credits
   * their prizes immediately (money is never at risk of being lost), but keeps the
   * raffle in DRAWING and broadcasts a live "spin" so every viewer watches the same
   * reel in real time. Winners and win notifications are only revealed once the reel
   * lands — see finalizeDraw — so the suspense isn't spoiled.
   */
  async draw(raffleId: string, clientSeed?: string) {
    const raffle = await this.prisma.raffle.findUnique({
      where: { id: raffleId },
      include: { entries: true },
    });
    if (!raffle) throw new NotFoundException('RAFFLE_NOT_FOUND');
    if (raffle.status === 'COMPLETED' || raffle.status === 'CANCELLED') {
      throw new BadRequestException('ALREADY_DRAWN');
    }
    if (!raffle.entries.length) throw new BadRequestException('NO_ENTRIES');

    // Claim the draw atomically (OPEN → DRAWING). Guarantees a single drawer even
    // if two cron ticks or a debug click race; the loser sees count 0 and aborts.
    const claim = await this.prisma.raffle.updateMany({
      where: { id: raffleId, status: 'OPEN' },
      data: { status: 'DRAWING' },
    });
    if (claim.count === 0) throw new BadRequestException('ALREADY_DRAWN');

    // aggregate tickets per user
    const ticketsByUser = new Map<string, number>();
    for (const e of raffle.entries) {
      ticketsByUser.set(e.userId, (ticketsByUser.get(e.userId) ?? 0) + e.tickets);
    }
    const participantCount = ticketsByUser.size;
    let pool = [...ticketsByUser.entries()].map(([userId, tickets]) => ({ userId, tickets }));
    const winnersCount = Math.min(raffle.winnersCount, pool.length);
    const cseed = clientSeed || genClientSeed();

    const picked: string[] = [];
    for (let i = 0; i < winnersCount; i++) {
      const total = pool.reduce((s, p) => s + p.tickets, 0);
      let target = floatFromSeeds(raffle.serverSeed!, cseed, i) * total;
      let idx = 0;
      for (; idx < pool.length; idx++) {
        target -= pool[idx].tickets;
        if (target < 0) break;
      }
      const winner = pool[Math.min(idx, pool.length - 1)];
      picked.push(winner.userId);
      pool = pool.filter((p) => p.userId !== winner.userId); // no duplicate winners
    }

    const prizeEach = D(raffle.prizePool).div(winnersCount);
    await this.prisma.$transaction(async (tx) => {
      for (let rank = 0; rank < picked.length; rank++) {
        const userId = picked[rank];
        await this.wallet.apply(tx, {
          userId,
          type: 'RAFFLE_PRIZE',
          currency: raffle.currency,
          mode: raffle.mode,
          amount: prizeEach,
          refType: 'raffle',
          refId: raffle.id,
          description: `Raffle prize: ${raffle.title}`,
        });
        await tx.raffleWinner.create({
          data: { raffleId: raffle.id, userId, prize: prizeEach, rank: rank + 1 },
        });
      }
      // Stay in DRAWING; finalizeDraw flips to COMPLETED after the reveal window.
      await tx.raffle.update({
        where: { id: raffle.id },
        data: { clientSeed: cseed, drawAt: new Date() },
      });
    });

    // Broadcast the live reel: winners + participant handles so every open client
    // spins the same wheel at the same time. Reveal length mirrors the front-end.
    const winnerRows = await this.prisma.raffleWinner.findMany({
      where: { raffleId: raffle.id },
      include: { user: { select: { username: true, accountId: true } } },
      orderBy: { rank: 'asc' },
    });
    const winnersView = winnerRows.map((w) => ({
      username: w.user.username,
      accountId: w.user.accountId,
      prize: w.prize.toFixed(),
      rank: w.rank,
    }));
    const participants = await this.participants(raffle.id);
    const revealMs = this.revealMs(winnersCount, participantCount);
    this.realtime.raffleUpdate({
      raffleId: raffle.id,
      status: 'DRAWING',
      phase: 'draw',
      startAt: Date.now(),
      durationMs: revealMs,
      currency: raffle.currency,
      winners: winnersView,
      participants,
    });
    this.scheduleFinalize(raffle.id, revealMs);

    return this.get(raffle.id); // DRAWING view — winners stay hidden until the reel lands
  }

  /** Reveal window, mirroring the front-end reel: one eased spin per winner. */
  private revealMs(winnersCount: number, participantCount: number): number {
    const speedTier = 1 + Math.floor(participantCount / 50);
    const spinSec = Math.min(6, 3 + speedTier * 0.35);
    return Math.min(60_000, Math.ceil(winnersCount * (spinSec + 0.85) * 1000) + 1500);
  }

  private scheduleFinalize(raffleId: string, delayMs: number) {
    const prev = this.finalizeTimers.get(raffleId);
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => {
      this.finalizeTimers.delete(raffleId);
      this.finalizeDraw(raffleId).catch((e) =>
        this.log.warn(`finalize failed for ${raffleId}: ${(e as Error).message}`),
      );
    }, delayMs);
    this.finalizeTimers.set(raffleId, timer);
  }

  /** Flip DRAWING → COMPLETED, notify winners and prune old raffles. Idempotent. */
  private async finalizeDraw(raffleId: string) {
    const claimed = await this.prisma.raffle.updateMany({
      where: { id: raffleId, status: 'DRAWING' },
      data: { status: 'COMPLETED' },
    });
    if (claimed.count === 0) return; // already finalized by another path

    const r = await this.prisma.raffle.findUnique({
      where: { id: raffleId },
      include: { winners: true },
    });
    if (!r) return;
    for (const w of r.winners) {
      await this.notifications.notify(w.userId, {
        type: 'RAFFLE',
        titleRu: 'Вы выиграли в розыгрыше!',
        titleEn: 'You won a raffle!',
        bodyRu: `Поздравляем! Приз ${w.prize.toFixed()} ${r.currency} зачислен.`,
        bodyEn: `Congrats! ${w.prize.toFixed()} ${r.currency} has been credited.`,
      });
    }
    this.realtime.raffleUpdate({ raffleId, status: 'COMPLETED' });
    await this.pruneCompleted();
  }

  /**
   * Keep only the newest COMPLETED_KEEP completed raffles; hard-delete the rest so
   * old draws don't pile up in storage. Entries and winners cascade-delete with them.
   */
  private async pruneCompleted() {
    const stale = await this.prisma.raffle.findMany({
      where: { status: 'COMPLETED' },
      orderBy: { drawAt: 'desc' },
      skip: COMPLETED_KEEP,
      select: { id: true },
    });
    if (!stale.length) return;
    await this.prisma.raffle.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    this.log.log(`pruned ${stale.length} old completed raffle(s)`);
  }
}
