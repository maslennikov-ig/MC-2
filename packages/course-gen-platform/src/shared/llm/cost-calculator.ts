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
import { MODEL_CATALOG, getModelCapabilities } from '@megacampus/shared-types';
import { baseLogger as logger } from '../logger/shared-logger-runtime';

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
 * OpenRouter model pricing, derived from the single MODEL_CATALOG.
 *
 * Kept as an exported name and shape because callers already depend on it; the
 * values are no longer maintained here. Add a model to MODEL_CATALOG in
 * `@megacampus/shared-types` and every consumer sees it at once.
 */
export const OPENROUTER_PRICING: Record<string, ModelPricing> = Object.fromEntries(
  // Everything in the catalogue, including the image-only models whose text
  // legs are zero because no such rate is published for them. Filtering those
  // out was the first instinct and it is wrong: the guard directly below this
  // table exists so that a model added to MODEL_CATALOG cannot quietly fail to
  // appear here and get priced at a default instead. Present-with-zero is
  // visible; absent is not.
  Object.entries(MODEL_CATALOG).map(([modelId, capabilities]) => [
    modelId,
    {
      inputPricePerMillion: capabilities.inputPricePerMillion,
      outputPricePerMillion: capabilities.outputPricePerMillion,
      ...(capabilities.combinedPricePerMillion === undefined
        ? {}
        : { combinedPricePerMillion: capabilities.combinedPricePerMillion }),
    },
  ])
);

// ============================================================================
// COST THRESHOLDS (RT-001, RT-004)
// ============================================================================

/**
 * Cost threshold configuration
 *
 * RT-001 Cost Tracking baseline (recorded 2025-11-13):
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
 * These are historical business guardrails, not a provider price table. A
 * MODEL_CATALOG refresh does not automatically change an accepted course
 * budget; that remains a separate product decision.
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
  HARD_LIMIT: 0.9,
} as const;

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
  /**
   * Models no rate could be found for, whose phases therefore contributed
   * nothing to `total_cost_usd`.
   *
   * Present only when there are any. A total assembled from an unpriced phase is
   * a lower bound, and without this field it is indistinguishable from a course
   * that genuinely cost that much.
   */
  unpriced_models?: string[];
}

/**
 * Cost status assessment result
 *
 * Categorizes cost into 4 severity levels for monitoring and alerting.
 */
export interface CostStatus {
  status: 'WITHIN_TARGET' | 'ACCEPTABLE_WITH_RETRIES' | 'HIGH_COST_WARNING' | 'EXCEEDS_LIMIT';
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
 * For a model with a unified provider rate, uses combinedPricePerMillion.
 * For split-pricing models, uses input/output pricing with 50/50 assumption if not specified.
 *
 * @param modelName - OpenRouter model identifier (e.g., "openai/gpt-5.6-luna")
 * @param totalTokens - Total tokens consumed in this phase
 * @param inputTokens - Input tokens (0 = assume 50/50 split for split-pricing models)
 * @returns Cost in USD
 *
 * @internal
 */
function calculatePhaseCost(modelName: string, totalTokens: number, inputTokens: number): number {
  const cost = estimatePhaseCostUsd(modelName, totalTokens, inputTokens);

  if (cost === undefined) {
    logger.warn(`[cost-calculator] Unknown model: ${modelName}, defaulting to $0 cost`);
    return 0;
  }

  return cost;
}

/**
 * What this phase is predicted to cost, or `undefined` when nothing prices it.
 *
 * The distinction `calculatePhaseCost` cannot make. A model absent from the
 * catalogue returned `0`, and every caller then read an unmeasured phase as a
 * free one — the same falsy-zero that once corrupted the very query used to find
 * unpriced calls (mc2-y452l). `calculateLlmCostUsd` in `shared/metrics/llm-cost`
 * has returned `undefined` for exactly this reason since; this is its
 * counterpart for the token-only estimate.
 *
 * Looked up through `getModelCapabilities` rather than by exact key, because the
 * provider answers with the snapshot it served: a request naming
 * `openai/gpt-5.6-luna` came back `openai/gpt-5.6-luna-20260709` on 2026-08-25.
 * `normalizeModelId` strips the date, so the dated id is priced from its base
 * model instead of silently costing nothing.
 */
export function estimatePhaseCostUsd(
  modelName: string,
  totalTokens: number,
  inputTokens: number = 0
): number | undefined {
  const pricing = getModelCapabilities(modelName);

  if (!pricing) return undefined;

  // If combinedPricePerMillion exists (OSS models), use it
  if (pricing.combinedPricePerMillion) {
    return (totalTokens * pricing.combinedPricePerMillion) / 1_000_000;
  }

  // Otherwise, split input/output
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
 * import { calculateGenerationCost, assessCostStatus } from '@/services/stage5/cost-calculator';
 *
 * const metadata: GenerationMetadata = {
 *   model_used: {
 *     metadata: "openai/gpt-5.6-luna",
 *     sections: "deepseek/deepseek-v4-flash",
 *     validation: "z-ai/glm-5.3-flash"
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
 * // Compare against the configured course budget guardrails.
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
    0 // Assume 50/50 input/output split for metadata phase
  );

  const sectionsCost = calculatePhaseCost(
    model_used.sections,
    total_tokens.sections,
    0 // Assume 50/50 input/output split for sections phase
  );

  const validationCost =
    model_used.validation && total_tokens.validation > 0
      ? calculatePhaseCost(model_used.validation, total_tokens.validation, 0)
      : 0;

  // Total cost
  const totalCost = metadataCost + sectionsCost + validationCost;

  // Which of those three, if any, the catalogue could not price. Checked
  // separately from the sum because a phase that contributed $0 for want of a
  // rate looks exactly like one that was free.
  const unpricedModels = [
    ...new Set(
      [
        model_used.metadata,
        model_used.sections,
        ...(model_used.validation && total_tokens.validation > 0 ? [model_used.validation] : []),
      ].filter(model => model && estimatePhaseCostUsd(model, 1) === undefined)
    ),
  ];

  return {
    ...(unpricedModels.length > 0 ? { unpriced_models: unpricedModels } : {}),
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
      validation_model: model_used.validation || 'none',
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
      status: 'WITHIN_TARGET',
      threshold: COST_THRESHOLDS.EXPECTED_MAX,
      message: `Cost $${totalCost.toFixed(4)} is within expected range ($${COST_THRESHOLDS.EXPECTED_MIN.toFixed(2)}-$${COST_THRESHOLDS.EXPECTED_MAX.toFixed(2)})`,
    };
  }

  if (totalCost <= COST_THRESHOLDS.WITH_RETRIES_MAX) {
    return {
      status: 'ACCEPTABLE_WITH_RETRIES',
      threshold: COST_THRESHOLDS.WITH_RETRIES_MAX,
      message: `Cost $${totalCost.toFixed(4)} is acceptable with retry overhead ($${(COST_THRESHOLDS.EXPECTED_MAX + 0.01).toFixed(2)}-$${COST_THRESHOLDS.WITH_RETRIES_MAX.toFixed(2)})`,
    };
  }

  if (totalCost <= COST_THRESHOLDS.HARD_LIMIT) {
    return {
      status: 'HIGH_COST_WARNING',
      threshold: COST_THRESHOLDS.HARD_LIMIT,
      message: `Cost $${totalCost.toFixed(4)} is approaching hard limit ($${COST_THRESHOLDS.HARD_LIMIT.toFixed(2)}). Investigation recommended.`,
    };
  }

  return {
    status: 'EXCEEDS_LIMIT',
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
 * Returns `undefined` when nothing prices the model, rather than `$0`. Callers
 * reach for this as the last resort after a stated charge and an endpoint rate,
 * so a zero here is not a cheap call — it is the absence of an answer, and it
 * was being spent as if it were free.
 *
 * @param modelName - OpenRouter model identifier
 * @param totalTokens - Estimated token count
 * @param inputTokens - Estimated input tokens (0 = assume 50/50 split)
 * @returns Estimated cost in USD, or `undefined` if the model has no rate
 *
 * @example
 * ```typescript
 * // Estimate cost for metadata generation
 * const inputTokens = 45000;
 * const outputTokens = 7000;
 * const totalTokens = inputTokens + outputTokens;
 *
 * // Validate context limit before estimating
 *
 * const estimatedCost = estimateCost("openai/gpt-5.6-luna", totalTokens, inputTokens);
 * console.log(`Estimated cost: ${estimatedCost === undefined ? 'not measured' : formatCost(estimatedCost)}`);
 * // Expected: ~$0.096 (with new $1.20/$6.00 pricing)
 * ```
 */
export function estimateCost(
  modelName: string,
  totalTokens: number,
  inputTokens: number = 0
): number | undefined {
  return estimatePhaseCostUsd(modelName, totalTokens, inputTokens);
}

/**
 * Estimate token count from text (rough approximation)
 *
 * Uses 4 chars ≈ 1 token heuristic (English text).
 * For accurate counts, use tiktoken or model-specific tokenizers.
 *
 * Used to size a prompt before a call, and to sanity-check a budget after one.
 *
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 *
 * @example
 * ```typescript
 * const prompt = buildMetadataPrompt(input);
 * const estimatedTokens = estimateTokenCount(prompt);
 * ```
 */
export function estimateTokenCount(text: string): number {
  // Rough approximation: 4 chars ≈ 1 token (English)
  // This matches the heuristic used in metadata-generator.ts and section-batch-generator.ts
  return Math.ceil(text.length / 4);
}
