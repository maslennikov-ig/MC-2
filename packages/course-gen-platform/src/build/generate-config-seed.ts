/**
 * Generate Config Seed Script
 * @module src/build/generate-config-seed
 *
 * Refreshes the committed LLM model routing fallback from the database.
 * Uses "Committed Seed" pattern: updates from DB if available,
 * falls back to committed file if DB unreachable.
 *
 * Run it explicitly (`pnpm -F course-gen-platform generate:config-seed`) and
 * commit the result. It used to be wired as a `prebuild` script, which never
 * ran: pnpm has not executed implicit pre/post scripts since v7, so the seed
 * silently stopped tracking the database. The Docker image copies the committed
 * src/config/config-seed.json straight into dist, so what is in Git is what
 * production falls back to.
 *
 * Flow:
 * 1. Try to connect to Supabase and fetch active llm_model_config rows
 * 2. If successful, write to src/config/config-seed.json (Git-tracked)
 * 3. If DB unavailable, use existing committed seed file
 * 4. Copy seed to dist/ if dist directory exists
 *
 * Environment variables:
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_KEY: Service role key for admin access
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  STAGE6_CANONICAL_PHASE_DEFAULTS,
  STAGE6_EXPLICIT_PHASE_NAMES,
} from '@megacampus/shared-types/stage6-model-config';
// Not `import { logger } from '@megacampus/shared-logger'`: under the tsconfig
// path alias that package resolves to its CommonJS build, whose named exports
// Node's ESM layer does not see, so the import threw at load and this script
// could not run at all. shared-logger-runtime already resolves the logger
// across both module shapes and pulls in nothing else.
import { baseLogger as logger } from '@/shared/logger/shared-logger-runtime';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_PATH = path.join(__dirname, '../config/config-seed.json'); // Git-tracked
const DIST_PATH = path.join(__dirname, '../../dist/config/config-seed.json'); // Build artifact (matches bunker relative path)
const MAX_SEED_SIZE_BYTES = 10 * 1024 * 1024; // 10MB max

const RETIRED_MODEL_ID_REPLACEMENTS: Record<string, string> = {
  'xiaomi/mimo-v2-flash': 'deepseek/deepseek-v4-flash',
  'x-ai/grok-4.1-fast': 'deepseek/deepseek-v4-flash',
  'x-ai/grok-4-fast': 'deepseek/deepseek-v4-flash',
};

function normalizeRuntimeModelId(modelId: string | null): string | null {
  if (!modelId) return null;
  return RETIRED_MODEL_ID_REPLACEMENTS[modelId] ?? modelId;
}

/**
 * Required phases that MUST be present in the seed file.
 * If any are missing, the refresh is refused and the committed seed is kept.
 *
 * `stage_6_standard_en` and `stage_6_standard_ru` used to be on this list and
 * are dead: Stage 6 asks for `stage_6_${tier}` with tier simple|normal|complex
 * (nodes/generator/model-selector.ts), never a language-suffixed name. They have
 * no row in the database, so the list could never be satisfied and every
 * refresh since has been refused — which is a large part of why the committed
 * seed fell 20 phases behind. Replaced with the tier names Stage 6 really uses.
 */
const REQUIRED_PHASES = [
  'global_default',
  'emergency',
  'stage_2_standard_en',
  'stage_2_standard_ru',
  'stage_3_classification',
  'stage_4_classification',
  'stage_6_simple',
  'stage_6_normal',
  'stage_6_complex',
];

/**
 * Minimal schema for seed config validation
 */
const SeedConfigSchema = z
  .object({
    phase_name: z.string().min(1),
    model_id: z.string().min(1),
    context_tier: z.string().nullable(),
    temperature: z.union([z.number(), z.string()]).nullable(),
    max_tokens: z.number().nullable(),
    reasoning_enabled: z.boolean().nullable().optional(),
    reasoning_max_tokens: z.number().nullable().optional(),
  })
  // Reasoning without a reserved budget spends the answer's tokens on thinking
  // and returns a stub. The database forbids it; refuse to seed it either.
  .refine(row => !row.reasoning_enabled || Boolean(row.reasoning_max_tokens), {
    message: 'reasoning_enabled requires reasoning_max_tokens',
    path: ['reasoning_max_tokens'],
  });

/**
 * Full LLM model config as stored in database
 */
interface LLMModelConfigFull {
  id: string;
  config_type: string;
  course_id: string | null;
  phase_name: string;
  model_id: string;
  fallback_model_id: string | null;
  temperature: string | null; // Stored as numeric string in DB
  max_tokens: number | null;
  created_at: string | null;
  updated_at: string | null;
  version: number;
  is_active: boolean;
  created_by: string | null;
  language: string | null;
  context_tier: string | null;
  threshold_tokens: number | null;
  cache_read_enabled: boolean | null;
  stage_number: number | null;
  max_context_tokens: number | null;
  primary_display_name: string | null;
  fallback_display_name: string | null;
  judge_role: string | null;
  weight: string | null; // Stored as numeric string in DB
  quality_threshold: string | null; // Stored as numeric string in DB
  max_retries: number | null;
  timeout_ms: number | null;
  reasoning_enabled: boolean | null;
  reasoning_effort: string | null;
  reasoning_max_tokens: number | null;
}

/**
 * Minimal config for runtime use (Bunker pattern)
 * Excludes timestamps, version, created_by - only essential fields for LLM calls
 */
interface LLMModelConfigSeed {
  id: string;
  config_type: string;
  course_id: string | null;
  phase_name: string;
  model_id: string;
  fallback_model_id: string | null;
  temperature: string | null;
  max_tokens: number | null;
  is_active: boolean;
  language: string | null;
  context_tier: string | null;
  threshold_tokens: number | null;
  cache_read_enabled: boolean | null;
  stage_number: number | null;
  max_context_tokens: number | null;
  primary_display_name: string | null;
  fallback_display_name: string | null;
  judge_role: string | null;
  weight: string | null;
  quality_threshold: string | null;
  max_retries: number | null;
  timeout_ms: number | null;
  reasoning_enabled: boolean | null;
  reasoning_effort: string | null;
  reasoning_max_tokens: number | null;
}

/**
 * Add the canonical Stage 6 phases the database does not carry.
 *
 * `loadDefaultPhaseConfigs` force-injects STAGE6_CANONICAL_PHASE_DEFAULTS over
 * whatever the seed holds, because the Stage 6 quality ladder is pinned in code
 * rather than in `llm_model_config`. The seed has to mirror that, and
 * `stage6-fallback-topology.test.ts` requires a global/any/standard row for
 * every explicit Stage 6 phase. `stage_6_content` has no database row at all,
 * so a plain database dump silently drops it and the offline fallback loses the
 * phase that generates lesson content.
 *
 * Rows already present in the database win: an operator who has tuned a Stage 6
 * phase there keeps their values.
 */
function withCanonicalStage6Rows(rows: LLMModelConfigFull[]): LLMModelConfigFull[] {
  const present = new Set(
    rows
      .filter(
        row => row.language === 'any' && row.context_tier === 'standard' && row.judge_role == null
      )
      .map(row => row.phase_name)
  );

  const injected: LLMModelConfigFull[] = [];
  for (const phaseName of STAGE6_EXPLICIT_PHASE_NAMES) {
    if (present.has(phaseName)) continue;
    const canonical =
      STAGE6_CANONICAL_PHASE_DEFAULTS[phaseName as keyof typeof STAGE6_CANONICAL_PHASE_DEFAULTS];
    if (!canonical) continue;

    injected.push({
      id: `canonical-${phaseName}`,
      config_type: 'global',
      course_id: null,
      phase_name: phaseName,
      model_id: canonical.modelId,
      fallback_model_id: canonical.fallbackModelId,
      temperature: canonical.temperature.toFixed(2),
      max_tokens: canonical.maxTokens,
      is_active: true,
      language: 'any',
      context_tier: 'standard',
      threshold_tokens: null,
      cache_read_enabled: canonical.cacheReadEnabled,
      stage_number: 6,
      max_context_tokens: canonical.maxContextTokens,
      reasoning_enabled: false,
      reasoning_effort: null,
      reasoning_max_tokens: null,
      primary_display_name: null,
      fallback_display_name: null,
      judge_role: null,
      weight: null,
      quality_threshold: canonical.qualityThreshold?.toFixed(2) ?? null,
      max_retries: canonical.maxRetries,
      timeout_ms: canonical.timeoutMs,
    } as LLMModelConfigFull);
  }

  if (injected.length > 0) {
    logger.info(
      `[Config Seed] Added ${injected.length} canonical Stage 6 phase(s) absent from the database: ${injected
        .map(row => row.phase_name)
        .join(', ')}`
    );
  }

  return [...rows, ...injected];
}

/**
 * Extract only the essential fields needed for runtime config
 */
function toSeedConfig(config: LLMModelConfigFull): LLMModelConfigSeed {
  return {
    id: config.id,
    config_type: config.config_type,
    course_id: config.course_id,
    phase_name: config.phase_name,
    model_id: normalizeRuntimeModelId(config.model_id) ?? config.model_id,
    fallback_model_id: normalizeRuntimeModelId(config.fallback_model_id),
    temperature: config.temperature,
    max_tokens: config.max_tokens,
    is_active: config.is_active,
    language: config.language,
    context_tier: config.context_tier,
    threshold_tokens: config.threshold_tokens,
    cache_read_enabled: config.cache_read_enabled,
    stage_number: config.stage_number,
    max_context_tokens: config.max_context_tokens,
    primary_display_name: config.primary_display_name,
    fallback_display_name: config.fallback_display_name,
    judge_role: config.judge_role,
    weight: config.weight,
    quality_threshold: config.quality_threshold,
    max_retries: config.max_retries,
    timeout_ms: config.timeout_ms,
    // Without these the offline seed silently drops reasoning, so a database
    // outage would quietly downgrade the phases that need it most.
    reasoning_enabled: config.reasoning_enabled ?? false,
    reasoning_effort: config.reasoning_effort,
    reasoning_max_tokens: config.reasoning_max_tokens,
  };
}

async function main(): Promise<void> {
  logger.info('[Config Seed] Starting generation...');

  // Ensure directories exist
  const srcConfigDir = path.dirname(SEED_PATH);
  const distDir = path.dirname(DIST_PATH);

  if (!fs.existsSync(srcConfigDir)) {
    fs.mkdirSync(srcConfigDir, { recursive: true });
    logger.info(`[Config Seed] Created directory: ${srcConfigDir}`);
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    }

    logger.info('[Config Seed] Attempting to refresh from database...');

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await supabase
      .from('llm_model_config')
      .select('*')
      .eq('is_active', true)
      .eq('config_type', 'global');

    if (error) throw error;
    if (!data?.length) throw new Error('DB returned empty config list');

    const rows = withCanonicalStage6Rows(data as LLMModelConfigFull[]);

    // VALIDATE: Check for required phases
    const phases = new Set(rows.map(c => String(c.phase_name)));
    const missingPhases = REQUIRED_PHASES.filter(p => !phases.has(p));

    if (missingPhases.length > 0) {
      const availablePhases = Array.from(phases).sort().join(', ');
      throw new Error(
        `VALIDATION FAILED: Missing required phases: ${missingPhases.join(', ')}. Available phases: ${availablePhases}`
      );
    }

    // VALIDATE: Run schema validation on each config
    let invalidCount = 0;
    for (const row of rows) {
      const result = SeedConfigSchema.safeParse(row);
      if (!result.success) {
        logger.error({ errors: result.error.errors }, `[Config Seed] Invalid config: ${row.phase_name}`);
        invalidCount++;
      }
    }

    if (invalidCount > 0) {
      throw new Error(`VALIDATION FAILED: ${invalidCount} invalid config(s) found`);
    }

    logger.info(`[Config Seed] Validation passed: ${rows.length} configs, all required phases present`);

    // Sort by phase_name for consistent output
    const sortedData = rows
      .sort((a, b) => a.phase_name.localeCompare(b.phase_name))
      .map(toSeedConfig);

    // Write to source file (will be committed)
    const content = JSON.stringify(sortedData, null, 2);

    // Validate file size to prevent corrupted database from creating giant seed
    const contentSize = Buffer.byteLength(content, 'utf-8');
    if (contentSize > MAX_SEED_SIZE_BYTES) {
      throw new Error(
        `Seed file too large: ${(contentSize / 1024 / 1024).toFixed(2)}MB exceeds ${MAX_SEED_SIZE_BYTES / 1024 / 1024}MB limit`
      );
    }

    const tmpPath = `${SEED_PATH}.tmp`;

    try {
      // Write to temp file first
      fs.writeFileSync(tmpPath, content);

      // Verify write
      const stat = fs.statSync(tmpPath);
      const expectedSize = Buffer.byteLength(content, 'utf-8');

      if (stat.size !== expectedSize) {
        fs.unlinkSync(tmpPath);
        throw new Error(`File write verification failed: expected ${expectedSize} bytes, got ${stat.size}`);
      }

      // Atomic rename
      fs.renameSync(tmpPath, SEED_PATH);
    } catch (writeErr) {
      // Clean up temp file on failure
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
      throw writeErr;
    }

    logger.info(`[Config Seed] Refreshed: ${sortedData.length} configs fetched and saved to ${SEED_PATH}`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`[Config Seed] DB unavailable during build. Using committed config-seed.json.`);
    logger.warn(`   Reason: ${errorMsg}`);

    if (!fs.existsSync(SEED_PATH)) {
      throw new Error(
        `FATAL: No DB access and no committed seed file found at ${SEED_PATH}. Please ensure config-seed.json exists or provide DB credentials.`
      );
    }

    logger.info(`[Config Seed] Using existing seed file: ${SEED_PATH}`);
  }

  // Copy to dist if dist directory exists (create config subdirectory if needed)
  const distRootDir = path.join(__dirname, '../../dist');
  if (fs.existsSync(distRootDir)) {
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }
    fs.copyFileSync(SEED_PATH, DIST_PATH);
    logger.info(`[Config Seed] Copied to ${DIST_PATH}`);
  } else {
    logger.info(`[Config Seed] Dist directory doesn't exist yet, skipping copy to dist`);
  }

  logger.info('[Config Seed] Generation complete!');
}

main().catch((err) => {
  logger.error({ err }, '[Config Seed] Fatal error:');
  process.exit(1);
});
