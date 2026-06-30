import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NOTIFICATIONS_KEEP } from '../notifications/notifications.service';

/** How much history we retain so storage stays bounded as the site grows. */
const CHAT_KEEP_PER_ROOM = 100; // mirrors the 100-message client cap
const ROUNDS_KEEP_PER_USER = 1000; // daily backstop; rounds are also pruned per-round in StatsService

/**
 * Background retention. Chat and game history grow without bound otherwise, so
 * light crons trim each back to a recent window. Kept in one small module so all
 * retention policy lives in a single, discoverable place.
 */
@Injectable()
export class RetentionService {
  private readonly log = new Logger(RetentionService.name);
  constructor(private prisma: PrismaService) {}

  /** Keep only the latest N messages per room. */
  @Cron(CronExpression.EVERY_HOUR)
  async pruneChat() {
    const rooms = await this.prisma.chatMessage.groupBy({ by: ['room'] });
    let removed = 0;
    for (const { room } of rooms) {
      const keep = await this.prisma.chatMessage.findMany({
        where: { room },
        orderBy: { createdAt: 'desc' },
        take: CHAT_KEEP_PER_ROOM,
        select: { id: true },
      });
      const res = await this.prisma.chatMessage.deleteMany({
        where: { room, id: { notIn: keep.map((k) => k.id) } },
      });
      removed += res.count;
    }
    if (removed) this.log.log(`pruned ${removed} old chat messages`);
  }

  /** Keep only the latest N rounds per user (bets cascade-delete with rounds). */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async pruneGameHistory() {
    const removed = await this.prisma.$executeRawUnsafe(
      `DELETE FROM "GameRound" WHERE id IN (
         SELECT id FROM (
           SELECT id, ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt" DESC) AS rn
           FROM "GameRound"
         ) ranked WHERE ranked.rn > $1
       )`,
      ROUNDS_KEEP_PER_USER,
    );
    if (removed) this.log.log(`pruned ${removed} old game rounds`);
  }

  /** Keep only the latest N notifications per user (backstop for the per-create trim). */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async pruneNotifications() {
    const removed = await this.prisma.$executeRawUnsafe(
      `DELETE FROM "Notification" WHERE id IN (
         SELECT id FROM (
           SELECT id, ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt" DESC) AS rn
           FROM "Notification"
         ) ranked WHERE ranked.rn > $1
       )`,
      NOTIFICATIONS_KEEP,
    );
    if (removed) this.log.log(`pruned ${removed} old notifications`);
  }
}
