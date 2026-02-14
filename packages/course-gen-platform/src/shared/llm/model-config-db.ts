/**
 * Database Query Module for Model Configuration Service
 * @module shared/llm/model-config-db
 *
 * Handles all database queries for model configuration lookup.
 * Extracted from model-config-service.ts to improve maintainability.
 */

import { getSupabaseAdmin } from '../supabase/admin';
import logger from '../logger';
import type { Database } from '@megacampus/shared-types';
import { normalizeLanguageForReserve, type LanguageCode } from '@megacampus/shared-utils';

type LLMModelConfigRow = Database['public']['Tables']['llm_model_config']['Row'];

/**
 * Default values for per-stage configuration when not specified in database
 */
export const DEFAULT_STAGE_CONFIG = {
  qualityThreshold: 0.75,
  maxRetries: 3,
  timeoutMs: null as number | null, // null = no timeout
} as const;

/**
 * Model configuration result with primary/fallback models
 */
export interface ModelConfigResult {
  /** Primary model ID (OpenRouter format) */
  primary: string;
  /** Fallback model ID (OpenRouter format) */
  fallback: string;
  /** Maximum context tokens */
  maxContext: number;
  /** Whether cache read optimization is enabled */
  cacheReadEnabled: boolean;
  /** Context tier used (standard or extended) */
  tier: 'standard' | 'extended';
  /** Source of configuration (database or hardcoded fallback) */
  source: 'database' | 'hardcoded';
  /** The language that was actually found in DB ('ru', 'en', or 'any') */
  actualLanguage?: string;
}

/**
 * Phase-based model configuration (legacy)
 */
export interface PhaseModelConfig {
  /** Model ID */
  modelId: string;
  /** Fallback model ID */
  fallbackModelId: string | null;
  /** Temperature setting */
  temperature: number;
  /** Max output tokens */
  maxTokens: number;
  /** Max context tokens for the model (used for dynamic threshold calculation) */
  maxContextTokens: number | null;
  /** Quality threshold for phase validation (0-1). NULL uses hardcoded default. */
  qualityThreshold: number | null;
  /** Maximum retry attempts for phase (0-10). Default 3. */
  maxRetries: number;
  /** Phase timeout in milliseconds. NULL means no timeout (infinite). */
  timeoutMs: number | null;
  /** Context tier used (standard or extended) */
  tier: 'standard' | 'extended';
  /** Source of configuration */
  source: 'database' | 'hardcoded';
  /** The language that was actually found in DB ('ru', 'en', or 'any') */
  actualLanguage?: string;
}

/**
 * Judge model configuration with weight
 */
export interface JudgeModelConfig {
  /** Model ID (OpenRouter format) */
  modelId: string;
  /** Historical accuracy-based weight (0-1) */
  weight: number;
  /** Temperature setting */
  temperature: number;
  /** Max output tokens */
  maxTokens: number;
  /** Display name for UI */
  displayName: string;
  /** Fallback model ID */
  fallbackModelId: string;
}

/**
 * Judge models result with primary/secondary/tiebreaker
 */
export interface JudgeModelsResult {
  primary: JudgeModelConfig;
  secondary: JudgeModelConfig;
  tiebreaker: JudgeModelConfig;
  source: 'database' | 'hardcoded';
}

/**
 * Fetches stage configuration from database with language fallback
 */
export async function fetchStageConfigFromDb(
  stageNumber: number,
  language: LanguageCode,
  tier: 'standard' | 'extended'
): Promise<ModelConfigResult | null> {
  const supabase = getSupabaseAdmin();

  // Cascading language lookup: specific language -> 'any' fallback
  // First normalize to reserve language (ru/en/any), then always try 'any' as fallback
  const reserveLang = normalizeLanguageForReserve(language);
  // Only try language-specific config if it's ru or en, otherwise directly use 'any'
  const languagesToTry: Array<'ru' | 'en' | 'any'> =
    reserveLang === 'any' ? ['any'] : [reserveLang, 'any'];

  // Build parallel queries for all language variants (optimization: ~50-100ms saved per fallback)
  const languageQueries = languagesToTry.map(langToTry =>
    supabase
      .from('llm_model_config')
      .select()
      .eq('config_type', 'global')
      .eq('stage_number', stageNumber)
      .eq('language', langToTry)
      .eq('context_tier', tier)
      .eq('is_active', true)
      .maybeSingle()
  );

  // Execute all queries in parallel
  const results = await Promise.all(languageQueries);

  // Process results in priority order (first match wins)
  for (let i = 0; i < results.length; i++) {
    const { data, error } = results[i];
    const langToTry = languagesToTry[i];

    if (error) {
      logger.warn(
        { stageNumber, language: langToTry, tier, error: error.message },
        'Error fetching stage config from DB'
      );
      continue; // Try next language variant
    }

    if (data) {
      if (langToTry === 'any') {
        logger.debug(
          { stageNumber, requestedLanguage: language, foundLanguage: 'any', tier },
          'Using universal (any) language config as fallback'
        );
      }
      // Found a config - process it
      const config = data as LLMModelConfigRow;

      // Validate required fields - fail fast on incomplete data
      if (!config.fallback_model_id) {
        const errorMsg = `Incomplete stage config in database: missing fallback_model_id for stage ${stageNumber}, language "${langToTry}", tier "${tier}"`;
        logger.error(
          { stageNumber, language: langToTry, tier, modelId: config.model_id },
          errorMsg
        );
        throw new Error(errorMsg);
      }

      if (!config.max_context_tokens) {
        const errorMsg = `Incomplete stage config in database: missing max_context_tokens for stage ${stageNumber}, language "${langToTry}", tier "${tier}"`;
        logger.error(
          { stageNumber, language: langToTry, tier, modelId: config.model_id },
          errorMsg
        );
        throw new Error(errorMsg);
      }

      return {
        primary: config.model_id,
        fallback: config.fallback_model_id,
        maxContext: config.max_context_tokens,
        cacheReadEnabled: config.cache_read_enabled || false,
        tier,
        source: 'database',
        actualLanguage: langToTry,
      };
    }
  }

  // No config found for any language variant
  return null;
}

/**
 * Fetches phase configuration from database with language and course override fallback
 */
export async function fetchPhaseConfigFromDb(
  phaseName: string,
  courseId: string | undefined,
  tier: 'standard' | 'extended',
  language: LanguageCode | undefined
): Promise<PhaseModelConfig | null> {
  const supabase = getSupabaseAdmin();

  // Cascading language lookup: specific language -> 'any' fallback
  const languagesToTry: Array<string> = language ? [language, 'any'] : ['any'];

  // Build all queries in parallel (optimization: ~50-100ms saved per sequential query)
  // Priority order: course override (by language) > global config (by language)
  const selectFields =
    'model_id, fallback_model_id, temperature, max_tokens, max_context_tokens, quality_threshold, max_retries, timeout_ms, context_tier';

  // Build course override queries (if courseId provided)
  const courseOverrideQueries = courseId
    ? languagesToTry.map(langToTry =>
        supabase
          .from('llm_model_config')
          .select(selectFields)
          .eq('config_type', 'course_override')
          .eq('course_id', courseId)
          .eq('phase_name', phaseName)
          .eq('language', langToTry)
          .eq('context_tier', tier)
          .eq('is_active', true)
          .maybeSingle()
      )
    : [];

  // Build global config queries
  const globalConfigQueries = languagesToTry.map(langToTry =>
    supabase
      .from('llm_model_config')
      .select(selectFields)
      .eq('config_type', 'global')
      .eq('phase_name', phaseName)
      .eq('language', langToTry)
      .eq('context_tier', tier)
      .eq('is_active', true)
      .maybeSingle()
  );

  // Execute all queries in parallel
  const [courseOverrideResults, globalConfigResults] = await Promise.all([
    Promise.all(courseOverrideQueries),
    Promise.all(globalConfigQueries),
  ]);

  // Track whether at least one query succeeded (no error).
  // If ALL queries had errors → throw (transient DB failure).
  // If at least one succeeded but no data → return null (genuine missing config).
  let queriesSucceeded = 0;
  let lastDbError: string | null = null;

  // Priority 1: Process course override results in language priority order
  for (let i = 0; i < courseOverrideResults.length; i++) {
    const { data: courseOverride, error } = courseOverrideResults[i];
    const langToTry = languagesToTry[i];

    if (error) {
      lastDbError = error.message;
      logger.warn(
        { phaseName, courseId, language: langToTry, tier, error: error.message },
        'Error fetching course override config from DB'
      );
      continue;
    }
    queriesSucceeded++;

    if (courseOverride) {
      if (langToTry === 'any') {
        logger.debug(
          { phaseName, courseId, requestedLanguage: language, foundLanguage: 'any', tier },
          'Using universal (any) language course override config as fallback'
        );
      }
      return {
        modelId: courseOverride.model_id,
        fallbackModelId: courseOverride.fallback_model_id || null,
        temperature: courseOverride.temperature || 0.7,
        maxTokens: courseOverride.max_tokens || 4096,
        maxContextTokens: courseOverride.max_context_tokens || null,
        qualityThreshold: courseOverride.quality_threshold,
        maxRetries: courseOverride.max_retries ?? 3,
        timeoutMs: courseOverride.timeout_ms,
        tier: (courseOverride.context_tier as 'standard' | 'extended') || tier,
        source: 'database',
        actualLanguage: langToTry,
      };
    }
  }

  // Priority 2: Process global config results in language priority order
  for (let i = 0; i < globalConfigResults.length; i++) {
    const { data: globalConfig, error } = globalConfigResults[i];
    const langToTry = languagesToTry[i];

    if (error) {
      lastDbError = error.message;
      logger.warn(
        { phaseName, language: langToTry, tier, error: error.message },
        'Error fetching phase config from DB'
      );
      continue;
    }
    queriesSucceeded++;

    if (globalConfig) {
      if (langToTry === 'any') {
        logger.debug(
          { phaseName, requestedLanguage: language, foundLanguage: 'any', tier },
          'Using universal (any) language config as fallback'
        );
      } else {
        logger.debug(
          { phaseName, requestedLanguage: language, foundLanguage: langToTry, tier },
          'Using language-specific config (exact match)'
        );
      }
      return {
        modelId: globalConfig.model_id,
        fallbackModelId: globalConfig.fallback_model_id || null,
        temperature: globalConfig.temperature || 0.7,
        maxTokens: globalConfig.max_tokens || 4096,
        maxContextTokens: globalConfig.max_context_tokens || null,
        qualityThreshold: globalConfig.quality_threshold,
        maxRetries: globalConfig.max_retries ?? 3,
        timeoutMs: globalConfig.timeout_ms,
        tier: (globalConfig.context_tier as 'standard' | 'extended') || tier,
        source: 'database',
        actualLanguage: langToTry,
      };
    }
  }

  // If ALL queries had errors (none succeeded), throw to signal transient DB failure.
  // This lets callers (model-config-service) distinguish "no config rows" from "DB unreachable".
  if (queriesSucceeded === 0) {
    throw new Error(
      `All DB queries failed for phase "${phaseName}" — possible transient DB issue: ${lastDbError}`
    );
  }

  // At least one query succeeded but returned no matching config row
  return null;
}

/**
 * Fetches judge configurations from database with language fallback
 */
export async function fetchJudgeConfigsFromDb(
  language: LanguageCode
): Promise<JudgeModelsResult | null> {
  const supabase = getSupabaseAdmin();

  // Try exact language match first
  // eslint-disable-next-line prefer-const -- judgeConfigs is reassigned below
  let { data: judgeConfigs, error } = await supabase
    .from('llm_model_config')
    .select('*')
    .eq('phase_name', 'stage_6_judge')
    .eq('language', language)
    .eq('is_active', true)
    .not('judge_role', 'is', null);

  // If no language-specific configs, try 'any' as fallback
  if (error || !judgeConfigs || judgeConfigs.length === 0) {
    const fallbackResult = await supabase
      .from('llm_model_config')
      .select('*')
      .eq('phase_name', 'stage_6_judge')
      .eq('language', 'any')
      .eq('is_active', true)
      .not('judge_role', 'is', null);

    if (fallbackResult.error || !fallbackResult.data || fallbackResult.data.length === 0) {
      logger.warn(
        { language, error: fallbackResult.error?.message },
        'No judge configs found for language or fallback'
      );
      return null;
    }

    judgeConfigs = fallbackResult.data;
  }

  // Type assertion to help TypeScript recognize the full schema
  const configs = judgeConfigs as LLMModelConfigRow[];

  // Map configs by judge_role
  const primary = configs.find(c => c.judge_role === 'primary');
  const secondary = configs.find(c => c.judge_role === 'secondary');
  const tiebreaker = configs.find(c => c.judge_role === 'tiebreaker');

  // Validate all roles exist
  if (!primary || !secondary || !tiebreaker) {
    logger.warn(
      {
        language,
        foundRoles: configs.map(c => c.judge_role),
      },
      'Missing judge roles in database'
    );
    return null;
  }

  return {
    primary: mapJudgeConfig(primary),
    secondary: mapJudgeConfig(secondary),
    tiebreaker: mapJudgeConfig(tiebreaker),
    source: 'database',
  };
}

/**
 * Maps database judge config row to JudgeModelConfig
 */
function mapJudgeConfig(config: LLMModelConfigRow): JudgeModelConfig {
  return {
    modelId: config.model_id,
    weight: config.weight || 0.7,
    temperature: config.temperature || 0.3,
    maxTokens: config.max_tokens || 4096,
    displayName: config.primary_display_name || config.model_id,
    fallbackModelId: config.fallback_model_id || 'openai/gpt-oss-120b',
  };
}

/**
 * Hardcoded fallback configurations for phases (standard tier)
 * Used as "last resort" when database unavailable AND no cached data
 *
 * These match production DB configs as of 2026-01-20.
 * Production should always use database config for flexibility.
 */
export const DEFAULT_PHASE_CONFIGS: Record<string, PhaseModelConfig> = {
  // Stage 2
  stage_2_summarization: {
    modelId: 'xiaomi/mimo-v2-flash',
    fallbackModelId: 'google/gemini-2.5-flash',
    temperature: 0.7,
    maxTokens: 8000,
    maxContextTokens: 128000,
    qualityThreshold: null,
    maxRetries: 3,
    timeoutMs: null,
    tier: 'standard',
    source: 'hardcoded',
  },
  // Stage 3
  stage_3_classification: {
    modelId: 'xiaomi/mimo-v2-flash',
    fallbackModelId: 'google/gemini-2.5-flash',
    temperature: 0.5,
    maxTokens: 4096,
    maxContextTokens: 128000,
    qualityThreshold: null,
    maxRetries: 3,
    timeoutMs: null,
    tier: 'standard',
    source: 'hardcoded',
  },
  // Stage 4
  stage_4_classification: {
    modelId: 'xiaomi/mimo-v2-flash',
    fallbackModelId: 'google/gemini-2.5-flash',
    temperature: 0.7,
    maxTokens: 4096,
    maxContextTokens: 128000,
    qualityThreshold: null,
    maxRetries: 3,
    timeoutMs: null,
    tier: 'standard',
    source: 'hardcoded',
  },
  stage_4_scope: {
    modelId: 'xiaomi/mimo-v2-flash',
    fallbackModelId: 'google/gemini-2.5-flash',
    temperature: 0.7,
    maxTokens: 4096,
    maxContextTokens: 128000,
    qualityThreshold: null,
    maxRetries: 3,
    timeoutMs: null,
    tier: 'standard',
    source: 'hardcoded',
  },
  stage_4_expert: {
    modelId: 'xiaomi/mimo-v2-flash',
    fallbackModelId: 'google/gemini-2.5-flash',
    temperature: 0.5,
    maxTokens: 8000,
    maxContextTokens: 128000,
    qualityThreshold: null,
    maxRetries: 3,
    timeoutMs: null,
    tier: 'standard',
    source: 'hardcoded',
  },
  stage_4_synthesis: {
    modelId: 'xiaomi/mimo-v2-flash',
    fallbackModelId: 'google/gemini-2.5-flash',
    temperature: 0.7,
    maxTokens: 6000,
    maxContextTokens: 128000,
    qualityThreshold: null,
    maxRetries: 3,
    timeoutMs: null,
    tier: 'standard',
    source: 'hardcoded',
  },
  // Stage 5
  stage_5_sections: {
    modelId: 'xiaomi/mimo-v2-flash',
    fallbackModelId: 'google/gemini-2.5-flash',
    temperature: 0.7,
    maxTokens: 8000,
    maxContextTokens: 128000,
    qualityThreshold: null,
    maxRetries: 3,
    timeoutMs: null,
    tier: 'standard',
    source: 'hardcoded',
  },
  stage_5_metadata: {
    modelId: 'xiaomi/mimo-v2-flash',
    fallbackModelId: 'google/gemini-2.5-flash',
    temperature: 0.7,
    maxTokens: 4096,
    maxContextTokens: 128000,
    qualityThreshold: null,
    maxRetries: 3,
    timeoutMs: null,
    tier: 'standard',
    source: 'hardcoded',
  },
  stage_5_tier1: {
    modelId: 'openai/gpt-oss-120b',
    fallbackModelId: 'moonshotai/kimi-k2-0905',
    temperature: 0.7,
    maxTokens: 30000,
    maxContextTokens: 128000,
    qualityThreshold: null,
    maxRetries: 3,
    timeoutMs: null,
    tier: 'standard',
    source: 'hardcoded',
  },
  stage_5_escalation: {
    modelId: 'moonshotai/kimi-k2-0905',
    fallbackModelId: 'google/gemini-2.5-flash',
    temperature: 0.7,
    maxTokens: 30000,
    maxContextTokens: 128000,
    qualityThreshold: null,
    maxRetries: 3,
    timeoutMs: null,
    tier: 'standard',
    source: 'hardcoded',
  },
  // Stage 6
  stage_6_refinement: {
    modelId: 'xiaomi/mimo-v2-flash',
    fallbackModelId: 'google/gemini-2.5-flash',
    temperature: 0.7,
    maxTokens: 8000,
    maxContextTokens: 128000,
    qualityThreshold: null,
    maxRetries: 3,
    timeoutMs: null,
    tier: 'standard',
    source: 'hardcoded',
  },
  stage_6_section_expander: {
    modelId: 'xiaomi/mimo-v2-flash',
    fallbackModelId: 'google/gemini-2.5-flash',
    temperature: 0.7,
    maxTokens: 8000,
    maxContextTokens: 128000,
    qualityThreshold: null,
    maxRetries: 3,
    timeoutMs: null,
    tier: 'standard',
    source: 'hardcoded',
  },
  stage_6_patcher: {
    modelId: 'xiaomi/mimo-v2-flash',
    fallbackModelId: 'google/gemini-2.5-flash',
    temperature: 0.7,
    maxTokens: 4096,
    maxContextTokens: 128000,
    qualityThreshold: null,
    maxRetries: 3,
    timeoutMs: null,
    tier: 'standard',
    source: 'hardcoded',
  },
  stage_6_delta_judge: {
    modelId: 'xiaomi/mimo-v2-flash',
    fallbackModelId: 'google/gemini-2.5-flash',
    temperature: 0.3,
    maxTokens: 4096,
    maxContextTokens: 128000,
    qualityThreshold: null,
    maxRetries: 3,
    timeoutMs: null,
    tier: 'standard',
    source: 'hardcoded',
  },
  stage_6_arbiter: {
    modelId: 'xiaomi/mimo-v2-flash',
    fallbackModelId: 'google/gemini-2.5-flash',
    temperature: 0.3,
    maxTokens: 4096,
    maxContextTokens: 128000,
    qualityThreshold: null,
    maxRetries: 3,
    timeoutMs: null,
    tier: 'standard',
    source: 'hardcoded',
  },
  // Emergency & fallback
  emergency: {
    modelId: 'google/gemini-2.5-flash',
    fallbackModelId: 'xiaomi/mimo-v2-flash',
    temperature: 0.7,
    maxTokens: 4096,
    maxContextTokens: 128000,
    qualityThreshold: null,
    maxRetries: 3,
    timeoutMs: null,
    tier: 'standard',
    source: 'hardcoded',
  },
  quality_fallback: {
    modelId: 'openai/gpt-oss-120b',
    fallbackModelId: 'google/gemini-2.5-flash',
    temperature: 0.5,
    maxTokens: 8000,
    maxContextTokens: 128000,
    qualityThreshold: null,
    maxRetries: 3,
    timeoutMs: null,
    tier: 'standard',
    source: 'hardcoded',
  },
  global_default: {
    modelId: 'xiaomi/mimo-v2-flash',
    fallbackModelId: 'google/gemini-2.5-flash',
    temperature: 0.7,
    maxTokens: 4096,
    maxContextTokens: 128000,
    qualityThreshold: null,
    maxRetries: 3,
    timeoutMs: null,
    tier: 'standard',
    source: 'hardcoded',
  },
};
