/**
 * Model Configuration Bunker Service
 * @module shared/llm/model-config-bunker
 *
 * 5-layer resilient configuration service:
 * L1: Memory → L2: Redis → L3: LKG File → L4: Seed → L5: Database
 *
 * Design Principles:
 * - Stale data is better than no data
 * - Observable degradation (log warnings when using fallbacks)
 * - Fail fast on cold start with no fallback data
 * - All layers validated for schema compatibility
 *
 * Resolution Waterfall:
 * 1. Exact match: phase:tier:language
 * 2. Language fallback: phase:tier (any language)
 * 3. Tier fallback: phase:standard
 * 4. Global default: global_default:standard
 * 5. Emergency: emergency:extended or emergency:standard
 *
 * @see model-config-types.ts Type definitions
 */

import fs from 'fs/promises';
import { existsSync, copyFileSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

// ESM compatibility: __dirname is not available in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { getRedisClient } from '../cache/redis';
import { getSupabaseAdmin } from '../supabase/admin';
import logger from '../logger';
import type {
  PhaseModelConfig,
  ActiveConfig,
  ConfigMeta,
  ConfigSnapshot,
  BunkerHealth,
} from './model-config-types';

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

/**
 * Path to Last Known Good (LKG) configuration file
 * @default /app/data/lkg-config.json
 */
const LKG_PATH = process.env.LKG_CONFIG_PATH || '/app/data/lkg-config.json';

/**
 * Path to build-time seed artifact
 * @default {__dirname}/../../config/config-seed.json
 */
const SEED_PATH =
  process.env.SEED_CONFIG_PATH ||
  path.join(__dirname, '../../config/config-seed.json');

/**
 * Redis key for configuration snapshot
 */
const REDIS_KEY = 'llm_config_bunker_snapshot';

/**
 * Background sync interval (1 minute)
 */
const SYNC_INTERVAL_MS = 60_000;

/**
 * Database query timeout (10 seconds)
 * Prevents worker startup from hanging if Supabase is unresponsive
 */
const DB_QUERY_TIMEOUT_MS = 10_000;

/**
 * Circuit breaker threshold for invalid configs
 * Abort sync if this percentage of configs fail validation
 * @env BUNKER_INVALID_THRESHOLD (0.0-1.0, default: 0.2)
 */
const INVALID_THRESHOLD = (() => {
  const value = parseFloat(process.env.BUNKER_INVALID_THRESHOLD || '0.2');
  if (isNaN(value) || value < 0 || value > 1) {
    logger.warn(
      { value: process.env.BUNKER_INVALID_THRESHOLD, default: 0.2 },
      '[ModelConfigBunker] Invalid BUNKER_INVALID_THRESHOLD, using default'
    );
    return 0.2;
  }
  return value;
})();

/**
 * Minimum config count to prevent accidental drops
 * If cache has > CACHE_SIZE_THRESHOLD configs and sync returns < this, abort
 * @env BUNKER_MIN_CONFIG_COUNT (default: 5)
 */
const MIN_CONFIG_COUNT = (() => {
  const value = parseInt(process.env.BUNKER_MIN_CONFIG_COUNT || '5', 10);
  if (isNaN(value) || value < 1) {
    logger.warn(
      { value: process.env.BUNKER_MIN_CONFIG_COUNT, default: 5 },
      '[ModelConfigBunker] Invalid BUNKER_MIN_CONFIG_COUNT, using default'
    );
    return 5;
  }
  return value;
})();

/**
 * Cache size threshold for drop detection
 * Only check for suspicious drops if cache has more than this many configs
 * @env BUNKER_CACHE_SIZE_THRESHOLD (default: 10)
 */
const CACHE_SIZE_THRESHOLD = (() => {
  const value = parseInt(process.env.BUNKER_CACHE_SIZE_THRESHOLD || '10', 10);
  if (isNaN(value) || value < 1) {
    logger.warn(
      { value: process.env.BUNKER_CACHE_SIZE_THRESHOLD, default: 10 },
      '[ModelConfigBunker] Invalid BUNKER_CACHE_SIZE_THRESHOLD, using default'
    );
    return 10;
  }
  return value;
})();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Zod schema for database config row validation
 *
 * Validates all 14 fields from PhaseModelConfig interface:
 * - Core fields: phase_name, context_tier, model_id, fallback_model_id
 * - LLM parameters: temperature (0-2), max_tokens (≤200K), max_context_tokens (≤2M)
 * - Quality gates: quality_threshold (0-1), max_retries (0-10), timeout_ms
 * - Multi-judge: judge_role (primary/secondary/tiebreaker), weight (0-1)
 * - Metadata: language, stage_number (2-6)
 *
 * Handles database string-to-number conversions for numeric fields.
 */
const ConfigRowSchema = z.object({
  phase_name: z.string().min(1),
  context_tier: z.enum(['standard', 'extended']).nullable(),
  model_id: z.string().min(1),
  fallback_model_id: z.string().nullable(),
  temperature: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === 'string' ? parseFloat(v) : v))
    .pipe(z.number().min(0).max(2))
    .nullable(),
  max_tokens: z.number().int().positive().max(200000).nullable(),
  max_context_tokens: z.number().int().positive().max(2000000).nullable(),
  quality_threshold: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === 'string' ? parseFloat(v) : v))
    .pipe(z.number().min(0).max(1))
    .nullable()
    .optional(),
  max_retries: z.number().int().min(0).max(10).nullable().optional(),
  timeout_ms: z.number().int().positive().nullable().optional(),
  language: z.string().optional(),
  stage_number: z.number().int().min(2).max(6).nullable().optional(),
  judge_role: z.enum(['primary', 'secondary', 'tiebreaker']).nullable().optional(),
  weight: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === 'string' ? parseFloat(v) : v))
    .pipe(z.number().min(0).max(1))
    .nullable()
    .optional(),
});

/**
 * Type inferred from ConfigRowSchema after Zod validation
 * Used for type-safe access to validated config rows
 */
type ValidatedConfigRow = z.infer<typeof ConfigRowSchema>;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Build cache key from config row
 *
 * Key format: "phase:tier" or "phase:tier:language"
 * Language is omitted if it's "any" to enable fallback matching
 * context_tier defaults to "standard" if null
 *
 * @param row Config row with phase_name, context_tier, and optional language
 * @returns Cache key string
 *
 * @example
 * buildKey({ phase_name: 'stage_2_standard', context_tier: 'standard', language: 'ru' })
 * // => 'stage_2_standard:standard:ru'
 *
 * @example
 * buildKey({ phase_name: 'global_default', context_tier: 'standard', language: 'any' })
 * // => 'global_default:standard'
 *
 * @example
 * buildKey({ phase_name: 'emergency', context_tier: null, language: 'any' })
 * // => 'emergency:standard'
 */
function buildKey(row: {
  phase_name: string;
  context_tier: string | null;
  language?: string | null;
}): string {
  const tier = row.context_tier || 'standard';
  return row.language && row.language !== 'any'
    ? `${row.phase_name}:${tier}:${row.language}`
    : `${row.phase_name}:${tier}`;
}

/**
 * Safely parse a numeric value from database
 *
 * Handles string-to-number conversion with NaN validation to prevent
 * cache corruption from invalid database values.
 *
 * @param value - Raw value from database (string, number, null, or undefined)
 * @param fieldName - Field name for error logging
 * @param phaseName - Phase name for error context
 * @returns Parsed number or null if invalid/missing
 */
function parseFloatSafe(
  value: unknown,
  fieldName: string,
  phaseName: string
): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (isNaN(parsed)) {
    logger.error(
      { value, fieldName, phaseName },
      '[ModelConfigBunker] Invalid numeric value detected, using null'
    );
    return null;
  }
  return parsed;
}

/**
 * Convert validated database row to PhaseModelConfig
 *
 * Handles type conversions and optional fields:
 * - Parses string numbers to floats (temperature, quality_threshold, weight)
 * - Preserves null values for optional fields
 * - Maps database columns to typed interface
 * - Defaults context_tier to 'standard' if null
 *
 * @param row Zod-validated database row (already passed ConfigRowSchema validation)
 * @returns Typed PhaseModelConfig object
 */
function rowToConfig(row: ValidatedConfigRow): PhaseModelConfig {
  const phaseName = row.phase_name;
  return {
    phase_name: phaseName,
    context_tier: row.context_tier || 'standard',
    model_id: row.model_id,
    fallback_model_id: row.fallback_model_id,
    // temperature is required (not nullable), so fall back to 0.7 if invalid
    temperature: parseFloatSafe(row.temperature, 'temperature', phaseName) ?? 0.7,
    max_tokens: row.max_tokens || 4096,
    max_context_tokens: row.max_context_tokens ?? null,
    quality_threshold: parseFloatSafe(row.quality_threshold, 'quality_threshold', phaseName),
    max_retries: row.max_retries ?? null,
    timeout_ms: row.timeout_ms ?? null,
    language: row.language,
    stage_number: row.stage_number ?? null,
    judge_role: row.judge_role ?? null,
    weight: parseFloatSafe(row.weight, 'weight', phaseName),
  };
}

// ============================================================================
// MODEL CONFIG BUNKER CLASS
// ============================================================================

/**
 * ModelConfigBunker - Resilient 5-layer configuration service
 *
 * Provides zero-latency, fault-tolerant access to LLM model configurations
 * using a hierarchical caching strategy with graceful degradation.
 *
 * Layer Architecture:
 * - L1 (Memory): In-memory Map cache for zero-latency reads
 * - L2 (Redis): Distributed cache shared across workers
 * - L3 (LKG File): Last Known Good file surviving Redis outages
 * - L4 (Seed): Build-time artifact baked into Docker image
 * - L5 (Database): Source of truth (Supabase llm_model_config table)
 *
 * Usage:
 * ```typescript
 * const bunker = await initializeModelConfigBunker();
 * const config = bunker.get('stage_4_classification', 'standard', 'ru');
 * ```
 *
 * @example
 * // Initialize at startup
 * await initializeModelConfigBunker();
 *
 * // Get config (synchronous, zero-latency)
 * const bunker = getModelConfigBunker();
 * const config = bunker.get('stage_6_judge', 'extended', 'en');
 *
 * // Health check
 * const health = bunker.getHealth();
 * if (!health.healthy) {
 *   logger.warn({ health }, 'Config bunker degraded');
 * }
 */
export class ModelConfigBunker {
  /**
   * L1: In-memory cache (zero-latency access)
   *
   * Key format: "phase:tier" or "phase:tier:language"
   *
   * Memory Characteristics:
   * - This Map never evicts entries during runtime
   * - Expected size: ~50-100 configs maximum
   * - Memory footprint: ~10KB per config, ~500KB-1MB total (negligible)
   *
   * Growth Constraints:
   * - Only global configs are cached (config_type='global')
   * - Per-course configs are NOT cached here (handled separately)
   * - Phase names are fixed by schema CHECK constraint
   *
   * If config space ever grows unbounded (e.g., dynamic phase generation),
   * implement LRU eviction or consider alternative caching strategy.
   *
   * @see CACHE_SIZE_THRESHOLD Circuit breaker for suspicious drops
   */
  private cache = new Map<string, PhaseModelConfig>();

  /**
   * Unix timestamp (milliseconds) when cache was last updated
   * Used for staleness detection and health checks
   */
  private cacheUpdatedAt = 0;

  /**
   * Initialization flag to prevent duplicate startup
   */
  private isReady = false;

  /**
   * Background sync timer for periodic database updates
   */
  private syncTimer: NodeJS.Timeout | null = null;

  /**
   * Count of consecutive sync failures
   */
  private syncRetries = 0;

  /**
   * Count of consecutive Redis write failures
   */
  private redisWriteFailures = 0;

  /**
   * Count of consecutive LKG file write failures
   */
  private lkgWriteFailures = 0;

  /**
   * Threshold for escalating write failures to error level
   */
  private readonly MAX_WRITE_FAILURES_BEFORE_ERROR = 3;

  /**
   * Maximum retry attempts before pausing background sync
   */
  private readonly MAX_SYNC_RETRIES = 5;

  /**
   * Base delay for exponential backoff (1 minute)
   */
  private readonly BASE_RETRY_DELAY_MS = 60_000;

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize the ModelConfigBunker
   *
   * Startup sequence:
   * 1. Ensure LKG file exists (copy from Seed on cold start)
   * 2. Load from disk (L3/L4) - fastest and safest
   * 3. Try to freshen from Redis (L2) - best effort
   * 4. Try to sync from Database (L5) - best effort
   * 5. Validate minimum config count (circuit breaker)
   * 6. Start background sync timer
   *
   * @throws Error if no configs loaded (critical failure)
   */
  async initialize(): Promise<void> {
    logger.info('[ModelConfigBunker] Starting initialization...');

    try {
      // A. Ensure LKG exists. If not (fresh install), copy from Seed.
      if (!existsSync(LKG_PATH) && existsSync(SEED_PATH)) {
        logger.info(
          '[ModelConfigBunker] Cold Start: Initializing LKG from Build Seed.'
        );
        try {
          const dir = path.dirname(LKG_PATH);
          await fs.mkdir(dir, { recursive: true });
          copyFileSync(SEED_PATH, LKG_PATH);
        } catch (e) {
          logger.warn(
            { error: e },
            '[ModelConfigBunker] Could not copy seed to LKG path'
          );
        }
      }

      // B. Load from Disk (Fastest & Safest)
      this.loadFromDisk();

      // C. Try to freshen from Redis (Best Effort)
      try {
        await this.loadFromRedis();
      } catch {
        logger.warn(
          '[ModelConfigBunker] Redis unavailable during startup, using disk cache'
        );
      }

      // D. Try to sync from DB (Best Effort)
      try {
        await this.syncFromDatabase();
      } catch {
        logger.warn(
          '[ModelConfigBunker] DB unreachable at startup. Running on LKG data.'
        );
      }

      // E. Validate we have minimum required configs
      if (this.cache.size === 0) {
        throw new Error('CRITICAL: No configs loaded. Cannot start worker.');
      }

      // F. Start Background Sync
      this.syncTimer = setInterval(() => {
        this.syncFromDatabase().catch((err) => {
          logger.error(
            { error: err },
            '[ModelConfigBunker] Background sync failed'
          );
        });
      }, SYNC_INTERVAL_MS);

      this.isReady = true;
      logger.info(
        { configCount: this.cache.size },
        '[ModelConfigBunker] Ready'
      );
    } catch (err) {
      // Clean up timer if initialization fails to prevent memory leak
      if (this.syncTimer) {
        clearInterval(this.syncTimer);
        this.syncTimer = null;
      }
      logger.error(
        { error: err },
        '[ModelConfigBunker] Initialization failed, resources cleaned up'
      );
      throw err; // Re-throw after cleanup
    }
  }

  /**
   * Shutdown the ModelConfigBunker gracefully
   *
   * Cleans up resources:
   * - Stops background sync timer to prevent further DB queries
   * - Logs shutdown completion for observability
   *
   * Call this during application shutdown (e.g., SIGTERM handler)
   * to ensure clean resource cleanup.
   *
   * @example
   * // In signal handler
   * process.on('SIGTERM', () => {
   *   const bunker = getModelConfigBunker();
   *   if (bunker.isInitialized()) {
   *     bunker.shutdown();
   *   }
   *   process.exit(0);
   * });
   */
  shutdown(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    logger.info('[ModelConfigBunker] Shutdown complete');
  }

  /**
   * Restart background sync after it was paused due to max retries
   * Call this after fixing the underlying database issue
   */
  restartBackgroundSync(): void {
    if (this.syncTimer) {
      return; // Already running
    }

    this.syncRetries = 0;
    this.syncTimer = setInterval(() => {
      this.syncFromDatabase().catch((err) => {
        logger.error({ error: err }, '[ModelConfigBunker] Background sync failed');
      });
    }, SYNC_INTERVAL_MS);

    logger.info('[ModelConfigBunker] Background sync restarted');
  }

  // ==========================================================================
  // READ PATH (Synchronous, Zero-Latency)
  // ==========================================================================

  /**
   * Get config with Resolution Waterfall
   *
   * Resolution order:
   * 1. Exact match: {phase}:{tier}:{lang}
   * 2. Language fallback: {phase}:{tier}
   * 3. Tier fallback: {phase}:standard
   * 4. Global default: global_default:standard
   *
   * @param phase Phase name (e.g., 'stage_4_classification')
   * @param tier Context tier ('standard' or 'extended')
   * @param lang Language code (e.g., 'ru', 'en', 'any')
   * @returns Active config with metadata
   * @throws Error if no config can be resolved
   *
   * @example
   * // Exact match
   * const config = bunker.get('stage_2_standard', 'standard', 'ru');
   * // Returns: stage_2_standard:standard:ru with resolution='exact'
   *
   * @example
   * // Language fallback
   * const config = bunker.get('stage_4_classification', 'standard', 'fr');
   * // Returns: stage_4_classification:standard with resolution='fallback_lang'
   *
   * @example
   * // Global default fallback
   * const config = bunker.get('unknown_phase', 'extended', 'en');
   * // Returns: global_default:standard with resolution='global_default'
   */
  get(
    phase: string,
    tier: 'standard' | 'extended' = 'standard',
    lang: string = 'any'
  ): ActiveConfig {
    const now = Date.now();

    // Resolution Waterfall
    const candidates = [
      `${phase}:${tier}:${lang}`, // Exact: stage_2_standard:standard:ru
      `${phase}:${tier}`, // Language fallback: stage_2_standard:standard
      `${phase}:standard`, // Tier fallback
      'global_default:standard', // Global safety net
    ];

    for (const key of candidates) {
      const config = this.cache.get(key);
      if (config) {
        const meta: ConfigMeta = {
          source: 'memory_l1',
          resolution:
            key === candidates[0]
              ? 'exact'
              : key.includes('global')
                ? 'global_default'
                : key === `${phase}:${tier}`
                  ? 'fallback_lang'
                  : 'fallback_tier',
          fetched_at: now,
          config_age_sec: Math.floor((now - this.cacheUpdatedAt) / 1000),
        };
        return { ...config, _meta: meta };
      }
    }

    throw new Error(
      `Config Resolution Failed: ${phase}:${tier}:${lang}. Cache has ${this.cache.size} entries.`
    );
  }

  /**
   * Get Emergency config (The Parachute)
   *
   * Used when all other configs fail or for emergency fallback scenarios.
   * Tries extended tier first, then standard tier.
   *
   * @returns Emergency config with metadata
   * @throws Error if emergency config missing (critical failure)
   *
   * @example
   * try {
   *   const config = bunker.get(phase, tier, lang);
   * } catch (err) {
   *   logger.error('Config resolution failed, using emergency config');
   *   const config = bunker.getEmergency();
   * }
   */
  getEmergency(): ActiveConfig {
    const config =
      this.cache.get('emergency:extended') ||
      this.cache.get('emergency:standard');
    if (!config) {
      throw new Error('CRITICAL: Emergency config missing.');
    }
    return {
      ...config,
      _meta: {
        source: 'memory_l1',
        resolution: 'exact',
        fetched_at: Date.now(),
        config_age_sec: Math.floor(
          (Date.now() - this.cacheUpdatedAt) / 1000
        ),
      },
    };
  }

  // ==========================================================================
  // SYNC PATH (Background, Robust)
  // ==========================================================================

  /**
   * Sync configuration from database
   *
   * Process:
   * 1. Fetch all active configs from llm_model_config table
   * 2. Validate each config with Zod schema
   * 3. Build snapshot object (key-value pairs)
   * 4. Circuit breaker checks:
   *    - Abort if >20% configs invalid
   *    - Abort if suspicious config drop (cache has >10, sync returns <5)
   * 5. Update all layers (L1, L2, L3) atomically
   *
   * @private
   */
  private async syncFromDatabase(): Promise<void> {
    try {
      const supabase = getSupabaseAdmin();

      // Wrap query with timeout to prevent hanging if Supabase is unresponsive
      const queryPromise = supabase
        .from('llm_model_config')
        .select('*')
        .eq('is_active', true);

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('[ModelConfigBunker] Database query timeout after 10s')),
          DB_QUERY_TIMEOUT_MS
        )
      );

      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

      if (error) throw error;
      if (!data?.length) {
        logger.warn(
          '[ModelConfigBunker] DB returned empty config list, preserving cache'
        );
        return;
      }

      // Validate and build snapshot
      const snapshot: Record<string, PhaseModelConfig> = {};
      let validCount = 0;
      let rejectCount = 0;

      for (const row of data) {
        const result = ConfigRowSchema.safeParse(row);
        if (result.success) {
          const key = buildKey(result.data);
          snapshot[key] = rowToConfig(result.data);
          validCount++;
        } else {
          rejectCount++;
          logger.error(
            {
              phase: row.phase_name,
              model_id: row.model_id,
              tier: row.context_tier,
              language: row.language,
              errors: result.error.errors.map((e: { path: (string | number)[]; message: string; code: string }) => ({
                path: e.path.join('.'),
                message: e.message,
                code: e.code
              }))
            },
            '[ModelConfigBunker] Config validation failed'
          );
        }
      }

      // Circuit Breaker: Reject if >20% configs invalid
      if (rejectCount > data.length * INVALID_THRESHOLD) {
        logger.error(
          { rejectCount, total: data.length, threshold: INVALID_THRESHOLD },
          '[ModelConfigBunker] SYNC ABORTED: >20% configs invalid.'
        );
        return;
      }

      // Circuit Breaker: Prevent suspicious config drops
      if (
        this.cache.size > CACHE_SIZE_THRESHOLD &&
        validCount < MIN_CONFIG_COUNT
      ) {
        logger.error(
          {
            cacheSize: this.cache.size,
            validCount,
            minRequired: MIN_CONFIG_COUNT,
          },
          '[ModelConfigBunker] SYNC ABORTED: Suspicious config drop.'
        );
        return;
      }

      await this.updateAllLayers(snapshot);

      // Reset retry counter on successful sync
      this.syncRetries = 0;

      logger.info(
        { count: validCount, rejected: rejectCount },
        '[ModelConfigBunker] Sync completed'
      );
    } catch (err) {
      this.syncRetries++;

      if (this.syncRetries >= this.MAX_SYNC_RETRIES) {
        logger.error(
          { retries: this.syncRetries, maxRetries: this.MAX_SYNC_RETRIES },
          '[ModelConfigBunker] Max sync retries reached, pausing background sync'
        );
        // Stop timer until manual intervention
        if (this.syncTimer) {
          clearInterval(this.syncTimer);
          this.syncTimer = null;
        }
      } else {
        // Exponential backoff: 1m, 2m, 4m, 8m, 16m
        const delayMs = this.BASE_RETRY_DELAY_MS * Math.pow(2, this.syncRetries - 1);
        logger.warn(
          { retries: this.syncRetries, nextRetryInSec: Math.round(delayMs / 1000) },
          '[ModelConfigBunker] Sync failed, will retry with backoff'
        );

        // Restart timer with new delay (atomic swap to prevent race condition)
        if (this.syncTimer) {
          clearInterval(this.syncTimer);
        }
        // Always create new timer after clearing - ensures no window where timer is null
        this.syncTimer = setInterval(() => {
          this.syncFromDatabase().catch(() => {
            // Error already logged in syncFromDatabase
          });
        }, delayMs);
      }

      logger.error({ error: err }, '[ModelConfigBunker] DB sync failed');
    }
  }

  /**
   * Update all cache layers atomically
   *
   * Updates in order:
   * 1. L1 (Memory): Clear and repopulate Map
   * 2. L2 (Redis): Store snapshot with timestamp
   * 3. L3 (LKG File): Atomic write via .tmp rename
   *
   * @param snapshot Validated config snapshot
   * @private
   */
  private async updateAllLayers(
    snapshot: Record<string, PhaseModelConfig>
  ): Promise<void> {
    const now = Date.now();

    // L1: Update Memory
    this.cache.clear();
    for (const [key, config] of Object.entries(snapshot)) {
      this.cache.set(key, config);
    }
    this.cacheUpdatedAt = now;

    // L2: Update Redis (best effort)
    try {
      const redis = getRedisClient();
      await redis.set(
        REDIS_KEY,
        JSON.stringify({ data: snapshot, updatedAt: now })
      );
      this.redisWriteFailures = 0; // Reset on success
    } catch (error) {
      this.redisWriteFailures++;
      if (this.redisWriteFailures >= this.MAX_WRITE_FAILURES_BEFORE_ERROR) {
        logger.error(
          { failures: this.redisWriteFailures, error },
          '[ModelConfigBunker] Redis write failing persistently'
        );
      } else {
        logger.warn(
          { failures: this.redisWriteFailures, error },
          '[ModelConfigBunker] Failed to update Redis cache'
        );
      }
    }

    // L3: Update LKG File (atomic write with verification)
    try {
      const dir = path.dirname(LKG_PATH);
      await fs.mkdir(dir, { recursive: true });
      const content = JSON.stringify(
        { data: snapshot, updatedAt: now },
        null,
        2
      );
      const tmpPath = `${LKG_PATH}.tmp`;

      // Write to temp file
      await fs.writeFile(tmpPath, content, 'utf-8');

      // Verify file was written correctly
      const stat = await fs.stat(tmpPath);
      const expectedSize = Buffer.byteLength(content, 'utf-8');

      if (stat.size !== expectedSize) {
        // Clean up temp file before throwing
        await fs.unlink(tmpPath).catch(() => {
          // Ignore cleanup errors - temp file will be overwritten next time
        });
        throw new Error(
          `File write verification failed: expected ${expectedSize} bytes, got ${stat.size}`
        );
      }

      // Atomic rename (overwrites existing file)
      await fs.rename(tmpPath, LKG_PATH);

      this.lkgWriteFailures = 0; // Reset on success
    } catch (error) {
      this.lkgWriteFailures++;
      if (this.lkgWriteFailures >= this.MAX_WRITE_FAILURES_BEFORE_ERROR) {
        logger.error(
          { failures: this.lkgWriteFailures, error },
          '[ModelConfigBunker] LKG file write failing persistently'
        );
      } else {
        logger.warn(
          { failures: this.lkgWriteFailures, error },
          '[ModelConfigBunker] Failed to update LKG file'
        );
      }
    }
  }

  /**
   * Load configuration from Redis (L2)
   *
   * Best effort load:
   * - Fetches snapshot from Redis
   * - Parses JSON and validates structure
   * - Validates each config with Zod schema
   * - Loads valid configs into memory cache
   * - Updates cache timestamp only if majority valid
   * - Silent failure if Redis unavailable
   *
   * @private
   */
  private async loadFromRedis(): Promise<void> {
    const redis = getRedisClient();
    const raw = await redis.get(REDIS_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as unknown;

      // Validate snapshot structure
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !('data' in parsed) ||
        !('updatedAt' in parsed) ||
        typeof (parsed as Record<string, unknown>).updatedAt !== 'number'
      ) {
        logger.error('[ModelConfigBunker] Invalid Redis snapshot structure, skipping');
        return;
      }

      const { data, updatedAt } = parsed as ConfigSnapshot;
      let validCount = 0;
      let invalidCount = 0;

      for (const [key, configData] of Object.entries(data)) {
        const result = ConfigRowSchema.safeParse(configData);
        if (result.success) {
          this.cache.set(key, configData);
          validCount++;
        } else {
          invalidCount++;
          logger.warn(
            { key, errors: result.error.errors },
            '[ModelConfigBunker] Invalid config in Redis, skipping'
          );
        }
      }

      // Only update timestamp if majority of configs valid
      if (validCount > invalidCount) {
        this.cacheUpdatedAt = updatedAt;
      }

      logger.info(
        { count: validCount, rejected: invalidCount, source: 'redis' },
        '[ModelConfigBunker] Loaded from Redis'
      );
    } catch (err) {
      logger.error(
        { error: err },
        '[ModelConfigBunker] Failed to parse Redis snapshot'
      );
    }
  }

  /**
   * Load configuration from disk (L3/L4)
   *
   * Loading priority:
   * 1. LKG file (/app/data/lkg-config.json) if exists
   * 2. Seed artifact (src/config/config-seed.json) as fallback
   *
   * Handles two formats:
   * - Snapshot format: { data: {...}, updatedAt: number }
   * - Seed format: array of config rows
   *
   * @private
   */
  private loadFromDisk(): void {
    const diskPath = existsSync(LKG_PATH) ? LKG_PATH : SEED_PATH;
    if (!existsSync(diskPath)) {
      logger.warn('[ModelConfigBunker] No disk cache available');
      return;
    }

    try {
      const raw = readFileSync(diskPath, 'utf-8');
      const parsed = JSON.parse(raw) as
        | ConfigSnapshot
        | Array<Record<string, unknown>>;

      // Handle both formats: { data: {...} } and raw array
      if (Array.isArray(parsed)) {
        // Seed format: array of rows
        let validCount = 0;
        let invalidCount = 0;

        for (const row of parsed) {
          const result = ConfigRowSchema.safeParse(row);
          if (result.success) {
            const key = buildKey(result.data);
            this.cache.set(key, rowToConfig(result.data));
            validCount++;
          } else {
            invalidCount++;
            logger.warn(
              { phase: (row as Record<string, unknown>).phase_name, errors: result.error.errors },
              '[ModelConfigBunker] Invalid config in disk file, skipping'
            );
          }
        }

        // Circuit breaker: fail if too many invalid
        if (invalidCount > 0 && invalidCount > parsed.length * INVALID_THRESHOLD) {
          logger.error(
            { validCount, invalidCount, threshold: INVALID_THRESHOLD },
            '[ModelConfigBunker] Disk cache corrupted: too many invalid configs'
          );
          // Clear cache to force fallback to other layers
          this.cache.clear();
        }

        this.cacheUpdatedAt = Date.now();
        const source = diskPath === SEED_PATH ? 'seed_artifact' : 'lkg_disk';
        logger.info(
          { count: validCount, rejected: invalidCount, source },
          '[ModelConfigBunker] Loaded from disk'
        );
      } else {
        // Snapshot format: { data: {...}, updatedAt: number }
        let validCount = 0;
        let invalidCount = 0;

        for (const [key, configData] of Object.entries(parsed.data)) {
          const result = ConfigRowSchema.safeParse(configData);
          if (result.success) {
            this.cache.set(key, configData as PhaseModelConfig);
            validCount++;
          } else {
            invalidCount++;
            logger.warn(
              { key, errors: result.error.errors },
              '[ModelConfigBunker] Invalid config in snapshot, skipping'
            );
          }
        }

        // Only update timestamp if majority of configs valid
        if (validCount > invalidCount) {
          this.cacheUpdatedAt = parsed.updatedAt;
        } else {
          this.cacheUpdatedAt = Date.now();
        }

        const source = diskPath === SEED_PATH ? 'seed_artifact' : 'lkg_disk';
        logger.info(
          { count: validCount, rejected: invalidCount, source },
          '[ModelConfigBunker] Loaded from disk'
        );
      }
    } catch (error) {
      logger.error(
        { path: diskPath, error },
        '[ModelConfigBunker] Failed to load disk cache'
      );
    }
  }

  // ==========================================================================
  // HEALTH & OBSERVABILITY
  // ==========================================================================

  /**
   * Get bunker health status
   *
   * Health categories:
   * - fresh: Cache age < 2 minutes (healthy)
   * - stale: Cache age 2-60 minutes (warning)
   * - very_stale: Cache age > 60 minutes (degraded)
   *
   * @returns BunkerHealth object with status and metrics
   *
   * @example
   * const health = bunker.getHealth();
   * if (!health.healthy) {
   *   logger.warn({ health }, 'Config bunker degraded');
   * }
   * // => { healthy: false, configCount: 47, cacheAge: 3600, source: 'very_stale' }
   */
  getHealth(): BunkerHealth {
    const cacheAge = Math.floor((Date.now() - this.cacheUpdatedAt) / 1000);
    return {
      healthy: this.cache.size > 0,
      configCount: this.cache.size,
      cacheAge,
      source: cacheAge < 120 ? 'fresh' : cacheAge < 3600 ? 'stale' : 'very_stale',
      // Diagnostic metrics for observability
      syncRetries: this.syncRetries,
      redisWriteFailures: this.redisWriteFailures,
      lkgWriteFailures: this.lkgWriteFailures,
      lastSyncAt: this.cacheUpdatedAt || null,
      timerActive: this.syncTimer !== null,
    };
  }

  /**
   * Check if the bunker has been successfully initialized
   *
   * Returns true only after initialize() completes successfully,
   * meaning:
   * - At least one config layer loaded (disk/Redis/DB)
   * - Minimum config count validated
   * - Background sync timer started
   *
   * Use this to guard against accessing configs before initialization.
   *
   * @returns true if initialization completed successfully
   *
   * @example
   * const bunker = getModelConfigBunker();
   * if (bunker.isInitialized()) {
   *   const config = bunker.get('stage_4', 'standard', 'en');
   * } else {
   *   throw new Error('Bunker not initialized');
   * }
   *
   * @example
   * // Safe pattern with initialization
   * const bunker = await initializeModelConfigBunker();
   * // bunker.isInitialized() is now always true
   */
  isInitialized(): boolean {
    return this.isReady;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Singleton bunker instance
 */
let bunkerInstance: ModelConfigBunker | null = null;

/**
 * Initialization promise for race condition prevention
 * Ensures only one initialization runs at a time
 */
let initializationPromise: Promise<ModelConfigBunker> | null = null;

/**
 * Get or create the ModelConfigBunker singleton
 *
 * Note: Does NOT initialize the bunker. Call initializeModelConfigBunker()
 * once at startup to load configs.
 *
 * @returns ModelConfigBunker instance
 *
 * @example
 * // At startup
 * await initializeModelConfigBunker();
 *
 * // In application code
 * const bunker = getModelConfigBunker();
 * const config = bunker.get('stage_4_classification', 'standard', 'ru');
 */
export function getModelConfigBunker(): ModelConfigBunker {
  if (!bunkerInstance) {
    bunkerInstance = new ModelConfigBunker();
  }
  return bunkerInstance;
}

/**
 * Initialize the bunker (call once at startup)
 *
 * This is the main entry point for bunker initialization.
 * Call once in your application startup code (e.g., worker bootstrap).
 *
 * Thread-safe: Multiple concurrent calls will share the same initialization promise,
 * preventing race conditions and duplicate timers.
 *
 * @returns Initialized ModelConfigBunker instance
 * @throws Error if initialization fails (no configs loaded)
 *
 * @example
 * // In worker startup
 * async function startWorker() {
 *   const bunker = await initializeModelConfigBunker();
 *   logger.info({ health: bunker.getHealth() }, 'Worker ready');
 *   // ... start processing jobs
 * }
 */
export async function initializeModelConfigBunker(): Promise<ModelConfigBunker> {
  // Return existing initialization if in progress (prevents race condition)
  if (initializationPromise) {
    return initializationPromise;
  }

  const bunker = getModelConfigBunker();
  if (bunker.isInitialized()) {
    return bunker;
  }

  // Create initialization promise with cleanup on completion/error
  initializationPromise = bunker
    .initialize()
    .then(() => {
      initializationPromise = null; // Clear after success
      return bunker;
    })
    .catch((err) => {
      initializationPromise = null; // Clear on error for retry
      throw err;
    });

  return initializationPromise;
}
