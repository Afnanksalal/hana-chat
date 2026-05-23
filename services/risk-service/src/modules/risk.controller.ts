import { calculateRiskScore, type RiskSignals } from "@hana/risk-core";
import { Body, Controller, Post } from "@nestjs/common";

@Controller("/internal/risk")
export class RiskController {
  @Post("/score")
  public score(@Body() body: RiskSignals) {
    return calculateRiskScore(body);
  }
}
