import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { LeaderboardsModule } from '../leaderboards/leaderboards.module';
import { GenericSeamlessAdapter } from './adapters/generic-seamless.adapter';
import { MockAdapter } from './adapters/mock.adapter';
import { ProviderHmacGuard } from './hmac.guard';
import { ProvidersCallbackController } from './providers-callback.controller';
import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';

/**
 * Slot-aggregator integration: DB-driven provider registry (encrypted
 * credentials), game launch, HMAC-authenticated seamless-wallet callbacks.
 * Global so the admin module can manage providers without extra wiring.
 */
@Global()
@Module({
  imports: [JwtModule.register({}), LeaderboardsModule],
  controllers: [ProvidersController, ProvidersCallbackController],
  providers: [ProvidersService, MockAdapter, GenericSeamlessAdapter, ProviderHmacGuard],
  exports: [ProvidersService],
})
export class ProvidersModule {}
