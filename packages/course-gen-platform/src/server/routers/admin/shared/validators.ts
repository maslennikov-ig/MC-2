/**
 * Admin Shared Validators
 * @module server/routers/admin/shared/validators
 *
 * Reusable validation functions for admin user operations.
 * Each validator throws a TRPCError when validation fails.
 */

import { TRPCError } from '@trpc/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@megacampus/shared-types';
import { logger } from '../../../../shared/logger/index.js';
import { ErrorMessages } from '../../../utils/error-messages.js';

type Role = Database['public']['Enums']['role'];

/**
 * User data returned from fetch operations
 */
export interface FetchedUser {
  id: string;
  email: string;
  role: Role;
}

/**
 * Validates that the target user is not the current user.
 * Used to prevent self-modification in sensitive operations.
 */
export function validateNotSelf(
  targetUserId: string,
  currentUserId: string,
  action: 'change role' | 'deactivate' | 'delete'
): void {
  if (targetUserId === currentUserId) {
    const messages: Record<typeof action, string> = {
      'change role': 'Cannot change your own role. Ask another admin to make this change.',
      deactivate: 'Cannot deactivate your own account. Ask another admin to make this change.',
      delete: 'Cannot delete your own account.',
    };
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: messages[action],
    });
  }
}

/**
 * Validates that only superadmins can perform the action.
 */
export function validateSuperadminOnly(currentUserRole: Role, action: string): void {
  if (currentUserRole !== 'superadmin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Only superadmins can ${action}.`,
    });
  }
}

/**
 * Validates that admins cannot modify superadmin users.
 * Superadmins can modify anyone.
 */
export function validateCanModifyTarget(
  targetRole: Role,
  currentUserRole: Role,
  action: 'modify' | 'change activation of' | 'delete'
): void {
  if (targetRole === 'superadmin' && currentUserRole !== 'superadmin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Only superadmins can ${action} superadmin users.`,
    });
  }
}

/**
 * Validates that admins can only perform action on students and instructors.
 * Used for delete operation where admins shouldn't delete other admins.
 */
export function validateAdminCanOnlyModifyLowerRoles(
  targetRole: Role,
  currentUserRole: Role,
  action: string
): void {
  if (currentUserRole !== 'superadmin') {
    if (targetRole === 'superadmin' || targetRole === 'admin') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Admins can only ${action} students and instructors.`,
      });
    }
  }
}

/**
 * Validates that we're not demoting/deleting the last superadmin.
 * Requires a database query to count superadmins.
 */
export async function validateNotLastSuperadmin(
  supabase: SupabaseClient<Database>,
  targetRole: Role,
  action: 'demote' | 'delete'
): Promise<void> {
  if (targetRole !== 'superadmin') {
    return;
  }

  const { count, error } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'superadmin');

  if (error) {
    logger.error({ err: error.message }, 'Failed to count superadmins');
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: ErrorMessages.databaseError('Superadmin count', error.message),
    });
  }

  if (count !== null && count <= 1) {
    const messages: Record<typeof action, string> = {
      demote: 'Cannot demote the last superadmin. Promote another user to superadmin first.',
      delete: 'Cannot delete the last superadmin.',
    };
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: messages[action],
    });
  }
}

/**
 * Fetches a user by ID with specified fields.
 * Throws NOT_FOUND if user doesn't exist.
 */
export async function fetchUserForValidation(
  supabase: SupabaseClient<Database>,
  userId: string,
  operation: string
): Promise<FetchedUser> {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, role')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: ErrorMessages.notFound('User', userId),
      });
    }
    logger.error({ err: error.message, userId }, `Failed to fetch user for ${operation}`);
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: ErrorMessages.databaseError('User lookup', error.message),
    });
  }

  return {
    id: data.id,
    email: data.email,
    role: data.role,
  };
}
