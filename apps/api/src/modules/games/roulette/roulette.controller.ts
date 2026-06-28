import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { RouletteService } from './roulette.service';

class RouletteBetDto {
  @IsString() betType: string;
  @IsOptional() selection?: any;
  @IsNumber() stake: number;
}

class PlayDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => RouletteBetDto)
  bets: RouletteBetDto[];

  @IsString() currency: string;
  @IsIn(['DEMO', 'REAL']) mode: 'DEMO' | 'REAL';
}

@Controller('games/roulette')
export class RouletteController {
  constructor(private roulette: RouletteService) {}

  @Public()
  @Get()
  info() {
    return this.roulette.info();
  }

  @Public()
  @Get('live')
  live(@Query('limit') limit?: string) {
    return this.roulette.liveFeed(limit ? +limit : 100);
  }

  @Public()
  @Get('bigwins')
  bigWins(@Query('limit') limit?: string) {
    return this.roulette.bigWins(limit ? +limit : 500);
  }

  @Post('play')
  play(@CurrentUser('id') userId: string, @Body() dto: PlayDto) {
    return this.roulette.play(userId, { bets: dto.bets, currency: dto.currency, mode: dto.mode as any });
  }

  @Get('history')
  history(@CurrentUser('id') userId: string, @Query('limit') limit?: string) {
    return this.roulette.history(userId, limit ? +limit : 30);
  }
}
