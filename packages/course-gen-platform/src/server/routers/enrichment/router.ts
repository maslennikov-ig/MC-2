/**
 * Enrichment Router
 * @module server/routers/enrichment/router
 *
 * Provides API endpoints for lesson enrichment operations (Stage 7).
 * This router handles creating, managing, and retrieving enrichments
 * including audio narration, video lectures, quizzes, and presentations.
 *
 * Procedures:
 * - create: Create a single enrichment for a lesson
 * - createBatch: Create enrichments for multiple lessons
 * - getByLesson: Get all enrichments for a lesson
 * - getSummaryByCourse: Get lightweight summary for React Flow nodes
 * - regenerate: Regenerate a failed enrichment
 * - delete: Delete an enrichment and its asset
 * - reorder: Reorder enrichments within a lesson
 * - cancel: Cancel an in-progress enrichment
 * - getPlaybackUrl: Get signed URL for media playback
 * - regenerateDraft: Regenerate draft for two-stage enrichments
 * - updateDraft: Update draft content before final generation
 * - approveDraft: Approve draft and trigger final generation
 *
 * Access Control:
 * - All endpoints enforce organization-level RLS via ctx.user.organizationId
 * - Course/lesson ownership is verified before operations
 *
 * @see stages/stage7-enrichments - BullMQ worker infrastructure
 * @see specs/022-lesson-enrichments - Feature specification
 */

import { router } from '../../trpc';
import { create } from './procedures/create';
import { getByLesson } from './procedures/get-by-lesson';
import { getSummaryByCourse } from './procedures/get-summary';
import { regenerate } from './procedures/regenerate';
import { deleteEnrichment } from './procedures/delete';
import { reorder } from './procedures/reorder';
import { cancel } from './procedures/cancel';
import { getPlaybackUrl } from './procedures/get-playback-url';
import { regenerateDraft } from './procedures/regenerate-draft';
import { updateDraft } from './procedures/update-draft';
import { approveDraft } from './procedures/approve-draft';
import { approveCoverDraft } from './procedures/approve-cover-draft';
import { createBatch } from './procedures/create-batch';

/**
 * Enrichment router
 *
 * Provides endpoints for enrichment management:
 *
 * ## Single Enrichment Operations
 * - create: Create a single enrichment for a lesson
 * - regenerate: Regenerate a failed enrichment
 * - delete: Delete an enrichment and its asset
 * - cancel: Cancel an in-progress enrichment
 * - getPlaybackUrl: Get signed URL for media playback
 *
 * ## Batch Operations
 * - createBatch: Create enrichments for multiple lessons
 * - getByLesson: Get all enrichments for a lesson
 * - getSummaryByCourse: Get lightweight summary for React Flow nodes
 * - reorder: Reorder enrichments within a lesson
 *
 * ## Two-Stage Operations (video/presentation)
 * - regenerateDraft: Regenerate draft phase
 * - updateDraft: Update draft content before final generation
 * - approveDraft: Approve draft and trigger final generation
 */
export const enrichmentRouter = router({
  /**
   * Create a single enrichment for a lesson
   * @see procedures/create.ts
   */
  create,

  /**
   * Create enrichments for multiple lessons (batch)
   * @see procedures/create-batch.ts
   */
  createBatch,

  /**
   * Get all enrichments for a specific lesson
   * @see procedures/get-by-lesson.ts
   */
  getByLesson,

  /**
   * Get enrichment summary for all lessons in a course
   * @see procedures/get-summary.ts
   */
  getSummaryByCourse,

  /**
   * Regenerate a failed enrichment
   * @see procedures/regenerate.ts
   */
  regenerate,

  /**
   * Delete an enrichment and its asset
   * @see procedures/delete.ts
   */
  delete: deleteEnrichment,

  /**
   * Reorder enrichments within a lesson
   * @see procedures/reorder.ts
   */
  reorder,

  /**
   * Cancel an in-progress enrichment
   * @see procedures/cancel.ts
   */
  cancel,

  /**
   * Get signed URL for media playback
   * @see procedures/get-playback-url.ts
   */
  getPlaybackUrl,

  /**
   * Regenerate draft for two-stage enrichments (video/presentation)
   * @see procedures/regenerate-draft.ts
   */
  regenerateDraft,

  /**
   * Update draft content before final generation
   * @see procedures/update-draft.ts
   */
  updateDraft,

  /**
   * Approve draft and trigger final generation
   * @see procedures/approve-draft.ts
   */
  approveDraft,

  /**
   * Approve cover draft with selected variant
   * @see procedures/approve-cover-draft.ts
   */
  approveCoverDraft,
});

/**
 * Type export for router type inference
 */
export type EnrichmentRouter = typeof enrichmentRouter;
