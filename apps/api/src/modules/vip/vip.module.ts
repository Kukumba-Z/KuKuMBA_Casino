import { Global, Module } from '@nestjs/common';
import { VipController } from './vip.controller';
import { VipService } from './vip.service';

@Global()
@Module({
  controllers: [VipController],
  providers: [VipService],
  exports: [VipService],
})
export class VipModule {}
