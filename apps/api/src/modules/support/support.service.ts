import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TicketPriority } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const STAFF = ['ADMIN', 'SUPPORT'];

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
  ) {
    return this.prisma.supportTicket.create({
      data: {
        userId,
        subject: dto.subject,
        category: dto.category ?? 'general',
        priority: dto.priority ?? 'NORMAL',
        status: 'OPEN',
        messages: { create: { authorId: userId, authorRole: 'USER', body: dto.message } },
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
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!t) throw new NotFoundException('TICKET_NOT_FOUND');
    if (t.userId !== user.id && !STAFF.includes(user.role)) throw new ForbiddenException();
    return t;
  }

  async reply(user: { id: string; role: string }, id: string, body: string) {
    const t = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('TICKET_NOT_FOUND');
    const isStaff = STAFF.includes(user.role);
    if (t.userId !== user.id && !isStaff) throw new ForbiddenException();

    const msg = await this.prisma.supportMessage.create({
      data: { ticketId: id, authorId: user.id, authorRole: user.role as any, body },
    });
    await this.prisma.supportTicket.update({
      where: { id },
      data: { status: isStaff ? 'ANSWERED' : 'PENDING' },
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
