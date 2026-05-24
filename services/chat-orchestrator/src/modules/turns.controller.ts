import { routeChatModel } from "@hana/model-router";
import { Body, Controller, Post } from "@nestjs/common";
import { z } from "zod";

const ChatTurnPlanRequestSchema = z.object({
  userTier: z.enum(["free", "plus", "ultra"]),
  adultMode: z.boolean(),
  safetyRisk: z.enum(["low", "medium", "high"]),
  memoryCount: z.number().int().min(0).max(100),
  recentMessageCount: z.number().int().min(0).max(240),
  characterRating: z.enum(["general", "teen", "mature", "adult"]),
});

@Controller("/internal/chat")
export class TurnsController {
  @Post("/plan-turn")
  public planTurn(@Body() body: unknown) {
    const input = ChatTurnPlanRequestSchema.parse(body);
    const complexConversation =
      input.memoryCount >= 5 || input.recentMessageCount >= 18 || input.characterRating === "adult";
    const includeRecentTurns = input.userTier === "ultra" ? 24 : input.userTier === "plus" ? 18 : 12;

    return {
      route: routeChatModel({
        userTier: input.userTier,
        adultMode: input.adultMode,
        safetyRisk: input.safetyRisk,
        conversationComplexity: complexConversation ? "complex" : "normal",
      }),
      promptPlan: {
        includeRecentTurns,
        includeRelationshipMemory: input.memoryCount > 0,
        includeEpisodicMemory: input.memoryCount > 2,
        includeEvolutionProfile: true,
      },
      responseStyle: {
        pacing: complexConversation ? "continuity-aware" : "direct",
        roleplayActions: true,
        maxParagraphs: input.userTier === "free" ? 2 : 3,
      },
    };
  }
}
