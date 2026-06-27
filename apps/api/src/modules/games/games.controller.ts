import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { GamesService } from './games.service';

@Controller('games')
export class GamesController {
  constructor(private games: GamesService) {}

  @Public()
  @Get()
  list(
    @Query('category') category?: string,
    @Query('provider') provider?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return this.games.list({ category, provider, status, q });
  }

  @Public()
  @Get('filters')
  filters() {
    return this.games.filters();
  }
}
