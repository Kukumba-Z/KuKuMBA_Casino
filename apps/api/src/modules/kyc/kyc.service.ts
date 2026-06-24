import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class KycService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async status(userId: string) {
    const c = await this.prisma.kycCase.findUnique({
      where: { userId },
      include: { documents: true },
    });
    return c ?? { status: 'NONE', documents: [], level: 0 };
  }

  async submit(
    userId: string,
    dto: { fullName?: string; dateOfBirth?: string; country?: string },
  ) {
    const c = await this.prisma.kycCase.upsert({
      where: { userId },
      create: {
        userId,
        status: 'PENDING',
        fullName: dto.fullName,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        country: dto.country,
      },
      update: {
        status: 'PENDING',
        fullName: dto.fullName,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        country: dto.country,
      },
    });
    await this.prisma.user.update({ where: { id: userId }, data: { kycStatus: 'PENDING' } });
    await this.notifications.notify(userId, {
      type: 'KYC',
      titleRu: 'Заявка KYC отправлена',
      titleEn: 'KYC submitted',
      bodyRu: 'Ваши данные отправлены на проверку.',
      bodyEn: 'Your details were submitted for review.',
    });
    return c;
  }

  /** fileUrl is a reference (data URL / external link) — real storage is a plug-in concern. */
  async addDocument(userId: string, kind: string, fileUrl: string) {
    let c = await this.prisma.kycCase.findUnique({ where: { userId } });
    if (!c) {
      c = await this.prisma.kycCase.create({ data: { userId, status: 'PENDING' } });
      await this.prisma.user.update({ where: { id: userId }, data: { kycStatus: 'PENDING' } });
    }
    return this.prisma.kycDocument.create({
      data: { caseId: c.id, kind, fileUrl, status: 'PENDING' },
    });
  }
}
