/**
 * LLM Pricing Data and Cost Estimation
 *
 * Pricing is per 1,000 tokens (1K tokens) in USD
 * Data is updated periodically - always verify with provider's official pricing
 */

export interface ModelPricing {
  /** Price per 1K prompt/input tokens in USD */
  promptPer1K: number;
  /** Price per 1K completion/output tokens in USD */
  completionPer1K: number;
  /** Last updated date */
  lastUpdated: string;
  /** Notes about the pricing */
  notes?: string;
}

export interface CostEstimate {
  /** Estimated total cost in USD */
  totalUsd: number;
  /** Cost for prompt tokens */
  promptCostUsd: number;
  /** Cost for completion tokens */
  completionCostUsd: number;
  /** The model used for pricing */
  model: string;
  /** Pricing used */
  pricing: ModelPricing;
}

/**
 * Known model pricing data
 * Prices are in USD per 1,000 tokens
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI GPT-4 family
  'gpt-4': {
    promptPer1K: 0.03,
    completionPer1K: 0.06,
    lastUpdated: '2024-01',
  },
  'gpt-4-32k': {
    promptPer1K: 0.06,
    completionPer1K: 0.12,
    lastUpdated: '2024-01',
  },
  'gpt-4-turbo': {
    promptPer1K: 0.01,
    completionPer1K: 0.03,
    lastUpdated: '2024-01',
  },
  'gpt-4-turbo-preview': {
    promptPer1K: 0.01,
    completionPer1K: 0.03,
    lastUpdated: '2024-01',
  },
  'gpt-4o': {
    promptPer1K: 0.005,
    completionPer1K: 0.015,
    lastUpdated: '2024-05',
  },
  'gpt-4o-mini': {
    promptPer1K: 0.00015,
    completionPer1K: 0.0006,
    lastUpdated: '2024-07',
  },

  // OpenAI GPT-3.5 family
  'gpt-3.5-turbo': {
    promptPer1K: 0.0005,
    completionPer1K: 0.0015,
    lastUpdated: '2024-01',
  },
  'gpt-3.5-turbo-16k': {
    promptPer1K: 0.003,
    completionPer1K: 0.004,
    lastUpdated: '2024-01',
  },

  // Anthropic Claude family
  'claude-3-opus-20240229': {
    promptPer1K: 0.015,
    completionPer1K: 0.075,
    lastUpdated: '2024-03',
  },
  'claude-3-sonnet-20240229': {
    promptPer1K: 0.003,
    completionPer1K: 0.015,
    lastUpdated: '2024-03',
  },
  'claude-3-haiku-20240307': {
    promptPer1K: 0.00025,
    completionPer1K: 0.00125,
    lastUpdated: '2024-03',
  },
  'claude-3-5-sonnet-20240620': {
    promptPer1K: 0.003,
    completionPer1K: 0.015,
    lastUpdated: '2024-06',
  },
  'claude-3-5-sonnet-20241022': {
    promptPer1K: 0.003,
    completionPer1K: 0.015,
    lastUpdated: '2024-10',
  },
  'claude-3-5-haiku-20241022': {
    promptPer1K: 0.0008,
    completionPer1K: 0.004,
    lastUpdated: '2024-10',
  },
  // Aliases
  'claude-3-opus': {
    promptPer1K: 0.015,
    completionPer1K: 0.075,
    lastUpdated: '2024-03',
  },
  'claude-3-sonnet': {
    promptPer1K: 0.003,
    completionPer1K: 0.015,
    lastUpdated: '2024-03',
  },
  'claude-3-haiku': {
    promptPer1K: 0.00025,
    completionPer1K: 0.00125,
    lastUpdated: '2024-03',
  },
  'claude-3.5-sonnet': {
    promptPer1K: 0.003,
    completionPer1K: 0.015,
    lastUpdated: '2024-10',
  },
  'claude-3.5-haiku': {
    promptPer1K: 0.0008,
    completionPer1K: 0.004,
    lastUpdated: '2024-10',
  },

  // Legacy Claude
  'claude-2': {
    promptPer1K: 0.008,
    completionPer1K: 0.024,
    lastUpdated: '2024-01',
  },
  'claude-instant-1': {
    promptPer1K: 0.0008,
    completionPer1K: 0.0024,
    lastUpdated: '2024-01',
  },

  // Azure OpenAI (same pricing as OpenAI typically)
  // Add 'azure-' prefix versions if needed
};

/**
 * Default pricing for unknown models
 * Uses conservative estimates
 */
export const DEFAULT_PRICING: ModelPricing = {
  promptPer1K: 0.01,
  completionPer1K: 0.03,
  lastUpdated: '2024-01',
  notes: 'Default pricing - verify with provider',
};

/**
 * Get pricing for a model
 * @param model Model identifier
 * @returns Pricing data or default if unknown
 */
export function getModelPricing(model: string): ModelPricing {
  // Try exact match first
  if (MODEL_PRICING[model]) {
    return MODEL_PRICING[model];
  }

  // Try case-insensitive match
  const lowerModel = model.toLowerCase();
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (key.toLowerCase() === lowerModel) {
      return pricing;
    }
  }

  // Try partial match for common patterns
  if (lowerModel.includes('gpt-4o-mini')) {
    return MODEL_PRICING['gpt-4o-mini'];
  }
  if (lowerModel.includes('gpt-4o')) {
    return MODEL_PRICING['gpt-4o'];
  }
  if (lowerModel.includes('gpt-4-turbo')) {
    return MODEL_PRICING['gpt-4-turbo'];
  }
  if (lowerModel.includes('gpt-4')) {
    return MODEL_PRICING['gpt-4'];
  }
  if (lowerModel.includes('gpt-3.5')) {
    return MODEL_PRICING['gpt-3.5-turbo'];
  }
  if (lowerModel.includes('claude-3-5-sonnet') || lowerModel.includes('claude-3.5-sonnet')) {
    return MODEL_PRICING['claude-3.5-sonnet'];
  }
  if (lowerModel.includes('claude-3-5-haiku') || lowerModel.includes('claude-3.5-haiku')) {
    return MODEL_PRICING['claude-3.5-haiku'];
  }
  if (lowerModel.includes('claude-3-opus')) {
    return MODEL_PRICING['claude-3-opus'];
  }
  if (lowerModel.includes('claude-3-sonnet')) {
    return MODEL_PRICING['claude-3-sonnet'];
  }
  if (lowerModel.includes('claude-3-haiku')) {
    return MODEL_PRICING['claude-3-haiku'];
  }
  if (lowerModel.includes('claude')) {
    return MODEL_PRICING['claude-2'];
  }

  return DEFAULT_PRICING;
}

/**
 * Estimate cost for token usage
 * @param promptTokens Number of prompt/input tokens
 * @param completionTokens Number of completion/output tokens
 * @param model Model identifier
 * @returns Cost estimate
 */
export function estimateCost(
  promptTokens: number,
  completionTokens: number,
  model: string
): CostEstimate {
  const pricing = getModelPricing(model);

  const promptCostUsd = (promptTokens / 1000) * pricing.promptPer1K;
  const completionCostUsd = (completionTokens / 1000) * pricing.completionPer1K;
  const totalUsd = promptCostUsd + completionCostUsd;

  return {
    totalUsd,
    promptCostUsd,
    completionCostUsd,
    model,
    pricing,
  };
}

/**
 * Format cost for display
 * @param costUsd Cost in USD
 * @returns Formatted string
 */
export function formatCost(costUsd: number): string {
  if (costUsd < 0.01) {
    return `$${(costUsd * 100).toFixed(4)} cents`;
  }
  if (costUsd < 1) {
    return `$${costUsd.toFixed(4)}`;
  }
  return `$${costUsd.toFixed(2)}`;
}

/**
 * List all known models with pricing
 */
export function listKnownModels(): Array<{ model: string; pricing: ModelPricing }> {
  return Object.entries(MODEL_PRICING).map(([model, pricing]) => ({
    model,
    pricing,
  }));
}
