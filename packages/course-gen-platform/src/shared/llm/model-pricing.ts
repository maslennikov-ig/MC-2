/**
 * Model pricing per 1M tokens (USD)
 * Source: OpenRouter pricing page
 * Last updated: 2025-11-25
 */
export const MODEL_PRICING = {
  // GPT-4 family
  'openai/gpt-4-turbo': {
    prompt: 10.0,      // $10 per 1M prompt tokens
    completion: 30.0   // $30 per 1M completion tokens
  },
  'openai/gpt-4o': {
    prompt: 2.5,       // Update: $2.50 per 1M input
    completion: 10.0   // Update: $10.00 per 1M output
  },
  'openai/gpt-4o-mini': {
    prompt: 0.15,
    completion: 0.60
  },

  // Claude family
  'anthropic/claude-3.5-sonnet': {
    prompt: 3.0,
    completion: 15.0
  },
  'anthropic/claude-3-haiku': {
    prompt: 0.25,
    completion: 1.25
  },
  'anthropic/claude-3-opus': {
    prompt: 15.0,
    completion: 75.0
  },

  // Google family
  'google/gemini-flash-1.5': {
    prompt: 0.075,
    completion: 0.30
  },
  'google/gemini-pro-1.5': {
    prompt: 1.25,
    completion: 3.75
  },

  // Open source models (approximate or OpenRouter rates)
  'meta-llama/llama-3.1-70b-instruct': {
    prompt: 0.35, // OpenRouter typical
    completion: 0.40
  },
  'meta-llama/llama-3.1-8b-instruct': {
    prompt: 0.05,
    completion: 0.08
  },
  'qwen/qwen-2.5-72b-instruct': {
    prompt: 0.35,
    completion: 0.40
  },

  // Fallback for unknown models
  'unknown': {
    prompt: 1.0,
    completion: 3.0
  }
} as const;

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * Calculate cost for LLM API call
 * @param usage Token usage from LLM response
 * @param modelId OpenRouter model identifier
 * @returns Cost in USD (6 decimal places)
 */
export function calculateCost(usage: TokenUsage, modelId: string): number {
  // Normalize model ID (some providers might add prefixes)
  // Try exact match first
  let pricing = MODEL_PRICING[modelId as keyof typeof MODEL_PRICING];
  
  if (!pricing) {
    // Try to find closest match or default
    const knownModels = Object.keys(MODEL_PRICING);
    const match = knownModels.find(m => modelId.includes(m));
    if (match) {
      pricing = MODEL_PRICING[match as keyof typeof MODEL_PRICING];
    } else {
      pricing = MODEL_PRICING.unknown;
    }
  }

  const promptCost = (usage.prompt_tokens / 1_000_000) * pricing.prompt;
  const completionCost = (usage.completion_tokens / 1_000_000) * pricing.completion;

  return parseFloat((promptCost + completionCost).toFixed(6));
}

/**
 * Format cost for display
 * @param costUsd Cost in USD
 * @returns Formatted string (e.g., "$0.0154")
 */
export function formatCost(costUsd: number): string {
  if (costUsd < 0.000001) return '$0.00';
  if (costUsd < 0.001) return '<$0.001';
  if (costUsd < 0.01) return `$${costUsd.toFixed(4)}`;
  if (costUsd < 1) return `$${costUsd.toFixed(3)}`;
  return `$${costUsd.toFixed(2)}`;
}
