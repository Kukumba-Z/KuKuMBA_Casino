import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class GamesService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.game.findMany({
      where: { enabled: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}
