import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async profile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('USER_NOT_FOUND');

    const [betCount, wager, vipLevel, linked] = await Promise.all([
      this.prisma.bet.count({ where: { userId } }),
      this.prisma.bet.aggregate({ where: { userId }, _sum: { stake: true } }),
      this.prisma.vipLevel.findUnique({ where: { level: user.vipLevel } }),
      this.prisma.linkedAccount.findMany({ where: { userId } }),
    ]);

    return {
      id: user.id,
      accountId: user.accountId,
      email: user.email,
      emailVerified: user.emailVerified,
      username: user.username,
      role: user.role,
      status: user.status,
      avatarUrl: user.avatarUrl,
      countryCode: user.countryCode,
      locale: user.locale,
      kycStatus: user.kycStatus,
      twoFactorEnabled: user.twoFactorEnabled,
      referralCode: user.referralCode,
      vip: { level: user.vipLevel, xp: user.vipXp, name: vipLevel?.name },
      stats: { bets: betCount, totalWagered: (wager._sum.stake ?? 0).toString() },
      linkedAccounts: linked.map((l) => ({
        id: l.id,
        provider: l.provider,
        displayName: l.displayName,
        createdAt: l.createdAt,
      })),
      createdAt: user.createdAt,
    };
  }

  async updateProfile(
    userId: string,
    dto: {
      avatarUrl?: string;
      countryCode?: string;
      locale?: string;
      username?: string;
      email?: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('USER_NOT_FOUND');

    const data: any = {};
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;
    if (dto.countryCode !== undefined) data.countryCode = dto.countryCode?.slice(0, 2).toUpperCase();
    if (dto.locale && ['ru', 'en'].includes(dto.locale)) data.locale = dto.locale;

    if (dto.username !== undefined && dto.username !== user.username) {
      const taken = await this.prisma.user.findFirst({
        where: { username: dto.username, id: { not: userId } },
        select: { id: true },
      });
      if (taken) throw new BadRequestException('USERNAME_TAKEN');
      data.username = dto.username;
    }

    if (dto.email !== undefined) {
      const email = dto.email.toLowerCase();
      if (email !== user.email) {
        const taken = await this.prisma.user.findFirst({
          where: { email, id: { not: userId } },
          select: { id: true },
        });
        if (taken) throw new BadRequestException('EMAIL_TAKEN');
        data.email = email;
        // A new address must be re-verified before it counts as confirmed.
        data.emailVerified = false;
      }
    }

    await this.prisma.user.update({ where: { id: userId }, data });
    return this.profile(userId);
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const ok = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('WRONG_PASSWORD');
    if (newPassword.length < 6) throw new BadRequestException('PASSWORD_TOO_SHORT');
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });
    // Invalidate other sessions for safety.
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async linkAccount(userId: string, provider: string, providerUserId: string, displayName?: string) {
    const exists = await this.prisma.linkedAccount.findUnique({
      where: { provider_providerUserId: { provider, providerUserId } },
    });
    if (exists) throw new BadRequestException('ALREADY_LINKED');
    return this.prisma.linkedAccount.create({
      data: { userId, provider, providerUserId, displayName },
    });
  }

  async unlinkAccount(userId: string, id: string) {
    await this.prisma.linkedAccount.deleteMany({ where: { id, userId } });
    return { ok: true };
  }

  /** Minimal public card for chat / leaderboards. */
  async publicCard(accountId: number) {
    const user = await this.prisma.user.findUnique({
      where: { accountId },
      select: { accountId: true, username: true, avatarUrl: true, vipLevel: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('USER_NOT_FOUND');
    return user;
  }
}
