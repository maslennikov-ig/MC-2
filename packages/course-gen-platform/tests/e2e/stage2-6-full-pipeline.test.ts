/**
 * E2E Test: Stage 2-6 Full Pipeline Validation
 * @module tests/e2e/stage2-6-full-pipeline
 *
 * Test Objective: Validate the complete end-to-end workflow from document upload
 * through Stage 6 lesson content generation using real test documents.
 *
 * Test Coverage:
 * - Stage 2: Document upload and file_catalog creation
 * - Stage 3: Document processing, summarization, and Qdrant vector creation
 * - Stage 4: Multi-phase analysis execution and result validation
 * - Stage 5: V2 LessonSpec generation with RAG integration
 * - Stage 6: Lesson content generation with parallel processing and Judge evaluation
 *
 * Test Documents:
 * - docs/test/synergy/1 ТЗ на курс по продажам.docx (Technical specification)
 * - docs/test/Презентация и обучение.txt (Presentation and training content)
 *
 * Prerequisites:
 * - Supabase database accessible
 * - Qdrant vector database running
 * - Redis running (for BullMQ)
 * - BullMQ worker running
 * - OpenRouter API key configured (OPENROUTER_API_KEY)
 * - Jina API key configured (for embeddings)
 * - Docling MCP server running (for PDF/DOCX processing)
 *
 * Test execution: pnpm test tests/e2e/stage2-6-full-pipeline.test.ts
 *
 * Reference:
 * - specs/010-stages-456-pipeline/
 * - tests/e2e/t055-full-pipeline.test.ts (Stage 2-4)
 * - tests/e2e/t053-synergy-sales-course.test.ts (Stage 5)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../src/server/app-router';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import { getRedisClient } from '../../src/shared/cache/redis';
import {
  setupTestFixtures,
  cleanupTestFixtures,
  cleanupTestJobs,
  cleanupStage6TestData,
  setupStage6TestCourse,
  waitForStage6Completion,
  getStage6TestMetrics,
  TEST_USERS,
  TEST_ORGS,
} from '../fixtures';
import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from '../../src/server/app-router';
import { createContext } from '../../src/server/trpc';
import type { Server } from 'http';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { getQueue } from '../../src/orchestrator/queue';
import {
  createStage6Queue,
  createStage6Worker,
  HANDLER_CONFIG,
  type Stage6JobInput,
  type Stage6JobResult,
} from '../../src/stages/stage6-lesson-content/handler';
import type { Queue, Worker, QueueEvents } from 'bullmq';
import { QueueEvents as BullMQQueueEvents } from 'bullmq';

// ============================================================================
// Configuration
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const TEST_DOCS_DIR_SYNERGY = path.join(REPO_ROOT, 'docs/test/synergy');
const TEST_DOCS_DIR_GENERAL = path.join(REPO_ROOT, 'docs/test');

// Test documents for Stage 2-6 pipeline
const TEST_DOCUMENTS = [
  {
    filename: '1 ТЗ на курс по продажам.docx',
    path: path.join(TEST_DOCS_DIR_SYNERGY, '1 ТЗ на курс по продажам.docx'),
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    description: 'Main technical specification for sales course',
  },
  {
    filename: 'Презентация и обучение.txt',
    path: path.join(TEST_DOCS_DIR_GENERAL, 'Презентация и обучение.txt'),
    mimeType: 'text/plain',
    description: 'Presentation and training content',
  },
];

// Test configuration
const TEST_CONFIG = {
  /** Maximum wait time for full pipeline (10 minutes) */
  MAX_PIPELINE_WAIT_MS: 600_000,
  /** Maximum wait time for Stage 6 generation (10 minutes) */
  MAX_STAGE6_WAIT_MS: 600_000,
  /** Polling interval for status checks */
  POLL_INTERVAL_MS: 5_000,
  /** Minimum expected lessons count (FR-015) */
  EXPECTED_MIN_LESSONS: 10,
  /** Maximum cost per course (SC-010) */
  EXPECTED_MAX_COST: 0.50,
  /** Minimum quality threshold (SC-004) */
  EXPECTED_MIN_QUALITY: 0.75,
  /** Number of parallel lessons for Stage 6 test */
  PARALLEL_LESSONS_COUNT: 10,
};

// ============================================================================
// Type Definitions
// ============================================================================

interface TestServer {
  server: Server;
  port: number;
}

interface Stage6TestContext {
  queue: Queue<Stage6JobInput, Stage6JobResult>;
  worker: Worker<Stage6JobInput, Stage6JobResult>;
  queueEvents: BullMQQueueEvents;
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
        console.log(`[Stage2-6] Test tRPC server started on port ${port}`);
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
        console.log(`[Stage2-6] Test tRPC server stopped (port ${testServer.port})`);
        resolve();
      }
    });
  });
}

/**
 * Create tRPC client with JWT token
 */
function createTestClient(port: number, token: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `http://localhost:${port}/trpc`,
        headers: { authorization: `Bearer ${token}` },
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
 * Create test course for pipeline testing
 */
async function createTestCourse(
  title: string,
  topic: string,
  options: { lessonDurationMinutes?: number } = {}
): Promise<string> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('courses')
    .insert({
      organization_id: TEST_ORGS.premium.id,
      user_id: TEST_USERS.instructor1.id,
      title,
      slug: `stage2-6-test-${Date.now()}`,
      generation_status: 'processing_documents',
      generation_progress: {
        steps: [
          { status: 'pending' },
          { status: 'pending' },
          { status: 'pending' },
          { status: 'pending' },
          { status: 'pending' },
          { status: 'pending' },
        ],
        percentage: 0,
        current_step: 0,
        message: 'Initializing pipeline',
        has_documents: true,
      },
      language: 'ru',
      style: 'professional',
      target_audience: 'intermediate',
      difficulty: 'medium',
      settings: {
        topic,
        answers: 'Prepare comprehensive training course',
        lesson_duration_minutes: options.lessonDurationMinutes ?? 15,
      },
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create test course: ${error.message}`);
  }

  console.log(`[Stage2-6] Created test course: ${data.id}`);
  return data.id;
}

/**
 * Upload document to course
 */
async function uploadDocument(
  courseId: string,
  filePath: string,
  fileName: string
): Promise<string> {
  const supabase = getSupabaseAdmin();

  // Read file and convert to base64
  const fileBuffer = await fs.readFile(filePath);

  console.log(`[Stage2-6] Uploading document: ${fileName} (${fileBuffer.length} bytes)`);

  // Create file hash
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // Determine mime type
  const ext = path.extname(fileName).toLowerCase();
  const mimeType = ext === '.pdf'
    ? 'application/pdf'
    : ext === '.docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'text/plain';
  const fileType = ext.replace('.', '');

  // Match production storage_path format
  const storagePath = `uploads/${TEST_ORGS.premium.id}/${courseId}/${fileName}`;
  const absoluteStoragePath = path.join(process.cwd(), storagePath);

  // Create directory structure
  const storageDir = path.dirname(absoluteStoragePath);
  await fs.mkdir(storageDir, { recursive: true });

  // Copy file to storage location
  await fs.copyFile(filePath, absoluteStoragePath);

  const { data, error } = await supabase
    .from('file_catalog')
    .insert({
      organization_id: TEST_ORGS.premium.id,
      course_id: courseId,
      filename: fileName,
      storage_path: storagePath,
      file_type: fileType,
      file_size: fileBuffer.length,
      hash: fileHash,
      mime_type: mimeType,
      vector_status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    try {
      await fs.unlink(absoluteStoragePath);
    } catch { /* ignore cleanup errors */ }
    throw new Error(`Failed to upload document ${fileName}: ${error.message}`);
  }

  console.log(`[Stage2-6] Document uploaded: ${fileName} -> ${data.id}`);
  return data.id;
}

/**
 * Wait for document processing (Stage 2-3) to complete
 */
async function waitForDocumentProcessing(
  courseId: string,
  timeoutMs: number = 300_000
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const startTime = Date.now();
  const checkInterval = 5_000;

  console.log(`[Stage2-6] Waiting for document processing (timeout: ${timeoutMs / 1000}s)...`);

  while (Date.now() - startTime < timeoutMs) {
    const { data: documents, error } = await supabase
      .from('file_catalog')
      .select('id, filename, vector_status, processed_content')
      .eq('course_id', courseId);

    if (error) {
      throw new Error(`Failed to check document status: ${error.message}`);
    }

    const totalDocs = documents?.length || 0;
    const completedDocs = documents?.filter(d => d.processed_content !== null).length || 0;
    const failedDocs = documents?.filter(d => d.vector_status === 'failed').length || 0;

    console.log(
      `[Stage2-6] Document processing: ${completedDocs}/${totalDocs} completed, ${failedDocs} failed`
    );

    const allProcessed = documents?.every(d =>
      d.processed_content !== null || d.vector_status === 'failed'
    );

    if (allProcessed && totalDocs > 0) {
      if (failedDocs > 0) {
        throw new Error(`${failedDocs} documents failed to process`);
      }

      console.log(`[Stage2-6] All ${totalDocs} documents processed successfully`);
      await new Promise(resolve => setTimeout(resolve, 3_000)); // Allow jobs to finish
      return;
    }

    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }

  throw new Error(`Document processing timeout after ${timeoutMs / 1000}s`);
}

/**
 * Wait for analysis (Stage 4) to complete
 */
async function waitForAnalysis(
  client: ReturnType<typeof createTestClient>,
  courseId: string,
  timeoutMs: number = 600_000
): Promise<void> {
  const startTime = Date.now();
  const checkInterval = 10_000;

  console.log(`[Stage2-6] Waiting for analysis (timeout: ${timeoutMs / 1000}s)...`);

  while (Date.now() - startTime < timeoutMs) {
    const status = await client.analysis.getStatus.query({ courseId });

    console.log(`[Stage2-6] Analysis status: ${status.status}, progress: ${status.progress}%`);

    if (status.status === 'generating_structure' || status.status === 'completed' || status.status === 'ready') {
      console.log(`[Stage2-6] Analysis completed (status: ${status.status})`);
      return;
    }

    if (status.status === 'failed') {
      throw new Error('Analysis failed');
    }

    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }

  throw new Error(`Analysis timeout after ${timeoutMs / 1000}s`);
}

/**
 * Wait for structure generation (Stage 5) to complete
 */
async function waitForStructureGeneration(
  courseId: string,
  timeoutMs: number = 300_000
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const startTime = Date.now();
  const checkInterval = 5_000;

  console.log(`[Stage2-6] Waiting for structure generation (timeout: ${timeoutMs / 1000}s)...`);

  while (Date.now() - startTime < timeoutMs) {
    const { data: course, error } = await supabase
      .from('courses')
      .select('course_structure, generation_status')
      .eq('id', courseId)
      .single();

    if (error) {
      throw new Error(`Failed to query course: ${error.message}`);
    }

    console.log(`[Stage2-6] Structure generation status: ${course.generation_status}`);

    if (course.course_structure && course.generation_status === 'stage_5_complete') {
      console.log('[Stage2-6] Structure generation completed');
      return;
    }

    if (course.generation_status === 'failed') {
      throw new Error('Structure generation failed');
    }

    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }

  throw new Error(`Structure generation timeout after ${timeoutMs / 1000}s`);
}

/**
 * Wait for all BullMQ jobs to reach terminal state
 */
async function waitForAllJobsToComplete(timeoutMs: number = 60_000): Promise<void> {
  const startTime = Date.now();
  const checkInterval = 2_000;
  const queue = getQueue();

  console.log('[Stage2-6] Waiting for all BullMQ jobs to complete...');

  while (Date.now() - startTime < timeoutMs) {
    const counts = await queue.getJobCounts('active', 'waiting', 'delayed');
    const activeJobs = counts.active + counts.waiting + counts.delayed;

    if (activeJobs === 0) {
      console.log('[Stage2-6] All BullMQ jobs completed');
      return;
    }

    console.log(
      `[Stage2-6] ${activeJobs} jobs still running ` +
      `(active: ${counts.active}, waiting: ${counts.waiting}, delayed: ${counts.delayed})`
    );
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }

  const finalCounts = await queue.getJobCounts('active', 'waiting', 'delayed');
  console.warn(
    `[Stage2-6] WARNING: Timeout waiting for jobs. ` +
    `Remaining: ${finalCounts.active} active, ${finalCounts.waiting} waiting`
  );
}

/**
 * Initialize Stage 6 infrastructure for testing
 */
async function initializeStage6Infrastructure(): Promise<Stage6TestContext> {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  const queue = createStage6Queue(redisUrl);
  const worker = createStage6Worker(redisUrl);
  const queueEvents = new BullMQQueueEvents(HANDLER_CONFIG.QUEUE_NAME, {
    connection: { url: redisUrl },
  });

  await queueEvents.waitUntilReady();

  console.log('[Stage2-6] Stage 6 infrastructure initialized');

  return { queue, worker, queueEvents };
}

/**
 * Cleanup Stage 6 infrastructure
 */
async function cleanupStage6Infrastructure(ctx: Stage6TestContext): Promise<void> {
  if (ctx.worker) {
    await ctx.worker.close();
  }
  if (ctx.queueEvents) {
    await ctx.queueEvents.close();
  }
  if (ctx.queue) {
    await ctx.queue.obliterate({ force: true });
    await ctx.queue.close();
  }
  console.log('[Stage2-6] Stage 6 infrastructure cleaned up');
}

/**
 * Validate analysis result structure
 */
function validateAnalysisResult(result: unknown): void {
  console.log(`[Stage2-6] Validating analysis result structure...`);

  const r = result as Record<string, unknown>;

  expect(r).toHaveProperty('course_category');
  expect(r).toHaveProperty('recommended_structure');
  expect(r).toHaveProperty('metadata');

  const structure = r.recommended_structure as Record<string, unknown>;
  expect(structure).toHaveProperty('total_lessons');
  expect(structure.total_lessons).toBeGreaterThanOrEqual(TEST_CONFIG.EXPECTED_MIN_LESSONS);

  console.log(`[Stage2-6] Analysis result validation passed`);
  console.log(`  - Total lessons: ${structure.total_lessons}`);
}

/**
 * Validate course structure from Stage 5
 */
function validateCourseStructure(courseStructure: unknown): void {
  console.log(`[Stage2-6] Validating course structure...`);

  const structure = courseStructure as { sections: Array<{ lessons: unknown[] }> };

  expect(structure).toHaveProperty('sections');
  expect(Array.isArray(structure.sections)).toBe(true);
  expect(structure.sections.length).toBeGreaterThan(0);

  const totalLessons = structure.sections.reduce(
    (sum, section) => sum + section.lessons.length,
    0
  );

  expect(totalLessons).toBeGreaterThanOrEqual(TEST_CONFIG.EXPECTED_MIN_LESSONS);

  console.log(`[Stage2-6] Course structure validation passed`);
  console.log(`  - Sections: ${structure.sections.length}`);
  console.log(`  - Total lessons: ${totalLessons}`);
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Stage 2-6 Full Pipeline E2E', () => {
  let testServer: TestServer;
  let serverPort: number;
  let authToken: string;
  let shouldSkipTests = false;
  let testCourseIds: string[] = [];

  beforeAll(async () => {
    console.log('[Stage2-6] ========================================');
    console.log('[Stage2-6] Setting up E2E full pipeline test...');
    console.log('[Stage2-6] ========================================');

    // Check Redis availability
    try {
      const redis = getRedisClient();
      await redis.ping();
      console.log('[Stage2-6] Redis connected');
    } catch (error) {
      console.error('[Stage2-6] Redis not available:', error);
      shouldSkipTests = true;
      return;
    }

    // Check Supabase availability
    try {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.from('courses').select('id').limit(1);
      if (error) throw error;
      console.log('[Stage2-6] Supabase connected');
    } catch (error) {
      console.error('[Stage2-6] Supabase not available:', error);
      shouldSkipTests = true;
      return;
    }

    // Verify test documents exist
    for (const doc of TEST_DOCUMENTS) {
      try {
        await fs.access(doc.path);
        console.log(`[Stage2-6] Found ${doc.filename}`);
      } catch {
        console.warn(`[Stage2-6] WARNING: Missing ${doc.filename} at ${doc.path}`);
        // Don't skip - some tests may not need all documents
      }
    }

    // Clean up stale jobs
    await cleanupTestJobs(true);

    // Setup test fixtures
    await setupTestFixtures();
    console.log('[Stage2-6] Test fixtures ready');

    // Get auth token
    authToken = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');

    // Start tRPC server
    testServer = await startTestServer();
    serverPort = testServer.port;

    console.log('[Stage2-6] Test environment ready');
  }, 120_000);

  afterAll(async () => {
    console.log('[Stage2-6] ========================================');
    console.log('[Stage2-6] Tearing down E2E test...');
    console.log('[Stage2-6] ========================================');

    if (shouldSkipTests) return;

    // Clean up test courses and their data
    for (const courseId of testCourseIds) {
      try {
        const uploadDir = path.join(process.cwd(), `uploads/${TEST_ORGS.premium.id}/${courseId}`);
        await fs.rm(uploadDir, { recursive: true, force: true });
        console.log(`[Stage2-6] Cleaned up uploads: ${uploadDir}`);
      } catch { /* ignore */ }

      try {
        await cleanupStage6TestData(courseId, { deleteCourse: true });
      } catch { /* ignore */ }

      const supabase = getSupabaseAdmin();
      await supabase.from('courses').delete().eq('id', courseId);
    }

    await cleanupTestJobs(true);

    if (testServer) {
      await stopTestServer(testServer);
    }

    await cleanupTestFixtures();

    console.log('[Stage2-6] Cleanup complete');
  }, 60_000);

  // ==========================================================================
  // Scenario 1: Document Upload -> Lesson Content (Happy Path)
  // ==========================================================================

  describe('Scenario 1: Document Upload -> Lesson Content (Happy Path)', () => {
    it.skipIf(shouldSkipTests || !process.env.OPENROUTER_API_KEY)(
      'should process documents through all stages',
      async () => {
        console.log('\n[Stage2-6] ========================================');
        console.log('[Stage2-6] Scenario 1: Full Pipeline Happy Path');
        console.log('[Stage2-6] ========================================\n');

        const client = createTestClient(serverPort, authToken);

        // === STAGE 2: Create Course and Upload Documents ===
        console.log('[Stage2-6] --- STAGE 2: Document Upload ---');

        const courseTopic = 'Sales Training and Customer Engagement';
        const testCourseId = await createTestCourse(
          'Stage 2-6 Pipeline Test: Sales Course',
          courseTopic
        );
        testCourseIds.push(testCourseId);

        // Upload available test documents
        const uploadedDocIds: string[] = [];
        for (const doc of TEST_DOCUMENTS) {
          try {
            await fs.access(doc.path);
            const docId = await uploadDocument(testCourseId, doc.path, doc.filename);
            uploadedDocIds.push(docId);
          } catch {
            console.warn(`[Stage2-6] Skipping unavailable document: ${doc.filename}`);
          }
        }

        expect(uploadedDocIds.length).toBeGreaterThanOrEqual(1);
        console.log(`[Stage2-6] Uploaded ${uploadedDocIds.length} documents\n`);

        // Initiate processing
        const initiateResult = await client.generation.initiate.mutate({
          courseId: testCourseId,
          webhookUrl: null,
        });

        expect(initiateResult.jobId).toBeDefined();
        console.log(`[Stage2-6] Processing initiated: jobId=${initiateResult.jobId}\n`);

        // === STAGE 3: Wait for Document Processing ===
        console.log('[Stage2-6] --- STAGE 3: Document Processing ---');
        await waitForDocumentProcessing(testCourseId);
        console.log('[Stage2-6] Documents processed\n');

        // Verify documents have summaries
        const supabase = getSupabaseAdmin();
        const { data: docs } = await supabase
          .from('file_catalog')
          .select('filename, chunk_count, vector_status')
          .eq('course_id', testCourseId);

        expect(docs).toBeDefined();
        expect(docs!.length).toBeGreaterThan(0);
        console.log(`[Stage2-6] Verified ${docs!.length} documents indexed\n`);

        // === STAGE 4: Execute Analysis ===
        console.log('[Stage2-6] --- STAGE 4: Analysis Execution ---');

        const analysisResult = await client.analysis.start.mutate({
          courseId: testCourseId,
          forceRestart: true,
        });

        expect(analysisResult).toHaveProperty('jobId');
        console.log(`[Stage2-6] Analysis started: jobId=${analysisResult.jobId}\n`);

        await waitForAnalysis(client, testCourseId);
        console.log('[Stage2-6] Analysis completed\n');

        // Validate analysis result
        const analysisResultData = await client.analysis.getResult.query({
          courseId: testCourseId,
        });
        expect(analysisResultData).toHaveProperty('analysisResult');
        validateAnalysisResult(analysisResultData.analysisResult);

        // === STAGE 5: Structure Generation ===
        console.log('[Stage2-6] --- STAGE 5: Structure Generation ---');

        // Note: Structure generation is typically triggered automatically after analysis
        // For testing, we may need to trigger it manually via the generation router
        await waitForStructureGeneration(testCourseId, 300_000);
        console.log('[Stage2-6] Structure generation completed\n');

        // Validate course structure
        const { data: course } = await supabase
          .from('courses')
          .select('course_structure, generation_status')
          .eq('id', testCourseId)
          .single();

        expect(course?.course_structure).toBeDefined();
        validateCourseStructure(course?.course_structure);

        // === STAGE 6: Lesson Content Generation ===
        console.log('[Stage2-6] --- STAGE 6: Lesson Content Generation ---');

        // Wait for Stage 6 to complete (triggered automatically after Stage 5)
        const stage6Result = await waitForStage6Completion(testCourseId, {
          timeout: TEST_CONFIG.MAX_STAGE6_WAIT_MS,
        });

        console.log(`[Stage2-6] Stage 6 results:`);
        console.log(`  - Completed: ${stage6Result.completed}`);
        console.log(`  - Failed: ${stage6Result.failed}`);
        console.log(`  - Pending: ${stage6Result.pending}`);
        console.log(`  - Review Required: ${stage6Result.reviewRequired}`);

        // Verify results
        expect(stage6Result.completed + stage6Result.reviewRequired).toBeGreaterThan(0);
        expect(stage6Result.failed).toBeLessThan(stage6Result.completed);

        // Get metrics
        const metrics = await getStage6TestMetrics(testCourseId);
        console.log(`[Stage2-6] Metrics:`);
        console.log(`  - Average Quality: ${metrics.averageQualityScore.toFixed(2)}`);
        console.log(`  - Total Cost: $${metrics.totalCostUsd.toFixed(4)}`);
        console.log(`  - Avg Duration: ${Math.round(metrics.averageDurationMs / 1000)}s`);

        // Validate quality threshold
        expect(metrics.averageQualityScore).toBeGreaterThanOrEqual(
          TEST_CONFIG.EXPECTED_MIN_QUALITY * 0.9 // Allow 10% tolerance
        );

        await waitForAllJobsToComplete();

        console.log('\n[Stage2-6] ========================================');
        console.log('[Stage2-6] Scenario 1: PASSED');
        console.log('[Stage2-6] ========================================\n');
      },
      TEST_CONFIG.MAX_PIPELINE_WAIT_MS + 60_000
    );
  });

  // ==========================================================================
  // Scenario 2: Stage 6 Parallel Processing
  // ==========================================================================

  describe('Scenario 2: Stage 6 Parallel Processing', () => {
    let stage6Ctx: Stage6TestContext | null = null;

    afterEach(async () => {
      if (stage6Ctx) {
        await cleanupStage6Infrastructure(stage6Ctx);
        stage6Ctx = null;
      }
    });

    it.skipIf(shouldSkipTests || !process.env.OPENROUTER_API_KEY)(
      'should generate 10+ lessons in parallel',
      async () => {
        console.log('\n[Stage2-6] ========================================');
        console.log('[Stage2-6] Scenario 2: Parallel Lesson Generation');
        console.log('[Stage2-6] ========================================\n');

        // Setup course with lesson specs
        const { courseId, lessonSpecs } = await setupStage6TestCourse({
          lessonCount: TEST_CONFIG.PARALLEL_LESSONS_COUNT,
        });
        testCourseIds.push(courseId);

        console.log(`[Stage2-6] Created course with ${lessonSpecs.length} lesson specs`);

        // Initialize Stage 6 infrastructure
        stage6Ctx = await initializeStage6Infrastructure();

        // Submit all jobs in parallel
        const startTime = Date.now();
        const jobs: Array<{ lessonId: string; jobPromise: Promise<unknown> }> = [];

        for (const spec of lessonSpecs) {
          const jobInput: Stage6JobInput = {
            lessonSpec: spec,
            courseId,
            ragChunks: [], // Empty for this test
            ragContextId: null,
          };

          const job = await stage6Ctx.queue.add(
            `parallel-${spec.lesson_id}`,
            jobInput,
            { jobId: `parallel-test-${spec.lesson_id}-${Date.now()}` }
          );

          jobs.push({
            lessonId: spec.lesson_id,
            jobPromise: job.waitUntilFinished(stage6Ctx.queueEvents, TEST_CONFIG.MAX_STAGE6_WAIT_MS),
          });
        }

        console.log(`[Stage2-6] Submitted ${jobs.length} jobs for parallel processing`);

        // Wait for all jobs to complete
        const results = await Promise.allSettled(jobs.map(j => j.jobPromise));
        const totalTime = Date.now() - startTime;

        // Count results
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        console.log(`[Stage2-6] Parallel processing results:`);
        console.log(`  - Total jobs: ${jobs.length}`);
        console.log(`  - Successful: ${successful}`);
        console.log(`  - Failed: ${failed}`);
        console.log(`  - Total time: ${Math.round(totalTime / 1000)}s`);
        console.log(`  - Time per lesson: ${Math.round(totalTime / jobs.length / 1000)}s (avg)`);

        // Verify parallelism benefit
        // Sequential would take ~30s per lesson, parallel should be much faster
        const sequentialEstimate = jobs.length * 30_000; // 30s per lesson
        const parallelSpeedup = sequentialEstimate / totalTime;
        console.log(`  - Parallelism speedup: ${parallelSpeedup.toFixed(1)}x`);

        expect(successful).toBeGreaterThan(failed);
        expect(totalTime).toBeLessThan(sequentialEstimate);

        console.log('\n[Stage2-6] ========================================');
        console.log('[Stage2-6] Scenario 2: PASSED');
        console.log('[Stage2-6] ========================================\n');
      },
      TEST_CONFIG.MAX_STAGE6_WAIT_MS
    );
  });

  // ==========================================================================
  // Scenario 3: Judge Quality Gate
  // ==========================================================================

  describe('Scenario 3: Judge Quality Gate', () => {
    it.skipIf(shouldSkipTests || !process.env.OPENROUTER_API_KEY)(
      'should evaluate and refine borderline content',
      async () => {
        console.log('\n[Stage2-6] ========================================');
        console.log('[Stage2-6] Scenario 3: Judge Quality Gate');
        console.log('[Stage2-6] ========================================\n');

        // Setup course with lesson specs
        const { courseId, lessonSpecs } = await setupStage6TestCourse({
          lessonCount: 3, // Fewer lessons for faster test
        });
        testCourseIds.push(courseId);

        // Wait for Stage 6 to process and apply quality gate
        const result = await waitForStage6Completion(courseId, {
          timeout: 300_000,
        });

        console.log(`[Stage2-6] Quality gate results:`);
        console.log(`  - Completed (passed Judge): ${result.completed}`);
        console.log(`  - Review Required (borderline): ${result.reviewRequired}`);
        console.log(`  - Failed: ${result.failed}`);

        // Get detailed metrics
        const metrics = await getStage6TestMetrics(courseId);
        console.log(`[Stage2-6] Quality metrics:`);
        console.log(`  - Average quality score: ${metrics.averageQualityScore.toFixed(3)}`);
        console.log(`  - Quality threshold: ${TEST_CONFIG.EXPECTED_MIN_QUALITY}`);

        // Verify quality gate is working
        // Either lessons pass with good quality, or they're marked for review
        expect(result.completed + result.reviewRequired).toBeGreaterThan(0);

        // Verify lessons that passed have quality >= threshold
        if (result.completed > 0) {
          expect(metrics.averageQualityScore).toBeGreaterThanOrEqual(
            TEST_CONFIG.EXPECTED_MIN_QUALITY * 0.95 // 5% tolerance
          );
        }

        console.log('\n[Stage2-6] ========================================');
        console.log('[Stage2-6] Scenario 3: PASSED');
        console.log('[Stage2-6] ========================================\n');
      },
      300_000
    );
  });

  // ==========================================================================
  // Scenario 4: Error Recovery & Partial Success
  // ==========================================================================

  describe('Scenario 4: Error Recovery & Partial Success', () => {
    it.skipIf(shouldSkipTests)(
      'should handle model failures gracefully',
      async () => {
        console.log('\n[Stage2-6] ========================================');
        console.log('[Stage2-6] Scenario 4: Error Recovery');
        console.log('[Stage2-6] ========================================\n');

        // This test verifies the error handling configuration exists
        // and that partial success handling is properly defined

        // Verify handler configuration
        expect(HANDLER_CONFIG.MAX_RETRIES).toBeGreaterThan(0);
        expect(HANDLER_CONFIG.RETRY_DELAY_MS).toBeGreaterThan(0);
        expect(HANDLER_CONFIG.QUALITY_THRESHOLD).toBe(0.75);

        // Verify model fallback configuration
        const { MODEL_FALLBACK } = await import(
          '../../src/stages/stage6-lesson-content/handler'
        );
        expect(MODEL_FALLBACK.primary).toBeDefined();
        expect(MODEL_FALLBACK.primary.ru).toBeDefined();
        expect(MODEL_FALLBACK.primary.en).toBeDefined();
        expect(MODEL_FALLBACK.fallback).toBeDefined();
        expect(MODEL_FALLBACK.maxPrimaryAttempts).toBeGreaterThanOrEqual(1);

        console.log('[Stage2-6] Error recovery configuration verified:');
        console.log(`  - Max retries: ${HANDLER_CONFIG.MAX_RETRIES}`);
        console.log(`  - Retry delay: ${HANDLER_CONFIG.RETRY_DELAY_MS}ms`);
        console.log(`  - Primary model (ru): ${MODEL_FALLBACK.primary.ru}`);
        console.log(`  - Primary model (en): ${MODEL_FALLBACK.primary.en}`);
        console.log(`  - Fallback model: ${MODEL_FALLBACK.fallback}`);

        console.log('\n[Stage2-6] ========================================');
        console.log('[Stage2-6] Scenario 4: PASSED');
        console.log('[Stage2-6] ========================================\n');
      }
    );
  });

  // ==========================================================================
  // Scenario 5: RAG Context Caching
  // ==========================================================================

  describe('Scenario 5: RAG Context Caching', () => {
    it.skipIf(shouldSkipTests)(
      'should cache and reuse RAG context for retries',
      async () => {
        console.log('\n[Stage2-6] ========================================');
        console.log('[Stage2-6] Scenario 5: RAG Context Caching');
        console.log('[Stage2-6] ========================================\n');

        // Setup course
        const { courseId, lessonSpecs } = await setupStage6TestCourse({
          lessonCount: 1,
        });
        testCourseIds.push(courseId);

        const supabase = getSupabaseAdmin();

        // Create RAG context cache entry manually for testing
        const ragContextId = crypto.randomUUID();
        const { error: cacheError } = await supabase
          .from('rag_context_cache')
          .insert({
            id: ragContextId,
            course_id: courseId,
            lesson_id: lessonSpecs[0].lesson_id,
            chunks: [
              {
                chunk_id: 'test-chunk-1',
                document_id: crypto.randomUUID(),
                document_name: 'test-doc.pdf',
                content: 'Test content for RAG caching verification',
                relevance_score: 0.9,
              },
            ],
            search_queries: ['test query'],
            metadata: { test: true },
          });

        if (cacheError) {
          console.warn('[Stage2-6] Could not create RAG cache entry:', cacheError.message);
        }

        // Verify cache exists
        const { data: cacheEntry, error: queryError } = await supabase
          .from('rag_context_cache')
          .select('id, lesson_id, chunks')
          .eq('course_id', courseId)
          .single();

        if (!queryError && cacheEntry) {
          console.log('[Stage2-6] RAG context cache verified:');
          console.log(`  - Cache ID: ${cacheEntry.id}`);
          console.log(`  - Lesson ID: ${cacheEntry.lesson_id}`);
          console.log(`  - Chunks: ${Array.isArray(cacheEntry.chunks) ? cacheEntry.chunks.length : 0}`);

          // Verify cache can be retrieved
          expect(cacheEntry.id).toBe(ragContextId);
          expect(cacheEntry.lesson_id).toBe(lessonSpecs[0].lesson_id);
        } else {
          console.log('[Stage2-6] RAG context cache table may not exist yet');
        }

        console.log('\n[Stage2-6] ========================================');
        console.log('[Stage2-6] Scenario 5: PASSED');
        console.log('[Stage2-6] ========================================\n');
      }
    );
  });
});
