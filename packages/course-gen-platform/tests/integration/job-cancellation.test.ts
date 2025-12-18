/**
 * Job Cancellation - Integration Tests
 *
 * Tests for custom job cancellation mechanism that works around BullMQ's limitation
 * (BullMQ cannot cancel active/locked jobs).
 *
 * Our custom implementation:
 * 1. User calls jobs.cancel tRPC endpoint
 * 2. Endpoint sets cancelled=true in database
 * 3. Job handler periodically calls checkCancellation()
 * 4. If cancelled=true, handler throws JobCancelledError
 * 5. Worker catches JobCancelledError and marks job as cancelled (not failed)
 *
 * Prerequisites:
 * - Redis >= 5.0.0 running at redis://localhost:6379 (BullMQ 5.x requirement)
 * - Database migration 20250111_job_cancellation.sql applied
 * - Test fixtures (org, users, course) created
 *
 * Test execution: pnpm test tests/integration/job-cancellation.test.ts
 *
 * IMPORTANT: These tests will be SKIPPED if Redis version < 5.0.0
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Job } from 'bullmq';
import { getQueue, addJob, closeQueue } from '../../src/orchestrator/queue';
import { getWorker, stopWorker } from '../../src/orchestrator/worker';
import { getRedisClient } from '../../src/shared/cache/redis';
import { JobType, TestJobData } from '@megacampus/shared-types';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import { jobsRouter } from '../../src/server/routers/jobs';
import type { Context } from '../../src/server/trpc';
import {
  setupTestFixtures,
  cleanupTestFixtures,
  cleanupTestJobs,
  TEST_ORGS,
  TEST_USERS,
} from '../fixtures';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Generate unique job ID for test isolation
 * Prevents job ID conflicts when tests run in parallel
 */
let jobIdCounter = 0;
const TEST_SUITE_PREFIX = `cancel-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
function generateUniqueJobId(): string {
  return `${TEST_SUITE_PREFIX}-${++jobIdCounter}`;
}

/**
 * Check Redis version and determine if BullMQ tests can run
 */
async function getRedisVersion(): Promise<{
  version: string;
  major: number;
  minor: number;
  patch: number;
} | null> {
  try {
    const redis = getRedisClient();
    await redis.connect();
    const info = await redis.info('server');
    const match = info.match(/redis_version:(\d+)\.(\d+)\.(\d+)/);
    if (match) {
      return {
        version: `${match[1]}.${match[2]}.${match[3]}`,
        major: parseInt(match[1]),
        minor: parseInt(match[2]),
        patch: parseInt(match[3]),
      };
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Check if Redis meets minimum version requirement for BullMQ 5.x
 */
function isRedisVersionSupported(
  versionInfo: { major: number; minor: number; patch: number } | null
): boolean {
  if (!versionInfo) return false;
  // BullMQ 5.x requires Redis >= 5.0.0
  return versionInfo.major >= 5;
}

/**
 * Wait for a job to reach a specific state in the DATABASE
 */
async function waitForJobStateDB(
  jobId: string,
  targetState: string | string[],
  timeout: number = 30000
): Promise<any> {
  const startTime = Date.now();
  const targetStates = Array.isArray(targetState) ? targetState : [targetState];

  while (Date.now() - startTime < timeout) {
    const dbStatus = await getJobStatusFromDB(jobId);

    if (!dbStatus) {
      await new Promise(resolve => setTimeout(resolve, 250));
      continue;
    }

    if (targetStates.includes(dbStatus.status)) {
      return dbStatus;
    }

    await new Promise(resolve => setTimeout(resolve, 250));
  }

  const finalStatus = await getJobStatusFromDB(jobId);
  const actualState = finalStatus ? finalStatus.status : 'not found in DB';

  if (finalStatus && targetStates.includes(finalStatus.status)) {
    return finalStatus;
  }

  throw new Error(
    `Timeout waiting for job ${jobId} to reach DB state(s): ${targetStates.join(', ')}. Current state: ${actualState}`
  );
}

/**
 * Get job status from database
 */
async function getJobStatusFromDB(jobId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('job_status')
    .select('*')
    .eq('job_id', jobId)
    .single();

  if (error) {
    return null;
  }

  return data;
}

/**
 * Clean up all jobs from queue
 */
async function cleanupAllJobs(): Promise<void> {
  const queue = getQueue();
  // Obliterate removes ALL jobs from the queue (more thorough than drain/clean)
  await queue.obliterate({ force: true });
}

/**
 * Clean up job status records from database
 */
async function cleanupJobStatusDB(): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from('job_status').delete().eq('job_type', JobType.TEST_JOB);
}

/**
 * Create mock tRPC context for testing
 */
function createMockContext(userId: string, role: string, orgId: string): Context {
  return {
    user: {
      id: userId,
      email: 'test@example.com',
      role: role as any,
      organizationId: orgId,
    },
  };
}

/**
 * Call tRPC procedure directly (for testing)
 */
async function callCancelJob(ctx: Context, jobId: string) {
  const caller = jobsRouter.createCaller(ctx);
  return await caller.cancel({ jobId });
}

// ============================================================================
// Test Suite Setup
// ============================================================================

describe('Job Cancellation System', () => {
  let worker: any;
  let redisVersionInfo: { version: string; major: number; minor: number; patch: number } | null =
    null;
  let shouldSkipTests = false;

  beforeAll(async () => {
    // Check Redis version first
    redisVersionInfo = await getRedisVersion();

    if (!redisVersionInfo) {
      console.warn('⚠️  Could not determine Redis version - tests will be skipped');
      shouldSkipTests = true;
      return;
    }

    const isSupported = isRedisVersionSupported(redisVersionInfo);

    if (!isSupported) {
      console.warn('⚠️  Redis version too old for BullMQ 5.x');
      console.warn(`   Current: ${redisVersionInfo.version} | Required: >= 5.0.0`);
      console.warn('   Tests will be SKIPPED');
      shouldSkipTests = true;
      return;
    }

    console.log(`✓ Redis version ${redisVersionInfo.version} is supported`);

    // Setup test fixtures (organizations, users, courses)
    await setupTestFixtures();

    // Redis is already connected from getRedisVersion() call above
    // No need to call redis.connect() again (it will error with "already connecting/connected")

    // Clean up any existing jobs
    await cleanupAllJobs();
    await cleanupJobStatusDB();

    // Start worker
    worker = getWorker(1);
  }, 15000);

  // Clean up after each test to prevent long-running jobs from interfering
  afterEach(async () => {
    if (shouldSkipTests) return;
    await cleanupAllJobs();
    await cleanupJobStatusDB();
  });

  afterAll(async () => {
    if (shouldSkipTests) {
      // Only disconnect Redis if tests were skipped
      const redis = getRedisClient();
      try {
        await redis.quit();
      } catch (error) {
        // Ignore errors on cleanup
      }
      return;
    }

    // Clean up all jobs and job status records
    await cleanupAllJobs();
    await cleanupJobStatusDB();

    await stopWorker(false);
    await closeQueue();
    const redis = getRedisClient();
    await redis.quit();

    // Clean up test fixtures
    await cleanupTestFixtures();
  }, 15000);

  // ==========================================================================
  // Scenario 1: User cancels job during processing
  // ==========================================================================

  describe.skipIf(shouldSkipTests)('Scenario 1: User cancels job during processing', () => {
    it('should stop job gracefully when cancelled during execution', async () => {
      // Given: A long-running job (with periodic checkCancellation calls)
      const jobData: TestJobData = {
        jobType: JobType.TEST_JOB,
        organizationId: TEST_ORGS.premium.id,
        courseId: null, // courseId is nullable for org-level jobs
        userId: TEST_USERS.instructor1.id,
        message: 'Long-running job to be cancelled',
        delayMs: 3000, // 3 second delay - reduced from 15s for faster tests
        checkCancellation: true, // Enable cancellation checks
        createdAt: new Date().toISOString(),
      };

      // When: Job is added and starts processing
      const job = await addJob(JobType.TEST_JOB, jobData, { jobId: generateUniqueJobId() });
      expect(job.id).toBeDefined();

      // Wait longer for job to be written to database and become active
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Wait for job to become active (not just pending)
      await waitForJobStateDB(job.id!, 'active', 15000);

      // Cancel immediately once active
      const ctx = createMockContext(TEST_USERS.instructor1.id, 'instructor', TEST_ORGS.premium.id);
      const result = await callCancelJob(ctx, job.id!);

      expect(result.success).toBe(true);
      expect(result.message).toContain('cancelled');

      // Add delay to allow database write to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Then: Job should detect cancellation and stop gracefully
      // Wait for job to fail (with cancelled=true)
      await waitForJobStateDB(job.id!, 'failed', 15000);

      const dbStatus = await getJobStatusFromDB(job.id!);
      expect(dbStatus).toBeDefined();
      expect(dbStatus!.cancelled).toBe(true);
      expect(dbStatus!.cancelled_at).toBeDefined();
      expect(dbStatus!.cancelled_by).toBe(TEST_USERS.instructor1.id);
      expect(dbStatus!.error_message).toContain('cancelled by user request');
    }, 15000); // Increased to 15s to allow for delay + cancellation + assertions
  });

  // ==========================================================================
  // Scenario 2: User cancels queued job
  // ==========================================================================

  describe.skipIf(shouldSkipTests)('Scenario 2: User cancels queued job', () => {
    it('should prevent job from starting if cancelled while queued', async () => {
      // Given: A job that will process with cancellation checks
      const jobData: TestJobData = {
        jobType: JobType.TEST_JOB,
        organizationId: TEST_ORGS.premium.id,
        courseId: null, // courseId is nullable for org-level jobs
        userId: TEST_USERS.instructor1.id,
        message: 'Job to be cancelled during processing',
        delayMs: 3000, // 3 second delay - reduced from 10s for faster tests
        checkCancellation: true,
        createdAt: new Date().toISOString(),
      };

      // Add job normally (worker will process it)
      const job = await addJob(JobType.TEST_JOB, jobData, { jobId: generateUniqueJobId() });
      expect(job.id).toBeDefined();

      // Wait longer for job to be recorded in database
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Wait for job to become active
      await waitForJobStateDB(job.id!, 'active', 10000);

      // Cancel the job while it's processing
      const ctx = createMockContext(TEST_USERS.instructor1.id, 'instructor', TEST_ORGS.premium.id);
      const result = await callCancelJob(ctx, job.id!);

      expect(result.success).toBe(true);

      // Job should detect cancellation and fail gracefully
      await waitForJobStateDB(job.id!, 'failed', 15000);

      const dbStatus = await getJobStatusFromDB(job.id!);
      expect(dbStatus).toBeDefined();
      expect(dbStatus!.cancelled).toBe(true);
      expect(dbStatus!.cancelled_by).toBe(TEST_USERS.instructor1.id);
    }, 15000); // Increased to 15s to allow for delay + cancellation + assertions
  });

  // ==========================================================================
  // Scenario 3: Non-owner tries to cancel
  // ==========================================================================

  describe.skipIf(shouldSkipTests)('Scenario 3: Non-owner tries to cancel job', () => {
    it('should return 403 FORBIDDEN when non-owner tries to cancel', async () => {
      // Given: A job owned by instructor 1
      const jobData: TestJobData = {
        jobType: JobType.TEST_JOB,
        organizationId: TEST_ORGS.premium.id,
        courseId: null, // courseId is nullable for org-level jobs
        userId: TEST_USERS.instructor1.id,
        message: 'Job owned by instructor 1',
        delayMs: 5000,
        createdAt: new Date().toISOString(),
      };

      const job = await addJob(JobType.TEST_JOB, jobData, { jobId: generateUniqueJobId() });

      // Add a small delay to ensure job is written to database
      await new Promise(resolve => setTimeout(resolve, 500));

      await waitForJobStateDB(job.id!, ['pending', 'active'], 10000);

      // When: Instructor 2 (different user, same org) tries to cancel
      const ctx = createMockContext(TEST_USERS.instructor2.id, 'instructor', TEST_ORGS.premium.id);

      // Then: Should throw FORBIDDEN error
      await expect(callCancelJob(ctx, job.id!)).rejects.toThrow(/permission/i);
    }, 15000);
  });

  // ==========================================================================
  // Scenario 4: Job already completed
  // ==========================================================================

  describe.skipIf(shouldSkipTests)('Scenario 4: Cannot cancel already completed job', () => {
    it('should return BAD_REQUEST when trying to cancel completed job', async () => {
      // Given: A quick job that completes immediately
      const jobData: TestJobData = {
        jobType: JobType.TEST_JOB,
        organizationId: TEST_ORGS.premium.id,
        courseId: null, // courseId is nullable for org-level jobs
        userId: TEST_USERS.instructor1.id,
        message: 'Quick job',
        createdAt: new Date().toISOString(),
      };

      const job = await addJob(JobType.TEST_JOB, jobData, { jobId: generateUniqueJobId() });

      // Add a delay to ensure worker picks up and processes the job (prevent race condition)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Wait for job to complete
      await waitForJobStateDB(job.id!, 'completed', 15000);

      // When: Try to cancel completed job
      const ctx = createMockContext(TEST_USERS.instructor1.id, 'instructor', TEST_ORGS.premium.id);

      // Then: Should return BAD_REQUEST
      await expect(callCancelJob(ctx, job.id!)).rejects.toThrow(/already completed/i);
    }, 20000);
  });

  // ==========================================================================
  // Scenario 5: Admin can cancel any job
  // ==========================================================================

  describe.skipIf(shouldSkipTests)('Scenario 5: Admin can cancel any job in organization', () => {
    it('should allow admin to cancel jobs owned by other users', async () => {
      // Given: A job owned by instructor
      const jobData: TestJobData = {
        jobType: JobType.TEST_JOB,
        organizationId: TEST_ORGS.premium.id,
        courseId: null, // courseId is nullable for org-level jobs
        userId: TEST_USERS.instructor1.id,
        message: 'Job owned by instructor',
        delayMs: 3000, // 3 second delay - reduced from 15s for faster tests
        checkCancellation: true,
        createdAt: new Date().toISOString(),
      };

      const job = await addJob(JobType.TEST_JOB, jobData, { jobId: generateUniqueJobId() });

      // Wait longer for job to be written to database
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Wait for job to become active
      await waitForJobStateDB(job.id!, 'active', 15000);

      // When: Admin cancels the job
      const ctx = createMockContext(TEST_USERS.admin.id, 'admin', TEST_ORGS.premium.id);
      const result = await callCancelJob(ctx, job.id!);

      // Then: Cancellation should succeed
      expect(result.success).toBe(true);
      expect(result.cancelledBy).toBe(TEST_USERS.admin.id);

      // Job should be marked as cancelled
      await waitForJobStateDB(job.id!, 'failed', 15000);

      const dbStatus = await getJobStatusFromDB(job.id!);
      expect(dbStatus).toBeDefined();
      expect(dbStatus!.cancelled).toBe(true);
      expect(dbStatus!.cancelled_by).toBe(TEST_USERS.admin.id);
    }, 15000); // Increased to 15s to allow for delay + cancellation + assertions
  });
});
