/**
 * Course Router
 * @module server/routers/course
 *
 * Provides API endpoints for course document classification and budget allocation.
 * These procedures integrate with Stage 3 (document classification) and budget allocation
 * pipeline phases.
 *
 * Procedures:
 * - classifyDocuments: Trigger document classification for a course (Stage 3)
 * - getDocumentPriorities: Retrieve classification results for a course
 * - allocateBudget: Calculate budget allocation based on document priorities
 * - getBudgetAllocation: Retrieve current budget allocation for a course
 *
 * Access Control:
 * - All endpoints enforce organization-level RLS via ctx.user.organizationId
 * - Course ownership/access is verified before operations
 * - Only users from the same organization can access course data
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../trpc';
import { protectedProcedure } from '../middleware/auth';
import { getSupabaseAdmin } from '../../shared/supabase/admin';
import { logger } from '../../shared/logger/index.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { nanoid } from 'nanoid';

// Import Stage 3 document classification functions
import {
  executeDocumentClassification,
  getCourseClassifications,
} from '../../stages/stage3-classification/phases/phase-classification';

// Import budget allocation functions
import {
  calculateBudgetAllocation,
} from '../../shared/budget/budget-allocator';

// Import shared types
import type { BudgetAllocation } from '@megacampus/shared-types';

// ============================================================================
// Input Schemas
// ============================================================================

/**
 * Input schema for classifyDocuments procedure
 */
export const classifyDocumentsInputSchema = z.object({
  /** Course ID to classify documents for */
  courseId: z.string().uuid('Invalid course ID'),
});

/**
 * Input schema for getDocumentPriorities procedure
 */
export const getDocumentPrioritiesInputSchema = z.object({
  /** Course ID to get classification results for */
  courseId: z.string().uuid('Invalid course ID'),
});

/**
 * Input schema for allocateBudget procedure
 */
export const allocateBudgetInputSchema = z.object({
  /** Course ID to allocate budget for */
  courseId: z.string().uuid('Invalid course ID'),
});

/**
 * Input schema for getBudgetAllocation procedure
 */
export const getBudgetAllocationInputSchema = z.object({
  /** Course ID to get budget allocation for */
  courseId: z.string().uuid('Invalid course ID'),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Verify user has access to course (same organization)
 *
 * @param courseId - Course UUID
 * @param organizationId - User's organization UUID
 * @param requestId - Request ID for logging
 * @returns Course data if access allowed
 * @throws TRPCError if course not found or access denied
 */
async function verifyCourseAccess(
  courseId: string,
  organizationId: string,
  requestId: string
): Promise<{ id: string; organization_id: string }> {
  const supabase = getSupabaseAdmin();

  const { data: course, error } = await supabase
    .from('courses')
    .select('id, organization_id')
    .eq('id', courseId)
    .eq('organization_id', organizationId)
    .single();

  if (error || !course) {
    logger.warn({
      requestId,
      courseId,
      organizationId,
      error,
    }, 'Course not found or access denied');

    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Course not found or access denied',
    });
  }

  return course;
}

/**
 * Get all file IDs for a course
 *
 * @param courseId - Course UUID
 * @returns Array of file UUIDs
 */
async function getCourseFileIds(courseId: string): Promise<string[]> {
  const supabase = getSupabaseAdmin();

  const { data: files, error } = await supabase
    .from('file_catalog')
    .select('id')
    .eq('course_id', courseId);

  if (error) {
    logger.error({ courseId, error }, 'Failed to fetch course files');
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to fetch course files',
    });
  }

  return files?.map((f) => f.id) || [];
}

// ============================================================================
// Router Definition
// ============================================================================

/**
 * Course router
 *
 * Provides endpoints for document classification and budget allocation:
 * - classifyDocuments: Trigger classification for course documents (Stage 2)
 * - getDocumentPriorities: Get classification results
 * - allocateBudget: Calculate token budget allocation (Stage 3)
 * - getBudgetAllocation: Get current budget allocation
 */
export const courseRouter = router({
  /**
   * Classify documents for a course
   *
   * Purpose: Triggers document classification (Stage 2) for all files in a course.
   * Classification determines document priority (HIGH/LOW) and category for
   * subsequent budget allocation in Stage 3.
   *
   * Authorization: Requires authenticated user (protectedProcedure)
   *
   * Input:
   * - courseId: UUID of the course to classify documents for
   *
   * Output:
   * - classifications: Array of DocumentPriority results
   * - totalClassified: Number of documents classified
   * - highPriorityCount: Number of HIGH priority documents
   * - lowPriorityCount: Number of LOW priority documents
   *
   * Validation:
   * - Course exists and belongs to user's organization
   * - Course has at least one file
   *
   * Error Handling:
   * - Course not found -> 404 NOT_FOUND
   * - Course belongs to different org -> 404 NOT_FOUND
   * - No files to classify -> 400 BAD_REQUEST
   * - Classification fails -> 500 INTERNAL_SERVER_ERROR
   *
   * @example
   * ```typescript
   * const result = await trpc.course.classifyDocuments.mutate({
   *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
   * });
   * // { classifications: [...], totalClassified: 5, highPriorityCount: 2, lowPriorityCount: 3 }
   * ```
   */
  classifyDocuments: protectedProcedure
    .use(createRateLimiter({ requests: 5, window: 60 })) // 5 classification requests per minute
    .input(classifyDocumentsInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { courseId } = input;
      const requestId = nanoid();

      // ctx.user is guaranteed non-null by protectedProcedure middleware
      const currentUser = ctx.user;
      const organizationId = currentUser.organizationId;

      logger.info({
        requestId,
        courseId,
        userId: currentUser.id,
        organizationId,
      }, 'Document classification request');

      try {
        // Step 1: Verify course access
        await verifyCourseAccess(courseId, organizationId, requestId);

        // Step 2: Get all file IDs for the course
        const fileIds = await getCourseFileIds(courseId);

        if (fileIds.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No files found for this course. Upload documents before classification.',
          });
        }

        logger.info({
          requestId,
          courseId,
          fileCount: fileIds.length,
        }, 'Starting document classification');

        // Step 3: Execute document classification
        const classifications = await executeDocumentClassification(
          courseId,
          fileIds,
          organizationId
        );

        // Step 4: Calculate summary statistics
        const highPriorityCount = classifications.filter(
          (c) => c.priority === 'HIGH'
        ).length;
        const lowPriorityCount = classifications.filter(
          (c) => c.priority === 'LOW'
        ).length;

        logger.info({
          requestId,
          courseId,
          totalClassified: classifications.length,
          highPriorityCount,
          lowPriorityCount,
        }, 'Document classification completed');

        return {
          classifications,
          totalClassified: classifications.length,
          highPriorityCount,
          lowPriorityCount,
        };
      } catch (error) {
        // Re-throw tRPC errors as-is
        if (error instanceof TRPCError) {
          throw error;
        }

        // Log and wrap unexpected errors
        logger.error({
          requestId,
          courseId,
          error: error instanceof Error ? error.message : String(error),
        }, 'Document classification failed');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Document classification failed',
        });
      }
    }),

  /**
   * Get document priorities for a course
   *
   * Purpose: Retrieves classification results for all documents in a course.
   * Returns documents sorted by importance_score in descending order.
   *
   * Authorization: Requires authenticated user (protectedProcedure)
   *
   * Input:
   * - courseId: UUID of the course to get priorities for
   *
   * Output:
   * - priorities: Array of DocumentPriority sorted by importance_score DESC
   * - totalDocuments: Total number of classified documents
   *
   * Error Handling:
   * - Course not found -> 404 NOT_FOUND
   * - Course belongs to different org -> 404 NOT_FOUND
   *
   * @example
   * ```typescript
   * const result = await trpc.course.getDocumentPriorities.query({
   *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
   * });
   * // { priorities: [...], totalDocuments: 5 }
   * ```
   */
  getDocumentPriorities: protectedProcedure
    .input(getDocumentPrioritiesInputSchema)
    .query(async ({ ctx, input }) => {
      const { courseId } = input;
      const requestId = nanoid();

      // ctx.user is guaranteed non-null by protectedProcedure middleware
      const currentUser = ctx.user;
      const organizationId = currentUser.organizationId;

      try {
        // Step 1: Verify course access
        await verifyCourseAccess(courseId, organizationId, requestId);

        // Step 2: Get stored classifications
        const priorities = await getCourseClassifications(courseId);

        // Sort by importance_score descending
        const sortedPriorities = [...priorities].sort(
          (a, b) => b.importance_score - a.importance_score
        );

        logger.debug({
          requestId,
          courseId,
          totalDocuments: sortedPriorities.length,
        }, 'Retrieved document priorities');

        return {
          priorities: sortedPriorities,
          totalDocuments: sortedPriorities.length,
        };
      } catch (error) {
        // Re-throw tRPC errors as-is
        if (error instanceof TRPCError) {
          throw error;
        }

        // Log and wrap unexpected errors
        logger.error({
          requestId,
          courseId,
          error: error instanceof Error ? error.message : String(error),
        }, 'Failed to get document priorities');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve document priorities',
        });
      }
    }),

  /**
   * Allocate budget for a course
   *
   * Purpose: Calculates and returns token budget allocation (Stage 3) based on
   * document priorities from Stage 2 classification. Determines optimal model
   * selection and budget distribution.
   *
   * Model Selection Logic:
   * - IF total_high_priority_tokens <= 80,000:
   *   - selected_model = 'oss-120b' (128K context)
   *   - high_budget = 80,000
   * - ELSE:
   *   - selected_model = 'gemini-flash' (1M context)
   *   - high_budget = 400,000
   *
   * Authorization: Requires authenticated user (protectedProcedure)
   *
   * Input:
   * - courseId: UUID of the course to allocate budget for
   *
   * Output:
   * - allocation: Complete BudgetAllocation object
   *
   * Validation:
   * - Course exists and belongs to user's organization
   * - Documents have been classified (Stage 2 completed)
   *
   * Error Handling:
   * - Course not found -> 404 NOT_FOUND
   * - Course belongs to different org -> 404 NOT_FOUND
   * - No classified documents -> 400 BAD_REQUEST
   * - Allocation fails -> 500 INTERNAL_SERVER_ERROR
   *
   * @example
   * ```typescript
   * const result = await trpc.course.allocateBudget.mutate({
   *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
   * });
   * // { allocation: { selected_model: 'oss-120b', high_budget: 80000, ... } }
   * ```
   */
  allocateBudget: protectedProcedure
    .use(createRateLimiter({ requests: 10, window: 60 })) // 10 allocation requests per minute
    .input(allocateBudgetInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { courseId } = input;
      const requestId = nanoid();

      // ctx.user is guaranteed non-null by protectedProcedure middleware
      const currentUser = ctx.user;
      const organizationId = currentUser.organizationId;

      logger.info({
        requestId,
        courseId,
        userId: currentUser.id,
        organizationId,
      }, 'Budget allocation request');

      try {
        // Step 1: Verify course access
        await verifyCourseAccess(courseId, organizationId, requestId);

        // Step 2: Calculate budget allocation
        const allocation = await calculateBudgetAllocation(courseId);

        logger.info({
          requestId,
          courseId,
          selectedModel: allocation.selected_model,
          highBudget: allocation.high_budget,
          lowBudget: allocation.low_budget,
          totalHighTokens: allocation.total_high_priority_tokens,
          totalLowTokens: allocation.total_low_priority_tokens,
        }, 'Budget allocation completed');

        return {
          allocation,
        };
      } catch (error) {
        // Re-throw tRPC errors as-is
        if (error instanceof TRPCError) {
          throw error;
        }

        // Log and wrap unexpected errors
        logger.error({
          requestId,
          courseId,
          error: error instanceof Error ? error.message : String(error),
        }, 'Budget allocation failed');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Budget allocation failed',
        });
      }
    }),

  /**
   * Get budget allocation for a course
   *
   * Purpose: Retrieves the current budget allocation for a course.
   * If no allocation exists, calculates a new one.
   *
   * Authorization: Requires authenticated user (protectedProcedure)
   *
   * Input:
   * - courseId: UUID of the course to get allocation for
   *
   * Output:
   * - allocation: Complete BudgetAllocation object
   * - cached: Boolean indicating if allocation was cached or newly calculated
   *
   * Error Handling:
   * - Course not found -> 404 NOT_FOUND
   * - Course belongs to different org -> 404 NOT_FOUND
   * - Allocation fails -> 500 INTERNAL_SERVER_ERROR
   *
   * @example
   * ```typescript
   * const result = await trpc.course.getBudgetAllocation.query({
   *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
   * });
   * // { allocation: { selected_model: 'oss-120b', ... }, cached: true }
   * ```
   */
  getBudgetAllocation: protectedProcedure
    .input(getBudgetAllocationInputSchema)
    .query(async ({ ctx, input }) => {
      const { courseId } = input;
      const requestId = nanoid();

      // ctx.user is guaranteed non-null by protectedProcedure middleware
      const currentUser = ctx.user;
      const organizationId = currentUser.organizationId;

      try {
        // Step 1: Verify course access
        await verifyCourseAccess(courseId, organizationId, requestId);

        // Step 2: Try to get cached allocation from course metadata
        const supabase = getSupabaseAdmin();
        const { data: course } = await supabase
          .from('courses')
          .select('settings')
          .eq('id', courseId)
          .single();

        // Check if budget_allocation exists in settings
        const settings = course?.settings as Record<string, unknown> | null;
        const cachedAllocation = settings?.budget_allocation as BudgetAllocation | undefined;

        if (cachedAllocation && cachedAllocation.course_id === courseId) {
          logger.debug({
            requestId,
            courseId,
            cached: true,
          }, 'Retrieved cached budget allocation');

          return {
            allocation: cachedAllocation,
            cached: true,
          };
        }

        // Step 3: Calculate new allocation if not cached
        const allocation = await calculateBudgetAllocation(courseId);

        // Step 4: Cache the allocation in course settings
        // Serialize allocated_at Date to ISO string for JSONB storage
        const allocationForStorage = {
          ...allocation,
          allocated_at: allocation.allocated_at.toISOString(),
        };
        const updatedSettings = {
          ...(settings || {}),
          budget_allocation: allocationForStorage,
        };

        // Type assertion needed because JSONB settings can have arbitrary shape
        await (supabase as any)
          .from('courses')
          .update({ settings: updatedSettings })
          .eq('id', courseId);

        logger.info({
          requestId,
          courseId,
          cached: false,
          selectedModel: allocation.selected_model,
        }, 'Calculated and cached budget allocation');

        return {
          allocation,
          cached: false,
        };
      } catch (error) {
        // Re-throw tRPC errors as-is
        if (error instanceof TRPCError) {
          throw error;
        }

        // Log and wrap unexpected errors
        logger.error({
          requestId,
          courseId,
          error: error instanceof Error ? error.message : String(error),
        }, 'Failed to get budget allocation');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve budget allocation',
        });
      }
    }),
});

/**
 * Type export for router type inference
 */
export type CourseRouter = typeof courseRouter;
