import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { MemoryController } from "./memory.controller";

@Module({
  controllers: [HealthController, MemoryController],
})
export class AppModule {}
