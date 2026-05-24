import { Module } from "@nestjs/common";
import { BillingInternalController } from "./billing-internal.controller";
import { HealthController } from "./health.controller";

@Module({
  controllers: [HealthController, BillingInternalController],
})
export class AppModule {}
