import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpsertVipLevelDto {
  @IsInt() @Min(0) @Max(1000) level: number;
  @IsString() @IsNotEmpty() @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(40) icon?: string;
  @IsOptional() @IsString() @MaxLength(40) color?: string;
  @IsNumberString() depositRequiredUsd: string;
  @IsNumberString() wagerRequiredUsd: string;
  @IsNumber() @Min(0) @Max(100) cashbackPercent: number;
  @IsNumber() @Min(0) @Max(100) rakebackPercent: number;
  @IsOptional() @IsString() @MaxLength(500) perksRu?: string;
  @IsOptional() @IsString() @MaxLength(500) perksEn?: string;
}
