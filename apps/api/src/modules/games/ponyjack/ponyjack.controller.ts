import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsIn, IsNumber, IsString } from 'class-validator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { PONYJACK_ACTIONS } from './ponyjack.engine';
import { PonyjackService } from './ponyjack.service';

class DealDto {
  @IsNumber() stake: number;
  @IsString() currency: string;
  @IsIn(['DEMO', 'REAL']) mode: 'DEMO' | 'REAL';
}

class ActionDto {
  @IsString() roundId: string;
  @IsIn(PONYJACK_ACTIONS) action: string;
}

@Controller('games/ponyjack')
export class PonyjackController {
  constructor(private ponyjack: PonyjackService) {}

  @Public()
  @Get()
  info() {
    return this.ponyjack.info();
  }

  @Public()
  @Get('live')
  live() {
    // The shared in-memory ticker buffer (all games, last ≤15) — same as roulette.
    return this.ponyjack.liveFeed();
  }

  @Post('deal')
  deal(@CurrentUser('id') userId: string, @Body() dto: DealDto) {
    return this.ponyjack.deal(userId, { stake: dto.stake, currency: dto.currency, mode: dto.mode as any });
  }

  @Post('action')
  action(@CurrentUser('id') userId: string, @Body() dto: ActionDto) {
    return this.ponyjack.act(userId, dto.roundId, dto.action);
  }

  @Get('active')
  active(@CurrentUser('id') userId: string) {
    return this.ponyjack.activeRound(userId);
  }

  @Get('round/:id')
  state(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.ponyjack.state(userId, id);
  }

  @Get('history')
  history(@CurrentUser('id') userId: string, @Query('limit') limit?: string) {
    return this.ponyjack.history(userId, limit ? +limit : 30);
  }
}
