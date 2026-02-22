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
 * Includes types that users can trigger from the course viewer UI:
 * - quiz: Interactive quizzes
 * - audio: Lesson narration
 * - nlm_audio: NotebookLM audio narration
 * - presentation: Slide decks
 * - nlm_video: NotebookLM video overview
 * - cover: Lesson hero images (16:9 banners)
 * - card: Lesson thumbnails (1:1 square images)
 */
export const onDemandEnrichmentTypeSchema = z.enum([
  'quiz',
  'audio',
  'nlm_audio',
  'presentation',
  'nlm_video',
  'cover',
  'card',
]);
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
 * Source strategy for NotebookLM enrichments.
 */
export const onDemandNlmSourceStrategySchema = z.enum(['script_only', 'raw_only', 'hybrid']);
export type OnDemandNlmSourceStrategy = z.infer<typeof onDemandNlmSourceStrategySchema>;

/**
 * NotebookLM audio settings for on-demand API.
 *
 * Includes draft-shaping hints and final artifact presets.
 */
export const onDemandNlmAudioSettingsSchema = z.object({
  /** Optional draft voice hint */
  voice: z.string().optional(),

  /** Optional draft speed hint */
  speed: z.union([z.number().min(0.25).max(4), z.enum(['slow', 'normal', 'fast'])]).optional(),

  /** Source strategy used for NotebookLM generation */
  nlm_source_strategy: onDemandNlmSourceStrategySchema.optional(),

  /** NotebookLM audio format preset */
  nlm_audio_format: z.enum(['deep_dive', 'brief', 'critique', 'debate']).optional(),

  /** NotebookLM audio length preset */
  nlm_audio_length: z.enum(['short', 'default', 'long']).optional(),
});
export type OnDemandNlmAudioSettings = z.infer<typeof onDemandNlmAudioSettingsSchema>;

/**
 * NotebookLM video settings for on-demand API.
 *
 * Includes draft script hints and final artifact presets.
 */
export const onDemandNlmVideoSettingsSchema = z.object({
  /** Optional draft tone hint */
  tone: z.enum(['professional', 'conversational', 'energetic']).optional(),

  /** Optional draft pacing hint */
  pacing: z.enum(['slow', 'moderate', 'fast']).optional(),

  /** Optional avatar identifier */
  avatar_id: z.string().optional(),

  /** Source strategy used for NotebookLM generation */
  nlm_source_strategy: onDemandNlmSourceStrategySchema.optional(),

  /** NotebookLM video format preset */
  nlm_video_format: z.enum(['explainer', 'brief']).optional(),

  /** NotebookLM video style preset */
  nlm_video_style: z
    .enum([
      'auto_select',
      'custom',
      'classic',
      'whiteboard',
      'kawaii',
      'anime',
      'watercolor',
      'retro_print',
      'heritage',
      'paper_craft',
    ])
    .optional(),
});
export type OnDemandNlmVideoSettings = z.infer<typeof onDemandNlmVideoSettingsSchema>;

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
 * Simplified image settings for on-demand API
 *
 * User-facing settings for cover/card image generation requests.
 * These are transformed into full ImageSettings for workers.
 *
 * @example
 * ```typescript
 * const settings: OnDemandImageSettings = {
 *   style: 'realistic',
 *   colorScheme: 'warm'
 * };
 * ```
 */
export const onDemandImageSettingsSchema = z.object({
  /** Visual style for image generation */
  style: z
    .enum(['premium3d', 'realistic', 'abstract', 'minimalist', 'dramatic'])
    .default('premium3d'),

  /** Color scheme preference */
  colorScheme: z.enum(['auto', 'warm', 'cool', 'monochrome']).default('auto'),
});
export type OnDemandImageSettings = z.infer<typeof onDemandImageSettingsSchema>;

/**
 * Union type for all on-demand enrichment settings
 *
 * These are simplified, user-facing settings that differ from
 * the internal worker settings in enrichment-settings.ts
 */
export type OnDemandEnrichmentSettings =
  | OnDemandNlmAudioSettings
  | OnDemandNlmVideoSettings
  | OnDemandQuizSettings
  | OnDemandAudioSettings
  | OnDemandPresentationSettings
  | OnDemandImageSettings;

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
const lessonIdInputSchema = z.string().uuid('Invalid lesson ID');

const onDemandQuizInputSchema = z.object({
  lessonId: lessonIdInputSchema,
  enrichmentType: z.literal('quiz'),
  settings: onDemandQuizSettingsSchema.optional(),
});

const onDemandAudioInputSchema = z.object({
  lessonId: lessonIdInputSchema,
  enrichmentType: z.literal('audio'),
  settings: onDemandAudioSettingsSchema.optional(),
});

const onDemandNlmAudioInputSchema = z.object({
  lessonId: lessonIdInputSchema,
  enrichmentType: z.literal('nlm_audio'),
  settings: onDemandNlmAudioSettingsSchema.optional(),
});

const onDemandPresentationInputSchema = z.object({
  lessonId: lessonIdInputSchema,
  enrichmentType: z.literal('presentation'),
  settings: onDemandPresentationSettingsSchema.optional(),
});

const onDemandNlmVideoInputSchema = z.object({
  lessonId: lessonIdInputSchema,
  enrichmentType: z.literal('nlm_video'),
  settings: onDemandNlmVideoSettingsSchema.optional(),
});

const onDemandCoverInputSchema = z.object({
  lessonId: lessonIdInputSchema,
  enrichmentType: z.literal('cover'),
  settings: onDemandImageSettingsSchema.optional(),
});

const onDemandCardInputSchema = z.object({
  lessonId: lessonIdInputSchema,
  enrichmentType: z.literal('card'),
  settings: onDemandImageSettingsSchema.optional(),
});

export const generateOnDemandInputSchema = z.discriminatedUnion('enrichmentType', [
  onDemandQuizInputSchema,
  onDemandAudioInputSchema,
  onDemandNlmAudioInputSchema,
  onDemandPresentationInputSchema,
  onDemandNlmVideoInputSchema,
  onDemandCoverInputSchema,
  onDemandCardInputSchema,
]);
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

// ============================================================================
// UI STATUS HELPERS
// ============================================================================

/**
 * Statuses that should show progress bar (active generation without user interaction)
 *
 * Note: `draft_ready` is NOT included - it requires user selection.
 * Use `isAwaitingSelection()` to check for draft_ready.
 */
export const PROGRESS_BAR_STATUSES = ['pending', 'draft_generating', 'generating'] as const;
export type ProgressBarStatus = (typeof PROGRESS_BAR_STATUSES)[number];

/**
 * Check if status should show progress bar (active generation, NOT awaiting selection)
 *
 * Use this instead of `isActiveGenerationStatus` when deciding whether to show
 * the progress bar UI. For `draft_ready` status, show variant selection instead.
 *
 * @param status - Current enrichment status
 * @returns True if progress bar should be shown
 */
export function isProgressBarStatus(status: string): status is ProgressBarStatus {
  return (PROGRESS_BAR_STATUSES as readonly string[]).includes(status);
}

/**
 * Check if status is awaiting user selection (draft_ready)
 *
 * When this returns true, the UI should show variant selection component
 * instead of progress bar. Applies to two-stage enrichments (video, presentation).
 *
 * @param status - Current enrichment status
 * @returns True if user needs to select a variant
 */
export function isAwaitingSelection(status: string): boolean {
  return status === 'draft_ready';
}

/**
 * Enrichment types that use two-stage generation (draft → selection → final)
 *
 * Two-stage flow:
 *   pending -> draft_generating -> draft_ready -> generating -> completed/failed
 *
 * - video: Standard video generation with draft script review
 * - presentation: Slide deck with draft outline review
 */
export const TWO_STAGE_ENRICHMENT_TYPES = ['video', 'presentation'] as const;

/**
 * Type for two-stage enrichment types.
 */
export type TwoStageEnrichmentType = (typeof TWO_STAGE_ENRICHMENT_TYPES)[number];

/**
 * Check if enrichment type uses two-stage generation
 *
 * @param type - Enrichment type to check
 * @returns True if type uses draft -> final two-stage flow
 */
export function isTwoStageType(type: string): type is TwoStageEnrichmentType {
  return (TWO_STAGE_ENRICHMENT_TYPES as readonly string[]).includes(type);
}

/**
 * Get the next progress milestone for a given current progress
 *
 * Used for asymptotic progress animation - smooth progress should never
 * exceed the next milestone until the actual status changes.
 *
 * Milestones: 0% → 25% → 50% → 75% → 100%
 *
 * @param currentProgress - Current progress percentage (0-100)
 * @returns Next milestone percentage
 */
export function getNextMilestone(currentProgress: number): number {
  if (currentProgress < 25) return 25;
  if (currentProgress < 50) return 50;
  if (currentProgress < 75) return 75;
  return 100;
}
