import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { SupportController } from './support.controller';
import { SupportRetentionService } from './support-retention.service';
import { SupportService } from './support.service';

@Module({
  imports: [UploadsModule],
  controllers: [SupportController],
  providers: [SupportService, SupportRetentionService],
  exports: [SupportService],
})
export class SupportModule {}
