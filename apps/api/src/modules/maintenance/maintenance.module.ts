import { Module } from '@nestjs/common';
import { RetentionService } from './retention.service';

/** Background housekeeping (retention crons). */
@Module({
  providers: [RetentionService],
})
export class MaintenanceModule {}
