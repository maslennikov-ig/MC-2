/**
 * LMS Router Helpers
 * @module server/routers/lms/helpers
 *
 * Shared helper functions for LMS routers.
 * Provides common authorization and validation utilities.
 */

import { TRPCError } from '@trpc/server';
import { lmsLogger } from '../../../integrations/lms/logger';

/**
 * Verify user belongs to the target organization
 *
 * Enforces organization isolation by checking user's organization ID
 * against the requested resource's organization ID.
 *
 * @param targetOrgId - Organization ID being accessed
 * @param userOrgId - User's organization ID from JWT
 * @param requestId - Request ID for logging
 * @param userId - User ID for logging
 * @param operation - Description of operation being performed (for logs)
 * @throws {TRPCError} FORBIDDEN if user doesn't belong to organization
 *
 * @example
 * ```typescript
 * verifyOrganizationAccess(config.organization_id, userOrgId, requestId, userId, 'access config');
 * ```
 */
export function verifyOrganizationAccess(
  targetOrgId: string,
  userOrgId: string,
  requestId: string,
  userId: string,
  operation: string
): void {
  if (targetOrgId !== userOrgId) {
    lmsLogger.warn(
      { requestId, userId, targetOrgId, userOrgId },
      `User attempted to ${operation} for different organization`
    );
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have access to this organization',
    });
  }
}

/**
 * Verify user is admin of the organization
 *
 * Enforces admin-only access for sensitive operations.
 *
 * @param userRole - User's role from JWT
 * @param requestId - Request ID for logging
 * @param userId - User ID for logging
 * @param organizationId - Organization ID for logging
 * @throws {TRPCError} FORBIDDEN if user is not admin
 *
 * @example
 * ```typescript
 * requireAdmin(ctx.user.role, requestId, userId, organizationId);
 * ```
 */
export function requireAdmin(
  userRole: string,
  requestId: string,
  userId: string,
  organizationId: string
): void {
  if (userRole !== 'admin') {
    lmsLogger.warn(
      { requestId, userId, userRole, organizationId },
      'Non-admin user attempted admin operation'
    );
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only organization administrators can perform this operation',
    });
  }
}
