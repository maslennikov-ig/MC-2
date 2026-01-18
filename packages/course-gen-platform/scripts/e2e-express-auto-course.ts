#!/usr/bin/env tsx
/**
 * E2E Test: Express Auto Course Generation
 *
 * Tests the automatic generation mode with mini course size.
 * Verifies that Stage 4 → 5 → 6 auto-transitions work correctly.
 *
 * Usage:
 *   pnpm tsx scripts/e2e-express-auto-course.ts                 # Keep test course after run
 *   pnpm tsx scripts/e2e-express-auto-course.ts --cleanup       # Delete course after run
 *   pnpm tsx scripts/e2e-express-auto-course.ts --cleanup-on-error  # Delete only if failed
 *
 * Prerequisites:
 * - ./start-dev.sh running in another terminal (BullMQ workers must be active)
 * - Valid Supabase and Redis connections
 * - TEST_ORG_ID and TEST_USER_ID env vars (or defaults to seed data UUIDs)
 *
 * Test Parameters:
 * - Topic: "Продажи для школ репетиторства"
 * - course_size: mini (8-16 lessons expected)
 * - generation_mode: automatic (should NOT stop at awaiting_approval)
 * - Language: ru
 * - Style: practical
 *
 * Exit Codes:
 * - 0: Success (reached stage_6_complete or completed)
 * - 1: Failure (failed status or timeout)
 */

import { config } from 'dotenv';
import { getSupabaseAdmin } from '../src/shared/supabase/admin';
import { addJob } from '../src/orchestrator/queue';
import { JobType } from '@megacampus/shared-types';
import type { Database } from '@megacampus/shared-types';

// Load environment
config();

// ============================================================================
// Configuration
// ============================================================================

const TEST_CONFIG = {
  TOPIC: 'Продажи для школ репетиторства',
  COURSE_SIZE: 'mini' as const,
  GENERATION_MODE: 'automatic' as const,
  LANGUAGE: 'ru',
  STYLE: 'practical',
  LESSON_DURATION: 15,
  MAX_WAIT_TIME: 900_000, // 15 minutes
  POLL_INTERVAL: 5_000, // 5 seconds
};

// Test organization and user IDs (from seed data)
const TEST_ORG_ID = process.env.TEST_ORG_ID || '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = process.env.TEST_USER_ID || '00000000-0000-0000-0000-000000000001';

// ============================================================================
// Helpers
// ============================================================================

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Course Creation
// ============================================================================

interface CourseRecord {
  id: string;
  slug: string;
  generation_mode: string;
  course_size: string;
  generation_status: string;
}

async function createTestCourse(): Promise<CourseRecord> {
  const supabase = getSupabaseAdmin();
  const slug = `express-auto-${Date.now()}`;

  const { data: course, error } = await supabase
    .from('courses')
    .insert({
      organization_id: TEST_ORG_ID,
      user_id: TEST_USER_ID,
      title: TEST_CONFIG.TOPIC,
      slug,
      generation_mode:
        TEST_CONFIG.GENERATION_MODE as Database['public']['Enums']['generation_mode'],
      course_size: TEST_CONFIG.COURSE_SIZE as Database['public']['Enums']['course_size'],
      language: TEST_CONFIG.LANGUAGE,
      style: TEST_CONFIG.STYLE as Database['public']['Enums']['course_style'],
      target_audience: 'intermediate',
      difficulty: 'medium',
      generation_status: 'pending' as Database['public']['Enums']['generation_status'],
      course_description: 'Практический курс по продажам для репетиторских школ',
      settings: {
        topic: TEST_CONFIG.TOPIC,
        lesson_duration_minutes: TEST_CONFIG.LESSON_DURATION,
      },
    })
    .select('id, slug, generation_mode, course_size, generation_status')
    .single();

  if (error) {
    throw new Error(`Failed to create course: ${error.message}`);
  }

  return course as CourseRecord;
}

// ============================================================================
// Pipeline Initiation
// ============================================================================

async function initiatePipeline(courseId: string): Promise<void> {
  // For courses without documents, start with Stage 4 (analysis)
  await addJob(
    JobType.STRUCTURE_ANALYSIS,
    {
      jobType: JobType.STRUCTURE_ANALYSIS,
      organizationId: TEST_ORG_ID,
      courseId,
      userId: TEST_USER_ID,
      createdAt: new Date().toISOString(),
      title: TEST_CONFIG.TOPIC,
      settings: {
        topic: TEST_CONFIG.TOPIC,
        language: TEST_CONFIG.LANGUAGE,
        style: TEST_CONFIG.STYLE,
        target_audience: 'intermediate',
        difficulty: 'medium',
        lesson_duration_minutes: TEST_CONFIG.LESSON_DURATION,
        course_size: TEST_CONFIG.COURSE_SIZE,
        generation_mode: TEST_CONFIG.GENERATION_MODE,
      },
    } as any,
    { priority: 10 }
  );
}

// ============================================================================
// Progress Monitoring
// ============================================================================

interface MonitorResult {
  success: boolean;
  finalStatus: string;
  durationSeconds: number;
  lessonCount?: number;
  sectionCount?: number;
}

async function monitorProgress(courseId: string): Promise<MonitorResult> {
  const supabase = getSupabaseAdmin();
  const startTime = Date.now();
  let lastStatus = '';

  while (Date.now() - startTime < TEST_CONFIG.MAX_WAIT_TIME) {
    const { data: course, error } = await supabase
      .from('courses')
      .select('generation_status, generation_mode, course_structure')
      .eq('id', courseId)
      .single();

    if (error) {
      console.log(`[ERROR] Failed to fetch course: ${error.message}`);
      await delay(TEST_CONFIG.POLL_INTERVAL);
      continue;
    }

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const status = course.generation_status;

    if (status !== lastStatus) {
      console.log(`[${formatTime(elapsed)}] Status: ${status}`);
      lastStatus = status;
    }

    // Terminal states
    if (status === 'stage_6_complete' || status === 'completed') {
      console.log('✓ Generation complete!');

      const structure = course.course_structure as { sections: { lessons: unknown[] }[] } | null;
      const sectionCount = structure?.sections?.length || 0;
      const lessonCount = structure?.sections?.reduce((sum, s) => sum + s.lessons.length, 0) || 0;

      return {
        success: true,
        finalStatus: status,
        durationSeconds: elapsed,
        sectionCount,
        lessonCount,
      };
    }

    if (status === 'failed') {
      console.log('✗ Generation failed');
      return {
        success: false,
        finalStatus: status,
        durationSeconds: elapsed,
      };
    }

    // Warning: stuck on awaiting_approval in automatic mode
    if (status === 'stage_5_awaiting_approval' && course.generation_mode === 'automatic') {
      console.log('⚠️  WARNING: Stuck on stage_5_awaiting_approval in automatic mode!');
      console.log('    This indicates the auto-approval fix is not working correctly.');
    }

    await delay(TEST_CONFIG.POLL_INTERVAL);
  }

  throw new Error(`Timeout after ${TEST_CONFIG.MAX_WAIT_TIME}ms`);
}

// ============================================================================
// Validation
// ============================================================================

async function validateResults(courseId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: course } = await supabase
    .from('courses')
    .select('course_structure, generation_metadata, course_size')
    .eq('id', courseId)
    .single();

  if (!course?.course_structure) {
    console.log('⚠️  No course structure found');
    return;
  }

  const structure = course.course_structure as { sections: { lessons: unknown[] }[] };
  const sectionCount = structure.sections.length;
  const lessonCount = structure.sections.reduce((sum, s) => sum + s.lessons.length, 0);

  console.log('\n' + '═'.repeat(50));
  console.log('  РЕЗУЛЬТАТЫ');
  console.log('═'.repeat(50));
  console.log(`  Секций: ${sectionCount} (ожидалось ~3 для mini)`);
  console.log(`  Уроков: ${lessonCount} (ожидалось 8-16 для mini)`);

  // Validate mini format
  if (lessonCount < 8) {
    console.log('  ⚠️  Слишком мало уроков для mini формата');
  } else if (lessonCount > 16) {
    console.log('  ⚠️  Слишком много уроков для mini формата');
  } else {
    console.log('  ✓ Количество уроков в норме для mini');
  }

  // Check lessons generated
  const { data: lessons, count } = await supabase
    .from('lessons')
    .select('id, quality_score', { count: 'exact' })
    .eq('course_id', courseId)
    .not('content', 'is', null);

  if (count && count > 0) {
    const qualityScores = (lessons || [])
      .filter(l => l.quality_score !== null)
      .map(l => l.quality_score as number);

    if (qualityScores.length > 0) {
      const avgQuality = qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length;
      console.log(`  Качество: ${(avgQuality * 100).toFixed(1)}% (порог: 75%)`);
      if (avgQuality >= 0.75) {
        console.log('  ✓ Качество выше порога');
      } else {
        console.log('  ⚠️  Качество ниже порога');
      }
    }

    console.log(`  Уроков с контентом: ${count}/${lessonCount}`);
  }

  // Cost
  const metadata = course.generation_metadata as { cost_usd?: number } | null;
  if (metadata?.cost_usd) {
    console.log(`  Стоимость: $${metadata.cost_usd.toFixed(4)} USD`);
  }

  console.log('═'.repeat(50));
}

// ============================================================================
// Cleanup
// ============================================================================

async function cleanup(courseId: string): Promise<void> {
  console.log(`\nCleaning up test course: ${courseId}`);
  const supabase = getSupabaseAdmin();

  // Delete lessons first (foreign key)
  await supabase.from('lessons').delete().eq('course_id', courseId);

  // Delete course
  await supabase.from('courses').delete().eq('id', courseId);

  console.log('✓ Cleanup complete');
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('═'.repeat(50));
  console.log('  E2E Test: Express Auto Course Generation');
  console.log('═'.repeat(50));
  console.log(`  Тема: ${TEST_CONFIG.TOPIC}`);
  console.log(`  Формат: ${TEST_CONFIG.COURSE_SIZE} (8-16 уроков)`);
  console.log(`  Режим: ${TEST_CONFIG.GENERATION_MODE}`);
  console.log('═'.repeat(50));

  let courseId: string | undefined;

  try {
    // Step 1: Create course
    console.log('\n[00:00] Создание курса...');
    const course = await createTestCourse();
    courseId = course.id;
    console.log(`[00:01] ✓ Курс создан: ${course.id}`);
    console.log(`        generation_mode = ${course.generation_mode}`);
    console.log(`        course_size = ${course.course_size}`);

    // Step 2: Initiate pipeline (Stage 4)
    console.log('\n[00:02] Запуск Stage 4 (Analysis)...');
    await initiatePipeline(course.id);
    console.log('[00:03] ✓ Stage 4 job queued');

    // Step 3: Monitor progress
    console.log('\n--- Мониторинг прогресса ---');
    const result = await monitorProgress(course.id);

    // Step 4: Validate results
    if (result.success) {
      await validateResults(course.id);
    }

    // Summary
    console.log('\n' + '═'.repeat(50));
    console.log('  ИТОГИ');
    console.log('═'.repeat(50));
    console.log(`  Длительность: ${formatTime(result.durationSeconds)}`);
    console.log(`  Финальный статус: ${result.finalStatus}`);
    console.log(`  Успех: ${result.success ? '✓ Да' : '✗ Нет'}`);
    if (result.sectionCount !== undefined) {
      console.log(`  Секций: ${result.sectionCount}`);
    }
    if (result.lessonCount !== undefined) {
      console.log(`  Уроков: ${result.lessonCount}`);
    }
    console.log('═'.repeat(50));

    // Cleanup option
    const shouldCleanup = process.argv.includes('--cleanup');
    if (shouldCleanup && courseId) {
      await cleanup(courseId);
    } else {
      console.log(`\nТестовый курс сохранён: ${courseId}`);
      console.log('Для удаления запустите с флагом --cleanup');
    }

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Test failed:', error instanceof Error ? error.message : String(error));

    // Cleanup on error
    if (courseId && process.argv.includes('--cleanup-on-error')) {
      await cleanup(courseId);
    }

    process.exit(1);
  }
}

main().catch(console.error);
