import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsBoolean, IsNumberString, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';

class CreateDepositDto {
  @IsString() currency: string;
  @IsOptional() @IsString() network?: string;
  @IsNumberString() amount: string;
  @IsOptional() @IsBoolean() applyBonus?: boolean;
}
class CreateWithdrawalDto {
  @IsString() currency: string;
  @IsOptional() @IsString() network?: string;
  @IsNumberString() amount: string;
  @IsString() address: string;
}

@Controller('payments')
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @Get('deposits')
  deposits(@CurrentUser('id') userId: string) {
    return this.payments.listDeposits(userId);
  }

  @Post('deposits')
  createDeposit(@CurrentUser('id') userId: string, @Body() dto: CreateDepositDto) {
    return this.payments.createDeposit(userId, dto);
  }

  /** Sandbox: simulate the blockchain/PSP confirming the user's own mock deposit. */
  @Post('deposits/:id/confirm')
  confirm(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.payments.confirmDeposit(id, { actorUserId: userId });
  }

  @Get('withdrawals')
  withdrawals(@CurrentUser('id') userId: string) {
    return this.payments.listWithdrawals(userId);
  }

  @Post('withdrawals')
  createWithdrawal(@CurrentUser('id') userId: string, @Body() dto: CreateWithdrawalDto) {
    return this.payments.createWithdrawal(userId, dto);
  }
}
