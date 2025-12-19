/**
 * Admin Users Router
 * @module server/routers/admin/users
 *
 * Provides admin procedures for user management.
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router } from '../../trpc';
import { adminProcedure, superadminProcedure } from '../../procedures';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { ErrorMessages } from '../../utils/error-messages.js';
import { listUsersInputSchema } from './shared/schemas';
import { roleSchema } from '@megacampus/shared-types';
import type { UserListResponse } from './shared/types';

/**
 * Fallback organization name when organization data is not available
 */
const UNKNOWN_ORG_NAME = 'Unknown Organization';

/**
 * Input schema for updateUserRole mutation
 */
const updateUserRoleInputSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  role: roleSchema,
});

/**
 * Input schema for toggleUserActivation mutation
 */
const toggleUserActivationInputSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  isActive: z.boolean(),
});

/**
 * Input schema for getUserById query
 */
const getUserByIdInputSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
});

export const usersRouter = router({
  /**
   * List users with pagination and filtering
   */
  listUsers: adminProcedure
    .input(listUsersInputSchema)
    .query(async ({ input }): Promise<UserListResponse> => {
      const { limit, offset, organizationId, role, isActive, search } = input;

      try {
        const supabase = getSupabaseAdmin();

        // Sanitize search input for ILIKE pattern matching
        const sanitizedSearch = search ? search.replace(/[%_\\]/g, '\\$&') : undefined;

        // Build count query with same filters (before pagination)
        let countQuery = supabase
          .from('users')
          .select('*', { count: 'exact', head: true });

        // Apply same filters to count query
        if (organizationId) {
          countQuery = countQuery.eq('organization_id', organizationId);
        }
        if (role) {
          countQuery = countQuery.eq('role', role);
        }
        if (isActive !== undefined) {
          countQuery = countQuery.eq('is_active', isActive);
        }
        if (sanitizedSearch) {
          countQuery = countQuery.ilike('email', `%${sanitizedSearch}%`);
        }

        const { count, error: countError } = await countQuery;

        if (countError) {
          logger.error({
            err: countError.message,
            organizationId,
            role,
          }, 'Failed to count users');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ErrorMessages.databaseError('User count', countError.message),
          });
        }

        // Build query with JOIN to organizations table
        let query = supabase
          .from('users')
          .select(
            `
            id,
            email,
            role,
            is_active,
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

        if (isActive !== undefined) {
          query = query.eq('is_active', isActive);
        }

        if (sanitizedSearch) {
          query = query.ilike('email', `%${sanitizedSearch}%`);
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

        // Return empty result if no data
        if (!data || data.length === 0) {
          return { users: [], totalCount: count ?? 0 };
        }

        // Transform data to match response shape
        // Note: Supabase returns organizations as an object, not an array
        const users = data.map(user => {
          const org = user.organizations as { name: string } | null;
          return {
            id: user.id,
            email: user.email,
            role: user.role,
            organizationId: user.organization_id,
            organizationName: org?.name || UNKNOWN_ORG_NAME,
            isActive: user.is_active,
            createdAt: user.created_at || new Date().toISOString(),
            updatedAt: user.updated_at,
          };
        });

        return { users, totalCount: count ?? 0 };
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

  /**
   * Get a single user by ID with organization info
   */
  getUserById: superadminProcedure
    .input(getUserByIdInputSchema)
    .query(async ({ input }) => {
      const { userId } = input;

      try {
        const supabase = getSupabaseAdmin();

        const { data, error } = await supabase
          .from('users')
          .select(
            `
            id,
            email,
            role,
            is_active,
            organization_id,
            created_at,
            updated_at,
            organizations:organization_id (
              id,
              name,
              tier
            )
          `
          )
          .eq('id', userId)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: ErrorMessages.notFound('User', userId),
            });
          }
          logger.error({ err: error.message, userId }, 'Failed to fetch user');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ErrorMessages.databaseError('User lookup', error.message),
          });
        }

        const org = data.organizations as { id: string; name: string; tier: string } | null;

        return {
          id: data.id,
          email: data.email,
          role: data.role,
          organizationId: data.organization_id,
          organizationName: org?.name || UNKNOWN_ORG_NAME,
          organizationTier: org?.tier || 'unknown',
          isActive: data.is_active,
          createdAt: data.created_at || new Date().toISOString(),
          updatedAt: data.updated_at,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error({
          err: error instanceof Error ? error.message : String(error),
          userId,
        }, 'Unexpected error in getUserById');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.internalError(
            'User lookup',
            error instanceof Error ? error.message : undefined
          ),
        });
      }
    }),

  /**
   * Update a user's role
   * Validations:
   * - Cannot change own role
   * - Cannot demote the last superadmin
   */
  updateUserRole: superadminProcedure
    .input(updateUserRoleInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { userId, role } = input;
      // superadminProcedure guarantees ctx.user is non-null
      const currentUser = ctx.user!;

      // Validation: Cannot change own role
      if (userId === currentUser.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot change your own role. Ask another superadmin to make this change.',
        });
      }

      try {
        const supabase = getSupabaseAdmin();

        // Get the current user's role to check if demoting a superadmin
        const { data: targetUser, error: fetchError } = await supabase
          .from('users')
          .select('role')
          .eq('id', userId)
          .single();

        if (fetchError) {
          if (fetchError.code === 'PGRST116') {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: ErrorMessages.notFound('User', userId),
            });
          }
          logger.error({ err: fetchError.message, userId }, 'Failed to fetch user for role update');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ErrorMessages.databaseError('User lookup', fetchError.message),
          });
        }

        // Validation: Cannot demote the last superadmin
        if (targetUser.role === 'superadmin' && role !== 'superadmin') {
          const { count, error: countError } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'superadmin');

          if (countError) {
            logger.error({ err: countError.message }, 'Failed to count superadmins');
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: ErrorMessages.databaseError('Superadmin count', countError.message),
            });
          }

          if (count !== null && count <= 1) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Cannot demote the last superadmin. Promote another user to superadmin first.',
            });
          }
        }

        // Update the user's role
        const { data: updatedUser, error: updateError } = await supabase
          .from('users')
          .update({ role, updated_at: new Date().toISOString() })
          .eq('id', userId)
          .select(
            `
            id,
            email,
            role,
            is_active,
            organization_id,
            created_at,
            updated_at,
            organizations:organization_id (
              name
            )
          `
          )
          .single();

        if (updateError) {
          logger.error({ err: updateError.message, userId, role }, 'Failed to update user role');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ErrorMessages.databaseError('User role update', updateError.message),
          });
        }

        const org = updatedUser.organizations as { name: string } | null;

        logger.info({ userId, oldRole: targetUser.role, newRole: role }, 'User role updated');

        return {
          id: updatedUser.id,
          email: updatedUser.email,
          role: updatedUser.role,
          organizationId: updatedUser.organization_id,
          organizationName: org?.name || UNKNOWN_ORG_NAME,
          isActive: updatedUser.is_active,
          createdAt: updatedUser.created_at || new Date().toISOString(),
          updatedAt: updatedUser.updated_at,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error({
          err: error instanceof Error ? error.message : String(error),
          userId,
          role,
        }, 'Unexpected error in updateUserRole');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.internalError(
            'User role update',
            error instanceof Error ? error.message : undefined
          ),
        });
      }
    }),

  /**
   * Toggle user activation status
   * Validations:
   * - Cannot deactivate own account
   */
  toggleUserActivation: superadminProcedure
    .input(toggleUserActivationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { userId, isActive } = input;
      // superadminProcedure guarantees ctx.user is non-null
      const currentUser = ctx.user!;

      // Validation: Cannot deactivate own account
      if (userId === currentUser.id && !isActive) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot deactivate your own account. Ask another superadmin to make this change.',
        });
      }

      try {
        const supabase = getSupabaseAdmin();

        // Check if user exists
        const { error: fetchError } = await supabase
          .from('users')
          .select('id')
          .eq('id', userId)
          .single();

        if (fetchError) {
          if (fetchError.code === 'PGRST116') {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: ErrorMessages.notFound('User', userId),
            });
          }
          logger.error({ err: fetchError.message, userId }, 'Failed to fetch user for activation toggle');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ErrorMessages.databaseError('User lookup', fetchError.message),
          });
        }

        // Update the user's is_active status
        const { data: updatedUser, error: updateError } = await supabase
          .from('users')
          .update({
            is_active: isActive,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId)
          .select(
            `
            id,
            email,
            role,
            is_active,
            organization_id,
            created_at,
            updated_at,
            organizations:organization_id (
              name
            )
          `
          )
          .single();

        if (updateError) {
          logger.error({ err: updateError.message, userId, isActive }, 'Failed to update user activation');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ErrorMessages.databaseError('User activation update', updateError.message),
          });
        }

        const org = updatedUser.organizations as { name: string } | null;

        logger.info({ userId, isActive }, `User ${isActive ? 'activated' : 'deactivated'}`);

        return {
          id: updatedUser.id,
          email: updatedUser.email,
          role: updatedUser.role,
          organizationId: updatedUser.organization_id,
          organizationName: org?.name || UNKNOWN_ORG_NAME,
          isActive: updatedUser.is_active,
          createdAt: updatedUser.created_at || new Date().toISOString(),
          updatedAt: updatedUser.updated_at,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error({
          err: error instanceof Error ? error.message : String(error),
          userId,
          isActive,
        }, 'Unexpected error in toggleUserActivation');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.internalError(
            'User activation update',
            error instanceof Error ? error.message : undefined
          ),
        });
      }
    }),
});

export type UsersRouter = typeof usersRouter;
