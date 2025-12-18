/**
 * tRPC Server - Acceptance Tests
 * @module tests/integration/trpc-server
 *
 * Comprehensive acceptance tests for the Type-Safe API Layer (User Story 3).
 * These tests verify tRPC server functionality including authentication,
 * authorization, type safety, and multi-client scenarios.
 *
 * Test Coverage:
 * 1. Server starts successfully and accepts connections
 * 2. Test procedure returns type-safe response
 * 3. Unauthenticated request to protected endpoint returns 401
 * 4. Valid JWT token extracts user context correctly
 * 5. Student role attempting to create course returns 403
 * 6. Instructor role creates course successfully
 * 7. Multiple external clients authenticate with same Supabase project
 *
 * Prerequisites:
 * - Supabase project configured with test users
 * - Database migrations applied (organizations, users, courses, job_status)
 * - Test fixtures available (TEST_ORGS, TEST_USERS, TEST_COURSES)
 * - Redis running for BullMQ queue
 *
 * Test execution: pnpm test tests/integration/trpc-server.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import type { AppRouter } from '../../src/server/app-router';
import {
  setupTestFixtures,
  cleanupTestFixtures,
  cleanupTestJobs,
  TEST_USERS,
  TEST_COURSES,
} from '../fixtures';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
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
 * a dynamically assigned port. This ensures tests don't conflict with
 * running development servers.
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
 * Uses the Supabase admin client to authenticate a user and retrieve
 * their JWT access token for use in tRPC requests.
 *
 * IMPORTANT: This requires test users to exist in Supabase Auth with
 * password authentication enabled.
 *
 * @param email - User email
 * @param password - User password
 * @returns JWT access token
 * @throws Error if authentication fails
 */
async function getAuthToken(email: string, password: string, retries = 3): Promise<string> {
  const supabase = getSupabaseAdmin();

  // For admin client, we need to use a regular client instance for sign-in
  // Create a temporary client with anon key for authentication
  const { createClient } = await import('@supabase/supabase-js');
  const authClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

  // Retry logic to handle transient Supabase Auth failures in CI
  for (let attempt = 1; attempt <= retries; attempt++) {
    // Sign in with password using the auth client
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
      // Final attempt failed - get diagnostic info
      const {
        data: { users },
      } = await supabase.auth.admin.listUsers();
      const user = users.find(u => u.email === email);

      throw new Error(
        `Failed to authenticate user ${email} after ${retries} attempts: ${
          error?.message || 'No session returned'
        }. User exists: ${!!user}, User ID: ${user?.id}`
      );
    }
  }

  throw new Error(`Failed to authenticate user ${email}: unexpected error`);
}

/**
 * Create test user in Supabase Auth with password
 *
 * For tests to work, we need to create users in Supabase Auth (not just the users table).
 * This function creates an auth user with a specific ID that matches the test fixture.
 *
 * @param email - User email
 * @param password - User password
 * @param userId - User ID from users table (must match)
 */
async function createAuthUser(email: string, password: string, userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Check if auth user already exists by email
  const {
    data: { users: existingUsers },
  } = await supabase.auth.admin.listUsers();
  const existingUser = existingUsers.find(u => u.email === email);

  // Always delete existing user to ensure fresh credentials
  if (existingUser) {
    console.log(`Deleting existing auth user for ${email} to ensure fresh credentials`);
    await supabase.auth.admin.deleteUser(existingUser.id);
  }

  // Create auth user with specific ID (Supabase admin API allows this)
  const { data, error } = await supabase.auth.admin.createUser({
    id: userId, // Use the fixture user ID
    email,
    password,
    email_confirm: true, // Auto-confirm email for tests
    user_metadata: {},
  });

  if (error) {
    throw new Error(`Failed to create auth user for ${email}: ${error.message}`);
  }

  console.log(`Created auth user for ${email} with ID ${data.user.id}`);
}

/**
 * Wait for job to be processed and recorded in database
 *
 * BullMQ workers process jobs asynchronously and create database records
 * via event handlers. This helper waits for the job_status record to appear
 * in the database before allowing tests to query it.
 *
 * @param jobId - BullMQ job ID
 * @param timeoutMs - Maximum wait time in milliseconds (default: 5000)
 * @returns Job status record from database
 * @throws Error if job doesn't appear in database within timeout
 */
async function waitForJobInDatabase(jobId: string, timeoutMs: number = 5000) {
  const startTime = Date.now();
  const supabase = getSupabaseAdmin();

  while (Date.now() - startTime < timeoutMs) {
    const { data: jobStatus } = await supabase
      .from('job_status')
      .select('*')
      .eq('job_id', jobId)
      .single();

    if (jobStatus) {
      return jobStatus;
    }

    // Wait 100ms before checking again
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  throw new Error(`Timeout waiting for job ${jobId} to appear in database after ${timeoutMs}ms`);
}

// ============================================================================
// Test Suite
// ============================================================================

describe('tRPC Server - Acceptance Tests', () => {
  let testServer: TestServer;
  let serverPort: number;
  let worker: any;

  beforeAll(async () => {
    console.log('Setting up tRPC server acceptance tests...');

    // Clean up any existing test data first (DB only)
    await cleanupTestFixtures();
    // NOTE: We don't cleanup auth users here to avoid race conditions

    // Create Supabase Auth users BEFORE creating database users
    // These need to be created with passwords so we can sign in and get JWT tokens
    // Important: Create auth users first because setupTestFixtures will create database users
    try {
      await createAuthUser(
        TEST_USERS.instructor1.email,
        'test-password-123',
        TEST_USERS.instructor1.id
      );
      await createAuthUser(
        TEST_USERS.instructor2.email,
        'test-password-456',
        TEST_USERS.instructor2.id
      );
      await createAuthUser(TEST_USERS.student.email, 'test-password-789', TEST_USERS.student.id);

      // Wait for Supabase Auth to propagate all user creations (prevent race condition)
      console.log('Waiting for auth users to be ready...');
      await new Promise(resolve => setTimeout(resolve, 3000)); // 3s delay
    } catch (error) {
      console.warn('Warning: Could not create auth users:', error);
    }

    // Setup test fixtures (organizations, users, courses)
    await setupTestFixtures();

    // Start tRPC server
    testServer = await startTestServer();
    serverPort = testServer.port;

    // Start BullMQ worker for job processing
    worker = getWorker(1); // Single worker for predictable test execution
    console.log('BullMQ worker started for test job processing');

    console.log(`Test server ready on port ${serverPort}`);
  }, 30000); // 30s timeout for setup

  afterEach(async () => {
    // Clean up test jobs after each test to prevent interference
    await cleanupTestJobs();
  });

  afterAll(async () => {
    console.log('Tearing down tRPC server acceptance tests...');

    // Stop worker BEFORE server (prevents hanging)
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
  }, 15000); // 15s timeout for teardown

  // ==========================================================================
  // Scenario 1: Server Connectivity
  // ==========================================================================

  describe('Scenario 1: Server starts successfully and accepts connections', () => {
    it('should respond to test procedure with correct structure', async () => {
      // Given: A tRPC client without authentication
      const client = createTestClient(serverPort);

      // When: Calling the public test endpoint
      const response = await client.generation.test.query({ message: 'Hello from test' });

      // Then: Response should have expected structure
      expect(response).toBeDefined();
      expect(response.message).toBe('tRPC server is operational');
      expect(response.timestamp).toBeDefined();
      expect(new Date(response.timestamp).getTime()).toBeGreaterThan(0); // Valid ISO timestamp
      expect(response.echo).toBe('Hello from test');
    });

    it('should handle test endpoint without input', async () => {
      // Given: A tRPC client
      const client = createTestClient(serverPort);

      // When: Calling test endpoint without message
      const response = await client.generation.test.query();

      // Then: Response should be valid with undefined echo
      expect(response).toBeDefined();
      expect(response.message).toBe('tRPC server is operational');
      expect(response.timestamp).toBeDefined();
      expect(response.echo).toBeUndefined();
    });
  });

  // ==========================================================================
  // Scenario 2: Type-Safe Response
  // ==========================================================================

  describe('Scenario 2: Test procedure returns type-safe response', () => {
    it('should return response matching TypeScript interface', async () => {
      // Given: A tRPC client
      const client = createTestClient(serverPort);

      // When: Calling test endpoint
      const response = await client.generation.test.query({ message: 'Type safety test' });

      // Then: Response should match expected type structure
      // TypeScript compiler enforces this, but we verify at runtime too
      expect(typeof response.message).toBe('string');
      expect(typeof response.timestamp).toBe('string');
      expect(typeof response.echo).toBe('string');

      // Verify all expected properties exist
      const keys = Object.keys(response).sort();
      expect(keys).toEqual(['echo', 'message', 'timestamp']);
    });

    it('should handle optional input parameters correctly', async () => {
      // Given: A tRPC client
      const client = createTestClient(serverPort);

      // When: Calling with and without optional message
      const withMessage = await client.generation.test.query({ message: 'Test' });
      const withoutMessage = await client.generation.test.query();

      // Then: Both should be valid but echo differs
      expect(withMessage.echo).toBe('Test');
      expect(withoutMessage.echo).toBeUndefined();

      // Both should have other required fields
      expect(withMessage.message).toBe('tRPC server is operational');
      expect(withoutMessage.message).toBe('tRPC server is operational');
    });
  });

  // ==========================================================================
  // Scenario 3: Authentication Required (401)
  // ==========================================================================

  describe('Scenario 3: Unauthenticated request to protected endpoint returns 401', () => {
    it('should reject initiate request without JWT token', async () => {
      // Given: A tRPC client without authentication
      const client = createTestClient(serverPort);

      // When: Attempting to call protected endpoint
      const courseId = TEST_COURSES.course1.id;

      // Then: Should throw TRPCClientError with UNAUTHORIZED code
      try {
        await client.generation.initiate.mutate({ courseId });
        expect.fail('Should have thrown UNAUTHORIZED error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('UNAUTHORIZED');
        expect(trpcError.message).toContain('Authentication required');
      }
    });

    it('should reject request with invalid JWT token', async () => {
      // Given: A tRPC client with invalid token
      const client = createTestClient(serverPort, 'invalid-jwt-token');

      // When: Attempting to call protected endpoint
      const courseId = TEST_COURSES.course1.id;

      // Then: Should throw UNAUTHORIZED error
      try {
        await client.generation.initiate.mutate({ courseId });
        expect.fail('Should have thrown UNAUTHORIZED error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('UNAUTHORIZED');
      }
    });

    it('should allow public endpoints without authentication', async () => {
      // Given: A tRPC client without authentication
      const client = createTestClient(serverPort);

      // When: Calling public test endpoint
      const response = await client.generation.test.query();

      // Then: Request should succeed
      expect(response).toBeDefined();
      expect(response.message).toBe('tRPC server is operational');
    });
  });

  // ==========================================================================
  // Scenario 4: JWT Context Extraction
  // ==========================================================================

  describe('Scenario 4: Valid JWT token extracts user context correctly', () => {
    it('should extract user context from valid JWT token', async () => {
      // Given: A valid JWT token for instructor1
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // When: Calling a protected endpoint that creates a job
      const courseId = TEST_COURSES.course1.id;
      const response = await client.generation.initiate.mutate({ courseId });

      // Then: Request should succeed with job created
      expect(response).toBeDefined();
      expect(response.jobId).toBeDefined();
      expect(response.status).toBe('pending');
      expect(response.courseId).toBe(courseId);
      expect(response.message).toContain('Course generation initiated successfully');

      // Wait for job to be processed and recorded in database
      const jobStatus = await waitForJobInDatabase(response.jobId, 5000);

      // Verify job was created with correct user context
      expect(jobStatus).toBeDefined();
      expect(jobStatus.user_id).toBe(TEST_USERS.instructor1.id);
      expect(jobStatus.organization_id).toBe(TEST_USERS.instructor1.organizationId);
    });

    it('should use current user context from database', async () => {
      // Given: A valid JWT token for instructor2
      const token = await getAuthToken(TEST_USERS.instructor2.email, 'test-password-456');
      const client = createTestClient(serverPort, token);

      // When: Creating a job
      const courseId = TEST_COURSES.course2.id;
      const response = await client.generation.initiate.mutate({ courseId });

      // Then: Job should be created with instructor2's context
      expect(response).toBeDefined();

      // Wait for job to be processed and recorded in database
      const jobStatus = await waitForJobInDatabase(response.jobId, 5000);

      expect(jobStatus.user_id).toBe(TEST_USERS.instructor2.id);
      expect(jobStatus.organization_id).toBe(TEST_USERS.instructor2.organizationId);
    });
  });

  // ==========================================================================
  // Scenario 5: Role Authorization (403)
  // ==========================================================================

  describe('Scenario 5: Student role attempting to create course returns 403', () => {
    it('should reject student access to instructor endpoint', async () => {
      // Given: A valid JWT token for student user
      const token = await getAuthToken(TEST_USERS.student.email, 'test-password-789');
      const client = createTestClient(serverPort, token);

      // When: Student attempts to initiate course generation
      const courseId = TEST_COURSES.course1.id;

      // Then: Should throw FORBIDDEN error
      try {
        await client.generation.initiate.mutate({ courseId });
        expect.fail('Should have thrown FORBIDDEN error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('FORBIDDEN');
        expect(trpcError.message).toContain('Access denied');
        expect(trpcError.message).toContain('student');
      }
    });

    it('should allow student access to public endpoints', async () => {
      // Given: A valid JWT token for student user
      const token = await getAuthToken(TEST_USERS.student.email, 'test-password-789');
      const client = createTestClient(serverPort, token);

      // When: Student calls public test endpoint
      const response = await client.generation.test.query({ message: 'Student test' });

      // Then: Request should succeed
      expect(response).toBeDefined();
      expect(response.message).toBe('tRPC server is operational');
      expect(response.echo).toBe('Student test');
    });
  });

  // ==========================================================================
  // Scenario 6: Instructor Success
  // ==========================================================================

  describe('Scenario 6: Instructor role creates course successfully', () => {
    it('should allow instructor to initiate course generation', async () => {
      // Given: A valid JWT token for instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // When: Instructor initiates course generation
      const courseId = TEST_COURSES.course1.id;
      const response = await client.generation.initiate.mutate({
        courseId,
        settings: {
          enableAI: true,
          level: 'intermediate',
          maxSections: 10,
        },
      });

      // Then: Request should succeed
      expect(response).toBeDefined();
      expect(response.jobId).toBeDefined();
      expect(response.status).toBe('pending');
      expect(response.courseId).toBe(courseId);

      // Wait for job to be processed and recorded in database
      const jobStatus = await waitForJobInDatabase(response.jobId, 5000);

      // Verify job exists in database
      expect(jobStatus).toBeDefined();
      expect(jobStatus.course_id).toBe(courseId);
      expect(jobStatus.job_type).toBe('initialize');
    });

    it('should validate course UUID format', async () => {
      // Given: A valid JWT token for instructor
      const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const client = createTestClient(serverPort, token);

      // When: Attempting to create job with invalid UUID
      const invalidCourseId = 'not-a-uuid';

      // Then: Should throw BAD_REQUEST error
      try {
        await client.generation.initiate.mutate({ courseId: invalidCourseId });
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
  // Scenario 7: Multi-Client Authentication
  // ==========================================================================

  describe('Scenario 7: Multiple external clients authenticate with same Supabase project', () => {
    it('should handle concurrent requests from multiple authenticated clients', async () => {
      // Given: Two different authenticated clients
      const token1 = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const token2 = await getAuthToken(TEST_USERS.instructor2.email, 'test-password-456');

      const client1 = createTestClient(serverPort, token1);
      const client2 = createTestClient(serverPort, token2);

      // When: Both clients make concurrent requests
      const [response1, response2] = await Promise.all([
        client1.generation.initiate.mutate({ courseId: TEST_COURSES.course1.id }),
        client2.generation.initiate.mutate({ courseId: TEST_COURSES.course2.id }),
      ]);

      // Then: Both requests should succeed independently
      expect(response1).toBeDefined();
      expect(response2).toBeDefined();
      expect(response1.jobId).not.toBe(response2.jobId);

      // Wait for both jobs to be processed and recorded in database
      const jobs = await Promise.all([
        waitForJobInDatabase(response1.jobId, 5000),
        waitForJobInDatabase(response2.jobId, 5000),
      ]);

      // Find jobs by jobId to avoid race condition with Promise.all ordering
      const job1 = jobs.find(j => j.job_id === response1.jobId)!;
      const job2 = jobs.find(j => j.job_id === response2.jobId)!;

      // Verify jobs are isolated by user context
      expect(job1.user_id).toBe(TEST_USERS.instructor1.id);
      expect(job2.user_id).toBe(TEST_USERS.instructor2.id);
      expect(job1.course_id).toBe(TEST_COURSES.course1.id);
      expect(job2.course_id).toBe(TEST_COURSES.course2.id);
    });

    it('should maintain separate sessions for different clients', async () => {
      // Given: Three clients with different authentication states
      const instructorToken = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const studentToken = await getAuthToken(TEST_USERS.student.email, 'test-password-789');

      const instructorClient = createTestClient(serverPort, instructorToken);
      const studentClient = createTestClient(serverPort, studentToken);
      const unauthenticatedClient = createTestClient(serverPort);

      // When: Each client makes appropriate requests
      const instructorResponse = await instructorClient.generation.initiate.mutate({
        courseId: TEST_COURSES.course1.id,
      });

      const publicResponse = await unauthenticatedClient.generation.test.query();

      // Then: Instructor request should succeed
      expect(instructorResponse).toBeDefined();
      expect(instructorResponse.jobId).toBeDefined();

      // Public endpoint should work for everyone
      expect(publicResponse).toBeDefined();

      // Student should be rejected from instructor endpoint
      try {
        await studentClient.generation.initiate.mutate({ courseId: TEST_COURSES.course1.id });
        expect.fail('Student should not access instructor endpoint');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCClientError);
        const trpcError = error as TRPCClientError<AppRouter>;
        expect(trpcError.data?.code).toBe('FORBIDDEN');
      }
    });

    it('should isolate requests by organization context', async () => {
      // Given: Two instructor clients from same organization
      const token1 = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
      const token2 = await getAuthToken(TEST_USERS.instructor2.email, 'test-password-456');

      const client1 = createTestClient(serverPort, token1);
      const client2 = createTestClient(serverPort, token2);

      // When: Both create jobs
      const response1 = await client1.generation.initiate.mutate({
        courseId: TEST_COURSES.course1.id,
      });
      const response2 = await client2.generation.initiate.mutate({
        courseId: TEST_COURSES.course2.id,
      });

      // Wait for both jobs to be processed and recorded in database
      const [job1, job2] = await Promise.all([
        waitForJobInDatabase(response1.jobId, 5000),
        waitForJobInDatabase(response2.jobId, 5000),
      ]);

      // Then: Both jobs should belong to the same organization
      expect(job1.organization_id).toBe(job2.organization_id);
      expect(job1.organization_id).toBe(TEST_USERS.instructor1.organizationId);

      // But different users
      expect(job1.user_id).not.toBe(job2.user_id);
    });
  });
});
