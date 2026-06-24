import { Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CashbackService } from './cashback.service';

@Controller('cashback')
export class CashbackController {
  constructor(private cashback: CashbackService) {}

  @Get('status')
  status(@CurrentUser('id') userId: string) {
    return this.cashback.status(userId);
  }

  @Post('claim')
  claim(@CurrentUser('id') userId: string) {
    return this.cashback.claim(userId);
  }
}
