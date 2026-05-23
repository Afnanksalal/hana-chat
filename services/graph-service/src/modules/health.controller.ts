import type { ApiHealthResponse } from "@hana/contracts";
import { Controller, Get } from "@nestjs/common";

@Controller()
export class HealthController {
  @Get("/health")
  public health(): ApiHealthResponse {
    return {
      service: "graph-service",
      status: "ok",
      version: "0.1.0",
      time: new Date().toISOString(),
    };
  }
}
