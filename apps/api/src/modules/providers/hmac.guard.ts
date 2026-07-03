import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ProvidersService } from './providers.service';

/**
 * Authenticates inbound aggregator callbacks: the route is @Public() (no JWT),
 * so the ONLY thing letting a request in is a valid HMAC-SHA256 of the raw
 * request body under the provider's webhook secret, sent as `x-signature`
 * (hex). Comparison is timing-safe; any mismatch, missing header, unknown or
 * disabled provider, or unset secret → 401.
 */
@Injectable()
export class ProviderHmacGuard implements CanActivate {
  constructor(private providers: ProvidersService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const provider = await this.providers.byKey(String(req.params?.key ?? ''));
    if (!provider) throw new UnauthorizedException('PROVIDER_UNKNOWN');

    const secret = this.providers.webhookSecret(provider);
    if (!secret) throw new UnauthorizedException('PROVIDER_SECRET_UNSET');

    const signature = req.headers['x-signature'];
    const rawBody: Buffer | undefined = req.rawBody;
    if (typeof signature !== 'string' || !signature || !rawBody) {
      throw new UnauthorizedException('SIGNATURE_MISSING');
    }

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(signature.toLowerCase(), 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('SIGNATURE_INVALID');
    }

    req.gameProvider = provider;
    return true;
  }
}
