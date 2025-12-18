/**
 * BullMQ Worker Tests
 *
 * Tests for the worker and job handlers.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { startWorker, stopWorker, isWorkerRunning } from '../../src/orchestrator/worker';
import { addJob, closeQueue } from '../../src/orchestrator/queue';
import { JobType } from '@megacampus/shared-types';
import { getRedisClient } from '../../src/shared/cache/redis';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import {
  setupTestFixtures,
  cleanupTestFixtures,
  cleanupTestJobs,
  TEST_ORGS,
  TEST_USERS,
  TEST_COURSES,
} from '../fixtures';

/**
 * Wait for a job to reach a specific state in the DATABASE
 * This is more reliable than BullMQ's waitUntilFinished for testing
 */
async function waitForJobStateDB(
  jobId: string,
  targetStates: string[],
  timeout: number = 30000
): Promise<any> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const { data } = await getSupabaseAdmin()
      .from('job_status')
      .select('*')
      .eq('job_id', jobId)
      .single();

    if (data && targetStates.includes(data.status)) {
      return data;
    }

    await new Promise(resolve => setTimeout(resolve, 250));
  }

  throw new Error(`Timeout waiting for job ${jobId} to reach state(s): ${targetStates.join(', ')}`);
}

describe('BullMQ Worker', () => {
  beforeAll(async () => {
    // Setup test fixtures (organizations, users, courses)
    await setupTestFixtures();

    // Connect Redis client (must be done BEFORE cleanupTestJobs)
    const redis = getRedisClient();
    await redis.connect();

    // Clean any leftover jobs from previous test runs
    // This is critical to prevent foreign key violations from old queue jobs
    // NOTE: Must be called AFTER redis.connect() so getQueue() can work
    // Use obliterate=true to force remove ALL jobs before tests start
    await cleanupTestJobs(true);

    // Start worker
    await startWorker(1); // Single worker for tests
  }, 15000); // Increased timeout for setup

  afterEach(async () => {
    // Clean up jobs after each test to prevent pollution
    await cleanupTestJobs();
  });

  afterAll(async () => {
    // Stop worker
    await stopWorker();

    // Clean up
    await closeQueue();
    const redis = getRedisClient();
    await redis.quit();

    // Clean up test fixtures
    await cleanupTestFixtures();
  }, 15000); // Increased timeout for cleanup

  it('should start the worker', () => {
    expect(isWorkerRunning()).toBe(true);
  });

  it('should process a test job successfully', async () => {
    const jobData = {
      jobType: JobType.TEST_JOB,
      organizationId: TEST_ORGS.premium.id,
      courseId: TEST_COURSES.course1.id,
      userId: TEST_USERS.instructor1.id,
      message: 'Test job from worker test',
      createdAt: new Date().toISOString(),
    };

    const job = await addJob(JobType.TEST_JOB, jobData);

    // Wait for job to complete using database polling
    const result = await waitForJobStateDB(job.id!, ['completed', 'failed'], 25000);

    expect(result).toBeDefined();
    expect(result.status).toBe('completed');
    expect(result.error_message).toBeNull();
  }, 25000);

  it('should process an initialize job successfully', async () => {
    const jobData = {
      jobType: JobType.INITIALIZE,
      organizationId: TEST_ORGS.premium.id,
      courseId: TEST_COURSES.course1.id,
      userId: TEST_USERS.instructor1.id,
      createdAt: new Date().toISOString(),
    };

    const job = await addJob(JobType.INITIALIZE, jobData);

    // Wait for job to complete using database polling
    const result = await waitForJobStateDB(job.id!, ['completed', 'failed'], 25000);

    expect(result).toBeDefined();
    expect(result.status).toBe('completed');
    expect(result.error_message).toBeNull();
  }, 25000);

  it('should handle a test job with delay', async () => {
    const jobData = {
      jobType: JobType.TEST_JOB,
      organizationId: TEST_ORGS.premium.id,
      courseId: TEST_COURSES.course1.id,
      userId: TEST_USERS.instructor1.id,
      message: 'Test job with delay',
      delayMs: 1000, // 1 second delay
      createdAt: new Date().toISOString(),
    };

    const startTime = Date.now();
    const job = await addJob(JobType.TEST_JOB, jobData);

    // Wait for job to complete using database polling
    const result = await waitForJobStateDB(job.id!, ['completed', 'failed'], 30000);

    const duration = Date.now() - startTime;

    expect(result.status).toBe('completed');
    expect(duration).toBeGreaterThanOrEqual(1000); // Should take at least 1 second
  }, 30000);

  it('should handle a failing test job', async () => {
    const jobData = {
      jobType: JobType.TEST_JOB,
      organizationId: TEST_ORGS.premium.id,
      courseId: TEST_COURSES.course1.id,
      userId: TEST_USERS.instructor1.id,
      message: 'Test job configured to fail',
      shouldFail: true,
      createdAt: new Date().toISOString(),
    };

    const job = await addJob(JobType.TEST_JOB, jobData);

    // Wait for job to complete (should fail)
    const result = await waitForJobStateDB(job.id!, ['completed', 'failed'], 25000);

    expect(result.status).toBe('failed');
    expect(result.error_message).toBeDefined();
    expect(result.error_message.toLowerCase()).toContain('intentional');
  }, 25000);
});
