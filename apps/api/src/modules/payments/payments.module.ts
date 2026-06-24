import { Global, Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { MockProvider } from './providers/mock.provider';
import { PAYMENT_PROVIDER } from './providers/provider.interface';

/**
 * Swap the provider here (or via a factory keyed on PAYMENT_PROVIDER env) to go
 * from sandbox to a real crypto gateway / fiat PSP — nothing else changes.
 */
@Global()
@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    MockProvider,
    { provide: PAYMENT_PROVIDER, useExisting: MockProvider },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
