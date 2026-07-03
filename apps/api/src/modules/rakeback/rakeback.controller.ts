import { Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RakebackService } from './rakeback.service';

@Controller('rakeback')
export class RakebackController {
  constructor(private rakeback: RakebackService) {}

  @Get('status')
  status(@CurrentUser('id') userId: string) {
    return this.rakeback.status(userId);
  }

  @Post('claim')
  claim(@CurrentUser('id') userId: string) {
    return this.rakeback.claim(userId);
  }
}
