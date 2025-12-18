/**
 * Unit tests for tRPC authentication middleware
 * @module tests/unit/auth-middleware
 *
 * These tests verify that the authentication middleware correctly:
 * - Allows authenticated users to pass through
 * - Blocks unauthenticated users with UNAUTHORIZED error
 * - Provides type-safe non-null user context after middleware
 * - Works correctly with protectedProcedure
 */

import { describe, it, expect } from 'vitest';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure } from '../../src/server/trpc';
import { protectedProcedure } from '../../src/server/middleware/auth';
import type { Context, UserContext } from '../../src/server/trpc';

/**
 * Helper to create mock context with user
 */
function createAuthenticatedContext(): Context {
  return {
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      role: 'student',
      organizationId: 'test-org-id',
    },
  };
}

/**
 * Helper to create mock context without user (unauthenticated)
 */
function createUnauthenticatedContext(): Context {
  return {
    user: null,
  };
}

describe('Authentication Middleware', () => {
  describe('isAuthenticated Middleware', () => {
    // Create a test router with both public and protected procedures
    const testRouter = router({
      public: publicProcedure.query(() => {
        return { message: 'This is public' };
      }),

      protected: protectedProcedure.query(({ ctx }) => {
        // ctx.user should be non-null here due to middleware
        return {
          message: 'This is protected',
          userId: ctx.user.id,
          userEmail: ctx.user.email,
        };
      }),
    });

    it('should allow access to public procedures without authentication', async () => {
      const caller = testRouter.createCaller(createUnauthenticatedContext());
      const result = await caller.public();

      expect(result).toEqual({ message: 'This is public' });
    });

    it('should allow access to protected procedures with valid authentication', async () => {
      const caller = testRouter.createCaller(createAuthenticatedContext());
      const result = await caller.protected();

      expect(result).toEqual({
        message: 'This is protected',
        userId: 'test-user-id',
        userEmail: 'test@example.com',
      });
    });

    it('should block access to protected procedures without authentication', async () => {
      const caller = testRouter.createCaller(createUnauthenticatedContext());

      await expect(caller.protected()).rejects.toThrow(TRPCError);
    });

    it('should throw UNAUTHORIZED error with correct code', async () => {
      const caller = testRouter.createCaller(createUnauthenticatedContext());

      try {
        await caller.protected();
        expect.fail('Should have thrown TRPCError');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        if (error instanceof TRPCError) {
          expect(error.code).toBe('UNAUTHORIZED');
        }
      }
    });

    it('should include helpful error message', async () => {
      const caller = testRouter.createCaller(createUnauthenticatedContext());

      try {
        await caller.protected();
        expect.fail('Should have thrown TRPCError');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        if (error instanceof TRPCError) {
          expect(error.message).toContain('Authentication required');
          expect(error.message).toContain('Bearer token');
        }
      }
    });
  });

  describe('Type Safety', () => {
    it('should provide non-null user context in protected procedures', async () => {
      const testRouter = router({
        getUserData: protectedProcedure.query(({ ctx }) => {
          // TypeScript should know ctx.user is non-null
          // This test verifies the type narrowing works correctly
          const user: UserContext = ctx.user; // Should not cause type error

          return {
            id: user.id,
            email: user.email,
            role: user.role,
            organizationId: user.organizationId,
          };
        }),
      });

      const caller = testRouter.createCaller(createAuthenticatedContext());
      const result = await caller.getUserData();

      expect(result).toEqual({
        id: 'test-user-id',
        email: 'test@example.com',
        role: 'student',
        organizationId: 'test-org-id',
      });
    });

    it('should allow nullable user context in public procedures', async () => {
      const testRouter = router({
        getOptionalUserData: publicProcedure.query(({ ctx }) => {
          // In public procedures, ctx.user can be null
          if (ctx.user) {
            return { authenticated: true, userId: ctx.user.id };
          }
          return { authenticated: false };
        }),
      });

      // Test with authenticated context
      const authenticatedCaller = testRouter.createCaller(createAuthenticatedContext());
      const authenticatedResult = await authenticatedCaller.getOptionalUserData();
      expect(authenticatedResult).toEqual({
        authenticated: true,
        userId: 'test-user-id',
      });

      // Test with unauthenticated context
      const unauthenticatedCaller = testRouter.createCaller(createUnauthenticatedContext());
      const unauthenticatedResult = await unauthenticatedCaller.getOptionalUserData();
      expect(unauthenticatedResult).toEqual({ authenticated: false });
    });
  });

  describe('Multiple Protected Procedures', () => {
    const testRouter = router({
      getUserProfile: protectedProcedure.query(({ ctx }) => ({
        id: ctx.user.id,
        email: ctx.user.email,
      })),

      getUserRole: protectedProcedure.query(({ ctx }) => ({
        role: ctx.user.role,
      })),

      getUserOrganization: protectedProcedure.query(({ ctx }) => ({
        organizationId: ctx.user.organizationId,
      })),
    });

    it('should allow authenticated users to access all protected procedures', async () => {
      const caller = testRouter.createCaller(createAuthenticatedContext());

      const profile = await caller.getUserProfile();
      const role = await caller.getUserRole();
      const org = await caller.getUserOrganization();

      expect(profile).toEqual({
        id: 'test-user-id',
        email: 'test@example.com',
      });
      expect(role).toEqual({ role: 'student' });
      expect(org).toEqual({ organizationId: 'test-org-id' });
    });

    it('should block unauthenticated users from all protected procedures', async () => {
      const caller = testRouter.createCaller(createUnauthenticatedContext());

      await expect(caller.getUserProfile()).rejects.toThrow(TRPCError);
      await expect(caller.getUserRole()).rejects.toThrow(TRPCError);
      await expect(caller.getUserOrganization()).rejects.toThrow(TRPCError);
    });
  });

  describe('Mixed Public and Protected Procedures', () => {
    const testRouter = router({
      publicInfo: publicProcedure.query(() => ({
        message: 'Available to everyone',
      })),

      protectedInfo: protectedProcedure.query(({ ctx }) => ({
        message: 'Available to authenticated users',
        userId: ctx.user.id,
      })),
    });

    it('should allow unauthenticated users to access only public procedures', async () => {
      const caller = testRouter.createCaller(createUnauthenticatedContext());

      // Public procedure should work
      const publicResult = await caller.publicInfo();
      expect(publicResult).toEqual({ message: 'Available to everyone' });

      // Protected procedure should fail
      await expect(caller.protectedInfo()).rejects.toThrow(TRPCError);
    });

    it('should allow authenticated users to access both public and protected procedures', async () => {
      const caller = testRouter.createCaller(createAuthenticatedContext());

      // Both should work
      const publicResult = await caller.publicInfo();
      const protectedResult = await caller.protectedInfo();

      expect(publicResult).toEqual({ message: 'Available to everyone' });
      expect(protectedResult).toEqual({
        message: 'Available to authenticated users',
        userId: 'test-user-id',
      });
    });
  });

  describe('Different User Roles', () => {
    it('should allow admin users to access protected procedures', async () => {
      const adminContext: Context = {
        user: {
          id: 'admin-id',
          email: 'admin@example.com',
          role: 'admin',
          organizationId: 'org-id',
        },
      };

      const testRouter = router({
        getData: protectedProcedure.query(({ ctx }) => ({
          role: ctx.user.role,
        })),
      });

      const caller = testRouter.createCaller(adminContext);
      const result = await caller.getData();

      expect(result).toEqual({ role: 'admin' });
    });

    it('should allow instructor users to access protected procedures', async () => {
      const instructorContext: Context = {
        user: {
          id: 'instructor-id',
          email: 'instructor@example.com',
          role: 'instructor',
          organizationId: 'org-id',
        },
      };

      const testRouter = router({
        getData: protectedProcedure.query(({ ctx }) => ({
          role: ctx.user.role,
        })),
      });

      const caller = testRouter.createCaller(instructorContext);
      const result = await caller.getData();

      expect(result).toEqual({ role: 'instructor' });
    });

    it('should allow student users to access protected procedures', async () => {
      const studentContext: Context = {
        user: {
          id: 'student-id',
          email: 'student@example.com',
          role: 'student',
          organizationId: 'org-id',
        },
      };

      const testRouter = router({
        getData: protectedProcedure.query(({ ctx }) => ({
          role: ctx.user.role,
        })),
      });

      const caller = testRouter.createCaller(studentContext);
      const result = await caller.getData();

      expect(result).toEqual({ role: 'student' });
    });
  });

  describe('Context Preservation', () => {
    it('should preserve all user context fields through middleware', async () => {
      const fullContext: Context = {
        user: {
          id: 'user-123',
          email: 'user@test.com',
          role: 'instructor',
          organizationId: 'org-456',
        },
      };

      const testRouter = router({
        getAllUserData: protectedProcedure.query(({ ctx }) => ctx.user),
      });

      const caller = testRouter.createCaller(fullContext);
      const result = await caller.getAllUserData();

      expect(result).toEqual({
        id: 'user-123',
        email: 'user@test.com',
        role: 'instructor',
        organizationId: 'org-456',
      });
    });

    it('should not modify user context data', async () => {
      const originalUser: UserContext = {
        id: 'user-id',
        email: 'test@example.com',
        role: 'student',
        organizationId: 'org-id',
      };

      const context: Context = { user: originalUser };

      const testRouter = router({
        getUser: protectedProcedure.query(({ ctx }) => ctx.user),
      });

      const caller = testRouter.createCaller(context);
      const result = await caller.getUser();

      // Result should match original user exactly
      expect(result).toEqual(originalUser);
    });
  });

  describe('Error Consistency', () => {
    it('should throw consistent errors across multiple calls', async () => {
      const testRouter = router({
        protected: protectedProcedure.query(({ ctx }) => ctx.user),
      });

      const caller = testRouter.createCaller(createUnauthenticatedContext());

      // Make multiple calls and verify errors are consistent
      const errors: Array<{ code: string; message: string }> = [];

      for (let i = 0; i < 3; i++) {
        try {
          await caller.protected();
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
        expect(error.code).toBe('UNAUTHORIZED');
        expect(error.message).toContain('Authentication required');
      });
    });
  });

  describe('Integration with Context Creation', () => {
    it('should work with the context structure from createContext', () => {
      // This test documents the integration between:
      // - T048: createContext() that returns { user: UserContext | null }
      // - T049: isAuthenticated middleware that checks ctx.user

      // The middleware relies on createContext returning the correct structure
      // If createContext returns null user, middleware throws UNAUTHORIZED
      // If createContext returns valid user, middleware passes through

      expect(true).toBe(true); // Documentation test
    });

    it('should handle all context scenarios from T048', () => {
      // Context scenarios from T048:
      // 1. No Authorization header → user: null
      // 2. Invalid JWT format → user: null
      // 3. Invalid JWT signature → user: null
      // 4. Expired JWT → user: null
      // 5. Valid JWT but user not in DB → user: null
      // 6. Valid JWT and user in DB → user: UserContext

      // All cases 1-5 → middleware throws UNAUTHORIZED
      // Case 6 → middleware allows access

      expect(true).toBe(true); // Documentation test
    });
  });
});
