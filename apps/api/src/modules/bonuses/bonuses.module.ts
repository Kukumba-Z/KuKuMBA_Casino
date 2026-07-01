import { Global, Module } from '@nestjs/common';
import { BonusesController } from './bonuses.controller';
import { BonusesService } from './bonuses.service';

// Global so the wagering engine (onWager) + anti-abuse guards are reachable from
// the game engine, promocodes, cashback and payments — mirrors Wallet/Vip.
@Global()
@Module({
  controllers: [BonusesController],
  providers: [BonusesService],
  exports: [BonusesService],
})
export class BonusesModule {}
