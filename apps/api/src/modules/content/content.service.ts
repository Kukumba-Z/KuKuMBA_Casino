import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ContentService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.contentPage.findMany({
      select: { key: true, locale: true, title: true, updatedAt: true },
      orderBy: [{ key: 'asc' }, { locale: 'asc' }],
    });
  }

  async page(key: string, locale = 'ru') {
    const page =
      (await this.prisma.contentPage.findUnique({ where: { key_locale: { key, locale } } })) ||
      (await this.prisma.contentPage.findFirst({ where: { key } }));
    if (!page) throw new NotFoundException('PAGE_NOT_FOUND');
    return page;
  }
}
