import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class UpsertCurrencyDto {
  @Matches(/^[A-Z0-9]{2,10}$/) code: string;
  @IsString() @IsNotEmpty() name: string;
  @IsIn(['DEMO', 'FIAT', 'CRYPTO']) type: 'DEMO' | 'FIAT' | 'CRYPTO';
  @IsOptional() @IsString() symbol?: string;
  @IsOptional() @IsInt() @Min(0) @Max(18) decimals?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) networks?: string[];
  @IsOptional() @IsNumberString() minDeposit?: string;
  @IsOptional() @IsNumberString() minWithdrawal?: string;
  @IsOptional() @IsNumberString() usdRate?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}
