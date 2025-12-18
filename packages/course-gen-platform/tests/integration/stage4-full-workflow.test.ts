/**
 * Stage 4: Full 5-Phase Analysis Workflow - Integration Test
 *
 * Test Objective: Verify complete end-to-end Stage 4 analysis workflow from BullMQ
 * job creation through all 5 phases to final result storage in database.
 *
 * Test Flow:
 * 1. Setup: Create test course with Stage 3 complete status (processing_documents)
 * 2. Trigger: Add STRUCTURE_ANALYSIS job to BullMQ queue
 * 3. Wait: Poll for job completion using database tracking (max 10 minutes)
 * 4. Verify:
 *    - Job completes successfully
 *    - AnalysisResult schema validation passes
 *    - Minimum 10 lessons requirement met
 *    - English output enforced (regardless of input language)
 *    - Result stored in courses.analysis_result JSONB column
 *
 * Prerequisites:
 * - Redis >= 5.0.0 running at redis://localhost:6379
 * - Supabase database accessible with migrations applied
 * - Stage 4 analysis worker running or registered
 * - OpenRouter API key in .env (or mock enabled)
 * - Stage 3 migrations complete (courses.generation_status field)
 * - Stage 4 migrations complete (courses.analysis_result JSONB column)
 *
 * Test execution: pnpm test tests/integration/stage4-full-workflow.test.ts
 *
 * Reference: specs/007-stage-4-analyze/quickstart.md section 7.2
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
  return `test-stage4-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  timeout: number = 600000 // 10 minutes for full analysis workflow
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

// ============================================================================
// Test Suite Setup
// ============================================================================

describe('Stage 4: Full 5-Phase Analysis Workflow (Integration)', () => {
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
  // Test 1: Complete 5-Phase Analysis Workflow
  // ==========================================================================

  it.skipIf(shouldSkipTests)(
    'should complete full 5-phase analysis with English output and minimum 10 lessons',
    async () => {
      const supabase = getSupabaseAdmin();

      // =====================================================================
      // STEP 1: Create test course with Stage 3 complete status
      // =====================================================================
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .insert({
          organization_id: TEST_ORGS.premium.id,
          user_id: TEST_USERS.instructor1.id,
          title: 'Test Course - React Hooks',
          slug: `test-course-react-hooks-${Date.now()}`,
          generation_status: 'processing_documents', // Stage 3 complete
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
      // STEP 2: Create STRUCTURE_ANALYSIS job
      // =====================================================================
      const jobData: StructureAnalysisJob = {
        course_id: testCourseId,
        organization_id: TEST_ORGS.premium.id,
        user_id: TEST_USERS.instructor1.id,
        input: {
          topic: 'React Hooks',
          language: 'ru', // Russian input language
          style: 'professional',
          target_audience: 'intermediate',
          difficulty: 'intermediate',
          lesson_duration_minutes: 5,
          // No document_summaries - creating from scratch
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

      // Wait for analysis_result to be populated in database
      const updatedCourse = await waitForAnalysisResult(testCourseId, 600000);

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
      // STEP 5: Verify Minimum 10 Lessons
      // =====================================================================
      expect(validated.recommended_structure.total_lessons).toBeGreaterThanOrEqual(10);

      console.log(
        `✓ Minimum lessons requirement met: ${validated.recommended_structure.total_lessons} lessons`
      );

      // =====================================================================
      // STEP 6: Verify English Output (Regardless of Input Language)
      // =====================================================================
      // All text fields should be in English, not Russian
      // Check scope_instructions for Latin characters (English)
      const hasEnglishCharacters = /[a-zA-Z]/.test(validated.scope_instructions);
      expect(hasEnglishCharacters).toBe(true);

      // Check for absence of Cyrillic characters (Russian)
      const hasCyrillicCharacters = /[а-яА-ЯёЁ]/.test(validated.scope_instructions);
      expect(hasCyrillicCharacters).toBe(false);

      // Additional check: contextual_language fields should be in English
      expect(validated.contextual_language.why_matters_context).toMatch(/[a-zA-Z]/);
      expect(validated.contextual_language.motivators).toMatch(/[a-zA-Z]/);

      console.log('✓ English output verified (no Russian text found)');

      // =====================================================================
      // STEP 7: Verify Complete Structure
      // =====================================================================
      // Check that all required top-level fields are present
      expect(validated.course_category).toBeDefined();
      expect(validated.course_category.primary).toBeDefined();
      expect(validated.contextual_language).toBeDefined();
      expect(validated.topic_analysis).toBeDefined();
      expect(validated.recommended_structure).toBeDefined();
      expect(validated.pedagogical_strategy).toBeDefined();
      expect(validated.scope_instructions).toBeDefined();
      expect(validated.content_strategy).toBeDefined();
      expect(validated.research_flags).toBeDefined();
      expect(validated.metadata).toBeDefined();

      // Check metadata structure
      expect(validated.metadata.analysis_version).toBeDefined();
      expect(validated.metadata.total_duration_ms).toBeGreaterThan(0);
      expect(validated.metadata.total_tokens.total).toBeGreaterThan(0);
      expect(validated.metadata.total_cost_usd).toBeGreaterThanOrEqual(0);

      console.log('✓ Complete AnalysisResult structure verified');

      // =====================================================================
      // STEP 8: Log Analysis Summary
      // =====================================================================
      console.log('\n📊 Analysis Summary:');
      console.log(`   Category: ${validated.course_category.primary}`);
      console.log(`   Total Lessons: ${validated.recommended_structure.total_lessons}`);
      console.log(`   Total Sections: ${validated.recommended_structure.total_sections}`);
      console.log(`   Estimated Hours: ${validated.recommended_structure.estimated_content_hours}`);
      console.log(`   Teaching Style: ${validated.pedagogical_strategy.teaching_style}`);
      console.log(`   Content Strategy: ${validated.content_strategy}`);
      console.log(`   Research Flags: ${validated.research_flags.length}`);
      console.log(`   Total Duration: ${validated.metadata.total_duration_ms}ms`);
      console.log(`   Total Cost: $${validated.metadata.total_cost_usd.toFixed(4)}`);
      console.log(`   Total Tokens: ${validated.metadata.total_tokens.total}`);

      // =====================================================================
      // STEP 9: Verify Database Storage
      // =====================================================================
      // Re-query to confirm persistence
      const { data: finalCourse, error: finalError } = await supabase
        .from('courses')
        .select('analysis_result')
        .eq('id', testCourseId)
        .single();

      expect(finalError).toBeNull();
      expect(finalCourse).toBeDefined();
      expect(finalCourse.analysis_result).toBeDefined();
      expect(finalCourse.analysis_result).toEqual(analysisResult);

      console.log('✓ Database storage verified (persistent)');
    },
    600000 // 10-minute test timeout
  );

  // ==========================================================================
  // Test 2: Analysis with Russian Input - Verify English Output
  // ==========================================================================

  it.skipIf(shouldSkipTests)(
    'should enforce English output even with Russian input and detailed requirements',
    async () => {
      const supabase = getSupabaseAdmin();

      // Create test course with Russian topic and requirements
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .insert({
          organization_id: TEST_ORGS.premium.id,
          user_id: TEST_USERS.instructor1.id,
          title: 'Test Course - Закупки по 44-ФЗ',
          slug: `test-course-russian-${Date.now()}`,
          generation_status: 'processing_documents',
          status: 'draft',
        })
        .select()
        .single();

      if (courseError || !course) {
        throw new Error(`Failed to create test course: ${courseError?.message || 'Unknown error'}`);
      }

      const courseId = course.id;

      console.log(`✓ Test course created with Russian input: ${courseId}`);

      // Create STRUCTURE_ANALYSIS job
      const jobData: StructureAnalysisJob = {
        course_id: courseId,
        organization_id: TEST_ORGS.premium.id,
        user_id: TEST_USERS.instructor1.id,
        input: {
          topic: 'Закупки по 44-ФЗ',
          language: 'ru',
          style: 'professional',
          target_audience: 'beginner',
          difficulty: 'beginner',
          lesson_duration_minutes: 10,
          answers: 'Курс должен охватывать основы госзакупок по новому законодательству.',
        },
        priority: 5,
        attempt_count: 0,
        created_at: new Date().toISOString(),
      };

      const job = await addJob(JobType.STRUCTURE_ANALYSIS, jobData);
      console.log(`✓ STRUCTURE_ANALYSIS job created: ${job.id}`);

      // Wait for completion
      console.log('⏳ Waiting for analysis to complete...');
      const updatedCourse = await waitForAnalysisResult(courseId, 600000);

      const analysisResult = updatedCourse.analysis_result;
      expect(analysisResult).toBeDefined();

      // Validate schema
      const validated = AnalysisResultSchema.parse(analysisResult);

      // CRITICAL: Verify all text output is in English, not Russian
      const allTextFields = [
        validated.scope_instructions,
        validated.contextual_language.why_matters_context,
        validated.contextual_language.motivators,
        validated.contextual_language.experience_prompt,
        validated.contextual_language.problem_statement_context,
        validated.contextual_language.knowledge_bridge,
        validated.contextual_language.practical_benefit_focus,
        validated.topic_analysis.determined_topic,
        validated.topic_analysis.reasoning,
        validated.recommended_structure.scope_reasoning,
        validated.recommended_structure.calculation_explanation,
        validated.pedagogical_strategy.assessment_approach,
        validated.pedagogical_strategy.progression_logic,
      ].join(' ');

      // Should contain English characters
      expect(allTextFields).toMatch(/[a-zA-Z]/);

      // Should NOT contain Cyrillic characters
      const cyrillicMatch = allTextFields.match(/[а-яА-ЯёЁ]/g);
      if (cyrillicMatch) {
        console.error('❌ Found Cyrillic characters in output:', cyrillicMatch.join(''));
      }
      expect(cyrillicMatch).toBeNull();

      console.log('✓ English output enforced (Russian input successfully translated)');

      // Cleanup
      await supabase.from('courses').delete().eq('id', courseId);
    },
    600000 // 10-minute test timeout
  );
});
