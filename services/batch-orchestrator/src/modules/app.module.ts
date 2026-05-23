import { Module } from "@nestjs/common";
import { BatchController } from "./batch.controller";
import { HealthController } from "./health.controller";

@Module({
  controllers: [HealthController, BatchController],
})
export class AppModule {}
