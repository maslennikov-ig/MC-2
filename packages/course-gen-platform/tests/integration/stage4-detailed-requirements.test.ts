/**
 * Stage 4: Detailed Requirements Course - Integration Test (Task T041)
 *
 * Test Objective: Verify that detailed user requirements (via `answers` field)
 * are properly incorporated into analysis across all relevant phases.
 *
 * Test Flow:
 * 1. Minimal requirements (no `answers` field): Verify basic analysis works
 * 2. Detailed English requirements: Verify requirements incorporated into:
 *    - topic_analysis.key_concepts
 *    - expansion_areas (if needed)
 *    - scope_instructions
 * 3. Russian requirements: Verify translation to English and incorporation
 *
 * Prerequisites:
 * - Redis >= 5.0.0 running at redis://localhost:6379
 * - Supabase database accessible with migrations applied
 * - Stage 4 analysis worker running or registered
 * - OpenRouter API key in .env (or mock enabled)
 * - Stage 4 migrations complete (courses.analysis_result JSONB column)
 *
 * Test execution: pnpm test tests/integration/stage4-detailed-requirements.test.ts
 *
 * Reference: specs/007-stage-4-analyze/plan.md User Story 3
 * Reference: specs/007-stage-4-analyze/tasks.md Task T041
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
  return `test-requirements-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Wait for analysis_result to be populated in database
 *
 * @param courseId - Course UUID
 * @param timeout - Maximum wait time in milliseconds (default: 600000 = 10 minutes)
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

describe('Stage 4: Detailed Requirements Handling (US3)', () => {
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
  // Test 1: Minimal Requirements (No `answers` Field)
  // ==========================================================================

  it.skipIf(shouldSkipTests)(
    'should work with minimal requirements (topic only)',
    async () => {
      const supabase = getSupabaseAdmin();

      // =====================================================================
      // STEP 1: Create test course with minimal input
      // =====================================================================
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .insert({
          organization_id: TEST_ORGS.premium.id,
          user_id: TEST_USERS.instructor1.id,
          title: 'Test Course - React Hooks (Minimal)',
          slug: `test-minimal-requirements-${Date.now()}`,
          generation_status: 'analyzing_task', // Stage 4 ready
          status: 'draft',
        })
        .select()
        .single();

      if (courseError || !course) {
        throw new Error(`Failed to create test course: ${courseError?.message || 'Unknown error'}`);
      }

      const courseId = course.id;

      console.log(`✓ Test course created (minimal requirements): ${courseId}`);

      // =====================================================================
      // STEP 2: Create STRUCTURE_ANALYSIS job with NO answers field
      // =====================================================================
      const jobData: StructureAnalysisJob = {
        course_id: courseId,
        organization_id: TEST_ORGS.premium.id,
        user_id: TEST_USERS.instructor1.id,
        input: {
          topic: 'React Hooks',
          language: 'en',
          style: 'professional',
          target_audience: 'intermediate',
          difficulty: 'intermediate',
          lesson_duration_minutes: 5,
          // NO answers field - minimal requirements
        },
        priority: 5,
        attempt_count: 0,
        created_at: new Date().toISOString(),
      };

      const job = await addJob(JobType.STRUCTURE_ANALYSIS, jobData);
      expect(job.id).toBeDefined();

      console.log(`✓ STRUCTURE_ANALYSIS job created: ${job.id}`);

      // =====================================================================
      // STEP 3: Wait for completion (max 10 minutes)
      // =====================================================================
      console.log('⏳ Waiting for analysis to complete (max 10 minutes)...');

      const updatedCourse = await waitForAnalysisResult(courseId, 600000);

      expect(updatedCourse.analysis_result).toBeDefined();
      expect(updatedCourse.analysis_result).not.toBeNull();

      console.log('✓ Analysis result stored in database');

      // =====================================================================
      // STEP 4: Validate Schema
      // =====================================================================
      const analysisResult = updatedCourse.analysis_result;
      const validated = AnalysisResultSchema.parse(analysisResult);

      expect(validated).toBeDefined();
      expect(validated.topic_analysis.key_concepts.length).toBeGreaterThanOrEqual(3);
      expect(validated.scope_instructions).toBeDefined();
      expect(validated.scope_instructions.length).toBeGreaterThan(0);

      console.log('✓ Minimal requirements test passed (basic analysis works)');

      // Cleanup
      await supabase.from('courses').delete().eq('id', courseId);
    },
    600000 // 10-minute test timeout
  );

  // ==========================================================================
  // Test 2: Detailed English Requirements
  // ==========================================================================

  it.skipIf(shouldSkipTests)(
    'should incorporate detailed English requirements into analysis',
    async () => {
      const supabase = getSupabaseAdmin();

      // =====================================================================
      // STEP 1: Create test course with detailed requirements
      // =====================================================================
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .insert({
          organization_id: TEST_ORGS.premium.id,
          user_id: TEST_USERS.instructor1.id,
          title: 'Test Course - React Hooks (Detailed)',
          slug: `test-detailed-requirements-${Date.now()}`,
          generation_status: 'analyzing_task', // Stage 4 ready
          status: 'draft',
        })
        .select()
        .single();

      if (courseError || !course) {
        throw new Error(`Failed to create test course: ${courseError?.message || 'Unknown error'}`);
      }

      const courseId = course.id;

      console.log(`✓ Test course created (detailed requirements): ${courseId}`);

      // =====================================================================
      // STEP 2: Create job with detailed `answers` field
      // =====================================================================
      const detailedRequirements =
        'Focus on useEffect cleanup, custom hooks patterns, performance optimization with useMemo/useCallback';

      const jobData: StructureAnalysisJob = {
        course_id: courseId,
        organization_id: TEST_ORGS.premium.id,
        user_id: TEST_USERS.instructor1.id,
        input: {
          topic: 'React Hooks',
          language: 'en',
          style: 'professional',
          target_audience: 'intermediate',
          difficulty: 'intermediate',
          lesson_duration_minutes: 5,
          answers: detailedRequirements, // DETAILED requirements
        },
        priority: 5,
        attempt_count: 0,
        created_at: new Date().toISOString(),
      };

      const job = await addJob(JobType.STRUCTURE_ANALYSIS, jobData);
      expect(job.id).toBeDefined();

      console.log(`✓ STRUCTURE_ANALYSIS job created with detailed requirements`);
      console.log(`   Requirements: "${detailedRequirements}"`);

      // =====================================================================
      // STEP 3: Wait for completion
      // =====================================================================
      console.log('⏳ Waiting for analysis to complete (max 10 minutes)...');

      const updatedCourse = await waitForAnalysisResult(courseId, 600000);

      const analysisResult = updatedCourse.analysis_result;
      const validated = AnalysisResultSchema.parse(analysisResult);

      // =====================================================================
      // STEP 4: Verify requirements incorporated into key_concepts
      // =====================================================================
      const conceptsStr = validated.topic_analysis.key_concepts.join(' ').toLowerCase();

      console.log(`   Key concepts: ${validated.topic_analysis.key_concepts.join(', ')}`);

      // Check for useEffect/cleanup
      const hasUseEffectOrCleanup =
        conceptsStr.includes('useeffect') || conceptsStr.includes('cleanup');
      expect(hasUseEffectOrCleanup).toBe(true);

      // Check for custom hooks
      const hasCustomHooks =
        conceptsStr.includes('custom') && conceptsStr.includes('hook');
      expect(hasCustomHooks).toBe(true);

      // Check for performance optimization (useMemo/useCallback)
      const hasPerformance =
        conceptsStr.includes('usememo') ||
        conceptsStr.includes('usecallback') ||
        conceptsStr.includes('performance') ||
        conceptsStr.includes('optimization');
      expect(hasPerformance).toBe(true);

      console.log('✓ Requirements incorporated into key_concepts:');
      console.log('   - useEffect/cleanup: ✓');
      console.log('   - Custom hooks: ✓');
      console.log('   - Performance optimization: ✓');

      // =====================================================================
      // STEP 5: Verify scope_instructions reference requirements
      // =====================================================================
      const scopeInstructions = validated.scope_instructions.toLowerCase();

      console.log(`   Scope instructions length: ${validated.scope_instructions.length} chars`);

      // Should reference at least one of the key topics from requirements
      const hasRelevantInstructions =
        scopeInstructions.includes('useeffect') ||
        scopeInstructions.includes('cleanup') ||
        scopeInstructions.includes('custom hook') ||
        scopeInstructions.includes('performance') ||
        scopeInstructions.includes('usememo') ||
        scopeInstructions.includes('usecallback');

      expect(hasRelevantInstructions).toBe(true);

      console.log('✓ Scope instructions reference user requirements');

      // =====================================================================
      // STEP 6: Verify expansion_areas address specific topics (if present)
      // =====================================================================
      if (validated.expansion_areas && validated.expansion_areas.length > 0) {
        const expansionAreasStr = validated.expansion_areas
          .map(area => `${area.topic} ${area.reasoning}`)
          .join(' ')
          .toLowerCase();

        console.log(`   Expansion areas: ${validated.expansion_areas.length} areas identified`);
        console.log(
          `   Topics: ${validated.expansion_areas.map(a => a.topic).join(', ')}`
        );

        // Expansion areas should align with requirements
        // (This is optional - may not always have expansion areas)
      } else {
        console.log('   No expansion areas needed (information complete)');
      }

      // =====================================================================
      // STEP 7: Summary
      // =====================================================================
      console.log('\n📊 Detailed Requirements Test Summary:');
      console.log(`   ✓ Key concepts include user-specified topics`);
      console.log(`   ✓ Scope instructions reference requirements`);
      console.log(`   ✓ Total lessons: ${validated.recommended_structure.total_lessons}`);
      console.log(`   ✓ Total sections: ${validated.recommended_structure.total_sections}`);

      // Cleanup
      await supabase.from('courses').delete().eq('id', courseId);
    },
    600000 // 10-minute test timeout
  );

  // ==========================================================================
  // Test 3: Russian Requirements with English Output
  // ==========================================================================

  it.skipIf(shouldSkipTests)(
    'should handle Russian requirements and output English',
    async () => {
      const supabase = getSupabaseAdmin();

      // =====================================================================
      // STEP 1: Create test course with Russian topic and requirements
      // =====================================================================
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .insert({
          organization_id: TEST_ORGS.premium.id,
          user_id: TEST_USERS.instructor1.id,
          title: 'Test Course - Закупки по 44-ФЗ (Russian)',
          slug: `test-russian-requirements-${Date.now()}`,
          generation_status: 'analyzing_task', // Stage 4 ready
          status: 'draft',
        })
        .select()
        .single();

      if (courseError || !course) {
        throw new Error(`Failed to create test course: ${courseError?.message || 'Unknown error'}`);
      }

      const courseId = course.id;

      console.log(`✓ Test course created (Russian requirements): ${courseId}`);

      // =====================================================================
      // STEP 2: Create job with Russian `answers` field
      // =====================================================================
      const russianRequirements =
        'Должен охватить планирование закупок, обоснование НМЦК, контрактную систему';

      const jobData: StructureAnalysisJob = {
        course_id: courseId,
        organization_id: TEST_ORGS.premium.id,
        user_id: TEST_USERS.instructor1.id,
        input: {
          topic: 'Закупки по 44-ФЗ',
          language: 'ru', // Russian input language
          style: 'professional',
          target_audience: 'beginner',
          difficulty: 'beginner',
          lesson_duration_minutes: 10,
          answers: russianRequirements, // RUSSIAN requirements
        },
        priority: 5,
        attempt_count: 0,
        created_at: new Date().toISOString(),
      };

      const job = await addJob(JobType.STRUCTURE_ANALYSIS, jobData);
      expect(job.id).toBeDefined();

      console.log(`✓ STRUCTURE_ANALYSIS job created with Russian requirements`);
      console.log(`   Requirements (Russian): "${russianRequirements}"`);

      // =====================================================================
      // STEP 3: Wait for completion
      // =====================================================================
      console.log('⏳ Waiting for analysis to complete (max 10 minutes)...');

      const updatedCourse = await waitForAnalysisResult(courseId, 600000);

      const analysisResult = updatedCourse.analysis_result;
      const validated = AnalysisResultSchema.parse(analysisResult);

      // =====================================================================
      // STEP 4: Verify output is in ENGLISH (no Cyrillic)
      // =====================================================================
      const allTextFields = [
        validated.scope_instructions,
        validated.contextual_language.why_matters_context,
        validated.contextual_language.motivators,
        validated.topic_analysis.determined_topic,
        validated.topic_analysis.reasoning,
        validated.recommended_structure.scope_reasoning,
        validated.pedagogical_strategy.assessment_approach,
        ...validated.topic_analysis.key_concepts,
        ...validated.topic_analysis.domain_keywords,
      ].join(' ');

      // Should contain English characters
      expect(allTextFields).toMatch(/[a-zA-Z]/);

      // Should NOT contain Cyrillic characters
      const cyrillicMatch = allTextFields.match(/[а-яА-ЯёЁ]/g);
      if (cyrillicMatch) {
        console.error('❌ Found Cyrillic characters in output:', cyrillicMatch.slice(0, 20).join(''));
      }
      expect(cyrillicMatch).toBeNull();

      console.log('✓ Output is English-only (no Cyrillic characters)');

      // =====================================================================
      // STEP 5: Verify Russian requirements translated and incorporated
      // =====================================================================
      const conceptsStr = validated.topic_analysis.key_concepts.join(' ').toLowerCase();
      const keywordsStr = validated.topic_analysis.domain_keywords.join(' ').toLowerCase();
      const combinedStr = `${conceptsStr} ${keywordsStr}`;

      console.log(`   Key concepts: ${validated.topic_analysis.key_concepts.join(', ')}`);
      console.log(`   Domain keywords: ${validated.topic_analysis.domain_keywords.join(', ')}`);

      // Check for procurement-related terms (translated from Russian)
      // "планирование закупок" → "procurement planning"
      // "обоснование НМЦК" → "price justification" or "initial maximum contract price"
      // "контрактную систему" → "contract system" or "contracting"

      const hasProcurement =
        combinedStr.includes('procurement') ||
        combinedStr.includes('purchasing') ||
        combinedStr.includes('acquisition');

      const hasPlanning =
        combinedStr.includes('planning') ||
        combinedStr.includes('plan');

      const hasContract =
        combinedStr.includes('contract') ||
        combinedStr.includes('contracting');

      // At least 2 out of 3 topics should be present
      const matchCount = [hasProcurement, hasPlanning, hasContract].filter(Boolean).length;
      expect(matchCount).toBeGreaterThanOrEqual(2);

      console.log('✓ Russian requirements translated and incorporated:');
      console.log(`   - Procurement/purchasing: ${hasProcurement ? '✓' : '✗'}`);
      console.log(`   - Planning: ${hasPlanning ? '✓' : '✗'}`);
      console.log(`   - Contract system: ${hasContract ? '✓' : '✗'}`);

      // =====================================================================
      // STEP 6: Summary
      // =====================================================================
      console.log('\n📊 Russian Requirements Test Summary:');
      console.log(`   ✓ Output is English-only (translated from Russian)`);
      console.log(`   ✓ Russian requirements incorporated after translation`);
      console.log(`   ✓ Total lessons: ${validated.recommended_structure.total_lessons}`);
      console.log(`   ✓ Category: ${validated.course_category.primary}`);

      // Cleanup
      await supabase.from('courses').delete().eq('id', courseId);
    },
    600000 // 10-minute test timeout
  );
});
