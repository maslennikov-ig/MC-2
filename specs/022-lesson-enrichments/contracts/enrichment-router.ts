/**
 * tRPC Router Contract: Lesson Enrichments
 *
 * This file defines the contract for the enrichment tRPC router.
 * Implementation should follow these schemas exactly.
 */

import { z } from 'zod';

// ============================================================================
// SHARED SCHEMAS
// ============================================================================

export const enrichmentTypeSchema = z.enum([
  'video',
  'audio',
  'presentation',
  'quiz',
  'document',
]);

export const enrichmentStatusSchema = z.enum([
  'pending',
  'generating',
  'completed',
  'failed',
  'cancelled',
]);

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/** Create single enrichment */
export const createEnrichmentInputSchema = z.object({
  lessonId: z.string().uuid(),
  enrichmentType: enrichmentTypeSchema,
  settings: z
    .object({
      voice_id: z.string().optional(),
      theme: z.string().optional(),
      question_count: z.number().min(3).max(20).optional(),
    })
    .optional(),
});

/** Create batch enrichments for multiple lessons */
export const createBatchEnrichmentInputSchema = z.object({
  lessonIds: z.array(z.string().uuid()).min(1).max(100),
  enrichmentType: enrichmentTypeSchema,
  settings: z
    .object({
      voice_id: z.string().optional(),
      theme: z.string().optional(),
      question_count: z.number().min(3).max(20).optional(),
    })
    .optional(),
});

/** Get enrichments by lesson */
export const getByLessonInputSchema = z.object({
  lessonId: z.string().uuid(),
});

/** Get summary by course (for graph nodes) */
export const getSummaryByCourseInputSchema = z.object({
  courseId: z.string().uuid(),
});

/** Regenerate failed enrichment */
export const regenerateEnrichmentInputSchema = z.object({
  enrichmentId: z.string().uuid(),
});

/** Delete enrichment */
export const deleteEnrichmentInputSchema = z.object({
  enrichmentId: z.string().uuid(),
});

/** Reorder enrichments within lesson */
export const reorderEnrichmentsInputSchema = z.object({
  lessonId: z.string().uuid(),
  orderedIds: z.array(z.string().uuid()).min(1),
});

/** Cancel in-progress enrichment */
export const cancelEnrichmentInputSchema = z.object({
  enrichmentId: z.string().uuid(),
});

/** Get playback URL for media enrichment */
export const getPlaybackUrlInputSchema = z.object({
  enrichmentId: z.string().uuid(),
});

// ============================================================================
// OUTPUT SCHEMAS
// ============================================================================

/** Enrichment summary for React Flow nodes */
export const enrichmentSummarySchema = z.object({
  type: enrichmentTypeSchema,
  status: enrichmentStatusSchema,
  hasError: z.boolean(),
  title: z.string().optional(),
});

/** Full enrichment record */
export const lessonEnrichmentSchema = z.object({
  id: z.string().uuid(),
  lesson_id: z.string().uuid(),
  course_id: z.string().uuid(),
  enrichment_type: enrichmentTypeSchema,
  order_index: z.number(),
  title: z.string().nullable(),
  content: z.record(z.unknown()),
  asset_id: z.string().uuid().nullable(),
  status: enrichmentStatusSchema,
  generation_attempt: z.number(),
  error_message: z.string().nullable(),
  error_details: z.record(z.unknown()).nullable(),
  metadata: z.record(z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
  generated_at: z.string().nullable(),
});

/** Create enrichment response */
export const createEnrichmentOutputSchema = z.object({
  success: z.boolean(),
  enrichmentId: z.string().uuid(),
  status: enrichmentStatusSchema,
  jobId: z.string().optional(),
});

/** Batch create response */
export const createBatchEnrichmentOutputSchema = z.object({
  success: z.boolean(),
  created: z.number(),
  enrichmentIds: z.array(z.string().uuid()),
  jobIds: z.array(z.string()).optional(),
});

/** Get by lesson response */
export const getByLessonOutputSchema = z.array(lessonEnrichmentSchema);

/** Get summary response (keyed by lessonId) */
export const getSummaryByCourseOutputSchema = z.record(
  z.string().uuid(), // lessonId
  z.array(enrichmentSummarySchema)
);

/** Regenerate response */
export const regenerateEnrichmentOutputSchema = z.object({
  success: z.boolean(),
  enrichmentId: z.string().uuid(),
  newJobId: z.string().optional(),
});

/** Delete response */
export const deleteEnrichmentOutputSchema = z.object({
  success: z.boolean(),
  deleted: z.boolean(),
});

/** Reorder response */
export const reorderEnrichmentsOutputSchema = z.object({
  success: z.boolean(),
  newOrder: z.array(z.string().uuid()),
});

/** Cancel response */
export const cancelEnrichmentOutputSchema = z.object({
  success: z.boolean(),
  cancelled: z.boolean(),
});

/** Playback URL response */
export const getPlaybackUrlOutputSchema = z.object({
  url: z.string().url().nullable(),
  expiresAt: z.string().datetime().nullable(),
});

// ============================================================================
// ROUTER DEFINITION (Contract)
// ============================================================================

/**
 * Enrichment Router Procedures
 *
 * All procedures use protectedProcedure (require authentication)
 */
export const enrichmentRouterContract = {
  /**
   * Create a single enrichment for a lesson
   * Inserts record with status: pending and enqueues BullMQ job
   */
  create: {
    input: createEnrichmentInputSchema,
    output: createEnrichmentOutputSchema,
    method: 'mutation' as const,
  },

  /**
   * Create enrichments for multiple lessons (batch operation)
   * Useful for "Generate audio for all lessons in module"
   */
  createBatch: {
    input: createBatchEnrichmentInputSchema,
    output: createBatchEnrichmentOutputSchema,
    method: 'mutation' as const,
  },

  /**
   * Get all enrichments for a specific lesson
   * Returns full enrichment records ordered by type and order_index
   */
  getByLesson: {
    input: getByLessonInputSchema,
    output: getByLessonOutputSchema,
    method: 'query' as const,
  },

  /**
   * Get enrichment summary for all lessons in a course
   * Returns lightweight data for React Flow node display
   */
  getSummaryByCourse: {
    input: getSummaryByCourseInputSchema,
    output: getSummaryByCourseOutputSchema,
    method: 'query' as const,
  },

  /**
   * Regenerate a failed enrichment
   * Increments generation_attempt, resets status to pending, enqueues new job
   */
  regenerate: {
    input: regenerateEnrichmentInputSchema,
    output: regenerateEnrichmentOutputSchema,
    method: 'mutation' as const,
  },

  /**
   * Delete an enrichment
   * Also deletes associated asset from storage if exists
   */
  delete: {
    input: deleteEnrichmentInputSchema,
    output: deleteEnrichmentOutputSchema,
    method: 'mutation' as const,
  },

  /**
   * Reorder enrichments within a lesson
   * Updates order_index for all specified enrichments
   */
  reorder: {
    input: reorderEnrichmentsInputSchema,
    output: reorderEnrichmentsOutputSchema,
    method: 'mutation' as const,
  },

  /**
   * Cancel an in-progress enrichment generation
   * Sets status to cancelled, signals worker to abort
   */
  cancel: {
    input: cancelEnrichmentInputSchema,
    output: cancelEnrichmentOutputSchema,
    method: 'mutation' as const,
  },

  /**
   * Get signed playback URL for media enrichments
   * Returns 1-hour signed URL for audio/video assets
   */
  getPlaybackUrl: {
    input: getPlaybackUrlInputSchema,
    output: getPlaybackUrlOutputSchema,
    method: 'query' as const,
  },
};

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type EnrichmentType = z.infer<typeof enrichmentTypeSchema>;
export type EnrichmentStatus = z.infer<typeof enrichmentStatusSchema>;
export type EnrichmentSummary = z.infer<typeof enrichmentSummarySchema>;
export type LessonEnrichment = z.infer<typeof lessonEnrichmentSchema>;
export type CreateEnrichmentInput = z.infer<typeof createEnrichmentInputSchema>;
export type CreateBatchEnrichmentInput = z.infer<typeof createBatchEnrichmentInputSchema>;
