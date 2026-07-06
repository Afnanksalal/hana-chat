import { Module } from "@nestjs/common";
import { AdminAnalyticsController } from "./admin-analytics.controller";
import { AdminCharactersController } from "./admin-characters.controller";
import { BillingController } from "./billing.controller";
import { ChatController } from "./chat.controller";
import { CharactersController } from "./characters.controller";
import { DashboardController } from "./dashboard.controller";
import { EmailAuthController } from "./email-auth.controller";
import { HealthController } from "./health.controller";
import { MediaController } from "./media.controller";
import { MemoryController } from "./memory.controller";
import { AdminMonetizationController, MonetizationController } from "./monetization.controller";
import { NftController } from "./nft.controller";
import { AdminStellarMemoryController, StellarMemoryController } from "./stellar-memory.controller";
import { SessionsController } from "./sessions.controller";
import { SettingsController } from "./settings.controller";
import { SystemController } from "./system.controller";

@Module({
  controllers: [
    HealthController,
    EmailAuthController,
    SessionsController,
    CharactersController,
    ChatController,
    DashboardController,
    SettingsController,
    MemoryController,
    StellarMemoryController,
    MediaController,
    NftController,
    BillingController,
    MonetizationController,
    AdminMonetizationController,
    AdminStellarMemoryController,
    AdminAnalyticsController,
    AdminCharactersController,
    SystemController,
  ],
})
export class AppModule {}
