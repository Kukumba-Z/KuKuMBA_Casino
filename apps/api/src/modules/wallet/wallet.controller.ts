import { Controller, Get, Query } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WalletService } from './wallet.service';

@Controller('wallet')
export class WalletController {
  constructor(
    private wallet: WalletService,
    private prisma: PrismaService,
  ) {}

  @Get('balances')
  balances(@CurrentUser('id') userId: string) {
    return this.wallet.balances(userId);
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
