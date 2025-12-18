/**
 * E2E Test: T055 - Full Pipeline Validation
 * @module tests/e2e/t055-full-pipeline
 *
 * Test Objective: Validate the complete end-to-end workflow from document upload
 * through Stage 4 analysis using real test documents.
 *
 * Test Coverage:
 * - Stage 2: Document upload and file_catalog creation
 * - Stage 3: Document processing, summarization, and Qdrant vector creation
 * - Stage 4: Multi-phase analysis execution and result validation
 * - Full pipeline: RAG, vector database, and analysis workflow integration
 *
 * Test Files (from /docs/test):
 * - Письмо Минфина России от 31.01.2025 № 24 -01-06-8697.pdf (PDF, 636KB, 23 pages)
 * - Постановление Правительства РФ от 23.12.2024 N 1875.txt (TXT, 281KB)
 * - Презентация и обучение.txt (TXT, 71KB, UTF-8)
 *
 * Prerequisites:
 * - Supabase database accessible
 * - Qdrant vector database running
 * - Redis running (for BullMQ)
 * - BullMQ worker running
 * - Test documents available in /docs/test
 * - Docling MCP server running (for PDF processing)
 *
 * Test execution: pnpm test tests/e2e/t055-full-pipeline.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../src/server/app-router';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import {
  setupTestFixtures,
  cleanupTestFixtures,
  cleanupTestJobs,
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
import { getQueue } from '../../src/orchestrator/queue';

// Get repo root for test file paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const TEST_DOCS_DIR = path.join(REPO_ROOT, 'docs/test');

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
        console.log(`[T055] Test tRPC server started on port ${port}`);
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
        console.log(`[T055] Test tRPC server stopped (port ${testServer.port})`);
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
 * Create test course
 */
async function createTestCourse(title: string, topic: string): Promise<string> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('courses')
    .insert({
      organization_id: TEST_ORGS.premium.id,
      user_id: TEST_USERS.instructor1.id,
      title,
      slug: `t055-test-${Date.now()}`,
      generation_status: 'processing_documents',
      generation_progress: {
        steps: [
          { status: 'pending' },
          { status: 'pending' },
          { status: 'pending' },
          { status: 'pending' },
          { status: 'pending' },
        ],
        percentage: 0,
        current_step: 0,
        message: 'Инициализация',
        has_documents: true,
      },
      language: 'ru', // Russian for test documents
      style: 'professional',
      target_audience: 'intermediate',
      difficulty: 'medium',
      settings: {
        topic,
        answers: 'Подготовить подробный курс по нормативно-правовым актам',
        lesson_duration_minutes: 30,
      },
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create test course: ${error.message}`);
  }

  console.log(`[T055] Created test course: ${data.id}`);
  return data.id;
}

/**
 * Upload document to course
 */
async function uploadDocument(
  client: ReturnType<typeof createTestClient>,
  courseId: string,
  filePath: string,
  fileName: string
): Promise<string> {
  // Read file and convert to base64
  const fileBuffer = await fs.readFile(filePath);
  const base64Content = fileBuffer.toString('base64');

  console.log(`[T055] Uploading document: ${fileName} (${fileBuffer.length} bytes)`);

  // Create file hash (required field)
  const crypto = await import('crypto');
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // Determine mime type
  const mimeType = fileName.endsWith('.pdf') ? 'application/pdf' : 'text/plain';
  const fileType = fileName.endsWith('.pdf') ? 'pdf' : 'txt';

  // Upload via tRPC (this would normally be via generation.uploadFile)
  // For now, we'll insert directly into file_catalog and copy file to disk
  const supabase = getSupabaseAdmin();

  // Match production storage_path format: uploads/{org_id}/{course_id}/{filename}
  const storagePath = `uploads/${TEST_ORGS.premium.id}/${courseId}/${fileName}`;
  const path = await import('path');
  const absoluteStoragePath = path.join(process.cwd(), storagePath);

  // Create directory structure
  const storageDir = path.dirname(absoluteStoragePath);
  await fs.mkdir(storageDir, { recursive: true });

  // Copy file to storage location
  await fs.copyFile(filePath, absoluteStoragePath);
  console.log(`[T055] File copied to: ${absoluteStoragePath}`);

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
    // Clean up file on error
    try {
      await fs.unlink(absoluteStoragePath);
    } catch {}
    throw new Error(`Failed to upload document ${fileName}: ${error.message}`);
  }

  console.log(`[T055] Document uploaded: ${fileName} → ${data.id}`);
  return data.id;
}

/**
 * Wait for document processing to complete
 */
async function waitForDocumentProcessing(
  courseId: string,
  timeoutMs: number = 300000 // 5 minutes
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const startTime = Date.now();
  const checkInterval = 5000; // Check every 5 seconds

  console.log(`[T055] Waiting for document processing (timeout: ${timeoutMs / 1000}s)...`);

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
      `[T055] Document processing status: ${completedDocs}/${totalDocs} completed, ${failedDocs} failed`
    );

    // Check if all documents are processed (summarized or failed)
    const allProcessed = documents?.every(d =>
      d.processed_content !== null || d.vector_status === 'failed'
    );

    if (allProcessed && totalDocs > 0) {
      if (failedDocs > 0) {
        throw new Error(`${failedDocs} documents failed to process`);
      }

      console.log(`[T055] All ${totalDocs} documents processed successfully`);

      // IMPORTANT: Wait for BullMQ jobs to fully complete (including RPC calls)
      // This prevents race condition where test deletes course while jobs are finishing
      console.log('[T055] Waiting additional 3 seconds for jobs to fully complete...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      return;
    }

    // Wait before next check
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }

  throw new Error(`Document processing timeout after ${timeoutMs / 1000}s`);
}

/**
 * Wait for all BullMQ jobs to reach terminal state (completed/failed)
 *
 * This prevents race conditions where:
 * - Test completes and starts cleanup (deleting course)
 * - But background jobs are still finishing (RPC calls to update course progress)
 * - Jobs fail because course no longer exists
 *
 * @param timeoutMs Maximum time to wait (default: 60 seconds)
 */
async function waitForAllJobsToComplete(
  timeoutMs: number = 60000
): Promise<void> {
  const startTime = Date.now();
  const checkInterval = 2000; // Check every 2 seconds
  const queue = getQueue();

  console.log('[T055] Waiting for all BullMQ jobs to complete...');

  while (Date.now() - startTime < timeoutMs) {
    const counts = await queue.getJobCounts('active', 'waiting', 'delayed');
    const activeJobs = counts.active + counts.waiting + counts.delayed;

    if (activeJobs === 0) {
      console.log('[T055] ✓ All BullMQ jobs completed');
      return;
    }

    console.log(`[T055] ${activeJobs} jobs still running (active: ${counts.active}, waiting: ${counts.waiting}, delayed: ${counts.delayed})`);
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }

  // Timeout reached - log warning but don't fail test
  const finalCounts = await queue.getJobCounts('active', 'waiting', 'delayed');
  console.warn(`[T055] WARNING: Timeout waiting for jobs to complete. Remaining: ${finalCounts.active} active, ${finalCounts.waiting} waiting, ${finalCounts.delayed} delayed`);
}

/**
 * Verify Qdrant vectors were created
 */
async function verifyQdrantVectors(courseId: string): Promise<void> {
  // Verify documents have been indexed with vector chunks
  const supabase = getSupabaseAdmin();

  const { data: documents, error } = await supabase
    .from('file_catalog')
    .select('id, filename, chunk_count, vector_status')
    .eq('course_id', courseId)
    .eq('vector_status', 'indexed');

  if (error) {
    throw new Error(`Failed to verify documents: ${error.message}`);
  }

  if (!documents || documents.length === 0) {
    throw new Error('No processed documents found');
  }

  // Verify all documents have chunks (vectorized)
  const docsWithoutChunks = documents.filter(d => !d.chunk_count || d.chunk_count === 0);
  if (docsWithoutChunks.length > 0) {
    throw new Error(
      `${docsWithoutChunks.length} documents missing chunks: ${docsWithoutChunks.map(d => d.filename).join(', ')}`
    );
  }

  const totalChunks = documents.reduce((sum, d) => sum + (d.chunk_count || 0), 0);
  console.log(`[T055] ✓ Verified ${documents.length} documents indexed (${totalChunks} total vectors)`);
}

/**
 * Wait for analysis to complete
 */
async function waitForAnalysis(
  client: ReturnType<typeof createTestClient>,
  courseId: string,
  timeoutMs: number = 600000 // 10 minutes
): Promise<void> {
  const startTime = Date.now();
  const checkInterval = 10000; // Check every 10 seconds

  console.log(`[T055] Waiting for analysis (timeout: ${timeoutMs / 1000}s)...`);

  while (Date.now() - startTime < timeoutMs) {
    const status = await client.analysis.getStatus.query({ courseId });

    console.log(`[T055] Analysis status: ${status.status}, progress: ${status.progress}%`);

    // Check if analysis is complete
    // Analysis success = transition to 'generating_structure' (ready for content generation)
    // or 'completed'/'ready' (when full pipeline is implemented)
    if (status.status === 'generating_structure' || status.status === 'completed' || status.status === 'ready') {
      console.log(`[T055] Analysis completed successfully (status: ${status.status})`);
      return;
    }

    // Check for failure
    if (status.status === 'failed') {
      throw new Error('Analysis failed');
    }

    // Wait before next check
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }

  throw new Error(`Analysis timeout after ${timeoutMs / 1000}s`);
}

/**
 * Validate analysis result structure
 */
function validateAnalysisResult(result: any): void {
  console.log(`[T055] Validating analysis result structure...`);

  // Required top-level fields
  expect(result).toHaveProperty('course_category');
  expect(result).toHaveProperty('contextual_language');
  expect(result).toHaveProperty('topic_analysis');
  expect(result).toHaveProperty('recommended_structure');
  expect(result).toHaveProperty('pedagogical_strategy');
  expect(result).toHaveProperty('scope_instructions');
  expect(result).toHaveProperty('content_strategy');
  expect(result).toHaveProperty('research_flags');
  expect(result).toHaveProperty('metadata');

  // Validate course_category
  expect(result.course_category).toHaveProperty('primary');
  expect(result.course_category.primary).toBeTypeOf('string');
  expect(result.course_category).toHaveProperty('confidence');
  expect(result.course_category.confidence).toBeGreaterThanOrEqual(0);
  expect(result.course_category.confidence).toBeLessThanOrEqual(1);

  // Validate recommended_structure
  expect(result.recommended_structure).toHaveProperty('total_lessons');
  expect(result.recommended_structure.total_lessons).toBeGreaterThanOrEqual(10);
  expect(result.recommended_structure).toHaveProperty('total_sections');
  expect(result.recommended_structure).toHaveProperty('sections_breakdown');
  expect(Array.isArray(result.recommended_structure.sections_breakdown)).toBe(true);

  // Validate metadata
  expect(result.metadata).toHaveProperty('analysis_version');
  expect(result.metadata).toHaveProperty('total_duration_ms');
  expect(result.metadata).toHaveProperty('total_tokens');
  expect(result.metadata.total_tokens).toHaveProperty('input');
  expect(result.metadata.total_tokens).toHaveProperty('output');
  expect(result.metadata.total_tokens).toHaveProperty('total');
  expect(result.metadata).toHaveProperty('total_cost_usd');

  console.log(`[T055] Analysis result validation passed ✓`);
  console.log(`[T055] Result summary:`);
  console.log(`  - Category: ${result.course_category.primary}`);
  console.log(`  - Total lessons: ${result.recommended_structure.total_lessons}`);
  console.log(`  - Total sections: ${result.recommended_structure.total_sections}`);
  console.log(`  - Research flags: ${result.research_flags?.length || 0}`);
  console.log(`  - Duration: ${result.metadata.total_duration_ms}ms`);
  console.log(`  - Total tokens: ${result.metadata.total_tokens.total}`);
  console.log(`  - Cost: $${result.metadata.total_cost_usd.toFixed(4)}`);
}

// ============================================================================
// Test Suite
// ============================================================================

describe('E2E: T055 - Full Pipeline Validation', () => {
  let testServer: TestServer;
  let serverPort: number;
  let testCourseId: string;
  let authToken: string;

  beforeAll(async () => {
    console.log('[T055] ========================================');
    console.log('[T055] Setting up E2E full pipeline test...');
    console.log('[T055] ========================================');

    // Clean up BullMQ jobs from Redis (leftover from previous test runs)
    // Use obliterate=true to force-remove ALL jobs including active ones
    await cleanupTestJobs(true);

    // Clean up existing test data
    await cleanupTestFixtures();

    // Setup test fixtures
    await setupTestFixtures();

    // Get auth token
    authToken = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');

    // Start tRPC server
    testServer = await startTestServer();
    serverPort = testServer.port;

    // NOTE: Worker is already running via global-setup.ts
    // Do NOT start a second worker here - it causes job lock conflicts
    console.log('[T055] Using global BullMQ worker from vitest global setup');

    console.log('[T055] Test server ready');
  }, 60000);

  afterAll(async () => {
    console.log('[T055] ========================================');
    console.log('[T055] Tearing down E2E full pipeline test...');
    console.log('[T055] ========================================');

    // Clean up uploaded files
    if (testCourseId) {
      const path = await import('path');
      const uploadDir = path.join(process.cwd(), `uploads/${TEST_ORGS.premium.id}/${testCourseId}`);
      try {
        await fs.rm(uploadDir, { recursive: true, force: true });
        console.log(`[T055] Cleaned up uploads directory: ${uploadDir}`);
      } catch (error) {
        // Ignore if directory doesn't exist
      }
    }

    // Clean up test course
    if (testCourseId) {
      const supabase = getSupabaseAdmin();
      await supabase.from('courses').delete().eq('id', testCourseId);
      console.log(`[T055] Cleaned up test course: ${testCourseId}`);
    }

    // Clean up jobs (obliterate=true to ensure complete cleanup)
    await cleanupTestJobs(true);

    // NOTE: Worker is managed by global-setup.ts teardown
    // Do NOT stop it here

    // Stop server
    if (testServer) {
      await stopTestServer(testServer);
    }

    // Cleanup fixtures
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
        }
      }
    } catch (error) {
      console.warn('[T055] Warning: Could not cleanup auth users:', error);
    }
  }, 60000);

  it('should complete full pipeline from upload to analysis', async () => {
    console.log('\n[T055] ========================================');
    console.log('[T055] TEST: Full Pipeline Validation');
    console.log('[T055] ========================================\n');

    const client = createTestClient(serverPort, authToken);

    // ============================================================
    // STAGE 2: Create Course and Upload Documents
    // ============================================================
    console.log('[T055] --- STAGE 2: Document Upload ---');

    const courseTopic = 'Нормативно-правовые акты РФ: Письма Минфина и Постановления Правительства';
    testCourseId = await createTestCourse(
      'Тест: Нормативные акты РФ 2024-2025',
      courseTopic
    );

    // Upload test documents
    const testDocs = [
      {
        path: path.join(TEST_DOCS_DIR, 'Письмо Минфина России от 31.01.2025 № 24 -01-06-8697.pdf'),
        name: 'Письмо Минфина России от 31.01.2025 № 24 -01-06-8697.pdf',
      },
      {
        path: path.join(
          TEST_DOCS_DIR,
          'Постановление Правительства РФ от 23.12.2024 N 1875 О мерах по предоставлению национального режима.txt'
        ),
        name: 'Постановление Правительства РФ от 23.12.2024 N 1875.txt',
      },
      {
        path: path.join(TEST_DOCS_DIR, 'Презентация и обучение.txt'),
        name: 'Презентация и обучение.txt',
      },
    ];

    // Verify test documents exist
    for (const doc of testDocs) {
      try {
        await fs.access(doc.path);
      } catch {
        throw new Error(`Test document not found: ${doc.path}`);
      }
    }

    const uploadedDocIds: string[] = [];
    for (const doc of testDocs) {
      const docId = await uploadDocument(client, testCourseId, doc.path, doc.name);
      uploadedDocIds.push(docId);
    }

    expect(uploadedDocIds).toHaveLength(3);
    console.log(`[T055] ✓ Uploaded ${uploadedDocIds.length} documents\n`);

    // Initiate processing to create DOCUMENT_PROCESSING job
    console.log('[T055] Initiating document processing...');
    const initiateResult = await client.generation.initiate.mutate({
      courseId: testCourseId,
      webhookUrl: null,
    });

    if (!initiateResult.jobId) {
      throw new Error('Failed to initiate processing: no jobId returned');
    }

    console.log(`[T055] ✓ Processing initiated: jobId=${initiateResult.jobId}\n`);

    // ============================================================
    // STAGE 3: Wait for Document Processing
    // ============================================================
    console.log('[T055] --- STAGE 3: Document Processing ---');

    await waitForDocumentProcessing(testCourseId);
    console.log('[T055] ✓ All documents processed\n');

    // Verify Qdrant vectors (check processed_content)
    await verifyQdrantVectors(testCourseId);
    console.log('[T055] ✓ Verified document summaries exist\n');

    // ============================================================
    // STAGE 4: Execute Analysis
    // ============================================================
    console.log('[T055] --- STAGE 4: Analysis Execution ---');

    // Start analysis (use forceRestart=true for test idempotency)
    const analysisResult = await client.analysis.start.mutate({
      courseId: testCourseId,
      forceRestart: true,
    });

    expect(analysisResult).toHaveProperty('jobId');
    expect(analysisResult).toHaveProperty('status', 'started');
    console.log(`[T055] ✓ Analysis started: jobId=${analysisResult.jobId}\n`);

    // Wait for analysis to complete
    await waitForAnalysis(client, testCourseId);

    // IMPORTANT: Wait for BullMQ jobs to fully complete before teardown
    // This prevents race condition where test cleanup deletes course while jobs are finishing
    // Same pattern as used in waitForDocumentProcessing (lines 351-354)
    await waitForAllJobsToComplete();

    console.log('[T055] ✓ Analysis completed\n');

    // ============================================================
    // Validate Analysis Result
    // ============================================================
    console.log('[T055] --- Analysis Result Validation ---');

    const result = await client.analysis.getResult.query({ courseId: testCourseId });

    expect(result).toHaveProperty('analysisResult');
    expect(result.analysisResult).not.toBeNull();

    validateAnalysisResult(result.analysisResult);

    // ============================================================
    // Wait for all background jobs to complete before cleanup
    // ============================================================
    console.log('\n[T055] --- Final: Job Completion Wait ---');
    await waitForAllJobsToComplete();

    console.log('\n[T055] ========================================');
    console.log('[T055] ✓✓✓ FULL PIPELINE TEST PASSED ✓✓✓');
    console.log('[T055] ========================================\n');
  }, 900000); // 15 minutes timeout for full E2E test
});
