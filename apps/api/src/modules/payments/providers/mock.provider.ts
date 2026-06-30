import { Injectable } from '@nestjs/common';
import { genToken } from '../../../common/utils/ids';
import {
  CreateDepositInput,
  CreateDepositResult,
  CreateWithdrawalInput,
  CreateWithdrawalResult,
  PaymentProvider,
} from './provider.interface';

/**
 * Sandbox provider — NO real money. Generates plausible-looking addresses and
 * instantly "processes" withdrawals. Deposits stay PENDING until confirmed via
 * the sandbox/admin endpoint (simulating a blockchain confirmation / webhook).
 */
@Injectable()
export class MockProvider implements PaymentProvider {
  readonly name = 'mock';

  async createDeposit(input: CreateDepositInput): Promise<CreateDepositResult> {
    // Fiat deposits (no crypto network) get a hosted-invoice reference; a real
    // gateway would return a checkout link / card form here. Crypto rails — when
    // the real provider lands — would instead return an on-chain address.
    const address = input.network
      ? `${this.cryptoPrefix(input)}${genToken(34)}`
      : `INV-${genToken(12)}`;
    return {
      address,
      reference: `DEP-${genToken(8)}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      meta: { sandbox: true, network: input.network ?? null },
    };
  }

  private cryptoPrefix(input: CreateDepositInput): string {
    if (input.network === 'TRC20') return 'T';
    if (input.network === 'TON') return 'UQ';
    if (input.network === 'SOL') return 'So';
    return input.currency === 'BTC' ? 'bc1' : '0x';
  }

  async createWithdrawal(_input: CreateWithdrawalInput): Promise<CreateWithdrawalResult> {
    return {
      status: 'COMPLETED',
      txHash: `0x${genToken(40)}`.toLowerCase(),
      meta: { sandbox: true },
    };
  }
}
