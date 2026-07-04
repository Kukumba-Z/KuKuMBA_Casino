import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { CRASH_MAX_MULT } from './crash.engine';
import { CrashService } from './crash.service';

class CrashPlayDto {
  @IsNumber() stake: number;
  @IsString() currency: string;
  @IsIn(['DEMO', 'REAL']) mode: 'DEMO' | 'REAL';
  @IsOptional() @IsNumber() @Min(1.01) @Max(CRASH_MAX_MULT) autoCashout?: number;
  @IsOptional() @IsBoolean() instant?: boolean;
}

class CashoutDto {
  @IsString() roundId: string;
  /** Multiplier the player saw on screen when they tapped. The server clamps it
   *  to its own elapsed time, so it can only settle *earlier* (never higher). */
  @IsOptional() @IsNumber() @Min(1) @Max(CRASH_MAX_MULT) atMultiplier?: number;
}

@Controller('games/crash')
export class CrashController {
  constructor(private crash: CrashService) {}

  @Public()
  @Get()
  info() {
    return this.crash.info();
  }

  @Public()
  @Get('live')
  live() {
    // The shared in-memory ticker buffer (all games, last ≤15) — same as roulette.
    return this.crash.liveFeed();
  }

  @Post('play')
  play(@CurrentUser('id') userId: string, @Body() dto: CrashPlayDto) {
    return this.crash.play(userId, {
      stake: dto.stake,
      currency: dto.currency,
      mode: dto.mode as any,
      autoCashout: dto.autoCashout,
      instant: dto.instant,
    });
  }

  @Post('cashout')
  cashout(@CurrentUser('id') userId: string, @Body() dto: CashoutDto) {
    return this.crash.cashOut(userId, dto.roundId, dto.atMultiplier);
  }

  @Get('active')
  active(@CurrentUser('id') userId: string) {
    return this.crash.activeRound(userId);
  }

  @Get('round/:id')
  state(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.crash.state(userId, id);
  }

  @Get('history')
  history(@CurrentUser('id') userId: string, @Query('limit') limit?: string) {
    return this.crash.history(userId, limit ? +limit : 30);
  }
}
