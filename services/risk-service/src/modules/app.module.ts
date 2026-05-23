import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { RiskController } from "./risk.controller";

@Module({
  controllers: [HealthController, RiskController],
})
export class AppModule {}
