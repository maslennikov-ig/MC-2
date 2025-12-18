/**
 * Authorization middleware for tRPC
 * @module server/middleware/authorize
 *
 * This module provides role-based authorization middleware for tRPC procedures.
 * It checks user roles from JWT claims and enforces access control based on
 * role requirements.
 *
 * Background:
 * - The authentication middleware (T049) ensures ctx.user exists
 * - This middleware builds on top by checking ctx.user.role
 * - Supports flexible role requirements: single role, multiple roles, hierarchical
 *
 * Role Hierarchy:
 * - admin: Full access to organization data (highest privilege)
 * - instructor: Can create/manage own courses + access student endpoints
 * - student: Can view enrolled courses only (lowest privilege)
 *
 * Usage:
 * - Admin-only: Use `hasRole('admin')` or `requireAdmin`
 * - Instructor+Admin: Use `hasRole(['admin', 'instructor'])` or `requireInstructor`
 * - All authenticated: Use `protectedProcedure` (from T049)
 *
 * Implementation Strategy:
 * - Build on top of protectedProcedure (which ensures user exists)
 * - Check if user.role matches allowed role(s)
 * - Throw FORBIDDEN (403) if unauthorized
 * - Allow flexible role definitions for convenience
 */

import { TRPCError } from '@trpc/server';
import { middleware } from '../trpc';
import type { Database } from '@megacampus/shared-types';

/**
 * User role type from database schema
 */
type Role = Database['public']['Enums']['role'];

/**
 * Role-based authorization middleware
 *
 * This middleware checks if the authenticated user has one of the allowed roles.
 * It must be chained after authentication middleware (isAuthenticated) because
 * it requires ctx.user to be non-null.
 *
 * Flow:
 * 1. Check if ctx.user exists (defensive check, should be guaranteed by auth middleware)
 * 2. Normalize allowedRoles to array for consistent handling
 * 3. Check if user.role is in allowedRoles array
 * 4. If not, throw FORBIDDEN error with helpful message
 * 5. If yes, pass through to next middleware/procedure
 *
 * Role Matching:
 * - Exact match: User role must be in allowedRoles array
 * - No implicit hierarchy: Each middleware explicitly defines allowed roles
 * - Example: requireInstructor = hasRole(['admin', 'instructor']) includes both
 *
 * Error Handling:
 * - Missing user → UNAUTHORIZED (401) - defensive, should be caught by auth middleware
 * - Wrong role → FORBIDDEN (403) - user is authenticated but lacks permission
 * - Error message indicates required roles and user's actual role
 *
 * Type Safety:
 * After this middleware, TypeScript knows the user has one of the allowed roles.
 * However, at runtime, we only check role membership, not specific role type.
 *
 * @param allowedRoles - Single role or array of roles that are permitted
 * @returns Middleware function that validates user role
 * @throws {TRPCError} UNAUTHORIZED (401) if user context missing (defensive)
 * @throws {TRPCError} FORBIDDEN (403) if user role not in allowedRoles
 *
 * @example
 * ```typescript
 * // Single role requirement
 * const adminOnlyProcedure = protectedProcedure
 *   .use(hasRole('admin'))
 *   .query(() => { ... });
 *
 * // Multiple allowed roles
 * const instructorProcedure = protectedProcedure
 *   .use(hasRole(['admin', 'instructor']))
 *   .mutation(() => { ... });
 * ```
 */
export function hasRole(allowedRoles: Role | Role[]) {
  return middleware(async ({ ctx, next }) => {
    // Defensive check: ensure user context exists
    // This should be guaranteed by authentication middleware,
    // but we check anyway for type safety and robustness
    if (!ctx.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Please provide a valid Bearer token.',
      });
    }

    // Normalize allowedRoles to array for consistent handling
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    // Check if user's role is in the allowed roles array
    if (!roles.includes(ctx.user.role)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Access denied. Required role: ${roles.join(' or ')}. Your role: ${ctx.user.role}`,
      });
    }

    // User has required role - pass through to next middleware/procedure
    return next({
      ctx, // Preserve the context with user information
    });
  });
}

/**
 * Superadmin-only authorization middleware
 *
 * Requires user to have 'superadmin' role. Use this for platform-level
 * administration that spans all organizations.
 *
 * Examples:
 * - Managing all organizations
 * - Viewing cross-organization analytics
 * - Managing API keys
 * - Viewing audit logs
 *
 * @example
 * ```typescript
 * const listAllOrganizations = protectedProcedure
 *   .use(requireSuperadmin)
 *   .query(() => { ... });
 * ```
 */
export const requireSuperadmin = hasRole('superadmin');

/**
 * Admin-only authorization middleware
 *
 * Requires user to have 'admin' role. Use this for procedures that
 * should only be accessible to organization administrators.
 *
 * Examples:
 * - View all users in organization
 * - Manage organization settings
 * - View all courses (not just own)
 * - Manage billing and subscriptions
 *
 * @example
 * ```typescript
 * const listAllUsers = protectedProcedure
 *   .use(requireAdmin)
 *   .query(() => { ... });
 * ```
 */
export const requireAdmin = hasRole(['superadmin', 'admin']);

/**
 * Instructor-level authorization middleware
 *
 * Requires user to have 'instructor' or 'admin' role. Use this for
 * procedures that instructors can access, with admin implicit access.
 *
 * Examples:
 * - Create and manage own courses
 * - View enrolled students
 * - Generate course content
 * - Upload course materials
 *
 * @example
 * ```typescript
 * const createCourse = protectedProcedure
 *   .use(requireInstructor)
 *   .mutation(() => { ... });
 * ```
 */
export const requireInstructor = hasRole(['superadmin', 'admin', 'instructor']);

/**
 * Student-level authorization middleware
 *
 * Requires user to have any valid role ('student', 'instructor', or 'admin').
 * Effectively equivalent to protectedProcedure since all authenticated users
 * have one of these roles. Use this for documentation clarity when a procedure
 * is explicitly for student-level access.
 *
 * Examples:
 * - View enrolled courses
 * - Access course content
 * - View own profile
 * - Track learning progress
 *
 * Note: In practice, this is the same as protectedProcedure since all authenticated
 * users have a role. However, it's provided for consistency and explicit documentation.
 *
 * @example
 * ```typescript
 * const viewMyCourses = protectedProcedure
 *   .use(requireStudent)
 *   .query(() => { ... });
 * ```
 */
export const requireStudent = hasRole(['superadmin', 'admin', 'instructor', 'student']);
