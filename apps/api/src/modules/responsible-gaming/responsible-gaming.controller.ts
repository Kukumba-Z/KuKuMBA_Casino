import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { RgLimitType } from '@prisma/client';
import { IsIn, IsInt, IsNumberString, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResponsibleGamingService } from './responsible-gaming.service';

class SetLimitDto {
  @IsIn(['DEPOSIT', 'LOSS', 'WAGER', 'SESSION_TIME']) type: RgLimitType;
  @IsIn(['DAILY', 'WEEKLY', 'MONTHLY']) period: string;
  @IsOptional() @IsNumberString() amount?: string;
  @IsOptional() @IsInt() minutes?: number;
}
class SelfExcludeDto {
  @IsOptional() @IsString() until?: string;
  @IsOptional() @IsString() reason?: string;
}

@Controller('responsible-gaming')
export class ResponsibleGamingController {
  constructor(private rg: ResponsibleGamingService) {}

  @Get('limits')
  limits(@CurrentUser('id') userId: string) {
    return this.rg.limits(userId);
  }

  @Post('limits')
  setLimit(@CurrentUser('id') userId: string, @Body() dto: SetLimitDto) {
    return this.rg.setLimit(userId, dto);
  }

  @Delete('limits/:id')
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.rg.removeLimit(userId, id);
  }

  @Post('self-exclude')
  selfExclude(@CurrentUser('id') userId: string, @Body() dto: SelfExcludeDto) {
    return this.rg.selfExclude(userId, dto);
  }
}
