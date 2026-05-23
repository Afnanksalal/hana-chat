import { Module } from "@nestjs/common";
import { GraphController } from "./graph.controller";
import { HealthController } from "./health.controller";

@Module({
  controllers: [HealthController, GraphController],
})
export class AppModule {}
