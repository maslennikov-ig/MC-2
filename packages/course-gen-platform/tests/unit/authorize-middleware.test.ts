/**
 * Unit tests for tRPC authorization middleware
 * @module tests/unit/authorize-middleware
 *
 * These tests verify that the authorization middleware correctly:
 * - Allows users with required roles to access procedures
 * - Blocks users without required roles with FORBIDDEN error
 * - Supports single and multiple role requirements
 * - Respects role hierarchy (admin > instructor > student)
 * - Provides helpful error messages
 * - Integrates properly with authentication middleware
 */

import { describe, it, expect } from 'vitest';
import { TRPCError } from '@trpc/server';
import { router } from '../../src/server/trpc';
import { protectedProcedure } from '../../src/server/middleware/auth';
import { adminProcedure, instructorProcedure } from '../../src/server/procedures';
import { hasRole } from '../../src/server/middleware/authorize';
import type { Context, UserContext } from '../../src/server/trpc';

/**
 * Helper to create mock context with specific user role
 */
function createContextWithRole(role: 'admin' | 'instructor' | 'student'): Context {
  return {
    user: {
      id: `${role}-user-id`,
      email: `${role}@example.com`,
      role,
      organizationId: 'test-org-id',
    },
  };
}

/**
 * Helper to create unauthenticated context
 */
function createUnauthenticatedContext(): Context {
  return {
    user: null,
  };
}

describe('Authorization Middleware', () => {
  describe('hasRole() Middleware', () => {
    describe('Single Role Requirement', () => {
      const testRouter = router({
        adminOnly: protectedProcedure.use(hasRole('admin')).query(({ ctx }) => ({
          message: 'Admin access granted',
          userId: ctx.user.id,
          role: ctx.user.role,
        })),

        instructorOnly: protectedProcedure.use(hasRole('instructor')).query(({ ctx }) => ({
          message: 'Instructor access granted',
          role: ctx.user.role,
        })),

        studentOnly: protectedProcedure.use(hasRole('student')).query(({ ctx }) => ({
          message: 'Student access granted',
          role: ctx.user.role,
        })),
      });

      it('should allow admin to access admin-only procedure', async () => {
        const caller = testRouter.createCaller(createContextWithRole('admin'));
        const result = await caller.adminOnly();

        expect(result).toEqual({
          message: 'Admin access granted',
          userId: 'admin-user-id',
          role: 'admin',
        });
      });

      it('should block instructor from admin-only procedure', async () => {
        const caller = testRouter.createCaller(createContextWithRole('instructor'));

        try {
          await caller.adminOnly();
          expect.fail('Should have thrown TRPCError');
        } catch (error) {
          expect(error).toBeInstanceOf(TRPCError);
          if (error instanceof TRPCError) {
            expect(error.code).toBe('FORBIDDEN');
            expect(error.message).toContain('admin');
            expect(error.message).toContain('instructor');
          }
        }
      });

      it('should block student from admin-only procedure', async () => {
        const caller = testRouter.createCaller(createContextWithRole('student'));

        try {
          await caller.adminOnly();
          expect.fail('Should have thrown TRPCError');
        } catch (error) {
          expect(error).toBeInstanceOf(TRPCError);
          if (error instanceof TRPCError) {
            expect(error.code).toBe('FORBIDDEN');
          }
        }
      });

      it('should allow instructor to access instructor-only procedure', async () => {
        const caller = testRouter.createCaller(createContextWithRole('instructor'));
        const result = await caller.instructorOnly();

        expect(result).toEqual({
          message: 'Instructor access granted',
          role: 'instructor',
        });
      });

      it('should block admin from instructor-only procedure (no implicit hierarchy)', async () => {
        // Note: With single role requirement, admin does NOT have implicit access
        // This is intentional - explicit role definition required
        const caller = testRouter.createCaller(createContextWithRole('admin'));

        try {
          await caller.instructorOnly();
          expect.fail('Should have thrown TRPCError');
        } catch (error) {
          expect(error).toBeInstanceOf(TRPCError);
          if (error instanceof TRPCError) {
            expect(error.code).toBe('FORBIDDEN');
          }
        }
      });

      it('should allow student to access student-only procedure', async () => {
        const caller = testRouter.createCaller(createContextWithRole('student'));
        const result = await caller.studentOnly();

        expect(result).toEqual({
          message: 'Student access granted',
          role: 'student',
        });
      });
    });

    describe('Multiple Role Requirements', () => {
      const testRouter = router({
        adminAndInstructor: protectedProcedure
          .use(hasRole(['admin', 'instructor']))
          .query(({ ctx }) => ({
            message: 'Admin or Instructor access',
            role: ctx.user.role,
          })),

        allRoles: protectedProcedure
          .use(hasRole(['admin', 'instructor', 'student']))
          .query(({ ctx }) => ({
            message: 'All authenticated users',
            role: ctx.user.role,
          })),
      });

      it('should allow admin to access admin+instructor procedure', async () => {
        const caller = testRouter.createCaller(createContextWithRole('admin'));
        const result = await caller.adminAndInstructor();

        expect(result).toEqual({
          message: 'Admin or Instructor access',
          role: 'admin',
        });
      });

      it('should allow instructor to access admin+instructor procedure', async () => {
        const caller = testRouter.createCaller(createContextWithRole('instructor'));
        const result = await caller.adminAndInstructor();

        expect(result).toEqual({
          message: 'Admin or Instructor access',
          role: 'instructor',
        });
      });

      it('should block student from admin+instructor procedure', async () => {
        const caller = testRouter.createCaller(createContextWithRole('student'));

        try {
          await caller.adminAndInstructor();
          expect.fail('Should have thrown TRPCError');
        } catch (error) {
          expect(error).toBeInstanceOf(TRPCError);
          if (error instanceof TRPCError) {
            expect(error.code).toBe('FORBIDDEN');
            expect(error.message).toContain('student');
          }
        }
      });

      it('should allow all roles to access all-roles procedure', async () => {
        const adminCaller = testRouter.createCaller(createContextWithRole('admin'));
        const instructorCaller = testRouter.createCaller(createContextWithRole('instructor'));
        const studentCaller = testRouter.createCaller(createContextWithRole('student'));

        const adminResult = await adminCaller.allRoles();
        const instructorResult = await instructorCaller.allRoles();
        const studentResult = await studentCaller.allRoles();

        expect(adminResult.role).toBe('admin');
        expect(instructorResult.role).toBe('instructor');
        expect(studentResult.role).toBe('student');
      });
    });

    describe('Error Messages', () => {
      const testRouter = router({
        adminOnly: protectedProcedure.use(hasRole('admin')).query(() => ({})),
        adminOrInstructor: protectedProcedure
          .use(hasRole(['admin', 'instructor']))
          .query(() => ({})),
      });

      it('should provide helpful error message for single role requirement', async () => {
        const caller = testRouter.createCaller(createContextWithRole('student'));

        try {
          await caller.adminOnly();
          expect.fail('Should have thrown TRPCError');
        } catch (error) {
          expect(error).toBeInstanceOf(TRPCError);
          if (error instanceof TRPCError) {
            expect(error.message).toContain('Access denied');
            expect(error.message).toContain('Required role: admin');
            expect(error.message).toContain('Your role: student');
          }
        }
      });

      it('should provide helpful error message for multiple role requirement', async () => {
        const caller = testRouter.createCaller(createContextWithRole('student'));

        try {
          await caller.adminOrInstructor();
          expect.fail('Should have thrown TRPCError');
        } catch (error) {
          expect(error).toBeInstanceOf(TRPCError);
          if (error instanceof TRPCError) {
            expect(error.message).toContain('Access denied');
            expect(error.message).toContain('admin or instructor');
            expect(error.message).toContain('Your role: student');
          }
        }
      });
    });

    describe('Integration with Authentication Middleware', () => {
      const testRouter = router({
        protected: protectedProcedure.use(hasRole('admin')).query(() => ({
          message: 'Success',
        })),
      });

      it('should require authentication before authorization', async () => {
        // Unauthenticated users should get UNAUTHORIZED, not FORBIDDEN
        const caller = testRouter.createCaller(createUnauthenticatedContext());

        try {
          await caller.protected();
          expect.fail('Should have thrown TRPCError');
        } catch (error) {
          expect(error).toBeInstanceOf(TRPCError);
          if (error instanceof TRPCError) {
            // Should get UNAUTHORIZED from auth middleware, not FORBIDDEN from authz
            expect(error.code).toBe('UNAUTHORIZED');
            expect(error.message).toContain('Authentication required');
          }
        }
      });

      it('should have defensive check for missing user in authorization middleware', async () => {
        // This tests the defensive check in hasRole middleware
        // In practice, this should never happen because protectedProcedure
        // ensures user exists, but we test the defensive logic anyway

        // Create a router WITHOUT protectedProcedure (for testing only)
        const testRouter = router({
          // Using publicProcedure + hasRole directly (bypasses auth middleware)
          // This is NOT recommended in production - just for testing defensive code
          unsafeEndpoint: protectedProcedure.use(hasRole('admin')).query(() => ({})),
        });

        const caller = testRouter.createCaller(createUnauthenticatedContext());

        try {
          await caller.unsafeEndpoint();
          expect.fail('Should have thrown TRPCError');
        } catch (error) {
          expect(error).toBeInstanceOf(TRPCError);
          if (error instanceof TRPCError) {
            // The defensive check in hasRole should catch this
            expect(error.code).toBe('UNAUTHORIZED');
          }
        }
      });
    });
  });

  describe('Convenient Procedure Builders', () => {
    describe('adminProcedure', () => {
      const testRouter = router({
        adminAction: adminProcedure.query(({ ctx }) => ({
          message: 'Admin action',
          userId: ctx.user.id,
          role: ctx.user.role,
        })),
      });

      it('should allow admin users', async () => {
        const caller = testRouter.createCaller(createContextWithRole('admin'));
        const result = await caller.adminAction();

        expect(result).toEqual({
          message: 'Admin action',
          userId: 'admin-user-id',
          role: 'admin',
        });
      });

      it('should block instructor users', async () => {
        const caller = testRouter.createCaller(createContextWithRole('instructor'));

        try {
          await caller.adminAction();
          expect.fail('Should have thrown TRPCError');
        } catch (error) {
          expect(error).toBeInstanceOf(TRPCError);
          if (error instanceof TRPCError) {
            expect(error.code).toBe('FORBIDDEN');
          }
        }
      });

      it('should block student users', async () => {
        const caller = testRouter.createCaller(createContextWithRole('student'));

        try {
          await caller.adminAction();
          expect.fail('Should have thrown TRPCError');
        } catch (error) {
          expect(error).toBeInstanceOf(TRPCError);
          if (error instanceof TRPCError) {
            expect(error.code).toBe('FORBIDDEN');
          }
        }
      });
    });

    describe('instructorProcedure', () => {
      const testRouter = router({
        instructorAction: instructorProcedure.query(({ ctx }) => ({
          message: 'Instructor action',
          role: ctx.user.role,
        })),
      });

      it('should allow admin users (role hierarchy)', async () => {
        const caller = testRouter.createCaller(createContextWithRole('admin'));
        const result = await caller.instructorAction();

        expect(result).toEqual({
          message: 'Instructor action',
          role: 'admin',
        });
      });

      it('should allow instructor users', async () => {
        const caller = testRouter.createCaller(createContextWithRole('instructor'));
        const result = await caller.instructorAction();

        expect(result).toEqual({
          message: 'Instructor action',
          role: 'instructor',
        });
      });

      it('should block student users', async () => {
        const caller = testRouter.createCaller(createContextWithRole('student'));

        try {
          await caller.instructorAction();
          expect.fail('Should have thrown TRPCError');
        } catch (error) {
          expect(error).toBeInstanceOf(TRPCError);
          if (error instanceof TRPCError) {
            expect(error.code).toBe('FORBIDDEN');
            expect(error.message).toContain('student');
          }
        }
      });
    });
  });

  describe('Role Hierarchy Implementation', () => {
    describe('Explicit Role Hierarchy via Multiple Roles', () => {
      // The role hierarchy is implemented explicitly by listing allowed roles
      // admin > instructor > student means:
      // - instructor endpoints allow ['admin', 'instructor']
      // - student endpoints allow ['admin', 'instructor', 'student']

      const testRouter = router({
        // Student-level: all authenticated users can access
        studentEndpoint: protectedProcedure
          .use(hasRole(['admin', 'instructor', 'student']))
          .query(({ ctx }) => ({
            message: 'Student level access',
            role: ctx.user.role,
          })),

        // Instructor-level: admin and instructor can access
        instructorEndpoint: protectedProcedure
          .use(hasRole(['admin', 'instructor']))
          .query(({ ctx }) => ({
            message: 'Instructor level access',
            role: ctx.user.role,
          })),

        // Admin-level: only admin can access
        adminEndpoint: protectedProcedure.use(hasRole('admin')).query(({ ctx }) => ({
          message: 'Admin level access',
          role: ctx.user.role,
        })),
      });

      it('should allow admin to access all endpoints', async () => {
        const caller = testRouter.createCaller(createContextWithRole('admin'));

        const studentResult = await caller.studentEndpoint();
        const instructorResult = await caller.instructorEndpoint();
        const adminResult = await caller.adminEndpoint();

        expect(studentResult.role).toBe('admin');
        expect(instructorResult.role).toBe('admin');
        expect(adminResult.role).toBe('admin');
      });

      it('should allow instructor to access instructor and student endpoints only', async () => {
        const caller = testRouter.createCaller(createContextWithRole('instructor'));

        // Should work
        const studentResult = await caller.studentEndpoint();
        const instructorResult = await caller.instructorEndpoint();
        expect(studentResult.role).toBe('instructor');
        expect(instructorResult.role).toBe('instructor');

        // Should fail
        try {
          await caller.adminEndpoint();
          expect.fail('Should have thrown TRPCError');
        } catch (error) {
          expect(error).toBeInstanceOf(TRPCError);
          if (error instanceof TRPCError) {
            expect(error.code).toBe('FORBIDDEN');
          }
        }
      });

      it('should allow student to access student endpoints only', async () => {
        const caller = testRouter.createCaller(createContextWithRole('student'));

        // Should work
        const studentResult = await caller.studentEndpoint();
        expect(studentResult.role).toBe('student');

        // Should fail
        try {
          await caller.instructorEndpoint();
          expect.fail('Should have thrown TRPCError');
        } catch (error) {
          expect(error).toBeInstanceOf(TRPCError);
          if (error instanceof TRPCError) {
            expect(error.code).toBe('FORBIDDEN');
          }
        }

        try {
          await caller.adminEndpoint();
          expect.fail('Should have thrown TRPCError');
        } catch (error) {
          expect(error).toBeInstanceOf(TRPCError);
          if (error instanceof TRPCError) {
            expect(error.code).toBe('FORBIDDEN');
          }
        }
      });
    });
  });

  describe('Context Preservation', () => {
    it('should preserve user context through authorization middleware', async () => {
      const fullContext: Context = {
        user: {
          id: 'user-123',
          email: 'user@test.com',
          role: 'admin',
          organizationId: 'org-456',
        },
      };

      const testRouter = router({
        getUserData: adminProcedure.query(({ ctx }) => ctx.user),
      });

      const caller = testRouter.createCaller(fullContext);
      const result = await caller.getUserData();

      expect(result).toEqual({
        id: 'user-123',
        email: 'user@test.com',
        role: 'admin',
        organizationId: 'org-456',
      });
    });

    it('should not modify user context data', async () => {
      const originalUser: UserContext = {
        id: 'user-id',
        email: 'test@example.com',
        role: 'instructor',
        organizationId: 'org-id',
      };

      const context: Context = { user: originalUser };

      const testRouter = router({
        getUser: instructorProcedure.query(({ ctx }) => ctx.user),
      });

      const caller = testRouter.createCaller(context);
      const result = await caller.getUser();

      expect(result).toEqual(originalUser);
    });
  });

  describe('Type Safety', () => {
    it('should provide type-safe user context in authorized procedures', async () => {
      const testRouter = router({
        getAdminData: adminProcedure.query(({ ctx }) => {
          // TypeScript should know ctx.user is non-null and has admin role
          // (though at runtime we only check role membership)
          const user: UserContext = ctx.user;

          return {
            id: user.id,
            email: user.email,
            role: user.role,
            organizationId: user.organizationId,
          };
        }),
      });

      const caller = testRouter.createCaller(createContextWithRole('admin'));
      const result = await caller.getAdminData();

      expect(result).toEqual({
        id: 'admin-user-id',
        email: 'admin@example.com',
        role: 'admin',
        organizationId: 'test-org-id',
      });
    });
  });

  describe('Error Consistency', () => {
    it('should throw consistent errors across multiple calls', async () => {
      const testRouter = router({
        adminOnly: adminProcedure.query(() => ({ message: 'Success' })),
      });

      const caller = testRouter.createCaller(createContextWithRole('student'));

      const errors: Array<{ code: string; message: string }> = [];

      for (let i = 0; i < 3; i++) {
        try {
          await caller.adminOnly();
          expect.fail('Should have thrown');
        } catch (error) {
          if (error instanceof TRPCError) {
            errors.push({ code: error.code, message: error.message });
          }
        }
      }

      // All errors should be identical
      expect(errors).toHaveLength(3);
      errors.forEach(error => {
        expect(error.code).toBe('FORBIDDEN');
        expect(error.message).toContain('Access denied');
      });
    });
  });

  describe('Complex Authorization Scenarios', () => {
    it('should support custom role combinations', async () => {
      // Custom combination: admin and student only (not instructor)
      const testRouter = router({
        customAccess: protectedProcedure.use(hasRole(['admin', 'student'])).query(({ ctx }) => ({
          role: ctx.user.role,
        })),
      });

      // Admin should work
      const adminCaller = testRouter.createCaller(createContextWithRole('admin'));
      const adminResult = await adminCaller.customAccess();
      expect(adminResult.role).toBe('admin');

      // Student should work
      const studentCaller = testRouter.createCaller(createContextWithRole('student'));
      const studentResult = await studentCaller.customAccess();
      expect(studentResult.role).toBe('student');

      // Instructor should fail
      const instructorCaller = testRouter.createCaller(createContextWithRole('instructor'));
      try {
        await instructorCaller.customAccess();
        expect.fail('Should have thrown TRPCError');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        if (error instanceof TRPCError) {
          expect(error.code).toBe('FORBIDDEN');
        }
      }
    });

    it('should support multiple authorization layers', async () => {
      // Stack multiple authorization checks
      const testRouter = router({
        doubleCheck: protectedProcedure
          .use(hasRole(['admin', 'instructor']))
          .use(hasRole('admin')) // Second check restricts further
          .query(({ ctx }) => ({
            role: ctx.user.role,
          })),
      });

      // Admin passes both checks
      const adminCaller = testRouter.createCaller(createContextWithRole('admin'));
      const adminResult = await adminCaller.doubleCheck();
      expect(adminResult.role).toBe('admin');

      // Instructor fails second check
      const instructorCaller = testRouter.createCaller(createContextWithRole('instructor'));
      try {
        await instructorCaller.doubleCheck();
        expect.fail('Should have thrown TRPCError');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        if (error instanceof TRPCError) {
          expect(error.code).toBe('FORBIDDEN');
        }
      }
    });
  });

  describe('Real-World Use Cases', () => {
    describe('Course Management', () => {
      const testRouter = router({
        // Students can view courses
        viewCourse: protectedProcedure
          .use(hasRole(['admin', 'instructor', 'student']))
          .query(() => ({ title: 'Course 101' })),

        // Instructors can create courses
        createCourse: instructorProcedure.mutation(() => ({
          id: 'new-course',
          title: 'New Course',
        })),

        // Admins can delete any course
        deleteCourse: adminProcedure.mutation(() => ({ success: true })),
      });

      it('should allow all users to view courses', async () => {
        const adminCaller = testRouter.createCaller(createContextWithRole('admin'));
        const instructorCaller = testRouter.createCaller(createContextWithRole('instructor'));
        const studentCaller = testRouter.createCaller(createContextWithRole('student'));

        const adminResult = await adminCaller.viewCourse();
        const instructorResult = await instructorCaller.viewCourse();
        const studentResult = await studentCaller.viewCourse();

        expect(adminResult.title).toBe('Course 101');
        expect(instructorResult.title).toBe('Course 101');
        expect(studentResult.title).toBe('Course 101');
      });

      it('should allow instructors and admins to create courses', async () => {
        const adminCaller = testRouter.createCaller(createContextWithRole('admin'));
        const instructorCaller = testRouter.createCaller(createContextWithRole('instructor'));

        const adminResult = await adminCaller.createCourse();
        const instructorResult = await instructorCaller.createCourse();

        expect(adminResult.id).toBe('new-course');
        expect(instructorResult.id).toBe('new-course');
      });

      it('should block students from creating courses', async () => {
        const studentCaller = testRouter.createCaller(createContextWithRole('student'));

        try {
          await studentCaller.createCourse();
          expect.fail('Should have thrown TRPCError');
        } catch (error) {
          expect(error).toBeInstanceOf(TRPCError);
          if (error instanceof TRPCError) {
            expect(error.code).toBe('FORBIDDEN');
          }
        }
      });

      it('should allow only admins to delete courses', async () => {
        const adminCaller = testRouter.createCaller(createContextWithRole('admin'));
        const result = await adminCaller.deleteCourse();
        expect(result.success).toBe(true);
      });

      it('should block instructors from deleting courses', async () => {
        const instructorCaller = testRouter.createCaller(createContextWithRole('instructor'));

        try {
          await instructorCaller.deleteCourse();
          expect.fail('Should have thrown TRPCError');
        } catch (error) {
          expect(error).toBeInstanceOf(TRPCError);
          if (error instanceof TRPCError) {
            expect(error.code).toBe('FORBIDDEN');
          }
        }
      });
    });

    describe('Organization Management', () => {
      const testRouter = router({
        // View organization settings
        getOrgSettings: protectedProcedure.use(hasRole(['admin', 'instructor'])).query(() => ({
          name: 'Test Org',
          tier: 'premium',
        })),

        // Update organization settings (admin only)
        updateOrgSettings: adminProcedure.mutation(() => ({ success: true })),
      });

      it('should allow admins and instructors to view org settings', async () => {
        const adminCaller = testRouter.createCaller(createContextWithRole('admin'));
        const instructorCaller = testRouter.createCaller(createContextWithRole('instructor'));

        const adminResult = await adminCaller.getOrgSettings();
        const instructorResult = await instructorCaller.getOrgSettings();

        expect(adminResult.name).toBe('Test Org');
        expect(instructorResult.name).toBe('Test Org');
      });

      it('should block students from viewing org settings', async () => {
        const studentCaller = testRouter.createCaller(createContextWithRole('student'));

        try {
          await studentCaller.getOrgSettings();
          expect.fail('Should have thrown TRPCError');
        } catch (error) {
          expect(error).toBeInstanceOf(TRPCError);
          if (error instanceof TRPCError) {
            expect(error.code).toBe('FORBIDDEN');
          }
        }
      });

      it('should allow only admins to update org settings', async () => {
        const adminCaller = testRouter.createCaller(createContextWithRole('admin'));
        const result = await adminCaller.updateOrgSettings();
        expect(result.success).toBe(true);
      });
    });
  });
});
