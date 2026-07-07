import { Module } from '@nestjs/common';
import { LeaderboardsModule } from '../leaderboards/leaderboards.module';
import { StatsModule } from '../stats/stats.module';
import { CrashController } from './crash/crash.controller';
import { CrashService } from './crash/crash.service';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { PlinkoController } from './plinko/plinko.controller';
import { PlinkoService } from './plinko/plinko.service';
import { PonyjackController } from './ponyjack/ponyjack.controller';
import { PonyjackService } from './ponyjack/ponyjack.service';
import { RouletteController } from './roulette/roulette.controller';
import { RouletteService } from './roulette/roulette.service';
import { UpgraderController } from './upgrader/upgrader.controller';
import { UpgraderService } from './upgrader/upgrader.service';

@Module({
  imports: [LeaderboardsModule, StatsModule],
  controllers: [GamesController, RouletteController, CrashController, PonyjackController, PlinkoController, UpgraderController],
  providers: [GamesService, RouletteService, CrashService, PonyjackService, PlinkoService, UpgraderService],
  exports: [GamesService, RouletteService, CrashService, PonyjackService, PlinkoService, UpgraderService],
})
export class GamesModule {}
