/**
 * E2E Test: Metrics tRPC API
 * @module tests/e2e/metrics-api
 *
 * Test Objective: Validate the metrics tRPC endpoints for system monitoring
 * and observability.
 *
 * Test Coverage:
 * - Public metrics endpoints (FSM, outbox, fallbacks, health)
 * - Protected metrics endpoints (course metrics, course cost)
 * - Admin-only metrics endpoints (aggregated metrics, stage performance, total cost)
 *
 * The metrics router provides:
 * - Public endpoints for Prometheus/Grafana (no auth required)
 * - Protected endpoints for authenticated users (require valid JWT)
 * - Admin endpoints for system-wide visibility (require admin role)
 *
 * Prerequisites:
 * - Supabase database accessible
 * - Redis running (for BullMQ metrics)
 * - Test fixtures created
 *
 * Test execution: pnpm test tests/e2e/metrics-api.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../src/server/app-router';
import {
  setupTestFixtures,
  cleanupTestFixtures,
  cleanupTestJobs,
  setupStage6TestCourse,
  cleanupStage6TestData,
  TEST_USERS,
  TEST_ORGS,
  TEST_AUTH_USERS,
} from '../fixtures';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import { stageMetricsCollector } from '../../src/shared/metrics/stage-metrics';
import { costTracker } from '../../src/shared/metrics/cost-tracker';
import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from '../../src/server/app-router';
import { createContext } from '../../src/server/trpc';
import type { Server } from 'http';
import cors from 'cors';

// ============================================================================
// Type Definitions
// ============================================================================

interface TestServer {
  server: Server;
  port: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Start tRPC server for testing
 */
async function startTestServer(): Promise<TestServer> {
  const app = express();

  app.use(
    cors({
      origin: '*',
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization'],
      methods: ['GET', 'POST', 'OPTIONS'],
    })
  );

  app.use(express.json({ limit: '10mb' }));

  app.use(
    '/trpc',
    createExpressMiddleware({
      router: appRouter,
      createContext: async ({ req }) => {
        const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        const headers = new Headers();

        Object.entries(req.headers).forEach(([key, value]) => {
          if (value) {
            if (Array.isArray(value)) {
              value.forEach(v => headers.append(key, v));
            } else {
              headers.set(key, value);
            }
          }
        });

        const fetchRequest = new Request(url, {
          method: req.method,
          headers,
        });

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

  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        console.log(`[Metrics E2E] Test tRPC server started on port ${port}`);
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
 */
async function stopTestServer(testServer: TestServer): Promise<void> {
  return new Promise((resolve, reject) => {
    testServer.server.close(err => {
      if (err) {
        reject(err);
      } else {
        console.log(`[Metrics E2E] Test tRPC server stopped (port ${testServer.port})`);
        resolve();
      }
    });
  });
}

/**
 * Create tRPC client with optional JWT token
 */
function createTestClient(port: number, token?: string) {
  const headers: Record<string, string> = {};
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `http://localhost:${port}/trpc`,
        headers,
      }),
    ],
  });
}

/**
 * Sign in with Supabase and get JWT token
 */
async function getAuthToken(email: string, password: string): Promise<string> {
  const { createClient } = await import('@supabase/supabase-js');
  const authClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

  const { data, error } = await authClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    throw new Error(`Failed to authenticate: ${error?.message || 'No session returned'}`);
  }

  return data.session.access_token;
}

/**
 * Seed stage metrics data for testing
 */
function seedStageMetrics(courseId: string): void {
  // Start and complete stage 3
  stageMetricsCollector.startStage(courseId, 'stage3', 'Document Processing');
  stageMetricsCollector.completeStage(courseId, 'stage3', {
    tokensUsed: 5000,
    costUsd: 0.015,
    qualityScore: 0.88,
    documentsProcessed: 3,
  });

  // Start and complete stage 4
  stageMetricsCollector.startStage(courseId, 'stage4', 'Content Analysis');
  stageMetricsCollector.completeStage(courseId, 'stage4', {
    tokensUsed: 8000,
    costUsd: 0.025,
    qualityScore: 0.92,
  });

  // Start and complete stage 6
  stageMetricsCollector.startStage(courseId, 'stage6', 'Lesson Generation');
  stageMetricsCollector.completeStage(courseId, 'stage6', {
    tokensUsed: 15000,
    costUsd: 0.045,
    qualityScore: 0.85,
    lessonsGenerated: 5,
  });
}

/**
 * Seed cost tracker data for testing
 */
function seedCostData(courseId: string): void {
  // Record stage costs
  costTracker.recordStageCost(courseId, {
    stageId: 'stage3',
    stageName: 'Document Processing',
    modelId: 'qwen/qwen3-235b-a22b-2507',
    tokenUsage: { inputTokens: 3000, outputTokens: 2000, totalTokens: 5000 },
    costUsd: 0.015,
    durationMs: 12000,
  });

  costTracker.recordStageCost(courseId, {
    stageId: 'stage4',
    stageName: 'Content Analysis',
    modelId: 'deepseek/deepseek-v3.1-terminus',
    tokenUsage: { inputTokens: 5000, outputTokens: 3000, totalTokens: 8000 },
    costUsd: 0.025,
    durationMs: 18000,
  });

  costTracker.recordStageCost(courseId, {
    stageId: 'stage6',
    stageName: 'Lesson Generation',
    modelId: 'qwen/qwen3-235b-a22b-2507',
    tokenUsage: { inputTokens: 10000, outputTokens: 5000, totalTokens: 15000 },
    costUsd: 0.045,
    durationMs: 45000,
  });
}

/**
 * Clean up seeded metrics data
 */
function cleanupMetricsData(courseId: string): void {
  stageMetricsCollector.clearCourse(courseId);
  costTracker.clearCourse(courseId);
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Metrics tRPC API E2E', () => {
  let testServer: TestServer;
  let serverPort: number;
  let testCourseId: string;
  let instructorToken: string;
  let adminToken: string;

  beforeAll(async () => {
    console.log('[Metrics E2E] ========================================');
    console.log('[Metrics E2E] Setting up metrics API E2E test...');
    console.log('[Metrics E2E] ========================================');

    // Clean up BullMQ jobs
    await cleanupTestJobs(true);

    // Clean up existing test data
    await cleanupTestFixtures();

    // Setup test fixtures
    await setupTestFixtures();

    // Get auth tokens
    instructorToken = await getAuthToken(TEST_AUTH_USERS.instructor1.email, TEST_AUTH_USERS.instructor1.password);
    console.log('[Metrics E2E] Instructor token acquired');

    // Create admin user and get token
    // Note: Admin user created in setupTestFixtures doesn't have auth account,
    // so we'll use instructor for protected endpoints and mock admin via direct DB queries
    // For admin tests, we'll verify authorization by checking proper errors

    // Start tRPC server
    testServer = await startTestServer();
    serverPort = testServer.port;

    // Setup test course with metrics data
    const { courseId } = await setupStage6TestCourse({ lessonCount: 3 });
    testCourseId = courseId;

    // Seed metrics and cost data for testing
    seedStageMetrics(testCourseId);
    seedCostData(testCourseId);

    console.log(`[Metrics E2E] Test course created: ${testCourseId}`);
    console.log('[Metrics E2E] Test setup complete');
  }, 60000);

  afterAll(async () => {
    console.log('[Metrics E2E] ========================================');
    console.log('[Metrics E2E] Tearing down metrics API E2E test...');
    console.log('[Metrics E2E] ========================================');

    // Clean up metrics data
    if (testCourseId) {
      cleanupMetricsData(testCourseId);
    }

    // Clean up Stage 6 test data
    if (testCourseId) {
      await cleanupStage6TestData(testCourseId, { deleteCourse: true });
    }

    // Clean up jobs
    await cleanupTestJobs(true);

    // Stop server
    if (testServer) {
      await stopTestServer(testServer);
    }

    // Cleanup fixtures
    await cleanupTestFixtures();

    console.log('[Metrics E2E] Cleanup complete');
  }, 60000);

  // ============================================================================
  // PUBLIC METRICS ENDPOINTS (No auth required)
  // ============================================================================

  describe('Public Metrics Endpoints (no auth required)', () => {
    it('metrics.getAll - should return all system metrics', async () => {
      const client = createTestClient(serverPort); // No auth token

      const result = await client.metrics.getAll.query();

      // Verify FSM metrics structure
      expect(result).toHaveProperty('fsm');
      expect(result.fsm).toHaveProperty('total');
      expect(result.fsm).toHaveProperty('successRate');
      expect(result.fsm).toHaveProperty('cacheHitRate');

      // Verify outbox metrics structure
      expect(result).toHaveProperty('outbox');
      expect(result.outbox).toHaveProperty('batchesProcessed');
      expect(result.outbox).toHaveProperty('avgQueueDepth');

      // Verify fallback metrics structure (flat property names)
      expect(result).toHaveProperty('fallbacks');
      expect(result.fallbacks).toHaveProperty('layer2Activations');
      expect(result.fallbacks).toHaveProperty('layer3Activations');

      // Verify jobs metrics structure
      expect(result).toHaveProperty('jobs');

      // Verify outbox health structure
      expect(result).toHaveProperty('outboxHealth');
      expect(result.outboxHealth).toHaveProperty('alive');
      expect(result.outboxHealth).toHaveProperty('lastProcessed');

      // Verify timestamp
      expect(result).toHaveProperty('timestamp');
      expect(typeof result.timestamp).toBe('string');
    });

    it('metrics.getFSM - should return FSM initialization metrics', async () => {
      const client = createTestClient(serverPort); // No auth token

      const result = await client.metrics.getFSM.query();

      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('successRate');
      expect(typeof result.successRate).toBe('number');
      expect(result).toHaveProperty('cacheHitRate');
      expect(typeof result.cacheHitRate).toBe('number');
      // FSM metrics store durations array, not avgDurationMs
      expect(result).toHaveProperty('durations');
      expect(Array.isArray(result.durations)).toBe(true);
      expect(result).toHaveProperty('failureReasons');
      expect(typeof result.failureReasons).toBe('object');
    });

    it('metrics.getOutbox - should return outbox processor metrics and health', async () => {
      const client = createTestClient(serverPort); // No auth token

      const result = await client.metrics.getOutbox.query();

      // Verify metrics structure
      expect(result).toHaveProperty('metrics');
      expect(result.metrics).toHaveProperty('batchesProcessed');
      expect(result.metrics).toHaveProperty('jobsCreated');
      expect(result.metrics).toHaveProperty('avgQueueDepth');
      expect(result.metrics).toHaveProperty('errors');
      expect(typeof result.metrics.errors).toBe('object');

      // Verify health structure
      expect(result).toHaveProperty('health');
      expect(result.health).toHaveProperty('alive');
      expect(typeof result.health.alive).toBe('boolean');
      expect(result.health).toHaveProperty('lastProcessed');
      expect(result.health).toHaveProperty('queueDepth');
    });

    it('metrics.getFallbacks - should return defense layer fallback metrics', async () => {
      const client = createTestClient(serverPort); // No auth token

      const result = await client.metrics.getFallbacks.query();

      // Verify layer 2 metrics (flat property names)
      expect(result).toHaveProperty('layer2Activations');
      expect(result).toHaveProperty('layer2Successes');
      expect(result).toHaveProperty('layer2Failures');

      // Verify layer 3 metrics (flat property names)
      expect(result).toHaveProperty('layer3Activations');
      expect(result).toHaveProperty('layer3Successes');
      expect(result).toHaveProperty('layer3Failures');

      // Verify recent activations count
      expect(result).toHaveProperty('recentActivations');
      expect(typeof result.recentActivations).toBe('number');

      // Verify timestamps array (converted to ISO strings by router)
      expect(result).toHaveProperty('timestamps');
      expect(Array.isArray(result.timestamps)).toBe(true);
    });

    it('metrics.healthCheck - should return system health status', async () => {
      const client = createTestClient(serverPort); // No auth token

      const result = await client.metrics.healthCheck.query();

      // Verify health status
      expect(result).toHaveProperty('healthy');
      expect(typeof result.healthy).toBe('boolean');

      // Verify checks structure
      expect(result).toHaveProperty('checks');
      expect(result.checks).toHaveProperty('outboxAlive');
      expect(result.checks).toHaveProperty('fsmSuccessRate');
      expect(result.checks).toHaveProperty('fsmSuccessRateOk');
      expect(result.checks).toHaveProperty('queueDepth');
      expect(result.checks).toHaveProperty('queueDepthOk');
      expect(result.checks).toHaveProperty('lastProcessed');
      expect(result.checks).toHaveProperty('lastProcessedOk');

      // Verify timestamp
      expect(result).toHaveProperty('timestamp');
      expect(typeof result.timestamp).toBe('string');
    });
  });

  // ============================================================================
  // PROTECTED METRICS ENDPOINTS (Requires authentication)
  // ============================================================================

  describe('Protected Metrics Endpoints (requires authentication)', () => {
    it('metrics.getCourseMetrics - should return metrics for authenticated user course', async () => {
      const client = createTestClient(serverPort, instructorToken);

      const result = await client.metrics.getCourseMetrics.query({
        courseId: testCourseId,
      });

      // Result should be an array of stage metrics
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      // Verify stage metrics structure
      const stageMetric = result[0];
      expect(stageMetric).toHaveProperty('stageId');
      expect(stageMetric).toHaveProperty('stageName');
      expect(stageMetric).toHaveProperty('courseId');
      expect(stageMetric.courseId).toBe(testCourseId);
      expect(stageMetric).toHaveProperty('startedAt');
      expect(stageMetric).toHaveProperty('completedAt');
      expect(stageMetric).toHaveProperty('status');
      expect(stageMetric).toHaveProperty('metrics');
    });

    it('metrics.getCourseMetrics - should return empty array for non-existent course', async () => {
      const client = createTestClient(serverPort, instructorToken);
      const nonExistentCourseId = '00000000-0000-0000-0000-000000000999';

      const result = await client.metrics.getCourseMetrics.query({
        courseId: nonExistentCourseId,
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('metrics.getCourseMetrics - should reject unauthenticated request', async () => {
      const client = createTestClient(serverPort); // No auth token

      await expect(
        client.metrics.getCourseMetrics.query({
          courseId: testCourseId,
        })
      ).rejects.toThrow(/Authentication required/);
    });

    it('metrics.getCourseCost - should return cost summary for authenticated user', async () => {
      const client = createTestClient(serverPort, instructorToken);

      const result = await client.metrics.getCourseCost.query({
        courseId: testCourseId,
      });

      // Result should contain cost summary
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('courseId');
      expect(result!.courseId).toBe(testCourseId);
      expect(result).toHaveProperty('totalCostUsd');
      expect(typeof result!.totalCostUsd).toBe('number');
      expect(result!.totalCostUsd).toBeGreaterThan(0);
      expect(result).toHaveProperty('totalTokens');
      expect(typeof result!.totalTokens).toBe('number');
      expect(result).toHaveProperty('stageCosts');
      expect(Array.isArray(result!.stageCosts)).toBe(true);
      expect(result!.stageCosts.length).toBeGreaterThan(0);
      expect(result).toHaveProperty('startedAt');

      // Verify stage cost structure
      const stageCost = result!.stageCosts[0];
      expect(stageCost).toHaveProperty('stageId');
      expect(stageCost).toHaveProperty('stageName');
      expect(stageCost).toHaveProperty('modelId');
      expect(stageCost).toHaveProperty('tokenUsage');
      expect(stageCost).toHaveProperty('costUsd');
      expect(stageCost).toHaveProperty('durationMs');
      expect(stageCost).toHaveProperty('timestamp');
    });

    it('metrics.getCourseCost - should return null for non-tracked course', async () => {
      const client = createTestClient(serverPort, instructorToken);
      const nonTrackedCourseId = '00000000-0000-0000-0000-000000000998';

      const result = await client.metrics.getCourseCost.query({
        courseId: nonTrackedCourseId,
      });

      expect(result).toBeNull();
    });

    it('metrics.getCourseCost - should reject unauthenticated request', async () => {
      const client = createTestClient(serverPort); // No auth token

      await expect(
        client.metrics.getCourseCost.query({
          courseId: testCourseId,
        })
      ).rejects.toThrow(/Authentication required/);
    });
  });

  // ============================================================================
  // ADMIN METRICS ENDPOINTS (Requires admin role)
  // ============================================================================

  describe('Admin Metrics Endpoints (requires admin role)', () => {
    it('metrics.getAggregatedMetrics - should reject non-admin users', async () => {
      const client = createTestClient(serverPort, instructorToken);

      // Instructor should not have access to admin endpoints
      await expect(client.metrics.getAggregatedMetrics.query()).rejects.toThrow(/Access denied/);
    });

    it('metrics.getStagePerformance - should reject non-admin users', async () => {
      const client = createTestClient(serverPort, instructorToken);

      // Instructor should not have access to admin endpoints
      await expect(client.metrics.getStagePerformance.query()).rejects.toThrow(/Access denied/);
    });

    it('metrics.getTotalCost - should reject non-admin users', async () => {
      // Get a fresh token to avoid expiration issues
      const freshToken = await getAuthToken(TEST_AUTH_USERS.instructor1.email, TEST_AUTH_USERS.instructor1.password);
      const client = createTestClient(serverPort, freshToken);

      // Instructor should not have access to admin endpoints
      await expect(client.metrics.getTotalCost.query()).rejects.toThrow(/Access denied/);
    });

    it('metrics.getAggregatedMetrics - should reject unauthenticated request', async () => {
      const client = createTestClient(serverPort); // No auth token

      await expect(client.metrics.getAggregatedMetrics.query()).rejects.toThrow(/Authentication required/);
    });

    it('metrics.getStagePerformance - should reject unauthenticated request', async () => {
      const client = createTestClient(serverPort); // No auth token

      await expect(client.metrics.getStagePerformance.query()).rejects.toThrow(/Authentication required/);
    });

    it('metrics.getTotalCost - should reject unauthenticated request', async () => {
      const client = createTestClient(serverPort); // No auth token

      await expect(client.metrics.getTotalCost.query()).rejects.toThrow(/Authentication required/);
    });
  });

  // ============================================================================
  // METRICS DATA VALIDATION
  // ============================================================================

  describe('Metrics Data Validation', () => {
    it('should track stage metrics with correct quality scores', async () => {
      // Get fresh token to avoid expiration issues
      const freshToken = await getAuthToken(TEST_AUTH_USERS.instructor1.email, TEST_AUTH_USERS.instructor1.password);
      const client = createTestClient(serverPort, freshToken);

      const result = await client.metrics.getCourseMetrics.query({
        courseId: testCourseId,
      });

      // Find stage 6 metrics (lesson generation)
      const stage6Metrics = result.find(m => m.stageId === 'stage6');
      expect(stage6Metrics).toBeDefined();
      expect(stage6Metrics!.metrics).toHaveProperty('qualityScore');
      expect(stage6Metrics!.metrics.qualityScore).toBeGreaterThanOrEqual(0);
      expect(stage6Metrics!.metrics.qualityScore).toBeLessThanOrEqual(1);
    });

    it('should track cost metrics with correct token counts', async () => {
      // Get fresh token to avoid expiration issues
      const freshToken = await getAuthToken(TEST_AUTH_USERS.instructor1.email, TEST_AUTH_USERS.instructor1.password);
      const client = createTestClient(serverPort, freshToken);

      const result = await client.metrics.getCourseCost.query({
        courseId: testCourseId,
      });

      expect(result).not.toBeNull();

      // Verify total tokens match sum of stage tokens
      const expectedTotalTokens = result!.stageCosts.reduce(
        (sum, stage) => sum + stage.tokenUsage.totalTokens,
        0
      );
      expect(result!.totalTokens).toBe(expectedTotalTokens);

      // Verify total cost is reasonable (within expected range)
      // Our seeded data has: 0.015 + 0.025 + 0.045 = 0.085
      expect(result!.totalCostUsd).toBeCloseTo(0.085, 3);
    });

    it('should serialize dates as ISO strings', async () => {
      // Get fresh token to avoid expiration issues
      const freshToken = await getAuthToken(TEST_AUTH_USERS.instructor1.email, TEST_AUTH_USERS.instructor1.password);
      const client = createTestClient(serverPort, freshToken);

      // Test course metrics date serialization
      const courseMetrics = await client.metrics.getCourseMetrics.query({
        courseId: testCourseId,
      });

      if (courseMetrics.length > 0) {
        const metric = courseMetrics[0];
        expect(typeof metric.startedAt).toBe('string');
        expect(new Date(metric.startedAt).toString()).not.toBe('Invalid Date');
        if (metric.completedAt) {
          expect(typeof metric.completedAt).toBe('string');
          expect(new Date(metric.completedAt).toString()).not.toBe('Invalid Date');
        }
      }

      // Test cost metrics date serialization
      const costSummary = await client.metrics.getCourseCost.query({
        courseId: testCourseId,
      });

      if (costSummary) {
        expect(typeof costSummary.startedAt).toBe('string');
        expect(new Date(costSummary.startedAt).toString()).not.toBe('Invalid Date');

        if (costSummary.stageCosts.length > 0) {
          const stageCost = costSummary.stageCosts[0];
          expect(typeof stageCost.timestamp).toBe('string');
          expect(new Date(stageCost.timestamp).toString()).not.toBe('Invalid Date');
        }
      }
    });
  });

  // ============================================================================
  // INPUT VALIDATION
  // ============================================================================

  describe('Input Validation', () => {
    it('should validate courseId as UUID', async () => {
      const client = createTestClient(serverPort, instructorToken);

      await expect(
        client.metrics.getCourseMetrics.query({
          courseId: 'invalid-uuid',
        })
      ).rejects.toThrow(); // Zod validation error
    });

    it('should validate courseId format in getCourseCost', async () => {
      const client = createTestClient(serverPort, instructorToken);

      await expect(
        client.metrics.getCourseCost.query({
          courseId: 'not-a-uuid',
        })
      ).rejects.toThrow(); // Zod validation error
    });
  });
});
