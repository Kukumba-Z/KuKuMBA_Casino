import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UsersService } from './users.service';

class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(500) avatarUrl?: string;
  @IsOptional() @IsString() @MaxLength(2) countryCode?: string;
  @IsOptional() @IsString() locale?: string;
}
class ChangePasswordDto {
  @IsString() oldPassword: string;
  @IsString() newPassword: string;
}
class LinkAccountDto {
  @IsString() provider: string;
  @IsString() providerUserId: string;
  @IsOptional() @IsString() displayName?: string;
}

@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  me(@CurrentUser('id') userId: string) {
    return this.users.profile(userId);
  }

  @Patch('me')
  update(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(userId, dto);
  }

  @Post('me/password')
  changePassword(@CurrentUser('id') userId: string, @Body() dto: ChangePasswordDto) {
    return this.users.changePassword(userId, dto.oldPassword, dto.newPassword);
  }

  @Post('me/linked')
  link(@CurrentUser('id') userId: string, @Body() dto: LinkAccountDto) {
    return this.users.linkAccount(userId, dto.provider, dto.providerUserId, dto.displayName);
  }

  @Delete('me/linked/:id')
  unlink(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.users.unlinkAccount(userId, id);
  }

  @Public()
  @Get(':accountId/card')
  card(@Param('accountId') accountId: string) {
    return this.users.publicCard(+accountId);
  }
}
