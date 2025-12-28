/**
 * tRPC App Router
 * @module server/app-router
 *
 * This is the unified API router that combines all feature-specific routers
 * into a single type-safe API surface. The app router serves as the main entry
 * point for all tRPC procedures and provides complete type inference for the
 * client SDK.
 *
 * ## Available Routers
 *
 * ### generation
 * Course generation workflow operations including test endpoints, job initiation,
 * and file uploads with tier-based validation.
 *
 * Procedures:
 * - `generation.test` - Public health check endpoint (no auth required)
 * - `generation.initiate` - Start course generation job (instructor/admin only)
 * - `generation.uploadFile` - Upload files with quota enforcement (instructor/admin only)
 * - `generation.generate` - Start Stage 5 structure generation (instructor/admin only)
 * - `generation.getStatus` - Get generation progress (authenticated users)
 *
 * ### regeneration
 * Section regeneration operations for refining course structure (FR-026).
 *
 * Procedures:
 * - `regeneration.regenerateSection` - Regenerate single section (instructor/admin only)
 * - `regeneration.batchRegenerateSections` - Regenerate multiple sections (instructor/admin only)
 *
 * ### jobs
 * Job management operations for BullMQ orchestration system including status
 * tracking, cancellation, and monitoring.
 *
 * Procedures:
 * - `jobs.cancel` - Cancel a job (owner or admin only)
 * - `jobs.getStatus` - Get job status (owner or same org only)
 * - `jobs.list` - List jobs with filtering (role-based access)
 *
 * ### admin
 * Administrative operations for system-wide data management. All procedures
 * require admin role and bypass RLS policies for full visibility.
 *
 * Procedures:
 * - `admin.listOrganizations` - View all organizations with storage metrics
 * - `admin.listUsers` - View all users with filtering by org and role
 * - `admin.listCourses` - View all courses with filtering by org and status
 *
 * ### billing
 * Billing and usage tracking operations for storage quota and tier management.
 *
 * Procedures:
 * - `billing.getUsage` - Query storage usage and file counts (authenticated users)
 * - `billing.getQuota` - Query tier limits and upgrade options (authenticated users)
 *
 * ### summarization
 * Document summarization monitoring and cost analytics (Stage 3).
 *
 * Procedures:
 * - `summarization.getCostAnalytics` - Get cost analytics by model/strategy (authenticated users)
 * - `summarization.getSummarizationStatus` - Get course summarization progress (authenticated users)
 * - `summarization.getDocumentSummary` - Get individual document summary (authenticated users)
 *
 * ### analysis
 * Course content analysis operations (Stage 4).
 *
 * Procedures:
 * - `analysis.start` - Start multi-phase analysis job (instructor/admin only)
 * - `analysis.getStatus` - Get analysis progress (authenticated users)
 * - `analysis.getResult` - Get analysis result (authenticated users)
 *
 * ### course
 * Course document classification and budget allocation operations (Stage 2-3).
 *
 * Procedures:
 * - `course.classifyDocuments` - Trigger document classification (authenticated users)
 * - `course.getDocumentPriorities` - Get classification results sorted by importance (authenticated users)
 * - `course.allocateBudget` - Calculate token budget allocation (authenticated users)
 * - `course.getBudgetAllocation` - Get current or cached budget allocation (authenticated users)
 *
 * ### lessonContent
 * Lesson content generation operations (Stage 6).
 *
 * Procedures:
 * - `lessonContent.startStage6` - Enqueue all lessons for parallel processing (authenticated users)
 * - `lessonContent.getProgress` - Get progress for all lessons in a course (authenticated users)
 * - `lessonContent.retryLesson` - Retry a failed lesson generation (authenticated users)
 * - `lessonContent.getLessonContent` - Retrieve generated lesson content (authenticated users)
 * - `lessonContent.cancelStage6` - Cancel all pending jobs for a course (authenticated users)
 *
 * ### locks
 * Generation lock management for concurrent generation prevention (FR-037, FR-038).
 *
 * Procedures:
 * - `locks.isLocked` - Check if a course is currently locked (authenticated users)
 * - `locks.getLock` - Get lock details for a course (authenticated users)
 * - `locks.getAllLocks` - Get all active locks (admin only)
 * - `locks.forceRelease` - Force release a lock (admin only)
 *
 * ### pipelineAdmin
 * Pipeline configuration and monitoring dashboard (superadmin only).
 *
 * Procedures:
 * - `pipelineAdmin.getStagesInfo` - Get pipeline stages with stats (superadmin only)
 * - `pipelineAdmin.getPipelineStats` - Get aggregate pipeline statistics (superadmin only)
 *
 * ### documentProcessing
 * Document processing operations (Stage 2).
 *
 * Procedures:
 * - `documentProcessing.retryDocument` - Retry a failed document processing job (authenticated users)
 *
 * ### lms
 * LMS integration operations for publishing courses to Open edX and other platforms.
 *
 * Procedures:
 * - `lms.publish.start` - Start course publish operation to LMS (authenticated users)
 * - `lms.publish.cancel` - Cancel in-progress publish job (authenticated users)
 * - `lms.course.status` - Get course publish status (authenticated users)
 * - `lms.course.delete` - Delete course from LMS (soft delete) (authenticated users)
 *
 * ### enrichment
 * Lesson enrichment operations (Stage 7) for audio, video, quiz, and presentation generation.
 *
 * Procedures:
 * - `enrichment.create` - Create a single enrichment for a lesson (authenticated users)
 * - `enrichment.createBatch` - Create enrichments for multiple lessons (authenticated users)
 * - `enrichment.getByLesson` - Get all enrichments for a lesson (authenticated users)
 * - `enrichment.getSummaryByCourse` - Get lightweight summary for React Flow nodes (authenticated users)
 * - `enrichment.regenerate` - Regenerate a failed enrichment (authenticated users)
 * - `enrichment.delete` - Delete an enrichment and its asset (authenticated users)
 * - `enrichment.reorder` - Reorder enrichments within a lesson (authenticated users)
 * - `enrichment.cancel` - Cancel an in-progress enrichment (authenticated users)
 * - `enrichment.getPlaybackUrl` - Get signed URL for media playback (authenticated users)
 * - `enrichment.regenerateDraft` - Regenerate draft for two-stage enrichments (authenticated users)
 * - `enrichment.updateDraft` - Update draft content before final generation (authenticated users)
 * - `enrichment.approveDraft` - Approve draft and trigger final generation (authenticated users)
 *
 * ## Usage Example
 *
 * ```typescript
 * // Import the router type for client SDK type inference
 * import type { AppRouter } from './server/app-router';
 *
 * // Create tRPC client with type safety
 * const trpc = createTRPCClient<AppRouter>({
 *   url: 'http://localhost:3000/trpc',
 * });
 *
 * // Call procedures with full type inference
 * const result = await trpc.generation.test.query({ message: 'Hello' });
 * const job = await trpc.generation.initiate.mutate({ courseId: '...' });
 * const usage = await trpc.billing.getUsage.query();
 * const orgs = await trpc.admin.listOrganizations.query({ limit: 50 });
 * ```
 *
 * ## Architecture Notes
 *
 * - All routers use the same tRPC context with Supabase Auth integration
 * - Authentication is handled via JWT tokens in Authorization header
 * - Role-based authorization is enforced via middleware (protectedProcedure, adminProcedure, etc.)
 * - Input validation uses Zod schemas for type safety and runtime validation
 * - Error responses use tRPC error codes (UNAUTHORIZED, FORBIDDEN, NOT_FOUND, etc.)
 *
 * @see {@link generationRouter} - Course generation procedures (T054, T057)
 * @see {@link jobsRouter} - Job management procedures (T044.1)
 * @see {@link adminRouter} - Admin procedures (T055)
 * @see {@link billingRouter} - Billing procedures (T056)
 * @see {@link summarizationRouter} - Summarization procedures (T057, T058)
 * @see {@link courseRouter} - Document classification and budget allocation (T016, T017)
 * @see {@link lessonContentRouter} - Lesson content generation (T054)
 * @see {@link locksRouter} - Generation lock management (FR-037, FR-038)
 * @see {@link enrichmentRouter} - Lesson enrichment operations (T018-T032)
 */

import { router } from './trpc';
import { generationRouter } from './routers/generation';
import { regenerationRouter } from './routers/regeneration';
import { jobsRouter } from './routers/jobs';
import { adminRouter } from './routers/admin';
import { billingRouter } from './routers/billing';
import { summarizationRouter } from './routers/summarization';
import { analysisRouter } from './routers/analysis';
import { metricsRouter } from './routers/metrics';
import { courseRouter } from './routers/course';
import { lessonContentRouter } from './routers/lesson-content';
import { locksRouter } from './routers/locks';
import { pipelineAdminRouter } from './routers/pipeline-admin';
import { documentProcessingRouter } from './routers/document-processing';
import { lmsRouter } from './routers/lms';
import { enrichmentRouter } from './routers/enrichment';

/**
 * Main application router combining all feature routers
 *
 * This router provides the complete API surface for the MegaCampusAI platform.
 * Each sub-router handles a specific domain of functionality with appropriate
 * authorization requirements.
 */
export const appRouter = router({
  /**
   * Course generation operations
   * @see {@link generationRouter}
   */
  generation: generationRouter,

  /**
   * Section regeneration operations (FR-026)
   * @see {@link regenerationRouter}
   */
  regeneration: regenerationRouter,

  /**
   * Job management operations
   * @see {@link jobsRouter}
   */
  jobs: jobsRouter,

  /**
   * Administrative operations (admin only)
   * @see {@link adminRouter}
   */
  admin: adminRouter,

  /**
   * Billing and usage tracking
   * @see {@link billingRouter}
   */
  billing: billingRouter,

  /**
   * Summarization operations (Stage 3)
   * @see {@link summarizationRouter}
   */
  summarization: summarizationRouter,

  /**
   * Analysis operations (Stage 4)
   * @see {@link analysisRouter}
   */
  analysis: analysisRouter,

  /**
   * Metrics and monitoring (public, no auth)
   * @see {@link metricsRouter}
   */
  metrics: metricsRouter,

  /**
   * Course document classification and budget allocation (Stage 2-3)
   * @see {@link courseRouter}
   */
  course: courseRouter,

  /**
   * Lesson content generation (Stage 6)
   * @see {@link lessonContentRouter}
   */
  lessonContent: lessonContentRouter,

  /**
   * Generation lock management
   * @see {@link locksRouter}
   */
  locks: locksRouter,

  /**
   * Pipeline admin operations (superadmin only)
   * @see {@link pipelineAdminRouter}
   */
  pipelineAdmin: pipelineAdminRouter,

  /**
   * Document processing operations (Stage 2)
   * @see {@link documentProcessingRouter}
   */
  documentProcessing: documentProcessingRouter,

  /**
   * LMS integration operations
   * @see {@link lmsRouter}
   */
  lms: lmsRouter,

  /**
   * Lesson enrichment operations (Stage 7)
   * @see {@link enrichmentRouter}
   */
  enrichment: enrichmentRouter,
});

/**
 * Router type export for client SDK type inference
 *
 * Import this type in your client code to get full type safety and autocomplete
 * for all API procedures.
 *
 * @example
 * ```typescript
 * import type { AppRouter } from '@megacampus/course-gen-platform/server/app-router';
 * import { createTRPCClient } from '@trpc/client';
 *
 * const client = createTRPCClient<AppRouter>({
 *   url: process.env.TRPC_API_URL,
 * });
 * ```
 */
export type AppRouter = typeof appRouter;
