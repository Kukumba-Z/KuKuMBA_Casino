import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminService } from './admin.service';

@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  // Users
  @Get('users')
  users(@Query('q') q?: string, @Query('skip') skip?: string, @Query('take') take?: string) {
    return this.admin.listUsers(q, skip ? +skip : 0, take ? +take : 25);
  }

  @Get('users/:id')
  user(@Param('id') id: string) {
    return this.admin.getUser(id);
  }

  @Post('users/:id/status')
  status(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() body: any) {
    return this.admin.setUserStatus(adminId, id, body.status);
  }

  @Post('users/:id/role')
  role(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() body: any) {
    return this.admin.setUserRole(adminId, id, body.role);
  }

  @Post('users/:id/kyc')
  kyc(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() body: any) {
    return this.admin.reviewKyc(adminId, id, !!body.approve, body.note);
  }

  @Post('users/:id/vip')
  vip(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() body: any) {
    return this.admin.setVip(adminId, id, +body.level, body.xp !== undefined ? +body.xp : undefined);
  }

  @Post('balance/adjust')
  adjust(@CurrentUser('id') adminId: string, @Body() body: any) {
    return this.admin.adjustBalance(adminId, body);
  }

  // Payments
  @Get('deposits')
  deposits(@Query('status') status?: string) {
    return this.admin.listDeposits(status);
  }

  @Post('deposits/:id/confirm')
  confirmDeposit(@CurrentUser('id') adminId: string, @Param('id') id: string) {
    return this.admin.confirmDeposit(adminId, id);
  }

  @Get('withdrawals')
  withdrawals(@Query('status') status?: string) {
    return this.admin.listWithdrawals(status);
  }

  @Post('withdrawals/:id/approve')
  approve(@CurrentUser('id') adminId: string, @Param('id') id: string) {
    return this.admin.approveWithdrawal(adminId, id);
  }

  @Post('withdrawals/:id/reject')
  reject(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() body: any) {
    return this.admin.rejectWithdrawal(adminId, id, body?.reason);
  }

  // Promo / bonuses
  @Get('promocodes')
  promocodes() {
    return this.admin.listPromocodes();
  }

  @Post('promocodes')
  createPromo(@CurrentUser('id') adminId: string, @Body() body: any) {
    return this.admin.createPromocode(adminId, body);
  }

  @Patch('promocodes/:id')
  updatePromo(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() body: any) {
    return this.admin.updatePromocode(adminId, id, body);
  }

  @Get('bonuses')
  bonuses() {
    return this.admin.listBonuses();
  }

  @Post('bonuses')
  upsertBonus(@CurrentUser('id') adminId: string, @Body() body: any) {
    return this.admin.upsertBonus(adminId, body);
  }

  // Currencies / settings / content
  @Get('currencies')
  currencies() {
    return this.admin.listCurrencies();
  }

  @Post('currencies')
  upsertCurrency(@CurrentUser('id') adminId: string, @Body() body: any) {
    return this.admin.upsertCurrency(adminId, body);
  }

  @Get('settings')
  settings() {
    return this.admin.listSettings();
  }

  @Post('settings')
  setSetting(@CurrentUser('id') adminId: string, @Body() body: any) {
    return this.admin.setSetting(adminId, body.key, body.value);
  }

  @Get('content')
  content() {
    return this.admin.listContent();
  }

  @Post('content')
  upsertContent(@CurrentUser('id') adminId: string, @Body() body: any) {
    return this.admin.upsertContent(adminId, body);
  }

  // Misc
  @Get('tickets')
  tickets(@Query('status') status?: string) {
    return this.admin.listTickets(status);
  }

  @Delete('chat/:id')
  deleteChat(@CurrentUser('id') adminId: string, @Param('id') id: string) {
    return this.admin.deleteChatMessage(adminId, id);
  }

  @Get('audit')
  audit(@Query('take') take?: string) {
    return this.admin.auditLog(take ? +take : 100);
  }

  @Get('transactions')
  transactions(@Query('take') take?: string) {
    return this.admin.recentTransactions(take ? +take : 100);
  }
}
