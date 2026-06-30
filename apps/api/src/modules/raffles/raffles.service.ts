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

export interface RaffleConditionsDto {
  requiresDeposit?: boolean;
  minDeposit?: string | null;
  depositWithinDays?: number | null;
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

  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private notifications: NotificationsService,
    private realtime: RealtimeService,
  ) {}

  async list() {
    const raffles = await this.prisma.raffle.findMany({
      where: { status: { in: ['OPEN', 'DRAWING', 'COMPLETED'] } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 50,
      include: { _count: { select: { entries: true } }, winners: true },
    });
    return raffles.map((r) => this.publicView(r));
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
      audience: r.audience,
      partnerId: r.partnerId,
      serverSeedHash: r.serverSeedHash,
      // serverSeed/clientSeed revealed only once drawn (provably-fair verification)
      serverSeed: r.status === 'COMPLETED' ? r.serverSeed : undefined,
      clientSeed: r.status === 'COMPLETED' ? r.clientSeed : undefined,
      winners: (r.winners ?? []).map((w: any) => ({
        username: w.user?.username,
        accountId: w.user?.accountId,
        prize: w.prize.toFixed(),
        rank: w.rank,
      })),
      createdAt: r.createdAt,
    };
  }

  /**
   * Enforce the raffle's entry conditions for a user. Throws a specific
   * BadRequestException the front-end maps to a localized message.
   */
  private async assertEligible(userId: string, raffle: { id: string; currency: string; audience: RaffleAudience; partnerId: string | null; createdById: string | null; requiresDeposit: boolean; minDeposit: Prisma.Decimal | null; depositWithinDays: number | null }) {
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

    // Deposit gate: a qualifying real-money deposit in the raffle currency,
    // optionally within a recent window and at or above a minimum amount.
    if (raffle.requiresDeposit) {
      const where: Prisma.DepositWhereInput = {
        userId,
        currency: raffle.currency,
        mode: 'REAL',
        status: 'COMPLETED',
      };
      if (raffle.depositWithinDays) {
        const since = new Date(Date.now() - raffle.depositWithinDays * 86_400_000);
        where.createdAt = { gte: since };
      }
      if (raffle.minDeposit) {
        where.amount = { gte: raffle.minDeposit };
      }
      const dep = await this.prisma.deposit.findFirst({ where, select: { id: true } });
      if (!dep) {
        throw new BadRequestException(
          raffle.depositWithinDays ? 'DEPOSIT_RECENT_REQUIRED' : 'DEPOSIT_REQUIRED',
        );
      }
    }
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
        mode: dto.mode ?? 'REAL',
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

    const data: Prisma.RaffleUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.descriptionRu !== undefined) data.descriptionRu = dto.descriptionRu;
    if (dto.descriptionEn !== undefined) data.descriptionEn = dto.descriptionEn;
    if (dto.creatorName !== undefined) data.creatorName = dto.creatorName;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.mode !== undefined) data.mode = dto.mode;
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

  /**
   * Auto-draw: every minute, draw any OPEN raffle whose drawAt has passed and
   * that has at least one entry. The manual draw endpoint stays for debugging.
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
  }

  /** Provably-fair draw: pick N distinct winners weighted by tickets, split the pool. */
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
      await tx.raffle.update({
        where: { id: raffle.id },
        data: { status: 'COMPLETED', clientSeed: cseed, drawAt: new Date() },
      });
    });

    for (const userId of picked) {
      await this.notifications.notify(userId, {
        type: 'RAFFLE',
        titleRu: 'Вы выиграли в розыгрыше!',
        titleEn: 'You won a raffle!',
        bodyRu: `Поздравляем! Приз ${prizeEach.toFixed()} ${raffle.currency} зачислен.`,
        bodyEn: `Congrats! ${prizeEach.toFixed()} ${raffle.currency} has been credited.`,
      });
    }
    this.realtime.raffleUpdate({ raffleId: raffle.id, status: 'COMPLETED' });
    return this.get(raffle.id);
  }
}
