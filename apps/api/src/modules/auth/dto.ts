import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail() email: string;

  @IsString()
  @MinLength(3)
  @MaxLength(20)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'username must be alphanumeric/underscore' })
  username: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password: string;

  @IsOptional() @IsString() refCode?: string;
  @IsOptional() @IsString() locale?: string;
}

export class LoginDto {
  @IsString() login: string; // email or username
  @IsString() password: string;
}

export class RefreshDto {
  @IsString() refreshToken: string;
}
