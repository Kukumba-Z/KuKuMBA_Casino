import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectWithdrawalDto {
  @IsString() @MinLength(2) @MaxLength(500) reason: string;
}
