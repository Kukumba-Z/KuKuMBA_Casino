import { Module } from '@nestjs/common';
import { LeaderboardsModule } from '../leaderboards/leaderboards.module';
import { StatsModule } from '../stats/stats.module';
import { CrashController } from './crash/crash.controller';
import { CrashService } from './crash/crash.service';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { PonyjackController } from './ponyjack/ponyjack.controller';
import { PonyjackService } from './ponyjack/ponyjack.service';
import { RouletteController } from './roulette/roulette.controller';
import { RouletteService } from './roulette/roulette.service';

@Module({
  imports: [LeaderboardsModule, StatsModule],
  controllers: [GamesController, RouletteController, CrashController, PonyjackController],
  providers: [GamesService, RouletteService, CrashService, PonyjackService],
  exports: [GamesService, RouletteService, CrashService, PonyjackService],
})
export class GamesModule {}
