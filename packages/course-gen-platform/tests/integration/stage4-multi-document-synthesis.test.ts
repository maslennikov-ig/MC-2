/**
 * Stage 4: Multi-Document Synthesis - Integration Test (US2)
 *
 * Test Objective: Verify Phase 4 (Document Synthesis) adaptive model selection
 * based on document count. The system should use:
 * - 20B model for <3 documents (fast, cheap synthesis)
 * - 120B model for ≥3 documents (better multi-source synthesis quality)
 *
 * Test Flow:
 * 1. Setup: Create test courses with varying document counts (0-2 vs 3+)
 * 2. Trigger: Add STRUCTURE_ANALYSIS jobs to BullMQ queue
 * 3. Wait: Poll for job completion using database tracking (max 10 minutes)
 * 4. Verify:
 *    - Correct model selection based on document count
 *    - metadata.model_usage.phase_4 matches expected model
 *    - scope_instructions populated (100-800 chars)
 *    - content_strategy set correctly
 *
 * Prerequisites:
 * - Redis >= 5.0.0 running at redis://localhost:6379
 * - Supabase database accessible with migrations applied
 * - Stage 4 analysis worker running or registered
 * - OpenRouter API key in .env (or mock enabled)
 * - Stage 3 migrations complete (courses.generation_status field)
 * - Stage 4 migrations complete (courses.analysis_result JSONB column)
 *
 * Test execution: pnpm test tests/integration/stage4-multi-document-synthesis.test.ts
 *
 * Reference: specs/007-stage-4-analyze/plan.md User Story 2
 * Reference: specs/007-stage-4-analyze/tasks.md Task T040
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { getQueue, addJob, closeQueue } from '../../src/orchestrator/queue';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import { getRedisClient } from '../../src/shared/cache/redis';
import { JobType } from '@megacampus/shared-types';
import type { StructureAnalysisJob } from '@megacampus/shared-types';
import { AnalysisResultSchema } from '../../src/types/analysis-result';
import {
  setupTestFixtures,
  cleanupTestFixtures,
  cleanupTestJobs,
  getTestFixtures,
} from '../fixtures';

// Get unique fixtures for this test file
const testFileName = __filename.split('/').pop()!;
const { TEST_USERS, TEST_ORGS } = getTestFixtures(testFileName);

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Generate unique correlation ID for tracing
 */
function generateCorrelationId(): string {
  return `test-multi-doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Wait for course analysis_result to be populated in database
 *
 * Alternative method that checks the courses table directly instead of job_status.
 * Useful if job_status tracking is unreliable.
 *
 * @param courseId - Course UUID
 * @param timeout - Maximum wait time in milliseconds
 * @returns Course record with analysis_result
 */
async function waitForAnalysisResult(
  courseId: string,
  timeout: number = 600000
): Promise<any> {
  const supabase = getSupabaseAdmin();
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const { data: course, error } = await supabase
      .from('courses')
      .select('analysis_result, generation_status, generation_progress')
      .eq('id', courseId)
      .single();

    if (error) {
      throw new Error(`Failed to query courses table: ${error.message}`);
    }

    // Check if analysis_result is populated
    if (course.analysis_result !== null && typeof course.analysis_result === 'object') {
      return course;
    }

    // Wait 1 second before checking again
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error(
    `Timeout waiting for analysis_result to be populated in course ${courseId}. ` +
    `This may indicate Stage 4 analysis failed or worker is not running.`
  );
}

/**
 * Create mock document summary for testing
 */
function createMockDocumentSummary(index: number) {
  return {
    document_id: `doc-${index}`,
    file_name: `document-${index}.pdf`,
    processed_content: `This is a comprehensive summary of document ${index}. It covers key topics related to the course material. Lorem ipsum dolor sit amet, consectetur adipiscing elit. The content includes practical examples and theoretical foundations.`,
    processing_method: 'balanced' as const,
    summary_metadata: {
      original_tokens: 5000 + index * 100,
      summary_tokens: 1000 + index * 20,
      compression_ratio: 0.2,
      quality_score: 0.85 + (index % 10) * 0.01,
    },
  };
}

// ============================================================================
// Test Suite Setup
// ============================================================================

describe('Stage 4: Multi-Document Synthesis (US2)', () => {
  let shouldSkipTests = false;
  const testCourseIds: string[] = [];

  beforeAll(async () => {
    // Check Redis availability
    try {
      const redis = getRedisClient();
      await redis.ping();
    } catch (error) {
      console.warn('⚠️  Redis not available - tests will be skipped');
      console.warn('   Start Redis: docker run -d -p 6379:6379 redis:7-alpine');
      shouldSkipTests = true;
      return;
    }

    // Setup test fixtures with unique fixtures for this test file
    await setupTestFixtures({
      customFixtures: { TEST_USERS, TEST_ORGS },
    });

    // Clean up any existing test jobs to start fresh
    await cleanupTestJobs(true); // obliterate = true
  }, 60000); // 60s timeout for setup

  afterEach(async () => {
    if (shouldSkipTests) return;

    // Clean up test jobs after each test
    await cleanupTestJobs();
  });

  afterAll(async () => {
    if (shouldSkipTests) {
      const redis = getRedisClient();
      try {
        await redis.quit();
      } catch {
        // Ignore
      }
      return;
    }

    // Clean up test courses if created
    if (testCourseIds.length > 0) {
      const supabase = getSupabaseAdmin();
      await supabase.from('courses').delete().in('id', testCourseIds);
    }

    // Close queue
    try {
      await closeQueue();
    } catch (error) {
      console.warn('Failed to close queue:', error);
    }

    // Clean up test fixtures
    await cleanupTestFixtures();

    // Close Redis
    const redis = getRedisClient();
    try {
      await redis.quit();
    } catch {
      // Ignore
    }
  }, 60000); // 60s timeout for teardown

  // ==========================================================================
  // Test 1: Few Documents (<3) - Use 20B Model
  // ==========================================================================

  it.skipIf(shouldSkipTests)(
    'should use 20B model for <3 documents (fast synthesis)',
    async () => {
      const supabase = getSupabaseAdmin();

      // =====================================================================
      // STEP 1: Create test course with 1 document summary
      // =====================================================================
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .insert({
          organization_id: TEST_ORGS.premium.id,
          user_id: TEST_USERS.instructor1.id,
          title: 'Test Course - React Hooks (1 Doc)',
          slug: `test-course-react-hooks-1doc-${Date.now()}`,
          generation_status: 'processing_documents', // Stage 3 in progress
          status: 'draft',
        })
        .select()
        .single();

      if (courseError || !course) {
        throw new Error(`Failed to create test course: ${courseError?.message || 'Unknown error'}`);
      }

      testCourseIds.push(course.id);
      console.log(`✓ Test course created with 1 document: ${course.id}`);

      // =====================================================================
      // STEP 2: Create STRUCTURE_ANALYSIS job with 1 document
      // =====================================================================
      const jobData: StructureAnalysisJob = {
        course_id: course.id,
        organization_id: TEST_ORGS.premium.id,
        user_id: TEST_USERS.instructor1.id,
        input: {
          topic: 'React Hooks',
          language: 'en',
          style: 'professional',
          target_audience: 'intermediate',
          difficulty: 'intermediate',
          lesson_duration_minutes: 5,
          document_summaries: [createMockDocumentSummary(1)], // 1 document
        },
        priority: 5,
        attempt_count: 0,
        created_at: new Date().toISOString(),
      };

      const job = await addJob(JobType.STRUCTURE_ANALYSIS, jobData);
      expect(job.id).toBeDefined();

      console.log(`✓ STRUCTURE_ANALYSIS job created: ${job.id}`);

      // =====================================================================
      // STEP 3: Wait for job completion (max 10 minutes)
      // =====================================================================
      console.log('⏳ Waiting for analysis to complete (max 10 minutes)...');

      const updatedCourse = await waitForAnalysisResult(course.id, 600000);

      expect(updatedCourse.analysis_result).toBeDefined();
      expect(updatedCourse.analysis_result).not.toBeNull();

      console.log('✓ Analysis result stored in database');

      // =====================================================================
      // STEP 4: Validate AnalysisResult Schema
      // =====================================================================
      const analysisResult = updatedCourse.analysis_result;

      // Parse and validate with Zod schema
      const validated = AnalysisResultSchema.parse(analysisResult);
      expect(validated).toBeDefined();

      console.log('✓ AnalysisResult schema validation passed');

      // =====================================================================
      // STEP 5: Verify Phase 4 Used 20B Model
      // =====================================================================
      expect(validated.metadata.model_usage.phase_4).toBe('openai/gpt-oss-20b');

      console.log('✓ Phase 4 used 20B model (expected for <3 documents)');

      // =====================================================================
      // STEP 6: Verify Phase 4 Performance (Should be Fast with 20B)
      // =====================================================================
      expect(validated.metadata.phase_durations_ms.phase_4).toBeDefined();
      expect(validated.metadata.phase_durations_ms.phase_4).toBeLessThan(60000); // <60s

      console.log(
        `✓ Phase 4 completed in ${validated.metadata.phase_durations_ms.phase_4}ms (fast with 20B model)`
      );

      // =====================================================================
      // STEP 7: Verify scope_instructions Quality
      // =====================================================================
      expect(validated.scope_instructions).toBeDefined();
      expect(validated.scope_instructions.length).toBeGreaterThanOrEqual(100);
      expect(validated.scope_instructions.length).toBeLessThanOrEqual(800);

      console.log(
        `✓ scope_instructions populated: ${validated.scope_instructions.length} chars`
      );

      // =====================================================================
      // STEP 8: Verify content_strategy
      // =====================================================================
      // With <3 documents, should be create_from_scratch
      expect(validated.content_strategy).toBe('create_from_scratch');

      console.log(`✓ content_strategy: ${validated.content_strategy}`);

      // =====================================================================
      // STEP 9: Log Analysis Summary
      // =====================================================================
      console.log('\n📊 Analysis Summary (1 Document):');
      console.log(`   Model Used: ${validated.metadata.model_usage.phase_4}`);
      console.log(`   Phase 4 Duration: ${validated.metadata.phase_durations_ms.phase_4}ms`);
      console.log(`   Content Strategy: ${validated.content_strategy}`);
      console.log(`   Scope Instructions Length: ${validated.scope_instructions.length} chars`);
    },
    600000 // 10-minute test timeout
  );

  // ==========================================================================
  // Test 2: Many Documents (≥3) - Use 120B Model
  // ==========================================================================

  it.skipIf(shouldSkipTests)(
    'should use 120B model for ≥3 documents (better synthesis quality)',
    async () => {
      const supabase = getSupabaseAdmin();

      // =====================================================================
      // STEP 1: Create test course with 3 document summaries
      // =====================================================================
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .insert({
          organization_id: TEST_ORGS.premium.id,
          user_id: TEST_USERS.instructor1.id,
          title: 'Test Course - React Hooks (3 Docs)',
          slug: `test-course-react-hooks-3docs-${Date.now()}`,
          generation_status: 'processing_documents', // Stage 3 in progress
          status: 'draft',
        })
        .select()
        .single();

      if (courseError || !course) {
        throw new Error(`Failed to create test course: ${courseError?.message || 'Unknown error'}`);
      }

      testCourseIds.push(course.id);
      console.log(`✓ Test course created with 3 documents: ${course.id}`);

      // =====================================================================
      // STEP 2: Create STRUCTURE_ANALYSIS job with 3 documents
      // =====================================================================
      const jobData: StructureAnalysisJob = {
        course_id: course.id,
        organization_id: TEST_ORGS.premium.id,
        user_id: TEST_USERS.instructor1.id,
        input: {
          topic: 'React Hooks',
          language: 'en',
          style: 'professional',
          target_audience: 'intermediate',
          difficulty: 'intermediate',
          lesson_duration_minutes: 5,
          document_summaries: [
            createMockDocumentSummary(1),
            createMockDocumentSummary(2),
            createMockDocumentSummary(3),
          ], // 3 documents
        },
        priority: 5,
        attempt_count: 0,
        created_at: new Date().toISOString(),
      };

      const job = await addJob(JobType.STRUCTURE_ANALYSIS, jobData);
      expect(job.id).toBeDefined();

      console.log(`✓ STRUCTURE_ANALYSIS job created: ${job.id}`);

      // =====================================================================
      // STEP 3: Wait for job completion (max 10 minutes)
      // =====================================================================
      console.log('⏳ Waiting for analysis to complete (max 10 minutes)...');

      const updatedCourse = await waitForAnalysisResult(course.id, 600000);

      expect(updatedCourse.analysis_result).toBeDefined();
      expect(updatedCourse.analysis_result).not.toBeNull();

      console.log('✓ Analysis result stored in database');

      // =====================================================================
      // STEP 4: Validate AnalysisResult Schema
      // =====================================================================
      const analysisResult = updatedCourse.analysis_result;

      // Parse and validate with Zod schema
      const validated = AnalysisResultSchema.parse(analysisResult);
      expect(validated).toBeDefined();

      console.log('✓ AnalysisResult schema validation passed');

      // =====================================================================
      // STEP 5: Verify Phase 4 Used 120B Model
      // =====================================================================
      expect(validated.metadata.model_usage.phase_4).toBe('openai/gpt-oss-120b');

      console.log('✓ Phase 4 used 120B model (expected for ≥3 documents)');

      // =====================================================================
      // STEP 6: Verify scope_instructions Quality
      // =====================================================================
      expect(validated.scope_instructions).toBeDefined();
      expect(validated.scope_instructions.length).toBeGreaterThanOrEqual(100);
      expect(validated.scope_instructions.length).toBeLessThanOrEqual(800);

      console.log(
        `✓ scope_instructions populated: ${validated.scope_instructions.length} chars`
      );

      // =====================================================================
      // STEP 7: Verify content_strategy
      // =====================================================================
      // With 3 documents, should be expand_and_enhance
      expect(validated.content_strategy).toBe('expand_and_enhance');

      console.log(`✓ content_strategy: ${validated.content_strategy}`);

      // =====================================================================
      // STEP 8: Log Analysis Summary
      // =====================================================================
      console.log('\n📊 Analysis Summary (3 Documents):');
      console.log(`   Model Used: ${validated.metadata.model_usage.phase_4}`);
      console.log(`   Phase 4 Duration: ${validated.metadata.phase_durations_ms.phase_4}ms`);
      console.log(`   Content Strategy: ${validated.content_strategy}`);
      console.log(`   Scope Instructions Length: ${validated.scope_instructions.length} chars`);
    },
    600000 // 10-minute test timeout
  );

  // ==========================================================================
  // Test 3: Content Strategy Logic Verification
  // ==========================================================================

  it.skipIf(shouldSkipTests)(
    'should set content_strategy correctly based on document count',
    async () => {
      const supabase = getSupabaseAdmin();

      // =====================================================================
      // SCENARIO 1: Zero documents → create_from_scratch
      // =====================================================================
      console.log('\n📝 Testing content_strategy: 0 documents');

      const { data: courseNoDocs, error: nodocsError } = await supabase
        .from('courses')
        .insert({
          organization_id: TEST_ORGS.premium.id,
          user_id: TEST_USERS.instructor1.id,
          title: 'Test Course - React Hooks (No Docs)',
          slug: `test-course-react-hooks-nodocs-${Date.now()}`,
          generation_status: 'processing_documents',
          status: 'draft',
        })
        .select()
        .single();

      if (nodocsError || !courseNoDocs) {
        throw new Error(`Failed to create test course: ${nodocsError?.message || 'Unknown error'}`);
      }

      testCourseIds.push(courseNoDocs.id);

      const jobNoDocs: StructureAnalysisJob = {
        course_id: courseNoDocs.id,
        organization_id: TEST_ORGS.premium.id,
        user_id: TEST_USERS.instructor1.id,
        input: {
          topic: 'React Hooks',
          language: 'en',
          style: 'professional',
          target_audience: 'intermediate',
          difficulty: 'intermediate',
          lesson_duration_minutes: 5,
          // No document_summaries
        },
        priority: 5,
        attempt_count: 0,
        created_at: new Date().toISOString(),
      };

      const jobNoDocsRef = await addJob(JobType.STRUCTURE_ANALYSIS, jobNoDocs);
      console.log(`✓ Job created (no docs): ${jobNoDocsRef.id}`);

      const resultNoDocs = await waitForAnalysisResult(courseNoDocs.id, 600000);
      const validatedNoDocs = AnalysisResultSchema.parse(resultNoDocs.analysis_result);

      expect(validatedNoDocs.content_strategy).toBe('create_from_scratch');
      console.log(`✓ 0 documents → content_strategy: ${validatedNoDocs.content_strategy}`);

      // =====================================================================
      // SCENARIO 2: 5 documents → expand_and_enhance
      // =====================================================================
      console.log('\n📝 Testing content_strategy: 5 documents');

      const { data: course5Docs, error: docs5Error } = await supabase
        .from('courses')
        .insert({
          organization_id: TEST_ORGS.premium.id,
          user_id: TEST_USERS.instructor1.id,
          title: 'Test Course - React Hooks (5 Docs)',
          slug: `test-course-react-hooks-5docs-${Date.now()}`,
          generation_status: 'processing_documents',
          status: 'draft',
        })
        .select()
        .single();

      if (docs5Error || !course5Docs) {
        throw new Error(`Failed to create test course: ${docs5Error?.message || 'Unknown error'}`);
      }

      testCourseIds.push(course5Docs.id);

      const job5Docs: StructureAnalysisJob = {
        course_id: course5Docs.id,
        organization_id: TEST_ORGS.premium.id,
        user_id: TEST_USERS.instructor1.id,
        input: {
          topic: 'React Hooks',
          language: 'en',
          style: 'professional',
          target_audience: 'intermediate',
          difficulty: 'intermediate',
          lesson_duration_minutes: 5,
          document_summaries: [
            createMockDocumentSummary(1),
            createMockDocumentSummary(2),
            createMockDocumentSummary(3),
            createMockDocumentSummary(4),
            createMockDocumentSummary(5),
          ], // 5 documents
        },
        priority: 5,
        attempt_count: 0,
        created_at: new Date().toISOString(),
      };

      const job5DocsRef = await addJob(JobType.STRUCTURE_ANALYSIS, job5Docs);
      console.log(`✓ Job created (5 docs): ${job5DocsRef.id}`);

      const result5Docs = await waitForAnalysisResult(course5Docs.id, 600000);
      const validated5Docs = AnalysisResultSchema.parse(result5Docs.analysis_result);

      expect(validated5Docs.content_strategy).toBe('expand_and_enhance');
      console.log(`✓ 5 documents → content_strategy: ${validated5Docs.content_strategy}`);

      // =====================================================================
      // SCENARIO 3: Verify model selection for 5 documents (should be 120B)
      // =====================================================================
      expect(validated5Docs.metadata.model_usage.phase_4).toBe('openai/gpt-oss-120b');
      console.log(`✓ 5 documents → model: ${validated5Docs.metadata.model_usage.phase_4}`);

      // =====================================================================
      // STEP 8: Summary
      // =====================================================================
      console.log('\n📊 Content Strategy Verification Complete:');
      console.log(`   0 docs → ${validatedNoDocs.content_strategy} (20B model)`);
      console.log(`   5 docs → ${validated5Docs.content_strategy} (120B model)`);
    },
    1800000 // 30-minute test timeout (3 analysis runs)
  );
});
