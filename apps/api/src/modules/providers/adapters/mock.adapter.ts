import { Injectable } from '@nestjs/common';
import { GameProviderAdapter, LaunchContext } from './adapter.interface';

/**
 * Sandbox aggregator: builds a launch URL that carries everything a real
 * aggregator would need, so the launch → callback loop can be exercised with
 * curl and the seeded 'mock' provider before any real contract exists.
 */
@Injectable()
export class MockAdapter implements GameProviderAdapter {
  readonly kind = 'MOCK';

  buildLaunchUrl(ctx: LaunchContext): string {
    const url = new URL(ctx.provider.baseUrl || 'https://mock-aggregator.local/play');
    url.searchParams.set('game', ctx.game.externalId ?? ctx.game.key);
    url.searchParams.set('token', ctx.sessionToken);
    url.searchParams.set('currency', ctx.currency);
    url.searchParams.set('mode', ctx.mode);
    url.searchParams.set('lang', ctx.locale ?? 'en');
    return url.toString();
  }
}
