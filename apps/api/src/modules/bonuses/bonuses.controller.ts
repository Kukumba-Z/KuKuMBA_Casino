import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { BonusesService } from './bonuses.service';

@Controller('bonuses')
export class BonusesController {
  constructor(private bonuses: BonusesService) {}

  @Public()
  @Get()
  catalog() {
    return this.bonuses.catalog();
  }

  @Get('me')
  mine(@CurrentUser('id') userId: string) {
    return this.bonuses.myBonuses(userId);
  }

  /** Preview the deposit-match bonus for a currency+amount, before depositing. */
  @Get('deposit-offer')
  depositOffer(@CurrentUser('id') userId: string, @Query('currency') currency: string, @Query('amount') amount: string) {
    return this.bonuses.depositOffer(userId, currency, amount);
  }

  @Post(':key/claim')
  claim(@CurrentUser('id') userId: string, @Param('key') key: string) {
    return this.bonuses.claim(userId, key);
  }

  /** Player forfeits a live bonus (removes the bonus money, unlocks withdrawals). */
  @Post('mine/:id/cancel')
  cancel(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.bonuses.cancelBonus(userId, id);
  }
}
