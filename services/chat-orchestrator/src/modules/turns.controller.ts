import { loadConfig } from "@hana/config";
import type { TextModelProviderName } from "@hana/model-router";
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
  private readonly config = loadConfig();

  @Post("/plan-turn")
  public planTurn(@Body() body: unknown) {
    const input = ChatTurnPlanRequestSchema.parse(body);
    const complexConversation =
      input.memoryCount >= 5 || input.recentMessageCount >= 18 || input.characterRating === "adult";
    const includeRecentTurns =
      input.userTier === "ultra" ? 56 : input.userTier === "plus" ? 44 : 32;

    return {
      route: routeChatModel(
        {
          userTier: input.userTier,
          adultMode: input.adultMode,
          safetyRisk: input.safetyRisk,
          conversationComplexity: complexConversation ? "complex" : "normal",
        },
        {
          provider: this.config.TEXT_MODEL_PROVIDER,
          defaultModel: textProviderDefaultModel(this.config, this.config.TEXT_MODEL_PROVIDER),
          complexModel: textProviderComplexModel(this.config, this.config.TEXT_MODEL_PROVIDER),
        },
      ),
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

function textProviderDefaultModel(
  config: ReturnType<typeof loadConfig>,
  provider: TextModelProviderName,
): string {
  if (provider === "agentrouter") {
    return config.AGENT_ROUTER_DEFAULT_MODEL;
  }

  if (provider === "groq") {
    return config.GROQ_DEFAULT_MODEL;
  }

  return config.XAI_DEFAULT_MODEL;
}

function textProviderComplexModel(
  config: ReturnType<typeof loadConfig>,
  provider: TextModelProviderName,
): string {
  if (provider === "agentrouter") {
    return config.AGENT_ROUTER_COMPLEX_MODEL;
  }

  if (provider === "groq") {
    return config.GROQ_COMPLEX_MODEL;
  }

  return config.XAI_DEFAULT_MODEL;
}
