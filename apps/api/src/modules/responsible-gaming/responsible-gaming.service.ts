import { Injectable } from '@nestjs/common';
import { RgLimitType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { D } from '../../common/utils/money';

@Injectable()
export class ResponsibleGamingService {
  constructor(private prisma: PrismaService) {}

  limits(userId: string) {
    return this.prisma.rgLimit.findMany({ where: { userId, active: true } });
  }

  setLimit(
    userId: string,
    dto: { type: RgLimitType; period: string; amount?: string; minutes?: number },
  ) {
    return this.prisma.rgLimit.upsert({
      where: { userId_type_period: { userId, type: dto.type, period: dto.period } },
      create: {
        userId,
        type: dto.type,
        period: dto.period,
        amount: dto.amount ? D(dto.amount) : undefined,
        minutes: dto.minutes,
        active: true,
      },
      update: {
        amount: dto.amount ? D(dto.amount) : undefined,
        minutes: dto.minutes,
        active: true,
      },
    });
  }

  async removeLimit(userId: string, id: string) {
    await this.prisma.rgLimit.updateMany({ where: { id, userId }, data: { active: false } });
    return { ok: true };
  }

  async selfExclude(userId: string, dto: { until?: string; reason?: string }) {
    const until = dto.until ? new Date(dto.until) : null;
    await this.prisma.selfExclusion.create({ data: { userId, until, reason: dto.reason } });
    await this.prisma.user.update({ where: { id: userId }, data: { status: 'SELF_EXCLUDED' } });
    // revoke active sessions so the exclusion takes effect immediately
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true, until };
  }
}
