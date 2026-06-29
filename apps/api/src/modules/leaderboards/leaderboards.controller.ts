import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { LeaderboardsService } from './leaderboards.service';

@Controller('leaderboards')
export class LeaderboardsController {
  constructor(private leaderboards: LeaderboardsService) {}

  /** Biggest wins of all time (top 10 for the lobby, up to 500 for the page). */
  @Public()
  @Get('wins')
  wins(@Query('limit') limit?: string, @Query('game') game?: string) {
    return this.leaderboards.wins(limit ? +limit : 500, game || undefined);
  }

  /** Biggest multipliers of all time. */
  @Public()
  @Get('x')
  x(@Query('limit') limit?: string, @Query('game') game?: string) {
    return this.leaderboards.x(limit ? +limit : 500, game || undefined);
  }
}
