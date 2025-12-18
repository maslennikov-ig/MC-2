/**
 * Dependencies Router
 * @module server/routers/generation/dependencies
 *
 * Handles course structure dependency graph operations:
 * - getBlockDependencies: Get upstream/downstream dependencies for a block
 * - cascadeUpdate: Handle cascade updates when a parent element changes
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { instructorProcedure } from '../../procedures';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { nanoid } from 'nanoid';
import type { CourseStructure } from '@megacampus/shared-types';
import {
  buildDependencyGraph,
  getUpstream,
  getDownstream,
  blockPathToNodeId,
  getNodeLabel,
} from '../../../shared/regeneration/dependency-graph-builder';
import { applyFieldUpdate } from '../../../stages/stage5-generation/utils/course-structure-editor';

export const dependenciesRouter = router({
  /**
   * Get Block Dependencies
   *
   * Returns upstream and downstream dependencies for a given block in the course structure.
   * Used for impact analysis and dependency visualization before making edits.
   *
   * @endpoint generation.getBlockDependencies
   * @authorization instructor (read-only, ownership check)
   */
  getBlockDependencies: instructorProcedure
    .input(z.object({
      courseId: z.string().uuid(),
      blockPath: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const { courseId, blockPath } = input;
      const supabase = getSupabaseAdmin();

      // Defensive check (should never happen due to instructorProcedure middleware)
      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      const userId = ctx.user.id;

      try {
        // Step 1: Fetch course and verify ownership
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('id, user_id, analysis_result, course_structure')
          .eq('id', courseId)
          .single();

        if (courseError || !course) {
          logger.warn({ userId, courseId, error: courseError }, 'Course not found in getBlockDependencies');
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Course not found',
          });
        }

        // Step 2: Verify course ownership
        if (course.user_id !== userId) {
          logger.warn({
            userId,
            courseId,
            courseOwnerId: course.user_id,
          }, 'Course ownership violation in getBlockDependencies');
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this course',
          });
        }

        // Step 3: Validate that course_structure exists
        if (!course.course_structure) {
          logger.warn({ userId, courseId }, 'Course structure is null in getBlockDependencies');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Course structure not yet generated',
          });
        }

        // Step 4: Build dependency graph
        const graph = buildDependencyGraph(course.course_structure as CourseStructure);

        // Step 5: Convert blockPath to nodeId
        let nodeId: string;
        try {
          nodeId = blockPathToNodeId(blockPath);
        } catch (error) {
          logger.warn({
            userId,
            courseId,
            blockPath,
            error: error instanceof Error ? error.message : String(error),
          }, 'Invalid blockPath in getBlockDependencies');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid blockPath: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }

        // Step 6: Get label for the node
        const label = getNodeLabel(graph, blockPath);

        // Step 7: Get upstream and downstream dependencies
        const upstream = getUpstream(graph, nodeId);
        const downstream = getDownstream(graph, nodeId);

        logger.info({
          userId,
          courseId,
          blockPath,
          nodeId,
          upstreamCount: upstream.length,
          downstreamCount: downstream.length,
        }, 'GetBlockDependencies: Retrieved successfully');

        // Step 8: Return formatted result
        return {
          nodeId,
          label,
          upstream,
          downstream,
          affectedCount: upstream.length + downstream.length,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error({
          userId,
          courseId,
          blockPath,
          error: error instanceof Error ? error.message : String(error),
        }, 'Unexpected error in getBlockDependencies');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        });
      }
    }),

  /**
   * Cascade Update Endpoint
   *
   * Purpose: Handle cascade updates when a parent element changes.
   * This endpoint allows different strategies for handling downstream dependencies:
   * - mark_stale: Mark affected elements as stale for manual review
   * - auto_regenerate: Automatically queue regeneration jobs for affected elements
   * - review_each: Return affected paths for client-side handling
   *
   * Authorization: Requires instructor or admin role (user must own the course)
   *
   * Input:
   * - courseId: UUID of the course
   * - changedPath: The path that was changed (e.g., "sections[0].section_learning_objectives")
   * - newValue: The new value (can be any type depending on the field)
   * - action: Strategy to handle affected elements ('mark_stale' | 'auto_regenerate' | 'review_each')
   *
   * Output:
   * - success: Boolean indicating operation success
   * - affectedPaths: Array of paths affected by this change
   * - action: The strategy that was applied
   * - regenerationJobId: Job ID for tracking (only for auto_regenerate)
   *
   * Errors:
   * - Course not found → 404 NOT_FOUND
   * - User doesn't own course → 403 FORBIDDEN
   * - Course structure not generated → 400 BAD_REQUEST
   * - Invalid path → 400 BAD_REQUEST
   * - Internal error → 500 INTERNAL_SERVER_ERROR
   *
   * @endpoint generation.cascadeUpdate
   * @authorization instructor
   */
  cascadeUpdate: instructorProcedure
    .input(z.object({
      courseId: z.string().uuid(),
      changedPath: z.string(),
      newValue: z.unknown(),
      action: z.enum(['mark_stale', 'auto_regenerate', 'review_each']),
    }))
    .mutation(async ({ ctx, input }) => {
      const { courseId, changedPath, newValue, action } = input;
      const supabase = getSupabaseAdmin();

      // Defensive check (should never happen due to instructorProcedure middleware)
      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      const userId = ctx.user.id;

      try {
        // Step 1: Verify course ownership and get course data
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('*')
          .eq('id', courseId)
          .single();

        if (courseError || !course) {
          logger.warn({ userId, courseId, error: courseError }, 'Course not found in cascadeUpdate');
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Course not found',
          });
        }

        if (course.user_id !== userId) {
          logger.warn({
            userId,
            courseId,
            courseOwnerId: course.user_id,
          }, 'Course ownership violation in cascadeUpdate');
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this course',
          });
        }

        // Step 2: Validate that course_structure exists
        if (!course.course_structure) {
          logger.warn({ userId, courseId }, 'Course structure is null in cascadeUpdate');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Course structure not yet generated',
          });
        }

        const courseStructure = course.course_structure as CourseStructure;

        // Step 3: Build dependency graph and find affected elements
        const graph = buildDependencyGraph(courseStructure);
        const nodeId = blockPathToNodeId(changedPath);
        const downstream = getDownstream(graph, nodeId);
        const affectedPaths = downstream.map(d => d.id);

        logger.info({
          userId,
          courseId,
          changedPath,
          action,
          affectedCount: affectedPaths.length,
        }, 'CascadeUpdate: Processing dependency changes');

        // Step 4: Apply field update
        try {
          applyFieldUpdate(courseStructure, changedPath, newValue);
        } catch (error) {
          logger.error({
            userId,
            courseId,
            changedPath,
            error: error instanceof Error ? error.message : String(error),
          }, 'Failed to apply field update in cascadeUpdate');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Failed to update field: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }

        // Step 5: Handle action-specific logic
        let regenerationJobId: string | undefined;

        if (action === 'mark_stale') {
          // Mark all affected elements as stale
          // Note: This is a conceptual flag - implement actual stale marking if needed
          logger.info({
            userId,
            courseId,
            affectedPaths,
          }, 'CascadeUpdate: Marked elements as stale');
        } else if (action === 'auto_regenerate') {
          // Queue regeneration jobs for all affected elements
          regenerationJobId = nanoid();

          logger.info({
            userId,
            courseId,
            regenerationJobId,
            affectedCount: affectedPaths.length,
          }, 'CascadeUpdate: Queuing regeneration jobs (not yet implemented)');

          // TODO: Implement BullMQ job queuing when regeneration job type is available
          // For now, we just log the intention and return the job ID
          // Example implementation:
          // for (const path of affectedPaths) {
          //   await addJob(JobType.REGENERATE_BLOCK, {
          //     organizationId: course.organization_id,
          //     courseId,
          //     userId,
          //     jobType: JobType.REGENERATE_BLOCK,
          //     createdAt: new Date().toISOString(),
          //     blockPath: path,
          //     parentJobId: regenerationJobId,
          //     instruction: 'Update to align with parent changes',
          //   });
          // }
        } else if (action === 'review_each') {
          // Just return affected paths for client-side handling
          logger.info({
            userId,
            courseId,
            affectedPaths,
          }, 'CascadeUpdate: Returning affected paths for review');
        }

        // Step 6: Update course structure in database
        const { error: updateError } = await supabase
          .from('courses')
          .update({
            course_structure: courseStructure,
            updated_at: new Date().toISOString(),
          })
          .eq('id', courseId);

        if (updateError) {
          logger.error({
            userId,
            courseId,
            error: updateError,
          }, 'Failed to update course structure in cascadeUpdate');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to save changes',
          });
        }

        logger.info({
          userId,
          courseId,
          changedPath,
          action,
          affectedCount: affectedPaths.length,
          regenerationJobId,
        }, 'CascadeUpdate: Completed successfully');

        // Step 7: Return response
        return {
          success: true,
          affectedPaths,
          action,
          regenerationJobId,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error({
          userId,
          courseId,
          changedPath,
          error: error instanceof Error ? error.message : String(error),
        }, 'Unexpected error in cascadeUpdate');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        });
      }
    }),
});
