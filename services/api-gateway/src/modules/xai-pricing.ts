export const XAI_USD_TICKS_PER_USD = 10_000_000_000;

interface TextPricing {
  inputPerMillion: number;
  cachedInputPerMillion: number;
  outputPerMillion: number;
}

interface ImagePricing {
  output1k: number;
  output2k: number;
}

const defaultTextPricing: TextPricing = {
  inputPerMillion: 1.25,
  cachedInputPerMillion: 0.2,
  outputPerMillion: 2.5,
};

const textPricingByModel: Record<string, TextPricing> = {
  "grok-build-0.1": {
    inputPerMillion: 1,
    cachedInputPerMillion: 0.2,
    outputPerMillion: 2,
  },
  "grok-4.3": defaultTextPricing,
  "grok-4.20-multi-agent-0309": defaultTextPricing,
  "grok-4.20-0309-reasoning": defaultTextPricing,
  "grok-4.20-0309-non-reasoning": defaultTextPricing,
};

const defaultImagePricing: ImagePricing = {
  output1k: 0.05,
  output2k: 0.07,
};

const imagePricingByModel: Record<string, ImagePricing> = {
  "grok-imagine-image-quality": defaultImagePricing,
  "grok-imagine-image-quality-20260403": defaultImagePricing,
  "grok-imagine-image-quality-latest": defaultImagePricing,
  "grok-imagine-image-pro": defaultImagePricing,
  "grok-imagine-image": {
    output1k: 0.02,
    output2k: 0.02,
  },
  "grok-imagine-image-2026-03-02": {
    output1k: 0.02,
    output2k: 0.02,
  },
};

export function costTicksToUsd(costTicks: number | null | undefined): number | null {
  if (!Number.isFinite(costTicks) || costTicks == null || costTicks < 0) {
    return null;
  }

  return costTicks / XAI_USD_TICKS_PER_USD;
}

export function estimateTextModelCostUsd(input: {
  provider: string;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costTicks?: number | null;
  storedCostUsd?: number | null;
}): number {
  const exactCost = costTicksToUsd(input.costTicks);

  if (exactCost != null) {
    return exactCost;
  }

  if (
    input.storedCostUsd != null &&
    Number.isFinite(input.storedCostUsd) &&
    input.storedCostUsd > 0
  ) {
    return input.storedCostUsd;
  }

  if (input.provider !== "xai") {
    return Math.max(0, input.storedCostUsd ?? 0);
  }

  const pricing = textPricingByModel[input.model] ?? defaultTextPricing;
  const cachedInputTokens = Math.max(0, input.cachedInputTokens);
  const uncachedInputTokens = Math.max(0, input.inputTokens - cachedInputTokens);
  const outputTokens = Math.max(0, input.outputTokens);

  return (
    (uncachedInputTokens / 1_000_000) * pricing.inputPerMillion +
    (cachedInputTokens / 1_000_000) * pricing.cachedInputPerMillion +
    (outputTokens / 1_000_000) * pricing.outputPerMillion
  );
}

export function estimateImageGenerationCostUsd(input: {
  provider: string;
  model: string;
  images: number;
  resolution?: string | null;
  costTicks?: number | null;
  storedCostUsd?: number | null;
}): number {
  const exactCost = costTicksToUsd(input.costTicks);

  if (exactCost != null) {
    return exactCost;
  }

  if (
    input.storedCostUsd != null &&
    Number.isFinite(input.storedCostUsd) &&
    input.storedCostUsd > 0
  ) {
    return input.storedCostUsd;
  }

  if (input.provider !== "xai") {
    return Math.max(0, input.storedCostUsd ?? 0);
  }

  const pricing = imagePricingByModel[input.model] ?? defaultImagePricing;
  const outputCost = input.resolution === "2k" ? pricing.output2k : pricing.output1k;

  return Math.max(0, input.images) * outputCost;
}

export function usdToDatabaseDecimal(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }

  return value.toFixed(10);
}
