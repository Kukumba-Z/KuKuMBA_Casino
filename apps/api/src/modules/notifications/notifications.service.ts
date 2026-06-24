import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

export interface NotifyInput {
  type?: NotificationType;
  titleRu: string;
  titleEn: string;
  bodyRu: string;
  bodyEn: string;
  data?: any;
}

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
  ) {}

  async notify(userId: string, input: NotifyInput) {
    const n = await this.prisma.notification.create({
      data: {
        userId,
        type: input.type ?? 'SYSTEM',
        titleRu: input.titleRu,
        titleEn: input.titleEn,
        bodyRu: input.bodyRu,
        bodyEn: input.bodyEn,
        data: input.data,
      },
    });
    this.realtime.toUser(userId, 'notification', n);
    return n;
  }

  list(userId: string, opts: { limit?: number; unreadOnly?: boolean } = {}) {
    return this.prisma.notification.findMany({
      where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(opts.limit ?? 50, 100),
    });
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
