import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';

// How long attachment FILES survive after a ticket is closed. The ticket and
// its messages are kept forever; only the on-disk media is reclaimed. Env-driven.
const DEFAULT_TTL_DAYS = 10;

/**
 * Background cleanup of support attachments. Once a ticket has been closed for
 * SUPPORT_ATTACHMENT_TTL_DAYS days, its uploaded photos/videos are deleted from
 * disk and the now-dead attachmentUrl is nulled — the conversation record stays.
 */
@Injectable()
export class SupportRetentionService {
  private readonly log = new Logger(SupportRetentionService.name);
  constructor(
    private prisma: PrismaService,
    private uploads: UploadsService,
  ) {}

  private ttlDays(): number {
    const d = Number(process.env.SUPPORT_ATTACHMENT_TTL_DAYS);
    return Number.isFinite(d) && d > 0 ? d : DEFAULT_TTL_DAYS;
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneClosedTicketAttachments() {
    const cutoff = new Date(Date.now() - this.ttlDays() * 24 * 60 * 60 * 1000);
    const messages = await this.prisma.supportMessage.findMany({
      where: {
        attachmentUrl: { not: null },
        ticket: { status: 'CLOSED', closedAt: { lte: cutoff } },
      },
      select: { id: true, attachmentUrl: true },
    });
    let removed = 0;
    for (const m of messages) {
      this.uploads.removeByPublicUrl(m.attachmentUrl);
      await this.prisma.supportMessage.update({
        where: { id: m.id },
        data: { attachmentUrl: null, attachmentName: null, attachmentSize: null },
      });
      removed++;
    }
    if (removed) this.log.log(`pruned ${removed} support attachment(s) from closed tickets`);
  }
}
