import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PromocodesService } from './promocodes.service';

class RedeemDto {
  @IsString() @MinLength(2) @MaxLength(40) code: string;
}

@Controller('promocodes')
export class PromocodesController {
  constructor(private promocodes: PromocodesService) {}

  @Post('redeem')
  redeem(@CurrentUser('id') userId: string, @Body() dto: RedeemDto) {
    return this.promocodes.redeem(userId, dto.code);
  }

  @Get('me')
  mine(@CurrentUser('id') userId: string) {
    return this.promocodes.myRedemptions(userId);
  }
}
