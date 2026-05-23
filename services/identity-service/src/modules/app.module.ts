import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { PhoneController } from "./phone.controller";

@Module({
  controllers: [HealthController, PhoneController],
})
export class AppModule {}
