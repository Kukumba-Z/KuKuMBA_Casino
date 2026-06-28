import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
  ) {}

  // Sender's role/VIP/accountId are joined on read (they can change over time)
  // so the client can colour names and open a moderation/profile popover.
  private static readonly USER_SELECT = { accountId: true, role: true, vipLevel: true } as const;

  private view(m: any) {
    return {
      id: m.id,
      room: m.room,
      userId: m.userId,
      username: m.username,
      accountId: m.user?.accountId,
      role: m.user?.role,
      vipLevel: m.user?.vipLevel,
      body: m.body,
      createdAt: m.createdAt,
    };
  }

  async history(room = 'global', limit = 50) {
    const msgs = await this.prisma.chatMessage.findMany({
      where: { room, deleted: false },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      include: { user: { select: ChatService.USER_SELECT } },
    });
    return msgs.reverse().map((m) => this.view(m));
  }

  async send(user: { id: string; username: string }, room: string, rawBody: string) {
    const body = rawBody.trim().slice(0, 500);
    if (!body) throw new BadRequestException('EMPTY_MESSAGE');
    const row = await this.prisma.user.findUnique({ where: { id: user.id }, select: { chatMutedUntil: true } });
    if (row?.chatMutedUntil && row.chatMutedUntil > new Date()) throw new BadRequestException('CHAT_MUTED');
    const msg = await this.prisma.chatMessage.create({
      data: { room: room || 'global', userId: user.id, username: user.username, body },
      include: { user: { select: ChatService.USER_SELECT } },
    });
    const view = this.view(msg);
    this.realtime.chatMessage(view);
    return view;
  }

  async remove(id: string) {
    await this.prisma.chatMessage.update({ where: { id }, data: { deleted: true } });
    return { ok: true };
  }
}
