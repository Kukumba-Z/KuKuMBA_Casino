import { Global, Module } from '@nestjs/common';
import { RakebackController } from './rakeback.controller';
import { RakebackService } from './rakeback.service';

// Global so the game engine can accrue rakeback inside the bet transaction —
// mirrors Wallet/Vip/Referrals.
@Global()
@Module({
  controllers: [RakebackController],
  providers: [RakebackService],
  exports: [RakebackService],
})
export class RakebackModule {}
