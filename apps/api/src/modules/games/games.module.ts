import { Module } from '@nestjs/common';
import { LeaderboardsModule } from '../leaderboards/leaderboards.module';
import { StatsModule } from '../stats/stats.module';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { RouletteController } from './roulette/roulette.controller';
import { RouletteService } from './roulette/roulette.service';

@Module({
  imports: [LeaderboardsModule, StatsModule],
  controllers: [GamesController, RouletteController],
  providers: [GamesService, RouletteService],
  exports: [GamesService, RouletteService],
})
export class GamesModule {}
