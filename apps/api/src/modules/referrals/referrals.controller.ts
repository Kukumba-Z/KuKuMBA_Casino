import { Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReferralsService } from './referrals.service';

@Controller('referrals')
export class ReferralsController {
  constructor(private referrals: ReferralsService) {}

  @Get('me')
  me(@CurrentUser('id') userId: string) {
    return this.referrals.myStats(userId);
  }

  /** Pay the accumulated commission balances out to the wallet. */
  @Post('claim')
  claim(@CurrentUser('id') userId: string) {
    return this.referrals.claim(userId);
  }
}
