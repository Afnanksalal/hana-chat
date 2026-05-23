import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { RetrievalController } from "./retrieval.controller";

@Module({
  controllers: [HealthController, RetrievalController],
})
export class AppModule {}
