import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';

/**
 * DB-backed runtime settings (AppSetting table) with a thin in-memory cache.
 * Lets admins tune the platform (RTP, limits, toggles) without a redeploy.
 * Falls back to environment variables, then to the provided default.
 */
@Injectable()
export class SettingsService {
  private cache = new Map<string, { value: any; at: number }>();
  private ttlMs = 10_000;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async get<T = any>(key: string, fallback?: T): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < this.ttlMs) return cached.value as T;

    const row = await this.prisma.appSetting.findUnique({ where: { key } });
    let value: any = row?.value;
    if (value === undefined || value === null) {
      const env = this.config.get(key.toUpperCase().replace(/\./g, '_'));
      value = env !== undefined ? env : fallback;
    }
    this.cache.set(key, { value, at: Date.now() });
    return value as T;
  }

  async set(key: string, value: any, description?: string) {
    const row = await this.prisma.appSetting.upsert({
      where: { key },
      create: { key, value, description },
      update: { value, description },
    });
    this.cache.set(key, { value, at: Date.now() });
    return row;
  }

  async all() {
    return this.prisma.appSetting.findMany({ orderBy: { key: 'asc' } });
  }

  /** House return-to-player for the roulette (0..1). Defaults to 0.99. */
  async rtp(): Promise<number> {
    const v = await this.get<number | string>('game.rtp', this.config.get('DEFAULT_RTP', 0.99));
    return Number(v);
  }
}
