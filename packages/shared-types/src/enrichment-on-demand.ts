/**
 * On-Demand Enrichment Generation Types
 * @module @megacampus/shared-types/enrichment-on-demand
 *
 * Types for on-demand enrichment generation API that is called
 * from the course viewer UI when users click "Generate" on placeholder cards.
 *
 * Reference: Phase 2 - API Layer for On-Demand Enrichment Generation
 */

import { z } from 'zod';
import { enrichmentStatusSchema } from './lesson-enrichment';

// ============================================================================
// ON-DEMAND ENRICHMENT TYPES
// ============================================================================

/**
 * Enrichment types that can be generated on-demand
 *
 * Only includes types that users can trigger from the course viewer UI.
 * Excludes auto-generated visual types (cover, card, banner).
 */
export const onDemandEnrichmentTypeSchema = z.enum(['quiz', 'audio', 'presentation']);
export type OnDemandEnrichmentType = z.infer<typeof onDemandEnrichmentTypeSchema>;

// ============================================================================
// ON-DEMAND ENRICHMENT SETTINGS SCHEMAS
// ============================================================================

/**
 * Simplified quiz settings for on-demand API
 *
 * User-facing settings for quiz generation requests.
 * These are transformed into full QuizSettings for workers.
 *
 * @example
 * ```typescript
 * const settings: OnDemandQuizSettings = {
 *   questionCount: 10,
 *   difficulty: 'medium'
 * };
 * ```
 */
export const onDemandQuizSettingsSchema = z.object({
  /** Number of quiz questions to generate (5-15) */
  questionCount: z.number().int().min(5).max(15).default(10),

  /** Difficulty level for quiz questions */
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
});
export type OnDemandQuizSettings = z.infer<typeof onDemandQuizSettingsSchema>;

/**
 * Simplified audio settings for on-demand API
 *
 * User-facing settings for audio generation requests.
 * These are transformed into full AudioSettings for workers.
 *
 * @example
 * ```typescript
 * const settings: OnDemandAudioSettings = {
 *   voice: 'female',
 *   speed: 'normal'
 * };
 * ```
 */
export const onDemandAudioSettingsSchema = z.object({
  /** Voice type for audio narration */
  voice: z.enum(['default', 'male', 'female']).default('default'),

  /** Narration speed */
  speed: z.enum(['slow', 'normal', 'fast']).default('normal'),
});
export type OnDemandAudioSettings = z.infer<typeof onDemandAudioSettingsSchema>;

/**
 * Simplified presentation settings for on-demand API
 *
 * User-facing settings for presentation generation requests.
 * These are transformed into full PresentationSettings for workers.
 *
 * @example
 * ```typescript
 * const settings: OnDemandPresentationSettings = {
 *   slideCount: 8,
 *   theme: 'colorful'
 * };
 * ```
 */
export const onDemandPresentationSettingsSchema = z.object({
  /** Number of slides to generate (5-10) */
  slideCount: z.number().int().min(5).max(10).default(8),

  /** Presentation visual theme */
  theme: z.enum(['light', 'dark', 'colorful']).default('light'),
});
export type OnDemandPresentationSettings = z.infer<typeof onDemandPresentationSettingsSchema>;

/**
 * Union type for all on-demand enrichment settings
 *
 * These are simplified, user-facing settings that differ from
 * the internal worker settings in enrichment-settings.ts
 */
export type OnDemandEnrichmentSettings =
  | OnDemandQuizSettings
  | OnDemandAudioSettings
  | OnDemandPresentationSettings;

/**
 * Generation steps for progress tracking in UI
 *
 * These steps map to the internal processing phases and are used
 * to show meaningful progress feedback to users.
 */
export const generationStepSchema = z.enum([
  'queued', // Job added to queue, waiting to start
  'analyzing_content', // Reading lesson content and context
  'generating', // Running LLM generation or media synthesis
  'finalizing', // Post-processing and validation
  'uploading_assets', // Uploading media files to storage
]);
export type GenerationStep = z.infer<typeof generationStepSchema>;

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * Input schema for generating on-demand enrichment
 *
 * @example
 * ```typescript
 * const input = {
 *   lessonId: 'uuid',
 *   enrichmentType: 'quiz',
 *   settings: { questionCount: 5, difficulty: 'easy' }
 * };
 * ```
 */
export const generateOnDemandInputSchema = z.object({
  /** Target lesson UUID */
  lessonId: z.string().uuid('Invalid lesson ID'),

  /** Type of enrichment to generate */
  enrichmentType: onDemandEnrichmentTypeSchema,

  /** Optional type-specific generation settings */
  settings: z
    .union([
      onDemandQuizSettingsSchema,
      onDemandAudioSettingsSchema,
      onDemandPresentationSettingsSchema,
    ])
    .optional(),
});
export type GenerateOnDemandInput = z.infer<typeof generateOnDemandInputSchema>;

/**
 * Input schema for polling generation status
 */
export const getGenerationStatusInputSchema = z.object({
  /** Enrichment UUID to check status for */
  enrichmentId: z.string().uuid('Invalid enrichment ID'),
});
export type GetGenerationStatusInput = z.infer<typeof getGenerationStatusInputSchema>;

// ============================================================================
// OUTPUT SCHEMAS
// ============================================================================

/**
 * Response schema for generate on-demand mutation
 *
 * Returns the created enrichment ID and initial status for
 * the UI to start polling.
 */
export const generateOnDemandResponseSchema = z.object({
  /** Created enrichment UUID */
  enrichmentId: z.string().uuid(),

  /** Initial status (always 'pending') */
  status: enrichmentStatusSchema,

  /** BullMQ job ID for debugging */
  jobId: z.string().optional(),
});
export type GenerateOnDemandResponse = z.infer<typeof generateOnDemandResponseSchema>;

/**
 * Response schema for status polling query
 *
 * Provides progress information for UI display.
 */
export const generationStatusResponseSchema = z.object({
  /** Current enrichment status */
  status: enrichmentStatusSchema,

  /** Progress percentage (0-100) */
  progress: z.number().min(0).max(100),

  /** Current generation step for UI display */
  currentStep: generationStepSchema.optional(),

  /** Estimated time remaining in seconds */
  estimatedTimeRemaining: z.number().optional(),

  /** Error message if status is 'failed' */
  error: z.string().optional(),
});
export type GenerationStatusResponse = z.infer<typeof generationStatusResponseSchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Progress percentages for each enrichment status
 *
 * These values provide visual feedback to users during generation:
 * - pending: Job queued but not started (0%)
 * - draft_generating: Creating draft content (25%)
 * - draft_ready: Draft complete, awaiting final generation (50%)
 * - generating: Final generation in progress (75%)
 * - completed: Generation finished (100%)
 * - failed/cancelled: Reset to 0%
 */
const PROGRESS_PENDING = 0;
const PROGRESS_DRAFT_GENERATING = 25;
const PROGRESS_DRAFT_READY = 50;
const PROGRESS_GENERATING = 75;
const PROGRESS_COMPLETED = 100;

/**
 * Map enrichment status to progress percentage
 *
 * Used to convert database status to UI progress display.
 *
 * @param status - Current enrichment status
 * @returns Progress percentage (0-100)
 */
export function statusToProgress(status: z.infer<typeof enrichmentStatusSchema>): number {
  const progressMap: Record<z.infer<typeof enrichmentStatusSchema>, number> = {
    pending: PROGRESS_PENDING,
    draft_generating: PROGRESS_DRAFT_GENERATING,
    draft_ready: PROGRESS_DRAFT_READY,
    generating: PROGRESS_GENERATING,
    completed: PROGRESS_COMPLETED,
    failed: 0,
    cancelled: 0,
  };

  return progressMap[status] ?? 0;
}

/**
 * Map enrichment status to generation step
 *
 * Used to provide meaningful step labels in the UI.
 *
 * @param status - Current enrichment status
 * @returns Generation step or undefined if not applicable
 */
export function statusToStep(
  status: z.infer<typeof enrichmentStatusSchema>
): GenerationStep | undefined {
  const stepMap: Partial<Record<z.infer<typeof enrichmentStatusSchema>, GenerationStep>> = {
    pending: 'queued',
    draft_generating: 'analyzing_content',
    draft_ready: 'generating',
    generating: 'generating',
  };

  return stepMap[status];
}

/**
 * Check if enrichment type is valid for on-demand generation
 *
 * @param type - Enrichment type to check
 * @returns True if type can be generated on-demand
 */
export function isOnDemandType(type: string): type is OnDemandEnrichmentType {
  return onDemandEnrichmentTypeSchema.safeParse(type).success;
}
