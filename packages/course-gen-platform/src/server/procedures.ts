/**
 * Pre-configured tRPC procedures for common authorization patterns
 * @module server/procedures
 *
 * This module provides convenient procedure builders that combine
 * authentication and authorization middleware. These are ready-to-use
 * alternatives to manually chaining protectedProcedure.use(requireXXX).
 *
 * Usage:
 * - Import these procedures in your routers instead of manually composing middleware
 * - Use adminProcedure for admin-only endpoints
 * - Use instructorProcedure for instructor/admin endpoints
 * - Use protectedProcedure for any authenticated user
 *
 * Note: These procedures are defined in a separate file to avoid circular
 * dependencies between trpc.ts, auth.ts, and authorize.ts.
 */

import { protectedProcedure } from './middleware/auth';
import { requireAdmin, requireInstructor, requireSuperadmin } from './middleware/authorize';

/**
 * Superadmin-only procedure
 *
 * This procedure requires authentication and superadmin role.
 * Use this for platform-level operations that should only be accessible
 * to platform administrators with cross-organization access.
 *
 * Examples:
 * - Managing all organizations
 * - Viewing cross-organization analytics
 * - Managing API keys
 * - Viewing audit logs
 * - Creating/deleting organizations
 *
 * @example
 * ```typescript
 * import { superadminProcedure } from './procedures';
 *
 * const listAllOrganizations = superadminProcedure.query(async ({ ctx }) => {
 *   // ctx.user is guaranteed non-null and has superadmin role
 *   return await fetchAllOrganizations();
 * });
 * ```
 */
export const superadminProcedure = protectedProcedure.use(requireSuperadmin);

/**
 * Admin-only procedure
 *
 * This procedure requires authentication and admin role.
 * Use this for administrative operations that should only be accessible
 * to organization administrators.
 *
 * Examples:
 * - Managing organization users
 * - Viewing organization-wide reports
 * - Configuring organization settings
 * - Managing billing and subscriptions
 *
 * @example
 * ```typescript
 * import { adminProcedure } from './procedures';
 *
 * const listAllUsers = adminProcedure.query(async ({ ctx }) => {
 *   // ctx.user is guaranteed non-null and has admin role
 *   return await fetchAllUsers(ctx.user.organizationId);
 * });
 * ```
 */
export const adminProcedure = protectedProcedure.use(requireAdmin);

/**
 * Instructor-level procedure
 *
 * This procedure requires authentication and instructor or admin role.
 * Use this for operations that instructors can perform, with admin
 * implicit access.
 *
 * Examples:
 * - Creating and managing courses
 * - Uploading course materials
 * - Viewing enrolled students
 * - Generating course content
 *
 * @example
 * ```typescript
 * import { instructorProcedure } from './procedures';
 *
 * const createCourse = instructorProcedure.mutation(async ({ ctx, input }) => {
 *   // ctx.user is guaranteed non-null and has instructor or admin role
 *   return await createCourseForUser(ctx.user.id, input);
 * });
 * ```
 */
export const instructorProcedure = protectedProcedure.use(requireInstructor);
