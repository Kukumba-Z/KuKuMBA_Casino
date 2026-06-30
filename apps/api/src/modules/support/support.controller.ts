import { Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { multerOptionsFor, type UploadedFileLike } from '../uploads/uploads.config';
import { UploadsService } from '../uploads/uploads.service';
import { SupportService } from './support.service';

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

  @Post('tickets')
  @UseInterceptors(FileInterceptor('file', multerOptionsFor(SCOPE)))
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTicketDto,
    @UploadedFile() file?: UploadedFileLike,
  ) {
    const url = file ? this.uploads.publicUrl(SCOPE, file.filename) : undefined;
    return this.support.createTicket(userId, dto, url);
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
    const url = file ? this.uploads.publicUrl(SCOPE, file.filename) : undefined;
    return this.support.reply(user, id, dto.body, url);
  }
}
