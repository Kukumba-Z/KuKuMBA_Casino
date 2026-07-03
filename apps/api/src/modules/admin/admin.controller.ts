import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UpsertProviderDto } from '../providers/dto/callbacks.dto';
import { ProvidersService } from '../providers/providers.service';
import { CreateRaffleBody, DrawRaffleBody, UpdateRaffleBody } from '../raffles/raffles.dto';
import { SupportService } from '../support/support.service';
import { displayName, multerOptionsFor, type UploadedFileLike } from '../uploads/uploads.config';
import { UploadsService } from '../uploads/uploads.service';
import { AdminService } from './admin.service';
import { BetsAdminService } from './bets-admin.service';
import { AdjustBalanceDto } from './dto/adjust-balance.dto';
import { RejectWithdrawalDto } from './dto/reject-withdrawal.dto';
import { UpsertCurrencyDto } from './dto/upsert-currency.dto';
import { UpsertVipLevelDto } from './dto/vip-level.dto';

@Roles('ADMIN', 'SUPPORT', 'MODERATOR')
@Controller('admin')
export class AdminController {
  constructor(
    private admin: AdminService,
    private bets: BetsAdminService,
    private providers: ProvidersService,
    private support: SupportService,
    private uploads: UploadsService,
  ) {}

  // Current operator — role + the capabilities they may use (gates the SPA).
  @Get('me')
  me(@CurrentUser() user: { id: string; role: UserRole }) {
    return this.admin.operatorContext(user);
  }

  @Get('dashboard')
  @RequirePermission('dashboard.view')
  dashboard() {
    return this.admin.dashboard();
  }

  // Roles & permissions
  @Get('permissions')
  @RequirePermission('roles.manage')
  permissions() {
    return this.admin.permissionMatrix();
  }

  @Post('permissions')
  @RequirePermission('roles.manage')
  setPermission(@CurrentUser('id') adminId: string, @Body() body: any) {
    return this.admin.setRolePermission(adminId, body.role, body.permission, !!body.allowed);
  }

  // Users
  @Get('users')
  @RequirePermission('users.view')
  users(@Query('q') q?: string, @Query('skip') skip?: string, @Query('take') take?: string) {
    return this.admin.listUsers(q, skip ? +skip : 0, take ? +take : 25);
  }

  @Get('users/:id')
  @RequirePermission('users.view')
  user(@Param('id') id: string) {
    return this.admin.getUser(id);
  }

  @Post('users/:id/status')
  @RequirePermission('users.ban')
  status(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() body: any) {
    return this.admin.setUserStatus(adminId, id, body.status, body.reason);
  }

  @Patch('users/:id')
  @RequirePermission('users.edit')
  editUser(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() body: any) {
    return this.admin.updateUserAccount(adminId, id, body);
  }

  @Post('users/:id/notify')
  @RequirePermission('notifications.send')
  notifyUser(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() body: any) {
    return this.admin.notifyUser(adminId, id, body);
  }

  @Post('users/:id/bonus-access')
  @RequirePermission('bonuses.manage')
  bonusAccess(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() body: any) {
    return this.admin.setBonusAccess(adminId, id, !!body?.allowed);
  }

  @Post('users/:id/grant-bonus')
  @RequirePermission('bonuses.manage')
  grantBonus(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() body: any) {
    return this.admin.grantUserBonus(adminId, id, body);
  }

  @Post('users/:id/reset-password')
  @RequirePermission('users.edit')
  resetPassword(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() body: any) {
    return this.admin.resetUserPassword(adminId, id, body?.password);
  }

  @Get('users/:id/sessions')
  @RequirePermission('users.view')
  sessions(@Param('id') id: string) {
    return this.admin.listSessions(id);
  }

  @Post('users/:id/revoke-sessions')
  @RequirePermission('users.edit')
  revokeSessions(@CurrentUser('id') adminId: string, @Param('id') id: string) {
    return this.admin.revokeSessions(adminId, id);
  }

  @Get('users/:id/bets')
  @RequirePermission('users.view')
  userBets(@Param('id') id: string, @Query('take') take?: string) {
    return this.admin.userBets(id, take ? +take : 25);
  }

  @Post('users/:id/role')
  @RequirePermission('users.role')
  role(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() body: any) {
    return this.admin.setUserRole(adminId, id, body.role);
  }

  @Post('users/:id/kyc')
  @RequirePermission('kyc.review')
  kyc(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() body: any) {
    return this.admin.reviewKyc(adminId, id, !!body.approve, body.note);
  }

  @Post('users/:id/vip')
  @RequirePermission('users.vip')
  vip(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() body: any) {
    return this.admin.setVip(adminId, id, +body.level);
  }

  // VIP ladder CRUD
  @Get('vip-levels')
  @RequirePermission('vip.manage')
  vipLevels() {
    return this.admin.listVipLevels();
  }

  @Post('vip-levels')
  @RequirePermission('vip.manage')
  upsertVipLevel(@CurrentUser('id') adminId: string, @Body() body: UpsertVipLevelDto) {
    return this.admin.upsertVipLevel(adminId, body);
  }

  @Delete('vip-levels/:level')
  @RequirePermission('vip.manage')
  deleteVipLevel(@CurrentUser('id') adminId: string, @Param('level') level: string) {
    return this.admin.deleteVipLevel(adminId, +level);
  }

  // Bet reversal (refund = stake only; rollback = full undo incl. winnings)
  @Post('bets/:id/refund')
  @RequirePermission('bets.manage')
  async refundBet(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() body: { reason?: string }) {
    const res = await this.bets.refund(id, body?.reason);
    await this.admin.auditAction(adminId, 'bet.refund', 'bet', id, { reason: body?.reason });
    return res;
  }

  @Post('bets/:id/rollback')
  @RequirePermission('bets.manage')
  async rollbackBet(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() body: { reason?: string }) {
    const res = await this.bets.rollback(id, body?.reason);
    await this.admin.auditAction(adminId, 'bet.rollback', 'bet', id, { reason: body?.reason });
    return res;
  }

  @Post('balance/adjust')
  @RequirePermission('users.balance')
  adjust(@CurrentUser('id') adminId: string, @Body() body: AdjustBalanceDto) {
    return this.admin.adjustBalance(adminId, body);
  }

  // Payments
  @Get('deposits')
  @RequirePermission('deposits.manage')
  deposits(@Query('status') status?: string) {
    return this.admin.listDeposits(status);
  }

  @Post('deposits/:id/confirm')
  @RequirePermission('deposits.manage')
  confirmDeposit(@CurrentUser('id') adminId: string, @Param('id') id: string) {
    return this.admin.confirmDeposit(adminId, id);
  }

  @Get('withdrawals')
  @RequirePermission('withdrawals.manage')
  withdrawals(@Query('status') status?: string) {
    return this.admin.listWithdrawals(status);
  }

  @Post('withdrawals/:id/approve')
  @RequirePermission('withdrawals.manage')
  approve(@CurrentUser('id') adminId: string, @Param('id') id: string) {
    return this.admin.approveWithdrawal(adminId, id);
  }

  @Post('withdrawals/:id/reject')
  @RequirePermission('withdrawals.manage')
  reject(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() body: RejectWithdrawalDto) {
    return this.admin.rejectWithdrawal(adminId, id, body.reason);
  }

  // Promo / bonuses
  @Get('promocodes')
  @RequirePermission('promo.manage')
  promocodes() {
    return this.admin.listPromocodes();
  }

  @Post('promocodes')
  @RequirePermission('promo.manage')
  createPromo(@CurrentUser('id') adminId: string, @Body() body: any) {
    return this.admin.createPromocode(adminId, body);
  }

  @Patch('promocodes/:id')
  @RequirePermission('promo.manage')
  updatePromo(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() body: any) {
    return this.admin.updatePromocode(adminId, id, body);
  }

  // Raffles — permission-gated staff surface (PARTNERs keep using /raffles).
  @Get('raffles')
  @RequirePermission('raffles.manage')
  raffles() {
    return this.admin.listRaffles();
  }

  @Post('raffles')
  @RequirePermission('raffles.manage')
  createRaffle(@CurrentUser('id') adminId: string, @Body() body: CreateRaffleBody) {
    return this.admin.createRaffle(adminId, body);
  }

  @Patch('raffles/:id')
  @RequirePermission('raffles.manage')
  updateRaffle(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() body: UpdateRaffleBody) {
    return this.admin.updateRaffle(adminId, id, body);
  }

  @Post('raffles/:id/cancel')
  @RequirePermission('raffles.manage')
  cancelRaffle(@CurrentUser('id') adminId: string, @Param('id') id: string) {
    return this.admin.cancelRaffle(adminId, id);
  }

  @Post('raffles/:id/draw')
  @RequirePermission('raffles.manage')
  drawRaffle(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() body: DrawRaffleBody) {
    return this.admin.drawRaffle(adminId, id, body?.clientSeed);
  }

  @Get('bonuses')
  @RequirePermission('bonuses.manage')
  bonuses() {
    return this.admin.listBonuses();
  }

  @Post('bonuses')
  @RequirePermission('bonuses.manage')
  upsertBonus(@CurrentUser('id') adminId: string, @Body() body: any) {
    return this.admin.upsertBonus(adminId, body);
  }

  @Delete('bonuses/:key')
  @RequirePermission('bonuses.manage')
  deleteBonus(@CurrentUser('id') adminId: string, @Param('key') key: string) {
    return this.admin.deleteBonus(adminId, key);
  }

  // Games (catalog CRUD)
  @Get('games')
  @RequirePermission('games.manage')
  games() {
    return this.admin.listGames();
  }

  @Post('games')
  @RequirePermission('games.manage')
  upsertGame(@CurrentUser('id') adminId: string, @Body() body: any) {
    return this.admin.upsertGame(adminId, body);
  }

  @Patch('games/:key')
  @RequirePermission('games.manage')
  patchGame(@CurrentUser('id') adminId: string, @Param('key') key: string, @Body() body: any) {
    return this.admin.patchGame(adminId, key, body);
  }

  @Delete('games/:key')
  @RequirePermission('games.manage')
  deleteGame(@CurrentUser('id') adminId: string, @Param('key') key: string) {
    return this.admin.deleteGame(adminId, key);
  }

  // Game providers / aggregators
  @Get('providers')
  @RequirePermission('providers.manage')
  listProviders() {
    return this.providers.listProviders();
  }

  @Post('providers')
  @RequirePermission('providers.manage')
  async upsertProvider(@CurrentUser('id') adminId: string, @Body() body: UpsertProviderDto) {
    const res = await this.providers.upsertProvider(body);
    await this.admin.auditAction(adminId, 'provider.upsert', 'provider', body.key, {
      name: body.name,
      kind: body.kind,
      secretsChanged: { apiKey: !!body.apiKey, webhookSecret: !!body.webhookSecret },
    });
    return res;
  }

  @Delete('providers/:key')
  @RequirePermission('providers.manage')
  async deleteProvider(@CurrentUser('id') adminId: string, @Param('key') key: string) {
    const res = await this.providers.deleteProvider(key);
    await this.admin.auditAction(adminId, 'provider.delete', 'provider', key);
    return res;
  }

  // Currencies / settings / content
  @Get('currencies')
  @RequirePermission('currencies.manage')
  currencies() {
    return this.admin.listCurrencies();
  }

  @Post('currencies')
  @RequirePermission('currencies.manage')
  upsertCurrency(@CurrentUser('id') adminId: string, @Body() body: UpsertCurrencyDto) {
    return this.admin.upsertCurrency(adminId, body);
  }

  @Get('settings')
  @RequirePermission('settings.manage')
  settings() {
    return this.admin.listSettings();
  }

  @Post('settings')
  @RequirePermission('settings.manage')
  setSetting(@CurrentUser('id') adminId: string, @Body() body: any) {
    return this.admin.setSetting(adminId, body.key, body.value);
  }

  @Get('content')
  @RequirePermission('content.manage')
  content() {
    return this.admin.listContent();
  }

  @Post('content')
  @RequirePermission('content.manage')
  upsertContent(@CurrentUser('id') adminId: string, @Body() body: any) {
    return this.admin.upsertContent(adminId, body);
  }

  // Misc
  @Get('tickets')
  @RequirePermission('tickets.manage')
  tickets(@Query('status') status?: string) {
    return this.admin.listTickets(status);
  }

  // Full thread for the detail view (delegates to the shared SupportService).
  @Get('tickets/:id')
  @RequirePermission('tickets.manage')
  ticket(@CurrentUser() user: any, @Param('id') id: string) {
    return this.support.getTicket(user, id);
  }

  @Post('tickets/:id/reply')
  @RequirePermission('tickets.manage')
  @UseInterceptors(FileInterceptor('file', multerOptionsFor('support')))
  replyTicket(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { body?: string },
    @UploadedFile() file?: UploadedFileLike,
  ) {
    const attachment = file
      ? { url: this.uploads.publicUrl('support', file.filename), name: displayName(file.originalname), size: file.size }
      : undefined;
    return this.support.reply(user, id, body?.body, attachment);
  }

  @Patch('tickets/:id/status')
  @RequirePermission('tickets.manage')
  setTicketStatus(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { status: any }) {
    return this.support.setStatus(user, id, body?.status);
  }

  @Get('chat')
  @RequirePermission('chat.moderate')
  chat(@Query('room') room?: string, @Query('take') take?: string) {
    return this.admin.listChat(room || 'global', take ? +take : 80);
  }

  @Delete('chat/:id')
  @RequirePermission('chat.moderate')
  deleteChat(@CurrentUser('id') adminId: string, @Param('id') id: string) {
    return this.admin.deleteChatMessage(adminId, id);
  }

  @Post('users/:id/mute')
  @RequirePermission('chat.moderate')
  mute(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() body: any) {
    return this.admin.muteUser(adminId, id, body?.minutes ? +body.minutes : 0);
  }

  @Post('broadcast')
  @RequirePermission('notifications.send')
  broadcast(@CurrentUser('id') adminId: string, @Body() body: any) {
    return this.admin.broadcast(adminId, body);
  }

  @Get('audit')
  @RequirePermission('audit.view')
  audit(@Query('take') take?: string) {
    return this.admin.auditLog(take ? +take : 100);
  }

  @Get('transactions')
  @RequirePermission('transactions.view')
  transactions(@Query('take') take?: string) {
    return this.admin.recentTransactions(take ? +take : 100);
  }
}
