import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

/**
 * Shared uploads infrastructure: local disk storage (Multer) + static serving.
 * Feature modules (Support, …) import this to attach files; the controller
 * streams them back out.
 */
@Module({
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
