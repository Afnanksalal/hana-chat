import type { ChatMessage, ModelProviderName, ModelReasoningEffort } from "@hana/contracts";
import { DomainError } from "@hana/errors";

export type TextModelProviderName = Extract<ModelProviderName, "xai" | "agentrouter">;

export interface ModelCompleteInput {
  messages: ChatMessage[];
  model: string;
  reasoningEffort: ModelReasoningEffort;
  temperature: number;
  maxOutputTokens: number;
  metadata?: Record<string, unknown>;
}

export interface ModelCompleteResult {
  content: string;
  provider: ModelProviderName;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface ModelStreamEvent {
  type: "token" | "usage" | "done";
  token?: string;
  usage?: Pick<ModelCompleteResult, "inputTokens" | "cachedInputTokens" | "outputTokens">;
}

export interface ModelProvider {
  readonly provider: ModelProviderName;
  complete(input: ModelCompleteInput): Promise<ModelCompleteResult>;
  stream(input: ModelCompleteInput): AsyncIterable<ModelStreamEvent>;
}

export interface ModelRoute {
  provider: TextModelProviderName;
  model: string;
  reasoningEffort: ModelReasoningEffort;
  maxOutputTokens: number;
}

export interface ModelRoutingContext {
  userTier: "free" | "plus" | "ultra";
  adultMode: boolean;
  safetyRisk: "low" | "medium" | "high";
  conversationComplexity: "normal" | "complex";
}

export interface ModelRoutingOptions {
  provider?: TextModelProviderName;
  defaultModel?: string;
  complexModel?: string;
}

export function routeChatModel(
  context: ModelRoutingContext,
  options: ModelRoutingOptions = {},
): ModelRoute {
  const reasoningEffort: ModelReasoningEffort =
    context.conversationComplexity === "complex" || context.safetyRisk === "high" ? "low" : "none";
  const provider = options.provider ?? "xai";
  const fallbackModel = provider === "agentrouter" ? "deepseek-v3.2" : "grok-4.3";
  const model =
    reasoningEffort === "none"
      ? (options.defaultModel ?? fallbackModel)
      : (options.complexModel ?? options.defaultModel ?? fallbackModel);

  return {
    provider,
    model,
    reasoningEffort,
    maxOutputTokens: context.userTier === "ultra" ? 700 : 420,
  };
}

export class StaticModelRouter {
  private readonly providers = new Map<ModelProviderName, ModelProvider>();

  public register(provider: ModelProvider): void {
    this.providers.set(provider.provider, provider);
  }

  public provider(name: ModelProviderName): ModelProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new DomainError("MODEL_PROVIDER_FAILED", `Model provider not registered: ${name}`);
    }

    return provider;
  }
}
