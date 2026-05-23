import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { TurnsController } from "./turns.controller";

@Module({
  controllers: [HealthController, TurnsController],
})
export class AppModule {}
