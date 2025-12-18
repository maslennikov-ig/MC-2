/**
 * Model Configuration Service
 * @module shared/llm/model-config-service
 *
 * Provides database-driven model configuration using Stale-While-Revalidate pattern:
 * 1. Fresh cache (TTL < 5min) → return immediately
 * 2. Stale/miss → try database
 * 3. DB success → update cache → return fresh data
 * 4. DB failure + stale cache → return stale with WARNING log
 * 5. DB failure + no cache → throw explicit error (fail fast)
 *
 * Key principles:
 * - No hardcoded fallback in code - all configuration from database
 * - Stale cache is better than nothing - use last known good config during DB outage
 * - Explicit failure on cold start - better to fail fast than use outdated config
 * - Observable degradation - always log WARNING when using stale data
 *
 * Supports:
 * - Stage-based routing (Stages 3-6) with language and context tier selection
 * - Phase-based routing (legacy phases)
 * - Token-based tier selection (standard vs extended)
 * - Judge model configuration for CLEV voting
 *
 * @see https://datatracker.ietf.org/doc/html/rfc5861 Stale-While-Revalidate Pattern
 */

import { getSupabaseAdmin } from '../supabase/admin';
import logger from '../logger';
import type { Database } from '@megacampus/shared-types';
import { calculateContextThreshold, DEFAULT_CONTEXT_RESERVE } from '@megacampus/shared-types';
import { DOCUMENT_SIZE_THRESHOLD, STAGE4_CONTEXT_THRESHOLD } from './model-selector';

// ============================================================================
// TYPES
// ============================================================================

type LLMModelConfigRow = Database['public']['Tables']['llm_model_config']['Row'];

// ============================================================================
// DEFAULT VALUES
// ============================================================================

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
  /** Quality threshold for phase validation (0-1). NULL uses hardcoded default. */
  qualityThreshold: number | null;
  /** Maximum retry attempts for phase (0-10). Default 3. */
  maxRetries: number;
  /** Phase timeout in milliseconds. NULL means no timeout (infinite). */
  timeoutMs: number | null;
  /** Source of configuration */
  source: 'database' | 'hardcoded';
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

// ============================================================================
// CACHE IMPLEMENTATION - STALE-WHILE-REVALIDATE PATTERN
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Cache result with staleness indicator
 */
interface CacheResult<T> {
  /** Cached data */
  data: T;
  /** Whether the data is stale (past TTL) */
  isStale: boolean;
  /** Age of the cache entry in milliseconds */
  age: number;
}

/** Default fresh TTL: 5 minutes */
const DEFAULT_FRESH_TTL_MS = 5 * 60 * 1000;

/** Maximum age for cache entries: 24 hours (after which they are evicted) */
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Stale-While-Revalidate Cache Implementation
 *
 * Industry-standard pattern used by Netflix, Spotify, AWS for resilient configuration management.
 *
 * Key principles:
 * 1. Never auto-deletes stale entries within 24h - stale data is better than nothing
 * 2. Evicts entries older than 24h to prevent unbounded memory growth
 * 3. Returns staleness indicator so caller can decide to log warnings
 * 4. Supports explicit failure when no cache and DB unavailable
 *
 * Flow:
 * 1. Check cache: fresh (TTL < 5min) → return immediately
 * 2. Stale or miss → try database
 * 3. DB success → update cache → return fresh data
 * 4. DB failure + stale cache (< 24h) → return stale with WARNING
 * 5. DB failure + no cache or expired (> 24h) → explicit error
 */
class StaleWhileRevalidateCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly freshTTL: number;
  private readonly maxAge: number;

  constructor(freshTTLMs: number = DEFAULT_FRESH_TTL_MS, maxAgeMs: number = MAX_CACHE_AGE_MS) {
    this.freshTTL = freshTTLMs;
    this.maxAge = maxAgeMs;
  }

  /**
   * Get cached data with staleness indicator
   * Entries older than maxAge (24h) are evicted to prevent unbounded memory growth
   *
   * @param key - Cache key
   * @returns CacheResult with data, isStale flag, and age in ms, or null if not found/expired
   */
  get(key: string): CacheResult<T> | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;

    // Evict entries older than maxAge (24h) to prevent unbounded memory growth
    if (age > this.maxAge) {
      this.cache.delete(key);
      logger.info({ key, ageHours: Math.round(age / 3600000) }, 'Cache entry evicted (exceeded 24h max age)');
      return null;
    }

    const isStale = age > this.freshTTL;

    return {
      data: entry.data,
      isStale,
      age,
    };
  }

  /**
   * Store fresh data in cache
   *
   * @param key - Cache key
   * @param data - Data to cache
   */
  set(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if key has any data (fresh or stale, but not expired)
   *
   * @param key - Cache key
   * @returns true if valid data exists for this key
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const age = Date.now() - entry.timestamp;
    if (age > this.maxAge) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics for monitoring
   */
  getStats(): { size: number; oldestAgeMs: number } {
    let oldestAge = 0;
    const now = Date.now();

    for (const entry of this.cache.values()) {
      const age = now - entry.timestamp;
      if (age > oldestAge) {
        oldestAge = age;
      }
    }

    return {
      size: this.cache.size,
      oldestAgeMs: oldestAge,
    };
  }
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

class ModelConfigServiceImpl {
  private stageCache = new StaleWhileRevalidateCache<ModelConfigResult>();
  private phaseCache = new StaleWhileRevalidateCache<PhaseModelConfig>();
  private judgeCache = new StaleWhileRevalidateCache<JudgeModelsResult>();
  private reserveSettingsCache = new StaleWhileRevalidateCache<Map<string, number>>();

  /**
   * Get model configuration for stage-based routing (Stages 3-6)
   *
   * Uses Stale-While-Revalidate pattern:
   * 1. Fresh cache → return immediately
   * 2. Stale/miss → try database
   * 3. DB success → update cache → return fresh
   * 4. DB failure + stale cache → return stale with WARNING
   * 5. DB failure + no cache → throw explicit error
   *
   * @param stageNumber - Stage number (3, 4, 5, 6)
   * @param language - Content language ('ru' or 'en')
   * @param tokenCount - Total token count for tier selection
   * @returns Model configuration with primary/fallback models
   * @throws Error if database unavailable and no cached data exists
   */
  async getModelForStage(
    stageNumber: number,
    language: 'ru' | 'en',
    tokenCount: number
  ): Promise<ModelConfigResult> {
    // Determine tier based on token count and stage-specific thresholds
    const tier = await this.determineTierAsync(stageNumber, tokenCount, language);
    const cacheKey = `stage:${stageNumber}:${language}:${tier}`;

    // Step 1: Check cache - return fresh data immediately
    const cached = this.stageCache.get(cacheKey);
    if (cached && !cached.isStale) {
      logger.debug({ cacheKey, age: cached.age }, 'Stage config cache hit (fresh)');
      return cached.data;
    }

    // Step 2: Try database lookup
    try {
      const dbConfig = await this.fetchStageConfigFromDb(stageNumber, language, tier);
      if (dbConfig) {
        logger.info(
          {
            stageNumber,
            language,
            tier,
            primary: dbConfig.primary,
            source: 'database',
          },
          'Using fresh database stage config'
        );
        this.stageCache.set(cacheKey, dbConfig);
        return dbConfig;
      }
    } catch (err) {
      logger.error({ stageNumber, language, tier, error: err }, 'Database stage lookup failed');
    }

    // Step 3: Use stale cache if available
    if (cached) {
      const ageMinutes = Math.round(cached.age / 60000);
      logger.warn(
        { stageNumber, language, tier, ageMinutes, primary: cached.data.primary },
        'Using STALE stage config due to database error - DATA MAY BE OUTDATED'
      );
      return cached.data;
    }

    // Step 4: No cache, no database - explicit failure
    const errorMsg = `Cannot get stage config for stage ${stageNumber}, language "${language}", tier "${tier}": database unavailable and no cached data`;
    logger.fatal({ stageNumber, language, tier }, errorMsg);
    throw new Error(errorMsg);
  }

  /**
   * Get model configuration for phase-based routing (legacy)
   *
   * Uses Stale-While-Revalidate pattern:
   * 1. Fresh cache → return immediately
   * 2. Stale/miss → try database
   * 3. DB success → update cache → return fresh
   * 4. DB failure + stale cache → return stale with WARNING
   * 5. DB failure + no cache → throw explicit error
   *
   * @param phaseName - Phase name (e.g., 'stage_4_classification')
   * @param courseId - Optional course ID for course-specific overrides
   * @returns Phase model configuration
   * @throws Error if database unavailable and no cached data exists
   */
  async getModelForPhase(phaseName: string, courseId?: string): Promise<PhaseModelConfig> {
    const cacheKey = `phase:${phaseName}:${courseId || 'global'}`;

    // Step 1: Check cache - return fresh data immediately
    const cached = this.phaseCache.get(cacheKey);
    if (cached && !cached.isStale) {
      logger.debug({ cacheKey, age: cached.age }, 'Phase config cache hit (fresh)');
      return cached.data;
    }

    // Step 2: Try database lookup
    try {
      const dbConfig = await this.fetchPhaseConfigFromDb(phaseName, courseId);
      if (dbConfig) {
        logger.info(
          { phaseName, courseId, modelId: dbConfig.modelId, source: 'database' },
          'Using fresh database phase config'
        );
        this.phaseCache.set(cacheKey, dbConfig);
        return dbConfig;
      }
    } catch (err) {
      logger.error({ phaseName, courseId, error: err }, 'Database phase lookup failed');
    }

    // Step 3: Use stale cache if available
    if (cached) {
      const ageMinutes = Math.round(cached.age / 60000);
      logger.warn(
        { phaseName, courseId, ageMinutes, modelId: cached.data.modelId },
        'Using STALE phase config due to database error - DATA MAY BE OUTDATED'
      );
      return cached.data;
    }

    // Step 4: No cache, no database - explicit failure
    const errorMsg = `Cannot get phase config for "${phaseName}"${courseId ? ` (course: ${courseId})` : ''}: database unavailable and no cached data`;
    logger.fatal({ phaseName, courseId }, errorMsg);
    throw new Error(errorMsg);
  }

  /**
   * Get judge models configuration for Stage 6 CLEV voting
   *
   * Uses Stale-While-Revalidate pattern:
   * 1. Fresh cache → return immediately
   * 2. Stale/miss → try database (exact language, then 'any' fallback)
   * 3. DB success → update cache → return fresh
   * 4. DB failure + stale cache → return stale with WARNING
   * 5. DB failure + no cache → throw explicit error
   *
   * @param language - Content language ('ru', 'en', or other)
   * @returns Judge models with primary, secondary, and tiebreaker
   * @throws Error if database unavailable and no cached data exists
   */
  async getJudgeModels(language: string): Promise<JudgeModelsResult> {
    const cacheKey = `judges:${language}`;

    // Step 1: Check cache - return fresh data immediately
    const cached = this.judgeCache.get(cacheKey);
    if (cached && !cached.isStale) {
      logger.debug({ cacheKey, age: cached.age }, 'Judge config cache hit (fresh)');
      return cached.data;
    }

    // Step 2: Try database lookup with fallback logic:
    // 1. Try exact language match (e.g., 'ru')
    // 2. If not found, try 'any' as fallback
    try {
      const dbConfig = await this.fetchJudgeConfigsFromDb(language);
      if (dbConfig) {
        logger.info(
          {
            language,
            primary: dbConfig.primary.modelId,
            secondary: dbConfig.secondary.modelId,
            tiebreaker: dbConfig.tiebreaker.modelId,
            source: 'database',
          },
          'Using fresh database judge config'
        );
        this.judgeCache.set(cacheKey, dbConfig);
        return dbConfig;
      }
    } catch (err) {
      logger.error({ language, error: err }, 'Database judge lookup failed');
    }

    // Step 3: Use stale cache if available
    if (cached) {
      const ageMinutes = Math.round(cached.age / 60000);
      logger.warn(
        {
          language,
          ageMinutes,
          primary: cached.data.primary.modelId,
          secondary: cached.data.secondary.modelId,
          tiebreaker: cached.data.tiebreaker.modelId,
        },
        'Using STALE judge config due to database error - DATA MAY BE OUTDATED'
      );
      return cached.data;
    }

    // Step 4: No cache, no database - explicit failure
    const errorMsg = `Cannot get judge models for language "${language}": database unavailable and no cached data`;
    logger.fatal({ language }, errorMsg);
    throw new Error(errorMsg);
  }

  /**
   * Get context reserve percentage for a specific language
   *
   * Uses Stale-While-Revalidate pattern:
   * 1. Fresh cache → return immediately
   * 2. Stale/miss → try database
   * 3. DB success → update cache → return fresh
   * 4. DB failure + stale cache → return stale with WARNING
   * 5. DB failure + no cache → use DEFAULT_CONTEXT_RESERVE fallback
   *
   * @param language - Content language ('en', 'ru', or other)
   * @returns Reserve percentage (0-1)
   */
  async getContextReservePercent(language: string): Promise<number> {
    const cacheKey = 'context_reserve_settings';

    // Step 1: Check cache - return fresh data immediately
    const cached = this.reserveSettingsCache.get(cacheKey);
    if (cached && !cached.isStale) {
      const reservePercent = cached.data.get(language) ?? cached.data.get('any') ?? DEFAULT_CONTEXT_RESERVE.any;
      logger.debug({ language, reservePercent, source: 'cache' }, 'Context reserve percent (fresh cache)');
      return reservePercent;
    }

    // Step 2: Try database lookup
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('context_reserve_settings')
        .select('language, reserve_percent');

      if (error || !data) {
        logger.warn({ error }, 'Failed to fetch context reserve settings from database');

        // Step 3: Use stale cache if available
        if (cached) {
          const ageMinutes = Math.round(cached.age / 60000);
          const reservePercent = cached.data.get(language) ?? cached.data.get('any') ?? DEFAULT_CONTEXT_RESERVE.any;
          logger.warn(
            { language, reservePercent, ageMinutes },
            'Using STALE context reserve settings - DATA MAY BE OUTDATED'
          );
          return reservePercent;
        }

        // Step 4: No cache, no database - use hardcoded fallback
        const fallbackPercent = DEFAULT_CONTEXT_RESERVE[language as keyof typeof DEFAULT_CONTEXT_RESERVE] ?? DEFAULT_CONTEXT_RESERVE.any;
        logger.warn(
          { language, fallbackPercent },
          'Using hardcoded DEFAULT_CONTEXT_RESERVE fallback'
        );
        return fallbackPercent;
      }

      // Database success - update cache
      const settingsMap = new Map<string, number>();
      for (const setting of data) {
        settingsMap.set(setting.language, setting.reserve_percent);
      }

      this.reserveSettingsCache.set(cacheKey, settingsMap);
      const reservePercent = settingsMap.get(language) ?? settingsMap.get('any') ?? DEFAULT_CONTEXT_RESERVE.any;
      logger.debug({ language, reservePercent, source: 'database' }, 'Context reserve percent (fresh database)');
      return reservePercent;
    } catch (err) {
      logger.error({ err, language }, 'Error fetching context reserve settings');

      // Use stale cache if available
      if (cached) {
        const ageMinutes = Math.round(cached.age / 60000);
        const reservePercent = cached.data.get(language) ?? cached.data.get('any') ?? DEFAULT_CONTEXT_RESERVE.any;
        logger.warn(
          { language, reservePercent, ageMinutes },
          'Using STALE context reserve settings after error'
        );
        return reservePercent;
      }

      // No cache - use hardcoded fallback
      const fallbackPercent = DEFAULT_CONTEXT_RESERVE[language as keyof typeof DEFAULT_CONTEXT_RESERVE] ?? DEFAULT_CONTEXT_RESERVE.any;
      logger.warn(
        { language, fallbackPercent },
        'Using hardcoded fallback after error'
      );
      return fallbackPercent;
    }
  }

  /**
   * Calculate dynamic threshold based on model's max context and language-specific reserve
   *
   * Formula: threshold = maxContextTokens * (1 - reservePercent)
   *
   * Example:
   * - 128K model, EN (15% reserve) → 109K threshold
   * - 128K model, RU (25% reserve) → 96K threshold
   * - 200K model, EN (15% reserve) → 170K threshold
   *
   * @param maxContextTokens - Maximum context tokens supported by the model
   * @param language - Content language ('en', 'ru', or other)
   * @returns Dynamic threshold in tokens
   */
  async calculateDynamicThreshold(
    maxContextTokens: number,
    language: string
  ): Promise<number> {
    const reservePercent = await this.getContextReservePercent(language);
    const threshold = calculateContextThreshold(maxContextTokens, reservePercent);

    logger.debug({
      maxContextTokens,
      language,
      reservePercent,
      threshold,
    }, 'Dynamic threshold calculated');

    return threshold;
  }

  /**
   * Clear all caches (for testing/admin)
   */
  clearCache(): void {
    this.stageCache.clear();
    this.phaseCache.clear();
    this.judgeCache.clear();
    this.reserveSettingsCache.clear();
    logger.info('Model config caches cleared');
  }

  // ==========================================================================
  // PRIVATE METHODS - TIER DETERMINATION
  // ==========================================================================

  private determineTier(stageNumber: number, tokenCount: number): 'standard' | 'extended' {
    // Stage 4 uses its own threshold (260K)
    if (stageNumber === 4) {
      return tokenCount > STAGE4_CONTEXT_THRESHOLD ? 'extended' : 'standard';
    }

    // Other stages use general threshold (80K)
    return tokenCount > DOCUMENT_SIZE_THRESHOLD ? 'extended' : 'standard';
  }

  /**
   * Async tier determination using dynamic threshold calculation
   *
   * Uses language-specific context reserve percentages from database to calculate thresholds:
   * - Stage 4: 200K max context (analysis models)
   * - Other stages: 128K max context (standard models)
   *
   * Falls back to sync determineTier() if dynamic calculation fails.
   *
   * @param stageNumber - Stage number (3, 4, 5, 6)
   * @param tokenCount - Total token count
   * @param language - Content language ('ru' or 'en')
   * @returns Tier ('standard' or 'extended')
   */
  private async determineTierAsync(
    stageNumber: number,
    tokenCount: number,
    language: 'ru' | 'en'
  ): Promise<'standard' | 'extended'> {
    // Stage 4 uses analysis models with larger context (200K)
    // Other stages use standard models (128K)
    const maxContext = stageNumber === 4 ? 200000 : 128000;

    try {
      const dynamicThreshold = await this.calculateDynamicThreshold(maxContext, language);

      logger.debug({
        stageNumber,
        tokenCount,
        language,
        maxContext,
        dynamicThreshold,
        tier: tokenCount > dynamicThreshold ? 'extended' : 'standard',
      }, 'Dynamic tier determination');

      return tokenCount > dynamicThreshold ? 'extended' : 'standard';
    } catch (err) {
      logger.warn(
        { stageNumber, tokenCount, language, err },
        'Dynamic threshold calculation failed, trying DEFAULT_CONTEXT_RESERVE fallback'
      );

      // Step 1: Try language-aware fallback using DEFAULT_CONTEXT_RESERVE
      try {
        const reservePercent = DEFAULT_CONTEXT_RESERVE[language] ?? DEFAULT_CONTEXT_RESERVE.any;
        const fallbackThreshold = calculateContextThreshold(maxContext, reservePercent);

        logger.info({
          stageNumber,
          tokenCount,
          language,
          maxContext,
          reservePercent,
          fallbackThreshold,
          tier: tokenCount > fallbackThreshold ? 'extended' : 'standard',
        }, 'Using DEFAULT_CONTEXT_RESERVE for tier determination');

        return tokenCount > fallbackThreshold ? 'extended' : 'standard';
      } catch (fallbackErr) {
        // Step 2: Last resort - use hardcoded thresholds
        logger.error(
          { stageNumber, tokenCount, language, fallbackErr },
          'All fallbacks failed, using hardcoded thresholds as last resort'
        );
        return this.determineTier(stageNumber, tokenCount);
      }
    }
  }

  // ==========================================================================
  // PRIVATE METHODS - DATABASE LOOKUPS
  // ==========================================================================

  private async fetchStageConfigFromDb(
    stageNumber: number,
    language: 'ru' | 'en',
    tier: 'standard' | 'extended'
  ): Promise<ModelConfigResult | null> {
    const supabase = getSupabaseAdmin();

    // Use .select() to get all columns - Supabase types work better with '*'
    const { data, error } = await supabase
      .from('llm_model_config')
      .select()
      .eq('config_type', 'global')
      .eq('stage_number', stageNumber)
      .eq('language', language)
      .eq('context_tier', tier)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      logger.warn({ stageNumber, language, tier, error }, 'Error fetching stage config from DB');
      return null;
    }

    if (!data) {
      return null;
    }

    // Type assertion to help TypeScript recognize the full schema
    const config = data as LLMModelConfigRow;

    // Validate required fields - fail fast on incomplete data
    // This enforces data quality at the database level
    if (!config.fallback_model_id) {
      const errorMsg = `Incomplete stage config in database: missing fallback_model_id for stage ${stageNumber}, language "${language}", tier "${tier}"`;
      logger.error({ stageNumber, language, tier, modelId: config.model_id }, errorMsg);
      throw new Error(errorMsg);
    }

    if (!config.max_context_tokens) {
      const errorMsg = `Incomplete stage config in database: missing max_context_tokens for stage ${stageNumber}, language "${language}", tier "${tier}"`;
      logger.error({ stageNumber, language, tier, modelId: config.model_id }, errorMsg);
      throw new Error(errorMsg);
    }

    return {
      primary: config.model_id,
      fallback: config.fallback_model_id,
      maxContext: config.max_context_tokens,
      cacheReadEnabled: config.cache_read_enabled || false,
      tier,
      source: 'database',
    };
  }

  private async fetchPhaseConfigFromDb(
    phaseName: string,
    courseId?: string
  ): Promise<PhaseModelConfig | null> {
    const supabase = getSupabaseAdmin();

    // Priority 1: Course-specific override
    if (courseId) {
      const { data: courseOverride } = await supabase
        .from('llm_model_config')
        .select('model_id, fallback_model_id, temperature, max_tokens, quality_threshold, max_retries, timeout_ms')
        .eq('config_type', 'course_override')
        .eq('course_id', courseId)
        .eq('phase_name', phaseName)
        .eq('is_active', true)
        .maybeSingle();

      if (courseOverride) {
        return {
          modelId: courseOverride.model_id,
          fallbackModelId: courseOverride.fallback_model_id || null,
          temperature: courseOverride.temperature || 0.7,
          maxTokens: courseOverride.max_tokens || 4096,
          qualityThreshold: courseOverride.quality_threshold,
          maxRetries: courseOverride.max_retries ?? 3,
          timeoutMs: courseOverride.timeout_ms,
          source: 'database',
        };
      }
    }

    // Priority 2: Global default configuration
    const { data: globalConfig, error } = await supabase
      .from('llm_model_config')
      .select('model_id, fallback_model_id, temperature, max_tokens, quality_threshold, max_retries, timeout_ms')
      .eq('config_type', 'global')
      .eq('phase_name', phaseName)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      logger.warn({ phaseName, error }, 'Error fetching phase config from DB');
      return null;
    }

    if (!globalConfig) {
      return null;
    }

    return {
      modelId: globalConfig.model_id,
      fallbackModelId: globalConfig.fallback_model_id || null,
      temperature: globalConfig.temperature || 0.7,
      maxTokens: globalConfig.max_tokens || 4096,
      qualityThreshold: globalConfig.quality_threshold,
      maxRetries: globalConfig.max_retries ?? 3,
      timeoutMs: globalConfig.timeout_ms,
      source: 'database',
    };
  }

  private async fetchJudgeConfigsFromDb(language: string): Promise<JudgeModelsResult | null> {
    const supabase = getSupabaseAdmin();

    // Try exact language match first
    // eslint-disable-next-line prefer-const -- judgeConfigs is reassigned at line 610
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
          { language, error: fallbackResult.error },
          'No judge configs found for language or fallback'
        );
        return null;
      }

      judgeConfigs = fallbackResult.data;
    }

    // Type assertion to help TypeScript recognize the full schema
    const configs = judgeConfigs as LLMModelConfigRow[];

    // Map configs by judge_role
    const primary = configs.find((c) => c.judge_role === 'primary');
    const secondary = configs.find((c) => c.judge_role === 'secondary');
    const tiebreaker = configs.find((c) => c.judge_role === 'tiebreaker');

    // Validate all roles exist
    if (!primary || !secondary || !tiebreaker) {
      logger.warn(
        {
          language,
          foundRoles: configs.map((c) => c.judge_role),
        },
        'Missing judge roles in database'
      );
      return null;
    }

    return {
      primary: this.mapJudgeConfig(primary),
      secondary: this.mapJudgeConfig(secondary),
      tiebreaker: this.mapJudgeConfig(tiebreaker),
      source: 'database',
    };
  }

  private mapJudgeConfig(config: LLMModelConfigRow): JudgeModelConfig {
    return {
      modelId: config.model_id,
      weight: config.weight || 0.7,
      temperature: config.temperature || 0.3,
      maxTokens: config.max_tokens || 4096,
      displayName: config.primary_display_name || config.model_id,
      fallbackModelId: config.fallback_model_id || 'openai/gpt-oss-120b',
    };
  }

}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get effective stage config with defaults applied
 *
 * @param config - Phase config from database (may have null values)
 * @returns Config with defaults applied for null values
 */
export function getEffectiveStageConfig(config: PhaseModelConfig): {
  qualityThreshold: number;
  maxRetries: number;
  timeoutMs: number | null;
} {
  return {
    qualityThreshold: config.qualityThreshold ?? DEFAULT_STAGE_CONFIG.qualityThreshold,
    maxRetries: config.maxRetries ?? DEFAULT_STAGE_CONFIG.maxRetries,
    timeoutMs: config.timeoutMs ?? DEFAULT_STAGE_CONFIG.timeoutMs,
  };
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let serviceInstance: ModelConfigServiceImpl | null = null;

/**
 * Get the singleton ModelConfigService instance
 *
 * @returns ModelConfigService instance
 */
export function createModelConfigService(): ModelConfigServiceImpl {
  if (!serviceInstance) {
    serviceInstance = new ModelConfigServiceImpl();
  }
  return serviceInstance;
}

/**
 * Export type for external use
 */
export type ModelConfigService = ModelConfigServiceImpl;
