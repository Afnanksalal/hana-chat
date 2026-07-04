import type { ApiHealthResponse } from "@hana/contracts";
import { Controller, Get } from "@nestjs/common";
import { createRequire } from "node:module";

const requirePackage = createRequire(__filename);
const packageJson = requirePackage("../../package.json") as { version?: unknown };
const serviceVersion =
  typeof packageJson.version === "string" && packageJson.version ? packageJson.version : "unknown";

@Controller()
export class HealthController {
  @Get("/health")
  public health(): ApiHealthResponse {
    return {
      service: "api-gateway",
      status: "ok",
      version: serviceVersion,
      time: new Date().toISOString(),
    };
  }
}
