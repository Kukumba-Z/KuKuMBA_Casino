import { Module } from '@nestjs/common';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { RouletteController } from './roulette/roulette.controller';
import { RouletteService } from './roulette/roulette.service';

@Module({
  controllers: [GamesController, RouletteController],
  providers: [GamesService, RouletteService],
  exports: [GamesService, RouletteService],
})
export class GamesModule {}
