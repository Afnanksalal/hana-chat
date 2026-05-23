import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { ProjectionWorkerController } from "./projection-worker.controller";
import { ProjectionWorkerService } from "./projection-worker.service";

@Module({
  controllers: [HealthController, ProjectionWorkerController],
  providers: [ProjectionWorkerService],
})
export class AppModule {}
