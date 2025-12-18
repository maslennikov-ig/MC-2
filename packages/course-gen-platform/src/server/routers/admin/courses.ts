/**
 * Admin Courses Router
 * @module server/routers/admin/courses
 *
 * Provides admin procedures for course management.
 */

import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { ErrorMessages } from '../../utils/error-messages.js';
import { listCoursesInputSchema } from './shared/schemas';
import type { CourseListItem } from './shared/types';

export const coursesRouter = router({
  listCourses: adminProcedure
    .input(listCoursesInputSchema)
    .query(async ({ input }): Promise<CourseListItem[]> => {
      const { limit, offset, organizationId, status } = input;

      try {
        const supabase = getSupabaseAdmin();

        // Build query with JOINs to users and organizations tables
        let query = supabase
          .from('courses')
          .select(
            `
            id,
            title,
            slug,
            status,
            user_id,
            organization_id,
            created_at,
            updated_at,
            users:user_id (
              email
            ),
            organizations:organization_id (
              name
            )
          `
          )
          .order('created_at', { ascending: false });

        // Apply filters if provided
        if (organizationId) {
          query = query.eq('organization_id', organizationId);
        }

        if (status) {
          query = query.eq('status', status);
        }

        // Apply pagination
        query = query.range(offset, offset + limit - 1);

        // Execute query
        const { data, error } = await query;

        // Handle database errors
        if (error) {
          logger.error({
            err: error.message,
            limit,
            offset,
            organizationId,
            status,
          }, 'Failed to fetch courses');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ErrorMessages.databaseError('Course listing', error.message),
          });
        }

        // Return empty array if no results
        if (!data || data.length === 0) {
          return [];
        }

        // Transform data to match response shape
        // Note: Supabase returns joined tables as objects, not arrays
        return data.map(course => {
          const user = course.users as { email: string } | null;
          const org = course.organizations as { name: string } | null;
          return {
            id: course.id,
            title: course.title,
            slug: course.slug,
            status: course.status,
            instructorId: course.user_id,
            instructorEmail: user?.email || 'Unknown User',
            organizationId: course.organization_id,
            organizationName: org?.name || 'Unknown Organization',
            createdAt: course.created_at || new Date().toISOString(),
            updatedAt: course.updated_at,
          };
        });
      } catch (error) {
        // Re-throw TRPCError as-is
        if (error instanceof TRPCError) {
          throw error;
        }

        // Log and wrap unexpected errors
        logger.error({
          err: error instanceof Error ? error.message : String(error),
          limit,
          offset,
          organizationId,
          status,
        }, 'Unexpected error in listCourses');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.internalError(
            'Course listing',
            error instanceof Error ? error.message : undefined
          ),
        });
      }
    }),
});

export type CoursesRouter = typeof coursesRouter;
