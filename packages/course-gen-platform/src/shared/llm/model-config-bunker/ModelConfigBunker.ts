import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import { existsSync, copyFileSync, readFileSync, mkdirSync } from 'fs';
import path from 'path';

import { getRedisClient } from '../../cache/redis.js';
import { getSupabaseAdmin } from '../../supabase/admin.js';
import logger from '../../logger/index.js';
import type {
  PhaseModelConfig,
  ActiveConfig,
  ConfigMeta,
  ConfigSnapshot,
  BunkerHealth,
} from '../model-config-types.js';

import {
  LKG_PATH,
  SEED_PATH,
  REDIS_KEY,
  SYNC_INTERVAL_MS,
  DB_QUERY_TIMEOUT_MS,
  INVALID_THRESHOLD,
  MIN_CONFIG_COUNT,
  CACHE_SIZE_THRESHOLD,
} from './constants.js';
import { ConfigRowSchema } from './schemas.js';
import { buildKey, rowToConfig } from './utils.js';

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
 */
export class ModelConfigBunker {
  private cache = new Map<string, PhaseModelConfig>();
  private cacheUpdatedAt = 0;
  private isReady = false;
  private syncTimer: NodeJS.Timeout | null = null;
  private syncRetries = 0;
  private redisWriteFailures = 0;
  private lkgWriteFailures = 0;

  private readonly MAX_WRITE_FAILURES_BEFORE_ERROR = 3;
  private readonly MAX_SYNC_RETRIES = 5;
  private readonly BASE_RETRY_DELAY_MS = 60_000;

  async initialize(): Promise<void> {
    logger.info('[ModelConfigBunker] Starting initialization...');

    try {
      mkdirSync(path.dirname(LKG_PATH), { recursive: true });

      if (!existsSync(LKG_PATH) && existsSync(SEED_PATH)) {
        logger.info('[ModelConfigBunker] Cold Start: Initializing LKG from Build Seed.');
        try {
          const dir = path.dirname(LKG_PATH);
          await fs.mkdir(dir, { recursive: true });
          copyFileSync(SEED_PATH, LKG_PATH);
        } catch (e) {
          logger.warn({ error: e }, '[ModelConfigBunker] Could not copy seed to LKG path');
        }
      }

      this.loadFromDisk();

      try {
        await this.loadFromRedis();
      } catch {
        logger.warn('[ModelConfigBunker] Redis unavailable during startup, using disk cache');
      }

      try {
        await this.syncFromDatabase();
      } catch {
        logger.warn('[ModelConfigBunker] DB unreachable at startup. Running on LKG data.');
      }

      if (this.cache.size === 0) {
        throw new Error('CRITICAL: No configs loaded. Cannot start worker.');
      }

      this.syncTimer = setInterval(() => {
        this.syncFromDatabase().catch(err => {
          logger.error({ error: err }, '[ModelConfigBunker] Background sync failed');
        });
      }, SYNC_INTERVAL_MS);

      this.isReady = true;
      logger.info({ configCount: this.cache.size }, '[ModelConfigBunker] Ready');
    } catch (err) {
      if (this.syncTimer) {
        clearInterval(this.syncTimer);
        this.syncTimer = null;
      }
      logger.error(
        { error: err },
        '[ModelConfigBunker] Initialization failed, resources cleaned up'
      );
      throw err;
    }
  }

  shutdown(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    logger.info('[ModelConfigBunker] Shutdown complete');
  }

  restartBackgroundSync(): void {
    if (this.syncTimer) {
      return;
    }

    this.syncRetries = 0;
    this.syncTimer = setInterval(() => {
      this.syncFromDatabase().catch(err => {
        logger.error({ error: err }, '[ModelConfigBunker] Background sync failed');
      });
    }, SYNC_INTERVAL_MS);

    logger.info('[ModelConfigBunker] Background sync restarted');
  }

  get(
    phase: string,
    tier: 'standard' | 'extended' = 'standard',
    lang: string = 'any'
  ): ActiveConfig {
    const now = Date.now();

    const candidates = [
      `${phase}:${tier}:${lang}`,
      `${phase}:${tier}`,
      `${phase}:standard`,
      'global_default:standard',
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

  getEmergency(): ActiveConfig {
    const config = this.cache.get('emergency:extended') || this.cache.get('emergency:standard');
    if (!config) {
      throw new Error('CRITICAL: Emergency config missing.');
    }
    return {
      ...config,
      _meta: {
        source: 'memory_l1',
        resolution: 'exact',
        fetched_at: Date.now(),
        config_age_sec: Math.floor((Date.now() - this.cacheUpdatedAt) / 1000),
      },
    };
  }

  private async syncFromDatabase(): Promise<void> {
    try {
      const supabase = getSupabaseAdmin();

      const queryPromise = supabase.from('llm_model_config').select('*').eq('is_active', true);

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('[ModelConfigBunker] Database query timeout after 10s')),
          DB_QUERY_TIMEOUT_MS
        )
      );

      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

      if (error) throw error;
      if (!data?.length) {
        logger.warn('[ModelConfigBunker] DB returned empty config list, preserving cache');
        return;
      }

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
              errors: result.error.errors.map(
                (e: { path: (string | number)[]; message: string; code: string }) => ({
                  path: e.path.join('.'),
                  message: e.message,
                  code: e.code,
                })
              ),
            },
            '[ModelConfigBunker] Config validation failed'
          );
        }
      }

      if (rejectCount > data.length * INVALID_THRESHOLD) {
        logger.error(
          { rejectCount, total: data.length, threshold: INVALID_THRESHOLD },
          '[ModelConfigBunker] SYNC ABORTED: >20% configs invalid.'
        );
        return;
      }

      if (this.cache.size > CACHE_SIZE_THRESHOLD && validCount < MIN_CONFIG_COUNT) {
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
        if (this.syncTimer) {
          clearInterval(this.syncTimer);
          this.syncTimer = null;
        }
      } else {
        const delayMs = this.BASE_RETRY_DELAY_MS * Math.pow(2, this.syncRetries - 1);
        logger.warn(
          { retries: this.syncRetries, nextRetryInSec: Math.round(delayMs / 1000) },
          '[ModelConfigBunker] Sync failed, will retry with backoff'
        );

        if (this.syncTimer) {
          clearInterval(this.syncTimer);
        }
        this.syncTimer = setInterval(() => {
          this.syncFromDatabase().catch(() => {});
        }, delayMs);
      }

      logger.error({ error: err }, '[ModelConfigBunker] DB sync failed');
    }
  }

  private async updateAllLayers(snapshot: Record<string, PhaseModelConfig>): Promise<void> {
    const now = Date.now();

    this.cache.clear();
    for (const [key, config] of Object.entries(snapshot)) {
      this.cache.set(key, config);
    }
    this.cacheUpdatedAt = now;

    try {
      const redis = getRedisClient();
      await redis.set(REDIS_KEY, JSON.stringify({ data: snapshot, updatedAt: now }));
      this.redisWriteFailures = 0;
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

    const tmpPath = `${LKG_PATH}.${randomUUID()}.tmp`;
    try {
      const dir = path.dirname(LKG_PATH);
      await fs.mkdir(dir, { recursive: true });
      const content = JSON.stringify({ data: snapshot, updatedAt: now }, null, 2);

      await fs.writeFile(tmpPath, content, 'utf-8');

      const stat = await fs.stat(tmpPath);
      const expectedSize = Buffer.byteLength(content, 'utf-8');

      if (stat.size !== expectedSize) {
        throw new Error(
          `File write verification failed: expected ${expectedSize} bytes, got ${stat.size}`
        );
      }

      await fs.rename(tmpPath, LKG_PATH);

      this.lkgWriteFailures = 0;
    } catch (error) {
      this.lkgWriteFailures++;
      await fs.unlink(tmpPath).catch(() => {});
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

  private async loadFromRedis(): Promise<void> {
    const redis = getRedisClient();
    const raw = await redis.get(REDIS_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as unknown;

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

      if (validCount > invalidCount) {
        this.cacheUpdatedAt = updatedAt;
      }

      logger.info(
        { count: validCount, rejected: invalidCount, source: 'redis' },
        '[ModelConfigBunker] Loaded from Redis'
      );
    } catch (err) {
      logger.error({ error: err }, '[ModelConfigBunker] Failed to parse Redis snapshot');
    }
  }

  private loadFromDisk(): void {
    const diskPath = existsSync(LKG_PATH) ? LKG_PATH : SEED_PATH;
    if (!existsSync(diskPath)) {
      logger.warn('[ModelConfigBunker] No disk cache available');
      return;
    }

    try {
      const raw = readFileSync(diskPath, 'utf-8');
      const parsed = JSON.parse(raw) as ConfigSnapshot | Array<Record<string, unknown>>;

      if (Array.isArray(parsed)) {
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
              { phase: row.phase_name, errors: result.error.errors },
              '[ModelConfigBunker] Invalid config in disk file, skipping'
            );
          }
        }

        if (invalidCount > 0 && invalidCount > parsed.length * INVALID_THRESHOLD) {
          logger.error(
            { validCount, invalidCount, threshold: INVALID_THRESHOLD },
            '[ModelConfigBunker] Disk cache corrupted: too many invalid configs'
          );
          this.cache.clear();
        }

        this.cacheUpdatedAt = Date.now();
        const source = diskPath === SEED_PATH ? 'seed_artifact' : 'lkg_disk';
        logger.info(
          { count: validCount, rejected: invalidCount, source },
          '[ModelConfigBunker] Loaded from disk'
        );
      } else {
        let validCount = 0;
        let invalidCount = 0;

        for (const [key, configData] of Object.entries(parsed.data)) {
          const result = ConfigRowSchema.safeParse(configData);
          if (result.success) {
            this.cache.set(key, configData);
            validCount++;
          } else {
            invalidCount++;
            logger.warn(
              { key, errors: result.error.errors },
              '[ModelConfigBunker] Invalid config in snapshot, skipping'
            );
          }
        }

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
      logger.error({ path: diskPath, error }, '[ModelConfigBunker] Failed to load disk cache');
    }
  }

  getUniqueModelIds(): string[] {
    const ids = new Set<string>();
    for (const config of this.cache.values()) {
      if (config.model_id) ids.add(config.model_id);
      if (config.fallback_model_id) ids.add(config.fallback_model_id);
    }
    return Array.from(ids);
  }

  getHealth(): BunkerHealth {
    const cacheAge = Math.floor((Date.now() - this.cacheUpdatedAt) / 1000);
    return {
      healthy: this.cache.size > 0,
      configCount: this.cache.size,
      cacheAge,
      source: cacheAge < 120 ? 'fresh' : cacheAge < 3600 ? 'stale' : 'very_stale',
      syncRetries: this.syncRetries,
      redisWriteFailures: this.redisWriteFailures,
      lkgWriteFailures: this.lkgWriteFailures,
      lastSyncAt: this.cacheUpdatedAt || null,
      timerActive: this.syncTimer !== null,
    };
  }

  isInitialized(): boolean {
    return this.isReady;
  }
}

let bunkerInstance: ModelConfigBunker | null = null;
let initializationPromise: Promise<ModelConfigBunker> | null = null;

export function getModelConfigBunker(): ModelConfigBunker {
  if (!bunkerInstance) {
    bunkerInstance = new ModelConfigBunker();
  }
  return bunkerInstance;
}

export async function initializeModelConfigBunker(): Promise<ModelConfigBunker> {
  if (initializationPromise) {
    return initializationPromise;
  }

  const bunker = getModelConfigBunker();
  if (bunker.isInitialized()) {
    return bunker;
  }

  initializationPromise = bunker
    .initialize()
    .then(() => {
      initializationPromise = null;
      return bunker;
    })
    .catch(err => {
      initializationPromise = null;
      throw err;
    });

  return initializationPromise;
}

export async function validateModelAvailability(bunker: ModelConfigBunker): Promise<void> {
  try {
    const { getOpenRouterModels } = await import('../../../services/openrouter-models.js');
    const { models } = await getOpenRouterModels();
    const availableIds = new Set(models.map((m: any) => m.id));

    const configuredIds = bunker.getUniqueModelIds();
    const invalidIds = configuredIds.filter(id => !availableIds.has(id));

    if (invalidIds.length > 0) {
      logger.warn(
        {
          invalidIds,
          invalidCount: invalidIds.length,
          totalConfigured: configuredIds.length,
          totalAvailable: availableIds.size,
        },
        '[ModelConfigBunker] Some configured model IDs not found on OpenRouter — these may fail at runtime'
      );
    } else {
      logger.info(
        {
          validatedCount: configuredIds.length,
          availableModels: availableIds.size,
        },
        '[ModelConfigBunker] All configured model IDs validated against OpenRouter'
      );
    }
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      '[ModelConfigBunker] Model ID validation skipped: could not fetch OpenRouter models'
    );
  }
}
