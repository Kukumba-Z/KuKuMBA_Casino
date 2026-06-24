import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { VipService } from './vip.service';

@Controller('vip')
export class VipController {
  constructor(private vip: VipService) {}

  @Public()
  @Get('levels')
  levels() {
    return this.vip.levels();
  }

  @Get('status')
  status(@CurrentUser('id') userId: string) {
    return this.vip.status(userId);
  }
}
