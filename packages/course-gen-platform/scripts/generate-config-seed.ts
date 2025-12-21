/**
 * Generate Config Seed Script
 * @module scripts/generate-config-seed
 *
 * Runs during prebuild to refresh LLM model configurations.
 * Uses "Committed Seed" pattern: updates from DB if available,
 * falls back to committed file if DB unreachable.
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

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_PATH = path.join(__dirname, '../src/config/config-seed.json'); // Git-tracked
const DIST_PATH = path.join(__dirname, '../dist/config-seed.json'); // Build artifact
const MAX_SEED_SIZE_BYTES = 10 * 1024 * 1024; // 10MB max

/**
 * Required phases that MUST be present in the seed file
 * If any are missing, the build fails
 */
const REQUIRED_PHASES = [
  'global_default',
  'emergency',
  'stage_2_standard_en',
  'stage_2_standard_ru',
  'stage_4_classification',
  'stage_6_standard_en',
  'stage_6_standard_ru',
];

/**
 * Minimal schema for seed config validation
 */
const SeedConfigSchema = z.object({
  phase_name: z.string().min(1),
  model_id: z.string().min(1),
  context_tier: z.string().nullable(),
  temperature: z.union([z.number(), z.string()]).nullable(),
  max_tokens: z.number().nullable(),
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
    model_id: config.model_id,
    fallback_model_id: config.fallback_model_id,
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
  };
}

async function main(): Promise<void> {
  console.log('[Config Seed] Starting generation...');

  // Ensure directories exist
  const srcConfigDir = path.dirname(SEED_PATH);
  const distDir = path.dirname(DIST_PATH);

  if (!fs.existsSync(srcConfigDir)) {
    fs.mkdirSync(srcConfigDir, { recursive: true });
    console.log(`[Config Seed] Created directory: ${srcConfigDir}`);
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    }

    console.log('[Config Seed] Attempting to refresh from database...');

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

    // VALIDATE: Check for required phases
    const phases = new Set(data.map((c) => c.phase_name));
    const missingPhases = REQUIRED_PHASES.filter((p) => !phases.has(p));

    if (missingPhases.length > 0) {
      const availablePhases = Array.from(phases).sort().join(', ');
      throw new Error(
        `VALIDATION FAILED: Missing required phases: ${missingPhases.join(', ')}. Available phases: ${availablePhases}`
      );
    }

    // VALIDATE: Run schema validation on each config
    let invalidCount = 0;
    for (const row of data as LLMModelConfigFull[]) {
      const result = SeedConfigSchema.safeParse(row);
      if (!result.success) {
        console.error(
          `[Config Seed] Invalid config: ${row.phase_name}`,
          result.error.errors
        );
        invalidCount++;
      }
    }

    if (invalidCount > 0) {
      throw new Error(`VALIDATION FAILED: ${invalidCount} invalid config(s) found`);
    }

    console.log(
      `[Config Seed] Validation passed: ${data.length} configs, all required phases present`
    );

    // Sort by phase_name for consistent output
    const sortedData = (data as LLMModelConfigFull[])
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

    console.log(
      `[Config Seed] Refreshed: ${sortedData.length} configs fetched and saved to ${SEED_PATH}`
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[Config Seed] DB unavailable during build. Using committed config-seed.json.`);
    console.warn(`   Reason: ${errorMsg}`);

    if (!fs.existsSync(SEED_PATH)) {
      throw new Error(
        `FATAL: No DB access and no committed seed file found at ${SEED_PATH}. Please ensure config-seed.json exists or provide DB credentials.`
      );
    }

    console.log(`[Config Seed] Using existing seed file: ${SEED_PATH}`);
  }

  // Copy to dist if dist directory exists
  if (fs.existsSync(distDir)) {
    fs.copyFileSync(SEED_PATH, DIST_PATH);
    console.log(`[Config Seed] Copied to ${DIST_PATH}`);
  } else {
    console.log(`[Config Seed] Dist directory doesn't exist yet, skipping copy to dist`);
  }

  console.log('[Config Seed] Generation complete!');
}

main().catch((err) => {
  console.error('[Config Seed] Fatal error:', err);
  process.exit(1);
});
