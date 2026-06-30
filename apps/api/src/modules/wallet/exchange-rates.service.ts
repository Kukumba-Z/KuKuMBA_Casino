import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { D } from '../../common/utils/money';

/**
 * Keeps every enabled fiat currency's `usdRate` in sync with a live FX feed, so
 * conversions (and bet limits, min-deposit thresholds, leaderboards…) use real
 * rates instead of the seeded defaults.
 *
 * Source: a free, key-less, USD-based endpoint (default open.er-api.com). The
 * response must look like `{ rates: { USD: 1, EUR: 0.92, RUB: 90.5, … } }`
 * (exchangerate-api's `conversion_rates` is also accepted). Override the URL
 * with FX_RATES_URL. If the feed is unreachable the last-known rates (or the
 * seeded ones) stay in place — conversion never breaks, it just isn't live.
 */
@Injectable()
export class ExchangeRatesService implements OnModuleInit {
  private readonly log = new Logger(ExchangeRatesService.name);
  private readonly base = 'USD';
  private readonly url = process.env.FX_RATES_URL || 'https://open.er-api.com/v6/latest/USD';
  private lastUpdated: Date | null = null;
  private source = 'seed';

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.refresh().catch((e) => this.log.warn(`initial FX refresh failed: ${(e as Error).message}`));
  }

  // Hourly is plenty for fiat; the feed itself only updates a few times a day.
  @Cron(CronExpression.EVERY_HOUR)
  async scheduledRefresh() {
    await this.refresh().catch((e) => this.log.warn(`FX refresh failed: ${(e as Error).message}`));
  }

  /** Pull live USD-based rates and persist each fiat's `usdRate` (1 unit = X USD). */
  async refresh() {
    const res = await fetch(this.url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();
    const perUsd: Record<string, number> = data.rates ?? data.conversion_rates;
    if (!perUsd || typeof perUsd !== 'object') throw new Error('unexpected FX response shape');

    const fiats = await this.prisma.currency.findMany({ where: { type: 'FIAT', enabled: true } });
    let updated = 0;
    for (const c of fiats) {
      if (c.code === this.base) {
        if (!c.usdRate.equals(1)) await this.prisma.currency.update({ where: { code: c.code }, data: { usdRate: D(1) } });
        continue;
      }
      const rate = Number(perUsd[c.code]); // units of `c` per 1 USD
      if (!isFinite(rate) || rate <= 0) continue;
      // 1 unit of `c` = (1 / rate) USD.
      await this.prisma.currency.update({ where: { code: c.code }, data: { usdRate: D(1).div(rate) } });
      updated++;
    }

    this.lastUpdated = data.time_last_update_unix ? new Date(data.time_last_update_unix * 1000) : new Date();
    this.source = (() => {
      try {
        return new URL(this.url).host;
      } catch {
        return 'fx';
      }
    })();
    this.log.log(`FX rates updated (${updated} currencies) from ${this.source}`);
    return this.snapshot();
  }

  /** Current fiat rates as "1 unit = X USD", plus when/where they came from. */
  async snapshot() {
    const fiats = await this.prisma.currency.findMany({
      where: { type: 'FIAT', enabled: true },
      orderBy: { sortOrder: 'asc' },
      select: { code: true, usdRate: true },
    });
    return {
      base: this.base,
      updatedAt: this.lastUpdated,
      source: this.source,
      live: this.source !== 'seed',
      usd: Object.fromEntries(fiats.map((c) => [c.code, c.usdRate.toFixed()])),
    };
  }
}
