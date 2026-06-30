import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RaffleAudience, RaffleCreatorType } from '@prisma/client';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CreateRaffleDto,
  DEPOSIT_WINDOWS,
  RafflesService,
  UpdateRaffleDto,
} from './raffles.service';

const AUDIENCES: RaffleAudience[] = ['ALL', 'PARTNER_REFERRALS'];

class CreateRaffleBody implements CreateRaffleDto {
  @IsString() title: string;
  @IsOptional() @IsString() descriptionRu?: string;
  @IsOptional() @IsString() descriptionEn?: string;
  @IsOptional() @IsString() creatorType?: RaffleCreatorType;
  @IsOptional() @IsString() creatorName?: string;
  @IsString() currency: string;
  @IsOptional() @IsString() mode?: any;
  @IsNumberString() prizePool: string;
  @IsOptional() @IsInt() @Min(1) winnersCount?: number;
  @IsOptional() @IsNumberString() entryCost?: string;
  @IsOptional() @IsInt() @Min(1) maxEntriesPerUser?: number;
  @IsOptional() @IsString() opensAt?: string;
  @IsOptional() @IsString() closesAt?: string;
  @IsOptional() @IsString() drawAt?: string;
  // entry conditions
  @IsOptional() @IsBoolean() requiresDeposit?: boolean;
  @IsOptional() @IsNumberString() minDeposit?: string | null;
  @IsOptional() @IsIn(DEPOSIT_WINDOWS as readonly number[]) depositWithinDays?: number | null;
  @IsOptional() @IsIn(AUDIENCES) audience?: RaffleAudience;
  @IsOptional() @IsString() partnerId?: string | null;
}

class UpdateRaffleBody implements UpdateRaffleDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() descriptionRu?: string;
  @IsOptional() @IsString() descriptionEn?: string;
  @IsOptional() @IsString() creatorName?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() mode?: any;
  @IsOptional() @IsNumberString() prizePool?: string;
  @IsOptional() @IsInt() @Min(1) winnersCount?: number;
  @IsOptional() @IsNumberString() entryCost?: string;
  @IsOptional() @IsInt() @Min(1) maxEntriesPerUser?: number;
  @IsOptional() @IsString() opensAt?: string | null;
  @IsOptional() @IsString() closesAt?: string | null;
  @IsOptional() @IsString() drawAt?: string | null;
  @IsOptional() @IsBoolean() requiresDeposit?: boolean;
  @IsOptional() @IsNumberString() minDeposit?: string | null;
  @IsOptional() @IsIn(DEPOSIT_WINDOWS as readonly number[]) depositWithinDays?: number | null;
  @IsOptional() @IsIn(AUDIENCES) audience?: RaffleAudience;
  @IsOptional() @IsString() partnerId?: string | null;
}

class DrawBody {
  @IsOptional() @IsString() clientSeed?: string;
}

@Controller('raffles')
export class RafflesController {
  constructor(private raffles: RafflesService) {}

  @Public()
  @Get()
  list() {
    return this.raffles.list();
  }

  @Public()
  @Get(':id')
  get(@Param('id') id: string, @Query('userId') _u?: string) {
    return this.raffles.get(id);
  }

  @Public()
  @Get(':id/participants')
  participants(@Param('id') id: string) {
    return this.raffles.participants(id);
  }

  /** Authenticated: how many tickets the current user holds in this raffle. */
  @Get(':id/mine')
  mine(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.raffles.myEntry(userId, id);
  }

  @Post(':id/join')
  join(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.raffles.join(userId, id);
  }

  // Admin / partner management
  @Roles('ADMIN', 'PARTNER')
  @Post()
  create(@CurrentUser('id') adminId: string, @Body() dto: CreateRaffleBody) {
    return this.raffles.create(adminId, dto);
  }

  @Roles('ADMIN', 'PARTNER')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRaffleBody) {
    return this.raffles.update(id, dto);
  }

  @Roles('ADMIN', 'PARTNER')
  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.raffles.cancel(id);
  }

  // Manual draw kept for debugging; the cron auto-draws at drawAt.
  @Roles('ADMIN')
  @Post(':id/draw')
  draw(@Param('id') id: string, @Body() dto: DrawBody) {
    return this.raffles.draw(id, dto.clientSeed);
  }
}
