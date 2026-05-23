import { Body, Controller, Inject, Post } from "@nestjs/common";
import { ProjectionWorkerService } from "./projection-worker.service";

@Controller("/internal/workers")
export class ProjectionWorkerController {
  public constructor(
    @Inject(ProjectionWorkerService) private readonly worker: ProjectionWorkerService,
  ) {}

  @Post("/outbox/drain")
  public async drain(@Body() body: { maxItems?: number } = {}) {
    return this.worker.drainOnce(body.maxItems);
  }
}
