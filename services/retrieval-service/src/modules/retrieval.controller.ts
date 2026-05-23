import { mergeAndRankMemoryHits } from "@hana/retrieval-core";
import { Body, Controller, Post } from "@nestjs/common";

@Controller("/internal/retrieval")
export class RetrievalController {
  @Post("/rank")
  public rank(@Body() body: Parameters<typeof mergeAndRankMemoryHits>[0]) {
    return {
      memories: mergeAndRankMemoryHits({
        ...body,
        now: new Date(body.now),
      }),
    };
  }
}
