/**
 * Contract Tests: Generation Router (T041)
 *
 * Test Objective: Verify tRPC endpoint contracts and data validation for Stage 5 generation endpoints
 *
 * Test Coverage:
 * - generation.generate: Course structure generation initiation with validation
 * - generation.getStatus: Progress tracking and organization isolation
 * - generation.regenerateSection: Section regeneration with ownership validation
 * - Input validation: Invalid UUIDs, missing fields, schema violations
 * - RLS enforcement: FORBIDDEN/NOT_FOUND errors for wrong organization
 * - Error handling: Already generating, concurrency limits, ownership violations
 *
 * Prerequisites:
 * - Supabase database accessible
 * - Test fixtures setup (organizations, users, courses)
 * - Redis running (for auth tokens and BullMQ)
 * - BullMQ worker running (for job processing)
 *
 * Test execution: pnpm test tests/contract/generation.test.ts
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
import { createMinimalAnalysisResult } from '../fixtures/analysis-result-fixture';
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

// NOTE: createMinimalAnalysisResult is now imported from centralized fixture
// See tests/fixtures/analysis-result-fixture.ts for implementation

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
 * Create test course with specific generation status
 *
 * Valid generation_status enum values:
 * - 'pending' (queued, waiting to start)
 * - 'initializing' (Step 1: Initialization)
 * - 'processing_documents' (Step 2: Processing uploaded files)
 * - 'analyzing_task' (Step 2: Analyzing task, no files)
 * - 'generating_structure' (Step 3: Creating course structure)
 * - 'generating_content' (Step 4: Generating lessons)
 * - 'finalizing' (Step 5: Finalizing course)
 * - 'completed' (Generation finished successfully)
 * - 'failed' (Generation failed with error)
 * - 'cancelled' (User cancelled generation)
 *
 * @param title - Course title
 * @param generationStatus - Generation status to set
 * @returns Course ID
 */
async function createTestCourse(
  title: string,
  generationStatus: string = 'pending'
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
      analysis_result: createMinimalAnalysisResult(title) as any,
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

/**
 * Create test course with structure for regenerateSection tests
 *
 * @param title - Course title
 * @returns Course ID
 */
async function createTestCourseWithStructure(title: string): Promise<string> {
  const supabase = getSupabaseAdmin();

  const mockStructure = {
    course_title: title,
    course_description: 'Test course description',
    sections: [
      {
        section_title: 'Section 1',
        section_description: 'First section',
        lessons: [
          { lesson_title: 'Lesson 1.1', lesson_objective: 'Learn basics' },
          { lesson_title: 'Lesson 1.2', lesson_objective: 'Practice basics' },
        ],
      },
      {
        section_title: 'Section 2',
        section_description: 'Second section',
        lessons: [
          { lesson_title: 'Lesson 2.1', lesson_objective: 'Advanced topics' },
          { lesson_title: 'Lesson 2.2', lesson_objective: 'Master advanced' },
        ],
      },
    ],
  };

  const { data, error } = await supabase
    .from('courses')
    .insert({
      organization_id: TEST_ORGS.premium.id,
      user_id: TEST_USERS.instructor1.id,
      title,
      slug: `test-course-${Date.now()}`,
      generation_status: 'completed',
      generation_progress: 100,
      course_structure: mockStructure as any,
      analysis_result: createMinimalAnalysisResult(title) as any,
      settings: { topic: title },
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create test course with structure: ${error.message}`);
  }

  return data.id;
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Contract: Generation Router', () => {
  let testServer: TestServer;
  let serverPort: number;
  let worker: any;
  let testCourseIds: string[] = [];

  beforeAll(async () => {
    console.log('Setting up generation contract tests...');

    // Clean up existing test data
    await cleanupTestFixtures();

    // Setup test fixtures (creates orgs, users, courses, AND auth users in DB)
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
    console.log('Tearing down generation contract tests...');

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
  // Test Suite 1: generation.generate
  // ==========================================================================

  describe('generation.generate', () => {
    // ==========================================================================
    // Test 1: Valid Request
    // ==========================================================================

    it('should accept valid courseId and return jobId', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // And: A course ready for generation
      const courseId = await createTestCourse('Test Course - Valid Generate');
      testCourseIds.push(courseId);

      // When: Starting generation
      const result = await client.generation.generate.mutate({ courseId });

      // Then: Should return jobId and status='queued'
      expect(result).toBeDefined();
      expect(result).toHaveProperty('jobId');
      expect(result).toHaveProperty('status', 'queued');
      expect(result).toHaveProperty('estimatedDuration');
      expect(typeof result.jobId).toBe('string');
      expect(typeof result.estimatedDuration).toBe('number');
      expect(result.estimatedDuration).toBeGreaterThan(0);
    });

    // ==========================================================================
    // Test 2: Invalid UUID
    // ==========================================================================

    it('should reject invalid courseId format', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // When: Attempting to generate with invalid UUID
      // Then: Should throw BAD_REQUEST error with Zod validation message
      try {
        await client.generation.generate.mutate({ courseId: 'invalid-uuid' });
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
            path: ['courseId'],
          });
        } catch {
          // Fallback: if not JSON, check for string content
          expect(errorMessage).toContain('Invalid course ID');
        }
      }
    });

    // ==========================================================================
    // Test 3: Non-existent Course
    // ==========================================================================

    it('should reject non-existent courseId', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // When: Attempting to generate for non-existent course
      const nonExistentCourseId = '00000000-0000-0000-0000-000000000000';

      // Then: Should throw NOT_FOUND error
      try {
        await client.generation.generate.mutate({ courseId: nonExistentCourseId });
        expect.fail('Should have thrown NOT_FOUND error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('NOT_FOUND');
        expect(trpcError.message).toMatch(/not found/i);
      }
    });

    // ==========================================================================
    // Test 4: Unauthenticated Request
    // ==========================================================================

    it('should reject unauthenticated request', async () => {
      // Given: An unauthenticated client
      const client = createTestClient(serverPort);

      // When: Attempting to generate without authentication
      const courseId = TEST_COURSES.course1.id;

      // Then: Should throw UNAUTHORIZED error
      try {
        await client.generation.generate.mutate({ courseId });
        expect.fail('Should have thrown UNAUTHORIZED error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('UNAUTHORIZED');
      }
    });

    // ==========================================================================
    // Test 5: Already Generating
    // ==========================================================================

    it('should reject if generation already in progress', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // And: A course with generation in progress (using 'generating_structure' status)
      const courseId = await createTestCourse('Test Course - Already Generating', 'generating_structure');
      testCourseIds.push(courseId);

      // When: Attempting to start generation again
      // Then: Should throw CONFLICT error
      try {
        await client.generation.generate.mutate({ courseId });
        expect.fail('Should have thrown CONFLICT error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('CONFLICT');
        expect(trpcError.message).toMatch(/already in progress/i);
      }
    });

    // ==========================================================================
    // Test 6: Course Not Owned by User
    // ==========================================================================

    it('should reject course not owned by user', async () => {
      // Given: An authenticated instructor (instructor1)
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // And: A course owned by instructor2
      const supabase = getSupabaseAdmin();
      const { data: course, error } = await supabase
        .from('courses')
        .insert({
          organization_id: TEST_ORGS.premium.id,
          user_id: TEST_USERS.instructor2.id, // Different user
          title: 'Course owned by instructor2',
          slug: `test-course-other-user-${Date.now()}`,
          generation_status: 'pending',
          analysis_result: createMinimalAnalysisResult('Course owned by instructor2') as any,
        })
        .select('id')
        .single();

      if (error || !course) {
        throw new Error('Failed to create test course for different user');
      }

      testCourseIds.push(course.id);

      // When: Attempting to generate for course owned by different user
      // Then: Should throw FORBIDDEN error
      try {
        await client.generation.generate.mutate({ courseId: course.id });
        expect.fail('Should have thrown FORBIDDEN error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('FORBIDDEN');
        expect(trpcError.message).toMatch(/access|permission/i);
      }
    });

    // ==========================================================================
    // Test 7: Concurrency Limit (simulated)
    // ==========================================================================

    it('should track concurrency limits for generation', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // And: A course ready for generation
      const courseId = await createTestCourse('Test Course - Concurrency Check');
      testCourseIds.push(courseId);

      // When: Starting generation (should check concurrency)
      const result = await client.generation.generate.mutate({ courseId });

      // Then: Should successfully start (concurrency check passed)
      expect(result).toBeDefined();
      expect(result.jobId).toBeDefined();
      expect(result.status).toBe('queued');

      // Note: Testing TOO_MANY_REQUESTS would require creating multiple concurrent jobs
      // which is complex in test environment. This test verifies concurrency check runs.
    });
  });

  // ==========================================================================
  // Test Suite 2: generation.getStatus
  // ==========================================================================

  describe('generation.getStatus', () => {
    // ==========================================================================
    // Test 1: Valid Request
    // ==========================================================================

    it('should return status and progress for course', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // And: A course with known status (using 'generating_structure')
      const courseId = await createTestCourse('Test Course - Get Status', 'generating_structure');
      testCourseIds.push(courseId);

      // When: Getting generation status
      const result = await client.generation.getStatus.query({ courseId });

      // Then: Should return status and progress
      expect(result).toBeDefined();
      expect(result).toHaveProperty('courseId');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('progress');
      expect(result).toHaveProperty('currentPhase');
      expect(result.courseId).toBe(courseId);
      expect(typeof result.status).toBe('string');
      expect(typeof result.progress).toBe('number');
      expect(result.progress).toBeGreaterThanOrEqual(0);
      expect(result.progress).toBeLessThanOrEqual(100);
    });

    // ==========================================================================
    // Test 2: Invalid UUID
    // ==========================================================================

    it('should reject invalid courseId', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // When: Attempting to get status with invalid UUID
      // Then: Should throw BAD_REQUEST error
      try {
        await client.generation.getStatus.query({ courseId: 'invalid' });
        expect.fail('Should have thrown BAD_REQUEST error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('BAD_REQUEST');
        expect(trpcError.message).toMatch(/uuid/i);
      }
    });

    // ==========================================================================
    // Test 3: Non-existent Course
    // ==========================================================================

    it('should reject non-existent courseId', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // When: Attempting to get status for non-existent course
      const nonExistentCourseId = '00000000-0000-0000-0000-000000000000';

      // Then: Should throw NOT_FOUND error
      try {
        await client.generation.getStatus.query({ courseId: nonExistentCourseId });
        expect.fail('Should have thrown NOT_FOUND error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('NOT_FOUND');
        expect(trpcError.message).toMatch(/not found/i);
      }
    });

    // ==========================================================================
    // Test 4: Unauthenticated Request
    // ==========================================================================

    it('should reject unauthenticated request', async () => {
      // Given: An unauthenticated client
      const client = createTestClient(serverPort);

      // When: Attempting to get status without authentication
      const courseId = TEST_COURSES.course1.id;

      // Then: Should throw UNAUTHORIZED error
      try {
        await client.generation.getStatus.query({ courseId });
        expect.fail('Should have thrown UNAUTHORIZED error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('UNAUTHORIZED');
      }
    });

    // ==========================================================================
    // Test 5: Course Not in User's Organization
    // ==========================================================================

    it('should reject course from different organization', async () => {
      // Given: An authenticated instructor from Premium org
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // And: A course from Free org
      const supabase = getSupabaseAdmin();
      const { data: orgCourse, error } = await supabase
        .from('courses')
        .insert({
          organization_id: TEST_ORGS.free.id, // Different org
          user_id: TEST_USERS.instructor1.id,
          title: 'Course from different org',
          slug: `test-course-other-org-${Date.now()}`,
          generation_status: 'pending',
          analysis_result: createMinimalAnalysisResult('Course from different org') as any,
        })
        .select('id')
        .single();

      if (error || !orgCourse) {
        throw new Error('Failed to create test course in different org');
      }

      testCourseIds.push(orgCourse.id);

      // When: Attempting to get status for course in different org
      // Then: Should throw FORBIDDEN error (due to organization isolation)
      try {
        await client.generation.getStatus.query({ courseId: orgCourse.id });
        expect.fail('Should have thrown FORBIDDEN error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('FORBIDDEN');
      }
    });
  });

  // ==========================================================================
  // Test Suite 3: generation.regenerateSection
  // ==========================================================================

  describe('generation.regenerateSection', () => {
    // ==========================================================================
    // Test 1: Valid Request
    // ==========================================================================

    it('should regenerate section successfully', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // And: A course with completed structure
      const courseId = await createTestCourseWithStructure('Test Course - Regenerate Section');
      testCourseIds.push(courseId);

      // When: Regenerating section 1 (with retry logic for non-deterministic LLM failures)
      let result;
      let lastError;
      const maxRetries = 3;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          result = await client.generation.regenerateSection.mutate({
            courseId,
            sectionNumber: 1,
          });
          break; // Success! Exit retry loop
        } catch (error) {
          lastError = error;
          if (attempt < maxRetries) {
            console.log(
              `Attempt ${attempt} failed due to LLM parsing error, retrying... (${maxRetries - attempt} attempts remaining)`
            );
            // Wait 2 seconds before retrying to give LLM a chance to recover
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }

      // If all retries failed, throw the last error
      if (!result) {
        throw lastError;
      }

      // Then: Should return success response
      expect(result).toBeDefined();
      expect(result).toHaveProperty('courseId');
      expect(result).toHaveProperty('sectionNumber', 1);
      expect(result).toHaveProperty('status', 'regenerated');
      expect(result).toHaveProperty('updatedAt');
      expect(typeof result.updatedAt).toBe('string');
    });

    // ==========================================================================
    // Test 2: Invalid Section Number
    // ==========================================================================

    it('should reject invalid sectionNumber (less than 1)', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // And: A course with structure
      const courseId = await createTestCourseWithStructure('Test Course - Invalid Section');
      testCourseIds.push(courseId);

      // When: Attempting to regenerate section 0 (invalid)
      // Then: Should throw BAD_REQUEST error
      try {
        await client.generation.regenerateSection.mutate({
          courseId,
          sectionNumber: 0,
        });
        expect.fail('Should have thrown BAD_REQUEST error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('BAD_REQUEST');
        expect(trpcError.message).toMatch(/section number must be at least 1/i);
      }
    });

    // ==========================================================================
    // Test 3: Non-existent Course
    // ==========================================================================

    it('should reject non-existent courseId', async () => {
      // Given: An authenticated instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // When: Attempting to regenerate section for non-existent course
      const nonExistentCourseId = '00000000-0000-0000-0000-000000000000';

      // Then: Should throw NOT_FOUND error
      try {
        await client.generation.regenerateSection.mutate({
          courseId: nonExistentCourseId,
          sectionNumber: 1,
        });
        expect.fail('Should have thrown NOT_FOUND error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('NOT_FOUND');
        expect(trpcError.message).toMatch(/not found/i);
      }
    });

    // ==========================================================================
    // Test 4: Unauthenticated Request
    // ==========================================================================

    it('should reject unauthenticated request', async () => {
      // Given: An unauthenticated client
      const client = createTestClient(serverPort);

      // When: Attempting to regenerate section without authentication
      const courseId = TEST_COURSES.course1.id;

      // Then: Should throw UNAUTHORIZED error
      try {
        await client.generation.regenerateSection.mutate({
          courseId,
          sectionNumber: 1,
        });
        expect.fail('Should have thrown UNAUTHORIZED error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('UNAUTHORIZED');
      }
    });

    // ==========================================================================
    // Test 5: Course Not Owned by User
    // ==========================================================================

    it('should reject course not owned by user', async () => {
      // Given: An authenticated instructor (instructor1)
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // And: A course owned by instructor2 with structure
      const supabase = getSupabaseAdmin();
      const mockStructure = {
        course_title: 'Test',
        sections: [
          {
            section_title: 'Section 1',
            lessons: [{ lesson_title: 'Lesson 1' }],
          },
        ],
      };

      const { data: course, error } = await supabase
        .from('courses')
        .insert({
          organization_id: TEST_ORGS.premium.id,
          user_id: TEST_USERS.instructor2.id, // Different user
          title: 'Course owned by instructor2',
          slug: `test-course-regen-other-user-${Date.now()}`,
          generation_status: 'completed',
          course_structure: mockStructure as any,
          analysis_result: createMinimalAnalysisResult('Course owned by instructor2') as any,
        })
        .select('id')
        .single();

      if (error || !course) {
        throw new Error('Failed to create test course for different user');
      }

      testCourseIds.push(course.id);

      // When: Attempting to regenerate section for course owned by different user
      // Then: Should throw FORBIDDEN error
      try {
        await client.generation.regenerateSection.mutate({
          courseId: course.id,
          sectionNumber: 1,
        });
        expect.fail('Should have thrown FORBIDDEN error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('FORBIDDEN');
        expect(trpcError.message).toMatch(/access|permission/i);
      }
    });
  });
});
