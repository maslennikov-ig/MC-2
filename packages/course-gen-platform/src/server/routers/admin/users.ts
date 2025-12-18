/**
 * Admin Users Router
 * @module server/routers/admin/users
 *
 * Provides admin procedures for user management.
 */

import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { ErrorMessages } from '../../utils/error-messages.js';
import { listUsersInputSchema } from './shared/schemas';
import type { UserListItem } from './shared/types';

export const usersRouter = router({
  listUsers: adminProcedure
    .input(listUsersInputSchema)
    .query(async ({ input }): Promise<UserListItem[]> => {
      const { limit, offset, organizationId, role } = input;

      try {
        const supabase = getSupabaseAdmin();

        // Build query with JOIN to organizations table
        let query = supabase
          .from('users')
          .select(
            `
            id,
            email,
            role,
            organization_id,
            created_at,
            updated_at,
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

        if (role) {
          query = query.eq('role', role);
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
            role,
          }, 'Failed to fetch users');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ErrorMessages.databaseError('User listing', error.message),
          });
        }

        // Return empty array if no results
        if (!data || data.length === 0) {
          return [];
        }

        // Transform data to match response shape
        // Note: Supabase returns organizations as an object, not an array
        return data.map(user => {
          const org = user.organizations as { name: string } | null;
          return {
            id: user.id,
            email: user.email,
            role: user.role,
            organizationId: user.organization_id,
            organizationName: org?.name || 'Unknown Organization',
            createdAt: user.created_at || new Date().toISOString(),
            updatedAt: user.updated_at,
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
          role,
        }, 'Unexpected error in listUsers');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.internalError(
            'User listing',
            error instanceof Error ? error.message : undefined
          ),
        });
      }
    }),
});

export type UsersRouter = typeof usersRouter;
