import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { genReferralCode } from '../../common/utils/ids';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletService } from '../wallet/wallet.service';
import { LoginDto, RegisterDto } from './dto';

const ACCOUNT_ID_START = 100000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private wallet: WalletService,
    private notifications: NotificationsService,
  ) {}

  async register(dto: RegisterDto, meta: RequestMeta = {}) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email.toLowerCase() }, { username: dto.username }] },
    });
    if (existing) throw new ConflictException('EMAIL_OR_USERNAME_TAKEN');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    let referredById: string | null = null;
    if (dto.refCode) {
      const ref = await this.prisma.user.findUnique({ where: { referralCode: dto.refCode } });
      referredById = ref?.id ?? null;
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const counter = await tx.counter.upsert({
        where: { key: 'account' },
        create: { key: 'account', value: ACCOUNT_ID_START },
        update: { value: { increment: 1 } },
      });
      return tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          username: dto.username,
          passwordHash,
          accountId: counter.value,
          referralCode: genReferralCode(),
          referredById,
          locale: dto.locale === 'en' ? 'en' : 'ru',
        },
      });
    });

    // Welcome demo bankroll so new players can try the wheel immediately.
    const demoBonus = Number(this.config.get('DEMO_SIGNUP_BONUS', '5000'));
    if (demoBonus > 0) {
      await this.wallet.applyStandalone({
        userId: user.id,
        type: 'BONUS',
        currency: 'DEMO',
        mode: 'DEMO',
        amount: demoBonus,
        refType: 'signup',
        description: 'Welcome demo balance',
      });
    }

    await this.notifications.notify(user.id, {
      type: 'SYSTEM',
      titleRu: 'Добро пожаловать в KuKuMBA! 🦄',
      titleEn: 'Welcome to KuKuMBA! 🦄',
      bodyRu: `Ваш ID аккаунта: ${user.accountId}. Мы начислили вам ${demoBonus} демо-монет — крутите рулетку!`,
      bodyEn: `Your account ID is ${user.accountId}. We credited ${demoBonus} demo coins — spin the wheel!`,
    });

    return this.issueTokens(user, meta);
  }

  async login(dto: LoginDto, meta: RequestMeta = {}) {
    const user = await this.validateUser(dto.login, dto.password);
    return this.issueTokens(user, meta);
  }

  async validateUser(login: string, password: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: login.toLowerCase() }, { username: login }] },
    });
    if (!user) throw new UnauthorizedException('INVALID_CREDENTIALS');
    if (user.status === 'BANNED') throw new ForbiddenException('ACCOUNT_BANNED');
    if (user.status === 'SELF_EXCLUDED') {
      const ex = await this.prisma.selfExclusion.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });
      if (ex && ex.until && ex.until < new Date()) {
        // cooling-off period elapsed — restore the account
        await this.prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
      } else {
        throw new ForbiddenException('SELF_EXCLUDED');
      }
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('INVALID_CREDENTIALS');
    return user;
  }

  private async issueTokens(user: User, meta: RequestMeta) {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, accountId: user.accountId, role: user.role, username: user.username },
      {
        secret: this.config.get('JWT_ACCESS_SECRET') || 'dev_access_secret_change_me',
        expiresIn: this.config.get('JWT_ACCESS_TTL') || '15m',
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id },
      {
        secret: this.config.get('JWT_REFRESH_SECRET') || 'dev_refresh_secret_change_me',
        expiresIn: this.config.get('JWT_REFRESH_TTL') || '7d',
      },
    );

    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: await bcrypt.hash(refreshToken, 10),
        userAgent: meta.userAgent?.slice(0, 250),
        ip: meta.ip,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    await this.prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });

    return { accessToken, refreshToken, user: this.publicUser(user) };
  }

  async refresh(refreshToken: string, meta: RequestMeta = {}) {
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET') || 'dev_refresh_secret_change_me',
      });
    } catch {
      throw new UnauthorizedException('INVALID_REFRESH');
    }
    const sessions = await this.prisma.session.findMany({
      where: { userId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    let match = null;
    for (const s of sessions) {
      if (await bcrypt.compare(refreshToken, s.refreshTokenHash)) {
        match = s;
        break;
      }
    }
    if (!match) throw new UnauthorizedException('INVALID_REFRESH');

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('INVALID_REFRESH');

    // rotate
    await this.prisma.session.update({ where: { id: match.id }, data: { revokedAt: new Date() } });
    return this.issueTokens(user, meta);
  }

  async logout(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET') || 'dev_refresh_secret_change_me',
      });
      const sessions = await this.prisma.session.findMany({
        where: { userId: payload.sub, revokedAt: null },
      });
      for (const s of sessions) {
        if (await bcrypt.compare(refreshToken, s.refreshTokenHash)) {
          await this.prisma.session.update({ where: { id: s.id }, data: { revokedAt: new Date() } });
          break;
        }
      }
    } catch {
      // already invalid — nothing to do
    }
    return { ok: true };
  }

  publicUser(user: User) {
    return {
      id: user.id,
      accountId: user.accountId,
      email: user.email,
      username: user.username,
      role: user.role,
      status: user.status,
      avatarUrl: user.avatarUrl,
      locale: user.locale,
      kycStatus: user.kycStatus,
      vipLevel: user.vipLevel,
      referralCode: user.referralCode,
      twoFactorEnabled: user.twoFactorEnabled,
      createdAt: user.createdAt,
    };
  }
}
