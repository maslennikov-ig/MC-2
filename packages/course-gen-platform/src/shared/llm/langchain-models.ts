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
import { attachCostRecording } from './model-cost-callbacks';
import type { PhaseName } from '@megacampus/shared-types/model-config';
import {
  DEFAULT_MODEL_ID,
  MODEL_DEFAULTS,
  CHAT_PRIMARY_MODEL_ID,
  CHAT_STAGE6_PRIMARY_MODEL_ID,
} from '@megacampus/shared-types';
import { STAGE6_CANONICAL_PHASE_DEFAULTS } from '@megacampus/shared-types/stage6-model-config';
import { createModelConfigService } from './model-config-service';
import { buildReasoningPayload } from './client-helpers';
import logger from '../logger';
import { getOpenRouterApiKey, getApiKeySync } from '../services/api-key-service';
import type { LanguageCode } from '@/shared/workspace-utils';
import { modelSupportsTemperature, modelSupportsReasoning } from '@megacampus/shared-types';

/** Reasoning settings as a phase config supplies them. */
export interface LangchainReasoningRequest {
  enabled: boolean;
  effort?: 'low' | 'medium' | 'high' | null;
  maxTokens?: number | null;
}

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
 * All standard phases now use DEFAULT_MODEL_ID (DeepSeek V4 Flash).
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
    temperature: 0.0, // Deterministic for classification
    maxTokens: 2048,
  },
  // Stage 4: Analysis phases
  stage_4_clarifying: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.5, // Moderate creativity for question generation
    maxTokens: 16000, // Large JSON output: 7+ questions with answers + thinking overhead
  },
  stage_4_classification: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8192,
  },
  stage_4_scope: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8192,
  },
  stage_4_expert: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.5,
    maxTokens: 8000,
  },
  stage_4_synthesis: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 16000, // Large structured output for course synthesis
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
    modelId: 'google/gemini-3-flash-preview', // Extended context
    temperature: 0.7,
    maxTokens: 15000,
  },
  stage_4_extended_en: {
    modelId: 'google/gemini-3-flash-preview', // Extended context
    temperature: 0.7,
    maxTokens: 15000,
  },
  // Stage 5: Generation phases
  stage_5_metadata: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8192,
  },
  stage_5_sections: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8000,
  },
  stage_5_tier1: {
    modelId: 'deepseek/deepseek-v4-flash',
    temperature: 0.7,
    maxTokens: 30000,
  },
  stage_5_escalation: {
    modelId: 'moonshotai/kimi-k2-thinking',
    temperature: 0.7,
    maxTokens: 30000,
  },
  stage_5_simple: {
    modelId: 'deepseek/deepseek-v4-flash',
    temperature: 0.7,
    maxTokens: 30000,
  },
  stage_5_normal: {
    modelId: 'moonshotai/kimi-k2-thinking',
    temperature: 0.7,
    maxTokens: 30000,
  },
  stage_5_complex: {
    modelId: 'qwen/qwen3.7-plus',
    temperature: 0.7,
    maxTokens: 30000,
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
    modelId: 'google/gemini-3-flash-preview', // Extended context
    temperature: 0.7,
    maxTokens: 15000,
  },
  stage_5_extended_en: {
    modelId: 'google/gemini-3-flash-preview', // Extended context
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
    modelId: 'google/gemini-3-flash-preview', // Extended context
    temperature: 0.7,
    maxTokens: 15000,
  },
  stage_2_extended_en: {
    modelId: 'google/gemini-3-flash-preview', // Extended context
    temperature: 0.7,
    maxTokens: 15000,
  },
  // Stage 6: Lesson generation phases
  stage_6_judge: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.3,
    maxTokens: 4096,
  },
  stage_6_content: {
    modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_content.modelId,
    temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_content.temperature,
    maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_content.maxTokens,
  },
  stage_6_refinement: {
    modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_refinement.modelId,
    temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_refinement.temperature,
    maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_refinement.maxTokens,
  },
  stage_6_rag_planning: {
    modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_rag_planning.modelId,
    temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_rag_planning.temperature,
    maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_rag_planning.maxTokens,
  },
  stage_6_simple: {
    modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_simple.modelId,
    temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_simple.temperature,
    maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_simple.maxTokens,
  },
  stage_6_normal: {
    modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_normal.modelId,
    temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_normal.temperature,
    maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_normal.maxTokens,
  },
  stage_6_complex: {
    modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_complex.modelId,
    temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_complex.temperature,
    maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_complex.maxTokens,
  },
  stage_6_auto_last_chance: {
    modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_auto_last_chance.modelId,
    temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_auto_last_chance.temperature,
    maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_auto_last_chance.maxTokens,
  },
  stage_6_manual_regeneration: {
    modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_manual_regeneration.modelId,
    temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_manual_regeneration.temperature,
    maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_manual_regeneration.maxTokens,
  },
  stage_6_arbiter: {
    modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_arbiter.modelId,
    temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_arbiter.temperature, // Deterministic for agreement scoring
    maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_arbiter.maxTokens,
  },
  stage_6_patcher: {
    modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_patcher.modelId,
    temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_patcher.temperature, // Low temp for precise editing
    maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_patcher.maxTokens, // Small output for patches
  },
  stage_6_section_expander: {
    modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_section_expander.modelId,
    temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_section_expander.temperature, // Moderate creativity
    maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_section_expander.maxTokens, // Larger output for full sections
  },
  stage_6_delta_judge: {
    modelId: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_delta_judge.modelId,
    temperature: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_delta_judge.temperature, // Deterministic for validation
    maxTokens: STAGE6_CANONICAL_PHASE_DEFAULTS.stage_6_delta_judge.maxTokens, // Small focused output
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
    modelId: 'google/gemini-3-flash-preview', // Extended context
    temperature: 0.7,
    maxTokens: 15000,
  },
  stage_6_extended_en: {
    modelId: 'deepseek/deepseek-v4-flash', // Extended context for EN
    temperature: 0.7,
    maxTokens: 15000,
  },
  // Stage 7: Enrichments (Activities)
  // Cover and Card use image generation models directly (not LLM text generation)
  stage_7_cover: {
    modelId: 'google/gemini-2.5-flash-image', // 16:9 aspect ratio, $0.038
    temperature: 0.7,
    maxTokens: 1024,
  },
  stage_7_card: {
    modelId: 'openai/gpt-5-image-mini', // 1:1 square 1024x1024, $0.007
    temperature: 0.7,
    maxTokens: 1024,
  },
  stage_7_video: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8000,
  },
  stage_7_audio: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8000,
  },
  stage_7_quiz: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8192,
  },
  stage_7_presentation: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8000,
  },
  stage_7_document: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8000,
  },
  // Special phases (keep specific models)
  emergency: {
    modelId: 'deepseek/deepseek-v4-flash', // Large context (2M tokens)
    temperature: 0.7,
    maxTokens: 30000,
  },
  quality_fallback: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.3,
    maxTokens: 16000,
  },
  // Global default (used when phase not found)
  global_default: {
    modelId: DEFAULT_MODEL_ID,
    temperature: MODEL_DEFAULTS.temperature,
    maxTokens: MODEL_DEFAULTS.maxTokens,
  },
  // Chat phases (model IDs from @megacampus/shared-types)
  chat_intent_classification: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.1,
    maxTokens: 200,
  },
  chat_node_refinement: {
    modelId: CHAT_PRIMARY_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8192,
  },
  chat_global_guidance: {
    modelId: CHAT_PRIMARY_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8192,
  },
  chat_full_regeneration: {
    modelId: CHAT_PRIMARY_MODEL_ID,
    temperature: 0.6,
    maxTokens: 8192,
  },
  chat_stage_5_refinement: {
    modelId: CHAT_PRIMARY_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8192,
  },
  chat_stage_6_refinement: {
    modelId: CHAT_STAGE6_PRIMARY_MODEL_ID,
    temperature: 0.7,
    maxTokens: 8192,
  },
  // Inline operations
  inline_block_regeneration: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 2000,
  },
  inline_element_crud: {
    modelId: DEFAULT_MODEL_ID,
    temperature: 0.7,
    maxTokens: 4000,
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
 * const expertModel = createOpenRouterModel('deepseek/deepseek-v4-flash', 0.5, 8000);
 */
/**
 * Build the provider-specific half of a ChatOpenAI config.
 *
 * Two provider facts are handled here rather than at every call site:
 * `temperature` is silently ignored by models that do not accept it (OpenAI's
 * GPT-5.6 series), and reasoning tokens are billed out of `maxTokens`, so a
 * reasoning budget has to be added to the answer budget rather than shared
 * with it.
 */
export function buildProviderParams(
  modelId: string,
  temperature: number,
  maxTokens: number,
  reasoning?: LangchainReasoningRequest
): {
  temperature?: number;
  maxTokens: number;
  modelKwargs: Record<string, unknown>;
} {
  const modelKwargs: Record<string, unknown> = { usage: { include: true } };
  let effectiveMaxTokens = maxTokens;

  if (reasoning?.enabled) {
    if (modelSupportsReasoning(modelId)) {
      // OpenRouter rejects a request carrying both controls; the budget wins
      // because the answer budget below is grown by exactly this number.
      modelKwargs.reasoning = buildReasoningPayload(reasoning);
      if (reasoning.maxTokens) effectiveMaxTokens += reasoning.maxTokens;
    } else {
      logger.warn(
        { modelId },
        'Phase asks for reasoning but the model does not accept it - sending the request without it'
      );
    }
  }

  return {
    ...(modelSupportsTemperature(modelId) ? { temperature } : {}),
    maxTokens: effectiveMaxTokens,
    modelKwargs,
  };
}

export function createOpenRouterModel(
  modelId: string,
  temperature: number = 0.7,
  maxTokens: number = 4096,
  timeoutMs?: number,
  reasoning?: LangchainReasoningRequest
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
    ...(timeoutMs ? { timeout: timeoutMs } : {}),
    ...buildProviderParams(modelId, temperature, maxTokens, reasoning),
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
 * const model = await createOpenRouterModelAsync('deepseek/deepseek-v4-flash', 0.5, 8000);
 */
export async function createOpenRouterModelAsync(
  modelId: string,
  temperature: number = 0.7,
  maxTokens: number = 4096,
  timeoutMs?: number,
  reasoning?: LangchainReasoningRequest
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
    ...(timeoutMs ? { timeout: timeoutMs } : {}),
    ...buildProviderParams(modelId, temperature, maxTokens, reasoning),
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
 * @param tokenCount - Optional token count for tier selection
 * @param language - Optional language code (LanguageCode: 'ru', 'en', or any ISO 639-1 code)
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
  language?: LanguageCode
): Promise<ChatOpenAI> {
  try {
    const config = await modelConfigService.getModelForPhase(phase, courseId, tokenCount, language);

    if (config.source === 'database') {
      logger.info(
        {
          phase,
          modelId: config.modelId,
          tier: config.tier,
          tokenCount,
          language,
          source: 'database',
        },
        'Using database model config'
      );
    } else {
      logger.info(
        { phase, modelId: config.modelId, language, source: 'hardcoded' },
        'Using hardcoded fallback model config'
      );
    }

    // Use async version for database-first API key resolution.
    // `config.reasoning` has to travel with the rest of the phase config: a
    // phase that reads its reasoning budget out of the database and then drops
    // it before the request is a phase that thinks it deliberates and does not.
    const model = await createOpenRouterModelAsync(
      config.modelId,
      config.temperature,
      config.maxTokens,
      undefined,
      config.reasoning
    );
    return attachCostRecording(model, config.modelId, phase, courseId);
  } catch (err) {
    logger.warn(
      { phase, error: err },
      'ModelConfigService lookup failed, using hardcoded fallback'
    );
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
    throw new Error(`Unknown phase: ${phase}. Cannot determine hardcoded fallback.`);
  }

  return createOpenRouterModel(config.modelId, config.temperature, config.maxTokens);
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
    throw new Error(`Unknown phase: ${phase}. Cannot determine hardcoded fallback.`);
  }

  return await createOpenRouterModelAsync(config.modelId, config.temperature, config.maxTokens);
}

/**
 * Safely extract text from LangChain MessageContent (string | ContentBlock[]).
 * Returns string as-is; for non-string content, returns JSON representation.
 */
export function getTextContent(content: string | unknown[]): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}
