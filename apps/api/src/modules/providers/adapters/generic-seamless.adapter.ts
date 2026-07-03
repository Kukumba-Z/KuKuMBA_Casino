import { BadRequestException, Injectable } from '@nestjs/common';
import { GameProviderAdapter, LaunchContext } from './adapter.interface';

/**
 * Generic seamless-wallet aggregator: launches games at the provider's
 * configured baseUrl with the standard query contract (game, token, currency,
 * mode, lang). Protocol-specific aggregators should get their own adapter —
 * this one covers integrations that follow the common pattern.
 */
@Injectable()
export class GenericSeamlessAdapter implements GameProviderAdapter {
  readonly kind = 'GENERIC_SEAMLESS';

  buildLaunchUrl(ctx: LaunchContext): string {
    if (!ctx.provider.baseUrl) throw new BadRequestException('PROVIDER_BASE_URL_UNSET');
    const url = new URL(ctx.provider.baseUrl);
    url.searchParams.set('game', ctx.game.externalId ?? ctx.game.key);
    url.searchParams.set('token', ctx.sessionToken);
    url.searchParams.set('currency', ctx.currency);
    url.searchParams.set('mode', ctx.mode);
    url.searchParams.set('lang', ctx.locale ?? 'en');
    if (ctx.apiKey) url.searchParams.set('operator', ctx.apiKey.slice(0, 8));
    return url.toString();
  }
}
