/**
 * LLM Pricing Data and Cost Estimation
 *
 * Pricing is per 1,000 tokens (1K tokens) in USD
 * Data is updated periodically - always verify with provider's official pricing
 * Last comprehensive update: January 2026
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
  // ============================================
  // OpenAI GPT-5 family (Latest - 2025)
  // ============================================
  'gpt-5': {
    promptPer1K: 0.00125,
    completionPer1K: 0.01,
    lastUpdated: '2026-01',
    notes: '400K context window',
  },
  'gpt-5.1': {
    promptPer1K: 0.00125,
    completionPer1K: 0.01,
    lastUpdated: '2026-01',
  },
  'gpt-5.2': {
    promptPer1K: 0.00175,
    completionPer1K: 0.014,
    lastUpdated: '2026-01',
  },
  'gpt-5-mini': {
    promptPer1K: 0.00025,
    completionPer1K: 0.002,
    lastUpdated: '2026-01',
  },
  'gpt-5-nano': {
    promptPer1K: 0.00005,
    completionPer1K: 0.0004,
    lastUpdated: '2026-01',
  },

  // ============================================
  // OpenAI GPT-4.1 family (2025)
  // ============================================
  'gpt-4.1': {
    promptPer1K: 0.002,
    completionPer1K: 0.008,
    lastUpdated: '2026-01',
    notes: '1M context window',
  },
  'gpt-4.1-mini': {
    promptPer1K: 0.0004,
    completionPer1K: 0.0016,
    lastUpdated: '2026-01',
  },
  'gpt-4.1-nano': {
    promptPer1K: 0.0001,
    completionPer1K: 0.0004,
    lastUpdated: '2026-01',
  },

  // ============================================
  // OpenAI GPT-4o family (2024-2025)
  // ============================================
  'gpt-4o': {
    promptPer1K: 0.0025,
    completionPer1K: 0.01,
    lastUpdated: '2026-01',
    notes: '128K context window',
  },
  'gpt-4o-mini': {
    promptPer1K: 0.00015,
    completionPer1K: 0.0006,
    lastUpdated: '2026-01',
    notes: '128K context window',
  },

  // ============================================
  // OpenAI O-series (Reasoning models)
  // ============================================
  o1: {
    promptPer1K: 0.015,
    completionPer1K: 0.06,
    lastUpdated: '2026-01',
    notes: 'Reasoning model - internal thinking tokens billed as output',
  },
  o3: {
    promptPer1K: 0.002,
    completionPer1K: 0.008,
    lastUpdated: '2026-01',
  },
  'o3-mini': {
    promptPer1K: 0.0011,
    completionPer1K: 0.0044,
    lastUpdated: '2026-01',
  },
  'o4-mini': {
    promptPer1K: 0.0011,
    completionPer1K: 0.0044,
    lastUpdated: '2026-01',
  },

  // ============================================
  // OpenAI Legacy GPT-4 family
  // ============================================
  'gpt-4-turbo': {
    promptPer1K: 0.01,
    completionPer1K: 0.03,
    lastUpdated: '2026-01',
  },
  'gpt-4': {
    promptPer1K: 0.03,
    completionPer1K: 0.06,
    lastUpdated: '2026-01',
  },
  'gpt-3.5-turbo': {
    promptPer1K: 0.0005,
    completionPer1K: 0.0015,
    lastUpdated: '2026-01',
  },

  // ============================================
  // Anthropic Claude 4.5 family (Latest - 2025)
  // ============================================
  'claude-opus-4.5': {
    promptPer1K: 0.005,
    completionPer1K: 0.025,
    lastUpdated: '2026-01',
    notes: 'Most capable Claude model',
  },
  'claude-sonnet-4.5': {
    promptPer1K: 0.003,
    completionPer1K: 0.015,
    lastUpdated: '2026-01',
    notes: 'Balanced performance and cost',
  },
  'claude-haiku-4.5': {
    promptPer1K: 0.001,
    completionPer1K: 0.005,
    lastUpdated: '2026-01',
    notes: 'Fastest Claude model',
  },

  // ============================================
  // Anthropic Claude 4 family (2025)
  // ============================================
  'claude-opus-4': {
    promptPer1K: 0.015,
    completionPer1K: 0.075,
    lastUpdated: '2026-01',
  },
  'claude-opus-4.1': {
    promptPer1K: 0.015,
    completionPer1K: 0.075,
    lastUpdated: '2026-01',
  },
  'claude-sonnet-4': {
    promptPer1K: 0.003,
    completionPer1K: 0.015,
    lastUpdated: '2026-01',
  },

  // ============================================
  // Anthropic Claude 3.7 family
  // ============================================
  'claude-sonnet-3.7': {
    promptPer1K: 0.003,
    completionPer1K: 0.015,
    lastUpdated: '2026-01',
  },
  'claude-3-7-sonnet': {
    promptPer1K: 0.003,
    completionPer1K: 0.015,
    lastUpdated: '2026-01',
  },

  // ============================================
  // Anthropic Claude 3.5 family (Legacy)
  // ============================================
  'claude-3-5-sonnet-20241022': {
    promptPer1K: 0.003,
    completionPer1K: 0.015,
    lastUpdated: '2026-01',
  },
  'claude-3-5-haiku-20241022': {
    promptPer1K: 0.0008,
    completionPer1K: 0.004,
    lastUpdated: '2026-01',
  },
  'claude-haiku-3.5': {
    promptPer1K: 0.0008,
    completionPer1K: 0.004,
    lastUpdated: '2026-01',
  },

  // ============================================
  // Anthropic Claude 3 family (Legacy)
  // ============================================
  'claude-3-opus': {
    promptPer1K: 0.015,
    completionPer1K: 0.075,
    lastUpdated: '2026-01',
  },
  'claude-3-sonnet': {
    promptPer1K: 0.003,
    completionPer1K: 0.015,
    lastUpdated: '2026-01',
  },
  'claude-3-haiku': {
    promptPer1K: 0.00025,
    completionPer1K: 0.00125,
    lastUpdated: '2026-01',
  },

  // Aliases for common naming patterns
  'claude-3.5-sonnet': {
    promptPer1K: 0.003,
    completionPer1K: 0.015,
    lastUpdated: '2026-01',
  },
  'claude-3.5-haiku': {
    promptPer1K: 0.0008,
    completionPer1K: 0.004,
    lastUpdated: '2026-01',
  },
};

/**
 * Default pricing for unknown models
 * Uses conservative estimates based on mid-tier model pricing
 */
export const DEFAULT_PRICING: ModelPricing = {
  promptPer1K: 0.003,
  completionPer1K: 0.015,
  lastUpdated: '2026-01',
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
  // GPT-5 family
  if (lowerModel.includes('gpt-5.2')) {
    return MODEL_PRICING['gpt-5.2'];
  }
  if (lowerModel.includes('gpt-5.1')) {
    return MODEL_PRICING['gpt-5.1'];
  }
  if (lowerModel.includes('gpt-5-mini')) {
    return MODEL_PRICING['gpt-5-mini'];
  }
  if (lowerModel.includes('gpt-5-nano')) {
    return MODEL_PRICING['gpt-5-nano'];
  }
  if (lowerModel.includes('gpt-5')) {
    return MODEL_PRICING['gpt-5'];
  }

  // GPT-4.1 family
  if (lowerModel.includes('gpt-4.1-mini')) {
    return MODEL_PRICING['gpt-4.1-mini'];
  }
  if (lowerModel.includes('gpt-4.1-nano')) {
    return MODEL_PRICING['gpt-4.1-nano'];
  }
  if (lowerModel.includes('gpt-4.1')) {
    return MODEL_PRICING['gpt-4.1'];
  }

  // GPT-4o family
  if (lowerModel.includes('gpt-4o-mini')) {
    return MODEL_PRICING['gpt-4o-mini'];
  }
  if (lowerModel.includes('gpt-4o')) {
    return MODEL_PRICING['gpt-4o'];
  }

  // O-series
  if (lowerModel.includes('o4-mini')) {
    return MODEL_PRICING['o4-mini'];
  }
  if (lowerModel.includes('o3-mini')) {
    return MODEL_PRICING['o3-mini'];
  }
  if (lowerModel.includes('o3')) {
    return MODEL_PRICING['o3'];
  }
  if (lowerModel.includes('o1')) {
    return MODEL_PRICING['o1'];
  }

  // Legacy GPT
  if (lowerModel.includes('gpt-4-turbo')) {
    return MODEL_PRICING['gpt-4-turbo'];
  }
  if (lowerModel.includes('gpt-4')) {
    return MODEL_PRICING['gpt-4'];
  }
  if (lowerModel.includes('gpt-3.5')) {
    return MODEL_PRICING['gpt-3.5-turbo'];
  }

  // Claude 4.5 family
  if (lowerModel.includes('opus-4.5') || lowerModel.includes('opus-4-5')) {
    return MODEL_PRICING['claude-opus-4.5'];
  }
  if (lowerModel.includes('sonnet-4.5') || lowerModel.includes('sonnet-4-5')) {
    return MODEL_PRICING['claude-sonnet-4.5'];
  }
  if (lowerModel.includes('haiku-4.5') || lowerModel.includes('haiku-4-5')) {
    return MODEL_PRICING['claude-haiku-4.5'];
  }

  // Claude 4 family
  if (lowerModel.includes('opus-4.1') || lowerModel.includes('opus-4-1')) {
    return MODEL_PRICING['claude-opus-4.1'];
  }
  if (lowerModel.includes('opus-4')) {
    return MODEL_PRICING['claude-opus-4'];
  }
  if (lowerModel.includes('sonnet-4')) {
    return MODEL_PRICING['claude-sonnet-4'];
  }

  // Claude 3.7 family
  if (lowerModel.includes('sonnet-3.7') || lowerModel.includes('sonnet-3-7')) {
    return MODEL_PRICING['claude-sonnet-3.7'];
  }

  // Claude 3.5 family
  if (lowerModel.includes('claude-3-5-sonnet') || lowerModel.includes('claude-3.5-sonnet')) {
    return MODEL_PRICING['claude-3.5-sonnet'];
  }
  if (lowerModel.includes('claude-3-5-haiku') || lowerModel.includes('claude-3.5-haiku')) {
    return MODEL_PRICING['claude-3.5-haiku'];
  }

  // Claude 3 family
  if (lowerModel.includes('claude-3-opus')) {
    return MODEL_PRICING['claude-3-opus'];
  }
  if (lowerModel.includes('claude-3-sonnet')) {
    return MODEL_PRICING['claude-3-sonnet'];
  }
  if (lowerModel.includes('claude-3-haiku')) {
    return MODEL_PRICING['claude-3-haiku'];
  }

  // Generic Claude fallback
  if (lowerModel.includes('claude')) {
    return MODEL_PRICING['claude-sonnet-4.5'];
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
