import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(private stats: StatsService) {}

  @Public()
  @Get()
  overview() {
    return this.stats.overview();
  }
}
