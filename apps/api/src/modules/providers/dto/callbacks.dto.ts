import { IsIn, IsNotEmpty, IsNumberString, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Player launches an external game — returns the provider's iframe/redirect URL. */
export class LaunchGameDto {
  @IsString() @IsNotEmpty() gameKey: string;
  @IsString() @IsNotEmpty() currency: string;
  @IsIn(['DEMO', 'REAL']) mode: 'DEMO' | 'REAL';
  @IsOptional() @IsString() @MaxLength(8) locale?: string;
}

export class BalanceCallbackDto {
  @IsString() @IsNotEmpty() sessionToken: string;
}

export class BetCallbackDto {
  @IsString() @IsNotEmpty() sessionToken: string;
  /** Provider's unique transaction id — the idempotency key. */
  @IsString() @IsNotEmpty() @MaxLength(128) transactionId: string;
  @IsOptional() @IsString() @MaxLength(128) roundId?: string;
  @IsNumberString() amount: string;
  @IsString() @IsNotEmpty() currency: string;
}

export class WinCallbackDto extends BetCallbackDto {}

export class RollbackCallbackDto {
  /** This rollback's own unique transaction id. */
  @IsString() @IsNotEmpty() @MaxLength(128) transactionId: string;
  /** The bet/win transaction being reversed. */
  @IsString() @IsNotEmpty() @MaxLength(128) referenceTransactionId: string;
  @IsOptional() @IsString() sessionToken?: string;
}

export class UpsertProviderDto {
  @Matches(/^[a-z0-9-]{2,32}$/) key: string;
  @IsString() @IsNotEmpty() @MaxLength(80) name: string;
  @IsOptional() @IsIn(['MOCK', 'GENERIC_SEAMLESS']) kind?: string;
  @IsOptional() @IsString() @MaxLength(500) baseUrl?: string;
  /** Write-only; empty/undefined keeps the stored secret. */
  @IsOptional() @IsString() @MaxLength(500) apiKey?: string;
  @IsOptional() @IsString() @MaxLength(500) webhookSecret?: string;
  @IsOptional() enabled?: boolean;
}
