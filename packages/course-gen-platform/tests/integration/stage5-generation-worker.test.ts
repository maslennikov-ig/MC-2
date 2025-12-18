/**
 * Stage 5: Structure Generation Workflow - Integration Test
 *
 * Test Objective: Verify complete end-to-end Stage 5 generation workflow from BullMQ
 * job creation through 5-phase LangGraph orchestration to final database storage.
 *
 * Test Flow:
 * 1. Setup: Create test course with appropriate generation_status
 * 2. Trigger: Add STRUCTURE_GENERATION job to BullMQ queue
 * 3. Wait: Poll for job completion using database tracking (max 10 minutes)
 * 4. Verify:
 *    - Job completes successfully
 *    - CourseStructure schema validation passes
 *    - Minimum 10 lessons requirement met (FR-015)
 *    - Result stored in courses.course_structure JSONB column
 *    - Generation metadata stored in courses.generation_metadata
 *    - generation_status updated to 'completed'
 *
 * Test Scenarios (6 tests):
 * 1. E2E workflow: Create course → trigger STRUCTURE_GENERATION → verify course_structure populated
 * 2. Title-only scenario (FR-003): Course with only title → complete structure generated (US1 validation)
 * 3. Full Analyze results scenario: Course with analysis_result → contextualized structure (US2 validation)
 * 4. RAG-heavy course: Course with >40K document context → verify Gemini fallback if needed
 * 5. Quality validation failure: Test OSS 120B retry when quality < 0.75 threshold
 * 6. Minimum lessons violation: Test retry with constraint when <10 lessons generated
 *
 * Prerequisites:
 * - Redis >= 5.0.0 running at redis://localhost:6379
 * - Supabase database accessible with migrations applied
 * - Stage 5 generation worker running or registered
 * - OpenRouter API key in .env (or mock enabled)
 * - Stage 5 migrations complete (courses.course_structure, generation_metadata, generation_status fields)
 *
 * Test execution: pnpm test tests/integration/stage5-generation-worker.test.ts
 *
 * Reference: specs/008-generation-generation-json/tasks.md (T040)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { getQueue, addJob, closeQueue } from '../../src/orchestrator/queue';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import { getRedisClient } from '../../src/shared/cache/redis';
import { JobType } from '@megacampus/shared-types';
import type { GenerationJobData, GenerationJobInput } from '@megacampus/shared-types/generation-job';
import { CourseStructureSchema } from '@megacampus/shared-types/generation-result';
import {
  setupTestFixtures,
  cleanupTestFixtures,
  cleanupTestJobs,
  TEST_ORGS,
  TEST_USERS,
} from '../fixtures';
import { createFullAnalysisResult } from '../fixtures/analysis-result-fixture';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Generate unique correlation ID for tracing
 */
function generateCorrelationId(): string {
  return `test-stage5-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Wait for job to reach specific state in database
 *
 * This is the primary method for checking job state since jobs may be
 * removed from Redis after completion but persist in the database.
 *
 * @param jobId - BullMQ job ID
 * @param targetState - Target job state(s) to wait for
 * @param timeout - Maximum wait time in milliseconds (default: 600000 = 10 minutes)
 * @returns Job status record from database
 */
async function waitForJobStateDB(
  jobId: string,
  targetState: string | string[],
  timeout: number = 600000 // 10 minutes for LLM processing
): Promise<any> {
  const supabase = getSupabaseAdmin();
  const startTime = Date.now();
  const targetStates = Array.isArray(targetState) ? targetState : [targetState];

  while (Date.now() - startTime < timeout) {
    const { data: jobStatus, error } = await supabase
      .from('job_status')
      .select('*')
      .eq('job_id', jobId)
      .maybeSingle();

    if (!error && jobStatus && targetStates.includes(jobStatus.status)) {
      return jobStatus;
    }

    // Wait 1 second before checking again (longer interval for slow LLM processing)
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Final check before throwing
  const { data: finalStatus } = await supabase
    .from('job_status')
    .select('*')
    .eq('job_id', jobId)
    .maybeSingle();

  const actualState = finalStatus ? finalStatus.status : 'not found in DB';

  throw new Error(
    `Timeout waiting for job ${jobId} to reach DB state(s): ${targetStates.join(', ')}. ` +
    `Current state: ${actualState}. ` +
    `This may indicate LLM processing is slow or worker is not running.`
  );
}

/**
 * Wait for course course_structure to be populated in database
 *
 * Alternative method that checks the courses table directly instead of job_status.
 * Useful for Stage 5 where we need to verify course_structure is populated.
 *
 * @param courseId - Course UUID
 * @param timeout - Maximum wait time in milliseconds
 * @returns Course record with course_structure
 */
async function waitForGenerationResult(
  courseId: string,
  timeout: number = 600000
): Promise<any> {
  const supabase = getSupabaseAdmin();
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const { data: course, error } = await supabase
      .from('courses')
      .select('course_structure, generation_metadata, generation_status, generation_progress')
      .eq('id', courseId)
      .single();

    if (error) {
      throw new Error(`Failed to query courses table: ${error.message}`);
    }

    // Check if course_structure is populated
    if (course.course_structure !== null && typeof course.course_structure === 'object') {
      return course;
    }

    // Wait 1 second before checking again
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error(
    `Timeout waiting for course_structure to be populated in course ${courseId}. ` +
    `This may indicate Stage 5 generation failed or worker is not running.`
  );
}

// ============================================================================
// Test Suite Setup
// ============================================================================

describe('Stage 5: Structure Generation Workflow (Integration)', () => {
  let testCourseId: string;
  let shouldSkipTests = false;

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

    // Setup test fixtures (organizations, users, courses)
    await setupTestFixtures();

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

    // Clean up test course if created
    if (testCourseId) {
      const supabase = getSupabaseAdmin();
      await supabase.from('courses').delete().eq('id', testCourseId);
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
  // Test 1: E2E Workflow - Basic Course Generation
  // ==========================================================================

  it.skipIf(shouldSkipTests)(
    'should complete E2E workflow: create course → trigger STRUCTURE_GENERATION → verify course_structure populated',
    async () => {
      const supabase = getSupabaseAdmin();

      // =====================================================================
      // STEP 1: Create test course with Stage 4 complete status
      // =====================================================================
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .insert({
          organization_id: TEST_ORGS.premium.id,
          user_id: TEST_USERS.instructor1.id,
          title: 'Test Course - E2E Generation Workflow',
          slug: `test-e2e-generation-${Date.now()}`,
          generation_status: 'analyzing_task', // Stage 4 complete, ready for structure generation
          status: 'draft',
        })
        .select()
        .single();

      if (courseError || !course) {
        throw new Error(`Failed to create test course: ${courseError?.message || 'Unknown error'}`);
      }

      testCourseId = course.id;

      console.log(`✓ Test course created: ${testCourseId}`);

      // =====================================================================
      // STEP 2: Create STRUCTURE_GENERATION job
      // =====================================================================
      const jobInput: GenerationJobInput = {
        course_id: testCourseId,
        organization_id: TEST_ORGS.premium.id,
        user_id: TEST_USERS.instructor1.id,
        analysis_result: null, // Title-only scenario for simplicity
        frontend_parameters: {
          course_title: 'Introduction to React Hooks',
          language: 'en',
          style: 'conversational',
          target_audience: 'intermediate developers',
          lesson_duration_minutes: 5,
        },
        vectorized_documents: false,
      };

      const jobData: GenerationJobData = {
        jobId: generateCorrelationId(),
        input: jobInput,
        metadata: {
          created_at: new Date().toISOString(),
          priority: 5,
          attempt: 1,
        },
      };

      const job = await addJob(JobType.STRUCTURE_GENERATION, jobData);
      expect(job.id).toBeDefined();

      console.log(`✓ STRUCTURE_GENERATION job created: ${job.id}`);

      // =====================================================================
      // STEP 3: Wait for job completion (max 10 minutes)
      // =====================================================================
      console.log('⏳ Waiting for generation to complete (max 10 minutes)...');

      // Wait for course_structure to be populated in database
      const updatedCourse = await waitForGenerationResult(testCourseId, 600000);

      expect(updatedCourse.course_structure).toBeDefined();
      expect(updatedCourse.course_structure).not.toBeNull();

      console.log('✓ Course structure stored in database');

      // =====================================================================
      // STEP 4: Validate CourseStructure Schema
      // =====================================================================
      const courseStructure = updatedCourse.course_structure;

      // Parse and validate with Zod schema
      const validated = CourseStructureSchema.parse(courseStructure);
      expect(validated).toBeDefined();

      console.log('✓ CourseStructure schema validation passed');

      // =====================================================================
      // STEP 5: Verify Minimum 10 Lessons (FR-015)
      // =====================================================================
      const totalLessons = validated.sections.reduce(
        (sum, section) => sum + section.lessons.length,
        0
      );

      expect(totalLessons).toBeGreaterThanOrEqual(10);

      console.log(`✓ Minimum lessons requirement met: ${totalLessons} lessons`);

      // =====================================================================
      // STEP 6: Verify generation_metadata
      // =====================================================================
      expect(updatedCourse.generation_metadata).toBeDefined();
      expect(updatedCourse.generation_metadata.cost_usd).toBeGreaterThanOrEqual(0);
      expect(updatedCourse.generation_metadata.total_tokens.total).toBeGreaterThan(0);

      console.log('✓ Generation metadata verified');

      // =====================================================================
      // STEP 7: Verify generation_status = 'completed'
      // =====================================================================
      expect(updatedCourse.generation_status).toBe('completed');

      console.log('✓ Generation status updated to completed');

      // =====================================================================
      // STEP 8: Log Generation Summary
      // =====================================================================
      console.log('\n📊 Generation Summary:');
      console.log(`   Course Title: ${validated.course_title}`);
      console.log(`   Total Sections: ${validated.sections.length}`);
      console.log(`   Total Lessons: ${totalLessons}`);
      console.log(`   Estimated Hours: ${validated.estimated_duration_hours}`);
      console.log(`   Difficulty: ${validated.difficulty_level}`);
      console.log(`   Learning Outcomes: ${validated.learning_outcomes.length}`);
      console.log(`   Total Cost: $${updatedCourse.generation_metadata.cost_usd.toFixed(4)}`);
      console.log(`   Total Tokens: ${updatedCourse.generation_metadata.total_tokens.total}`);
      console.log(`   Overall Quality: ${updatedCourse.generation_metadata.quality_scores.overall}`);
    },
    600000 // 10-minute test timeout
  );

  // ==========================================================================
  // Test 2: Title-Only Scenario (FR-003)
  // ==========================================================================

  it.skipIf(shouldSkipTests)(
    'should generate complete structure from title-only input (FR-003)',
    async () => {
      const supabase = getSupabaseAdmin();

      // Create test course with minimal data
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .insert({
          organization_id: TEST_ORGS.premium.id,
          user_id: TEST_USERS.instructor1.id,
          title: 'Test Course - Title Only',
          slug: `test-title-only-${Date.now()}`,
          generation_status: 'analyzing_task',
          status: 'draft',
        })
        .select()
        .single();

      if (courseError || !course) {
        throw new Error(`Failed to create test course: ${courseError?.message || 'Unknown error'}`);
      }

      const courseId = course.id;

      console.log(`✓ Test course created with title-only: ${courseId}`);

      // Create STRUCTURE_GENERATION job with ONLY course_title
      const jobInput: GenerationJobInput = {
        course_id: courseId,
        organization_id: TEST_ORGS.premium.id,
        user_id: TEST_USERS.instructor1.id,
        analysis_result: null, // No analysis result (title-only)
        frontend_parameters: {
          course_title: 'Advanced Machine Learning Algorithms', // ONLY field
        },
        vectorized_documents: false,
      };

      const jobData: GenerationJobData = {
        jobId: generateCorrelationId(),
        input: jobInput,
        metadata: {
          created_at: new Date().toISOString(),
          priority: 5,
          attempt: 1,
        },
      };

      const job = await addJob(JobType.STRUCTURE_GENERATION, jobData);
      console.log(`✓ STRUCTURE_GENERATION job created: ${job.id}`);

      // Wait for completion
      console.log('⏳ Waiting for generation to complete...');
      const updatedCourse = await waitForGenerationResult(courseId, 600000);

      const courseStructure = updatedCourse.course_structure;
      expect(courseStructure).toBeDefined();

      // Validate schema
      const validated = CourseStructureSchema.parse(courseStructure);

      // Verify complete structure generated despite minimal input
      expect(validated.course_title).toBeDefined();
      expect(validated.course_description).toBeDefined();
      expect(validated.course_overview).toBeDefined();
      expect(validated.target_audience).toBeDefined();
      expect(validated.sections.length).toBeGreaterThanOrEqual(1);

      const totalLessons = validated.sections.reduce(
        (sum, section) => sum + section.lessons.length,
        0
      );
      expect(totalLessons).toBeGreaterThanOrEqual(10);

      console.log('✓ Complete structure generated from title-only input (FR-003)');
      console.log(`   Total Sections: ${validated.sections.length}`);
      console.log(`   Total Lessons: ${totalLessons}`);

      // Cleanup
      await supabase.from('courses').delete().eq('id', courseId);
    },
    600000 // 10-minute test timeout
  );

  // ==========================================================================
  // Test 3: Full Analyze Results Scenario
  // ==========================================================================

  it.skipIf(shouldSkipTests)(
    'should generate contextualized structure from full Analyze results',
    async () => {
      const supabase = getSupabaseAdmin();

      // Create test course
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .insert({
          organization_id: TEST_ORGS.premium.id,
          user_id: TEST_USERS.instructor1.id,
          title: 'Test Course - Full Analyze Results',
          slug: `test-full-analyze-${Date.now()}`,
          generation_status: 'analyzing_task',
          status: 'draft',
        })
        .select()
        .single();

      if (courseError || !course) {
        throw new Error(`Failed to create test course: ${courseError?.message || 'Unknown error'}`);
      }

      const courseId = course.id;

      console.log(`✓ Test course created with full analyze results: ${courseId}`);

      // Create STRUCTURE_GENERATION job with analysis_result
      const jobInput: GenerationJobInput = {
        course_id: courseId,
        organization_id: TEST_ORGS.premium.id,
        user_id: TEST_USERS.instructor1.id,
        analysis_result: createFullAnalysisResult('Advanced TypeScript Patterns'),
        frontend_parameters: {
          course_title: 'Advanced TypeScript Patterns',
          language: 'en',
          style: 'professional',
          target_audience: 'experienced JavaScript developers',
          lesson_duration_minutes: 7,
        },
        vectorized_documents: false,
      };

      const jobData: GenerationJobData = {
        jobId: generateCorrelationId(),
        input: jobInput,
        metadata: {
          created_at: new Date().toISOString(),
          priority: 5,
          attempt: 1,
        },
      };

      const job = await addJob(JobType.STRUCTURE_GENERATION, jobData);
      console.log(`✓ STRUCTURE_GENERATION job created: ${job.id}`);

      // Wait for completion
      console.log('⏳ Waiting for generation to complete...');
      const updatedCourse = await waitForGenerationResult(courseId, 600000);

      const courseStructure = updatedCourse.course_structure;
      expect(courseStructure).toBeDefined();

      // Validate schema
      const validated = CourseStructureSchema.parse(courseStructure);

      // Verify structure aligns with analysis recommendations
      const totalLessons = validated.sections.reduce(
        (sum, section) => sum + section.lessons.length,
        0
      );

      // Should have similar lesson count to recommended (±3 lessons tolerance)
      expect(totalLessons).toBeGreaterThanOrEqual(12); // 15 - 3
      expect(totalLessons).toBeLessThanOrEqual(18); // 15 + 3

      // Difficulty should match analysis
      expect(validated.difficulty_level).toBe('intermediate');

      console.log('✓ Contextualized structure generated from full Analyze results');
      console.log(`   Total Sections: ${validated.sections.length} (recommended: 5)`);
      console.log(`   Total Lessons: ${totalLessons} (recommended: 15)`);
      console.log(`   Difficulty: ${validated.difficulty_level}`);

      // Cleanup
      await supabase.from('courses').delete().eq('id', courseId);
    },
    600000 // 10-minute test timeout
  );

  // ==========================================================================
  // Test 4: RAG-Heavy Course (Large Document Context)
  // ==========================================================================

  it.skipIf(shouldSkipTests)(
    'should handle RAG-heavy course with large document context',
    async () => {
      const supabase = getSupabaseAdmin();

      // Create test course
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .insert({
          organization_id: TEST_ORGS.premium.id,
          user_id: TEST_USERS.instructor1.id,
          title: 'Test Course - RAG Heavy',
          slug: `test-rag-heavy-${Date.now()}`,
          generation_status: 'analyzing_task',
          status: 'draft',
        })
        .select()
        .single();

      if (courseError || !course) {
        throw new Error(`Failed to create test course: ${courseError?.message || 'Unknown error'}`);
      }

      const courseId = course.id;

      console.log(`✓ Test course created with large document context: ${courseId}`);

      // Create STRUCTURE_GENERATION job with large document summaries
      // Simulate >40K tokens of document context
      const largeSummary = 'Lorem ipsum dolor sit amet, '.repeat(1000); // ~5K tokens per summary

      const jobInput: GenerationJobInput = {
        course_id: courseId,
        organization_id: TEST_ORGS.premium.id,
        user_id: TEST_USERS.instructor1.id,
        analysis_result: null,
        frontend_parameters: {
          course_title: 'Enterprise Cloud Architecture',
          language: 'en',
          style: 'professional',
          lesson_duration_minutes: 10,
        },
        vectorized_documents: true, // Enable RAG
        document_summaries: [
          {
            file_id: '00000000-0000-0000-0000-000000000001',
            file_name: 'large-document-1.pdf',
            summary: largeSummary,
            key_topics: ['Cloud infrastructure', 'Scalability', 'Security'],
          },
          {
            file_id: '00000000-0000-0000-0000-000000000002',
            file_name: 'large-document-2.pdf',
            summary: largeSummary,
            key_topics: ['Microservices', 'Containerization', 'Orchestration'],
          },
          {
            file_id: '00000000-0000-0000-0000-000000000003',
            file_name: 'large-document-3.pdf',
            summary: largeSummary,
            key_topics: ['Monitoring', 'Logging', 'Observability'],
          },
        ],
      };

      const jobData: GenerationJobData = {
        jobId: generateCorrelationId(),
        input: jobInput,
        metadata: {
          created_at: new Date().toISOString(),
          priority: 5,
          attempt: 1,
        },
      };

      const job = await addJob(JobType.STRUCTURE_GENERATION, jobData);
      console.log(`✓ STRUCTURE_GENERATION job created: ${job.id}`);

      // Wait for completion
      console.log('⏳ Waiting for generation to complete (may fallback to Gemini for large context)...');
      const updatedCourse = await waitForGenerationResult(courseId, 600000);

      const courseStructure = updatedCourse.course_structure;
      expect(courseStructure).toBeDefined();

      // Validate schema
      const validated = CourseStructureSchema.parse(courseStructure);

      // Verify structure was generated successfully despite large context
      const totalLessons = validated.sections.reduce(
        (sum, section) => sum + section.lessons.length,
        0
      );
      expect(totalLessons).toBeGreaterThanOrEqual(10);

      // Check if Gemini fallback was used (via generation_metadata)
      const modelUsed = updatedCourse.generation_metadata.model_used;
      console.log(`✓ Model used for sections: ${modelUsed.sections}`);

      if (modelUsed.sections.includes('gemini')) {
        console.log('   → Gemini fallback triggered due to large context');
      } else {
        console.log('   → OSS 120B handled large context successfully');
      }

      console.log('✓ RAG-heavy course handled successfully');
      console.log(`   Total Sections: ${validated.sections.length}`);
      console.log(`   Total Lessons: ${totalLessons}`);

      // Cleanup
      await supabase.from('courses').delete().eq('id', courseId);
    },
    600000 // 10-minute test timeout
  );

  // ==========================================================================
  // Test 5: Quality Validation Failure - OSS 120B Retry
  // ==========================================================================

  it.skipIf(shouldSkipTests).skip(
    'should retry with OSS 120B when quality score < 0.75 threshold',
    async () => {
      // NOTE: This test requires mocking quality validator to force low quality score
      // Skipped in real tests since it's difficult to reliably trigger quality failures
      // without mocking. See unit tests for quality-validator.test.ts for detailed testing.

      console.log('⚠️  Test skipped: Requires quality validator mocking');
      console.log('   See: tests/unit/stage5/quality-validator.test.ts');
    },
    600000
  );

  // ==========================================================================
  // Test 6: Minimum Lessons Violation - Retry with Constraint
  // ==========================================================================

  it.skipIf(shouldSkipTests).skip(
    'should retry with minimum lessons constraint when <10 lessons generated',
    async () => {
      // NOTE: This test requires mocking section generator to force <10 lessons
      // Skipped in real tests since the system is designed to always generate >=10 lessons
      // See unit tests for section-batch-generator.test.ts for detailed testing.

      console.log('⚠️  Test skipped: Requires section generator mocking');
      console.log('   See: tests/unit/stage5/section-batch-generator.test.ts');
    },
    600000
  );
});
