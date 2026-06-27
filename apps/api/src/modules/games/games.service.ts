import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface GameFilter {
  category?: string;
  provider?: string;
  status?: string;
  q?: string;
}

/** Shape exposed to the client — flat, UI-ready, no Decimal/internal noise. */
function toCard(g: {
  key: string;
  name: string;
  type: string;
  category: string;
  provider: string;
  status: string;
  route: string | null;
  rtp: number;
  thumbnail: string | null;
  descriptionRu: string | null;
  descriptionEn: string | null;
}) {
  return {
    key: g.key,
    name: g.name,
    type: g.type,
    category: g.category,
    provider: g.provider,
    status: g.status,
    route: g.route,
    rtp: g.rtp,
    rtpPercent: Number((g.rtp * 100).toFixed(2)),
    thumbnail: g.thumbnail,
    descriptionRu: g.descriptionRu,
    descriptionEn: g.descriptionEn,
  };
}

@Injectable()
export class GamesService {
  constructor(private prisma: PrismaService) {}

  /** Catalog list, optionally filtered by category/provider/status/search query. */
  async list(filter: GameFilter = {}) {
    const where: Prisma.GameWhereInput = { enabled: true };
    if (filter.category && filter.category !== 'ALL') where.category = filter.category;
    if (filter.provider && filter.provider !== 'ALL') where.provider = filter.provider;
    if (filter.status && filter.status !== 'ALL') where.status = filter.status;
    if (filter.q?.trim()) {
      const q = filter.q.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { provider: { contains: q, mode: 'insensitive' } },
      ];
    }
    const games = await this.prisma.game.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return games.map(toCard);
  }

  /** Distinct categories & providers (with counts) for building filter chips. */
  async filters() {
    const [byCategory, byProvider] = await Promise.all([
      this.prisma.game.groupBy({ by: ['category'], where: { enabled: true }, _count: { _all: true } }),
      this.prisma.game.groupBy({ by: ['provider'], where: { enabled: true }, _count: { _all: true } }),
    ]);
    return {
      categories: byCategory
        .map((c) => ({ key: c.category, count: c._count._all }))
        .sort((a, b) => b.count - a.count),
      providers: byProvider
        .map((p) => ({ key: p.provider, count: p._count._all }))
        .sort((a, b) => b.count - a.count),
    };
  }
}
