import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RaffleCreatorType, WalletMode } from '@prisma/client';
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

export interface CreateRaffleDto {
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
  closesAt?: string;
}

@Injectable()
export class RafflesService {
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
      closesAt: r.closesAt,
      drawAt: r.drawAt,
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

  async join(userId: string, raffleId: string) {
    const raffle = await this.prisma.raffle.findUnique({ where: { id: raffleId } });
    if (!raffle || raffle.status !== 'OPEN') throw new BadRequestException('RAFFLE_NOT_OPEN');
    if (raffle.closesAt && raffle.closesAt < new Date()) throw new BadRequestException('RAFFLE_CLOSED');

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
        closesAt: dto.closesAt ? new Date(dto.closesAt) : undefined,
      },
    });
  }

  /** Provably-fair draw: pick N distinct winners weighted by tickets, split the pool. */
  async draw(raffleId: string, clientSeed?: string) {
    const raffle = await this.prisma.raffle.findUnique({
      where: { id: raffleId },
      include: { entries: true },
    });
    if (!raffle) throw new NotFoundException('RAFFLE_NOT_FOUND');
    if (raffle.status === 'COMPLETED') throw new BadRequestException('ALREADY_DRAWN');
    if (!raffle.entries.length) throw new BadRequestException('NO_ENTRIES');

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
        titleRu: 'Вы выиграли в розыгрыше! 🎉',
        titleEn: 'You won a raffle! 🎉',
        bodyRu: `Поздравляем! Приз ${prizeEach.toFixed()} ${raffle.currency} зачислен.`,
        bodyEn: `Congrats! ${prizeEach.toFixed()} ${raffle.currency} has been credited.`,
      });
    }
    this.realtime.raffleUpdate({ raffleId: raffle.id, status: 'COMPLETED' });
    return this.get(raffle.id);
  }
}
