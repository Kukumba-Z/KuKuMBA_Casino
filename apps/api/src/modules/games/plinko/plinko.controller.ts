import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { PLINKO_MAX_ROWS, PLINKO_MIN_ROWS, PLINKO_RISKS } from './plinko.engine';
import { PlinkoService } from './plinko.service';

class PlinkoPlayDto {
  @IsNumber() stake: number;
  @IsString() currency: string;
  @IsIn(['DEMO', 'REAL']) mode: 'DEMO' | 'REAL';
  @IsIn(PLINKO_RISKS as unknown as string[]) risk: string;
  @IsInt() @Min(PLINKO_MIN_ROWS) @Max(PLINKO_MAX_ROWS) rows: number;
}

@Controller('games/plinko')
export class PlinkoController {
  constructor(private plinko: PlinkoService) {}

  @Public()
  @Get()
  info(@Query('risk') risk?: string, @Query('rows') rows?: string) {
    return this.plinko.info(risk, rows ? +rows : undefined);
  }

  @Public()
  @Get('live')
  live() {
    // Always the in-memory ticker buffer (last ≤15); the limit query is ignored.
    return this.plinko.liveFeed();
  }

  @Post('play')
  play(@CurrentUser('id') userId: string, @Body() dto: PlinkoPlayDto) {
    return this.plinko.play(userId, {
      stake: dto.stake,
      currency: dto.currency,
      mode: dto.mode as any,
      risk: dto.risk,
      rows: dto.rows,
    });
  }

  @Get('history')
  history(@CurrentUser('id') userId: string, @Query('limit') limit?: string) {
    return this.plinko.history(userId, limit ? +limit : 30);
  }
}
