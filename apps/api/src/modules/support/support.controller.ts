import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SupportService } from './support.service';

class CreateTicketDto {
  @IsString() @MinLength(2) @MaxLength(140) subject: string;
  @IsOptional() @IsString() category?: string;
  @IsString() @MinLength(1) @MaxLength(4000) message: string;
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?: any;
}
class ReplyDto {
  @IsString() @MinLength(1) @MaxLength(4000) body: string;
}

@Controller('support')
export class SupportController {
  constructor(private support: SupportService) {}

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
  create(@CurrentUser('id') userId: string, @Body() dto: CreateTicketDto) {
    return this.support.createTicket(userId, dto);
  }

  @Get('tickets/:id')
  get(@CurrentUser() user: any, @Param('id') id: string) {
    return this.support.getTicket(user, id);
  }

  @Post('tickets/:id/reply')
  reply(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: ReplyDto) {
    return this.support.reply(user, id, dto.body);
  }
}
