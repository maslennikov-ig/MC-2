/**
 * Model Selector Service for Language-Aware Model Routing
 * @module shared/llm/model-selector
 *
 * Provides intelligent model selection based on:
 * 1. Token count thresholds for analysis tasks (80K boundary)
 * 2. Language-aware routing for generation tasks (RU vs EN)
 * 3. Content archetype for temperature optimization
 * 4. Fallback model configuration for resilience
 *
 * Model Selection Decisions (2025-11-22):
 * - Analysis: oss-120b (<=80K) or gemini-flash (>80K) based on token count
 * - Generation RU: qwen3-235b-a22b-2507 primary, kimi-k2 fallback
 * - Generation EN: deepseek-v3.1-terminus primary, kimi-k2 fallback
 * - Large Context: grok-4-fast primary, gemini-flash fallback
 *
 * @see docs/MODEL-SELECTION-DECISIONS.md
 * @see specs/010-stages-456-pipeline/data-model.md
 */

import type { ContentArchetype } from '@megacampus/shared-types';
import { CONTENT_ARCHETYPE_TEMPERATURES_V2 } from '@megacampus/shared-types';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Model capability types for filtering and selection
 */
export type ModelCapability =
  | 'analysis'
  | 'generation'
  | 'code'
  | 'multilingual'
  | 'large_context'
  | 'structured_output';

/**
 * Complete model configuration with pricing and capabilities
 *
 * @example
 * ```typescript
 * const model: ModelConfig = {
 *   modelId: 'qwen/qwen3-235b-a22b-2507',
 *   displayName: 'Qwen3 235B',
 *   maxContextTokens: 128_000,
 *   costPer1kInput: 0.00011,
 *   costPer1kOutput: 0.0006,
 *   capabilities: ['generation', 'multilingual', 'structured_output'],
 * };
 * ```
 */
export interface ModelConfig {
  /** OpenRouter model identifier (e.g., 'qwen/qwen3-235b-a22b-2507') */
  modelId: string;

  /** Human-readable display name */
  displayName: string;

  /** Maximum context window in tokens */
  maxContextTokens: number;

  /** Cost per 1K input tokens in USD */
  costPer1kInput: number;

  /** Cost per 1K output tokens in USD */
  costPer1kOutput: number;

  /** Model capabilities for filtering */
  capabilities: ModelCapability[];
}

/**
 * Analysis model type based on token threshold
 * @see data-model.md BudgetAllocation.selected_model
 */
export type AnalysisModel = 'oss-120b' | 'gemini-flash';

/**
 * Supported language codes for routing
 */
export type SupportedLanguage = 'en' | 'ru';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Token threshold for model selection in analysis tasks.
 * If HIGH_total <= 80K, use oss-120b (128K context)
 * If HIGH_total > 80K, use gemini-flash (1M context)
 *
 * @see data-model.md BudgetAllocation decision logic
 */
export const MODEL_SELECTION_THRESHOLD = 80_000;

/**
 * Document size threshold for model tier selection.
 * Documents below this threshold use cost-effective models.
 * Documents above this threshold use extended context models.
 *
 * @see specs/010-stages-456-pipeline FR-001, FR-002
 */
export const DOCUMENT_SIZE_THRESHOLD = 80_000;

/**
 * Model tiers for document size-based selection with language routing.
 *
 * Standard tier: Cost-effective models for documents < 80K tokens
 * Extended tier: Larger context models for documents > 80K tokens
 *
 * @example
 * ```typescript
 * // Get model for small Russian document
 * const modelId = MODEL_TIERS.standard.ru;
 * // 'qwen/qwen3-235b-a22b-2507'
 *
 * // Get model for large English document
 * const modelId = MODEL_TIERS.extended.en;
 * // 'anthropic/claude-sonnet-4-20250514'
 * ```
 */
export const MODEL_TIERS = {
  /** Cost-effective models for small documents (<80K tokens) */
  standard: {
    /** Russian: Qwen3 235B - excellent multilingual support */
    ru: 'qwen/qwen3-235b-a22b-2507',
    /** English: DeepSeek Terminus - optimized for English */
    en: 'deepseek/deepseek-v3.1-terminus',
    /** Fallback: Kimi K2 - good multilingual coverage */
    fallback: 'moonshotai/kimi-k2-0905',
  },
  /** Extended context models for large documents (>80K tokens) */
  extended: {
    /** Russian: Qwen3 235B - 128K context */
    ru: 'qwen/qwen3-235b-a22b-2507',
    /** English: Claude Sonnet 4 - 200K context */
    en: 'anthropic/claude-sonnet-4-20250514',
    /** Fallback: Gemini Flash - 1M context */
    fallback: 'google/gemini-2.5-flash',
  },
} as const;

/**
 * Complete model registry with configurations
 *
 * Pricing sourced from OpenRouter API documentation (2025-11-22)
 * @see https://openrouter.ai/docs#pricing
 */
export const MODELS: Record<string, ModelConfig> = {
  // Analysis Models
  'oss-120b': {
    modelId: 'openai/gpt-oss-120b',
    displayName: 'GPT OSS 120B',
    maxContextTokens: 128_000,
    costPer1kInput: 0.0002,
    costPer1kOutput: 0.0002,
    capabilities: ['analysis', 'structured_output'],
  },

  'gemini-flash': {
    modelId: 'google/gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    maxContextTokens: 1_000_000,
    costPer1kInput: 0.000075,
    costPer1kOutput: 0.0003,
    capabilities: ['analysis', 'large_context', 'multilingual'],
  },

  // Generation Models - Primary
  'qwen3-max': {
    modelId: 'qwen/qwen3-235b-a22b-2507',
    displayName: 'Qwen3 235B',
    maxContextTokens: 128_000,
    costPer1kInput: 0.00011,
    costPer1kOutput: 0.0006,
    capabilities: ['generation', 'multilingual', 'structured_output', 'code'],
  },

  'deepseek-terminus': {
    modelId: 'deepseek/deepseek-v3.1-terminus',
    displayName: 'DeepSeek V3.1 Terminus',
    maxContextTokens: 128_000,
    costPer1kInput: 0.00027,
    costPer1kOutput: 0.0011,
    capabilities: ['generation', 'code', 'structured_output'],
  },

  // Generation Models - Fallback
  'kimi-k2': {
    modelId: 'moonshotai/kimi-k2-0905',
    displayName: 'Kimi K2',
    maxContextTokens: 128_000,
    costPer1kInput: 0.00055,
    costPer1kOutput: 0.00225,
    capabilities: ['generation', 'multilingual', 'structured_output', 'code'],
  },

  // Large Context Model
  'grok-4-fast': {
    modelId: 'x-ai/grok-4-fast',
    displayName: 'Grok 4 Fast',
    maxContextTokens: 2_000_000,
    costPer1kInput: 0.0002,
    costPer1kOutput: 0.0005,
    capabilities: ['large_context', 'analysis', 'generation'],
  },

  // Legacy OSS Models (Stage 4 Analysis)
  'oss-20b': {
    modelId: 'openai/gpt-oss-20b',
    displayName: 'GPT OSS 20B',
    maxContextTokens: 128_000,
    costPer1kInput: 0.00008,
    costPer1kOutput: 0.00008,
    capabilities: ['analysis'],
  },

  // Stage 4 Analysis Models
  'gemini-flash-preview': {
    modelId: 'google/gemini-2.5-flash-preview-09-2025',
    displayName: 'Gemini 2.5 Flash Preview',
    maxContextTokens: 1_000_000,
    costPer1kInput: 0.000075,
    costPer1kOutput: 0.0003,
    capabilities: ['analysis', 'large_context', 'multilingual'],
  },

  'grok-4.1-fast-free': {
    modelId: 'x-ai/grok-4.1-fast:free',
    displayName: 'Grok 4.1 Fast (Free)',
    maxContextTokens: 1_000_000,
    costPer1kInput: 0,
    costPer1kOutput: 0,
    capabilities: ['analysis', 'large_context', 'generation'],
  },

  'kimi-linear-48b': {
    modelId: 'moonshotai/kimi-linear-48b-a3b-instruct',
    displayName: 'Kimi Linear 48B',
    maxContextTokens: 1_000_000,
    costPer1kInput: 0.0004,
    costPer1kOutput: 0.0016,
    capabilities: ['analysis', 'large_context', 'multilingual'],
  },

  'qwen-plus-2025': {
    modelId: 'qwen/qwen-plus-2025-07-28',
    displayName: 'Qwen Plus 2025',
    maxContextTokens: 1_000_000,
    costPer1kInput: 0.0002,
    costPer1kOutput: 0.0008,
    capabilities: ['analysis', 'large_context', 'multilingual'],
  },
} as const;

/**
 * Fallback model mapping for resilience
 * Maps primary model keys to their fallback model keys
 */
const FALLBACK_MAP: Record<string, string> = {
  // Analysis fallbacks
  'oss-120b': 'gemini-flash',
  'oss-20b': 'oss-120b',

  // Generation fallbacks (both RU and EN fall back to Kimi K2)
  'qwen3-max': 'kimi-k2',
  'deepseek-terminus': 'kimi-k2',

  // Large context fallback
  'grok-4-fast': 'gemini-flash',

  // Kimi K2 is the ultimate fallback, falls back to gemini-flash
  'kimi-k2': 'gemini-flash',
};

/**
 * Temperature ranges for content archetypes
 * Used by selectModelForGeneration to suggest temperature settings
 *
 * Re-exported from @megacampus/shared-types for backwards compatibility.
 * Single Source of Truth: CONTENT_ARCHETYPE_TEMPERATURES_V2 in shared-types
 */
export const ARCHETYPE_TEMPERATURES = CONTENT_ARCHETYPE_TEMPERATURES_V2;

// ============================================================================
// MODEL SELECTION FUNCTIONS
// ============================================================================

/**
 * Select model for analysis tasks based on token count.
 *
 * Decision logic from data-model.md:
 * - If totalHighPriorityTokens <= 80,000: oss-120b (128K context)
 * - If totalHighPriorityTokens > 80,000: gemini-flash (1M context)
 *
 * @param totalHighPriorityTokens - Sum of HIGH priority document tokens
 * @returns ModelConfig for the selected analysis model
 *
 * @example
 * ```typescript
 * // Small context - uses OSS 120B
 * const model = selectModelForAnalysis(50_000);
 * // model.modelId === 'openai/gpt-oss-120b'
 *
 * // Large context - uses Gemini Flash
 * const model = selectModelForAnalysis(100_000);
 * // model.modelId === 'google/gemini-2.5-flash'
 * ```
 */
export function selectModelForAnalysis(totalHighPriorityTokens: number): ModelConfig {
  if (totalHighPriorityTokens <= MODEL_SELECTION_THRESHOLD) {
    return MODELS['oss-120b'];
  }

  return MODELS['gemini-flash'];
}

/**
 * Get the analysis model type based on token count.
 * Convenience function that returns the AnalysisModel type.
 *
 * @param totalHighPriorityTokens - Sum of HIGH priority document tokens
 * @returns AnalysisModel type ('oss-120b' or 'gemini-flash')
 */
export function getAnalysisModelType(totalHighPriorityTokens: number): AnalysisModel {
  return totalHighPriorityTokens <= MODEL_SELECTION_THRESHOLD ? 'oss-120b' : 'gemini-flash';
}

/**
 * Model tier type for document size-based selection
 */
export type ModelTier = 'standard' | 'extended';

/**
 * Language type for model tier selection
 */
export type TierLanguage = 'ru' | 'en' | 'other';

/**
 * Model tier information result
 */
export interface ModelTierInfo {
  /** Selected tier based on document size */
  tier: ModelTier;
  /** Threshold used for tier selection */
  threshold: number;
  /** Human-readable reason for tier selection */
  reason: string;
}

/**
 * Select appropriate model based on document size and language.
 *
 * This function implements FR-001 and FR-002 from the spec:
 * - FR-001: Documents < 80K tokens use cost-effective models
 * - FR-002: Documents > 80K tokens use extended context models
 *
 * Language-aware routing:
 * - RU: Qwen3 235B (excellent Russian support)
 * - EN: DeepSeek Terminus (standard) or Claude Sonnet 4 (extended)
 * - Other: Falls back to English models
 *
 * @param totalTokens - Total document tokens to process
 * @param language - Content language ('ru' | 'en' | 'other')
 * @returns Selected model ID from OpenRouter
 *
 * @example
 * ```typescript
 * // Small Russian document - uses Qwen3
 * const model = selectModelByDocumentSize(50_000, 'ru');
 * // 'qwen/qwen3-235b-a22b-2507'
 *
 * // Large English document - uses Claude Sonnet 4
 * const model = selectModelByDocumentSize(100_000, 'en');
 * // 'anthropic/claude-sonnet-4-20250514'
 *
 * // Small document with unknown language - uses DeepSeek
 * const model = selectModelByDocumentSize(30_000, 'other');
 * // 'deepseek/deepseek-v3.1-terminus'
 * ```
 */
export function selectModelByDocumentSize(
  totalTokens: number,
  language: TierLanguage = 'en'
): string {
  const tier: ModelTier = totalTokens > DOCUMENT_SIZE_THRESHOLD ? 'extended' : 'standard';
  const lang: 'ru' | 'en' = language === 'ru' ? 'ru' : 'en';
  return MODEL_TIERS[tier][lang];
}

/**
 * Get model tier information for a given document size.
 *
 * Provides detailed information about which tier was selected and why.
 * Useful for logging, debugging, and explaining model selection decisions.
 *
 * @param totalTokens - Total document tokens to process
 * @returns ModelTierInfo with tier, threshold, and reason
 *
 * @example
 * ```typescript
 * // Large document
 * const info = getModelTierInfo(100_000);
 * // {
 * //   tier: 'extended',
 * //   threshold: 80000,
 * //   reason: 'Document size 100000 exceeds 80000 tokens'
 * // }
 *
 * // Small document
 * const info = getModelTierInfo(50_000);
 * // {
 * //   tier: 'standard',
 * //   threshold: 80000,
 * //   reason: 'Document size 50000 within 80000 token limit'
 * // }
 * ```
 */
export function getModelTierInfo(totalTokens: number): ModelTierInfo {
  const tier: ModelTier = totalTokens > DOCUMENT_SIZE_THRESHOLD ? 'extended' : 'standard';
  return {
    tier,
    threshold: DOCUMENT_SIZE_THRESHOLD,
    reason:
      tier === 'extended'
        ? `Document size ${totalTokens} exceeds ${DOCUMENT_SIZE_THRESHOLD} tokens`
        : `Document size ${totalTokens} within ${DOCUMENT_SIZE_THRESHOLD} token limit`,
  };
}

/**
 * Result of generation model selection
 */
export interface GenerationModelSelection {
  /** Selected model configuration */
  model: ModelConfig;

  /** Recommended temperature based on archetype */
  recommendedTemperature: number;

  /** Temperature range for the archetype */
  temperatureRange: { min: number; max: number };
}

/**
 * Select model for content generation with language-aware routing.
 *
 * Language-aware routing (from MODEL-SELECTION-DECISIONS.md):
 * - RU: qwen/qwen3-235b-a22b-2507 (9/10 quality, 100% success)
 * - EN: deepseek/deepseek-v3.1-terminus (9/10 quality, 100% success)
 *
 * Temperature is determined by content archetype:
 * - code_tutorial: 0.2-0.3 (precise, deterministic)
 * - concept_explainer: 0.6-0.7 (creative, engaging)
 * - case_study: 0.5-0.6 (balanced)
 * - legal_warning: 0.0-0.1 (strict, accurate)
 *
 * @param language - Target language ('en' or 'ru')
 * @param archetype - Content archetype for temperature routing
 * @returns GenerationModelSelection with model and temperature settings
 *
 * @example
 * ```typescript
 * // Russian content generation
 * const { model, recommendedTemperature } = selectModelForGeneration('ru', 'concept_explainer');
 * // model.modelId === 'qwen/qwen3-235b-a22b-2507'
 * // recommendedTemperature === 0.65
 *
 * // English code tutorial
 * const { model, recommendedTemperature } = selectModelForGeneration('en', 'code_tutorial');
 * // model.modelId === 'deepseek/deepseek-v3.1-terminus'
 * // recommendedTemperature === 0.25
 * ```
 */
export function selectModelForGeneration(
  language: SupportedLanguage,
  archetype: ContentArchetype
): GenerationModelSelection {
  // Language-aware model selection
  const model = language === 'ru' ? MODELS['qwen3-max'] : MODELS['deepseek-terminus'];

  // Archetype-based temperature selection
  const temperatureRange = ARCHETYPE_TEMPERATURES[archetype];

  return {
    model,
    recommendedTemperature: temperatureRange.default,
    temperatureRange: { min: temperatureRange.min, max: temperatureRange.max },
  };
}

/**
 * Get fallback model for a primary model.
 *
 * Fallback chain (from MODEL-SELECTION-DECISIONS.md):
 * - oss-120b -> gemini-flash
 * - qwen3-max -> kimi-k2
 * - deepseek-terminus -> kimi-k2
 * - grok-4-fast -> gemini-flash
 * - kimi-k2 -> gemini-flash (ultimate fallback)
 *
 * @param primaryModelKey - Key of the primary model in MODELS registry
 * @returns ModelConfig for the fallback model
 * @throws Error if primary model key is unknown
 *
 * @example
 * ```typescript
 * const fallback = getFallbackModel('qwen3-max');
 * // fallback.modelId === 'moonshotai/kimi-k2-0905'
 *
 * const fallback = getFallbackModel('oss-120b');
 * // fallback.modelId === 'google/gemini-2.5-flash'
 * ```
 */
export function getFallbackModel(primaryModelKey: string): ModelConfig {
  const fallbackKey = FALLBACK_MAP[primaryModelKey];

  if (!fallbackKey) {
    // If no explicit fallback, use gemini-flash as ultimate fallback
    return MODELS['gemini-flash'];
  }

  const fallbackModel = MODELS[fallbackKey];

  if (!fallbackModel) {
    throw new Error(`Fallback model not found for key: ${fallbackKey}`);
  }

  return fallbackModel;
}

/**
 * Get a model by its key from the MODELS registry.
 *
 * @param modelKey - Key in the MODELS registry
 * @returns ModelConfig or null if not found
 *
 * @example
 * ```typescript
 * const model = getModelByKey('qwen3-max');
 * // model?.modelId === 'qwen/qwen3-235b-a22b-2507'
 * ```
 */
export function getModelByKey(modelKey: string): ModelConfig | null {
  return MODELS[modelKey] ?? null;
}

/**
 * Get a model by its OpenRouter model ID.
 *
 * @param modelId - OpenRouter model identifier
 * @returns ModelConfig or null if not found
 *
 * @example
 * ```typescript
 * const model = getModelById('qwen/qwen3-235b-a22b-2507');
 * // model?.displayName === 'Qwen3 235B'
 * ```
 */
export function getModelById(modelId: string): ModelConfig | null {
  for (const model of Object.values(MODELS)) {
    if (model.modelId === modelId) {
      return model;
    }
  }
  return null;
}

/**
 * Select model for large context tasks (>128K tokens).
 *
 * Uses Grok 4 Fast (2M context) as primary, Gemini Flash (1M context) as fallback.
 *
 * @returns ModelConfig for large context model
 *
 * @example
 * ```typescript
 * const model = selectModelForLargeContext();
 * // model.modelId === 'x-ai/grok-4-fast'
 * // model.maxContextTokens === 2_000_000
 * ```
 */
export function selectModelForLargeContext(): ModelConfig {
  return MODELS['grok-4-fast'];
}

/**
 * Get all models with a specific capability.
 *
 * @param capability - Capability to filter by
 * @returns Array of ModelConfig with the specified capability
 *
 * @example
 * ```typescript
 * const generationModels = getModelsWithCapability('generation');
 * // Returns qwen3-max, deepseek-terminus, kimi-k2, grok-4-fast
 * ```
 */
export function getModelsWithCapability(capability: ModelCapability): ModelConfig[] {
  return Object.values(MODELS).filter((model) => model.capabilities.includes(capability));
}

/**
 * Estimate cost for a model based on token counts.
 *
 * @param model - Model configuration
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Estimated cost in USD
 *
 * @example
 * ```typescript
 * const model = MODELS['qwen3-max'];
 * const cost = estimateModelCost(model, 10_000, 2_000);
 * // cost === 0.0011 + 0.0012 = 0.0023 USD
 * ```
 */
export function estimateModelCost(model: ModelConfig, inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1000) * model.costPer1kInput;
  const outputCost = (outputTokens / 1000) * model.costPer1kOutput;
  return inputCost + outputCost;
}

/**
 * Check if a token count fits within a model's context window.
 *
 * @param model - Model configuration
 * @param totalTokens - Total tokens (input + expected output)
 * @returns true if tokens fit within context window
 *
 * @example
 * ```typescript
 * const model = MODELS['oss-120b'];
 * const fits = fitsInContext(model, 100_000); // true
 * const fits = fitsInContext(model, 200_000); // false
 * ```
 */
export function fitsInContext(model: ModelConfig, totalTokens: number): boolean {
  return totalTokens <= model.maxContextTokens;
}

// ============================================================================
// STAGE 4 ANALYSIS MODELS
// ============================================================================

/**
 * Stage 4 Analysis model configuration by language and context tier
 *
 * Decision logic:
 * - If total_minimum_tokens <= 260K: use standard tier
 * - If total_minimum_tokens > 260K: use extended tier (1M context)
 *
 * Minimum = CORE_full + all_summaries (IMPORTANT + SUPPLEMENTARY)
 */
export const STAGE4_MODELS = {
  ru: {
    standard: {
      primary: 'qwen/qwen3-235b-a22b-2507',
      fallback: 'moonshotai/kimi-k2-0905',
      maxContext: 260_000,
    },
    extended: {
      primary: 'google/gemini-2.5-flash-preview-09-2025',
      fallback: 'qwen/qwen-plus-2025-07-28',
      maxContext: 1_000_000,
      cacheRead: true, // Gemini supports cache-read for 10x savings
    },
  },
  en: {
    standard: {
      primary: 'x-ai/grok-4.1-fast:free',
      fallback: 'moonshotai/kimi-k2-0905',
      maxContext: 260_000,
    },
    extended: {
      primary: 'x-ai/grok-4.1-fast:free',
      fallback: 'moonshotai/kimi-linear-48b-a3b-instruct',
      maxContext: 1_000_000,
    },
  },
} as const;

/**
 * Hard token limit even for 1M context models
 * We never process more than 700K tokens
 */
export const STAGE4_HARD_TOKEN_LIMIT = 700_000;

/**
 * Threshold for switching from standard to extended tier
 */
export const STAGE4_CONTEXT_THRESHOLD = 260_000;

/**
 * Stage 4 model tier type
 */
export type Stage4ModelTier = 'standard' | 'extended';

/**
 * Stage 4 model selection result
 */
export interface Stage4ModelSelection {
  modelId: string;
  fallbackModelId: string;
  tier: Stage4ModelTier;
  maxContext: number;
  cacheReadEnabled: boolean;
}

/**
 * Select model for Stage 4 Analysis based on minimum token requirement and language
 *
 * @param minimumTokens - CORE_full + all_summaries
 * @param language - Content language ('ru' | 'en')
 * @returns Stage4ModelSelection with primary and fallback models
 *
 * @example
 * ```typescript
 * // Small Russian course - uses Qwen3 (260K context)
 * const selection = selectModelForStage4(150_000, 'ru');
 * // selection.modelId === 'qwen/qwen3-235b-a22b-2507'
 * // selection.tier === 'standard'
 *
 * // Large Russian course - uses Gemini (1M context with cache)
 * const selection = selectModelForStage4(300_000, 'ru');
 * // selection.modelId === 'google/gemini-2.5-flash-preview-09-2025'
 * // selection.tier === 'extended'
 * // selection.cacheReadEnabled === true
 * ```
 */
export function selectModelForStage4(
  minimumTokens: number,
  language: 'ru' | 'en'
): Stage4ModelSelection {
  const tier: Stage4ModelTier = minimumTokens > STAGE4_CONTEXT_THRESHOLD ? 'extended' : 'standard';
  const config = STAGE4_MODELS[language][tier];

  return {
    modelId: config.primary,
    fallbackModelId: config.fallback,
    tier,
    maxContext: config.maxContext,
    cacheReadEnabled: 'cacheRead' in config ? config.cacheRead : false,
  };
}
