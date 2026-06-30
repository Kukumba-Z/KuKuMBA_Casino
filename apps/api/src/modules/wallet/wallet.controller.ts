import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { IsNumberString, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
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
  ) {}

  @Get('balances')
  balances(@CurrentUser('id') userId: string) {
    return this.wallet.balances(userId);
  }

  @Post('demo/topup')
  demoTopup(@CurrentUser('id') userId: string) {
    return this.wallet.demoTopup(userId);
  }

  /** Convert between real fiat balances (e.g. USD → RUB) at the USD cross-rate. */
  @Post('convert')
  convert(@CurrentUser('id') userId: string, @Body() dto: ConvertBody) {
    return this.wallet.convert(userId, dto.from, dto.to, dto.amount);
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
