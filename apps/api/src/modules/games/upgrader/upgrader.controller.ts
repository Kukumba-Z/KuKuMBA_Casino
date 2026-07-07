import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsIn, IsNumber, IsString, Max, Min } from 'class-validator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { UPGRADER_MAX_CHANCE, UPGRADER_MIN_CHANCE } from './upgrader.engine';
import { UpgraderService } from './upgrader.service';

class UpgraderPlayDto {
  @IsNumber() stake: number;
  @IsString() currency: string;
  @IsIn(['DEMO', 'REAL']) mode: 'DEMO' | 'REAL';
  // canonical = fraction 0.0001..0.99 (the multiplier is derived server-side)
  @IsNumber() @Min(UPGRADER_MIN_CHANCE) @Max(UPGRADER_MAX_CHANCE) chance: number;
}

@Controller('games/upgrader')
export class UpgraderController {
  constructor(private upgrader: UpgraderService) {}

  @Public()
  @Get()
  info(@Query('chance') chance?: string) {
    return this.upgrader.info(chance ? +chance : undefined);
  }

  @Public()
  @Get('live')
  live() {
    // Always the in-memory ticker buffer (last ≤15); the limit query is ignored.
    return this.upgrader.liveFeed();
  }

  @Post('play')
  play(@CurrentUser('id') userId: string, @Body() dto: UpgraderPlayDto) {
    return this.upgrader.play(userId, {
      stake: dto.stake,
      currency: dto.currency,
      mode: dto.mode as any,
      chance: dto.chance,
    });
  }

  @Get('history')
  history(@CurrentUser('id') userId: string, @Query('limit') limit?: string) {
    return this.upgrader.history(userId, limit ? +limit : 30);
  }
}
