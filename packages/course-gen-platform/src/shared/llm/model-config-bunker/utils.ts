import logger from '../../logger/index.js';
import type { PhaseModelConfig } from '../model-config-types.js';
import type { ValidatedConfigRow } from './schemas.js';

/**
 * Build cache key from config row
 *
 * Key format: "phase:tier" or "phase:tier:language"
 * Language is omitted if it's "any" to enable fallback matching
 * context_tier defaults to "standard" if null
 *
 * @param row Config row with phase_name, context_tier, and optional language
 * @returns Cache key string
 */
export function buildKey(row: {
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
export function parseFloatSafe(
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
export function rowToConfig(row: ValidatedConfigRow): PhaseModelConfig {
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
