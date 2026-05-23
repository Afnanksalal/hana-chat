import {
  GRAPH_CONSTRAINTS,
  buildDeviceSeenCypher,
  buildPhoneVerifiedCypher,
} from "@hana/graph-core";
import { Controller, Get } from "@nestjs/common";

@Controller("/internal/graph")
export class GraphController {
  @Get("/constraints")
  public constraints() {
    return {
      constraints: GRAPH_CONSTRAINTS,
    };
  }

  @Get("/projection-templates")
  public projectionTemplates() {
    return {
      phoneVerified: buildPhoneVerifiedCypher(),
      deviceSeen: buildDeviceSeenCypher(),
    };
  }
}
