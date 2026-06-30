import { Module } from '@nestjs/common';
import { SupportModule } from '../support/support.module';
import { UploadsModule } from '../uploads/uploads.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [SupportModule, UploadsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
