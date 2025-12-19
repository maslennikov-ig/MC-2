/**
 * LangChain OpenRouter Model Configuration
 *
 * Also known as: Model Selector Service (Task T022)
 *
 * Helper functions for creating LangChain ChatOpenAI instances configured for OpenRouter.
 * Supports multi-phase multi-model orchestration with per-phase model selection.
 *
 * This file implements the Model Selector Service (T022) requirements:
 * - Per-phase model selection from database (llm_model_config)
 * - 3-tier fallback logic: course override -> global default -> hardcoded fallback
 * - Returns configured ChatOpenAI instances with model_id, temperature, max_tokens
 *
 * API Key Resolution:
 * Uses centralized api-key-service for key retrieval.
 * Priority: database (admin panel) -> environment variable
 *
 * NOTE: This utility was moved from `src/stages/stage4-analysis/utils/langchain-models.ts`
 * to `src/shared/llm/langchain-models.ts` to break circular dependencies where
 * `shared/regeneration/` was importing from `stages/`.
 *
 * @module shared/llm/langchain-models
 */

import { ChatOpenAI } from '@langchain/openai';
import type { PhaseName } from '@megacampus/shared-types/model-config';
import { DEFAULT_MODEL_ID, MODEL_DEFAULTS } from '@megacampus/shared-types';
import { createModelConfigService } from './model-config-service';
import logger from '../logger';
import { getOpenRouterApiKey, getApiKeySync } from '../services/api-key-service';

/**
 * OpenRouter API base URL
 * All OpenRouter models are accessible via this endpoint
 */
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Singleton ModelConfigService instance
 */
const modelConfigService = createModelConfigService();

/**
 * Hardcoded fallback configurations for each phase
 * Used when database is unavailable or config not found
 *
 * NOTE: These are LAST RESORT fallbacks. Primary source is database.
 * All standard phases now use DEFAULT_MODEL_ID (Xiaomi MiMo V2 Flash).
 * Special phases (emergency, quality_fallback) keep specific models.
 *
 * Hierarchy:
 * 1. DB config for specific phase
 * 2. DB global_default config
 * 3. These hardcoded constants
 */
const PHASE_FALLBACK_CONFIG: Record<
  PhaseName,
  { modelId: string; temperature: number; maxTokens: number }
> = {
  // Stage 3: Classification
  stage_3_classification: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.0,                    // Deterministic for classification
    maxTokens: 2048,
  },
  // Stage 4: Analysis phases
  stage_4_classification: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 4096,
  },
  stage_4_scope: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 4096,
  },
  stage_4_expert: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.5,
    maxTokens: 8000,
  },
  stage_4_synthesis: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 6000,
  },
  stage_4_standard_ru: {
    modelId: DEFAULT_MODEL_ID,
    temperature: MODEL_DEFAULTS.temperature,
    maxTokens: MODEL_DEFAULTS.maxTokens,
  },
  stage_4_standard_en: {
    modelId: DEFAULT_MODEL_ID,
    temperature: MODEL_DEFAULTS.temperature,
    maxTokens: MODEL_DEFAULTS.maxTokens,
  },
  stage_4_extended_ru: {
    modelId: 'google/gemini-2.5-flash',  // Extended context
    temperature: 0.7,
    maxTokens: 15000,
  },
  stage_4_extended_en: {
    modelId: 'google/gemini-2.5-flash',  // Extended context
    temperature: 0.7,
    maxTokens: 15000,
  },
  // Stage 5: Generation phases
  stage_5_metadata: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 4096,
  },
  stage_5_sections: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8000,
  },
  stage_5_standard_ru: {
    modelId: DEFAULT_MODEL_ID,
    temperature: MODEL_DEFAULTS.temperature,
    maxTokens: MODEL_DEFAULTS.maxTokens,
  },
  stage_5_standard_en: {
    modelId: DEFAULT_MODEL_ID,
    temperature: MODEL_DEFAULTS.temperature,
    maxTokens: MODEL_DEFAULTS.maxTokens,
  },
  stage_5_extended_ru: {
    modelId: 'google/gemini-2.5-flash',  // Extended context
    temperature: 0.7,
    maxTokens: 15000,
  },
  stage_5_extended_en: {
    modelId: 'google/gemini-2.5-flash',  // Extended context
    temperature: 0.7,
    maxTokens: 15000,
  },
  // Stage 2: Summarization phases
  stage_2_summarization: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 10000,
  },
  stage_2_standard_ru: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 10000,
  },
  stage_2_standard_en: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 10000,
  },
  stage_2_extended_ru: {
    modelId: 'google/gemini-2.5-flash',  // Extended context
    temperature: 0.7,
    maxTokens: 15000,
  },
  stage_2_extended_en: {
    modelId: 'google/gemini-2.5-flash',  // Extended context
    temperature: 0.7,
    maxTokens: 15000,
  },
  // Stage 6: Lesson generation phases
  stage_6_rag_planning: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 4096,
  },
  stage_6_judge: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.3,
    maxTokens: 4096,
  },
  stage_6_refinement: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.5,
    maxTokens: 8000,
  },
  stage_6_arbiter: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.0,                       // Deterministic for agreement scoring
    maxTokens: 2048,
  },
  stage_6_patcher: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.1,                       // Low temp for precise editing
    maxTokens: 1000,                        // Small output for patches
  },
  stage_6_section_expander: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,                       // Moderate creativity
    maxTokens: 2000,                        // Larger output for full sections
  },
  stage_6_delta_judge: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.0,                       // Deterministic for validation
    maxTokens: 512,                         // Small focused output
  },
  stage_6_standard_ru: {
    modelId: DEFAULT_MODEL_ID,
    temperature: MODEL_DEFAULTS.temperature,
    maxTokens: MODEL_DEFAULTS.maxTokens,
  },
  stage_6_standard_en: {
    modelId: DEFAULT_MODEL_ID,
    temperature: MODEL_DEFAULTS.temperature,
    maxTokens: MODEL_DEFAULTS.maxTokens,
  },
  stage_6_extended_ru: {
    modelId: 'google/gemini-2.5-flash',  // Extended context
    temperature: 0.7,
    maxTokens: 15000,
  },
  stage_6_extended_en: {
    modelId: 'x-ai/grok-4.1-fast',       // Extended context, Grok for EN
    temperature: 0.7,
    maxTokens: 15000,
  },
  // Special phases (keep specific models)
  emergency: {
    modelId: 'x-ai/grok-4-fast',         // Large context (2M tokens)
    temperature: 0.7,
    maxTokens: 30000,
  },
  quality_fallback: {
    modelId: DEFAULT_MODEL_ID,           // Updated: use MiMo for quality fallback too
    temperature: 0.3,
    maxTokens: 16000,
  },
  // Global default (used when phase not found)
  global_default: {
    modelId: DEFAULT_MODEL_ID,
    temperature: MODEL_DEFAULTS.temperature,
    maxTokens: MODEL_DEFAULTS.maxTokens,
  },
};

/**
 * Creates a ChatOpenAI instance configured for OpenRouter (sync version)
 *
 * Note: Uses environment variable only. For database-first key resolution,
 * use createOpenRouterModelAsync() instead.
 *
 * @param modelId - OpenRouter model identifier (e.g., 'openai/gpt-oss-20b')
 * @param temperature - Model temperature (0-2, default: 0.7)
 * @param maxTokens - Maximum output tokens (default: 4096)
 * @returns Configured ChatOpenAI instance
 *
 * @example
 * // Create 20B model for classification
 * const model = createOpenRouterModel('openai/gpt-oss-20b', 0.7, 4096);
 *
 * @example
 * // Create 120B model for expert analysis
 * const expertModel = createOpenRouterModel('openai/gpt-oss-120b', 0.5, 8000);
 */
export function createOpenRouterModel(
  modelId: string,
  temperature: number = 0.7,
  maxTokens: number = 4096
): ChatOpenAI {
  const apiKey = getApiKeySync('openrouter');

  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY environment variable is required for LangChain integration. ' +
      'For database-first key resolution, use createOpenRouterModelAsync() instead.'
    );
  }

  return new ChatOpenAI({
    model: modelId,
    configuration: {
      baseURL: OPENROUTER_BASE_URL,
    },
    apiKey: apiKey,
    temperature,
    maxTokens,
  });
}

/**
 * Creates a ChatOpenAI instance with database-first API key resolution
 *
 * This is the preferred method for creating OpenRouter models.
 * Resolves API key from database first, then falls back to env var.
 *
 * @param modelId - OpenRouter model identifier (e.g., 'openai/gpt-oss-20b')
 * @param temperature - Model temperature (0-2, default: 0.7)
 * @param maxTokens - Maximum output tokens (default: 4096)
 * @returns Promise<ChatOpenAI> - Configured ChatOpenAI instance
 *
 * @example
 * // Create model with database-first key resolution
 * const model = await createOpenRouterModelAsync('openai/gpt-oss-120b', 0.5, 8000);
 */
export async function createOpenRouterModelAsync(
  modelId: string,
  temperature: number = 0.7,
  maxTokens: number = 4096
): Promise<ChatOpenAI> {
  const apiKey = await getOpenRouterApiKey();

  if (!apiKey) {
    throw new Error(
      'OpenRouter API key not configured. Set OPENROUTER_API_KEY env var or configure in admin panel.'
    );
  }

  return new ChatOpenAI({
    model: modelId,
    configuration: {
      baseURL: OPENROUTER_BASE_URL,
    },
    apiKey: apiKey,
    temperature,
    maxTokens,
  });
}

/**
 * Retrieves the appropriate ChatOpenAI model for a specific analysis phase
 *
 * Lookup logic (3-tier fallback):
 * 1. Course-specific override (if courseId provided)
 * 2. Global default configuration
 * 3. Hardcoded fallback (if database unavailable)
 *
 * @param phase - Analysis phase identifier
 * @param courseId - Optional course UUID for course-specific overrides
 * @returns Configured ChatOpenAI instance
 *
 * @throws Error if database lookup fails and no hardcoded fallback exists
 *
 * @example
 * // Get model for Phase 1 Classification (global config)
 * const model = await getModelForPhase('stage_4_classification');
 *
 * @example
 * // Get model for Phase 3 Expert Analysis with course override
 * const expertModel = await getModelForPhase(
 *   'stage_4_expert',
 *   '550e8400-e29b-41d4-a716-446655440000'
 * );
 */
export async function getModelForPhase(
  phase: PhaseName,
  courseId?: string,
  tokenCount?: number,
  language?: string  // Supports 'ru', 'en', or any other (uses 'any' reserve settings as fallback)
): Promise<ChatOpenAI> {
  try {
    const config = await modelConfigService.getModelForPhase(phase, courseId, tokenCount, language);

    if (config.source === 'database') {
      logger.info({
        phase,
        modelId: config.modelId,
        tier: config.tier,
        tokenCount,
        language,
        source: 'database'
      }, 'Using database model config');
    } else {
      logger.info({ phase, modelId: config.modelId, source: 'hardcoded' }, 'Using hardcoded fallback model config');
    }

    // Use async version for database-first API key resolution
    return await createOpenRouterModelAsync(config.modelId, config.temperature, config.maxTokens);
  } catch (err) {
    logger.warn({ phase, error: err }, 'ModelConfigService lookup failed, using hardcoded fallback');
    return await getHardcodedFallbackModelAsync(phase);
  }
}

/**
 * Retrieves hardcoded fallback model for a specific phase (sync version)
 *
 * Used when database is unavailable or config not found.
 * Uses PHASE_FALLBACK_CONFIG for model configuration.
 *
 * @param phase - Analysis phase identifier
 * @returns Configured ChatOpenAI instance with hardcoded settings
 * @throws Error if phase is unknown
 */
export function getHardcodedFallbackModel(phase: PhaseName): ChatOpenAI {
  const config = PHASE_FALLBACK_CONFIG[phase];

  if (!config) {
    throw new Error(
      `Unknown phase: ${phase}. Cannot determine hardcoded fallback.`
    );
  }

  return createOpenRouterModel(
    config.modelId,
    config.temperature,
    config.maxTokens
  );
}

/**
 * Async version of getHardcodedFallbackModel with database-first API key resolution
 *
 * Used when database is unavailable or config not found.
 * Uses PHASE_FALLBACK_CONFIG for model configuration.
 *
 * @param phase - Analysis phase identifier
 * @returns Promise<ChatOpenAI> - Configured ChatOpenAI instance with hardcoded settings
 * @throws Error if phase is unknown
 */
async function getHardcodedFallbackModelAsync(phase: PhaseName): Promise<ChatOpenAI> {
  const config = PHASE_FALLBACK_CONFIG[phase];

  if (!config) {
    throw new Error(
      `Unknown phase: ${phase}. Cannot determine hardcoded fallback.`
    );
  }

  return await createOpenRouterModelAsync(
    config.modelId,
    config.temperature,
    config.maxTokens
  );
}
