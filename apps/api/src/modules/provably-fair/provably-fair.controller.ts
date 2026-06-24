import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ProvablyFairService } from './provably-fair.service';

class SetClientSeedDto {
  @IsString() clientSeed: string;
}
class RotateDto {
  @IsOptional() @IsString() clientSeed?: string;
}
class VerifyDto {
  @IsString() serverSeed: string;
  @IsString() clientSeed: string;
  @IsInt() @Min(0) nonce: number;
}

@Controller('provably-fair')
export class ProvablyFairController {
  constructor(private pf: ProvablyFairService) {}

  @Get('seed')
  seed(@CurrentUser('id') userId: string) {
    return this.pf.publicState(userId);
  }

  @Post('seed/client')
  setClient(@CurrentUser('id') userId: string, @Body() dto: SetClientSeedDto) {
    return this.pf.setClientSeed(userId, dto.clientSeed);
  }

  @Post('seed/rotate')
  rotate(@CurrentUser('id') userId: string, @Body() dto: RotateDto) {
    return this.pf.rotate(userId, dto.clientSeed);
  }

  @Public()
  @Post('verify')
  verify(@Body() dto: VerifyDto) {
    return this.pf.verify(dto.serverSeed, dto.clientSeed, dto.nonce);
  }
}
