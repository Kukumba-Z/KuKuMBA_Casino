import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RaffleCreatorType } from '@prisma/client';
import { IsInt, IsNumberString, IsOptional, IsString, Min } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateRaffleDto, RafflesService } from './raffles.service';

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
  @IsOptional() @IsString() closesAt?: string;
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

  @Roles('ADMIN')
  @Post(':id/draw')
  draw(@Param('id') id: string, @Body() dto: DrawBody) {
    return this.raffles.draw(id, dto.clientSeed);
  }
}
