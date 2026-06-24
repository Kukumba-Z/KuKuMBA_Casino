import { Controller, Get, Param, Post } from '@nestjs/common';
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

  @Post(':key/claim')
  claim(@CurrentUser('id') userId: string, @Param('key') key: string) {
    return this.bonuses.claim(userId, key);
  }
}
