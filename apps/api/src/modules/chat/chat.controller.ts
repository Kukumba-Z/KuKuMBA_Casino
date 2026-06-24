import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ChatService } from './chat.service';

class SendDto {
  @IsString() @MinLength(1) @MaxLength(500) body: string;
  @IsOptional() @IsString() room?: string;
}

@Controller('chat')
export class ChatController {
  constructor(private chat: ChatService) {}

  @Public()
  @Get()
  history(@Query('room') room?: string, @Query('limit') limit?: string) {
    return this.chat.history(room || 'global', limit ? +limit : 50);
  }

  @Post()
  send(@CurrentUser() user: any, @Body() dto: SendDto) {
    return this.chat.send(user, dto.room || 'global', dto.body);
  }
}
