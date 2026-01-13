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
 *   settings: { questionCount: 5 }
 * };
 * ```
 */
export const generateOnDemandInputSchema = z.object({
  /** Target lesson UUID */
  lessonId: z.string().uuid('Invalid lesson ID'),

  /** Type of enrichment to generate */
  enrichmentType: onDemandEnrichmentTypeSchema,

  /** Optional type-specific generation settings */
  settings: z.record(z.unknown()).optional(),
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
 * Map enrichment status to progress percentage
 *
 * Used to convert database status to UI progress display.
 *
 * @param status - Current enrichment status
 * @returns Progress percentage (0-100)
 */
export function statusToProgress(status: z.infer<typeof enrichmentStatusSchema>): number {
  const progressMap: Record<z.infer<typeof enrichmentStatusSchema>, number> = {
    pending: 0,
    draft_generating: 25,
    draft_ready: 50,
    generating: 75,
    completed: 100,
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
