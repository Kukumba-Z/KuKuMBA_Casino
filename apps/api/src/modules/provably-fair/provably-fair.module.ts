import { Global, Module } from '@nestjs/common';
import { ProvablyFairController } from './provably-fair.controller';
import { ProvablyFairService } from './provably-fair.service';

@Global()
@Module({
  controllers: [ProvablyFairController],
  providers: [ProvablyFairService],
  exports: [ProvablyFairService],
})
export class ProvablyFairModule {}
