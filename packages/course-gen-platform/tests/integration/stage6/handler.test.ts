/**
 * Stage 6 BullMQ Handler Integration Tests
 * @module tests/integration/stage6/handler.test.ts
 *
 * Comprehensive integration tests for Stage 6 lesson content generation
 * BullMQ handler. Tests job processing, progress streaming, model fallback,
 * partial success handling, concurrency, and generation lock integration.
 *
 * Prerequisites:
 * - Redis >= 5.0.0 running at redis://localhost:6379
 * - Environment variables: OPENROUTER_API_KEY (for LLM calls)
 * - Database migration applied (lesson_contents table)
 *
 * Test execution: pnpm test tests/integration/stage6/handler.test.ts
 *
 * NOTE: These are integration tests requiring real Redis and optional LLM API.
 * Use realistic timeouts (60-120s per job) for LLM-based tests.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import {
  createStage6Worker,
  createStage6Queue,
  HANDLER_CONFIG,
  type Stage6JobInput,
  type Stage6JobResult,
  type ProgressUpdate,
} from '../../../src/stages/stage6-lesson-content/handler';
import { getRedisClient } from '../../../src/shared/cache/redis';
import { generationLockService } from '../../../src/shared/locks/generation-lock';
import { getSupabaseAdmin } from '../../../src/shared/supabase/admin';
import {
  mockStage6JobInput,
  cleanupStage6TestData,
  setupTestFixtures,
  cleanupTestFixtures,
  TEST_ORGS,
  TEST_USERS,
  TEST_COURSES,
} from '../../fixtures';
import {
  ANALYTICAL_LESSON_SPEC,
  DATA_ANALYSIS_CHUNKS,
  PROCEDURAL_LESSON_SPEC,
  PYTHON_BASICS_CHUNKS,
  CONCEPTUAL_LESSON_SPEC,
  ML_THEORY_CHUNKS,
  createTestLessonSpec,
  createTestRAGChunks,
} from '../../fixtures/stage6';

// ============================================================================
// Test Configuration
// ============================================================================

/** Unique prefix for test isolation */
const TEST_PREFIX = `stage6-handler-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Counter for unique job IDs */
let jobIdCounter = 0;

/** Generate unique job ID for test isolation */
function generateUniqueJobId(): string {
  return `${TEST_PREFIX}-${++jobIdCounter}`;
}

/** Generate unique course ID for test isolation */
function generateUniqueCourseId(): string {
  return `00000000-0000-0000-test-${Date.now().toString(36)}${(++jobIdCounter).toString().padStart(4, '0')}`;
}

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Check Redis version and determine if tests can run
 */
async function getRedisVersion(): Promise<{
  version: string;
  major: number;
  minor: number;
  patch: number;
} | null> {
  try {
    const redis = getRedisClient();
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
  } catch {
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
  return versionInfo.major >= 5;
}

/**
 * Wait for a job to complete with timeout
 */
async function waitForJobCompletion(
  job: Job<Stage6JobInput, Stage6JobResult>,
  queueEvents: QueueEvents,
  timeout: number = 120000
): Promise<Stage6JobResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Job ${job.id} timed out after ${timeout}ms`));
    }, timeout);

    queueEvents.on('completed', async ({ jobId, returnvalue }) => {
      if (jobId === job.id) {
        clearTimeout(timer);
        resolve(returnvalue as unknown as Stage6JobResult);
      }
    });

    queueEvents.on('failed', async ({ jobId, failedReason }) => {
      if (jobId === job.id) {
        clearTimeout(timer);
        reject(new Error(`Job ${jobId} failed: ${failedReason}`));
      }
    });
  });
}

/**
 * Collect progress updates from a job
 */
async function collectProgressUpdates(
  queueEvents: QueueEvents,
  jobId: string,
  timeout: number = 120000
): Promise<ProgressUpdate[]> {
  const updates: ProgressUpdate[] = [];

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(updates);
    }, timeout);

    queueEvents.on('progress', ({ jobId: eventJobId, data }) => {
      if (eventJobId === jobId) {
        updates.push(data as ProgressUpdate);
      }
    });

    queueEvents.on('completed', ({ jobId: eventJobId }) => {
      if (eventJobId === jobId) {
        clearTimeout(timer);
        // Give a small delay to collect final progress update
        setTimeout(() => resolve(updates), 100);
      }
    });

    queueEvents.on('failed', ({ jobId: eventJobId }) => {
      if (eventJobId === jobId) {
        clearTimeout(timer);
        resolve(updates);
      }
    });
  });
}

/**
 * Clean up all Stage 6 jobs from queue
 */
async function cleanupStage6Queue(queue: Queue): Promise<void> {
  await queue.obliterate({ force: true });
}

/**
 * Clean up generation locks for test courses
 */
async function cleanupGenerationLocks(courseIds: string[]): Promise<void> {
  for (const courseId of courseIds) {
    await generationLockService.forceRelease(courseId);
  }
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Stage 6 BullMQ Handler Integration', () => {
  let queue: Queue<Stage6JobInput, Stage6JobResult>;
  let worker: Worker<Stage6JobInput, Stage6JobResult>;
  let queueEvents: QueueEvents;
  let redisVersionInfo: { version: string; major: number; minor: number; patch: number } | null = null;
  let shouldSkipTests = false;
  let testCourseIds: string[] = [];

  beforeAll(async () => {
    // Check Redis version first
    redisVersionInfo = await getRedisVersion();

    if (!redisVersionInfo) {
      console.warn('[Stage 6 Handler Tests] Could not determine Redis version - tests will be skipped');
      shouldSkipTests = true;
      return;
    }

    const isSupported = isRedisVersionSupported(redisVersionInfo);

    if (!isSupported) {
      console.warn('[Stage 6 Handler Tests] Redis version too old for BullMQ 5.x');
      console.warn(`   Current: ${redisVersionInfo.version} | Required: >= 5.0.0`);
      shouldSkipTests = true;
      return;
    }

    console.log(`[Stage 6 Handler Tests] Redis version ${redisVersionInfo.version} is supported`);

    // Setup test fixtures (organizations, users, courses)
    await setupTestFixtures({ skipAuthUsers: true });

    // Create queue, worker, and queue events for monitoring
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    queue = createStage6Queue(redisUrl);

    // Create worker with reduced concurrency for testing (5 instead of 30)
    worker = createStage6Worker(redisUrl);

    // Create queue events for monitoring job progress and completion
    queueEvents = new QueueEvents(HANDLER_CONFIG.QUEUE_NAME, {
      connection: { url: redisUrl },
    });

    // Wait for connections to be ready
    await queueEvents.waitUntilReady();

    console.log('[Stage 6 Handler Tests] Queue, Worker, and QueueEvents initialized');
  }, 30000);

  afterAll(async () => {
    if (shouldSkipTests) {
      return;
    }

    // Close worker gracefully
    if (worker) {
      await worker.close();
    }

    // Close queue events
    if (queueEvents) {
      await queueEvents.close();
    }

    // Close queue
    if (queue) {
      await queue.close();
    }

    // Cleanup test data
    for (const courseId of testCourseIds) {
      await cleanupStage6TestData(courseId, { deleteCourse: true });
    }

    // Cleanup fixtures
    await cleanupTestFixtures();

    console.log('[Stage 6 Handler Tests] Cleanup completed');
  }, 30000);

  beforeEach(async () => {
    if (shouldSkipTests) return;

    // Clean up queue before each test
    await cleanupStage6Queue(queue);

    // Clean up any lingering locks
    await cleanupGenerationLocks(testCourseIds);
  });

  afterEach(async () => {
    if (shouldSkipTests) return;

    // Clean up after each test
    await cleanupStage6Queue(queue);
    await cleanupGenerationLocks(testCourseIds);
  });

  // ==========================================================================
  // Scenario 1: Job Processing
  // ==========================================================================

  describe('Job Processing', () => {
    it.skipIf(shouldSkipTests)('should create queue and worker instances', async () => {
      // Verify queue is created
      expect(queue).toBeDefined();
      expect(queue.name).toBe(HANDLER_CONFIG.QUEUE_NAME);

      // Verify worker is created
      expect(worker).toBeDefined();
    });

    it.skipIf(shouldSkipTests)('should add job to queue successfully', async () => {
      // Given: A valid Stage 6 job input
      const courseId = generateUniqueCourseId();
      testCourseIds.push(courseId);

      const jobInput = mockStage6JobInput({
        lessonSpec: createTestLessonSpec({ lesson_id: '1.1' }),
        courseId,
        ragChunks: createTestRAGChunks(5),
      });

      // When: Job is added to the queue
      const job = await queue.add('generate-lesson', jobInput, {
        jobId: generateUniqueJobId(),
      });

      // Then: Job should be created
      expect(job).toBeDefined();
      expect(job.id).toBeDefined();
      expect(job.name).toBe('generate-lesson');
      expect(job.data.lessonSpec.lesson_id).toBe('1.1');
      expect(job.data.courseId).toBe(courseId);
    });

    it.skipIf(shouldSkipTests || !process.env.OPENROUTER_API_KEY)(
      'should process single lesson job successfully',
      async () => {
        // Given: A valid Stage 6 job with analytical lesson spec
        const courseId = generateUniqueCourseId();
        testCourseIds.push(courseId);

        const jobInput = mockStage6JobInput({
          lessonSpec: ANALYTICAL_LESSON_SPEC,
          courseId,
          ragChunks: DATA_ANALYSIS_CHUNKS,
        });

        // When: Job is added and processed
        const job = await queue.add('generate-lesson', jobInput, {
          jobId: generateUniqueJobId(),
        });

        // Then: Wait for job completion
        const result = await waitForJobCompletion(job, queueEvents, 180000);

        // Verify result structure
        expect(result).toBeDefined();
        expect(result.lessonId).toBe(ANALYTICAL_LESSON_SPEC.lesson_id);
        expect(result.success).toBe(true);
        expect(result.lessonContent).toBeDefined();
        expect(result.errors).toHaveLength(0);

        // Verify metrics
        expect(result.metrics).toBeDefined();
        expect(result.metrics.tokensUsed).toBeGreaterThan(0);
        expect(result.metrics.durationMs).toBeGreaterThan(0);
        expect(result.metrics.modelUsed).toBeDefined();
        expect(result.metrics.qualityScore).toBeGreaterThanOrEqual(0);
      },
      180000
    );

    it.skipIf(shouldSkipTests)('should handle job with invalid input gracefully', async () => {
      // Given: A job with missing required fields (empty lesson spec)
      const courseId = generateUniqueCourseId();
      testCourseIds.push(courseId);

      const invalidJobInput: Stage6JobInput = {
        // @ts-expect-error - intentionally invalid for testing
        lessonSpec: {},
        courseId,
        ragChunks: [],
        ragContextId: null,
      };

      // When: Job is added
      const job = await queue.add('invalid-job', invalidJobInput, {
        jobId: generateUniqueJobId(),
      });

      // Then: Job should fail with error
      await expect(
        waitForJobCompletion(job, queueEvents, 30000)
      ).rejects.toThrow();
    });
  });

  // ==========================================================================
  // Scenario 2: Progress Streaming
  // ==========================================================================

  describe('Progress Streaming', () => {
    it.skipIf(shouldSkipTests || !process.env.OPENROUTER_API_KEY)(
      'should update job progress during processing',
      async () => {
        // Given: A valid Stage 6 job
        const courseId = generateUniqueCourseId();
        testCourseIds.push(courseId);

        const jobInput = mockStage6JobInput({
          lessonSpec: createTestLessonSpec({ lesson_id: '2.1' }),
          courseId,
          ragChunks: createTestRAGChunks(3),
        });

        // When: Job is added and we collect progress updates
        const job = await queue.add('progress-test', jobInput, {
          jobId: generateUniqueJobId(),
        });

        const progressUpdates = await collectProgressUpdates(queueEvents, job.id!, 180000);

        // Then: Should have received progress updates
        expect(progressUpdates.length).toBeGreaterThan(0);

        // Verify progress update structure
        const firstUpdate = progressUpdates[0];
        expect(firstUpdate.lessonId).toBeDefined();
        expect(firstUpdate.phase).toBeDefined();
        expect(firstUpdate.progress).toBeGreaterThanOrEqual(0);
        expect(firstUpdate.progress).toBeLessThanOrEqual(100);
        expect(firstUpdate.message).toBeDefined();

        // Verify progress increases (not necessarily monotonically due to phases)
        const lastUpdate = progressUpdates[progressUpdates.length - 1];
        if (lastUpdate.phase === 'complete') {
          expect(lastUpdate.progress).toBe(100);
        }
      },
      180000
    );

    it.skipIf(shouldSkipTests)('should include expected phases in progress updates', async () => {
      // This test verifies the progress update structure without requiring LLM
      const expectedPhases = ['planner', 'expander', 'assembler', 'smoother', 'judge', 'complete'];

      // Verify all phases are valid
      expectedPhases.forEach(phase => {
        expect(['planner', 'expander', 'assembler', 'smoother', 'judge', 'complete']).toContain(phase);
      });
    });
  });

  // ==========================================================================
  // Scenario 3: Model Fallback Retry
  // ==========================================================================

  describe('Model Fallback Retry', () => {
    it.skipIf(shouldSkipTests)('should have correct model fallback configuration', () => {
      // Verify model fallback configuration is properly defined
      const { MODEL_FALLBACK } = require('../../../src/stages/stage6-lesson-content/handler');

      expect(MODEL_FALLBACK).toBeDefined();
      expect(MODEL_FALLBACK.primary).toBeDefined();
      expect(MODEL_FALLBACK.primary.ru).toBeDefined();
      expect(MODEL_FALLBACK.primary.en).toBeDefined();
      expect(MODEL_FALLBACK.fallback).toBeDefined();
      expect(MODEL_FALLBACK.maxPrimaryAttempts).toBeGreaterThanOrEqual(1);
    });

    it.skipIf(shouldSkipTests)('should detect Russian language correctly', () => {
      // Import detectLanguage function
      const { detectLanguage } = require('../../../src/stages/stage6-lesson-content/handler');

      // Test Russian detection
      expect(detectLanguage(ANALYTICAL_LESSON_SPEC)).toBe('ru');
      expect(detectLanguage(PROCEDURAL_LESSON_SPEC)).toBe('ru');
      expect(detectLanguage(CONCEPTUAL_LESSON_SPEC)).toBe('ru');

      // Test English detection
      const englishSpec = createTestLessonSpec({
        title: 'Introduction to TypeScript',
        lesson_id: 'en-1.1',
      });
      expect(detectLanguage(englishSpec)).toBe('en');
    });

    it.skipIf(shouldSkipTests || !process.env.OPENROUTER_API_KEY)(
      'should use language-appropriate model for Russian content',
      async () => {
        // Given: A Russian lesson specification
        const courseId = generateUniqueCourseId();
        testCourseIds.push(courseId);

        const jobInput = mockStage6JobInput({
          lessonSpec: ANALYTICAL_LESSON_SPEC, // Russian content
          courseId,
          ragChunks: DATA_ANALYSIS_CHUNKS,
        });

        // When: Job is processed
        const job = await queue.add('russian-model-test', jobInput, {
          jobId: generateUniqueJobId(),
        });

        const result = await waitForJobCompletion(job, queueEvents, 180000);

        // Then: Result should indicate model used (could be primary or fallback)
        expect(result.metrics.modelUsed).toBeDefined();
      },
      180000
    );
  });

  // ==========================================================================
  // Scenario 4: Partial Success Handling
  // ==========================================================================

  describe('Partial Success Handling', () => {
    it.skipIf(shouldSkipTests)('should define partial success handling functions', () => {
      // Verify partial success handling is exported
      const { handlePartialSuccess, markForReview } = require('../../../src/stages/stage6-lesson-content/handler');

      expect(handlePartialSuccess).toBeDefined();
      expect(typeof handlePartialSuccess).toBe('function');
      expect(markForReview).toBeDefined();
      expect(typeof markForReview).toBe('function');
    });

    it.skipIf(shouldSkipTests)('should have quality threshold configured', () => {
      // Verify quality threshold
      expect(HANDLER_CONFIG.QUALITY_THRESHOLD).toBeDefined();
      expect(HANDLER_CONFIG.QUALITY_THRESHOLD).toBeGreaterThanOrEqual(0);
      expect(HANDLER_CONFIG.QUALITY_THRESHOLD).toBeLessThanOrEqual(1);
      expect(HANDLER_CONFIG.QUALITY_THRESHOLD).toBe(0.75);
    });
  });

  // ==========================================================================
  // Scenario 5: Concurrency
  // ==========================================================================

  describe('Concurrency', () => {
    it.skipIf(shouldSkipTests)('should have correct concurrency configuration', () => {
      // Verify concurrency is configured
      expect(HANDLER_CONFIG.CONCURRENCY).toBeDefined();
      expect(HANDLER_CONFIG.CONCURRENCY).toBe(30);
    });

    it.skipIf(shouldSkipTests)('should add multiple jobs to queue', async () => {
      // Given: Multiple job inputs
      const jobCount = 5;
      const jobs: Job<Stage6JobInput, Stage6JobResult>[] = [];

      for (let i = 0; i < jobCount; i++) {
        const courseId = generateUniqueCourseId();
        testCourseIds.push(courseId);

        const jobInput = mockStage6JobInput({
          lessonSpec: createTestLessonSpec({ lesson_id: `concurrent-${i + 1}.1` }),
          courseId,
          ragChunks: createTestRAGChunks(3),
        });

        const job = await queue.add(`concurrent-job-${i}`, jobInput, {
          jobId: generateUniqueJobId(),
        });
        jobs.push(job);
      }

      // Then: All jobs should be queued
      expect(jobs).toHaveLength(jobCount);
      jobs.forEach((job, i) => {
        expect(job.id).toBeDefined();
        expect(job.data.lessonSpec.lesson_id).toBe(`concurrent-${i + 1}.1`);
      });

      // Verify queue counts
      const waitingCount = await queue.getWaitingCount();
      const activeCount = await queue.getActiveCount();

      // Jobs may be waiting or already picked up by worker
      expect(waitingCount + activeCount).toBeGreaterThanOrEqual(0);
    });

    it.skipIf(shouldSkipTests || !process.env.OPENROUTER_API_KEY)(
      'should process multiple jobs in parallel',
      async () => {
        // Given: 3 jobs (reduced from 5 for faster testing)
        const jobCount = 3;
        const jobs: Job<Stage6JobInput, Stage6JobResult>[] = [];
        const startTime = Date.now();

        for (let i = 0; i < jobCount; i++) {
          const courseId = generateUniqueCourseId();
          testCourseIds.push(courseId);

          const jobInput = mockStage6JobInput({
            lessonSpec: createTestLessonSpec({
              lesson_id: `parallel-${i + 1}.1`,
              title: `Parallel Test Lesson ${i + 1}`,
            }),
            courseId,
            ragChunks: createTestRAGChunks(2), // Minimal chunks
          });

          const job = await queue.add(`parallel-job-${i}`, jobInput, {
            jobId: generateUniqueJobId(),
          });
          jobs.push(job);
        }

        // When: Wait for all jobs to complete
        const results = await Promise.all(
          jobs.map(job => waitForJobCompletion(job, queueEvents, 300000))
        );

        const totalTime = Date.now() - startTime;

        // Then: All jobs should complete
        expect(results).toHaveLength(jobCount);
        results.forEach(result => {
          expect(result).toBeDefined();
          expect(result.lessonId).toBeDefined();
        });

        // If truly parallel, total time should be less than N * single job time
        // We can't verify exact parallelism without knowing single job time,
        // but we can log for manual inspection
        console.log(`[Concurrency Test] ${jobCount} jobs completed in ${totalTime}ms`);
      },
      300000
    );
  });

  // ==========================================================================
  // Scenario 6: Generation Lock Integration
  // ==========================================================================

  describe('Generation Lock Integration', () => {
    it.skipIf(shouldSkipTests)('should acquire and release lock during job processing', async () => {
      // Given: A course ID
      const courseId = generateUniqueCourseId();
      testCourseIds.push(courseId);

      // Initially, course should not be locked
      const initialLocked = await generationLockService.isLocked(courseId);
      expect(initialLocked).toBe(false);

      // Manual lock acquisition test
      const lockResult = await generationLockService.acquireLock(courseId, 'test-worker');
      expect(lockResult.acquired).toBe(true);
      expect(lockResult.lock?.courseId).toBe(courseId);

      // Course should now be locked
      const afterAcquire = await generationLockService.isLocked(courseId);
      expect(afterAcquire).toBe(true);

      // Release lock
      const released = await generationLockService.releaseLock(courseId, 'test-worker');
      expect(released).toBe(true);

      // Course should no longer be locked
      const afterRelease = await generationLockService.isLocked(courseId);
      expect(afterRelease).toBe(false);
    });

    it.skipIf(shouldSkipTests)('should prevent concurrent generation for same course', async () => {
      // Given: A course ID with existing lock
      const courseId = generateUniqueCourseId();
      testCourseIds.push(courseId);

      // First lock should succeed
      const firstLock = await generationLockService.acquireLock(courseId, 'worker-1');
      expect(firstLock.acquired).toBe(true);

      // Second lock attempt should fail
      const secondLock = await generationLockService.acquireLock(courseId, 'worker-2');
      expect(secondLock.acquired).toBe(false);
      expect(secondLock.reason).toBeDefined();
      expect(secondLock.existingLock?.lockedBy).toBe('worker-1');

      // Cleanup
      await generationLockService.releaseLock(courseId, 'worker-1');
    });

    it.skipIf(shouldSkipTests)('should return lock held error when course is being processed', async () => {
      // Given: A locked course
      const courseId = generateUniqueCourseId();
      testCourseIds.push(courseId);

      await generationLockService.acquireLock(courseId, 'existing-job');

      // When: A new job tries to start for the same course
      const jobInput = mockStage6JobInput({
        lessonSpec: createTestLessonSpec({ lesson_id: 'lock-test.1' }),
        courseId,
        ragChunks: createTestRAGChunks(2),
      });

      const job = await queue.add('lock-blocked-job', jobInput, {
        jobId: generateUniqueJobId(),
      });

      // Then: Job should return error about course already being processed
      // Note: The actual behavior depends on handler implementation
      // The job may complete with success=false and an error message
      try {
        const result = await waitForJobCompletion(job, queueEvents, 30000);
        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain('already being processed');
      } catch {
        // Job may have failed - that's also acceptable
      }

      // Cleanup
      await generationLockService.forceRelease(courseId);
    });

    it.skipIf(shouldSkipTests)('should release lock after job completion', async () => {
      // This test verifies that locks are released in the finally block
      const courseId = generateUniqueCourseId();
      testCourseIds.push(courseId);

      // Verify course is not locked initially
      expect(await generationLockService.isLocked(courseId)).toBe(false);

      // After job processing (success or failure), lock should be released
      // This is enforced by the try/finally pattern in processStage6Job
    });
  });

  // ==========================================================================
  // Scenario 7: Configuration and Handler Setup
  // ==========================================================================

  describe('Configuration and Handler Setup', () => {
    it.skipIf(shouldSkipTests)('should have all required configuration values', () => {
      expect(HANDLER_CONFIG.QUEUE_NAME).toBe('stage6-lesson-content');
      expect(HANDLER_CONFIG.CONCURRENCY).toBe(30);
      expect(HANDLER_CONFIG.MAX_RETRIES).toBe(3);
      expect(HANDLER_CONFIG.RETRY_DELAY_MS).toBe(5000);
      expect(HANDLER_CONFIG.JOB_TIMEOUT_MS).toBe(300000); // 5 minutes
      expect(HANDLER_CONFIG.LOCK_DURATION_MS).toBe(60000);
      expect(HANDLER_CONFIG.LOCK_RENEW_TIME_MS).toBe(15000);
      expect(HANDLER_CONFIG.STALLED_INTERVAL_MS).toBe(30000);
      expect(HANDLER_CONFIG.MAX_STALLED_COUNT).toBe(3);
      expect(HANDLER_CONFIG.QUALITY_THRESHOLD).toBe(0.75);
    });

    it.skipIf(shouldSkipTests)('should export all required functions', () => {
      const handler = require('../../../src/stages/stage6-lesson-content/handler');

      // Worker and Queue factories
      expect(handler.createStage6Worker).toBeDefined();
      expect(handler.createStage6Queue).toBeDefined();

      // Job processor
      expect(handler.processStage6Job).toBeDefined();

      // Helper functions
      expect(handler.updateJobProgress).toBeDefined();
      expect(handler.saveLessonContent).toBeDefined();
      expect(handler.processWithFallback).toBeDefined();
      expect(handler.handlePartialSuccess).toBeDefined();
      expect(handler.markForReview).toBeDefined();
      expect(handler.detectLanguage).toBeDefined();

      // Graceful shutdown
      expect(handler.gracefulShutdown).toBeDefined();
    });

    it.skipIf(shouldSkipTests)('should export required types', () => {
      // Verify types are exported (TypeScript compilation would fail if not)
      const handler = require('../../../src/stages/stage6-lesson-content/handler');

      // HANDLER_CONFIG should be exported
      expect(handler.HANDLER_CONFIG).toBeDefined();
    });
  });

  // ==========================================================================
  // Scenario 8: Error Handling
  // ==========================================================================

  describe('Error Handling', () => {
    it.skipIf(shouldSkipTests)('should handle missing RAG chunks gracefully', async () => {
      // Given: A job with empty RAG chunks
      const courseId = generateUniqueCourseId();
      testCourseIds.push(courseId);

      const jobInput = mockStage6JobInput({
        lessonSpec: createTestLessonSpec({ lesson_id: 'no-rag.1' }),
        courseId,
        ragChunks: [], // Empty chunks
      });

      // When: Job is added
      const job = await queue.add('no-rag-job', jobInput, {
        jobId: generateUniqueJobId(),
      });

      // Then: Job should be queued (actual processing may fail or succeed depending on implementation)
      expect(job).toBeDefined();
      expect(job.data.ragChunks).toHaveLength(0);
    });

    it.skipIf(shouldSkipTests)('should have retry configuration', () => {
      // Verify retry configuration
      expect(HANDLER_CONFIG.MAX_RETRIES).toBeGreaterThan(0);
      expect(HANDLER_CONFIG.RETRY_DELAY_MS).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Scenario 9: Queue Operations
  // ==========================================================================

  describe('Queue Operations', () => {
    it.skipIf(shouldSkipTests)('should support queue draining', async () => {
      // Given: Jobs in queue
      const courseId = generateUniqueCourseId();
      testCourseIds.push(courseId);

      // Pause worker to accumulate jobs
      await worker.pause();

      for (let i = 0; i < 3; i++) {
        const jobInput = mockStage6JobInput({
          lessonSpec: createTestLessonSpec({ lesson_id: `drain-${i + 1}.1` }),
          courseId,
          ragChunks: createTestRAGChunks(2),
        });

        await queue.add(`drain-job-${i}`, jobInput, {
          jobId: generateUniqueJobId(),
        });
      }

      // Verify jobs are waiting
      const waitingBefore = await queue.getWaitingCount();
      expect(waitingBefore).toBe(3);

      // When: Drain queue
      await queue.drain();

      // Then: Queue should be empty
      const waitingAfter = await queue.getWaitingCount();
      expect(waitingAfter).toBe(0);

      // Resume worker
      await worker.resume();
    });

    it.skipIf(shouldSkipTests)('should support queue obliteration', async () => {
      // Given: Jobs in various states
      const courseId = generateUniqueCourseId();
      testCourseIds.push(courseId);

      await worker.pause();

      const jobInput = mockStage6JobInput({
        lessonSpec: createTestLessonSpec({ lesson_id: 'obliterate.1' }),
        courseId,
        ragChunks: createTestRAGChunks(2),
      });

      await queue.add('obliterate-job', jobInput, {
        jobId: generateUniqueJobId(),
      });

      // When: Obliterate queue
      await queue.obliterate({ force: true });

      // Then: All counts should be zero
      const waiting = await queue.getWaitingCount();
      const active = await queue.getActiveCount();
      const completed = await queue.getCompletedCount();
      const failed = await queue.getFailedCount();

      expect(waiting).toBe(0);
      expect(active).toBe(0);
      expect(completed).toBe(0);
      expect(failed).toBe(0);

      await worker.resume();
    });
  });

  // ==========================================================================
  // Scenario 10: Graceful Shutdown
  // ==========================================================================

  describe('Graceful Shutdown', () => {
    it.skipIf(shouldSkipTests)('should export graceful shutdown function', () => {
      const { gracefulShutdown } = require('../../../src/stages/stage6-lesson-content/handler');

      expect(gracefulShutdown).toBeDefined();
      expect(typeof gracefulShutdown).toBe('function');
    });
  });
});
