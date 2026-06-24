import { Module } from '@nestjs/common';
import { ResponsibleGamingController } from './responsible-gaming.controller';
import { ResponsibleGamingService } from './responsible-gaming.service';

@Module({
  controllers: [ResponsibleGamingController],
  providers: [ResponsibleGamingService],
  exports: [ResponsibleGamingService],
})
export class ResponsibleGamingModule {}
