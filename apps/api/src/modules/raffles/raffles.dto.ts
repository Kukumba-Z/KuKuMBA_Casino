import { RaffleAudience, RaffleCreatorType } from '@prisma/client';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CreateRaffleDto, DEPOSIT_WINDOWS, UpdateRaffleDto } from './raffles.service';

const AUDIENCES: RaffleAudience[] = ['ALL', 'PARTNER_REFERRALS'];

/**
 * Shared request bodies for raffle management — used by both the /raffles
 * (ADMIN/PARTNER) and /admin/raffles (permission-gated staff) controllers.
 * Every condition field must be declared here: the global whitelist
 * ValidationPipe strips anything the class doesn't know about.
 */
export class CreateRaffleBody implements CreateRaffleDto {
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
  @IsOptional() @IsString() opensAt?: string;
  @IsOptional() @IsString() closesAt?: string;
  @IsOptional() @IsString() drawAt?: string;
  // entry conditions
  @IsOptional() @IsBoolean() requiresDeposit?: boolean;
  @IsOptional() @IsNumberString() minDeposit?: string | null;
  @IsOptional() @IsIn(DEPOSIT_WINDOWS as readonly number[]) depositWithinDays?: number | null;
  @IsOptional() @IsInt() @Min(0) minVipLevel?: number | null;
  @IsOptional() @IsIn(AUDIENCES) audience?: RaffleAudience;
  @IsOptional() @IsString() partnerId?: string | null;
}

export class UpdateRaffleBody implements UpdateRaffleDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() descriptionRu?: string;
  @IsOptional() @IsString() descriptionEn?: string;
  @IsOptional() @IsString() creatorName?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() mode?: any;
  @IsOptional() @IsNumberString() prizePool?: string;
  @IsOptional() @IsInt() @Min(1) winnersCount?: number;
  @IsOptional() @IsNumberString() entryCost?: string;
  @IsOptional() @IsInt() @Min(1) maxEntriesPerUser?: number;
  @IsOptional() @IsString() opensAt?: string | null;
  @IsOptional() @IsString() closesAt?: string | null;
  @IsOptional() @IsString() drawAt?: string | null;
  @IsOptional() @IsBoolean() requiresDeposit?: boolean;
  @IsOptional() @IsNumberString() minDeposit?: string | null;
  @IsOptional() @IsIn(DEPOSIT_WINDOWS as readonly number[]) depositWithinDays?: number | null;
  @IsOptional() @IsInt() @Min(0) minVipLevel?: number | null;
  @IsOptional() @IsIn(AUDIENCES) audience?: RaffleAudience;
  @IsOptional() @IsString() partnerId?: string | null;
}

export class DrawRaffleBody {
  @IsOptional() @IsString() clientSeed?: string;
}
