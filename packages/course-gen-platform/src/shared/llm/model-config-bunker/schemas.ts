import { z } from 'zod';

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
export const ConfigRowSchema = z.object({
  phase_name: z.string().min(1),
  context_tier: z.enum(['standard', 'extended']).nullable(),
  model_id: z.string().min(1),
  fallback_model_id: z.string().nullable(),
  temperature: z
    .union([z.number(), z.string()])
    .transform(v => (typeof v === 'string' ? parseFloat(v) : v))
    .pipe(z.number().min(0).max(2))
    .nullable(),
  max_tokens: z.number().int().positive().max(200000).nullable(),
  max_context_tokens: z.number().int().positive().max(2000000).nullable(),
  quality_threshold: z
    .union([z.number(), z.string()])
    .transform(v => (typeof v === 'string' ? parseFloat(v) : v))
    .pipe(z.number().min(0).max(1))
    .nullable()
    .optional(),
  max_retries: z.number().int().min(0).max(10).nullable().optional(),
  timeout_ms: z.number().int().positive().nullable().optional(),
  language: z.string().optional(),
  stage_number: z.number().int().min(2).max(7).nullable().optional(),
  judge_role: z.enum(['primary', 'secondary', 'tiebreaker']).nullable().optional(),
  weight: z
    .union([z.number(), z.string()])
    .transform(v => (typeof v === 'string' ? parseFloat(v) : v))
    .pipe(z.number().min(0).max(1))
    .nullable()
    .optional(),
});

/**
 * Type inferred from ConfigRowSchema after Zod validation
 * Used for type-safe access to validated config rows
 */
export type ValidatedConfigRow = z.infer<typeof ConfigRowSchema>;
