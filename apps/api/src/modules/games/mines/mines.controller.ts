import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsIn, IsInt, IsNumber, IsString, Max, Min } from 'class-validator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { MINES_MAX, MINES_MIN } from './mines.engine';
import { MinesService } from './mines.service';

class StartDto {
  @IsNumber() stake: number;
  @IsString() currency: string;
  @IsIn(['DEMO', 'REAL']) mode: 'DEMO' | 'REAL';
  @IsInt() @Min(MINES_MIN) @Max(MINES_MAX) mines: number;
}

class PickDto {
  @IsString() roundId: string;
  @IsInt() @Min(0) @Max(24) tile: number;
}

class CashoutDto {
  @IsString() roundId: string;
}

@Controller('games/mines')
export class MinesController {
  constructor(private mines: MinesService) {}

  @Public()
  @Get()
  info(@Query('mines') mines?: string) {
    return this.mines.info(mines ? +mines : undefined);
  }

  @Public()
  @Get('live')
  live() {
    // The shared in-memory ticker buffer (all games, last ≤15) — same as roulette.
    return this.mines.liveFeed();
  }

  @Post('start')
  start(@CurrentUser('id') userId: string, @Body() dto: StartDto) {
    return this.mines.start(userId, {
      stake: dto.stake,
      currency: dto.currency,
      mode: dto.mode as any,
      mines: dto.mines,
    });
  }

  @Post('pick')
  pick(@CurrentUser('id') userId: string, @Body() dto: PickDto) {
    return this.mines.pick(userId, dto.roundId, dto.tile);
  }

  @Post('cashout')
  cashout(@CurrentUser('id') userId: string, @Body() dto: CashoutDto) {
    return this.mines.cashout(userId, dto.roundId);
  }

  @Get('active')
  active(@CurrentUser('id') userId: string) {
    return this.mines.activeRound(userId);
  }

  @Get('round/:id')
  state(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.mines.state(userId, id);
  }

  @Get('history')
  history(@CurrentUser('id') userId: string, @Query('limit') limit?: string) {
    return this.mines.history(userId, limit ? +limit : 30);
  }
}
