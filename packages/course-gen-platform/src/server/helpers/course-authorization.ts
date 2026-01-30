/**
 * Course Authorization Helper
 * @module server/helpers/course-authorization
 *
 * Centralized authorization logic for course operations.
 * Replaces scattered `course.user_id !== userId` checks with
 * role-aware authorization.
 *
 * Access Hierarchy:
 * - superadmin → FULL access to ALL courses (no restrictions)
 * - admin → access to courses in their organization
 * - instructor/user → access to their own courses only
 */

import { TRPCError } from '@trpc/server';
import type { Database } from '@megacampus/shared-types';

/**
 * User role from database schema
 */
type Role = Database['public']['Enums']['role'];

/**
 * Authorization context extracted from tRPC ctx.user
 */
export interface AuthorizationContext {
  userId: string;
  userRole: Role;
  organizationId: string;
}

/**
 * Course information needed for authorization check
 */
export interface CourseInfo {
  user_id: string;
  organization_id: string;
}

/**
 * Check if user can access/modify a course and throw if not
 *
 * Access levels:
 * - Superadmin → FULL access to ALL courses (no restrictions)
 * - Admin → access to courses in their organization
 * - Owner → access to their own courses
 *
 * @param ctx - Authorization context with user info
 * @param course - Course info with owner and organization
 * @param action - Optional action description for error message
 * @throws {TRPCError} FORBIDDEN if access denied
 *
 * @example
 * ```typescript
 * assertCourseAccess(
 *   { userId: ctx.user.id, userRole: ctx.user.role, organizationId: ctx.user.organizationId },
 *   course,
 *   'approve stage'
 * );
 * ```
 */
export function assertCourseAccess(
  ctx: AuthorizationContext,
  course: CourseInfo,
  action: string = 'access'
): void {
  // Superadmin has unrestricted access to everything
  if (ctx.userRole === 'superadmin') {
    return;
  }

  const isOwner = course.user_id === ctx.userId;
  const isOrgAdmin = ctx.userRole === 'admin' && ctx.organizationId === course.organization_id;

  if (!isOwner && !isOrgAdmin) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Access denied: cannot ${action} this course`,
    });
  }
}

/**
 * Check access without throwing (returns boolean)
 *
 * Use this when you need to conditionally check access without
 * throwing an error, e.g., for filtering lists or conditional UI.
 *
 * @param ctx - Authorization context with user info
 * @param course - Course info with owner and organization
 * @returns true if user can access the course
 *
 * @example
 * ```typescript
 * const courses = allCourses.filter(course =>
 *   canAccessCourse(
 *     { userId: ctx.user.id, userRole: ctx.user.role, organizationId: ctx.user.organizationId },
 *     course
 *   )
 * );
 * ```
 */
export function canAccessCourse(ctx: AuthorizationContext, course: CourseInfo): boolean {
  // Superadmin has unrestricted access to everything
  if (ctx.userRole === 'superadmin') {
    return true;
  }

  const isOwner = course.user_id === ctx.userId;
  const isOrgAdmin = ctx.userRole === 'admin' && ctx.organizationId === course.organization_id;

  return isOwner || isOrgAdmin;
}

/**
 * Build AuthorizationContext from tRPC ctx.user
 *
 * Helper to construct AuthorizationContext from the typical ctx.user object.
 *
 * @param user - tRPC context user object
 * @returns AuthorizationContext
 *
 * @example
 * ```typescript
 * assertCourseAccess(buildAuthContext(ctx.user!), course, 'update');
 * ```
 */
export function buildAuthContext(user: {
  id: string;
  role: Role;
  organizationId: string;
}): AuthorizationContext {
  return {
    userId: user.id,
    userRole: user.role,
    organizationId: user.organizationId,
  };
}
