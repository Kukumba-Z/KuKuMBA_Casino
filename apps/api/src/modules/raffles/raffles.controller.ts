import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateRaffleBody, DrawRaffleBody, UpdateRaffleBody } from './raffles.dto';
import { RafflesService } from './raffles.service';

@Controller('raffles')
export class RafflesController {
  constructor(private raffles: RafflesService) {}

  @Public()
  @Get()
  list() {
    return this.raffles.list();
  }

  @Public()
  @Get(':id')
  get(@Param('id') id: string, @Query('userId') _u?: string) {
    return this.raffles.get(id);
  }

  @Public()
  @Get(':id/participants')
  participants(@Param('id') id: string) {
    return this.raffles.participants(id);
  }

  /** Authenticated: how many tickets the current user holds in this raffle. */
  @Get(':id/mine')
  mine(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.raffles.myEntry(userId, id);
  }

  @Post(':id/join')
  join(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.raffles.join(userId, id);
  }

  // Admin / partner management
  @Roles('ADMIN', 'PARTNER')
  @Post()
  create(@CurrentUser('id') adminId: string, @Body() dto: CreateRaffleBody) {
    return this.raffles.create(adminId, dto);
  }

  @Roles('ADMIN', 'PARTNER')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRaffleBody) {
    return this.raffles.update(id, dto);
  }

  @Roles('ADMIN', 'PARTNER')
  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.raffles.cancel(id);
  }

  // Manual draw kept for debugging; the cron auto-draws at drawAt.
  @Roles('ADMIN')
  @Post(':id/draw')
  draw(@Param('id') id: string, @Body() dto: DrawRaffleBody) {
    return this.raffles.draw(id, dto.clientSeed);
  }
}
