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
import { calculateContextThreshold, DEFAULT_CONTEXT_RESERVE } from '@megacampus/shared-types';
import { normalizeLanguageForReserve, type LanguageCode } from '@megacampus/shared-utils';
import { DOCUMENT_SIZE_THRESHOLD, STAGE4_CONTEXT_THRESHOLD } from './model-selector';

/** Emergency universal fallback model when DB config is unavailable */
const EMERGENCY_FALLBACK_MODEL = 'google/gemini-3-flash-preview';
import * as ModelConfigDB from './model-config-db';

// Re-export types and constants from model-config-db for backward compatibility
export type {
  ModelConfigResult,
  PhaseModelConfig,
  JudgeModelConfig,
  JudgeModelsResult,
} from './model-config-db';

import { DEFAULT_STAGE_CONFIG, DEFAULT_PHASE_CONFIGS } from './model-config-db';

export { DEFAULT_STAGE_CONFIG, DEFAULT_PHASE_CONFIGS };

/**
 * Detect missing chat phase configuration errors from model config service.
 * Supports both legacy ("has no config") and current ("has no active config") messages.
 */
export function isMissingChatPhaseConfigError(error: unknown): error is Error {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message;
  return (
    message.includes('Chat phase') &&
    (message.includes('has no config') || message.includes('no active config'))
  );
}

// ============================================================================
// TYPES
// ============================================================================

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
      logger.info(
        { key, ageHours: Math.round(age / 3600000) },
        'Cache entry evicted (exceeded 24h max age)'
      );
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
  private stageCache = new StaleWhileRevalidateCache<ModelConfigDB.ModelConfigResult>();
  private phaseCache = new StaleWhileRevalidateCache<ModelConfigDB.PhaseModelConfig>();
  private judgeCache = new StaleWhileRevalidateCache<ModelConfigDB.JudgeModelsResult>();
  // Reserve settings change rarely (admin action only) - use longer TTL
  private reserveSettingsCache = new StaleWhileRevalidateCache<Map<string, number>>(
    30 * 60 * 1000, // 30 minutes fresh TTL (vs 5 min for configs)
    24 * 60 * 60 * 1000 // 24 hours max age
  );

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
   * @param language - Content language (LanguageCode: 'ru', 'en', or any ISO 639-1 code)
   * @param tokenCount - Total token count for tier selection
   * @returns Model configuration with primary/fallback models
   * @throws Error if database unavailable and no cached data exists
   */
  async getModelForStage(
    stageNumber: number,
    language: LanguageCode,
    tokenCount: number
  ): Promise<ModelConfigDB.ModelConfigResult> {
    // Determine tier based on token count and stage-specific thresholds
    const tier = await this.determineTierAsync(stageNumber, tokenCount, language);
    const cacheKey = `stage:${stageNumber}:${language}:${tier}`;

    // Step 1: Check cache - return fresh data immediately
    const cached = this.stageCache.get(cacheKey);
    if (cached && !cached.isStale) {
      // Log extra info when cached data used fallback language
      if (cached.data.actualLanguage && cached.data.actualLanguage !== language) {
        logger.debug(
          {
            cacheKey,
            age: cached.age,
            requestedLanguage: language,
            actualLanguage: cached.data.actualLanguage,
          },
          'Stage config cache hit with fallback language'
        );
      } else {
        logger.debug({ cacheKey, age: cached.age }, 'Stage config cache hit (fresh)');
      }
      return cached.data;
    }

    // Step 2: Try database lookup
    try {
      const dbConfig = await ModelConfigDB.fetchStageConfigFromDb(stageNumber, language, tier);
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
   * Determines tier for phase with dynamic threshold calculation
   */
  private async determinePhaseTier(
    phaseName: string,
    courseId: string | undefined,
    tokenCount: number | undefined,
    language: LanguageCode | undefined
  ): Promise<{
    tier: 'standard' | 'extended';
    preloadedConfigs?: [
      ModelConfigDB.PhaseModelConfig | null,
      ModelConfigDB.PhaseModelConfig | null,
    ];
  }> {
    if (tokenCount === undefined) {
      return { tier: 'standard' };
    }

    // Parallel fetch both tiers to avoid N+1 query
    const [standardConfig, extendedConfig] = await Promise.all([
      ModelConfigDB.fetchPhaseConfigFromDb(phaseName, courseId, 'standard', language),
      ModelConfigDB.fetchPhaseConfigFromDb(phaseName, courseId, 'extended', language),
    ]);

    if (
      standardConfig &&
      standardConfig.maxContextTokens !== null &&
      standardConfig.maxContextTokens > 0
    ) {
      // Calculate dynamic threshold using language-specific reserve
      const lang = normalizeLanguageForReserve(language);
      const dynamicThreshold = await this.calculateDynamicThreshold(
        standardConfig.maxContextTokens,
        lang
      );

      const tier = tokenCount > dynamicThreshold ? 'extended' : 'standard';

      logger.debug(
        {
          phaseName,
          tokenCount,
          language: lang,
          maxContext: standardConfig.maxContextTokens,
          dynamicThreshold,
          selectedTier: tier,
        },
        'Dynamic tier determination for phase'
      );

      return { tier, preloadedConfigs: [standardConfig, extendedConfig] };
    } else {
      // Fallback to hardcoded threshold if no standard config found
      const tier = tokenCount > STAGE4_CONTEXT_THRESHOLD ? 'extended' : 'standard';
      logger.warn(
        {
          phaseName,
          tokenCount,
          fallbackThreshold: STAGE4_CONTEXT_THRESHOLD,
          selectedTier: tier,
        },
        'Using hardcoded threshold fallback - no standard tier config found'
      );
      return { tier };
    }
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
   * @param tokenCount - Optional token count for tier selection. If provided, selects
   *                     'extended' tier when > STAGE4_CONTEXT_THRESHOLD (260K), otherwise 'standard'.
   *                     If not provided, defaults to 'standard' tier.
   * @param language - Optional language code (LanguageCode: 'ru', 'en', or any ISO 639-1 code).
   *                   Falls back to 'any' for reserve calculation if not supported.
   * @returns Phase model configuration
   * @throws Error if database unavailable and no cached data exists
   */
  async getModelForPhase(
    phaseName: string,
    courseId?: string,
    tokenCount?: number,
    language?: LanguageCode
  ): Promise<ModelConfigDB.PhaseModelConfig> {
    // Step 0: Determine tier using dynamic threshold calculation
    const tierResult = await this.determinePhaseTier(phaseName, courseId, tokenCount, language);
    const tier = tierResult.tier;

    // Use pre-fetched config if available (optimization to avoid second DB query)
    if (tierResult.preloadedConfigs) {
      const [standardConfig, extendedConfig] = tierResult.preloadedConfigs;
      const selectedConfig = tier === 'extended' ? extendedConfig : standardConfig;
      if (selectedConfig) {
        const cacheKey = `phase:${phaseName}:${courseId || 'global'}:${tier}`;
        this.phaseCache.set(cacheKey, selectedConfig);
        return selectedConfig;
      }
    }

    const cacheKey = `phase:${phaseName}:${courseId || 'global'}:${tier}`;

    // Step 1: Check cache - return fresh data immediately
    const cached = this.phaseCache.get(cacheKey);
    if (cached && !cached.isStale) {
      // Log extra info when cached data used fallback language
      if (cached.data.actualLanguage && cached.data.actualLanguage !== language) {
        logger.debug(
          {
            cacheKey,
            age: cached.age,
            tier,
            requestedLanguage: language,
            actualLanguage: cached.data.actualLanguage,
          },
          'Phase config cache hit with fallback language'
        );
      } else {
        logger.debug({ cacheKey, age: cached.age, tier }, 'Phase config cache hit (fresh)');
      }
      return cached.data;
    }

    // Step 2: Try database lookup
    let dbReturnedNull = false;
    try {
      const dbConfig = await ModelConfigDB.fetchPhaseConfigFromDb(
        phaseName,
        courseId,
        tier,
        language
      );
      if (dbConfig) {
        logger.info(
          { phaseName, courseId, tier, tokenCount, modelId: dbConfig.modelId, source: 'database' },
          'Using fresh database phase config'
        );
        this.phaseCache.set(cacheKey, dbConfig);
        return dbConfig;
      }
      // DB was reachable but no config row found
      dbReturnedNull = true;
    } catch (err) {
      logger.error({ phaseName, courseId, tier, error: err }, 'Database phase lookup failed');
    }

    // Step 3: Chat phases with missing DB config must fail explicitly (no stale/hardcoded fallback)
    if (phaseName.startsWith('chat_') && dbReturnedNull) {
      const chatErrorMsg = `Chat phase "${phaseName}" has no active config in database. Seed the config before using chat.`;
      logger.error({ phaseName, courseId, tier, dbReturnedNull }, chatErrorMsg);
      throw new Error(chatErrorMsg);
    }

    // Step 4: Use stale cache if available
    if (cached) {
      const ageMinutes = Math.round(cached.age / 60000);
      logger.warn(
        { phaseName, courseId, tier, ageMinutes, modelId: cached.data.modelId },
        'Using STALE phase config due to database error - DATA MAY BE OUTDATED'
      );
      return cached.data;
    }

    // Step 5: Chat phases must NEVER use hardcoded/global fallback (plan:4.3)
    if (phaseName.startsWith('chat_')) {
      const chatErrorMsg = `Chat phase "${phaseName}" has no config: database unavailable and no cached config. Do NOT use hardcoded/global fallback for chat phases.`;
      logger.error({ phaseName, courseId, tier, dbReturnedNull }, chatErrorMsg);
      throw new Error(chatErrorMsg);
    }

    // Step 6: No cache, no database - try hardcoded fallback for non-chat phases
    const hardcodedConfig = DEFAULT_PHASE_CONFIGS[phaseName];
    if (hardcodedConfig) {
      logger.warn(
        { phaseName, courseId, tier, modelId: hardcodedConfig.modelId },
        'Using HARDCODED fallback config - database unavailable and no cache'
      );
      // Cache the hardcoded config to avoid repeated warnings
      this.phaseCache.set(cacheKey, hardcodedConfig);
      return hardcodedConfig;
    }

    // Step 7: Try global_default as last resort for non-chat phases
    const globalDefault = DEFAULT_PHASE_CONFIGS['global_default'];
    if (globalDefault) {
      logger.warn(
        { phaseName, courseId, tier, modelId: globalDefault.modelId },
        'Using global_default HARDCODED fallback - unknown phase and no cache'
      );
      this.phaseCache.set(cacheKey, globalDefault);
      return globalDefault;
    }

    // Step 8: Unknown phase, no fallback - explicit failure (should never happen)
    const errorMsg = `Cannot get phase config for "${phaseName}"${courseId ? ` (course: ${courseId})` : ''} tier "${tier}": database unavailable and no cached data`;
    logger.fatal({ phaseName, courseId, tier }, errorMsg);
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
   * @param language - Content language (LanguageCode: 'ru', 'en', or any ISO 639-1 code)
   * @returns Judge models with primary, secondary, and tiebreaker
   * @throws Error if database unavailable and no cached data exists
   */
  async getJudgeModels(language: LanguageCode): Promise<ModelConfigDB.JudgeModelsResult> {
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
      const dbConfig = await ModelConfigDB.fetchJudgeConfigsFromDb(language);
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
   * @param language - Content language (LanguageCode: 'ru', 'en', or any ISO 639-1 code)
   * @returns Reserve percentage (0-1)
   */
  async getContextReservePercent(language: LanguageCode): Promise<number> {
    const cacheKey = 'context_reserve_settings';

    // Step 1: Check cache - return fresh data immediately
    const cached = this.reserveSettingsCache.get(cacheKey);
    if (cached && !cached.isStale) {
      const reservePercent =
        cached.data.get(language) ?? cached.data.get('any') ?? DEFAULT_CONTEXT_RESERVE.any;
      logger.debug(
        { language, reservePercent, source: 'cache' },
        'Context reserve percent (fresh cache)'
      );
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
          const reservePercent =
            cached.data.get(language) ?? cached.data.get('any') ?? DEFAULT_CONTEXT_RESERVE.any;
          logger.warn(
            { language, reservePercent, ageMinutes },
            'Using STALE context reserve settings - DATA MAY BE OUTDATED'
          );
          return reservePercent;
        }

        // Step 4: No cache, no database - use hardcoded fallback
        const fallbackPercent =
          DEFAULT_CONTEXT_RESERVE[language as keyof typeof DEFAULT_CONTEXT_RESERVE] ??
          DEFAULT_CONTEXT_RESERVE.any;
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
      const reservePercent =
        settingsMap.get(language) ?? settingsMap.get('any') ?? DEFAULT_CONTEXT_RESERVE.any;
      logger.debug(
        { language, reservePercent, source: 'database' },
        'Context reserve percent (fresh database)'
      );
      return reservePercent;
    } catch (err) {
      logger.error({ err, language }, 'Error fetching context reserve settings');

      // Use stale cache if available
      if (cached) {
        const ageMinutes = Math.round(cached.age / 60000);
        const reservePercent =
          cached.data.get(language) ?? cached.data.get('any') ?? DEFAULT_CONTEXT_RESERVE.any;
        logger.warn(
          { language, reservePercent, ageMinutes },
          'Using STALE context reserve settings after error'
        );
        return reservePercent;
      }

      // No cache - use hardcoded fallback
      const fallbackPercent =
        DEFAULT_CONTEXT_RESERVE[language as keyof typeof DEFAULT_CONTEXT_RESERVE] ??
        DEFAULT_CONTEXT_RESERVE.any;
      logger.warn({ language, fallbackPercent }, 'Using hardcoded fallback after error');
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
   * @param language - Content language (LanguageCode: 'ru', 'en', or any ISO 639-1 code)
   * @returns Dynamic threshold in tokens
   */
  async calculateDynamicThreshold(
    maxContextTokens: number,
    language: LanguageCode
  ): Promise<number> {
    const reservePercent = await this.getContextReservePercent(language);
    const threshold = calculateContextThreshold(maxContextTokens, reservePercent);

    logger.debug(
      {
        maxContextTokens,
        language,
        reservePercent,
        threshold,
      },
      'Dynamic threshold calculated'
    );

    return threshold;
  }

  /**
   * Get Stage 4 tier configurations for Budget Allocator.
   *
   * Reads standard and extended tier configs from `llm_model_config` DB table
   * using `stage_4_scope` as the representative phase. Budget Allocator uses
   * these to determine context thresholds and model selection.
   *
   * Falls back to hardcoded STAGE4_CONTEXT_THRESHOLD / STAGE4_HARD_TOKEN_LIMIT
   * if database is unavailable.
   *
   * @param language - Content language (LanguageCode)
   * @returns Tier configurations with maxContext and cacheReadEnabled
   */
  async getStage4TierConfigs(language: LanguageCode): Promise<{
    standard: { modelId: string; fallbackModelId: string; maxContext: number };
    extended: { modelId: string; fallbackModelId: string; maxContext: number; cacheReadEnabled: boolean };
  }> {
    const representativePhase = 'stage_4_scope';

    try {
      const [standardConfig, extendedConfig] = await Promise.all([
        ModelConfigDB.fetchPhaseConfigFromDb(representativePhase, undefined, 'standard', language),
        ModelConfigDB.fetchPhaseConfigFromDb(representativePhase, undefined, 'extended', language),
      ]);

      const standard = standardConfig
        ? {
            modelId: standardConfig.modelId,
            fallbackModelId: standardConfig.fallbackModelId || standardConfig.modelId,
            maxContext: standardConfig.maxContextTokens || STAGE4_CONTEXT_THRESHOLD,
          }
        : (() => {
            logger.warn(
              { language, tier: 'standard' },
              `Stage 4 standard tier config is null, falling back to emergency model: ${EMERGENCY_FALLBACK_MODEL}`
            );
            return {
              modelId: EMERGENCY_FALLBACK_MODEL,
              fallbackModelId: EMERGENCY_FALLBACK_MODEL,
              maxContext: STAGE4_CONTEXT_THRESHOLD,
            };
          })();

      const extended = extendedConfig
        ? {
            modelId: extendedConfig.modelId,
            fallbackModelId: extendedConfig.fallbackModelId || extendedConfig.modelId,
            maxContext: extendedConfig.maxContextTokens || 1_000_000,
            cacheReadEnabled: false, // Phase configs don't carry cacheRead; safe default
          }
        : (() => {
            logger.warn(
              { language, tier: 'extended' },
              `Stage 4 extended tier config is null, falling back to emergency model: ${EMERGENCY_FALLBACK_MODEL}`
            );
            return {
              modelId: EMERGENCY_FALLBACK_MODEL,
              fallbackModelId: EMERGENCY_FALLBACK_MODEL,
              maxContext: 1_000_000,
              cacheReadEnabled: false,
            };
          })();

      logger.info(
        {
          language,
          standardModel: standard.modelId,
          standardMaxContext: standard.maxContext,
          extendedModel: extended.modelId,
          extendedMaxContext: extended.maxContext,
          source: 'database',
        },
        'Stage 4 tier configs loaded from database'
      );

      return { standard, extended };
    } catch (err) {
      logger.warn(
        { language, error: err instanceof Error ? err.message : String(err) },
        'Failed to load Stage 4 tier configs from DB, using hardcoded fallback'
      );

      return {
        standard: {
          modelId: EMERGENCY_FALLBACK_MODEL,
          fallbackModelId: EMERGENCY_FALLBACK_MODEL,
          maxContext: STAGE4_CONTEXT_THRESHOLD,
        },
        extended: {
          modelId: EMERGENCY_FALLBACK_MODEL,
          fallbackModelId: EMERGENCY_FALLBACK_MODEL,
          maxContext: 1_000_000,
          cacheReadEnabled: false,
        },
      };
    }
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
   * @param language - Content language (LanguageCode: 'ru', 'en', or any ISO 639-1 code)
   * @returns Tier ('standard' or 'extended')
   */
  private async determineTierAsync(
    stageNumber: number,
    tokenCount: number,
    language: LanguageCode
  ): Promise<'standard' | 'extended'> {
    // Stage 4 uses analysis models with larger context (200K)
    // Other stages use standard models (128K)
    const maxContext = stageNumber === 4 ? 200000 : 128000;

    try {
      const dynamicThreshold = await this.calculateDynamicThreshold(maxContext, language);

      logger.debug(
        {
          stageNumber,
          tokenCount,
          language,
          maxContext,
          dynamicThreshold,
          tier: tokenCount > dynamicThreshold ? 'extended' : 'standard',
        },
        'Dynamic tier determination'
      );

      return tokenCount > dynamicThreshold ? 'extended' : 'standard';
    } catch (err) {
      logger.warn(
        { stageNumber, tokenCount, language, err },
        'Dynamic threshold calculation failed, trying DEFAULT_CONTEXT_RESERVE fallback'
      );

      // Step 1: Try language-aware fallback using DEFAULT_CONTEXT_RESERVE
      try {
        const reserveLang = normalizeLanguageForReserve(language);
        const reservePercent = DEFAULT_CONTEXT_RESERVE[reserveLang];
        const fallbackThreshold = calculateContextThreshold(maxContext, reservePercent);

        logger.info(
          {
            stageNumber,
            tokenCount,
            language,
            maxContext,
            reservePercent,
            fallbackThreshold,
            tier: tokenCount > fallbackThreshold ? 'extended' : 'standard',
          },
          'Using DEFAULT_CONTEXT_RESERVE for tier determination'
        );

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
export function getEffectiveStageConfig(config: ModelConfigDB.PhaseModelConfig): {
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
// HELPER: MODEL RESOLUTION WITH FALLBACK
// ============================================================================

/**
 * Options for model resolution
 */
export interface ResolveModelOptions {
  /** Model from user settings (explicit override) - highest priority */
  settingsModel?: string;
  /** Phase name for database lookup */
  phaseName: string;
  /** Course ID for course-specific overrides */
  courseId?: string;
  /** Fallback model if all else fails */
  fallbackModel: string;
  /** Logger context for debugging */
  logContext?: Record<string, unknown>;
}

/**
 * Resolve model ID with priority: settings → database → fallback
 *
 * Optimization: skips database call entirely if settingsModel is provided.
 *
 * Priority order:
 * 1. settingsModel (user explicit override) - skip DB call
 * 2. database config (phaseConfig.modelId)
 * 3. fallbackModel (hardcoded default)
 *
 * @param options - Resolution options
 * @returns Resolved model ID
 *
 * @example
 * ```typescript
 * const model = await resolveModelWithFallback({
 *   settingsModel: settings.model as string | undefined,
 *   phaseName: 'stage_7_video',
 *   courseId: enrichmentContext.course.id,
 *   fallbackModel: DEFAULT_MODEL_ID,
 *   logContext: { lessonId, enrichmentId },
 * });
 * ```
 */
export async function resolveModelWithFallback(options: ResolveModelOptions): Promise<string> {
  const { settingsModel, phaseName, courseId, fallbackModel, logContext = {} } = options;

  // Priority 1: User explicitly set model in settings - use it directly, skip DB call
  if (settingsModel) {
    logger.debug(
      { ...logContext, model: settingsModel, source: 'settings' },
      'Using model from settings (explicit override)'
    );
    return settingsModel;
  }

  // Priority 2: Try to get from database config
  try {
    const modelConfigService = createModelConfigService();
    const phaseConfig = await modelConfigService.getModelForPhase(phaseName, courseId);
    const model = phaseConfig.modelId || fallbackModel;

    logger.debug(
      { ...logContext, model, source: phaseConfig.modelId ? 'database' : 'fallback', phaseName },
      'Model resolved from database config'
    );
    return model;
  } catch (configError) {
    // Priority 3: Database failed - use fallback
    logger.warn(
      {
        ...logContext,
        phaseName,
        fallbackModel,
        error: configError instanceof Error ? configError.message : String(configError),
      },
      'Failed to get model config from database, using fallback'
    );
    return fallbackModel;
  }
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
