import { Module } from '@nestjs/common';
import { SupportModule } from '../support/support.module';
import { UploadsModule } from '../uploads/uploads.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { BetsAdminService } from './bets-admin.service';

@Module({
  imports: [SupportModule, UploadsModule],
  controllers: [AdminController],
  providers: [AdminService, BetsAdminService],
})
export class AdminModule {}
