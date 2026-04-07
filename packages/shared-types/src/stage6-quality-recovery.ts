import { z } from 'zod';

export const STAGE6_AUTOMATIC_QUALITY_RUNGS = [
  'stage_6_simple',
  'stage_6_normal',
  'stage_6_complex',
  'stage_6_auto_last_chance',
] as const;

export const STAGE6_MANUAL_QUALITY_RUNG = 'stage_6_manual_regeneration' as const;

export const STAGE6_QUALITY_RUNGS = [
  ...STAGE6_AUTOMATIC_QUALITY_RUNGS,
  STAGE6_MANUAL_QUALITY_RUNG,
] as const;

export const STAGE6_QUALITY_RUNG_MODEL_IDS = {
  stage_6_auto_last_chance: 'z-ai/glm-5',
  stage_6_manual_regeneration: 'openai/gpt-5.4',
} as const;

export const Stage6AutomaticQualityRungPhaseNameSchema = z.enum(STAGE6_AUTOMATIC_QUALITY_RUNGS);
export type Stage6AutomaticQualityRungPhaseName = z.infer<
  typeof Stage6AutomaticQualityRungPhaseNameSchema
>;

export const Stage6QualityRungPhaseNameSchema = z.enum(STAGE6_QUALITY_RUNGS);
export type Stage6QualityRungPhaseName = z.infer<typeof Stage6QualityRungPhaseNameSchema>;

export const QualityRecoveryModeSchema = z.enum(['automatic', 'manual']);
export type QualityRecoveryMode = z.infer<typeof QualityRecoveryModeSchema>;

export const QualityRecoveryAttemptSchema = z.object({
  sequence_index: z.number().int().nonnegative(),
  phase_name: Stage6QualityRungPhaseNameSchema,
  mode: QualityRecoveryModeSchema,
  is_initial_rung: z.boolean(),
  promoted_from_phase_name: Stage6QualityRungPhaseNameSchema.optional(),
  max_regeneration_retries: z.number().int().min(0),
  manual_triggered: z.boolean().optional(),
});

export type QualityRecoveryAttempt = z.infer<typeof QualityRecoveryAttemptSchema>;

export const QualityRecoveryFinalDispositionSchema = z.object({
  outcome: z.enum(['completed', 'review_required']),
  terminal_phase_name: Stage6QualityRungPhaseNameSchema,
  terminal_mode: QualityRecoveryModeSchema,
  human_review_required: z.boolean(),
});

export type QualityRecoveryFinalDisposition = z.infer<typeof QualityRecoveryFinalDispositionSchema>;

export const QualityRecoverySchema = z.object({
  mode: QualityRecoveryModeSchema,
  attempts: z.array(QualityRecoveryAttemptSchema),
  final_disposition: QualityRecoveryFinalDispositionSchema.optional(),
  manual_triggered: z.boolean().optional(),
});

export type QualityRecovery = z.infer<typeof QualityRecoverySchema>;
