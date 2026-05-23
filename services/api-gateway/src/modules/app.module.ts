import { Module } from "@nestjs/common";
import { BillingController } from "./billing.controller";
import { ChatController } from "./chat.controller";
import { CharactersController } from "./characters.controller";
import { DashboardController } from "./dashboard.controller";
import { HealthController } from "./health.controller";
import { IdentityController } from "./identity.controller";
import { MediaController } from "./media.controller";
import { MemoryController } from "./memory.controller";
import { AdminMonetizationController, MonetizationController } from "./monetization.controller";
import { SessionsController } from "./sessions.controller";
import { SettingsController } from "./settings.controller";
import { SystemController } from "./system.controller";

@Module({
  controllers: [
    HealthController,
    IdentityController,
    SessionsController,
    CharactersController,
    ChatController,
    DashboardController,
    SettingsController,
    MemoryController,
    MediaController,
    BillingController,
    MonetizationController,
    AdminMonetizationController,
    SystemController,
  ],
})
export class AppModule {}
