/**
 * Payment provider abstraction. Swap the implementation (crypto gateway, fiat
 * PSP, …) without touching the rest of the platform. The default MockProvider
 * runs a self-contained sandbox so the full deposit/withdraw flow works with no
 * real money and no third-party credentials.
 */
export interface CreateDepositInput {
  userId: string;
  currency: string;
  network?: string;
  amount?: string;
}

export interface CreateDepositResult {
  /** Crypto address or fiat payment reference the user pays to. */
  address: string;
  reference?: string;
  /** When the address/intent expires. */
  expiresAt?: Date;
  meta?: any;
}

export interface CreateWithdrawalInput {
  userId: string;
  currency: string;
  network?: string;
  amount: string;
  address: string;
}

export interface CreateWithdrawalResult {
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED';
  txHash?: string;
  meta?: any;
}

export interface PaymentProvider {
  readonly name: string;
  createDeposit(input: CreateDepositInput): Promise<CreateDepositResult>;
  createWithdrawal(input: CreateWithdrawalInput): Promise<CreateWithdrawalResult>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
