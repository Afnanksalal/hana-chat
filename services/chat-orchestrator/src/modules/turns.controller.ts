import { SendChatMessageRequestSchema } from "@hana/contracts";
import { routeChatModel } from "@hana/model-router";
import { classifyTextSafety } from "@hana/safety-core";
import { Body, Controller, Post } from "@nestjs/common";

@Controller("/internal/chat")
export class TurnsController {
  @Post("/plan-turn")
  public planTurn(@Body() body: unknown) {
    const input = SendChatMessageRequestSchema.parse(body);
    const safety = classifyTextSafety(input.content, {
      adultModeEnabled: input.adultModeRequested,
      userIsAdult: false,
      characterRating: "teen",
    });

    return {
      safety,
      route: routeChatModel({
        userTier: "free",
        adultMode: input.adultModeRequested,
        safetyRisk: safety.action === "allow" ? "low" : "medium",
        conversationComplexity: "normal",
      }),
      promptPlan: {
        includeRecentTurns: 24,
        includeRelationshipMemory: true,
        includeEpisodicMemory: true,
      },
    };
  }
}
