import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { IsNumberString, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ExchangeRatesService } from './exchange-rates.service';
import { WalletService } from './wallet.service';

class ConvertBody {
  @IsString() from: string;
  @IsString() to: string;
  @IsNumberString() amount: string;
}

@Controller('wallet')
export class WalletController {
  constructor(
    private wallet: WalletService,
    private prisma: PrismaService,
    private rates: ExchangeRatesService,
  ) {}

  @Get('balances')
  balances(@CurrentUser('id') userId: string) {
    return this.wallet.balances(userId);
  }

  @Post('demo/topup')
  demoTopup(@CurrentUser('id') userId: string) {
    return this.wallet.demoTopup(userId);
  }

  /** Convert between real fiat balances (e.g. USD → RUB) at the live USD cross-rate. */
  @Post('convert')
  convert(@CurrentUser('id') userId: string, @Body() dto: ConvertBody) {
    return this.wallet.convert(userId, dto.from, dto.to, dto.amount);
  }

  /** Live fiat rates ("1 unit = X USD") with the feed's timestamp — drives the UI. */
  @Public()
  @Get('rates')
  ratesSnapshot() {
    return this.rates.snapshot();
  }

  /** Admin: pull fresh rates from the FX feed on demand. */
  @Roles('ADMIN')
  @Post('rates/refresh')
  refreshRates() {
    return this.rates.refresh();
  }

  @Public()
  @Get('currencies')
  currencies() {
    return this.prisma.currency.findMany({
      where: { enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
  }

  @Get('transactions')
  transactions(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
    @Query('type') type?: TransactionType,
  ) {
    return this.wallet.transactions(userId, { limit: limit ? +limit : 50, type });
  }
}
