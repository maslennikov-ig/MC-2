/**
 * Stage 5 - Generation Phase: Cost Calculator Service
 *
 * Calculates generation costs based on OpenRouter pricing models and token usage.
 * Integrates with GenerationMetadata schema for comprehensive cost tracking.
 *
 * @module cost-calculator
 * @see specs/008-generation-generation-json/research-decisions/rt-001-model-routing.md
 * @see specs/008-generation-generation-json/research-decisions/rt-004-quality-validation-retry-logic.md
 */

import type { GenerationMetadata } from '@megacampus/shared-types/generation-result';

// ============================================================================
// OPENROUTER PRICING CONFIGURATION
// ============================================================================

/**
 * Model pricing structure for OpenRouter models
 *
 * - inputPricePerMillion: Cost per 1M input tokens (USD)
 * - outputPricePerMillion: Cost per 1M output tokens (USD)
 * - combinedPricePerMillion: Unified pricing for models with same input/output cost
 *
 * Pricing sourced from OpenRouter API documentation (2025-11-10)
 * @see https://openrouter.ai/docs#pricing
 */
export interface ModelPricing {
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  combinedPricePerMillion?: number; // For OSS models with unified pricing
}

/**
 * OpenRouter model pricing catalog
 *
 * RT-001 Model Routing Decision:
 * - qwen/qwen3-max: $1.20/$6.00 per 1M tokens (metadata generation)
 *   ⚠️ WARNING: Context >128K triggers 2.5x price increase ($3.00/$15.00)
 *   Use validateQwen3MaxContext() before generation to prevent overflow
 * - openai/gpt-oss-20b: $0.08 per 1M tokens combined (section generation)
 * - openai/gpt-oss-120b: $0.20 per 1M tokens combined (section generation)
 * - google/gemini-2.5-flash: $0.15 per 1M tokens combined (validation)
 *
 * @see specs/008-generation-generation-json/research-decisions/rt-001-model-routing.md
 */
export const OPENROUTER_PRICING: Record<string, ModelPricing> = {
  "qwen/qwen3-max": {
    inputPricePerMillion: 1.20,
    outputPricePerMillion: 6.00,
  },
  "qwen/qwen3-235b-a22b-2507": {
    // MODEL-SELECTION-SPECIFICATION.md: Primary model for metadata generation
    // Pricing: $0.11/$0.60 per 1M tokens (input/output)
    // Quality: 9/10 for both EN/RU, 100% success rate
    inputPricePerMillion: 0.11,
    outputPricePerMillion: 0.60,
  },
  "minimax/minimax-m2": {
    // MODEL-SELECTION-SPECIFICATION.md: Primary model for lesson structure
    // Pricing: $0.255/$1.02 per 1M tokens (input/output)
    // Quality: 9.5-10/10, 100% success rate, reasoning tokens
    inputPricePerMillion: 0.255,
    outputPricePerMillion: 1.02,
  },
  "moonshotai/kimi-k2-thinking": {
    // MODEL-SELECTION-SPECIFICATION.md: Fallback model for lessons
    // Pricing: $0.55/$2.25 per 1M tokens (input/output)
    // Quality: 9-10/10, 91.7% success rate
    inputPricePerMillion: 0.55,
    outputPricePerMillion: 2.25,
  },
  "openai/gpt-oss-20b": {
    combinedPricePerMillion: 0.08,
    inputPricePerMillion: 0.08,
    outputPricePerMillion: 0.08,
  },
  "openai/gpt-oss-120b": {
    combinedPricePerMillion: 0.20,
    inputPricePerMillion: 0.20,
    outputPricePerMillion: 0.20,
  },
  "google/gemini-2.5-flash": {
    combinedPricePerMillion: 0.15,
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.15,
  },
  // Additional models from orchestrator version (Stage 3 Summarization)
  "google/gemini-2.5-flash-preview": {
    combinedPricePerMillion: 0.10,
    inputPricePerMillion: 0.10,
    outputPricePerMillion: 0.40,
  },
  "anthropic/claude-3.5-sonnet": {
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
  },
  "openai/gpt-4-turbo": {
    inputPricePerMillion: 10.0,
    outputPricePerMillion: 30.0,
  },
};

// ============================================================================
// COST THRESHOLDS (RT-001, RT-004)
// ============================================================================

/**
 * Cost threshold configuration
 *
 * RT-001 Cost Tracking (UPDATED 2025-11-13 for Qwen 3 Max $1.20/$6.00 pricing):
 *
 * Cost Breakdown (per course):
 * - Phase 1 (Validation, OSS 20B): $0.001-0.002
 * - Phase 2 (Metadata, qwen3-max critical): $0.096 (was $0.072)
 * - Phase 2 (Metadata, non-critical hybrid): $0.029 (was $0.054)
 * - Phase 3 (Sections, OSS 120B 70%): $0.090
 * - Phase 3 (Sections, qwen3-max 25%): $0.408 (was $0.150, 2 sections)
 * - Phase 3 (Overflow, Gemini 5%): $0.004
 * - Phase 4 (Validation, OSS 20B): $0.001
 * - Phase 5 (Final Check, OSS 20B): $0.001
 *
 * Thresholds:
 * - EXPECTED_MIN: $0.53 (baseline without retries, +61% from old $0.33)
 * - EXPECTED_MAX: $0.63 (normal operation with minor retries, +62% from old $0.39)
 * - WITH_RETRIES_MAX: $0.76 (with RT-004 retry strategy ~20%, +49% from old $0.51)
 * - HARD_LIMIT: $0.90 (maximum acceptable cost, +50% from old $0.60)
 *
 * ⚠️ NOTE: Qwen 3 Max price increase ($0.60→$1.20 input, $1.80→$6.00 output)
 * increases per-course cost by ~$0.28 (+70%). Primary impact is Phase 3 sections.
 *
 * Costs exceeding HARD_LIMIT require investigation and optimization.
 *
 * @see specs/008-generation-generation-json/research-decisions/rt-001-model-routing.md
 * @see specs/008-generation-generation-json/research-decisions/rt-004-quality-validation-retry-logic.md
 */
export const COST_THRESHOLDS = {
  EXPECTED_MIN: 0.53,
  EXPECTED_MAX: 0.63,
  WITH_RETRIES_MAX: 0.76,
  HARD_LIMIT: 0.90,
} as const;

// ============================================================================
// CONTEXT VALIDATION
// ============================================================================

/**
 * Validates that Qwen 3 Max context doesn't exceed 128K tokens
 * to avoid 2.5x price increase (128K-256K tier).
 *
 * Qwen 3 Max pricing tiers:
 * - 0-128K tokens: $1.20/$6.00 per 1M tokens (standard)
 * - 128K-256K tokens: $3.00/$15.00 per 1M tokens (2.5x more expensive!)
 *
 * Usage patterns from RT-001:
 * - Metadata generation: ~45K input + ~7K output = ~52K total (SAFE)
 * - Section generation: ~70K input + ~20K output = ~90K total (SAFE)
 *
 * @param inputTokens - Number of input tokens for Qwen 3 Max generation
 * @throws Error if context exceeds 128K tokens (triggers 2.5x price increase)
 *
 * @example
 * ```typescript
 * // Before generating with Qwen 3 Max
 * validateQwen3MaxContext(estimatedTokens);
 * const metadata = await llm.generate("qwen/qwen3-max", prompt);
 * ```
 */
export function validateQwen3MaxContext(inputTokens: number): void {
  const QWEN3_MAX_SAFE_LIMIT = 128000;

  if (inputTokens > QWEN3_MAX_SAFE_LIMIT) {
    throw new Error(
      `Qwen 3 Max context (${inputTokens.toLocaleString()} tokens) exceeds safe limit (${QWEN3_MAX_SAFE_LIMIT.toLocaleString()}). ` +
      `This triggers 2.5x price increase ($3.00/$15.00 per 1M tokens). ` +
      `Consider splitting prompt or using Gemini 2.5 Flash for overflow.`
    );
  }
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Cost breakdown per generation phase
 *
 * Provides granular cost tracking for metadata, sections, and validation phases.
 * Token breakdown enables per-phase optimization analysis.
 */
export interface CostBreakdown {
  metadata_cost_usd: number;
  sections_cost_usd: number;
  validation_cost_usd: number;
  total_cost_usd: number;
  token_breakdown: {
    metadata_tokens: number;
    sections_tokens: number;
    validation_tokens: number;
    total_tokens: number;
  };
  model_breakdown: {
    metadata_model: string;
    sections_model: string;
    validation_model: string;
  };
}

/**
 * Cost status assessment result
 *
 * Categorizes cost into 4 severity levels for monitoring and alerting.
 */
export interface CostStatus {
  status: "WITHIN_TARGET" | "ACCEPTABLE_WITH_RETRIES" | "HIGH_COST_WARNING" | "EXCEEDS_LIMIT";
  threshold: number;
  message: string;
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Calculate cost for a single generation phase
 *
 * Supports both split pricing (input/output) and unified pricing models.
 * For OSS models (gpt-oss-20b, gpt-oss-120b, gemini-2.5-flash), uses combinedPricePerMillion.
 * For qwen/qwen3-max, uses split input/output pricing with 50/50 assumption if not specified.
 *
 * @param modelName - OpenRouter model identifier (e.g., "qwen/qwen3-max")
 * @param totalTokens - Total tokens consumed in this phase
 * @param inputTokens - Input tokens (0 = assume 50/50 split for split-pricing models)
 * @returns Cost in USD
 *
 * @internal
 */
function calculatePhaseCost(
  modelName: string,
  totalTokens: number,
  inputTokens: number
): number {
  const pricing = OPENROUTER_PRICING[modelName];

  if (!pricing) {
    console.warn(`[cost-calculator] Unknown model: ${modelName}, defaulting to $0 cost`);
    return 0;
  }

  // If combinedPricePerMillion exists (OSS models), use it
  if (pricing.combinedPricePerMillion) {
    return (totalTokens * pricing.combinedPricePerMillion) / 1_000_000;
  }

  // Otherwise, split input/output (qwen3-max model)
  // If inputTokens not provided (0), assume 50/50 split
  const actualInputTokens = inputTokens > 0 ? inputTokens : Math.floor(totalTokens / 2);
  const outputTokens = totalTokens - actualInputTokens;

  const inputCost = (actualInputTokens * pricing.inputPricePerMillion) / 1_000_000;
  const outputCost = (outputTokens * pricing.outputPricePerMillion) / 1_000_000;

  return inputCost + outputCost;
}

/**
 * Calculate generation cost from metadata
 *
 * Computes per-phase costs and aggregates into comprehensive cost breakdown.
 * Integrates with GenerationMetadata schema for full pipeline cost tracking.
 *
 * @param metadata - Generation metadata from Stage 5 pipeline
 * @returns Complete cost breakdown with per-phase details
 *
 * @example
 * ```typescript
 * import { calculateGenerationCost, assessCostStatus, validateQwen3MaxContext } from '@/services/stage5/cost-calculator';
 *
 * // IMPORTANT: Validate Qwen 3 Max context before generation
 * const estimatedInputTokens = 45000;
 * validateQwen3MaxContext(estimatedInputTokens); // Throws if >128K
 *
 * const metadata: GenerationMetadata = {
 *   model_used: {
 *     metadata: "qwen/qwen3-max",
 *     sections: "openai/gpt-oss-120b",
 *     validation: "openai/gpt-oss-20b"
 *   },
 *   total_tokens: {
 *     metadata: 52000,  // ~45K input + ~7K output (SAFE, <128K)
 *     sections: 90000,  // ~70K input + ~20K output per section
 *     validation: 2000,
 *     total: 144000
 *   },
 *   // ... other fields
 * };
 *
 * const cost = calculateGenerationCost(metadata);
 * console.log(`Total cost: $${cost.total_cost_usd.toFixed(4)}`);
 * // Expected: ~$0.53-0.63 (updated for Qwen 3 Max $1.20/$6.00 pricing)
 *
 * const status = assessCostStatus(cost.total_cost_usd);
 * if (status.status !== "WITHIN_TARGET") {
 *   console.warn(`Cost ${cost.total_cost_usd} exceeds target ${status.threshold}`);
 * }
 * ```
 */
export function calculateGenerationCost(metadata: GenerationMetadata): CostBreakdown {
  // Extract token usage and model usage from metadata
  const { total_tokens, model_used } = metadata;

  // Calculate cost per phase
  // Note: Using 0 for inputTokens triggers 50/50 split assumption for split-pricing models
  const metadataCost = calculatePhaseCost(
    model_used.metadata,
    total_tokens.metadata,
    0  // Assume 50/50 input/output split for metadata phase
  );

  const sectionsCost = calculatePhaseCost(
    model_used.sections,
    total_tokens.sections,
    0  // Assume 50/50 input/output split for sections phase
  );

  const validationCost = model_used.validation && total_tokens.validation > 0
    ? calculatePhaseCost(model_used.validation, total_tokens.validation, 0)
    : 0;

  // Total cost
  const totalCost = metadataCost + sectionsCost + validationCost;

  return {
    metadata_cost_usd: metadataCost,
    sections_cost_usd: sectionsCost,
    validation_cost_usd: validationCost,
    total_cost_usd: totalCost,
    token_breakdown: {
      metadata_tokens: total_tokens.metadata,
      sections_tokens: total_tokens.sections,
      validation_tokens: total_tokens.validation,
      total_tokens: total_tokens.total,
    },
    model_breakdown: {
      metadata_model: model_used.metadata,
      sections_model: model_used.sections,
      validation_model: model_used.validation || "none",
    },
  };
}

/**
 * Assess cost status against RT-001/RT-004 thresholds
 *
 * Categorizes generation cost into 4 severity levels:
 * - WITHIN_TARGET: $0.00-$0.63 (expected range, updated for new Qwen pricing)
 * - ACCEPTABLE_WITH_RETRIES: $0.64-$0.76 (with retry overhead)
 * - HIGH_COST_WARNING: $0.77-$0.90 (approaching limit)
 * - EXCEEDS_LIMIT: >$0.90 (requires investigation)
 *
 * ⚠️ NOTE: Thresholds updated 2025-11-13 for Qwen 3 Max price increase
 * (was $0.39/$0.51/$0.60, now $0.63/$0.76/$0.90)
 *
 * @param totalCost - Total generation cost in USD
 * @returns Cost status with threshold and descriptive message
 *
 * @example
 * ```typescript
 * const status = assessCostStatus(0.65);
 * if (status.status === "HIGH_COST_WARNING") {
 *   logger.warn(`Cost warning: ${status.message}`);
 * }
 * ```
 */
export function assessCostStatus(totalCost: number): CostStatus {
  if (totalCost <= COST_THRESHOLDS.EXPECTED_MAX) {
    return {
      status: "WITHIN_TARGET",
      threshold: COST_THRESHOLDS.EXPECTED_MAX,
      message: `Cost $${totalCost.toFixed(4)} is within expected range ($${COST_THRESHOLDS.EXPECTED_MIN.toFixed(2)}-$${COST_THRESHOLDS.EXPECTED_MAX.toFixed(2)})`,
    };
  }

  if (totalCost <= COST_THRESHOLDS.WITH_RETRIES_MAX) {
    return {
      status: "ACCEPTABLE_WITH_RETRIES",
      threshold: COST_THRESHOLDS.WITH_RETRIES_MAX,
      message: `Cost $${totalCost.toFixed(4)} is acceptable with retry overhead ($${(COST_THRESHOLDS.EXPECTED_MAX + 0.01).toFixed(2)}-$${COST_THRESHOLDS.WITH_RETRIES_MAX.toFixed(2)})`,
    };
  }

  if (totalCost <= COST_THRESHOLDS.HARD_LIMIT) {
    return {
      status: "HIGH_COST_WARNING",
      threshold: COST_THRESHOLDS.HARD_LIMIT,
      message: `Cost $${totalCost.toFixed(4)} is approaching hard limit ($${COST_THRESHOLDS.HARD_LIMIT.toFixed(2)}). Investigation recommended.`,
    };
  }

  return {
    status: "EXCEEDS_LIMIT",
    threshold: COST_THRESHOLDS.HARD_LIMIT,
    message: `Cost $${totalCost.toFixed(4)} exceeds hard limit ($${COST_THRESHOLDS.HARD_LIMIT.toFixed(2)}). Immediate optimization required.`,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format cost as USD string with 4 decimal places
 *
 * @param cost - Cost in USD
 * @returns Formatted string (e.g., "$0.3500")
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

/**
 * Get pricing for a specific model
 *
 * @param modelName - OpenRouter model identifier
 * @returns Model pricing or null if unknown
 */
export function getModelPricing(modelName: string): ModelPricing | null {
  return OPENROUTER_PRICING[modelName] || null;
}

/**
 * Check if model has unified pricing (OSS models)
 *
 * @param modelName - OpenRouter model identifier
 * @returns True if model uses combinedPricePerMillion
 */
export function hasUnifiedPricing(modelName: string): boolean {
  const pricing = OPENROUTER_PRICING[modelName];
  return pricing ? !!pricing.combinedPricePerMillion : false;
}

/**
 * Estimate cost for a given model and token count
 *
 * Useful for pre-generation cost estimation and budget planning.
 *
 * @param modelName - OpenRouter model identifier
 * @param totalTokens - Estimated token count
 * @param inputTokens - Estimated input tokens (0 = assume 50/50 split)
 * @returns Estimated cost in USD
 *
 * @example
 * ```typescript
 * // Estimate cost for Qwen 3 Max metadata generation
 * const inputTokens = 45000;
 * const outputTokens = 7000;
 * const totalTokens = inputTokens + outputTokens;
 *
 * // Validate context limit before estimating
 * validateQwen3MaxContext(inputTokens); // Throws if >128K
 *
 * const estimatedCost = estimateCost("qwen/qwen3-max", totalTokens, inputTokens);
 * console.log(`Estimated cost: ${formatCost(estimatedCost)}`);
 * // Expected: ~$0.096 (with new $1.20/$6.00 pricing)
 * ```
 */
export function estimateCost(
  modelName: string,
  totalTokens: number,
  inputTokens: number = 0
): number {
  return calculatePhaseCost(modelName, totalTokens, inputTokens);
}

/**
 * Estimate token count from text (rough approximation)
 *
 * Uses 4 chars ≈ 1 token heuristic (English text).
 * For accurate counts, use tiktoken or model-specific tokenizers.
 *
 * This utility is essential for validateQwen3MaxContext() pre-flight checks.
 *
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 *
 * @example
 * ```typescript
 * const prompt = buildMetadataPrompt(input);
 * const estimatedTokens = estimateTokenCount(prompt);
 * validateQwen3MaxContext(estimatedTokens); // Check before LLM call
 * ```
 */
export function estimateTokenCount(text: string): number {
  // Rough approximation: 4 chars ≈ 1 token (English)
  // This matches the heuristic used in metadata-generator.ts and section-batch-generator.ts
  return Math.ceil(text.length / 4);
}
