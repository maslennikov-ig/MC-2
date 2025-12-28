/**
 * Enrichment Router Input/Output Schemas
 * @module server/routers/enrichment/schemas
 *
 * Zod validation schemas for enrichment tRPC procedures.
 * Uses shared schemas from @megacampus/shared-types for core entities.
 */

import { z } from 'zod';
import {
  enrichmentTypeSchema,
  enrichmentStatusSchema,
  createEnrichmentInputSchema,
  createBatchEnrichmentInputSchema,
  lessonEnrichmentBaseSchema,
  enrichmentSummarySchema,
} from '@megacampus/shared-types';

// ============================================================================
// RE-EXPORTS FROM SHARED-TYPES
// ============================================================================

export {
  enrichmentTypeSchema,
  enrichmentStatusSchema,
  createEnrichmentInputSchema,
  createBatchEnrichmentInputSchema,
  lessonEnrichmentBaseSchema,
  enrichmentSummarySchema,
};

// ============================================================================
// INPUT SCHEMAS (Additional)
// ============================================================================

/**
 * Get enrichments by lesson ID
 */
export const getByLessonInputSchema = z.object({
  /** Lesson UUID */
  lessonId: z.string().uuid('Invalid lesson ID'),
});

/**
 * Get enrichment summary for a course (for React Flow nodes)
 */
export const getSummaryByCourseInputSchema = z.object({
  /** Course UUID */
  courseId: z.string().uuid('Invalid course ID'),
});

/**
 * Regenerate a failed enrichment
 */
export const regenerateEnrichmentInputSchema = z.object({
  /** Enrichment UUID */
  enrichmentId: z.string().uuid('Invalid enrichment ID'),
});

/**
 * Delete an enrichment
 */
export const deleteEnrichmentInputSchema = z.object({
  /** Enrichment UUID */
  enrichmentId: z.string().uuid('Invalid enrichment ID'),
});

/**
 * Reorder enrichments within a lesson
 */
export const reorderEnrichmentsInputSchema = z.object({
  /** Lesson UUID */
  lessonId: z.string().uuid('Invalid lesson ID'),
  /** Ordered array of enrichment UUIDs */
  orderedIds: z.array(z.string().uuid('Invalid enrichment ID')).min(1),
});

/**
 * Cancel an in-progress enrichment
 */
export const cancelEnrichmentInputSchema = z.object({
  /** Enrichment UUID */
  enrichmentId: z.string().uuid('Invalid enrichment ID'),
});

/**
 * Get signed playback URL for media enrichments
 */
export const getPlaybackUrlInputSchema = z.object({
  /** Enrichment UUID */
  enrichmentId: z.string().uuid('Invalid enrichment ID'),
});

/**
 * Regenerate draft for two-stage enrichments (video/presentation)
 */
export const regenerateDraftInputSchema = z.object({
  /** Enrichment UUID */
  enrichmentId: z.string().uuid('Invalid enrichment ID'),
});

/**
 * Update draft content for two-stage enrichments
 */
export const updateDraftInputSchema = z.object({
  /** Enrichment UUID */
  enrichmentId: z.string().uuid('Invalid enrichment ID'),
  /** Updated draft content */
  draftContent: z.record(z.unknown()),
});

/**
 * Approve draft and trigger final generation
 */
export const approveDraftInputSchema = z.object({
  /** Enrichment UUID */
  enrichmentId: z.string().uuid('Invalid enrichment ID'),
});

// ============================================================================
// OUTPUT SCHEMAS
// ============================================================================

/**
 * Create enrichment response
 */
export const createEnrichmentOutputSchema = z.object({
  success: z.boolean(),
  enrichmentId: z.string().uuid(),
  status: enrichmentStatusSchema,
  jobId: z.string().optional(),
});

/**
 * Batch create response
 */
export const createBatchEnrichmentOutputSchema = z.object({
  success: z.boolean(),
  created: z.number(),
  enrichmentIds: z.array(z.string().uuid()),
  jobIds: z.array(z.string()).optional(),
});

/**
 * Get by lesson response (array of enrichments)
 */
export const getByLessonOutputSchema = z.array(lessonEnrichmentBaseSchema);

/**
 * Get summary by course response (keyed by lessonId)
 */
export const getSummaryByCourseOutputSchema = z.record(
  z.string().uuid(),
  z.array(enrichmentSummarySchema)
);

/**
 * Regenerate enrichment response
 */
export const regenerateEnrichmentOutputSchema = z.object({
  success: z.boolean(),
  enrichmentId: z.string().uuid(),
  newJobId: z.string().optional(),
});

/**
 * Delete enrichment response
 */
export const deleteEnrichmentOutputSchema = z.object({
  success: z.boolean(),
  deleted: z.boolean(),
});

/**
 * Reorder enrichments response
 */
export const reorderEnrichmentsOutputSchema = z.object({
  success: z.boolean(),
  newOrder: z.array(z.string().uuid()),
});

/**
 * Cancel enrichment response
 */
export const cancelEnrichmentOutputSchema = z.object({
  success: z.boolean(),
  cancelled: z.boolean(),
});

/**
 * Playback URL response
 */
export const getPlaybackUrlOutputSchema = z.object({
  url: z.string().url().nullable(),
  expiresAt: z.string().datetime().nullable(),
});

/**
 * Regenerate draft response
 */
export const regenerateDraftOutputSchema = z.object({
  success: z.boolean(),
  enrichmentId: z.string().uuid(),
  newJobId: z.string().optional(),
});

/**
 * Update draft response
 */
export const updateDraftOutputSchema = z.object({
  success: z.boolean(),
});

/**
 * Approve draft response
 */
export const approveDraftOutputSchema = z.object({
  success: z.boolean(),
  enrichmentId: z.string().uuid(),
  jobId: z.string().optional(),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type GetByLessonInput = z.infer<typeof getByLessonInputSchema>;
export type GetSummaryByCourseInput = z.infer<typeof getSummaryByCourseInputSchema>;
export type RegenerateEnrichmentInput = z.infer<typeof regenerateEnrichmentInputSchema>;
export type DeleteEnrichmentInput = z.infer<typeof deleteEnrichmentInputSchema>;
export type ReorderEnrichmentsInput = z.infer<typeof reorderEnrichmentsInputSchema>;
export type CancelEnrichmentInput = z.infer<typeof cancelEnrichmentInputSchema>;
export type GetPlaybackUrlInput = z.infer<typeof getPlaybackUrlInputSchema>;
export type RegenerateDraftInput = z.infer<typeof regenerateDraftInputSchema>;
export type UpdateDraftInput = z.infer<typeof updateDraftInputSchema>;
export type ApproveDraftInput = z.infer<typeof approveDraftInputSchema>;

export type CreateEnrichmentOutput = z.infer<typeof createEnrichmentOutputSchema>;
export type CreateBatchEnrichmentOutput = z.infer<typeof createBatchEnrichmentOutputSchema>;
export type GetByLessonOutput = z.infer<typeof getByLessonOutputSchema>;
export type GetSummaryByCourseOutput = z.infer<typeof getSummaryByCourseOutputSchema>;
export type RegenerateEnrichmentOutput = z.infer<typeof regenerateEnrichmentOutputSchema>;
export type DeleteEnrichmentOutput = z.infer<typeof deleteEnrichmentOutputSchema>;
export type ReorderEnrichmentsOutput = z.infer<typeof reorderEnrichmentsOutputSchema>;
export type CancelEnrichmentOutput = z.infer<typeof cancelEnrichmentOutputSchema>;
export type GetPlaybackUrlOutput = z.infer<typeof getPlaybackUrlOutputSchema>;
export type RegenerateDraftOutput = z.infer<typeof regenerateDraftOutputSchema>;
export type UpdateDraftOutput = z.infer<typeof updateDraftOutputSchema>;
export type ApproveDraftOutput = z.infer<typeof approveDraftOutputSchema>;
