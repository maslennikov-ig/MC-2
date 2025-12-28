/**
 * Enrichment Module Entry Point
 * @module server/routers/enrichment
 *
 * Re-exports the enrichment router and all input/output schemas.
 * This module provides the API layer for Stage 7 lesson enrichments.
 */

// Export router and type
export { enrichmentRouter, type EnrichmentRouter } from './router';

// Export all input schemas for use in tests and other modules
export {
  // Re-exported from shared-types
  enrichmentTypeSchema,
  enrichmentStatusSchema,
  createEnrichmentInputSchema,
  createBatchEnrichmentInputSchema,
  lessonEnrichmentBaseSchema,
  enrichmentSummarySchema,
  // Additional input schemas
  getByLessonInputSchema,
  getSummaryByCourseInputSchema,
  regenerateEnrichmentInputSchema,
  deleteEnrichmentInputSchema,
  reorderEnrichmentsInputSchema,
  cancelEnrichmentInputSchema,
  getPlaybackUrlInputSchema,
  regenerateDraftInputSchema,
  updateDraftInputSchema,
  approveDraftInputSchema,
  // Output schemas
  createEnrichmentOutputSchema,
  createBatchEnrichmentOutputSchema,
  getByLessonOutputSchema,
  getSummaryByCourseOutputSchema,
  regenerateEnrichmentOutputSchema,
  deleteEnrichmentOutputSchema,
  reorderEnrichmentsOutputSchema,
  cancelEnrichmentOutputSchema,
  getPlaybackUrlOutputSchema,
  regenerateDraftOutputSchema,
  updateDraftOutputSchema,
  approveDraftOutputSchema,
} from './schemas';

// Export input/output types
export type {
  GetByLessonInput,
  GetSummaryByCourseInput,
  RegenerateEnrichmentInput,
  DeleteEnrichmentInput,
  ReorderEnrichmentsInput,
  CancelEnrichmentInput,
  GetPlaybackUrlInput,
  RegenerateDraftInput,
  UpdateDraftInput,
  ApproveDraftInput,
  CreateEnrichmentOutput,
  CreateBatchEnrichmentOutput,
  GetByLessonOutput,
  GetSummaryByCourseOutput,
  RegenerateEnrichmentOutput,
  DeleteEnrichmentOutput,
  ReorderEnrichmentsOutput,
  CancelEnrichmentOutput,
  GetPlaybackUrlOutput,
  RegenerateDraftOutput,
  UpdateDraftOutput,
  ApproveDraftOutput,
} from './schemas';

// Export helper functions (may be needed by other modules)
export {
  verifyEnrichmentAccess,
  verifyCourseAccess,
  verifyLessonAccess,
  getNextOrderIndex,
  isTwoStageType,
  isCancellableStatus,
  buildAssetPath,
  CANCELLABLE_STATUSES,
} from './helpers';
