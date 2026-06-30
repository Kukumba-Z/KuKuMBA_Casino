import { Global, Module } from '@nestjs/common';
import { ExchangeRatesService } from './exchange-rates.service';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

/**
 * Global so any feature module (games, bonuses, raffles, payments…) can inject
 * WalletService to move money through the ledger.
 */
@Global()
@Module({
  controllers: [WalletController],
  providers: [WalletService, ExchangeRatesService],
  exports: [WalletService, ExchangeRatesService],
})
export class WalletModule {}
