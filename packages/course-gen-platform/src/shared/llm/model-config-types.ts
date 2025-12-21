/**
 * Model Configuration Types for Bunker Architecture
 * @module shared/llm/model-config-types
 *
 * Defines types for the ModelConfigBunker system - a 5-layer shield hierarchy
 * providing resilient, zero-latency access to LLM model configurations.
 *
 * 5-Layer Shield Hierarchy:
 * - L1: Memory (Heap) - Zero-latency access for hot-path queries
 * - L2: Redis - Shares state across workers in distributed systems
 * - L3: Local LKG File - Survives DB + Redis outages (Last Known Good)
 * - L4: Build Artifact - Baked into image at build time (immutable baseline)
 * - L5: Database - Source of truth (Supabase llm_model_config table)
 *
 * Resolution Flow:
 * 1. Check L1 (memory) → instant return if fresh
 * 2. Check L2 (Redis) → fast network lookup if L1 miss
 * 3. Try L5 (Database) → refresh L1+L2 on success
 * 4. Fall back to L3 (LKG file) if DB unavailable
 * 5. Fall back to L4 (seed artifact) if LKG missing
 *
 * Key Principles:
 * - Stale data is better than no data
 * - Observable degradation (log warnings when using fallbacks)
 * - Fail fast on cold start with no fallback data
 * - All layers validated for schema compatibility
 *
 * @see model-config-service.ts Main service implementation
 * @see https://datatracker.ietf.org/doc/html/rfc5861 Stale-While-Revalidate Pattern
 */

/**
 * Phase-specific model configuration
 *
 * Maps to a single row in llm_model_config table with all parameters
 * needed to invoke an LLM for a specific phase of the pipeline.
 *
 * Examples:
 * - stage_4_classification → GPT-OSS-20B for document classification
 * - stage_6_judge → Claude Opus 4.5 for lesson quality evaluation
 * - stage_2_standard_en → Qwen3-235B for English summarization
 *
 * @see Database['public']['Tables']['llm_model_config']['Row']
 */
export interface PhaseModelConfig {
  /**
   * Phase name identifier
   *
   * Must match database CHECK constraint in llm_model_config.phase_name.
   * Examples: 'stage_4_classification', 'stage_6_judge', 'global_default'
   *
   * @example 'stage_4_classification'
   * @example 'stage_2_standard_ru'
   * @example 'global_default'
   */
  phase_name: string;

  /**
   * Context tier for large document handling
   *
   * - 'standard': Default tier for most documents (e.g., 128K context)
   * - 'extended': Large document tier (e.g., 200K context)
   *
   * Selection based on token count thresholds:
   * - Stage 4: 260K threshold
   * - Other stages: 80K threshold
   *
   * @see model-config-service.ts determineTier()
   */
  context_tier: 'standard' | 'extended';

  /**
   * Primary OpenRouter model ID
   *
   * Format: "provider/model-name" or "provider/model-name:variant"
   *
   * @example 'openai/gpt-oss-20b'
   * @example 'xiaomi/mimo-v2-flash:free'
   * @example 'anthropic/claude-opus-4.5'
   */
  model_id: string;

  /**
   * Fallback model for quality-based escalation
   *
   * Used when:
   * - Primary model returns low quality score
   * - Primary model fails or times out
   * - Primary model returns invalid JSON
   *
   * Null means no fallback (fail immediately on primary failure)
   *
   * @example 'openai/gpt-oss-120b'
   * @example 'qwen/qwen3-235b-a22b-2507'
   */
  fallback_model_id: string | null;

  /**
   * Model temperature (0-2)
   *
   * Controls randomness in model output:
   * - 0.0-0.3: Deterministic (classification, analysis)
   * - 0.4-0.7: Balanced (general content generation)
   * - 0.8-1.0: Creative (brainstorming, examples)
   * - 1.0-2.0: Maximum creativity (experimental)
   *
   * @default 0.7
   */
  temperature: number;

  /**
   * Maximum output tokens (1-200000)
   *
   * Limits the length of model-generated responses.
   * Does NOT include input tokens.
   *
   * Typical values:
   * - 4096: Short responses (classifications, metadata)
   * - 8192: Medium responses (section content)
   * - 16384: Long responses (full lessons)
   * - 32768+: Very long responses (hierarchical summaries)
   *
   * @default 4096
   */
  max_tokens: number;

  /**
   * Maximum context tokens supported by the model
   *
   * Used for:
   * 1. Dynamic threshold calculation (context reserve)
   * 2. Tier selection (standard vs extended)
   * 3. Context overflow detection
   *
   * Null means no limit (not recommended - use actual model limit)
   *
   * @example 128000 // Claude Sonnet 3.5
   * @example 200000 // GPT-OSS-120B
   * @example 1000000 // Gemini 2.0 Flash
   */
  max_context_tokens: number | null;

  /**
   * Quality threshold for phase validation (0-1)
   *
   * Minimum acceptable quality score from LLM judges.
   * Below this threshold triggers fallback model or retry.
   *
   * Null uses hardcoded default (typically 0.75)
   *
   * @example 0.75 // Default for most phases
   * @example 0.85 // Higher quality requirement (final output)
   * @example 0.65 // Lower threshold (experimental phases)
   */
  quality_threshold: number | null;

  /**
   * Maximum retry attempts for phase (0-10)
   *
   * Number of retries before giving up on this phase.
   * Each retry may use fallback model if configured.
   *
   * Null uses hardcoded default (typically 3)
   *
   * @example 3 // Default retry count
   * @example 0 // No retries (fail fast)
   * @example 5 // More retries for critical phases
   */
  max_retries: number | null;

  /**
   * Phase timeout in milliseconds
   *
   * Maximum time allowed for LLM API call completion.
   * Null means no timeout (infinite wait - not recommended)
   *
   * Typical values:
   * - 30000 (30s): Fast models (classification)
   * - 60000 (60s): Medium models (content generation)
   * - 120000 (120s): Slow models (long outputs)
   *
   * @example 120000 // 2 minutes
   * @example null // No timeout (infinite)
   */
  timeout_ms: number | null;

  /**
   * Content language (optional)
   *
   * Used for language-specific model selection and reserve calculation.
   * Examples: 'ru', 'en', 'any'
   *
   * @example 'ru' // Russian content
   * @example 'en' // English content
   * @example 'any' // Language-agnostic
   */
  language?: string;

  /**
   * Stage number (optional)
   *
   * Pipeline stage identifier (3, 4, 5, 6).
   * Used for stage-based routing in new architecture.
   *
   * Null for legacy phase-based routing.
   *
   * @example 4 // Stage 4: Analysis
   * @example 6 // Stage 6: Lesson Content
   */
  stage_number?: number | null;

  /**
   * Judge role (optional)
   *
   * Role in CLEV (Consensus-based LLM Evaluation Voting) system.
   * Only used for stage_6_judge phase.
   *
   * - 'primary': First judge (highest weight)
   * - 'secondary': Second judge (medium weight)
   * - 'tiebreaker': Third judge (breaks ties)
   *
   * Null for non-judge phases.
   *
   * @example 'primary' // Claude Opus 4.5
   * @example 'secondary' // GPT-OSS-120B
   * @example 'tiebreaker' // Qwen3-235B
   */
  judge_role?: 'primary' | 'secondary' | 'tiebreaker' | null;

  /**
   * Historical accuracy-based weight (0-1)
   *
   * Used for weighted voting in CLEV system.
   * Higher weight = more influence on final decision.
   *
   * Calculated from historical accuracy:
   * - 0.9-1.0: Highly accurate judge
   * - 0.7-0.9: Moderately accurate judge
   * - 0.5-0.7: Less accurate judge
   *
   * Null for non-judge phases.
   *
   * @example 0.92 // Claude Opus 4.5 (primary)
   * @example 0.78 // GPT-OSS-120B (secondary)
   * @example 0.65 // Qwen3-235B (tiebreaker)
   */
  weight?: number | null;
}

/**
 * Configuration metadata tracking
 *
 * Tracks where config came from and how fresh it is.
 * Used for observability and degradation detection.
 */
export interface ConfigMeta {
  /**
   * Source layer in the shield hierarchy
   *
   * - 'memory_l1': L1 heap cache (zero latency)
   * - 'redis_l2': L2 distributed cache (fast network)
   * - 'lkg_disk': L3 last known good file (survives outages)
   * - 'seed_artifact': L4 build-time seed (immutable baseline)
   *
   * Missing 'database' - database is L5 but never returned directly,
   * it always refreshes L1/L2 first.
   */
  source: 'memory_l1' | 'redis_l2' | 'lkg_disk' | 'seed_artifact';

  /**
   * Resolution method used to find this config
   *
   * - 'exact': Exact match for phase + tier + language
   * - 'fallback_lang': Used 'any' language fallback
   * - 'fallback_tier': Used 'standard' tier fallback
   * - 'global_default': Used global_default phase config
   */
  resolution: 'exact' | 'fallback_lang' | 'fallback_tier' | 'global_default';

  /**
   * Unix timestamp (milliseconds) when config was fetched
   *
   * Used to calculate age and determine staleness.
   *
   * @example 1703174400000 // 2023-12-21T12:00:00Z
   */
  fetched_at: number;

  /**
   * Age of config in seconds
   *
   * Calculated as: (now - fetched_at) / 1000
   *
   * Used for:
   * - Staleness warnings (age > 5 minutes)
   * - Cache eviction (age > 24 hours)
   * - Health check status (fresh/stale/very_stale)
   *
   * @example 120 // 2 minutes old
   * @example 3600 // 1 hour old
   */
  config_age_sec: number;

  /**
   * Database updated_at timestamp (optional)
   *
   * Unix timestamp (milliseconds) when config was last updated in database.
   * Only present when source is 'memory_l1' or 'redis_l2' (refreshed from DB).
   *
   * Used to detect config drift between layers.
   *
   * @example 1703170800000 // 2023-12-21T11:00:00Z
   */
  db_updated_at?: number;
}

/**
 * Active configuration with metadata
 *
 * Combines phase config with resolution metadata.
 * This is what gets returned by ModelConfigBunker.get()
 */
export interface ActiveConfig extends PhaseModelConfig {
  /**
   * Metadata about config resolution
   *
   * Prefixed with underscore to avoid conflicts with PhaseModelConfig fields.
   */
  _meta: ConfigMeta;
}

/**
 * Configuration snapshot for serialization
 *
 * Used for:
 * - L3: Last Known Good (LKG) files on disk
 * - L4: Build artifacts (seed files)
 * - Redis storage (L2)
 *
 * Format: JSON with timestamp for version tracking
 */
export interface ConfigSnapshot {
  /**
   * Config data keyed by lookup key
   *
   * Key format: "phase:tier:lang" or "stage:num:tier:lang"
   *
   * @example
   * {
   *   "stage_4_classification:standard:en": { phase_name: "...", ... },
   *   "stage_6_judge:standard:ru": { phase_name: "...", ... }
   * }
   */
  data: Record<string, PhaseModelConfig>;

  /**
   * Unix timestamp (milliseconds) when snapshot was created
   *
   * Used for:
   * - Version tracking
   * - Age calculation
   * - Staleness detection
   *
   * @example 1703174400000 // 2023-12-21T12:00:00Z
   */
  updatedAt: number;
}

/**
 * Bunker health check result
 *
 * Used for monitoring endpoints and admin dashboard.
 * Provides visibility into cache state and degradation.
 */
export interface BunkerHealth {
  /**
   * Overall health status
   *
   * - true: All layers accessible and fresh data available
   * - false: Degraded operation (using stale data or fallbacks)
   */
  healthy: boolean;

  /**
   * Number of configs in L1 memory cache
   *
   * Used for capacity monitoring and eviction detection.
   *
   * @example 47 // 47 configs cached
   */
  configCount: number;

  /**
   * Age of oldest config in cache (seconds)
   *
   * Used for staleness detection.
   *
   * @example 300 // 5 minutes
   * @example 7200 // 2 hours
   */
  cacheAge: number;

  /**
   * Cache freshness category
   *
   * - 'fresh': All configs < 5 minutes old (healthy)
   * - 'stale': Some configs 5-60 minutes old (warning)
   * - 'very_stale': Some configs > 60 minutes old (degraded)
   */
  source: 'fresh' | 'stale' | 'very_stale';

  // ============================================================================
  // DIAGNOSTIC METRICS (for observability)
  // ============================================================================

  /**
   * Count of consecutive database sync failures
   *
   * Resets to 0 on successful sync. When this reaches MAX_SYNC_RETRIES (5),
   * background sync is paused until manual intervention.
   *
   * @example 0 // Healthy - last sync succeeded
   * @example 3 // Warning - 3 consecutive failures
   * @example 5 // Critical - background sync paused
   */
  syncRetries: number;

  /**
   * Count of consecutive Redis write failures
   *
   * Resets to 0 on successful write. Escalates to error level logging
   * after MAX_WRITE_FAILURES_BEFORE_ERROR (3) consecutive failures.
   *
   * @example 0 // Healthy - Redis writes working
   * @example 2 // Warning - intermittent Redis issues
   */
  redisWriteFailures: number;

  /**
   * Count of consecutive LKG file write failures
   *
   * Resets to 0 on successful write. Escalates to error level logging
   * after MAX_WRITE_FAILURES_BEFORE_ERROR (3) consecutive failures.
   *
   * @example 0 // Healthy - LKG writes working
   * @example 4 // Critical - persistent disk write issues
   */
  lkgWriteFailures: number;

  /**
   * Unix timestamp (milliseconds) of last successful cache update
   *
   * Null if cache has never been updated (cold start without disk fallback).
   * Use this to calculate exact staleness or detect stalled syncs.
   *
   * @example 1703174400000 // 2023-12-21T12:00:00Z
   * @example null // Never synced (should not happen in production)
   */
  lastSyncAt: number | null;

  /**
   * Whether the background sync timer is currently active
   *
   * - true: Periodic database sync running (healthy)
   * - false: Sync paused (max retries reached or shutdown)
   *
   * When false after initialization, check syncRetries to determine cause.
   *
   * @example true // Normal operation
   * @example false // Sync paused - check syncRetries
   */
  timerActive: boolean;
}

/**
 * Seed file format (build artifact)
 *
 * The seed file is a JSON array of config rows, created by generate-config-seed.ts
 * and baked into the Docker image at build time.
 *
 * Used as L4 fallback when LKG file is missing.
 *
 * @see generate-config-seed.ts Build script that creates seed files
 */
export type SeedFormat = Array<PhaseModelConfig & {
  /** Database row ID (preserved for debugging) */
  id?: string;
  /** Config type - always 'global' for seed */
  config_type?: string;
  /** Course ID - always null for global configs */
  course_id?: string | null;
  /** Whether config is active */
  is_active?: boolean;
}>;

/**
 * Components needed to build a cache key
 *
 * Extracted from PhaseModelConfig for type safety in buildKey() function.
 * Key format: "phase:tier" or "phase:tier:language"
 *
 * @example
 * const components: ConfigKeyComponents = {
 *   phase_name: 'stage_4_classification',
 *   context_tier: 'standard',
 *   language: 'ru'
 * };
 * const key = buildKey(components); // => 'stage_4_classification:standard:ru'
 */
export interface ConfigKeyComponents {
  /** Phase name from config */
  phase_name: string;
  /** Context tier (defaults to 'standard' if null) */
  context_tier: 'standard' | 'extended' | null;
  /** Language code (omitted from key if 'any') */
  language?: string | null;
}
