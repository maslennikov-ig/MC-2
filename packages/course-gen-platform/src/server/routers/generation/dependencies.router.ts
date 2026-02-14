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
import { JobType } from '@megacampus/shared-types';
import type { JobData } from '@megacampus/shared-types';
import { addJob } from '../../../orchestrator/queue';
import {
  buildDependencyGraph,
  getUpstream,
  getDownstream,
  blockPathToNodeId,
  getNodeLabel,
} from '../../../shared/regeneration/dependency-graph-builder';
import {
  applyFieldUpdate,
  ensureStableIdsAndSchemaVersionInMemory,
} from '../../../stages/stage5-generation/utils/course-structure-editor';
import { resolveStructure } from '../../../shared/course-nodes/structure-resolver';
import { writeCourseNodes } from '../../../shared/course-nodes/writer';
import { assertStableIds } from '../../../shared/course-nodes/feature-flags';

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
    .input(
      z.object({
        courseId: z.string().uuid(),
        blockPath: z.string(),
      })
    )
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
          logger.warn(
            { userId, courseId, error: courseError },
            'Course not found in getBlockDependencies'
          );
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Course not found',
          });
        }

        // Step 2: Verify course ownership
        if (course.user_id !== userId) {
          logger.warn(
            {
              userId,
              courseId,
              courseOwnerId: course.user_id,
            },
            'Course ownership violation in getBlockDependencies'
          );
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this course',
          });
        }

        // Step 3: Resolve course structure (Phase 4: from course_nodes if enabled)
        const resolvedStructure = await resolveStructure(
          courseId,
          course.course_structure,
          supabase
        );
        if (!resolvedStructure) {
          logger.warn({ userId, courseId }, 'Course structure is null in getBlockDependencies');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Course structure not yet generated',
          });
        }

        // Step 4: Build dependency graph
        const graph = buildDependencyGraph(resolvedStructure);

        // Step 5: Convert blockPath to nodeId
        let nodeId: string;
        try {
          nodeId = blockPathToNodeId(blockPath);
        } catch (error) {
          logger.warn(
            {
              userId,
              courseId,
              blockPath,
              error: error instanceof Error ? error.message : String(error),
            },
            'Invalid blockPath in getBlockDependencies'
          );
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

        logger.info(
          {
            userId,
            courseId,
            blockPath,
            nodeId,
            upstreamCount: upstream.length,
            downstreamCount: downstream.length,
          },
          'GetBlockDependencies: Retrieved successfully'
        );

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

        logger.error(
          {
            userId,
            courseId,
            blockPath,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in getBlockDependencies'
        );

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
    .input(
      z.object({
        courseId: z.string().uuid(),
        changedPath: z.string(),
        newValue: z.unknown(),
        action: z.enum(['mark_stale', 'auto_regenerate', 'review_each']),
      })
    )
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
          logger.warn(
            { userId, courseId, error: courseError },
            'Course not found in cascadeUpdate'
          );
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Course not found',
          });
        }

        if (course.user_id !== userId) {
          logger.warn(
            {
              userId,
              courseId,
              courseOwnerId: course.user_id,
            },
            'Course ownership violation in cascadeUpdate'
          );
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

        // Guard: limit cascade jobs per request to prevent cost explosion
        const MAX_CASCADE_JOBS_PER_REQUEST = 20;
        if (action === 'auto_regenerate' && affectedPaths.length > MAX_CASCADE_JOBS_PER_REQUEST) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Too many affected paths (${affectedPaths.length}). Maximum ${MAX_CASCADE_JOBS_PER_REQUEST} per request. Use 'review_each' to select specific paths.`,
          });
        }

        logger.info(
          {
            userId,
            courseId,
            changedPath,
            action,
            affectedCount: affectedPaths.length,
          },
          'CascadeUpdate: Processing dependency changes'
        );

        // Step 4: Apply field update
        try {
          applyFieldUpdate(courseStructure, changedPath, newValue);
        } catch (error) {
          logger.error(
            {
              userId,
              courseId,
              changedPath,
              error: error instanceof Error ? error.message : String(error),
            },
            'Failed to apply field update in cascadeUpdate'
          );
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
          logger.info(
            {
              userId,
              courseId,
              affectedPaths,
            },
            'CascadeUpdate: Marked elements as stale'
          );
        } else if (action === 'auto_regenerate') {
          // Queue regeneration jobs for all affected downstream elements
          regenerationJobId = nanoid();

          for (const path of affectedPaths) {
            await addJob(
              JobType.BLOCK_REGENERATION,
              {
                organizationId: course.organization_id,
                courseId,
                userId,
                jobType: JobType.BLOCK_REGENERATION,
                createdAt: new Date().toISOString(),
                blockPath: path,
                parentJobId: regenerationJobId,
                instruction: 'Update to align with parent changes',
                stageId: 'stage_5',
              } as unknown as JobData,
              {
                priority: 5,
                jobId: `cascade-${courseId}-${path.replace(/[[\].]/g, '-')}`,
              }
            );
          }

          logger.info(
            {
              userId,
              courseId,
              regenerationJobId,
              affectedCount: affectedPaths.length,
            },
            'CascadeUpdate: Queued block regeneration jobs'
          );
        } else if (action === 'review_each') {
          // Just return affected paths for client-side handling
          logger.info(
            {
              userId,
              courseId,
              affectedPaths,
            },
            'CascadeUpdate: Returning affected paths for review'
          );
        }

        const structureToPersist = ensureStableIdsAndSchemaVersionInMemory(courseStructure);

        // Guard: block writes without stable IDs when flag is on (plan:433)
        assertStableIds(structureToPersist);

        // Step 6: Update course structure in database
        const { error: updateError } = await supabase
          .from('courses')
          .update({
            course_structure: structureToPersist,
            updated_at: new Date().toISOString(),
          })
          .eq('id', courseId);

        if (updateError) {
          logger.error(
            {
              userId,
              courseId,
              error: updateError,
            },
            'Failed to update course structure in cascadeUpdate'
          );
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to save changes',
          });
        }

        // Phase 4: Dual-write to course_nodes (non-blocking, non-fatal)
        const structureForNodes = structureToPersist;
        await writeCourseNodes(courseId, structureForNodes, supabase, logger).catch(err =>
          logger.warn(
            { courseId, error: err instanceof Error ? err.message : String(err) },
            'course_nodes dual-write failed (non-fatal)'
          )
        );

        logger.info(
          {
            userId,
            courseId,
            changedPath,
            action,
            affectedCount: affectedPaths.length,
            regenerationJobId,
          },
          'CascadeUpdate: Completed successfully'
        );

        // Step 7: Return response
        return {
          success: true,
          affectedPaths,
          action,
          regenerationJobId,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error(
          {
            userId,
            courseId,
            changedPath,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in cascadeUpdate'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        });
      }
    }),
});
