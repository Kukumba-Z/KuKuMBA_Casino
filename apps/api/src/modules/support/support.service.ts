import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TicketPriority, TicketStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

// Roles that may read/answer any ticket and move its status. MODERATOR also
// holds tickets.manage, so it's included for parity with the admin surface.
const STAFF = ['ADMIN', 'SUPPORT', 'MODERATOR'];

const FAQ = [
  {
    q: { ru: 'Как пополнить баланс?', en: 'How do I deposit?' },
    a: {
      ru: 'Откройте «Кошелёк» → «Депозит», выберите валюту и сеть, переведите средства на адрес.',
      en: 'Open Wallet → Deposit, pick a currency/network and send funds to the address.',
    },
  },
  {
    q: { ru: 'Честная ли рулетка?', en: 'Is the roulette fair?' },
    a: {
      ru: 'Да. Каждый спин использует provably-fair (HMAC-SHA256), результат можно проверить. RTP — 99%.',
      en: 'Yes. Every spin is provably-fair (HMAC-SHA256) and verifiable. RTP is 99%.',
    },
  },
  {
    q: { ru: 'Как вывести средства?', en: 'How do I withdraw?' },
    a: {
      ru: 'Кошелёк → «Вывод». Заявки проверяются администрацией. Может потребоваться KYC.',
      en: 'Wallet → Withdraw. Requests are reviewed by staff. KYC may be required.',
    },
  },
  {
    q: { ru: 'Что такое VIP и кешбэк?', en: 'What are VIP and cashback?' },
    a: {
      ru: 'Делая ставки, вы получаете VIP-опыт и уровни с рейкбэком и кешбэком от чистых потерь.',
      en: 'Wagering earns VIP XP and levels with rakeback and cashback on net losses.',
    },
  },
];

/** Attachment descriptor persisted with a message (any file type, ≤ size cap). */
export interface AttachmentMeta {
  url: string;
  name: string;
  size: number;
}

@Injectable()
export class SupportService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  faq() {
    return FAQ;
  }

  createTicket(
    userId: string,
    dto: { subject: string; category?: string; message: string; priority?: TicketPriority },
    attachment?: AttachmentMeta,
  ) {
    return this.prisma.supportTicket.create({
      data: {
        userId,
        subject: dto.subject,
        category: dto.category ?? 'general',
        priority: dto.priority ?? 'NORMAL',
        status: 'OPEN',
        messages: {
          create: {
            authorId: userId,
            authorRole: 'USER',
            body: dto.message,
            attachmentUrl: attachment?.url ?? null,
            attachmentName: attachment?.name ?? null,
            attachmentSize: attachment?.size ?? null,
          },
        },
      },
      include: { messages: true },
    });
  }

  myTickets(userId: string) {
    return this.prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { messages: true } } },
    });
  }

  async getTicket(user: { id: string; role: string }, id: string) {
    const t = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        user: { select: { username: true, accountId: true } },
      },
    });
    if (!t) throw new NotFoundException('TICKET_NOT_FOUND');
    if (t.userId !== user.id && !STAFF.includes(user.role)) throw new ForbiddenException();
    return t;
  }

  /** Staff-only status change. Stamps closedAt on CLOSE (drives file retention). */
  async setStatus(user: { id: string; role: string }, id: string, status: TicketStatus) {
    if (!STAFF.includes(user.role)) throw new ForbiddenException();
    if (!Object.values(TicketStatus).includes(status)) throw new BadRequestException('INVALID_STATUS');
    const t = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('TICKET_NOT_FOUND');
    return this.prisma.supportTicket.update({
      where: { id },
      data: { status, closedAt: status === 'CLOSED' ? new Date() : null },
    });
  }

  async reply(user: { id: string; role: string }, id: string, body?: string, attachment?: AttachmentMeta) {
    const t = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('TICKET_NOT_FOUND');
    const isStaff = STAFF.includes(user.role);
    if (t.userId !== user.id && !isStaff) throw new ForbiddenException();
    // A resolved/closed ticket is locked for the user — they can't reopen it by
    // writing. Staff may still reply (which reopens it). To continue, the user
    // opens a new ticket; staff can reopen via a status change.
    if (!isStaff && (t.status === 'RESOLVED' || t.status === 'CLOSED')) {
      throw new BadRequestException('TICKET_LOCKED');
    }
    if (!body?.trim() && !attachment) throw new BadRequestException('EMPTY_REPLY');

    const msg = await this.prisma.supportMessage.create({
      data: {
        ticketId: id,
        authorId: user.id,
        authorRole: user.role as any,
        body: body?.trim() ?? '',
        attachmentUrl: attachment?.url ?? null,
        attachmentName: attachment?.name ?? null,
        attachmentSize: attachment?.size ?? null,
      },
    });
    // A reply is activity, so the ticket is no longer "closed": clear closedAt
    // (and reset the attachment-retention clock) alongside the status bump.
    await this.prisma.supportTicket.update({
      where: { id },
      data: { status: isStaff ? 'ANSWERED' : 'PENDING', closedAt: null },
    });
    if (isStaff && t.userId !== user.id) {
      await this.notifications.notify(t.userId, {
        type: 'SUPPORT',
        titleRu: 'Ответ поддержки',
        titleEn: 'Support replied',
        bodyRu: `Получен ответ по тикету «${t.subject}».`,
        bodyEn: `You received a reply on "${t.subject}".`,
      });
    }
    return msg;
  }
}
