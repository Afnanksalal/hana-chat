import { describe, expect, it } from "vitest";
import { routeChatModel } from "./index";

describe("routeChatModel", () => {
  it("routes normal AgentRouter turns to the configured default model", () => {
    const route = routeChatModel(
      {
        userTier: "free",
        adultMode: false,
        safetyRisk: "low",
        conversationComplexity: "normal",
      },
      {
        provider: "agentrouter",
        defaultModel: "deepseek-v3.2",
        complexModel: "gpt-5.1",
      },
    );

    expect(route).toMatchObject({
      provider: "agentrouter",
      model: "deepseek-v3.2",
      reasoningEffort: "none",
      maxOutputTokens: 420,
    });
  });

  it("routes complex AgentRouter turns to the configured complex model", () => {
    const route = routeChatModel(
      {
        userTier: "ultra",
        adultMode: true,
        safetyRisk: "high",
        conversationComplexity: "complex",
      },
      {
        provider: "agentrouter",
        defaultModel: "deepseek-v3.2",
        complexModel: "gpt-5.1",
      },
    );

    expect(route).toMatchObject({
      provider: "agentrouter",
      model: "gpt-5.1",
      reasoningEffort: "low",
      maxOutputTokens: 700,
    });
  });

  it("routes Groq turns to the configured economical default model", () => {
    const route = routeChatModel(
      {
        userTier: "free",
        adultMode: false,
        safetyRisk: "low",
        conversationComplexity: "normal",
      },
      {
        provider: "groq",
        defaultModel: "llama-3.1-8b-instant",
        complexModel: "llama-3.3-70b-versatile",
      },
    );

    expect(route).toMatchObject({
      provider: "groq",
      model: "llama-3.1-8b-instant",
      reasoningEffort: "none",
      maxOutputTokens: 420,
    });
  });

  it("routes complex Groq turns to the configured larger model", () => {
    const route = routeChatModel(
      {
        userTier: "plus",
        adultMode: true,
        safetyRisk: "high",
        conversationComplexity: "complex",
      },
      {
        provider: "groq",
        defaultModel: "llama-3.1-8b-instant",
        complexModel: "llama-3.3-70b-versatile",
      },
    );

    expect(route).toMatchObject({
      provider: "groq",
      model: "llama-3.3-70b-versatile",
      reasoningEffort: "low",
      maxOutputTokens: 420,
    });
  });
});
