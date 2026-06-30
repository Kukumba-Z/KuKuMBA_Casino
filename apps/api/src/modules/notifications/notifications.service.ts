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

// We keep only the latest N notifications per user — older ones are deleted from
// the server (not just hidden), so notification storage stays bounded as the site
// grows. Enforced on every new notification, with a cron backstop in maintenance.
export const NOTIFICATIONS_KEEP = 20;

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
    await this.trim(userId);
    return n;
  }

  /** Delete this user's notifications beyond the most recent NOTIFICATIONS_KEEP. */
  async trim(userId: string) {
    const keep = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: NOTIFICATIONS_KEEP,
      select: { id: true },
    });
    if (keep.length < NOTIFICATIONS_KEEP) return; // nothing to prune yet
    await this.prisma.notification.deleteMany({
      where: { userId, id: { notIn: keep.map((k) => k.id) } },
    });
  }

  /** Remove a single notification (scoped to its owner). */
  async remove(userId: string, id: string) {
    await this.prisma.notification.deleteMany({ where: { id, userId } });
    return { ok: true };
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
