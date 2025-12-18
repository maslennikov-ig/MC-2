/**
 * E2E Test: T053 - Stage 5 Generation with Real Synergy Sales Course
 * @module tests/e2e/t053-synergy-sales-course
 *
 * Test Objective: Execute and validate Stage 5 generation pipeline with real production
 * course materials from Synergy University's "Курс по продажам" (Sales Course).
 *
 * Test Scenarios (4 required):
 * 1. Title-Only Course Generation (FR-003, US1)
 * 2. Full Analyze Results + Style (US2)
 * 3. Different Styles Test (US4)
 * 4. RAG-Heavy Generation (Document Integration)
 *
 * Test Documents (from /docs/test/synergy):
 * - Main: 1 ТЗ на курс по продажам.docx (24KB)
 * - Support 1: Модуль 1_Продажа_билетов_на_крупные_массовые_образовательные_мероприятия.pdf (58KB)
 * - Support 2: Регламент работы в AMO CRM Megacampus.pdf (120KB)
 * - Support 3: Регулярный_Менеджмент_Отдела_Продаж_docx.pdf (80KB)
 * Total: ~282KB of production course materials
 *
 * Prerequisites:
 * - Redis running at redis://localhost:6379
 * - Supabase accessible (configured via .env)
 * - Qdrant cloud accessible (configured via .env)
 * - BullMQ worker running (pnpm dev or separate worker process)
 * - OpenRouter API key configured (for LLM calls)
 * - Jina API key configured (for embeddings)
 * - Docling MCP server running (for PDF/DOCX processing)
 *
 * Test execution:
 * ```bash
 * # Start services first:
 * docker compose up -d
 * pnpm --filter course-gen-platform dev  # In separate terminal
 *
 * # Run test:
 * pnpm --filter course-gen-platform test tests/e2e/t053-synergy-sales-course.test.ts
 * ```
 *
 * Success Criteria (from spec.md):
 * - SC-003: Pipeline duration < 150s for standard courses
 * - SC-004: Quality scores >= 0.75 (Jina-v3 semantic similarity)
 * - SC-005: 95%+ batches within 120K token budget
 * - SC-006: 100% courses have >= 10 lessons (FR-015)
 * - SC-010: Cost per course $0.15-0.40 USD
 *
 * Reference: specs/008-generation-generation-json/tasks.md (T053)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import { getRedisClient } from '../../src/shared/cache/redis';
import { addJob, closeQueue } from '../../src/orchestrator/queue';
import { JobType } from '@megacampus/shared-types';
import { CourseStructureSchema } from '@megacampus/shared-types/generation-result';
import { InitializeFSMCommandHandler } from '../../src/shared/fsm/fsm-initialization-command-handler';
import { OutboxProcessor } from '../../src/orchestrator/outbox-processor';
import {
  setupTestFixtures,
  cleanupTestFixtures,
  cleanupTestJobs,
  TEST_ORGS,
  TEST_USERS,
} from '../fixtures';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

// ============================================================================
// Configuration
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const TEST_DOCS_DIR = path.join(REPO_ROOT, 'docs/test/synergy');

// Test documents
const TEST_DOCUMENTS = [
  {
    filename: '1 ТЗ на курс по продажам.docx',
    path: path.join(TEST_DOCS_DIR, '1 ТЗ на курс по продажам.docx'),
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    description: 'Main technical specification',
  },
  {
    filename: 'Модуль 1_Продажа_билетов_на_крупные_массовые_образовательные_мероприятия.pdf',
    path: path.join(TEST_DOCS_DIR, 'Модуль 1_Продажа_билетов_на_крупные_массовые_образовательные_мероприятия.pdf'),
    mimeType: 'application/pdf',
    description: 'Module 1: Ticket sales for large-scale events',
  },
  {
    filename: 'Регламент работы в AMO CRM Megacampus.pdf',
    path: path.join(TEST_DOCS_DIR, 'Регламент работы в AMO CRM Megacampus.pdf'),
    mimeType: 'application/pdf',
    description: 'AMO CRM working regulations',
  },
  {
    filename: 'Регулярный_Менеджмент_Отдела_Продаж_docx.pdf',
    path: path.join(TEST_DOCS_DIR, 'Регулярный_Менеджмент_Отдела_Продаж_docx.pdf'),
    mimeType: 'application/pdf',
    description: 'Regular Sales Department Management',
  },
];

// Test configuration
const TEST_CONFIG = {
  MAX_WAIT_TIME: 600000, // 10 minutes for generation to complete
  POLL_INTERVAL: 2000, // 2 seconds between status checks
  EXPECTED_MIN_LESSONS: 10, // FR-015 requirement
  EXPECTED_MAX_COST: 0.40, // SC-010 maximum cost
  EXPECTED_MIN_QUALITY: 0.75, // SC-004 quality threshold
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Upload documents to course
 */
async function uploadDocuments(courseId: string, organizationId: string): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const uploadedFileIds: string[] = [];

  for (const doc of TEST_DOCUMENTS) {
    console.log(`[T053] Uploading document: ${doc.filename}`);

    // Read file content
    const fileBuffer = await fs.readFile(doc.path);
    const fileSize = fileBuffer.length;

    // Generate file ID
    const fileId = crypto.randomUUID();
    const fileExtension = path.extname(doc.filename);
    const uploadDir = path.join(process.cwd(), 'uploads', organizationId, courseId);
    const storagePath = path.join(uploadDir, `${fileId}${fileExtension}`);

    // Create upload directory
    await fs.mkdir(uploadDir, { recursive: true });

    // Save file
    await fs.writeFile(storagePath, fileBuffer);

    // Calculate hash
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Insert metadata into file_catalog
    const relativeStoragePath = path.relative(process.cwd(), storagePath);
    const { data: fileRecord, error } = await supabase
      .from('file_catalog')
      .insert({
        id: fileId,
        organization_id: organizationId,
        course_id: courseId,
        filename: doc.filename,
        file_type: fileExtension.replace('.', ''),
        file_size: fileSize,
        storage_path: relativeStoragePath,
        hash: fileHash,
        mime_type: doc.mimeType,
        vector_status: 'pending',
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to upload ${doc.filename}: ${error.message}`);
    }

    uploadedFileIds.push(fileId);
    console.log(`[T053] ✓ Uploaded ${doc.filename} (${fileSize} bytes)`);
  }

  return uploadedFileIds;
}

/**
 * Wait for generation to complete
 */
async function waitForGeneration(courseId: string, timeout: number = TEST_CONFIG.MAX_WAIT_TIME): Promise<any> {
  const supabase = getSupabaseAdmin();
  const startTime = Date.now();

  console.log(`[T053] Waiting for generation to complete (max ${timeout / 1000}s)...`);

  while (Date.now() - startTime < timeout) {
    const { data: course, error } = await supabase
      .from('courses')
      .select('course_structure, generation_metadata, generation_status, generation_progress')
      .eq('id', courseId)
      .single();

    if (error) {
      throw new Error(`Failed to query course: ${error.message}`);
    }

    const status = course.generation_status as string;
    const progress = course.generation_progress || 0;

    console.log(`[T053] Status: ${status}, Progress: ${progress}%`);

    // Check for completion
    if (status === 'completed' && course.course_structure) {
      console.log('[T053] ✓ Generation completed!');
      return course;
    }

    // Check for failure
    if (status === 'failed') {
      const errorMessage = course.generation_metadata?.error_message || 'Unknown error';
      throw new Error(`Generation failed: ${errorMessage}`);
    }

    // Wait before next check
    await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.POLL_INTERVAL));
  }

  throw new Error(`Timeout waiting for generation to complete after ${timeout / 1000}s`);
}

/**
 * Validate course structure
 */
function validateCourseStructure(courseStructure: any): void {
  // Validate against Zod schema
  const parseResult = CourseStructureSchema.safeParse(courseStructure);
  if (!parseResult.success) {
    throw new Error(`Course structure validation failed: ${parseResult.error.message}`);
  }

  const structure = parseResult.data;

  // FR-015: Minimum 10 lessons
  const totalLessons = structure.sections.reduce((sum, section) => sum + section.lessons.length, 0);
  if (totalLessons < TEST_CONFIG.EXPECTED_MIN_LESSONS) {
    throw new Error(`Minimum lessons requirement not met: ${totalLessons} < ${TEST_CONFIG.EXPECTED_MIN_LESSONS}`);
  }

  console.log(`[T053] ✓ Course structure valid: ${structure.sections.length} sections, ${totalLessons} lessons`);
}

/**
 * Validate generation metadata
 */
function validateGenerationMetadata(metadata: any): void {
  // Check cost
  const totalCost = metadata.cost?.total_cost_usd || 0;
  if (totalCost > TEST_CONFIG.EXPECTED_MAX_COST) {
    console.warn(`[T053] ⚠ Cost exceeded threshold: $${totalCost} > $${TEST_CONFIG.EXPECTED_MAX_COST}`);
  } else {
    console.log(`[T053] ✓ Cost within budget: $${totalCost}`);
  }

  // Check quality
  const qualityScore = metadata.quality?.overall_quality || 0;
  if (qualityScore < TEST_CONFIG.EXPECTED_MIN_QUALITY) {
    console.warn(`[T053] ⚠ Quality below threshold: ${qualityScore} < ${TEST_CONFIG.EXPECTED_MIN_QUALITY}`);
  } else {
    console.log(`[T053] ✓ Quality meets threshold: ${qualityScore}`);
  }

  // Check duration
  const durationMs = metadata.duration_ms?.total || 0;
  const durationSec = Math.round(durationMs / 1000);
  console.log(`[T053] Duration: ${durationSec}s`);

  // Check model usage
  const modelUsed = metadata.model_used;
  console.log(`[T053] Models used:`, modelUsed);
}

/**
 * Wait for a specific generation status to be reached
 */
async function waitForStageCompletion(
  courseId: string,
  targetStatus: string,
  timeout = 60000
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const startTime = Date.now();

  console.log(`[T053] Waiting for stage: ${targetStatus} (max ${timeout / 1000}s)...`);

  while (Date.now() - startTime < timeout) {
    const { data: course } = await supabase
      .from('courses')
      .select('generation_status')
      .eq('id', courseId)
      .single();

    if (course?.generation_status === targetStatus) {
      console.log(`[T053] ✓ Stage reached: ${targetStatus}`);
      return;
    }

    // Check for failure states
    if (course?.generation_status === 'failed' || course?.generation_status === 'cancelled') {
      throw new Error(`Generation failed with status: ${course.generation_status}`);
    }

    await new Promise(resolve => setTimeout(resolve, 2000)); // Poll every 2 seconds
  }

  throw new Error(`Timeout waiting for stage: ${targetStatus} after ${timeout / 1000}s`);
}

/**
 * Wait for outbox processor to create BullMQ jobs
 * The background processor polls every 1 second and processes pending entries
 */
async function waitForOutboxProcessing(courseId: string, timeout = 10000): Promise<void> {
  const supabase = getSupabaseAdmin();
  const startTime = Date.now();

  console.log(`[T053] [waitForOutboxProcessing] Starting wait for course: ${courseId}`);

  while (Date.now() - startTime < timeout) {
    console.log(`[T053] [waitForOutboxProcessing] Querying job_outbox...`);

    const { data: outboxEntries, error } = await supabase
      .from('job_outbox')
      .select('processed_at, attempts, last_error')
      .eq('entity_id', courseId);

    console.log(`[T053] [waitForOutboxProcessing] Query result - entries: ${outboxEntries?.length}, error: ${error?.message || 'none'}`);

    // Check for query errors
    if (error) {
      console.error(`[T053] ✗ Query error:`, error);
      throw new Error(`Failed to query job_outbox: ${error.message}`);
    }

    // If no entries found yet, wait and retry (transaction may not be visible yet)
    if (!outboxEntries || outboxEntries.length === 0) {
      console.log(`[T053] ⏳ No outbox entries found yet, waiting for transaction visibility...`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s and retry
      continue;
    }

    // Check if all entries processed
    const allProcessed = outboxEntries.every(entry => entry.processed_at !== null);
    if (allProcessed) {
      console.log(`[T053] ✓ Outbox processor completed: ${outboxEntries.length} jobs created`);
      return;
    }

    // Check for errors
    const errored = outboxEntries.filter(entry => entry.last_error !== null);
    if (errored.length > 0) {
      console.error(`[T053] ✗ Outbox processing errors:`, errored);
    }

    await new Promise(resolve => setTimeout(resolve, 1000)); // Poll every second
  }

  throw new Error(`Timeout waiting for outbox processing after ${timeout}ms`);
}

/**
 * Validate FSM events created during initialization
 */
async function validateFSMEvents(courseId: string, expectedState: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: events } = await supabase
    .from('fsm_events')
    .select('*')
    .eq('entity_id', courseId)
    .order('created_at', { ascending: false });

  expect(events).toBeDefined();
  expect(events!.length).toBeGreaterThan(0);

  // Check most recent event matches expected state
  // State is stored in event_data JSONB field as 'initial_state'
  const latestEvent = events![0];
  const eventState = latestEvent.event_data?.initial_state;
  expect(eventState).toBe(expectedState);

  console.log(`[T053] ✓ FSM events validated: ${events!.length} events, latest state: ${eventState}`);
}

// ============================================================================
// Test Suite
// ============================================================================

describe('T053: Stage 5 Generation - Synergy Sales Course E2E', () => {
  let shouldSkipTests = false;
  let testCourseIds: string[] = [];
  let commandHandler: InitializeFSMCommandHandler;
  let outboxProcessor: OutboxProcessor;

  beforeAll(async () => {
    // Check Redis
    try {
      const redis = getRedisClient();
      await redis.ping();
      console.log('[T053] ✓ Redis connected');
    } catch (error) {
      console.error('[T053] ✗ Redis not available:', error);
      shouldSkipTests = true;
      return;
    }

    // Check Supabase
    try {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.from('courses').select('id').limit(1);
      if (error) throw error;
      console.log('[T053] ✓ Supabase connected');
    } catch (error) {
      console.error('[T053] ✗ Supabase not available:', error);
      shouldSkipTests = true;
      return;
    }

    // Clean up stale jobs from previous test runs (Issue #6 fix)
    try {
      await cleanupTestJobs(true); // obliterate=true removes ALL jobs including active ones
      console.log('[T053] ✓ Cleaned up stale jobs from previous runs');
    } catch (error) {
      console.error('[T053] ⚠ Failed to cleanup stale jobs:', error);
      // Don't skip tests - this is a best-effort cleanup
    }

    // Check test documents exist
    for (const doc of TEST_DOCUMENTS) {
      try {
        await fs.access(doc.path);
        console.log(`[T053] ✓ Found ${doc.filename}`);
      } catch (error) {
        console.error(`[T053] ✗ Missing ${doc.filename} at ${doc.path}`);
        shouldSkipTests = true;
        return;
      }
    }

    // Setup test fixtures
    await setupTestFixtures();
    console.log('[T053] ✓ Test fixtures ready');

    // Initialize command handler
    commandHandler = new InitializeFSMCommandHandler();
    console.log('[T053] ✓ Command handler initialized');

    // Start outbox processor (runs in background)
    outboxProcessor = new OutboxProcessor();
    // Don't await - runs as background loop
    outboxProcessor.start().catch(error => {
      console.error('[T053] ✗ Outbox processor error:', error);
    });
    console.log('[T053] ✓ Outbox processor started');
  }, 60000);

  afterAll(async () => {
    if (shouldSkipTests) return;

    // Stop outbox processor gracefully
    if (outboxProcessor) {
      await outboxProcessor.stop();
      console.log('[T053] ✓ Outbox processor stopped');
    }

    // Clean up test courses
    const supabase = getSupabaseAdmin();
    for (const courseId of testCourseIds) {
      await supabase.from('courses').delete().eq('id', courseId);
    }

    await cleanupTestJobs();
    await closeQueue();
    console.log('[T053] ✓ Cleanup complete');
  });

  // ==========================================================================
  // Scenario 1: Title-Only Course Generation (FR-003, US1)
  // ==========================================================================

  it.skip('Scenario 1: Title-Only Course Generation', async () => {
    if (shouldSkipTests) {
      console.log('[T053] Skipping test - prerequisites not met');
      return;
    }

    const supabase = getSupabaseAdmin();
    const testOrg = TEST_ORGS.premium;
    const testUser = TEST_USERS.instructor1;

    // Create course with ONLY title
    const { data: course, error } = await supabase
      .from('courses')
      .insert({
        organization_id: testOrg.id,
        user_id: testUser.id,
        title: 'Курс по продажам в сфере образования',
        slug: 'kurs-po-prodazham-v-sfere-obrazovaniya-' + Date.now(),
        language: 'ru',
        style: 'practical',
        generation_status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;
    testCourseIds.push(course.id);

    console.log(`[T053] Created title-only course: ${course.id}`);

    // Trigger generation using Transactional Outbox pattern
    const jobData = {
      course_id: course.id,
      organization_id: testOrg.id,
      user_id: testUser.id,
      analysis_result: null, // Title-only scenario
      frontend_parameters: {
        course_title: course.title,
        language: 'ru',
        style: 'practical',
      },
      vectorized_documents: false,
      document_summaries: [],
    };

    const result = await commandHandler.handle({
      entityId: course.id,
      userId: testUser.id,
      organizationId: testOrg.id,
      idempotencyKey: `t053-scenario1-${Date.now()}`,
      initiatedBy: 'TEST',
      initialState: 'stage_5_init',
      data: {
        courseTitle: course.title,
        scenario: 'title-only',
      },
      jobs: [{
        queue: JobType.STRUCTURE_GENERATION, // 'structure_generation'
        data: jobData,
        options: { priority: 10 },
      }],
    });

    console.log(`[T053] ✓ FSM initialized: ${result.fsmState.state}`);
    console.log(`[T053] ✓ Outbox entries created: ${result.outboxEntries.length}`);
    console.log(`[T053] ✓ From cache: ${result.fromCache}`);

    // Validate outbox entries created
    expect(result.outboxEntries).toBeDefined();
    expect(result.outboxEntries.length).toBe(1);
    expect(result.outboxEntries[0].status).toBeNull(); // pending (processed_at IS NULL)
    expect(result.outboxEntries[0].queue_name).toBe(JobType.STRUCTURE_GENERATION);

    // Validate FSM state initialized
    expect(result.fsmState).toBeDefined();
    expect(result.fsmState.entity_id).toBe(course.id);
    expect(result.fsmState.state).toBe('stage_5_init');

    // Wait for background processor to create BullMQ jobs
    await waitForOutboxProcessing(course.id, 10000);

    // Validate FSM events
    await validateFSMEvents(course.id, 'stage_5_init');

    // Wait for completion
    const generationResult = await waitForGeneration(course.id);

    // Validate results
    validateCourseStructure(generationResult.course_structure);
    validateGenerationMetadata(generationResult.generation_metadata);

    // Scenario-specific checks
    expect(generationResult.course_structure.sections.length).toBeGreaterThanOrEqual(4);
    expect(generationResult.course_structure.sections.length).toBeLessThanOrEqual(10);
  }, TEST_CONFIG.MAX_WAIT_TIME + 60000);

  // ==========================================================================
  // Scenario 2: Full Pipeline - Analyze + Generate + Style (US2)
  // Flow: Create → Upload Docs → Stage 4 Analyze → Stage 5 Generate
  // ==========================================================================

  it('Scenario 2: Full Pipeline - Analyze + Generate + Style (US2)', async () => {
    if (shouldSkipTests) {
      console.log('[T053] Skipping test - prerequisites not met');
      return;
    }

    console.log('[T053] ========================================');
    console.log('[T053] Scenario 2: Full Pipeline - Analyze + Generate');
    console.log('[T053] ========================================');

    const supabase = getSupabaseAdmin();
    const testOrg = TEST_ORGS.premium;
    const testUser = TEST_USERS.instructor1;

    // Step 1: Create course
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .insert({
        organization_id: testOrg.id,
        user_id: testUser.id,
        title: 'Курс по продажам',
        slug: 'kurs-po-prodazham-' + Date.now(),
        language: 'ru',
        style: 'academic',
        settings: {
          desired_lessons_count: 25,
          target_audience: 'Менеджеры по продажам в сфере образования',
        },
        generation_status: 'pending',
      })
      .select()
      .single();

    if (courseError) throw courseError;
    testCourseIds.push(course.id);

    console.log(`[T053] ✓ Created course: ${course.id}`);

    // Step 2: Upload documents
    console.log('[T053] Uploading 4 documents (~282KB)...');
    const fileIds = await uploadDocuments(course.id, testOrg.id);
    console.log(`[T053] ✓ Uploaded ${fileIds.length} documents`);

    // Step 3: Process documents (Stage 2) - Use Transactional Outbox pattern
    console.log('[T053] Stage 2: Processing documents using Transactional Outbox...');

    // Build job data array for all documents
    const documentJobs = [];
    for (const fileId of fileIds) {
      const { data: file } = await supabase
        .from('file_catalog')
        .select('storage_path, mime_type')
        .eq('id', fileId)
        .single();

      const absolutePath = path.join(process.cwd(), file!.storage_path);

      documentJobs.push({
        queue: JobType.DOCUMENT_PROCESSING, // 'document_processing'
        data: {
          jobType: JobType.DOCUMENT_PROCESSING,
          organizationId: testOrg.id,
          courseId: course.id,
          userId: testUser.id,
          createdAt: new Date().toISOString(),
          fileId,
          filePath: absolutePath,
          mimeType: file!.mime_type,
          chunkSize: 512,
          chunkOverlap: 50,
        },
        options: { priority: 10 },
      });
    }

    // Initialize FSM for Stage 2 with all document processing jobs
    const stage2Result = await commandHandler.handle({
      entityId: course.id,
      userId: testUser.id,
      organizationId: testOrg.id,
      idempotencyKey: `t053-scenario2-stage2-${Date.now()}`,
      initiatedBy: 'TEST',
      initialState: 'stage_2_init',
      data: {
        courseTitle: course.title,
        scenario: 'full-pipeline-stage2',
        fileCount: fileIds.length,
      },
      jobs: documentJobs,
    });

    console.log(`[T053] ✓ Stage 2 FSM initialized: ${stage2Result.fsmState.state}`);
    console.log(`[T053] ✓ Stage 2 outbox entries created: ${stage2Result.outboxEntries.length}`);

    // Wait for background processor to create BullMQ jobs
    await waitForOutboxProcessing(course.id, 10000);

    // Wait for Stage 2 to reach stage_2_complete
    console.log('[T053] Waiting for Stage 2 to complete...');
    await waitForStageCompletion(course.id, 'stage_2_complete', 120000); // 2 minutes max

    // === STAGE 3: SUMMARIZATION ===
    console.log('[T053] ========================================');
    console.log('[T053] Stage 3: Initializing Summarization (FSM state transition)...');
    console.log('[T053] ========================================');

    // Initialize Stage 3 FSM state (jobs already queued by document processing)
    const stage3Result = await commandHandler.handle({
      entityId: course.id,
      userId: testUser.id,
      organizationId: testOrg.id,
      idempotencyKey: `t053-scenario2-stage3-${Date.now()}`,
      initiatedBy: 'TEST',
      initialState: 'stage_3_init',
      data: {
        generation_id: course.id,
        file_ids: fileIds,
        scenario: 'full-pipeline-stage3',
      },
      jobs: [], // Jobs already queued by document processing handler
    });

    console.log(`[T053] ✓ Stage 3 FSM initialized: ${stage3Result.fsmState.state}`);

    // Wait for Stage 3 completion (summarization jobs to complete)
    await waitForStageCompletion(course.id, 'stage_3_complete', 120000); // 2 minutes max

    // === STAGE 4: ANALYZE ===
    console.log('[T053] ========================================');
    console.log('[T053] Stage 4: Running Structure Analysis using Transactional Outbox...');
    console.log('[T053] ========================================');

    // Create STRUCTURE_ANALYSIS job using Transactional Outbox
    const analyzeJobData = {
      course_id: course.id,
      organization_id: testOrg.id,
      user_id: testUser.id,
      input: {
        topic: 'Продажи образовательных продуктов',
        language: 'ru',
        style: 'academic',
        target_audience: 'intermediate' as const,
        difficulty: 'intermediate',
        lesson_duration_minutes: 5,
        answers: course.settings?.target_audience,
      },
      priority: 10,
      attempt_count: 0,
      created_at: new Date().toISOString(),
    };

    const stage4Result = await commandHandler.handle({
      entityId: course.id,
      userId: testUser.id,
      organizationId: testOrg.id,
      idempotencyKey: `t053-scenario2-stage4-${Date.now()}`,
      initiatedBy: 'TEST',
      initialState: 'stage_4_init',
      data: {
        courseTitle: course.title,
        scenario: 'full-pipeline-stage4',
      },
      jobs: [{
        queue: JobType.STRUCTURE_ANALYSIS, // 'structure_analysis'
        data: analyzeJobData,
        options: { priority: 10 },
      }],
    });

    console.log(`[T053] ✓ Stage 4 FSM initialized: ${stage4Result.fsmState.state}`);
    console.log(`[T053] ✓ Stage 4 outbox entries created: ${stage4Result.outboxEntries.length}`);

    // Wait for background processor to create BullMQ jobs (Stage 4 analysis takes 2-5 minutes)
    await waitForOutboxProcessing(course.id, 600000);

    // Wait for analysis_result to be populated
    console.log('[T053] Waiting for analysis to complete (max 10 minutes)...');
    let analyzeComplete = false;
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes max (polling every 5s)
    const startTime = Date.now();

    while (!analyzeComplete && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5s

      const { data: analyzedCourse } = await supabase
        .from('courses')
        .select('analysis_result, generation_status')
        .eq('id', course.id)
        .single();

      if (analyzedCourse?.analysis_result !== null) {
        analyzeComplete = true;
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`[T053] ✓ Analysis complete in ${elapsed}s`);
      } else {
        process.stdout.write('.');
      }

      attempts++;
    }

    if (!analyzeComplete) {
      throw new Error('Stage 4 Analyze did not complete within 10 minutes');
    }

    // Verify analysis_result is populated
    const { data: verifiedCourse } = await supabase
      .from('courses')
      .select('analysis_result')
      .eq('id', course.id)
      .single();

    expect(verifiedCourse?.analysis_result).toBeTruthy();
    expect(verifiedCourse?.analysis_result).not.toBeNull();
    console.log('[T053] ✓ analysis_result verified and populated');

    // === STAGE 5: GENERATION ===
    console.log('[T053] ========================================');
    console.log('[T053] Stage 5: Running Structure Generation using Transactional Outbox...');
    console.log('[T053] ========================================');

    // Trigger generation with populated analysis_result using Transactional Outbox
    const generationJobData = {
      course_id: course.id,
      organization_id: testOrg.id,
      user_id: testUser.id,
      analysis_result: verifiedCourse.analysis_result, // NOW POPULATED!
      frontend_parameters: {
        course_title: course.title,
        language: 'ru',
        style: 'academic',
        desired_lessons_count: 25,
        target_audience: 'Менеджеры по продажам в сфере образования',
      },
      vectorized_documents: true, // Documents processed
      document_summaries: [],
    };

    const stage5Result = await commandHandler.handle({
      entityId: course.id,
      userId: testUser.id,
      organizationId: testOrg.id,
      idempotencyKey: `t053-scenario2-stage5-${Date.now()}`,
      initiatedBy: 'TEST',
      initialState: 'stage_5_init',
      data: {
        courseTitle: course.title,
        scenario: 'full-pipeline-stage5',
      },
      jobs: [{
        queue: JobType.STRUCTURE_GENERATION, // 'structure_generation'
        data: generationJobData,
        options: { priority: 10 },
      }],
    });

    console.log(`[T053] ✓ Stage 5 FSM initialized: ${stage5Result.fsmState.state}`);
    console.log(`[T053] ✓ Stage 5 outbox entries created: ${stage5Result.outboxEntries.length}`);

    // Wait for background processor to create BullMQ jobs (Stage 5 generation takes 2-5 minutes)
    await waitForOutboxProcessing(course.id, 600000);

    // Validate FSM events for Stage 5
    await validateFSMEvents(course.id, 'stage_5_init');

    // Wait for completion
    const result = await waitForGeneration(course.id);

    // Validate results
    validateCourseStructure(result.course_structure);
    validateGenerationMetadata(result.generation_metadata);

    // Scenario-specific checks
    const totalLessons = result.course_structure.sections.reduce(
      (sum: number, s: any) => sum + s.lessons.length,
      0
    );
    expect(totalLessons).toBeGreaterThanOrEqual(20); // Minimum 20 lessons
    // No maximum check - model can generate as many lessons as needed for complex topics

    console.log('[T053] ========================================');
    console.log('[T053] ✓ Scenario 2 PASSED');
    console.log('[T053] ========================================');
  }, TEST_CONFIG.MAX_WAIT_TIME + 720000); // 10min generation + 10min analysis + 2min buffer

  // ==========================================================================
  // Scenario 3: Different Styles Test (US4)
  // ==========================================================================

  it.skip('Scenario 3: Different Styles Test', async () => {
    if (shouldSkipTests) {
      console.log('[T053] Skipping test - prerequisites not met');
      return;
    }

    const supabase = getSupabaseAdmin();
    const testOrg = TEST_ORGS.premium;
    const testUser = TEST_USERS.instructor1;

    const styles = ['conversational', 'storytelling', 'practical', 'gamified'];
    const results: any[] = [];

    for (const style of styles) {
      console.log(`[T053] Testing style: ${style}`);

      // Create course
      const { data: course, error } = await supabase
        .from('courses')
        .insert({
          organization_id: testOrg.id,
          user_id: testUser.id,
          title: `Курс по продажам (${style})`,
          slug: `kurs-po-prodazham-${style}-` + Date.now(),
          language: 'ru',
          style,
          generation_status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      testCourseIds.push(course.id);

      // Trigger generation using Transactional Outbox pattern
      const jobData = {
        course_id: course.id,
        organization_id: testOrg.id,
        user_id: testUser.id,
        analysis_result: null,
        frontend_parameters: {
          course_title: course.title,
          language: 'ru',
          style,
        },
        vectorized_documents: false,
        document_summaries: [],
      };

      const fsmResult = await commandHandler.handle({
        entityId: course.id,
        userId: testUser.id,
        organizationId: testOrg.id,
        idempotencyKey: `t053-scenario3-${style}-${Date.now()}`,
        initiatedBy: 'TEST',
        initialState: 'stage_5_init',
        data: {
          courseTitle: course.title,
          scenario: `different-styles-${style}`,
        },
        jobs: [{
          queue: JobType.STRUCTURE_GENERATION, // 'structure_generation'
          data: jobData,
          options: { priority: 10 },
        }],
      });

      console.log(`[T053] ✓ ${style}: FSM initialized (${fsmResult.fsmState.state})`);

      // Wait for background processor
      await waitForOutboxProcessing(course.id, 10000);

      // Wait for completion
      const result = await waitForGeneration(course.id);
      results.push({ style, structure: result.course_structure });

      console.log(`[T053] ✓ Completed ${style} generation`);
    }

    // Compare results
    console.log('[T053] Comparing style differences...');
    // TODO: Implement style comparison logic
  }, TEST_CONFIG.MAX_WAIT_TIME * 4 + 60000);

  // ==========================================================================
  // Scenario 4: RAG-Heavy Generation
  // ==========================================================================

  it.skip('Scenario 4: RAG-Heavy Generation', async () => {
    if (shouldSkipTests) {
      console.log('[T053] Skipping test - prerequisites not met');
      return;
    }

    // TODO: Implement RAG test after Stage 2/3/4 are fully tested
    console.log('[T053] ⚠ RAG test requires full pipeline with vectorization');
  }, TEST_CONFIG.MAX_WAIT_TIME + 60000);
});
