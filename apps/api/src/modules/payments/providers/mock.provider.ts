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
    const prefix =
      input.network === 'TRC20'
        ? 'T'
        : input.network === 'TON'
          ? 'UQ'
          : input.network === 'SOL'
            ? 'So'
            : input.currency === 'BTC'
              ? 'bc1'
              : '0x';
    return {
      address: `${prefix}${genToken(34)}`,
      reference: `DEP-${genToken(8)}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      meta: { sandbox: true, network: input.network ?? null },
    };
  }

  async createWithdrawal(_input: CreateWithdrawalInput): Promise<CreateWithdrawalResult> {
    return {
      status: 'COMPLETED',
      txHash: `0x${genToken(40)}`.toLowerCase(),
      meta: { sandbox: true },
    };
  }
}
