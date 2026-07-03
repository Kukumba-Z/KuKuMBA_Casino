import { IsBoolean, IsIn, IsNotEmpty, IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdjustBalanceDto {
  @IsString() @IsNotEmpty() userId: string;
  @IsString() @IsNotEmpty() currency: string;
  @IsIn(['DEMO', 'REAL']) mode: 'DEMO' | 'REAL';
  /** Signed amount: positive credits, negative debits. */
  @IsNumberString() amount: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  /** Overdraft must be an explicit choice, never the default. */
  @IsOptional() @IsBoolean() allowNegative?: boolean;
}
