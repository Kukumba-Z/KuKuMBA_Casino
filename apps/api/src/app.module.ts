import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PrismaModule } from './common/prisma/prisma.module';
import { SettingsModule } from './config/settings.module';
import { PermissionsModule } from './modules/permissions/permissions.module';

import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { BonusesModule } from './modules/bonuses/bonuses.module';
import { CashbackModule } from './modules/cashback/cashback.module';
import { ChatModule } from './modules/chat/chat.module';
import { ContentModule } from './modules/content/content.module';
import { GamesModule } from './modules/games/games.module';
import { KycModule } from './modules/kyc/kyc.module';
import { LeaderboardsModule } from './modules/leaderboards/leaderboards.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PromocodesModule } from './modules/promocodes/promocodes.module';
import { ProvablyFairModule } from './modules/provably-fair/provably-fair.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { RafflesModule } from './modules/raffles/raffles.module';
import { RakebackModule } from './modules/rakeback/rakeback.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { ReferralsModule } from './modules/referrals/referrals.module';
import { ResponsibleGamingModule } from './modules/responsible-gaming/responsible-gaming.module';
import { StatsModule } from './modules/stats/stats.module';
import { SupportModule } from './modules/support/support.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { UsersModule } from './modules/users/users.module';
import { VipModule } from './modules/vip/vip.module';
import { WalletModule } from './modules/wallet/wallet.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    ScheduleModule.forRoot(),

    // platform / global services
    PrismaModule,
    PermissionsModule,
    SettingsModule,
    RealtimeModule,
    NotificationsModule,
    WalletModule,
    ProvablyFairModule,
    VipModule,
    RakebackModule,
    ReferralsModule,
    PaymentsModule,
    RafflesModule,
    ProvidersModule,
    UploadsModule,

    // feature modules
    AuthModule,
    UsersModule,
    GamesModule,
    BonusesModule,
    PromocodesModule,
    CashbackModule,
    KycModule,
    SupportModule,
    ResponsibleGamingModule,
    ChatModule,
    StatsModule,
    LeaderboardsModule,
    ContentModule,
    AdminModule,
    MaintenanceModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
