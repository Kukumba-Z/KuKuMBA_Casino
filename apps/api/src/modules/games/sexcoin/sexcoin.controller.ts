import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsIn, IsNumber, IsString } from 'class-validator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { CoinSide } from './sexcoin.engine';
import { SexcoinService } from './sexcoin.service';

class StartDto {
  @IsNumber() stake: number;
  @IsString() currency: string;
  @IsIn(['DEMO', 'REAL']) mode: 'DEMO' | 'REAL';
}

class FlipDto {
  @IsString() roundId: string;
  @IsIn(['penis', 'vagina']) guess: CoinSide;
}

class CashoutDto {
  @IsString() roundId: string;
}

@Controller('games/sexcoin')
export class SexcoinController {
  constructor(private sexcoin: SexcoinService) {}

  @Public()
  @Get()
  info() {
    return this.sexcoin.info();
  }

  @Public()
  @Get('live')
  live() {
    // The shared in-memory ticker buffer (all games, last ≤15) — same as roulette.
    return this.sexcoin.liveFeed();
  }

  @Post('start')
  start(@CurrentUser('id') userId: string, @Body() dto: StartDto) {
    return this.sexcoin.start(userId, {
      stake: dto.stake,
      currency: dto.currency,
      mode: dto.mode as any,
    });
  }

  @Post('flip')
  flip(@CurrentUser('id') userId: string, @Body() dto: FlipDto) {
    return this.sexcoin.flip(userId, dto.roundId, dto.guess);
  }

  @Post('cashout')
  cashout(@CurrentUser('id') userId: string, @Body() dto: CashoutDto) {
    return this.sexcoin.cashout(userId, dto.roundId);
  }

  @Get('active')
  active(@CurrentUser('id') userId: string) {
    return this.sexcoin.activeRound(userId);
  }

  @Get('round/:id')
  state(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.sexcoin.state(userId, id);
  }

  @Get('history')
  history(@CurrentUser('id') userId: string, @Query('limit') limit?: string) {
    return this.sexcoin.history(userId, limit ? +limit : 30);
  }
}
