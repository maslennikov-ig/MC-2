/**
 * BullMQ Queue Tests
 *
 * Tests for the queue setup and job creation.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getQueue, addJob, closeQueue } from '../../src/orchestrator/queue';
import { JobType } from '@megacampus/shared-types';
import { getRedisClient } from '../../src/shared/cache/redis';

describe('BullMQ Queue', () => {
  beforeAll(async () => {
    // Connect Redis client
    const redis = getRedisClient();
    await redis.connect();
  });

  afterAll(async () => {
    // Clean up
    await closeQueue();
    const redis = getRedisClient();
    await redis.quit();
  });

  it('should create a queue instance', () => {
    const queue = getQueue();
    expect(queue).toBeDefined();
    expect(queue.name).toBe('course-generation');
  });

  it('should add a test job to the queue', async () => {
    const jobData = {
      jobType: JobType.TEST_JOB,
      organizationId: '00000000-0000-0000-0000-000000000001',
      courseId: '00000000-0000-0000-0000-000000000002',
      userId: '00000000-0000-0000-0000-000000000003',
      message: 'Test job from unit test',
      createdAt: new Date().toISOString(),
    };

    const job = await addJob(JobType.TEST_JOB, jobData);

    expect(job).toBeDefined();
    expect(job.id).toBeDefined();
    expect(job.data).toEqual(jobData);
    expect(job.name).toBe(JobType.TEST_JOB);
  });

  it('should add an initialize job to the queue', async () => {
    const jobData = {
      jobType: JobType.INITIALIZE,
      organizationId: '00000000-0000-0000-0000-000000000001',
      courseId: '00000000-0000-0000-0000-000000000002',
      userId: '00000000-0000-0000-0000-000000000003',
      createdAt: new Date().toISOString(),
      metadata: {
        testMode: true,
      },
    };

    const job = await addJob(JobType.INITIALIZE, jobData);

    expect(job).toBeDefined();
    expect(job.id).toBeDefined();
    expect(job.data).toEqual(jobData);
    expect(job.name).toBe(JobType.INITIALIZE);
  });
});
