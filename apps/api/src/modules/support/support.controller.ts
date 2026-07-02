import { Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { displayName, multerOptionsFor, type UploadedFileLike } from '../uploads/uploads.config';
import { UploadsService } from '../uploads/uploads.service';
import { SupportService, type AttachmentMeta } from './support.service';

const SCOPE = 'support';

class CreateTicketDto {
  @IsString() @MinLength(2) @MaxLength(140) subject: string;
  @IsOptional() @IsString() category?: string;
  @IsString() @MinLength(1) @MaxLength(4000) message: string;
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?: any;
}
class ReplyDto {
  // Optional: a reply may be an attachment with no text (validated in the service).
  @IsOptional() @IsString() @MaxLength(4000) body?: string;
}

@Controller('support')
export class SupportController {
  constructor(
    private support: SupportService,
    private uploads: UploadsService,
  ) {}

  @Public()
  @Get('faq')
  faq() {
    return this.support.faq();
  }

  @Get('tickets')
  tickets(@CurrentUser('id') userId: string) {
    return this.support.myTickets(userId);
  }

  private meta(file?: UploadedFileLike): AttachmentMeta | undefined {
    if (!file) return undefined;
    return {
      url: this.uploads.publicUrl(SCOPE, file.filename),
      name: displayName(file.originalname),
      size: file.size,
    };
  }

  @Post('tickets')
  @UseInterceptors(FileInterceptor('file', multerOptionsFor(SCOPE)))
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTicketDto,
    @UploadedFile() file?: UploadedFileLike,
  ) {
    return this.support.createTicket(userId, dto, this.meta(file));
  }

  @Get('tickets/:id')
  get(@CurrentUser() user: any, @Param('id') id: string) {
    return this.support.getTicket(user, id);
  }

  @Post('tickets/:id/reply')
  @UseInterceptors(FileInterceptor('file', multerOptionsFor(SCOPE)))
  reply(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: ReplyDto,
    @UploadedFile() file?: UploadedFileLike,
  ) {
    return this.support.reply(user, id, dto.body, this.meta(file));
  }
}
