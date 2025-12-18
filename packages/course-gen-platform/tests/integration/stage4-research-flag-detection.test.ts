/**
 * Stage 4: Research Flag Detection - Integration Test (US4)
 *
 * Test Objective: Verify that Phase 3 (Expert Analysis) correctly detects research flags
 * for time-sensitive content requiring web research while maintaining conservative
 * detection to minimize false positives (<5% flag rate target).
 *
 * Test Coverage:
 * 1. Flaggable content:
 *    - Legal/regulatory content (e.g., "Постановление 1875 о закупках")
 *    - Technology versions (e.g., "React 19 Breaking Changes")
 *    - Current events (e.g., "2024 Market Trends Analysis")
 *
 * 2. Non-flaggable content:
 *    - General programming concepts (e.g., "JavaScript Functions and Loops")
 *    - Timeless skills (e.g., "Leadership and Communication")
 *    - Creative techniques (e.g., "Watercolor Painting Techniques")
 *
 * 3. Conservative threshold validation:
 *    - Most courses should NOT have research flags
 *    - Only truly time-sensitive content flagged
 *    - Target: <5% flag rate
 *
 * Prerequisites:
 * - Redis >= 5.0.0 running at redis://localhost:6379
 * - Supabase database accessible with migrations applied
 * - Stage 4 analysis worker running or registered
 * - OpenRouter API key in .env (or mock enabled)
 * - Stage 4 migrations complete (courses.analysis_result JSONB column)
 *
 * Test execution: pnpm test tests/integration/stage4-research-flag-detection.test.ts
 *
 * Reference: specs/007-stage-4-analyze/research.md section 2
 * Reference: specs/007-stage-4-analyze/tasks.md Task T042
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { addJob, closeQueue } from '../../src/orchestrator/queue';
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
 * Wait for analysis_result to be populated in database
 *
 * Polls the courses table for analysis_result to be populated after job completion.
 *
 * @param courseId - Course UUID
 * @param timeout - Maximum wait time in milliseconds (default: 600000 = 10 minutes)
 * @returns Course record with analysis_result
 * @throws Error if timeout reached before analysis_result populated
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
      .select('analysis_result, generation_status')
      .eq('id', courseId)
      .single();

    if (error) {
      throw new Error(`Failed to query courses table: ${error.message}`);
    }

    // Check if analysis_result is populated
    if (course.analysis_result !== null && typeof course.analysis_result === 'object') {
      return course;
    }

    // Wait 2 seconds before checking again (longer interval for LLM processing)
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error(
    `Timeout waiting for analysis_result to be populated in course ${courseId}. ` +
      `This may indicate Stage 4 analysis failed or worker is not running.`
  );
}

/**
 * Create a test course and run STRUCTURE_ANALYSIS job
 *
 * Helper function to reduce boilerplate in tests.
 *
 * @param topic - Course topic
 * @param language - Input language (default: 'en')
 * @param lessonDuration - Lesson duration in minutes (default: 5)
 * @param answers - Additional user requirements (optional)
 * @returns Object with courseId, jobId, and analysis result
 */
async function runAnalysisForTopic(
  topic: string,
  language: string = 'en',
  lessonDuration: number = 5,
  answers?: string
): Promise<{
  courseId: string;
  jobId: string;
  analysisResult: any;
}> {
  const supabase = getSupabaseAdmin();

  // Create test course
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .insert({
      organization_id: TEST_ORGS.premium.id,
      user_id: TEST_USERS.instructor1.id,
      title: `Test Course - ${topic}`,
      slug: `test-course-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      generation_status: 'analyzing_task', // Ready for Stage 4 analysis
      status: 'draft',
    })
    .select()
    .single();

  if (courseError || !course) {
    throw new Error(`Failed to create test course: ${courseError?.message || 'Unknown error'}`);
  }

  const courseId = course.id;

  // Create STRUCTURE_ANALYSIS job
  const jobData: StructureAnalysisJob = {
    course_id: courseId,
    organization_id: TEST_ORGS.premium.id,
    user_id: TEST_USERS.instructor1.id,
    input: {
      topic,
      language,
      style: 'professional',
      target_audience: 'intermediate',
      difficulty: 'intermediate',
      lesson_duration_minutes: lessonDuration,
      answers,
    },
    priority: 5,
    attempt_count: 0,
    created_at: new Date().toISOString(),
  };

  const job = await addJob(JobType.STRUCTURE_ANALYSIS, jobData);
  const jobId = job.id!;

  // Wait for analysis to complete
  const updatedCourse = await waitForAnalysisResult(courseId, 600000);

  // Parse and validate analysis result
  const analysisResult = AnalysisResultSchema.parse(updatedCourse.analysis_result);

  return { courseId, jobId, analysisResult };
}

// ============================================================================
// Test Suite Setup
// ============================================================================

describe('Stage 4: Research Flag Detection (US4)', () => {
  let testCourseIds: string[] = [];
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

    // Clean up all test courses created during tests
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
  // Test Group 1: Flaggable Content (Time-Sensitive)
  // ==========================================================================

  it.skipIf(shouldSkipTests)(
    'should flag legal/regulatory content (Постановление 1875 о закупках)',
    async () => {
      console.log('⏳ Testing legal/regulatory content flagging...');

      const { courseId, analysisResult } = await runAnalysisForTopic(
        'Постановление 1875 о закупках',
        'ru',
        10,
        'Российское законодательство о государственных закупках'
      );

      testCourseIds.push(courseId);

      // Verify research flags exist
      expect(analysisResult.research_flags).toBeDefined();
      expect(analysisResult.research_flags.length).toBeGreaterThan(0);

      // Verify flag structure and content
      const flag = analysisResult.research_flags[0];
      expect(flag.topic).toBeDefined();
      expect(flag.reason).toBeDefined();
      expect(flag.context).toBeDefined();

      // Verify reason mentions regulation/law/compliance
      expect(flag.reason.toLowerCase()).toMatch(/regulation|law|compliance|legal/i);

      // Verify topic or context mentions 1875 or procurement or закупки
      const combinedText = `${flag.topic} ${flag.context}`.toLowerCase();
      expect(combinedText).toMatch(/1875|procurement|закупк/i);

      // Verify context length constraints (50-200 chars)
      expect(flag.context.length).toBeGreaterThanOrEqual(50);
      expect(flag.context.length).toBeLessThanOrEqual(200);

      console.log(`✓ Legal content flagged: "${flag.topic}"`);
      console.log(`  Reason: ${flag.reason}`);
      console.log(`  Context: ${flag.context.substring(0, 80)}...`);
    },
    600000 // 10-minute test timeout
  );

  it.skipIf(shouldSkipTests)(
    'should flag technology version content (React 19 Breaking Changes)',
    async () => {
      console.log('⏳ Testing technology version content flagging...');

      const { courseId, analysisResult } = await runAnalysisForTopic(
        'React 19 Breaking Changes and New Features',
        'en',
        5,
        'Cover what changed in React 19, migration guide from React 18'
      );

      testCourseIds.push(courseId);

      // Verify research flags exist
      expect(analysisResult.research_flags).toBeDefined();
      expect(analysisResult.research_flags.length).toBeGreaterThan(0);

      // Verify flag mentions React and version
      const flag = analysisResult.research_flags[0];
      const combinedText = `${flag.topic} ${flag.context}`.toLowerCase();
      expect(combinedText).toMatch(/react.*19|react.*version|breaking.*change/i);

      // Verify reason is technology-related
      expect(flag.reason.toLowerCase()).toMatch(/technology|version|update|trend/i);

      console.log(`✓ Technology version flagged: "${flag.topic}"`);
      console.log(`  Reason: ${flag.reason}`);
    },
    600000 // 10-minute test timeout
  );

  it.skipIf(shouldSkipTests)(
    'should flag current events content (2024 Market Trends)',
    async () => {
      console.log('⏳ Testing current events content flagging...');

      const { courseId, analysisResult } = await runAnalysisForTopic(
        '2024 Market Trends Analysis in AI Industry',
        'en',
        10,
        'Cover current market dynamics, investment trends, major players in 2024'
      );

      testCourseIds.push(courseId);

      // Verify research flags exist
      expect(analysisResult.research_flags).toBeDefined();
      expect(analysisResult.research_flags.length).toBeGreaterThan(0);

      // Verify flag mentions current events or year
      const flag = analysisResult.research_flags[0];
      const combinedText = `${flag.topic} ${flag.context}`.toLowerCase();
      expect(combinedText).toMatch(/2024|market.*trend|current|event/i);

      console.log(`✓ Current events flagged: "${flag.topic}"`);
      console.log(`  Reason: ${flag.reason}`);
    },
    600000 // 10-minute test timeout
  );

  // ==========================================================================
  // Test Group 2: Non-Flaggable Content (Timeless)
  // ==========================================================================

  it.skipIf(shouldSkipTests)(
    'should NOT flag general programming concepts (JavaScript Functions and Loops)',
    async () => {
      console.log('⏳ Testing general programming concepts (should NOT flag)...');

      const { courseId, analysisResult } = await runAnalysisForTopic(
        'JavaScript Functions and Loops',
        'en',
        5,
        'Basic programming concepts for beginners: functions, loops, conditionals'
      );

      testCourseIds.push(courseId);

      // Verify NO research flags
      expect(analysisResult.research_flags).toBeDefined();
      expect(analysisResult.research_flags.length).toBe(0);

      console.log('✓ General programming concepts NOT flagged (correct behavior)');
    },
    600000 // 10-minute test timeout
  );

  it.skipIf(shouldSkipTests)(
    'should NOT flag timeless skills (Leadership and Communication)',
    async () => {
      console.log('⏳ Testing timeless skills (should NOT flag)...');

      const { courseId, analysisResult } = await runAnalysisForTopic(
        'Leadership and Communication Skills',
        'en',
        10,
        'Soft skills for managers: effective communication, team leadership, conflict resolution'
      );

      testCourseIds.push(courseId);

      // Verify NO research flags
      expect(analysisResult.research_flags).toBeDefined();
      expect(analysisResult.research_flags.length).toBe(0);

      console.log('✓ Timeless skills NOT flagged (correct behavior)');
    },
    600000 // 10-minute test timeout
  );

  it.skipIf(shouldSkipTests)(
    'should NOT flag creative/spiritual content (Watercolor Painting)',
    async () => {
      console.log('⏳ Testing creative/spiritual content (should NOT flag)...');

      const { courseId, analysisResult } = await runAnalysisForTopic(
        'Watercolor Painting Techniques',
        'en',
        15,
        'Artistic expression through watercolors: wet-on-wet, dry brush, gradients'
      );

      testCourseIds.push(courseId);

      // Verify NO research flags
      expect(analysisResult.research_flags).toBeDefined();
      expect(analysisResult.research_flags.length).toBe(0);

      console.log('✓ Creative content NOT flagged (correct behavior)');
    },
    600000 // 10-minute test timeout
  );

  it.skipIf(shouldSkipTests)(
    'should NOT flag timeless technical concepts (REST API Design)',
    async () => {
      console.log('⏳ Testing timeless technical concepts (should NOT flag)...');

      const { courseId, analysisResult } = await runAnalysisForTopic(
        'RESTful API Design Best Practices',
        'en',
        10,
        'HTTP methods, status codes, resource naming, HATEOAS principles'
      );

      testCourseIds.push(courseId);

      // Verify NO research flags
      expect(analysisResult.research_flags).toBeDefined();
      expect(analysisResult.research_flags.length).toBe(0);

      console.log('✓ Timeless technical concepts NOT flagged (correct behavior)');
    },
    600000 // 10-minute test timeout
  );

  // ==========================================================================
  // Test Group 3: Conservative Detection Validation (<5% Flag Rate)
  // ==========================================================================

  it.skipIf(shouldSkipTests)(
    'should maintain <5% flag rate for diverse general topics (conservative detection)',
    async () => {
      console.log('⏳ Testing conservative detection with 20 diverse topics...');

      // 20 diverse topics that should generally NOT be flagged
      // These are timeless, general concepts across various domains
      const generalTopics = [
        'Python Programming Basics',
        'Photography Fundamentals',
        'Time Management Skills',
        'Yoga and Meditation',
        'Web Design Principles',
        'Database Normalization',
        'Public Speaking Techniques',
        'Creative Writing Workshop',
        'Music Theory Introduction',
        'Project Management Fundamentals',
        'Critical Thinking Skills',
        'Data Structures and Algorithms',
        'Graphic Design Basics',
        'Financial Literacy',
        'Customer Service Excellence',
        'Cooking Mediterranean Cuisine',
        'Interior Design Principles',
        'Social Media Marketing Strategy',
        'Mindfulness and Stress Reduction',
        'Business Ethics',
      ];

      let flagCount = 0;
      const flaggedTopics: string[] = [];

      // Run analysis for each topic
      for (const topic of generalTopics) {
        const { courseId, analysisResult } = await runAnalysisForTopic(topic, 'en', 10);
        testCourseIds.push(courseId);

        if (analysisResult.research_flags.length > 0) {
          flagCount++;
          flaggedTopics.push(topic);
          console.log(`  ⚠️  Flagged: "${topic}" (${analysisResult.research_flags.length} flags)`);
        } else {
          console.log(`  ✓ Not flagged: "${topic}"`);
        }

        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Calculate flag rate
      const flagRate = (flagCount / generalTopics.length) * 100;

      console.log(`\n📊 Conservative Detection Results:`);
      console.log(`   Total topics tested: ${generalTopics.length}`);
      console.log(`   Flagged topics: ${flagCount}`);
      console.log(`   Flag rate: ${flagRate.toFixed(1)}%`);
      console.log(`   Flagged topics: ${flaggedTopics.join(', ') || 'none'}`);

      // Verify flag rate is below 5%
      expect(flagRate).toBeLessThan(5);

      console.log('✓ Conservative detection verified (flag rate < 5%)');
    },
    1200000 // 20-minute test timeout (20 topics × ~30s each + buffer)
  );

  // ==========================================================================
  // Test Group 4: ResearchFlag Schema Validation
  // ==========================================================================

  it.skipIf(shouldSkipTests)(
    'should validate ResearchFlag schema structure for flagged content',
    async () => {
      console.log('⏳ Testing ResearchFlag schema validation...');

      const { courseId, analysisResult } = await runAnalysisForTopic(
        'GDPR Compliance and Data Protection Regulations 2024',
        'en',
        10,
        'Current GDPR requirements, recent enforcement cases, compliance checklist'
      );

      testCourseIds.push(courseId);

      // Verify research flags exist
      expect(analysisResult.research_flags).toBeDefined();
      expect(analysisResult.research_flags.length).toBeGreaterThan(0);

      // Validate each flag against schema
      for (const flag of analysisResult.research_flags) {
        // topic: string (min 3, max 100 chars)
        expect(flag.topic).toBeDefined();
        expect(typeof flag.topic).toBe('string');
        expect(flag.topic.length).toBeGreaterThanOrEqual(3);
        expect(flag.topic.length).toBeLessThanOrEqual(100);

        // reason: string (min 3, max 50 chars)
        expect(flag.reason).toBeDefined();
        expect(typeof flag.reason).toBe('string');
        expect(flag.reason.length).toBeGreaterThanOrEqual(3);
        expect(flag.reason.length).toBeLessThanOrEqual(50);

        // context: string (min 50, max 200 chars)
        expect(flag.context).toBeDefined();
        expect(typeof flag.context).toBe('string');
        expect(flag.context.length).toBeGreaterThanOrEqual(50);
        expect(flag.context.length).toBeLessThanOrEqual(200);

        console.log(`  ✓ Flag validated: "${flag.topic}"`);
        console.log(`    - Reason length: ${flag.reason.length} chars`);
        console.log(`    - Context length: ${flag.context.length} chars`);
      }

      console.log('✓ ResearchFlag schema validation passed');
    },
    600000 // 10-minute test timeout
  );

  it.skipIf(shouldSkipTests)(
    'should validate empty research_flags array for non-flaggable content',
    async () => {
      console.log('⏳ Testing empty research_flags array validation...');

      const { courseId, analysisResult } = await runAnalysisForTopic(
        'Object-Oriented Programming Fundamentals',
        'en',
        10,
        'Classes, objects, inheritance, polymorphism, encapsulation'
      );

      testCourseIds.push(courseId);

      // Verify research_flags is defined and is an empty array
      expect(analysisResult.research_flags).toBeDefined();
      expect(Array.isArray(analysisResult.research_flags)).toBe(true);
      expect(analysisResult.research_flags.length).toBe(0);

      console.log('✓ Empty research_flags array validated');
    },
    600000 // 10-minute test timeout
  );
});
