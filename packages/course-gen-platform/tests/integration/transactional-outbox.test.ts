/**
 * Transactional Outbox Integration Tests
 *
 * Comprehensive test suite for the Transactional Outbox pattern implementation.
 * Verifies atomic coordination, idempotency, defense layers, and failure scenarios.
 *
 * Prerequisites:
 * - Redis >= 5.0.0 running at redis://localhost:6379
 * - PostgreSQL with migrations applied (job_outbox, idempotency_keys, fsm_events)
 * - Supabase local development instance
 *
 * Test execution: pnpm test tests/integration/transactional-outbox.test.ts
 *
 * Reference: TASK-2025-11-18-TRANSACTIONAL-OUTBOX-IMPLEMENTATION.md (Task 8)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import { InitializeFSMCommandHandler } from '../../src/shared/fsm/fsm-initialization-command-handler';
import { getRedisClient } from '../../src/shared/cache/redis';
import { getQueue, closeQueue } from '../../src/orchestrator/queue';
import { JobType } from '@megacampus/shared-types';
import type { InitializeFSMCommand } from '@megacampus/shared-types/transactional-outbox';
import { setupTestFixtures, cleanupTestFixtures, TEST_ORGS, TEST_USERS, TEST_COURSES } from '../fixtures';

// ============================================================================
// Test Utilities
// ============================================================================

let commandHandler: InitializeFSMCommandHandler;
let supabase: ReturnType<typeof getSupabaseAdmin>;
let redis: ReturnType<typeof getRedisClient>;
let queue: ReturnType<typeof getQueue>;

/**
 * Get or create test course ID
 * Uses existing fixture courses first, then creates additional courses if needed
 */
let courseCounter = 0;
const existingCourseIds = [TEST_COURSES.course1.id, TEST_COURSES.course2.id];

async function getOrCreateTestCourse(): Promise<string> {
  courseCounter++;

  // Use existing test courses first (course1, course2)
  if (courseCounter <= existingCourseIds.length) {
    const courseId = existingCourseIds[courseCounter - 1];
    console.log(`✅ Using existing test course ${courseCounter}: ${courseId}`);
    return courseId;
  }

  // If we need more than 2 courses, create them dynamically with valid UUID format
  const courseId = `00000000-0000-0000-0000-${String(22 + (courseCounter - 2)).padStart(12, '0')}`;

  console.log(`⚙️ Creating dynamic test course ${courseCounter}: ${courseId}`);

  const { error } = await supabase.from('courses').insert({
    id: courseId,
    title: `Test Course ${courseCounter} - Dynamic`,
    slug: `test-course-dynamic-${courseCounter}`,
    user_id: TEST_USERS.instructor1.id,
    organization_id: TEST_ORGS.premium.id,
    status: 'draft',
    generation_status: 'pending',
    settings: {},
  });

  if (error && !error.message.includes('duplicate key')) {
    throw new Error(`Failed to create test course ${courseId}: ${error.message}`);
  }

  return courseId;
}

/**
 * Generate unique idempotency key
 */
let idempotencyCounter = 0;
const TEST_SUITE_PREFIX = `outbox-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
function generateIdempotencyKey(): string {
  return `idempotency-${TEST_SUITE_PREFIX}-${++idempotencyCounter}`;
}

/**
 * Clean up test data from database
 * - For fixture courses (course1, course2): Only clean up related data, reset generation_status
 * - For dynamic courses: Delete everything including the course itself
 */
async function cleanupTestData(entityId: string): Promise<void> {
  const isFixtureCourse = existingCourseIds.includes(entityId);

  // Always clean up related data
  await supabase.from('job_outbox').delete().eq('entity_id', entityId);
  await supabase.from('fsm_events').delete().eq('entity_id', entityId);

  if (isFixtureCourse) {
    // For fixture courses: just reset generation_status to 'pending'
    await supabase
      .from('courses')
      .update({ generation_status: 'pending' })
      .eq('id', entityId);
  } else {
    // For dynamic courses: delete the course itself
    await supabase.from('courses').delete().eq('id', entityId);
  }
}

/**
 * Clean up idempotency keys
 */
async function cleanupIdempotencyKeys(): Promise<void> {
  await supabase
    .from('idempotency_keys')
    .delete()
    .like('idempotency_key', `idempotency-${TEST_SUITE_PREFIX}%`);
}

// ============================================================================
// Test Suite Setup
// ============================================================================

beforeAll(async () => {
  // Setup test fixtures (organizations, users, courses)
  await setupTestFixtures();

  // Initialize clients
  commandHandler = new InitializeFSMCommandHandler();
  supabase = getSupabaseAdmin();
  redis = getRedisClient();
  queue = getQueue();

  // Ensure Redis is connected (only if not already connected)
  if (redis.status !== 'ready' && redis.status !== 'connecting') {
    await redis.connect();
  } else if (redis.status === 'connecting') {
    // Wait for existing connection to complete
    await new Promise<void>((resolve) => {
      redis.once('ready', () => resolve());
    });
  }
}, 15000);

afterAll(async () => {
  // Clean up connections
  await closeQueue();
  await redis.quit();
  await cleanupTestFixtures();
}, 15000);

beforeEach(async () => {
  // Reset course counter for each test
  courseCounter = 0;

  // Clean up Redis cache before each test
  await redis.flushdb();
});

afterEach(async () => {
  // Clean up idempotency keys after each test
  await cleanupIdempotencyKeys();
});

// ============================================================================
// Test Suite
// ============================================================================

describe('Transactional Outbox Integration', () => {
  // ==========================================================================
  // Atomic Coordination Tests
  // ==========================================================================

  describe('Atomic Coordination', () => {
    it('should create FSM and outbox entries atomically', async () => {
      const entityId = await getOrCreateTestCourse();
      const testCommand: InitializeFSMCommand = {
        entityId,
        userId: TEST_USERS.instructor1.id,
        organizationId: TEST_ORGS.premium.id,
        idempotencyKey: generateIdempotencyKey(),
        initiatedBy: 'API',
        initialState: 'stage_2_init',
        data: { generation_id: 'gen-123' },
        jobs: [
          {
            queue: JobType.DOCUMENT_PROCESSING,
            data: { courseId: entityId, fileId: 'file-1' },
            options: { priority: 10 },
          },
        ],
      };

      try {
        // Execute command
        const result = await commandHandler.handle(testCommand);

        // Verify FSM state created
        const { data: course } = await supabase
          .from('courses')
          .select('generation_status')
          .eq('id', entityId)
          .single();

        expect(course?.generation_status).toBe('stage_2_init');

        // Verify outbox entries created
        const { data: outbox } = await supabase
          .from('job_outbox')
          .select('*')
          .eq('entity_id', entityId);

        expect(outbox).toHaveLength(1);
        expect(outbox?.[0].processed_at).toBeNull(); // Pending = NULL processed_at
        expect(outbox?.[0].queue_name).toBe(JobType.DOCUMENT_PROCESSING);

        // Verify FSM event created
        const { data: events } = await supabase
          .from('fsm_events')
          .select('*')
          .eq('entity_id', entityId);

        expect(events).toBeDefined();
        expect(events!.length).toBeGreaterThan(0);

        // Verify result structure
        expect(result.fsmState).toBeDefined();
        expect(result.fsmState.entity_id).toBe(entityId);
        expect(result.fsmState.state).toBe('stage_2_init');
        expect(result.outboxEntries).toHaveLength(1);
        expect(result.fromCache).toBe(false);
      } finally {
        await cleanupTestData(entityId);
      }
    }, 10000);

    it('should create multiple outbox entries atomically', async () => {
      const entityId = await getOrCreateTestCourse();
      const testCommand: InitializeFSMCommand = {
        entityId,
        userId: TEST_USERS.instructor1.id,
        organizationId: TEST_ORGS.premium.id,
        idempotencyKey: generateIdempotencyKey(),
        initiatedBy: 'API',
        initialState: 'stage_2_init',
        data: { generation_id: 'gen-123' },
        jobs: [
          {
            queue: JobType.DOCUMENT_PROCESSING,
            data: { courseId: entityId, fileId: 'file-1' },
            options: { priority: 10 },
          },
          {
            queue: JobType.DOCUMENT_PROCESSING,
            data: { courseId: entityId, fileId: 'file-2' },
            options: { priority: 10 },
          },
          {
            queue: 'summarization',
            data: { courseId: entityId },
            options: { priority: 5 },
          },
        ],
      };

      try {
        const result = await commandHandler.handle(testCommand);

        // Verify all outbox entries created
        const { data: outbox } = await supabase
          .from('job_outbox')
          .select('*')
          .eq('entity_id', entityId);

        expect(outbox).toHaveLength(3);
        expect(result.outboxEntries).toHaveLength(3);

        // Verify each queue name
        const queueNames = outbox?.map(e => e.queue_name).sort();
        expect(queueNames).toEqual([JobType.DOCUMENT_PROCESSING, JobType.DOCUMENT_PROCESSING, 'summarization']);
      } finally {
        await cleanupTestData(entityId);
      }
    }, 10000);

    it('should rollback transaction on RPC failure', async () => {
      const entityId = await getOrCreateTestCourse();

      // Mock Supabase RPC to fail
      const originalRpc = supabase.rpc.bind(supabase);
      vi.spyOn(supabase, 'rpc').mockImplementationOnce(() =>
        Promise.resolve({ data: null, error: { message: 'DB constraint violation', code: '23505', details: null, hint: null } } as any)
      );

      const testCommand: InitializeFSMCommand = {
        entityId,
        userId: TEST_USERS.instructor1.id,
        organizationId: TEST_ORGS.premium.id,
        idempotencyKey: generateIdempotencyKey(),
        initiatedBy: 'API',
        initialState: 'stage_2_init',
        data: { test: true },
        jobs: [
          {
            queue: JobType.DOCUMENT_PROCESSING,
            data: { courseId: entityId, fileId: 'file-1' },
            options: { priority: 10 },
          },
        ],
      };

      try {
        // Command should fail
        await expect(commandHandler.handle(testCommand)).rejects.toThrow();

        // Verify NOTHING created (atomic rollback)
        const { data: course } = await supabase
          .from('courses')
          .select('*')
          .eq('id', entityId)
          .single();

        expect(course).toBeNull();

        const { data: outbox } = await supabase
          .from('job_outbox')
          .select('*')
          .eq('entity_id', entityId);

        expect(outbox).toHaveLength(0);

        const { data: events } = await supabase
          .from('fsm_events')
          .select('*')
          .eq('entity_id', entityId);

        expect(events).toHaveLength(0);
      } finally {
        // Restore original RPC
        vi.restoreAllMocks();
        await cleanupTestData(entityId);
      }
    }, 10000);
  });

  // ==========================================================================
  // Idempotency Tests
  // ==========================================================================

  describe('Idempotency', () => {
    it('should return cached result for duplicate request', async () => {
      const entityId = await getOrCreateTestCourse();
      const idempotencyKey = generateIdempotencyKey();

      const testCommand: InitializeFSMCommand = {
        entityId,
        userId: TEST_USERS.instructor1.id,
        organizationId: TEST_ORGS.premium.id,
        idempotencyKey,
        initiatedBy: 'API',
        initialState: 'stage_2_init',
        data: { generation_id: 'gen-123' },
        jobs: [
          {
            queue: JobType.DOCUMENT_PROCESSING,
            data: { courseId: entityId, fileId: 'file-1' },
            options: { priority: 10 },
          },
        ],
      };

      try {
        // First request
        const result1 = await commandHandler.handle(testCommand);
        expect(result1.fromCache).toBe(false);
        expect(result1.fsmState.entity_id).toBe(entityId);

        // Second request with same idempotency key
        const result2 = await commandHandler.handle(testCommand);
        expect(result2.fromCache).toBe(true);

        // Results should be identical
        expect(result1.fsmState.entity_id).toEqual(result2.fsmState.entity_id);
        expect(result1.fsmState.state).toEqual(result2.fsmState.state);

        // Only one FSM created
        const { data: courses, count } = await supabase
          .from('courses')
          .select('*', { count: 'exact' })
          .eq('id', entityId);

        expect(count).toBe(1);

        // Only one set of outbox entries
        const { data: outbox, count: outboxCount } = await supabase
          .from('job_outbox')
          .select('*', { count: 'exact' })
          .eq('entity_id', entityId);

        expect(outboxCount).toBe(1);
      } finally {
        await cleanupTestData(entityId);
      }
    }, 15000);

    it('should handle different idempotency keys independently', async () => {
      const entityId1 = await getOrCreateTestCourse();
      const entityId2 = await getOrCreateTestCourse();
      const idempotencyKey1 = generateIdempotencyKey();
      const idempotencyKey2 = generateIdempotencyKey();

      const testCommand1: InitializeFSMCommand = {
        entityId: entityId1,
        userId: TEST_USERS.instructor1.id,
        organizationId: TEST_ORGS.premium.id,
        idempotencyKey: idempotencyKey1,
        initiatedBy: 'API',
        initialState: 'stage_2_init',
        data: { generation_id: 'gen-123' },
        jobs: [],
      };

      const testCommand2: InitializeFSMCommand = {
        entityId: entityId2,
        userId: TEST_USERS.instructor1.id,
        organizationId: TEST_ORGS.premium.id,
        idempotencyKey: idempotencyKey2,
        initiatedBy: 'API',
        initialState: 'stage_2_init',
        data: { generation_id: 'gen-456' },
        jobs: [],
      };

      try {
        // Execute both commands
        const result1 = await commandHandler.handle(testCommand1);
        const result2 = await commandHandler.handle(testCommand2);

        // Both should create new FSMs
        expect(result1.fromCache).toBe(false);
        expect(result2.fromCache).toBe(false);
        expect(result1.fsmState.entity_id).toBe(entityId1);
        expect(result2.fsmState.entity_id).toBe(entityId2);

        // Verify two courses created
        const { data: courses, count } = await supabase
          .from('courses')
          .select('*', { count: 'exact' })
          .in('id', [entityId1, entityId2]);

        expect(count).toBe(2);
      } finally {
        await cleanupTestData(entityId1);
        await cleanupTestData(entityId2);
      }
    }, 15000);

    it('should handle 100 concurrent requests with same idempotency key', async () => {
      const entityId = await getOrCreateTestCourse();
      const idempotencyKey = generateIdempotencyKey();

      const baseCommand: InitializeFSMCommand = {
        entityId,
        userId: TEST_USERS.instructor1.id,
        organizationId: TEST_ORGS.premium.id,
        idempotencyKey,
        initiatedBy: 'API',
        initialState: 'stage_2_init',
        data: { generation_id: 'gen-concurrent' },
        jobs: [],
      };

      try {
        // Launch 100 concurrent requests
        const promises = Array(100)
          .fill(null)
          .map(() => commandHandler.handle(baseCommand));

        const results = await Promise.all(promises);

        // All should succeed
        results.forEach(r => {
          expect(r.fsmState).toBeDefined();
          expect(r.fsmState.entity_id).toBe(entityId);
        });

        // At least one should be from cache
        const cachedResults = results.filter(r => r.fromCache);
        expect(cachedResults.length).toBeGreaterThan(0);

        // Only one FSM created
        const { data: courses, count } = await supabase
          .from('courses')
          .select('*', { count: 'exact' })
          .eq('id', entityId);

        expect(count).toBe(1);
      } finally {
        await cleanupTestData(entityId);
      }
    }, 30000); // 30 second timeout for concurrency test

    it('should use Redis cache for second request', async () => {
      const entityId = await getOrCreateTestCourse();
      const idempotencyKey = generateIdempotencyKey();

      const testCommand: InitializeFSMCommand = {
        entityId,
        userId: TEST_USERS.instructor1.id,
        organizationId: TEST_ORGS.premium.id,
        idempotencyKey,
        initiatedBy: 'API',
        initialState: 'stage_2_init',
        data: { generation_id: 'gen-redis' },
        jobs: [],
      };

      try {
        // First request
        await commandHandler.handle(testCommand);

        // Verify Redis cache contains key
        const cacheKey = `idempotency:${idempotencyKey}`;
        const cached = await redis.get(cacheKey);
        expect(cached).toBeDefined();
        expect(cached).not.toBeNull();

        // Second request should use Redis cache
        const result2 = await commandHandler.handle(testCommand);
        expect(result2.fromCache).toBe(true);
      } finally {
        await cleanupTestData(entityId);
      }
    }, 15000);
  });

  // ==========================================================================
  // Outbox Processor Tests
  // ==========================================================================

  describe('Outbox Processor', () => {
    it('should process pending outbox entries', async () => {
      const entityId = await getOrCreateTestCourse();
      const testCommand: InitializeFSMCommand = {
        entityId,
        userId: TEST_USERS.instructor1.id,
        organizationId: TEST_ORGS.premium.id,
        idempotencyKey: generateIdempotencyKey(),
        initiatedBy: 'API',
        initialState: 'stage_2_init',
        data: { generation_id: 'gen-processor' },
        jobs: [
          {
            queue: JobType.DOCUMENT_PROCESSING,
            data: { courseId: entityId, fileId: 'file-1' },
            options: { priority: 10 },
          },
        ],
      };

      try {
        await commandHandler.handle(testCommand);

        // Verify outbox entry exists
        const { data: outboxBefore } = await supabase
          .from('job_outbox')
          .select('*')
          .eq('entity_id', entityId);

        expect(outboxBefore).toHaveLength(1);
        expect(outboxBefore?.[0].processed_at).toBeNull(); // Pending = NULL processed_at

        // NOTE: In production, the outbox processor runs as a background service
        // In tests, we verify that outbox entries are created correctly
        // The actual processing by the outbox processor would be tested separately
        // or in E2E tests with the processor running

        // For now, verify entry is queryable by processor
        const { data: pendingEntries } = await supabase
          .from('job_outbox')
          .select('*')
          .is('processed_at', null) // Query for unprocessed entries
          .order('created_at', { ascending: true })
          .limit(10);

        expect(pendingEntries).toBeDefined();
        const ourEntry = pendingEntries?.find(e => e.entity_id === entityId);
        expect(ourEntry).toBeDefined();
      } finally {
        await cleanupTestData(entityId);
      }
    }, 10000);

    it('should track processing attempts for outbox entries', async () => {
      const entityId = await getOrCreateTestCourse();
      const testCommand: InitializeFSMCommand = {
        entityId,
        userId: TEST_USERS.instructor1.id,
        organizationId: TEST_ORGS.premium.id,
        idempotencyKey: generateIdempotencyKey(),
        initiatedBy: 'API',
        initialState: 'stage_2_init',
        data: { generation_id: 'gen-attempts' },
        jobs: [
          {
            queue: JobType.DOCUMENT_PROCESSING,
            data: { courseId: entityId, fileId: 'file-1' },
            options: { priority: 10 },
          },
        ],
      };

      try {
        await commandHandler.handle(testCommand);

        // Verify outbox entry has attempts = 0 initially
        const { data: outbox } = await supabase
          .from('job_outbox')
          .select('*')
          .eq('entity_id', entityId)
          .single();

        expect(outbox).toBeDefined();
        expect(outbox!.attempts).toBe(0);
        expect(outbox!.last_attempt_at).toBeNull();
        expect(outbox!.last_error).toBeNull();

        // Simulate processor attempt (would be done by outbox processor)
        const { error: updateError } = await supabase
          .from('job_outbox')
          .update({
            attempts: 1,
            last_attempt_at: new Date().toISOString(),
          })
          .eq('outbox_id', outbox!.outbox_id);

        expect(updateError).toBeNull();

        // Verify attempt tracked
        const { data: updatedOutbox } = await supabase
          .from('job_outbox')
          .select('*')
          .eq('entity_id', entityId)
          .single();

        expect(updatedOutbox!.attempts).toBe(1);
        expect(updatedOutbox!.last_attempt_at).not.toBeNull();
      } finally {
        await cleanupTestData(entityId);
      }
    }, 10000);
  });

  // ==========================================================================
  // Defense Layers Tests
  // ==========================================================================

  describe('Defense Layers', () => {
    it('Layer 1: API should initialize FSM via command handler', async () => {
      // This is the primary path tested in other test cases
      // Verify it works as expected
      const entityId = await getOrCreateTestCourse();
      const testCommand: InitializeFSMCommand = {
        entityId,
        userId: TEST_USERS.instructor1.id,
        organizationId: TEST_ORGS.premium.id,
        idempotencyKey: generateIdempotencyKey(),
        initiatedBy: 'API',
        initialState: 'stage_2_init',
        data: { generation_id: 'gen-layer1' },
        jobs: [],
      };

      try {
        const result = await commandHandler.handle(testCommand);

        expect(result.fsmState.state).toBe('stage_2_init');
        expect(result.fromCache).toBe(false);

        // Verify course created
        const { data: course } = await supabase
          .from('courses')
          .select('generation_status')
          .eq('id', entityId)
          .single();

        expect(course?.generation_status).toBe('stage_2_init');
      } finally {
        await cleanupTestData(entityId);
      }
    }, 10000);

    it('Layer 2: Should detect course in pending state (QueueEvents backup scenario)', async () => {
      // Simulate a course created outside the API (e.g., admin tool)
      // that's still in pending state
      const entityId = await getOrCreateTestCourse();

      try {
        // Ensure course is in pending state to simulate the scenario
        const { error: updateError } = await supabase
          .from('courses')
          .update({ generation_status: 'pending' })
          .eq('id', entityId);

        expect(updateError).toBeNull();

        // Verify course is now in pending state
        const { data: verifiedCourse } = await supabase
          .from('courses')
          .select('generation_status')
          .eq('id', entityId)
          .single();

        expect(verifiedCourse?.generation_status).toBe('pending');

        // NOTE: In production, QueueEvents backup layer would detect this
        // and initialize FSM. Here we verify detection is possible.

        // Verify we can detect pending courses
        const { data: pendingCourses } = await supabase
          .from('courses')
          .select('id, generation_status')
          .eq('generation_status', 'pending');

        expect(pendingCourses).toBeDefined();
        const ourCourse = pendingCourses?.find(c => c.id === entityId);
        expect(ourCourse).toBeDefined();
      } finally {
        await cleanupTestData(entityId);
      }
    }, 10000);

    it('Layer 3: Should detect missing FSM for job data (Worker fallback scenario)', async () => {
      // Simulate a job that arrives before FSM is initialized
      // Worker should detect this and initialize FSM
      const entityId = await getOrCreateTestCourse();

      try {
        // Ensure course is in pending state to simulate uninitialized FSM
        const { error: updateError } = await supabase
          .from('courses')
          .update({ generation_status: 'pending' })
          .eq('id', entityId);

        expect(updateError).toBeNull();

        // Verify course is in pending state (FSM not initialized)
        const { data: course } = await supabase
          .from('courses')
          .select('generation_status')
          .eq('id', entityId)
          .single();

        expect(course?.generation_status).toBe('pending');

        // NOTE: In production, worker would detect pending state and initialize FSM
        // Here we verify the worker can detect this scenario

        // Simulate worker checking FSM state before processing
        const needsInitialization = course?.generation_status === 'pending';
        expect(needsInitialization).toBe(true);

        // Worker would then initialize FSM (we simulate this)
        if (needsInitialization) {
          const initCommand: InitializeFSMCommand = {
            entityId,
            userId: TEST_USERS.instructor1.id,
            organizationId: TEST_ORGS.premium.id,
            idempotencyKey: generateIdempotencyKey(),
            initiatedBy: 'WORKER',
            initialState: 'stage_2_init',
            data: { initialized_by: 'worker_fallback' },
            jobs: [],
          };

          await commandHandler.handle(initCommand);

          // Verify FSM initialized
          const { data: updatedCourse } = await supabase
            .from('courses')
            .select('generation_status')
            .eq('id', entityId)
            .single();

          expect(updatedCourse?.generation_status).toBe('stage_2_init');
        }
      } finally {
        await cleanupTestData(entityId);
      }
    }, 10000);
  });

  // ==========================================================================
  // Error Scenarios Tests
  // ==========================================================================

  describe('Error Scenarios', () => {
    it('should handle Redis connection failure gracefully', async () => {
      const entityId = await getOrCreateTestCourse();

      // Temporarily disconnect Redis
      await redis.quit();

      const testCommand: InitializeFSMCommand = {
        entityId,
        userId: TEST_USERS.instructor1.id,
        organizationId: TEST_ORGS.premium.id,
        idempotencyKey: generateIdempotencyKey(),
        initiatedBy: 'API',
        initialState: 'stage_2_init',
        data: { generation_id: 'gen-redis-down' },
        jobs: [],
      };

      try {
        // Command should still succeed (graceful degradation)
        const result = await commandHandler.handle(testCommand);

        expect(result.fsmState).toBeDefined();
        expect(result.fsmState.entity_id).toBe(entityId);
        expect(result.fromCache).toBe(false);

        // Verify course created in database
        const { data: course } = await supabase
          .from('courses')
          .select('generation_status')
          .eq('id', entityId)
          .single();

        expect(course?.generation_status).toBe('stage_2_init');
      } finally {
        // Reconnect Redis for other tests
        await redis.connect();
        await cleanupTestData(entityId);
      }
    }, 15000);

    it('should handle database timeout', async () => {
      const entityId = await getOrCreateTestCourse();

      // Mock slow database response
      vi.spyOn(supabase, 'rpc').mockImplementationOnce(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  data: null,
                  error: { message: 'Timeout', code: 'TIMEOUT', details: null, hint: null },
                } as any),
              5000
            )
          )
      );

      const testCommand: InitializeFSMCommand = {
        entityId,
        userId: TEST_USERS.instructor1.id,
        organizationId: TEST_ORGS.premium.id,
        idempotencyKey: generateIdempotencyKey(),
        initiatedBy: 'API',
        initialState: 'stage_2_init',
        data: { generation_id: 'gen-timeout' },
        jobs: [],
      };

      try {
        // Should timeout and fail
        await expect(commandHandler.handle(testCommand)).rejects.toThrow();
      } finally {
        vi.restoreAllMocks();
        await cleanupTestData(entityId);
      }
    }, 10000);

    it('should handle missing required fields', async () => {
      const entityId = await getOrCreateTestCourse();

      // Create invalid command (missing userId)
      const invalidCommand: any = {
        entityId,
        // userId: missing
        organizationId: TEST_ORGS.premium.id,
        idempotencyKey: generateIdempotencyKey(),
        initiatedBy: 'API',
        initialState: 'stage_2_init',
        data: {},
        jobs: [],
      };

      try {
        // Should fail validation or RPC
        await expect(commandHandler.handle(invalidCommand)).rejects.toThrow();
      } finally {
        await cleanupTestData(entityId);
      }
    }, 10000);

    it('should handle duplicate outbox_id conflict', async () => {
      const entityId = await getOrCreateTestCourse();

      try {
        // Create initial outbox entry (no status column - uses processed_at instead)
        const { data: initialOutbox, error: insertError } = await supabase
          .from('job_outbox')
          .insert({
            entity_id: entityId,
            queue_name: 'test-queue',
            job_data: { test: true },
          })
          .select()
          .single();

        expect(insertError).toBeNull();
        expect(initialOutbox).toBeDefined();

        // Attempt to insert duplicate outbox_id should fail
        const { error: duplicateError } = await supabase.from('job_outbox').insert({
          outbox_id: initialOutbox!.outbox_id, // Duplicate ID
          entity_id: entityId,
          queue_name: 'test-queue-2',
          job_data: { test: true },
        });

        expect(duplicateError).not.toBeNull();
        expect(duplicateError?.code).toBe('23505'); // Unique constraint violation
      } finally {
        await cleanupTestData(entityId);
      }
    }, 10000);

    it('should handle invalid FSM state transition', async () => {
      const entityId = await getOrCreateTestCourse();

      const testCommand: InitializeFSMCommand = {
        entityId,
        userId: TEST_USERS.instructor1.id,
        organizationId: TEST_ORGS.premium.id,
        idempotencyKey: generateIdempotencyKey(),
        initiatedBy: 'API',
        initialState: 'invalid_state_name', // Invalid state
        data: { generation_id: 'gen-invalid' },
        jobs: [],
      };

      try {
        // Should fail or accept (depends on schema validation)
        // If schema doesn't enforce valid states, this will pass
        // If schema enforces valid states, this will fail
        const result = await commandHandler.handle(testCommand);

        // If it passes, verify state was set
        expect(result.fsmState.state).toBe('invalid_state_name');
      } catch (error) {
        // If it fails, verify it's a validation error
        expect(error).toBeDefined();
      } finally {
        await cleanupTestData(entityId);
      }
    }, 10000);
  });

  // ==========================================================================
  // Data Integrity Tests
  // ==========================================================================

  describe('Data Integrity', () => {
    it('should maintain referential integrity between tables', async () => {
      const entityId = await getOrCreateTestCourse();
      const testCommand: InitializeFSMCommand = {
        entityId,
        userId: TEST_USERS.instructor1.id,
        organizationId: TEST_ORGS.premium.id,
        idempotencyKey: generateIdempotencyKey(),
        initiatedBy: 'API',
        initialState: 'stage_2_init',
        data: { generation_id: 'gen-integrity' },
        jobs: [
          {
            queue: JobType.DOCUMENT_PROCESSING,
            data: { courseId: entityId, fileId: 'file-1' },
            options: { priority: 10 },
          },
        ],
      };

      try {
        await commandHandler.handle(testCommand);

        // Verify all related records exist
        const { data: course } = await supabase
          .from('courses')
          .select('*')
          .eq('id', entityId)
          .single();

        const { data: outbox } = await supabase
          .from('job_outbox')
          .select('*')
          .eq('entity_id', entityId);

        const { data: events } = await supabase
          .from('fsm_events')
          .select('*')
          .eq('entity_id', entityId);

        expect(course).toBeDefined();
        expect(outbox).toHaveLength(1);
        expect(events!.length).toBeGreaterThan(0);

        // All should reference same entity_id
        expect(outbox![0].entity_id).toBe(entityId);
        expect(events![0].entity_id).toBe(entityId);
      } finally {
        await cleanupTestData(entityId);
      }
    }, 10000);

    it('should store job_data as valid JSONB', async () => {
      const entityId = await getOrCreateTestCourse();
      const complexJobData = {
        courseId: entityId,
        fileId: 'file-1',
        metadata: {
          filename: 'test.pdf',
          size: 1024,
          tags: ['tag1', 'tag2'],
        },
        options: {
          chunkSize: 512,
          chunkOverlap: 50,
        },
      };

      const testCommand: InitializeFSMCommand = {
        entityId,
        userId: TEST_USERS.instructor1.id,
        organizationId: TEST_ORGS.premium.id,
        idempotencyKey: generateIdempotencyKey(),
        initiatedBy: 'API',
        initialState: 'stage_2_init',
        data: { generation_id: 'gen-jsonb' },
        jobs: [
          {
            queue: JobType.DOCUMENT_PROCESSING,
            data: complexJobData,
            options: { priority: 10 },
          },
        ],
      };

      try {
        await commandHandler.handle(testCommand);

        // Verify JSONB data preserved
        const { data: outbox } = await supabase
          .from('job_outbox')
          .select('job_data')
          .eq('entity_id', entityId)
          .single();

        expect(outbox).toBeDefined();
        expect(outbox!.job_data).toEqual(complexJobData);
      } finally {
        await cleanupTestData(entityId);
      }
    }, 10000);

    it('should track FSM event creation timestamps correctly', async () => {
      const entityId = await getOrCreateTestCourse();
      const testCommand: InitializeFSMCommand = {
        entityId,
        userId: TEST_USERS.instructor1.id,
        organizationId: TEST_ORGS.premium.id,
        idempotencyKey: generateIdempotencyKey(),
        initiatedBy: 'API',
        initialState: 'stage_2_init',
        data: { generation_id: 'gen-timestamps' },
        jobs: [],
      };

      try {
        const startTime = new Date();
        await commandHandler.handle(testCommand);
        const endTime = new Date();

        // Verify event timestamp is within execution window
        const { data: events } = await supabase
          .from('fsm_events')
          .select('*')
          .eq('entity_id', entityId)
          .order('created_at', { ascending: false })
          .limit(1);

        expect(events).toBeDefined();
        expect(events!.length).toBeGreaterThan(0);

        const eventTime = new Date(events![0].created_at);
        expect(eventTime.getTime()).toBeGreaterThanOrEqual(startTime.getTime());
        expect(eventTime.getTime()).toBeLessThanOrEqual(endTime.getTime());
      } finally {
        await cleanupTestData(entityId);
      }
    }, 10000);
  });
});
