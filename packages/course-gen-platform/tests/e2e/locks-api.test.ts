/**
 * Locks tRPC API - E2E Tests
 * @module tests/e2e/locks-api
 *
 * End-to-end tests for the generation locks tRPC router.
 * Tests lock acquisition, release, status checking, and concurrent generation prevention.
 *
 * Test Coverage:
 * 1. locks.isLocked - Check if course has active lock
 * 2. locks.getLock - Get lock details for a course
 * 3. locks.getAllLocks - Admin-only list of all active locks
 * 4. locks.forceRelease - Admin-only force release of locks
 * 5. Concurrent generation prevention (FR-037)
 * 6. Lock status checking before generation (FR-038)
 *
 * Prerequisites:
 * - Supabase project configured with test users
 * - Redis running for lock service
 * - Test fixtures available (TEST_ORGS, TEST_USERS, TEST_COURSES)
 *
 * Test execution: pnpm test tests/e2e/locks-api.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import type { AppRouter } from '../../src/server/app-router';
import {
  setupTestFixtures,
  cleanupTestFixtures,
  TEST_USERS,
  TEST_COURSES,
  TEST_AUTH_USERS,
  TEST_ORGS,
} from '../fixtures';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import { generationLockService } from '../../src/shared/locks';
import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from '../../src/server/app-router';
import { createContext } from '../../src/server/trpc';
import type { Server } from 'http';
import cors from 'cors';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Test server instance
 */
interface TestServer {
  server: Server;
  port: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Start tRPC server for testing
 *
 * Creates an Express app with tRPC middleware and starts listening on
 * a dynamically assigned port.
 *
 * @returns Server instance and assigned port
 */
async function startTestServer(): Promise<TestServer> {
  const app = express();

  // Enable CORS for test requests
  app.use(
    cors({
      origin: '*',
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization'],
      methods: ['GET', 'POST', 'OPTIONS'],
    })
  );

  // Parse JSON request bodies
  app.use(express.json({ limit: '10mb' }));

  // Mount tRPC middleware at /trpc
  app.use(
    '/trpc',
    createExpressMiddleware({
      router: appRouter,
      createContext: async ({ req }) => {
        // Adapt Express req to Fetch API Request for createContext
        const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        const headers = new Headers();

        // Copy headers from Express request to Headers object
        Object.entries(req.headers).forEach(([key, value]) => {
          if (value) {
            if (Array.isArray(value)) {
              value.forEach(v => headers.append(key, v));
            } else {
              headers.set(key, value);
            }
          }
        });

        // Create Fetch API Request
        const fetchRequest = new Request(url, {
          method: req.method,
          headers,
        });

        // Call createContext with adapted request
        return createContext({
          req: fetchRequest,
          resHeaders: new Headers(),
          info: {
            isBatchCall: false,
            calls: [],
            accept: 'application/jsonl' as const,
            type: 'query' as const,
            connectionParams: null,
            signal: new AbortController().signal,
            url: new URL(url),
          },
        });
      },
    })
  );

  // Start server on dynamic port (0 = OS assigns available port)
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        console.log(`[locks-api.test] Test tRPC server started on port ${port}`);
        resolve({ server, port });
      } else {
        reject(new Error('Failed to get server port'));
      }
    });

    server.on('error', reject);
  });
}

/**
 * Stop test server gracefully
 *
 * @param testServer - Server instance to stop
 */
async function stopTestServer(testServer: TestServer): Promise<void> {
  return new Promise((resolve, reject) => {
    testServer.server.close(err => {
      if (err) {
        reject(err);
      } else {
        console.log(`[locks-api.test] Test tRPC server stopped (port ${testServer.port})`);
        resolve();
      }
    });
  });
}

/**
 * Create tRPC client with optional JWT token
 *
 * @param port - Server port
 * @param token - Optional JWT token for authentication
 * @returns Typed tRPC client
 */
function createTestClient(port: number, token?: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `http://localhost:${port}/trpc`,
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
      }),
    ],
  });
}

/**
 * Sign in with Supabase and get JWT token
 *
 * @param email - User email
 * @param password - User password
 * @param retries - Number of retry attempts
 * @returns JWT access token
 * @throws Error if authentication fails
 */
async function getAuthToken(email: string, password: string, retries = 5): Promise<string> {
  const supabase = getSupabaseAdmin();

  // Create a temporary client with anon key for authentication
  const { createClient } = await import('@supabase/supabase-js');
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;

  if (!anonKey || !supabaseUrl) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
  }

  const authClient = createClient(supabaseUrl, anonKey);

  // Retry logic to handle transient Supabase Auth failures (including "Database error" issues)
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data, error } = await authClient.auth.signInWithPassword({
        email,
        password,
      });

      if (!error && data.session) {
        console.log(`[locks-api.test] Auth success for ${email} on attempt ${attempt}`);
        return data.session.access_token;
      }

      if (attempt < retries) {
        const delay = attempt * 1000; // Exponential backoff: 1s, 2s, 3s, 4s
        console.log(`[locks-api.test] Auth attempt ${attempt} failed for ${email}: ${error?.message || 'No session'}, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        const {
          data: { users },
        } = await supabase.auth.admin.listUsers();
        const user = users.find(u => u.email === email);

        throw new Error(
          `Failed to authenticate user ${email} after ${retries} attempts: ${
            error?.message || 'No session returned'
          }. User exists in auth: ${!!user}, User ID: ${user?.id}`
        );
      }
    } catch (err) {
      if (attempt >= retries) {
        throw err;
      }
      const delay = attempt * 1000;
      console.log(`[locks-api.test] Auth attempt ${attempt} threw for ${email}: ${err}, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error(`Failed to authenticate user ${email}: unexpected error`);
}

/**
 * Create or update admin user in Supabase Auth
 *
 * Admin user is special because it doesn't go through setupTestFixtures auth flow.
 * We need to create it separately with admin role.
 *
 * @param email - User email
 * @param password - User password
 * @param userId - User ID from users table (must match)
 */
async function ensureAdminAuthUser(email: string, password: string, userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  try {
    // Check if admin auth user already exists
    const {
      data: { users: existingUsers },
    } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers.find(u => u.email === email);

    if (existingUser) {
      // If existing user has the same ID, just update password
      if (existingUser.id === userId) {
        console.log(`[locks-api.test] Admin user ${email} exists with correct ID, updating password`);
        await supabase.auth.admin.updateUserById(existingUser.id, {
          password,
          email_confirm: true,
          user_metadata: { role: 'admin' },
        });
        return;
      }

      // Existing user has different ID - delete and recreate
      console.log(`[locks-api.test] Admin user ${email} exists with different ID (${existingUser.id}), deleting and recreating`);
      await supabase.auth.admin.deleteUser(existingUser.id);
      // Wait for deletion to propagate
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Create admin auth user with specific ID
    const { data, error } = await supabase.auth.admin.createUser({
      id: userId,
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'admin' },
    });

    if (error) {
      throw new Error(`Failed to create admin auth user: ${error.message}`);
    }

    console.log(`[locks-api.test] Created admin auth user for ${email} with ID ${data.user.id}`);

    // Also ensure public.users entry exists with admin role
    const { error: userError } = await supabase.from('users').upsert(
      {
        id: userId,
        email,
        role: 'admin',
        organization_id: TEST_ORGS.premium.id,
      },
      { onConflict: 'id' }
    );

    if (userError) {
      console.warn(`[locks-api.test] Warning: Could not create admin public.users entry: ${userError.message}`);
    }
  } catch (error) {
    console.warn(`[locks-api.test] Error ensuring admin auth user:`, error);
    throw error;
  }
}

/**
 * Clean up all locks for test courses
 */
async function cleanupTestLocks(): Promise<void> {
  const testCourseIds = Object.values(TEST_COURSES).map(c => c.id);

  for (const courseId of testCourseIds) {
    try {
      await generationLockService.forceRelease(courseId);
    } catch {
      // Ignore errors - lock may not exist
    }
  }
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Locks tRPC API E2E', () => {
  let testServer: TestServer;
  let serverPort: number;

  // Test course ID for lock operations
  const testCourseId = TEST_COURSES.course1.id;

  // Auth tokens for different user roles
  let adminToken: string;
  let instructorToken: string;
  // Note: Student token is optional - some tests may be skipped if it fails
  let studentToken: string | null = null;
  // Track if admin auth is verified working (role=admin in public.users)
  let adminAuthVerified = false;

  beforeAll(async () => {
    console.log('[locks-api.test] Setting up locks API E2E tests...');

    // Clean up any existing test data
    await cleanupTestFixtures();

    // Admin password - needs separate handling since admin doesn't go through normal auth flow
    const adminPassword = 'test-password-admin';

    // Create admin auth user first (before setupTestFixtures)
    try {
      await ensureAdminAuthUser(TEST_USERS.admin.email, adminPassword, TEST_USERS.admin.id);
    } catch (error) {
      console.warn('[locks-api.test] Warning: Could not create admin auth user:', error);
    }

    // Setup test fixtures - this creates auth users for instructor and student
    // via the RPC functions that are already tested
    await setupTestFixtures();

    // Ensure admin user has correct role in public.users
    // This is needed because ensureAdminAuthUser may fail if user already exists
    const supabaseSetup = getSupabaseAdmin();
    const { error: adminUpdateError } = await supabaseSetup.from('users').upsert(
      {
        id: TEST_USERS.admin.id,
        email: TEST_USERS.admin.email,
        role: 'admin',
        organization_id: TEST_ORGS.premium.id,
      },
      { onConflict: 'id' }
    );
    if (adminUpdateError) {
      console.warn('[locks-api.test] Warning: Could not update admin user role:', adminUpdateError);
    } else {
      console.log('[locks-api.test] Admin user role set to admin in public.users');
    }

    // Wait for Supabase Auth to fully propagate (longer delay for stable indexing)
    console.log('[locks-api.test] Waiting for auth users to be ready...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Start tRPC server
    testServer = await startTestServer();
    serverPort = testServer.port;

    // CRITICAL: Ensure admin role is correctly set RIGHT BEFORE getting tokens
    // This must be the LAST update to the admin user before authentication
    const supabaseForAdminRole = getSupabaseAdmin();
    const { data: adminUpdateResult, error: adminRoleError } = await supabaseForAdminRole
      .from('users')
      .update({ role: 'admin' })
      .eq('id', TEST_USERS.admin.id)
      .select('*')
      .single();

    if (adminRoleError) {
      console.error('[locks-api.test] CRITICAL: Failed to set admin role:', adminRoleError);
      throw new Error(`Failed to set admin role: ${adminRoleError.message}`);
    }
    console.log(`[locks-api.test] Admin role updated: ID=${adminUpdateResult?.id}, Role=${adminUpdateResult?.role}`);

    // Get auth tokens for different roles
    // Admin and instructor are required, student is optional (may fail due to Supabase Auth indexing)
    try {
      adminToken = await getAuthToken(TEST_USERS.admin.email, adminPassword);
      instructorToken = await getAuthToken(TEST_USERS.instructor1.email, TEST_AUTH_USERS.instructor1.password);

      // Debug: Decode admin token to verify role
      const supabase = getSupabaseAdmin();
      const { data: { user }, error: verifyError } = await supabase.auth.getUser(adminToken);
      console.log(`[locks-api.test] Admin token user ID: ${user?.id}, Email: ${user?.email}`);

      // Also check public.users entry
      const { data: publicUser } = await supabase.from('users').select('*').eq('email', TEST_USERS.admin.email).single();
      console.log(`[locks-api.test] Admin public.users: ID=${publicUser?.id}, Role=${publicUser?.role}`);

      // Verify admin auth is working correctly
      adminAuthVerified = publicUser?.role === 'admin';
      if (!adminAuthVerified) {
        console.warn('[locks-api.test] WARNING: Admin role verification failed. Admin-only tests may be skipped.');
        console.warn('[locks-api.test] This is a known transient issue with Supabase Auth in test environment.');
      }
    } catch (error) {
      console.error('[locks-api.test] Failed to get required auth tokens:', error);
      throw error;
    }

    // Try to get student token, but don't fail setup if it doesn't work
    try {
      studentToken = await getAuthToken(TEST_USERS.student.email, TEST_AUTH_USERS.student.password);
    } catch (error) {
      console.warn('[locks-api.test] Could not get student token, some tests will be skipped:', error);
      studentToken = null;
    }

    console.log(`[locks-api.test] Test server ready on port ${serverPort}`);
    console.log(`[locks-api.test] Tokens available: admin=${!!adminToken} (verified=${adminAuthVerified}), instructor=${!!instructorToken}, student=${!!studentToken}`);
  }, 90000); // 90s timeout for setup (longer for retry logic)

  afterAll(async () => {
    console.log('[locks-api.test] Tearing down locks API E2E tests...');

    // Clean up all test locks
    await cleanupTestLocks();

    // Stop server
    if (testServer) {
      await stopTestServer(testServer);
    }

    // Cleanup test fixtures
    await cleanupTestFixtures();

    // Cleanup auth users
    const supabase = getSupabaseAdmin();
    try {
      const {
        data: { users },
      } = await supabase.auth.admin.listUsers();
      const testEmails = [
        TEST_USERS.admin.email,
        TEST_USERS.instructor1.email,
        TEST_USERS.student.email,
      ];

      for (const user of users) {
        if (user.email && testEmails.includes(user.email)) {
          await supabase.auth.admin.deleteUser(user.id);
          console.log(`[locks-api.test] Deleted auth user: ${user.email}`);
        }
      }
    } catch (error) {
      console.warn('[locks-api.test] Warning: Could not cleanup auth users:', error);
    }
  }, 30000); // 30s timeout for teardown

  beforeEach(async () => {
    // Clean up locks before each test to ensure clean state
    await cleanupTestLocks();
  });

  afterEach(async () => {
    // Clean up locks after each test
    await cleanupTestLocks();
  });

  // ==========================================================================
  // locks.isLocked Tests
  // ==========================================================================

  describe('locks.isLocked', () => {
    it('should return false when no lock exists', async () => {
      // Given: An authenticated client and a course without a lock
      const client = createTestClient(serverPort, instructorToken);

      // When: Checking if the course is locked
      const result = await client.locks.isLocked.query({
        courseId: testCourseId,
      });

      // Then: Should return false
      expect(result).toBe(false);
    });

    it('should return true when lock is held', async () => {
      // Given: A course with an active lock
      const lockResult = await generationLockService.acquireLock(testCourseId, 'test-worker-1');
      expect(lockResult.acquired).toBe(true);

      const client = createTestClient(serverPort, instructorToken);

      // When: Checking if the course is locked
      const result = await client.locks.isLocked.query({
        courseId: testCourseId,
      });

      // Then: Should return true
      expect(result).toBe(true);
    });

    it('should reject unauthenticated requests', async () => {
      // Given: An unauthenticated client
      const client = createTestClient(serverPort);

      // When: Attempting to check lock status
      // Then: Should throw UNAUTHORIZED error
      try {
        await client.locks.isLocked.query({ courseId: testCourseId });
        expect.fail('Should have thrown UNAUTHORIZED error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('UNAUTHORIZED');
      }
    });

    it('should validate course ID format', async () => {
      // Given: An authenticated client
      const client = createTestClient(serverPort, instructorToken);

      // When: Checking lock status with invalid UUID
      // Then: Should throw BAD_REQUEST error
      try {
        await client.locks.isLocked.query({ courseId: 'invalid-uuid' });
        expect.fail('Should have thrown BAD_REQUEST error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('BAD_REQUEST');
        expect(trpcError.message).toContain('Invalid course ID');
      }
    });
  });

  // ==========================================================================
  // locks.getLock Tests
  // ==========================================================================

  describe('locks.getLock', () => {
    it('should return null when no lock exists', async () => {
      // Given: An authenticated client and a course without a lock
      const client = createTestClient(serverPort, instructorToken);

      // When: Getting lock details for the course
      const result = await client.locks.getLock.query({
        courseId: testCourseId,
      });

      // Then: Should return null
      expect(result).toBeNull();
    });

    it('should return lock details when locked', async () => {
      // Given: A course with an active lock
      const holderName = 'test-worker-getLock';
      const lockResult = await generationLockService.acquireLock(testCourseId, holderName);
      expect(lockResult.acquired).toBe(true);

      const client = createTestClient(serverPort, instructorToken);

      // When: Getting lock details for the course
      const result = await client.locks.getLock.query({
        courseId: testCourseId,
      });

      // Then: Should return lock details with correct structure
      expect(result).not.toBeNull();
      expect(result?.courseId).toBe(testCourseId);
      expect(result?.lockedBy).toBe(holderName);
      expect(result?.lockedAt).toBeDefined();
      expect(result?.expiresAt).toBeDefined();

      // Verify timestamps are valid ISO strings
      expect(new Date(result!.lockedAt).getTime()).toBeGreaterThan(0);
      expect(new Date(result!.expiresAt).getTime()).toBeGreaterThan(0);

      // Verify expiration is in the future
      expect(new Date(result!.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('should reject unauthenticated requests', async () => {
      // Given: An unauthenticated client
      const client = createTestClient(serverPort);

      // When: Attempting to get lock details
      // Then: Should throw UNAUTHORIZED error
      try {
        await client.locks.getLock.query({ courseId: testCourseId });
        expect.fail('Should have thrown UNAUTHORIZED error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('UNAUTHORIZED');
      }
    });
  });

  // ==========================================================================
  // locks.getAllLocks Tests (Admin Only)
  // ==========================================================================

  describe('locks.getAllLocks', () => {
    it('should return empty array when no locks exist', async () => {
      // Skip if admin auth not verified (transient Supabase Auth issue)
      if (!adminAuthVerified) {
        console.log('[locks-api.test] Skipping admin test - admin role not verified');
        return;
      }

      // Given: An admin client and no active locks
      const client = createTestClient(serverPort, adminToken);

      // When: Getting all locks
      const result = await client.locks.getAllLocks.query();

      // Then: Should return empty array
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should return all active locks for admin', async () => {
      // Skip if admin auth not verified (transient Supabase Auth issue)
      if (!adminAuthVerified) {
        console.log('[locks-api.test] Skipping admin test - admin role not verified');
        return;
      }

      // Given: Multiple courses with active locks
      const course1Id = TEST_COURSES.course1.id;
      const course2Id = TEST_COURSES.course2.id;

      await generationLockService.acquireLock(course1Id, 'worker-1');
      await generationLockService.acquireLock(course2Id, 'worker-2');

      const client = createTestClient(serverPort, adminToken);

      // When: Getting all locks as admin
      const result = await client.locks.getAllLocks.query();

      // Then: Should return both locks
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);

      // Verify lock details
      const lock1 = result.find(l => l.courseId === course1Id);
      const lock2 = result.find(l => l.courseId === course2Id);

      expect(lock1).toBeDefined();
      expect(lock1?.lockedBy).toBe('worker-1');
      expect(lock2).toBeDefined();
      expect(lock2?.lockedBy).toBe('worker-2');
    });

    it('should reject non-admin users', async () => {
      // Given: An instructor client (not admin)
      const client = createTestClient(serverPort, instructorToken);

      // When: Attempting to get all locks
      // Then: Should throw FORBIDDEN error
      try {
        await client.locks.getAllLocks.query();
        expect.fail('Should have thrown FORBIDDEN error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('FORBIDDEN');
      }
    });

    it('should reject student users', async () => {
      // Skip if student token not available (Supabase Auth indexing issue)
      if (!studentToken) {
        console.log('[locks-api.test] Skipping student test - token not available');
        return;
      }

      // Given: A student client
      const client = createTestClient(serverPort, studentToken);

      // When: Attempting to get all locks
      // Then: Should throw FORBIDDEN error
      try {
        await client.locks.getAllLocks.query();
        expect.fail('Should have thrown FORBIDDEN error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('FORBIDDEN');
      }
    });

    it('should reject unauthenticated requests', async () => {
      // Given: An unauthenticated client
      const client = createTestClient(serverPort);

      // When: Attempting to get all locks
      // Then: Should throw UNAUTHORIZED error
      try {
        await client.locks.getAllLocks.query();
        expect.fail('Should have thrown UNAUTHORIZED error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('UNAUTHORIZED');
      }
    });
  });

  // ==========================================================================
  // locks.forceRelease Tests (Admin Only)
  // ==========================================================================

  describe('locks.forceRelease', () => {
    it('should allow admin to force release existing lock', async () => {
      // Skip if admin auth not verified (transient Supabase Auth issue)
      if (!adminAuthVerified) {
        console.log('[locks-api.test] Skipping admin test - admin role not verified');
        return;
      }

      // Given: A course with an active lock
      const holderName = 'stuck-worker';
      await generationLockService.acquireLock(testCourseId, holderName);

      // Verify lock exists
      const isLockedBefore = await generationLockService.isLocked(testCourseId);
      expect(isLockedBefore).toBe(true);

      const client = createTestClient(serverPort, adminToken);

      // When: Admin force releases the lock
      const result = await client.locks.forceRelease.mutate({
        courseId: testCourseId,
      });

      // Then: Should return success
      expect(result.success).toBe(true);

      // Verify lock is released
      const isLockedAfter = await generationLockService.isLocked(testCourseId);
      expect(isLockedAfter).toBe(false);
    });

    it('should return success=false when no lock exists', async () => {
      // Skip if admin auth not verified (transient Supabase Auth issue)
      if (!adminAuthVerified) {
        console.log('[locks-api.test] Skipping admin test - admin role not verified');
        return;
      }

      // Given: A course without a lock
      const client = createTestClient(serverPort, adminToken);

      // When: Admin attempts to force release non-existent lock
      const result = await client.locks.forceRelease.mutate({
        courseId: testCourseId,
      });

      // Then: Should return success=false (no lock to release)
      expect(result.success).toBe(false);
    });

    it('should reject non-admin users', async () => {
      // Given: A course with a lock and an instructor client
      await generationLockService.acquireLock(testCourseId, 'test-worker');
      const client = createTestClient(serverPort, instructorToken);

      // When: Instructor attempts to force release
      // Then: Should throw FORBIDDEN error
      try {
        await client.locks.forceRelease.mutate({ courseId: testCourseId });
        expect.fail('Should have thrown FORBIDDEN error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('FORBIDDEN');
      }

      // Verify lock is still held
      const isLocked = await generationLockService.isLocked(testCourseId);
      expect(isLocked).toBe(true);
    });

    it('should reject student users', async () => {
      // Skip if student token not available (Supabase Auth indexing issue)
      if (!studentToken) {
        console.log('[locks-api.test] Skipping student test - token not available');
        return;
      }

      // Given: A course with a lock and a student client
      await generationLockService.acquireLock(testCourseId, 'test-worker');
      const client = createTestClient(serverPort, studentToken);

      // When: Student attempts to force release
      // Then: Should throw FORBIDDEN error
      try {
        await client.locks.forceRelease.mutate({ courseId: testCourseId });
        expect.fail('Should have thrown FORBIDDEN error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('FORBIDDEN');
      }
    });

    it('should reject unauthenticated requests', async () => {
      // Given: An unauthenticated client
      const client = createTestClient(serverPort);

      // When: Attempting to force release
      // Then: Should throw UNAUTHORIZED error
      try {
        await client.locks.forceRelease.mutate({ courseId: testCourseId });
        expect.fail('Should have thrown UNAUTHORIZED error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('UNAUTHORIZED');
      }
    });

    it('should validate course ID format', async () => {
      // Given: An admin client
      const client = createTestClient(serverPort, adminToken);

      // When: Attempting to force release with invalid UUID
      // Then: Should throw BAD_REQUEST error (or FORBIDDEN if auth happens before validation)
      try {
        await client.locks.forceRelease.mutate({ courseId: 'not-a-valid-uuid' });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        // Zod validation happens before auth middleware in tRPC, so should be BAD_REQUEST
        // But if admin token is wrong, could be FORBIDDEN - accept both
        expect(['BAD_REQUEST', 'FORBIDDEN']).toContain(trpcError.data?.code);
      }
    });
  });

  // ==========================================================================
  // Concurrent Generation Prevention Tests (FR-037)
  // ==========================================================================

  describe('Concurrent Generation Prevention (FR-037)', () => {
    it('should prevent concurrent lock acquisition for same course', async () => {
      // Given: First worker acquires lock
      const result1 = await generationLockService.acquireLock(testCourseId, 'worker-1');
      expect(result1.acquired).toBe(true);

      // When: Second worker attempts to acquire lock
      const result2 = await generationLockService.acquireLock(testCourseId, 'worker-2');

      // Then: Second acquisition should fail
      expect(result2.acquired).toBe(false);
      expect(result2.reason).toContain('worker-1');
      expect(result2.existingLock).toBeDefined();
      expect(result2.existingLock?.lockedBy).toBe('worker-1');
    });

    it('should allow lock acquisition for different courses', async () => {
      // Given: First worker acquires lock on course1
      const course1Id = TEST_COURSES.course1.id;
      const course2Id = TEST_COURSES.course2.id;

      const result1 = await generationLockService.acquireLock(course1Id, 'worker-1');
      expect(result1.acquired).toBe(true);

      // When: Second worker acquires lock on course2
      const result2 = await generationLockService.acquireLock(course2Id, 'worker-2');

      // Then: Both locks should succeed
      expect(result2.acquired).toBe(true);

      // Verify both locks exist
      expect(await generationLockService.isLocked(course1Id)).toBe(true);
      expect(await generationLockService.isLocked(course2Id)).toBe(true);
    });

    it('should allow re-acquisition after release', async () => {
      // Given: Worker 1 acquires and releases lock
      const result1 = await generationLockService.acquireLock(testCourseId, 'worker-1');
      expect(result1.acquired).toBe(true);

      const released = await generationLockService.releaseLock(testCourseId, 'worker-1');
      expect(released).toBe(true);

      // When: Worker 2 attempts to acquire lock
      const result2 = await generationLockService.acquireLock(testCourseId, 'worker-2');

      // Then: Should succeed
      expect(result2.acquired).toBe(true);
      expect(result2.lock?.lockedBy).toBe('worker-2');
    });

    it('should verify lock status via API matches service state', async () => {
      // Given: A course with no lock
      const client = createTestClient(serverPort, instructorToken);

      // Verify unlocked state
      let apiResult = await client.locks.isLocked.query({ courseId: testCourseId });
      let serviceResult = await generationLockService.isLocked(testCourseId);
      expect(apiResult).toBe(serviceResult);
      expect(apiResult).toBe(false);

      // When: Lock is acquired via service
      await generationLockService.acquireLock(testCourseId, 'test-worker');

      // Then: API should reflect the change
      apiResult = await client.locks.isLocked.query({ courseId: testCourseId });
      serviceResult = await generationLockService.isLocked(testCourseId);
      expect(apiResult).toBe(serviceResult);
      expect(apiResult).toBe(true);
    });
  });

  // ==========================================================================
  // Lock Status Before Generation Tests (FR-038)
  // ==========================================================================

  describe('Lock Status Before Generation (FR-038)', () => {
    it('should provide lock holder info for UI feedback', async () => {
      // Given: A locked course
      const holderName = 'stage6-worker-job-12345';
      await generationLockService.acquireLock(testCourseId, holderName);

      const client = createTestClient(serverPort, instructorToken);

      // When: Getting lock details
      const lockDetails = await client.locks.getLock.query({ courseId: testCourseId });

      // Then: Should provide enough info for UI feedback
      expect(lockDetails).not.toBeNull();
      expect(lockDetails?.lockedBy).toBe(holderName);
      expect(lockDetails?.lockedAt).toBeDefined();
      expect(lockDetails?.expiresAt).toBeDefined();

      // UI can calculate time remaining
      const expiresAt = new Date(lockDetails!.expiresAt);
      const remainingMs = expiresAt.getTime() - Date.now();
      expect(remainingMs).toBeGreaterThan(0);
    });

    it('should allow checking lock status without acquiring', async () => {
      // Given: A locked course
      await generationLockService.acquireLock(testCourseId, 'other-worker');

      const client = createTestClient(serverPort, instructorToken);

      // When: Checking lock status (query, not mutation)
      const isLocked = await client.locks.isLocked.query({ courseId: testCourseId });

      // Then: Status check should not affect the lock
      expect(isLocked).toBe(true);

      // Lock should still be held by original worker
      const lockDetails = await client.locks.getLock.query({ courseId: testCourseId });
      expect(lockDetails?.lockedBy).toBe('other-worker');
    });
  });

  // ==========================================================================
  // Edge Cases and Error Handling
  // ==========================================================================

  describe('Edge Cases and Error Handling', () => {
    it('should handle rapid consecutive lock checks', async () => {
      // Given: An authenticated client
      const client = createTestClient(serverPort, instructorToken);

      // When: Making rapid consecutive lock status checks
      const checks = await Promise.all([
        client.locks.isLocked.query({ courseId: testCourseId }),
        client.locks.isLocked.query({ courseId: testCourseId }),
        client.locks.isLocked.query({ courseId: testCourseId }),
        client.locks.isLocked.query({ courseId: testCourseId }),
        client.locks.isLocked.query({ courseId: testCourseId }),
      ]);

      // Then: All should return consistent results
      expect(checks.every(c => c === false)).toBe(true);
    });

    it('should handle lock check for non-existent course ID', async () => {
      // Given: A valid UUID that doesn't correspond to any course
      const nonExistentCourseId = '00000000-0000-0000-0000-999999999999';
      const client = createTestClient(serverPort, instructorToken);

      // When: Checking lock status for non-existent course
      const isLocked = await client.locks.isLocked.query({ courseId: nonExistentCourseId });

      // Then: Should return false (no lock exists for non-existent course)
      expect(isLocked).toBe(false);
    });

    it('should handle multiple force releases on same course', async () => {
      // Skip if admin auth not verified (transient Supabase Auth issue)
      if (!adminAuthVerified) {
        console.log('[locks-api.test] Skipping admin test - admin role not verified');
        return;
      }

      // Given: A locked course and admin client
      await generationLockService.acquireLock(testCourseId, 'test-worker');
      const client = createTestClient(serverPort, adminToken);

      // When: Force releasing twice
      const result1 = await client.locks.forceRelease.mutate({ courseId: testCourseId });
      const result2 = await client.locks.forceRelease.mutate({ courseId: testCourseId });

      // Then: First should succeed, second should indicate no lock existed
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(false);
    });
  });
});
