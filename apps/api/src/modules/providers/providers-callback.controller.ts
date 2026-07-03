import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import {
  BalanceCallbackDto,
  BetCallbackDto,
  RollbackCallbackDto,
  WinCallbackDto,
} from './dto/callbacks.dto';
import { ProviderHmacGuard } from './hmac.guard';
import { ProvidersService } from './providers.service';

/**
 * Seamless-wallet callbacks the aggregator calls. @Public() skips JWT — the
 * HMAC guard is the authentication (signature of the raw body under the
 * provider's webhook secret). All money effects are idempotent per
 * (provider, transactionId): a replay returns the stored response.
 */
@Public()
@UseGuards(ProviderHmacGuard)
@Controller('providers/:key/callback')
export class ProvidersCallbackController {
  constructor(private providers: ProvidersService) {}

  @Post('balance')
  balance(@Req() req: any, @Body() dto: BalanceCallbackDto) {
    return this.providers.balance(req.gameProvider, dto);
  }

  @Post('bet')
  bet(@Req() req: any, @Body() dto: BetCallbackDto) {
    return this.providers.bet(req.gameProvider, dto);
  }

  @Post('win')
  win(@Req() req: any, @Body() dto: WinCallbackDto) {
    return this.providers.win(req.gameProvider, dto);
  }

  @Post('rollback')
  rollback(@Req() req: any, @Body() dto: RollbackCallbackDto) {
    return this.providers.rollback(req.gameProvider, dto);
  }
}
