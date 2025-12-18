/**
 * Contract Tests: Analysis Router (T036)
 *
 * Test Objective: Verify tRPC endpoint contracts and data validation for Stage 4 analysis endpoints
 *
 * Test Coverage:
 * - analysis.start: Job initiation with courseId validation and forceRestart flag
 * - analysis.getStatus: Progress tracking and RLS enforcement
 * - analysis.getResult: Result retrieval and access control
 * - Input validation: Invalid UUIDs, missing fields, schema violations
 * - RLS enforcement: FORBIDDEN/NOT_FOUND errors for wrong organization
 * - Error handling: Already in progress, course not found, authorization failures
 *
 * Prerequisites:
 * - Supabase database accessible
 * - Test fixtures setup (organizations, users, courses)
 * - Redis running (for auth tokens and BullMQ)
 * - BullMQ worker running (for job processing)
 *
 * Test execution: pnpm test tests/contract/analysis.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import type { AppRouter } from '../../src/server/app-router';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import {
  setupTestFixtures,
  cleanupTestFixtures,
  cleanupTestJobs,
  TEST_USERS,
  TEST_COURSES,
  TEST_ORGS,
} from '../fixtures';
import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from '../../src/server/app-router';
import { createContext } from '../../src/server/trpc';
import type { Server } from 'http';
import cors from 'cors';
import { getWorker, stopWorker } from '../../src/orchestrator/worker';
import { closeQueue } from '../../src/orchestrator/queue';

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
 * a dynamically assigned port to avoid conflicts.
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

  // Start server on dynamic port
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        console.log(`Test tRPC server started on port ${port}`);
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
        console.log(`Test tRPC server stopped (port ${testServer.port})`);
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
 * @returns JWT access token
 */
async function getAuthToken(email: string, password: string, retries = 3): Promise<string> {
  const { createClient } = await import('@supabase/supabase-js');
  const authClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

  for (let attempt = 1; attempt <= retries; attempt++) {
    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (!error && data.session) {
      return data.session.access_token;
    }

    if (attempt < retries) {
      console.log(`Auth attempt ${attempt} failed for ${email}, retrying in 500ms...`);
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      throw new Error(
        `Failed to authenticate user ${email} after ${retries} attempts: ${error?.message || 'No session returned'}`
      );
    }
  }

  throw new Error(`Failed to authenticate user ${email}: unexpected error`);
}

/**
 * NOTE: Auth users ARE required for these tests.
 *
 * These are authenticated endpoint tests that use signInWithPassword(),
 * which requires users to exist in auth.users table.
 *
 * setupTestFixtures() now creates BOTH:
 * 1. Users in public.users table (for FK constraints, organization isolation)
 * 2. Users in auth.users table (for authentication via signInWithPassword)
 *
 * The handle_new_user() trigger normally syncs auth.users → public.users,
 * but we create public.users first to control organization_id and role.
 */

/**
 * Create test course with specific generation status
 *
 * @param title - Course title
 * @param generationStatus - Generation status to set
 * @returns Course ID
 */
async function createTestCourse(
  title: string,
  generationStatus: string = 'processing_documents'
): Promise<string> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('courses')
    .insert({
      organization_id: TEST_ORGS.premium.id,
      user_id: TEST_USERS.instructor1.id,
      title,
      slug: `test-course-${Date.now()}`,
      generation_status: generationStatus,
      generation_progress: 0,
      settings: {
        topic: title,
        answers: null,
        lesson_duration_minutes: 30,
      },
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create test course: ${error.message}`);
  }

  return data.id;
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Contract: Analysis Router', () => {
  let testServer: TestServer;
  let serverPort: number;
  let worker: any;
  let testCourseIds: string[] = [];

  beforeAll(async () => {
    console.log('Setting up analysis contract tests...');

    // Clean up existing test data
    await cleanupTestFixtures();

    // Setup test fixtures (creates orgs, users, courses, AND auth users in DB)
    // Auth users are required for authenticated endpoint tests
    await setupTestFixtures();

    // Start tRPC server
    testServer = await startTestServer();
    serverPort = testServer.port;

    // Start BullMQ worker for job processing
    worker = getWorker(1);
    console.log('BullMQ worker started for test job processing');

    console.log(`Test server ready on port ${serverPort}`);
  }, 30000);

  beforeEach(() => {
    // Reset test course IDs for cleanup
    testCourseIds = [];
  });

  afterEach(async () => {
    // Clean up test jobs after each test
    await cleanupTestJobs();

    // Clean up test courses created during test
    if (testCourseIds.length > 0) {
      const supabase = getSupabaseAdmin();
      await supabase.from('courses').delete().in('id', testCourseIds);
    }
  });

  afterAll(async () => {
    console.log('Tearing down analysis contract tests...');

    // Stop worker BEFORE server
    if (worker) {
      console.log('Stopping BullMQ worker...');
      await stopWorker(false);
      await closeQueue();
    }

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
        TEST_USERS.instructor1.email,
        TEST_USERS.instructor2.email,
        TEST_USERS.student.email,
      ];

      for (const user of users) {
        if (user.email && testEmails.includes(user.email)) {
          await supabase.auth.admin.deleteUser(user.id);
          console.log(`Deleted auth user: ${user.email}`);
        }
      }
    } catch (error) {
      console.warn('Warning: Could not cleanup auth users:', error);
    }
  }, 15000);

  // ==========================================================================
  // Test 1: analysis.start - Valid Request
  // ==========================================================================

  describe('analysis.start', () => {
    it('should accept valid courseId and return jobId', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // And: A course ready for analysis
      const courseId = await createTestCourse('Test Course - Valid Start');
      testCourseIds.push(courseId);

      // When: Starting analysis
      const result = await client.analysis.start.mutate({
        courseId,
        forceRestart: false,
      });

      // Then: Should return jobId and status
      expect(result).toBeDefined();
      expect(result).toHaveProperty('jobId');
      expect(result).toHaveProperty('status', 'started');
      expect(typeof result.jobId).toBe('string');
      expect(result.jobId.length).toBeGreaterThan(0);
    });

    it('should accept forceRestart flag', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // And: A course with analysis in progress
      const courseId = await createTestCourse('Test Course - Force Restart', 'analyzing_task');
      testCourseIds.push(courseId);

      // When: Starting analysis with forceRestart=true
      const result = await client.analysis.start.mutate({
        courseId,
        forceRestart: true,
      });

      // Then: Should restart analysis successfully
      expect(result).toBeDefined();
      expect(result.jobId).toBeDefined();
      expect(result.status).toBe('started');
    });

    // ==========================================================================
    // Test 2: analysis.start - Invalid UUID
    // ==========================================================================

    it('should reject invalid courseId format', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // When: Attempting to start analysis with invalid UUID
      // Then: Should throw BAD_REQUEST error with Zod validation message
      try {
        await client.analysis.start.mutate({ courseId: 'invalid-uuid' });
        expect.fail('Should have thrown BAD_REQUEST error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('BAD_REQUEST');

        // Zod returns structured error as JSON array - validate it properly
        const errorMessage = trpcError.message;
        try {
          const zodErrors = JSON.parse(errorMessage);
          expect(Array.isArray(zodErrors)).toBe(true);
          expect(zodErrors[0]).toMatchObject({
            code: 'invalid_string',
            validation: 'uuid',
            message: 'Invalid course ID',
            path: ['courseId']
          });
        } catch {
          // Fallback: if not JSON, check for string content
          expect(errorMessage).toContain('Invalid course ID');
        }
      }
    });

    // ==========================================================================
    // Test 3: analysis.start - Non-existent Course
    // ==========================================================================

    it('should reject non-existent courseId', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // When: Attempting to start analysis for non-existent course
      const nonExistentCourseId = '00000000-0000-0000-0000-000000000000';

      // Then: Should throw NOT_FOUND error
      try {
        await client.analysis.start.mutate({ courseId: nonExistentCourseId });
        expect.fail('Should have thrown NOT_FOUND error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('NOT_FOUND');
        expect(trpcError.message).toMatch(/not found|access denied/i);
      }
    });

    // ==========================================================================
    // Test 4: analysis.start - Already In Progress
    // ==========================================================================

    it('should reject if analysis already in progress without forceRestart', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // And: A course ready for analysis
      const courseId = await createTestCourse('Test Course - Already In Progress');
      testCourseIds.push(courseId);

      // When: Starting first analysis
      await client.analysis.start.mutate({ courseId, forceRestart: false });

      // And: Attempting to start again without forceRestart
      // Then: Should throw BAD_REQUEST error
      try {
        await client.analysis.start.mutate({ courseId, forceRestart: false });
        expect.fail('Should have thrown BAD_REQUEST error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('BAD_REQUEST');
        expect(trpcError.message).toMatch(/already in progress/i);
      }
    });

    // ==========================================================================
    // Test 5: analysis.start - Unauthenticated Request
    // ==========================================================================

    it('should reject unauthenticated request', async () => {
      // Given: An unauthenticated client
      const client = createTestClient(serverPort);

      // When: Attempting to start analysis without authentication
      const courseId = TEST_COURSES.course1.id;

      // Then: Should throw UNAUTHORIZED error
      try {
        await client.analysis.start.mutate({ courseId });
        expect.fail('Should have thrown UNAUTHORIZED error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('UNAUTHORIZED');
      }
    });

    // ==========================================================================
    // Test 6: analysis.start - Wrong Organization
    // ==========================================================================

    it('should reject access to course from different organization', async () => {
      // Given: An authenticated instructor from Org 1
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // And: A course from Org 2 (Free org)
      // First, create a user in the free org using admin client (bypasses RLS)
      const supabase = getSupabaseAdmin();
      const freeOrgUserId = '00000000-0000-0000-0000-000000000099';
      const { error: userError } = await supabase.from('users').upsert(
        {
          id: freeOrgUserId,
          email: 'free-org-instructor@test.com',
          organization_id: TEST_ORGS.free.id,
          role: 'instructor',
        },
        { onConflict: 'id' }
      );

      if (userError) {
        throw new Error(`Failed to create test user in free org: ${userError.message}`);
      }

      // Now create the course in the free org with the free org user
      const { data: orgCourse, error } = await supabase
        .from('courses')
        .insert({
          organization_id: TEST_ORGS.free.id,
          user_id: freeOrgUserId, // User from free org
          title: 'Course from different org',
          slug: `test-course-other-org-${Date.now()}`,
          generation_status: 'processing_documents',
        })
        .select('id')
        .single();

      if (error || !orgCourse) {
        throw new Error(`Failed to create test course in different org: ${error?.message}`);
      }

      testCourseIds.push(orgCourse.id);

      // When: Attempting to start analysis for course in different org
      // Then: Should throw NOT_FOUND (due to RLS enforcement)
      try {
        await client.analysis.start.mutate({ courseId: orgCourse.id });
        expect.fail('Should have thrown NOT_FOUND error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('NOT_FOUND');
      }
    });
  });

  // ==========================================================================
  // Test 7: analysis.getStatus - Basic Functionality
  // ==========================================================================

  describe('analysis.getStatus', () => {
    it('should return status and progress for course', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // And: A course with known status
      const courseId = await createTestCourse('Test Course - Get Status', 'analyzing_task');
      testCourseIds.push(courseId);

      // Update progress
      const supabase = getSupabaseAdmin();
      await supabase
        .from('courses')
        .update({ generation_progress: 50 })
        .eq('id', courseId);

      // When: Getting analysis status
      const result = await client.analysis.getStatus.query({ courseId });

      // Then: Should return status and progress
      expect(result).toBeDefined();
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('progress');
      expect(typeof result.status).toBe('string');
      expect(typeof result.progress).toBe('number');
      expect(result.status).toBe('analyzing_task');
      expect(result.progress).toBe(50);
    });

    it('should validate progress is between 0 and 100', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // And: A course
      const courseId = await createTestCourse('Test Course - Progress Validation');
      testCourseIds.push(courseId);

      // When: Getting status
      const result = await client.analysis.getStatus.query({ courseId });

      // Then: Progress should be within valid range
      expect(result.progress).toBeGreaterThanOrEqual(0);
      expect(result.progress).toBeLessThanOrEqual(100);
    });

    // ==========================================================================
    // Test 8: analysis.getStatus - Invalid UUID
    // ==========================================================================

    it('should reject invalid courseId', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // When: Attempting to get status with invalid UUID
      // Then: Should throw BAD_REQUEST error
      try {
        await client.analysis.getStatus.query({ courseId: 'invalid' });
        expect.fail('Should have thrown BAD_REQUEST error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('BAD_REQUEST');
        expect(trpcError.message).toMatch(/uuid/i);
      }
    });

    // ==========================================================================
    // Test 9: analysis.getStatus - Non-existent Course
    // ==========================================================================

    it('should reject non-existent courseId', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // When: Attempting to get status for non-existent course
      const nonExistentCourseId = '00000000-0000-0000-0000-000000000000';

      // Then: Should throw NOT_FOUND error
      try {
        await client.analysis.getStatus.query({ courseId: nonExistentCourseId });
        expect.fail('Should have thrown NOT_FOUND error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('NOT_FOUND');
        expect(trpcError.message).toMatch(/not found|access denied/i);
      }
    });

    // ==========================================================================
    // Test 10: analysis.getStatus - Unauthenticated Request
    // ==========================================================================

    it('should reject unauthenticated request', async () => {
      // Given: An unauthenticated client
      const client = createTestClient(serverPort);

      // When: Attempting to get status without authentication
      const courseId = TEST_COURSES.course1.id;

      // Then: Should throw UNAUTHORIZED error
      try {
        await client.analysis.getStatus.query({ courseId });
        expect.fail('Should have thrown UNAUTHORIZED error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('UNAUTHORIZED');
      }
    });
  });

  // ==========================================================================
  // Test 11: analysis.getResult - Basic Functionality
  // ==========================================================================

  describe('analysis.getResult', () => {
    it('should return null if analysis not complete', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // And: A course without completed analysis
      const courseId = await createTestCourse('Test Course - No Result', 'analyzing_task');
      testCourseIds.push(courseId);

      // When: Getting analysis result
      const result = await client.analysis.getResult.query({ courseId });

      // Then: Should return null analysisResult
      expect(result).toBeDefined();
      expect(result).toHaveProperty('analysisResult');
      expect(result.analysisResult).toBeNull();
    });

    it('should return analysis result if complete', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // And: A course with completed analysis
      const courseId = await createTestCourse('Test Course - With Result', 'completed');
      testCourseIds.push(courseId);

      // Add analysis result to course
      const mockAnalysisResult = {
        recommended_structure: {
          num_modules: 3,
          num_lessons_per_module: 5,
          estimated_duration_hours: 15,
        },
        topics: ['Topic 1', 'Topic 2', 'Topic 3'],
        complexity_score: 0.7,
      };

      const supabase = getSupabaseAdmin();
      await supabase
        .from('courses')
        .update({ analysis_result: mockAnalysisResult } as any)
        .eq('id', courseId);

      // When: Getting analysis result
      const result = await client.analysis.getResult.query({ courseId });

      // Then: Should return the analysis result
      expect(result).toBeDefined();
      expect(result.analysisResult).toBeDefined();
      expect(result.analysisResult).toMatchObject(mockAnalysisResult);
    });

    // ==========================================================================
    // Test 12: analysis.getResult - Invalid UUID
    // ==========================================================================

    it('should reject invalid courseId', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // When: Attempting to get result with invalid UUID
      // Then: Should throw BAD_REQUEST error
      try {
        await client.analysis.getResult.query({ courseId: 'not-a-uuid' });
        expect.fail('Should have thrown BAD_REQUEST error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('BAD_REQUEST');
        expect(trpcError.message).toMatch(/uuid/i);
      }
    });

    // ==========================================================================
    // Test 13: analysis.getResult - Non-existent Course
    // ==========================================================================

    it('should reject non-existent courseId', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // When: Attempting to get result for non-existent course
      const nonExistentCourseId = '00000000-0000-0000-0000-000000000000';

      // Then: Should throw NOT_FOUND error
      try {
        await client.analysis.getResult.query({ courseId: nonExistentCourseId });
        expect.fail('Should have thrown NOT_FOUND error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('NOT_FOUND');
        expect(trpcError.message).toMatch(/not found|access denied/i);
      }
    });

    // ==========================================================================
    // Test 14: analysis.getResult - Unauthenticated Request
    // ==========================================================================

    it('should reject unauthenticated request', async () => {
      // Given: An unauthenticated client
      const client = createTestClient(serverPort);

      // When: Attempting to get result without authentication
      const courseId = TEST_COURSES.course1.id;

      // Then: Should throw UNAUTHORIZED error
      try {
        await client.analysis.getResult.query({ courseId });
        expect.fail('Should have thrown UNAUTHORIZED error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('UNAUTHORIZED');
      }
    });

    // ==========================================================================
    // Test 15: analysis.getResult - RLS Enforcement
    // ==========================================================================

    it('should enforce organization isolation via RLS', async () => {
      // Given: An authenticated instructor from Org 1
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // And: A course from Org 2 (Free org)
      // First, create a user in the free org using admin client (bypasses RLS)
      const supabase = getSupabaseAdmin();
      const freeOrgUserId = '00000000-0000-0000-0000-000000000098';
      const { error: userError } = await supabase.from('users').upsert(
        {
          id: freeOrgUserId,
          email: 'free-org-instructor2@test.com',
          organization_id: TEST_ORGS.free.id,
          role: 'instructor',
        },
        { onConflict: 'id' }
      );

      if (userError) {
        throw new Error(`Failed to create test user in free org: ${userError.message}`);
      }

      // Now create the course in the free org with the free org user
      const { data: orgCourse, error } = await supabase
        .from('courses')
        .insert({
          organization_id: TEST_ORGS.free.id,
          user_id: freeOrgUserId, // User from free org
          title: 'Course from different org for getResult',
          slug: `test-course-result-other-org-${Date.now()}`,
          generation_status: 'completed',
          analysis_result: { test: 'data' } as any,
        })
        .select('id')
        .single();

      if (error || !orgCourse) {
        throw new Error(`Failed to create test course in different org: ${error?.message}`);
      }

      testCourseIds.push(orgCourse.id);

      // When: Attempting to get result for course in different org
      // Then: Should throw NOT_FOUND (due to RLS enforcement)
      try {
        await client.analysis.getResult.query({ courseId: orgCourse.id });
        expect.fail('Should have thrown NOT_FOUND error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('NOT_FOUND');
      }
    });
  });

  // ==========================================================================
  // Test 16: Schema Validation - Missing Required Fields
  // ==========================================================================

  describe('Schema Validation', () => {
    it('should reject missing courseId in start endpoint', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // When: Attempting to start analysis without courseId
      // Then: Should throw BAD_REQUEST error (Zod validation)
      try {
        await client.analysis.start.mutate({} as any);
        expect.fail('Should have thrown BAD_REQUEST error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('BAD_REQUEST');
      }
    });

    it('should use default value for forceRestart if not provided', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // And: A course ready for analysis
      const courseId = await createTestCourse('Test Course - Default ForceRestart');
      testCourseIds.push(courseId);

      // When: Starting analysis without forceRestart flag
      const result = await client.analysis.start.mutate({ courseId });

      // Then: Should succeed with default forceRestart=false
      expect(result).toBeDefined();
      expect(result.jobId).toBeDefined();
      expect(result.status).toBe('started');
    });
  });
});
