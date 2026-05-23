import { memoryWriteAction, scoreSalience, type SalienceSignals } from "@hana/memory-core";
import { Body, Controller, Post } from "@nestjs/common";

@Controller("/internal/memory")
export class MemoryController {
  @Post("/score-salience")
  public score(@Body() body: SalienceSignals) {
    const score = scoreSalience(body);

    return {
      score,
      action: memoryWriteAction(score),
    };
  }
}
