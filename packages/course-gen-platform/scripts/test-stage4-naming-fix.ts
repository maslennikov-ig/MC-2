/**
 * Test Script: Stage 4 Naming Convention Fix
 *
 * Verifies that STRUCTURE_ANALYSIS jobs work correctly with camelCase field names.
 * Tests the fix for the "Course not found: invalid input syntax for type uuid: undefined" error.
 *
 * Prerequisites:
 * - Docker services running (redis)
 * - Worker process running (pnpm dev:worker) OR use --direct mode
 * - Supabase connection configured
 *
 * Usage:
 *   pnpm exec tsx scripts/test-stage4-naming-fix.ts
 *   pnpm exec tsx scripts/test-stage4-naming-fix.ts --direct  # Skip queue, run handler directly
 */

import * as path from 'path';
import dotenv from 'dotenv';
const envPath = path.resolve(__dirname, '..', '.env');
dotenv.config({ path: envPath });

import { v4 as uuidv4 } from 'uuid';
import { getSupabaseAdmin } from '../src/shared/supabase/admin';
import { addJob } from '../src/orchestrator/queue';
import { JobType, StructureAnalysisJobDataSchema } from '@megacampus/shared-types';
import { stage4AnalysisHandler } from '../src/stages/stage4-analysis/handler';
import { Job } from 'bullmq';

// ============================================================================
// Configuration
// ============================================================================

const DIRECT_MODE = process.argv.includes('--direct');
const MAX_WAIT_MS = 120000; // 2 minutes

// ============================================================================
// Helper Functions
// ============================================================================

function log(message: string, data?: object) {
  const timestamp = new Date().toISOString().slice(11, 23);
  if (data) {
    console.log(`[${timestamp}] ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Test Setup
// ============================================================================

async function createTestCourse(): Promise<{ courseId: string; organizationId: string; userId: string }> {
  const supabase = getSupabaseAdmin();

  // Find existing organization or use a test one
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id')
    .limit(1);

  const organizationId = orgs?.[0]?.id || uuidv4();

  // Find existing user or use a test one
  const { data: users } = await supabase
    .from('users')
    .select('id')
    .limit(1);

  const userId = users?.[0]?.id || uuidv4();

  // Create test course
  const courseId = uuidv4();
  const slug = `test-stage4-${Date.now()}`;
  const { error: courseError } = await supabase
    .from('courses')
    .insert({
      id: courseId,
      organization_id: organizationId,
      user_id: userId,
      title: 'Test Course for Stage 4 Naming Fix',
      slug,
      language: 'ru',
      style: 'practical',
      difficulty: 'intermediate',
      generation_status: 'pending',
      settings: {
        lesson_duration_minutes: 15,
        topic: 'Введение в машинное обучение',
      },
    });

  if (courseError) {
    throw new Error(`Failed to create test course: ${courseError.message}`);
  }

  log('Created test course', { courseId, organizationId, userId });
  return { courseId, organizationId, userId };
}

async function cleanupTestCourse(courseId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  await supabase.from('generation_traces').delete().eq('course_id', courseId);
  await supabase.from('file_catalog').delete().eq('course_id', courseId);
  await supabase.from('courses').delete().eq('id', courseId);

  log('Cleaned up test course', { courseId });
}

// ============================================================================
// Main Test
// ============================================================================

async function testStage4NamingFix(): Promise<boolean> {
  log('=== Stage 4 Naming Convention Fix Test ===');
  log(`Mode: ${DIRECT_MODE ? 'DIRECT (no queue)' : 'QUEUE (requires worker)'}`);

  let courseId: string | null = null;

  try {
    // Step 1: Create test course
    log('Step 1: Creating test course...');
    const { courseId: cid, organizationId, userId } = await createTestCourse();
    courseId = cid;

    // Step 2: Build job data with camelCase fields (as router does)
    log('Step 2: Building job data with camelCase fields...');
    const jobData = {
      jobType: JobType.STRUCTURE_ANALYSIS,
      organizationId,
      courseId,
      userId,
      createdAt: new Date().toISOString(),
      // Optional fields from StructureAnalysisJobData
      title: 'Test Course for Stage 4 Naming Fix',
      settings: { lesson_duration_minutes: 15 },
      webhookUrl: null,
    };

    // Validate job data against schema
    const parseResult = StructureAnalysisJobDataSchema.safeParse(jobData);
    if (!parseResult.success) {
      log('ERROR: Job data validation failed', { errors: parseResult.error.errors });
      return false;
    }
    log('Job data validated successfully', { jobData });

    if (DIRECT_MODE) {
      // Step 3a: Run handler directly (no queue)
      log('Step 3: Running handler directly...');

      // Create mock job object
      const mockJob = {
        id: `test-${Date.now()}`,
        data: jobData,
        attemptsMade: 0,
        opts: { priority: 10 },
      } as unknown as Job<typeof jobData>;

      try {
        const result = await stage4AnalysisHandler.process(mockJob);

        if (result.success) {
          log('SUCCESS: Handler completed successfully!', {
            courseId: result.course_id,
            totalLessons: result.analysis_result?.recommended_structure.total_lessons,
            totalSections: result.analysis_result?.recommended_structure.total_sections,
            durationMs: result.metadata.total_duration_ms,
          });
          return true;
        } else {
          log('FAILURE: Handler returned failure', { error: result.error });
          return false;
        }
      } catch (error) {
        // Check if it's the naming error we're trying to fix
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('invalid input syntax for type uuid')) {
          log('CRITICAL: Naming convention error still present!', { error: errorMessage });
          return false;
        }
        // Other errors might be expected (e.g., missing documents, LLM errors)
        log('Handler threw error (may be expected)', { error: errorMessage });

        // Check course status - if it changed from 'pending', handler partially worked
        const supabase = getSupabaseAdmin();
        const { data: course } = await supabase
          .from('courses')
          .select('generation_status')
          .eq('id', courseId)
          .single();

        if (course?.generation_status !== 'pending') {
          log('PARTIAL SUCCESS: Handler updated course status', {
            newStatus: course?.generation_status,
          });
          return true; // The naming fix worked, other errors are different issues
        }

        throw error;
      }
    } else {
      // Step 3b: Submit to queue
      log('Step 3: Submitting job to queue...');
      const job = await addJob(JobType.STRUCTURE_ANALYSIS, jobData, { priority: 10 });
      log('Job submitted', { jobId: job.id });

      // Step 4: Wait for job completion
      log('Step 4: Waiting for job completion...');
      const supabase = getSupabaseAdmin();
      const startTime = Date.now();

      while (Date.now() - startTime < MAX_WAIT_MS) {
        const { data: course } = await supabase
          .from('courses')
          .select('generation_status, analysis_result')
          .eq('id', courseId)
          .single();

        const status = course?.generation_status;
        log(`Current status: ${status}`);

        if (status === 'stage_4_complete') {
          log('SUCCESS: Stage 4 completed!', {
            hasAnalysisResult: !!course?.analysis_result,
          });
          return true;
        }

        if (status === 'failed' || status === 'error') {
          log('FAILURE: Course generation failed');
          return false;
        }

        await sleep(2000);
      }

      log('TIMEOUT: Job did not complete in time');
      return false;
    }
  } catch (error) {
    log('ERROR:', { error: error instanceof Error ? error.message : String(error) });
    return false;
  } finally {
    // Cleanup
    if (courseId) {
      log('Cleaning up...');
      await cleanupTestCourse(courseId).catch(err => {
        log('Cleanup failed (non-fatal)', { error: err.message });
      });
    }
  }
}

// ============================================================================
// Entry Point
// ============================================================================

async function main() {
  console.log('\n');
  const success = await testStage4NamingFix();
  console.log('\n');

  if (success) {
    console.log('✅ TEST PASSED: Stage 4 naming convention fix works correctly');
    process.exit(0);
  } else {
    console.log('❌ TEST FAILED: Stage 4 naming convention fix has issues');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
