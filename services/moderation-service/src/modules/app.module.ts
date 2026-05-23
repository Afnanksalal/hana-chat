import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { ModerationController } from "./moderation.controller";

@Module({
  controllers: [HealthController, ModerationController],
})
export class AppModule {}
