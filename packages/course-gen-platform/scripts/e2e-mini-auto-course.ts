#!/usr/bin/env tsx
/**
 * E2E Test: Mini Auto Course Generation
 * Tests automatic generation mode with mini course size (8-16 lessons)
 */

import { config } from 'dotenv';
import { getSupabaseAdmin } from '../src/shared/supabase/admin';
import { addJob } from '../src/orchestrator/queue';
import { JobType } from '@megacampus/shared-types';
import type { Database } from '@megacampus/shared-types';

config();

const TEST_CONFIG = {
  TOPIC: 'Основы цифрового маркетинга',
  COURSE_SIZE: 'mini' as const,
  GENERATION_MODE: 'automatic' as const,
  LANGUAGE: 'ru',
  STYLE: 'academic',
  LESSON_DURATION: 15,
  MAX_WAIT_TIME: 1_200_000, // 20 minutes (mini takes longer)
  POLL_INTERVAL: 5_000,
};

const TEST_ORG_ID = process.env.TEST_ORG_ID || '9b98a7d5-27ea-4441-81dc-de79d488e5db';
const TEST_USER_ID = process.env.TEST_USER_ID || 'ca704da8-5522-4a39-9691-23f36b85d0ce';

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('═'.repeat(50));
  console.log('  E2E Test: MINI Auto Course Generation');
  console.log('═'.repeat(50));
  console.log(`  Тема: ${TEST_CONFIG.TOPIC}`);
  console.log('  Формат: mini (8-16 уроков, 2-4 секции)');
  console.log('  Режим: automatic');
  console.log('═'.repeat(50));
  console.log('');

  const supabase = getSupabaseAdmin();
  const slug = `mini-auto-${Date.now()}`;

  // Create course
  console.log('[00:00] Создание курса...');
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
      target_audience: 'beginner',
      difficulty: 'beginner',
      generation_status: 'pending' as Database['public']['Enums']['generation_status'],
      course_description: 'Практический курс по основам цифрового маркетинга для начинающих',
      settings: {
        topic: TEST_CONFIG.TOPIC,
        lesson_duration_minutes: TEST_CONFIG.LESSON_DURATION,
      },
    })
    .select('id, slug, generation_mode, course_size, generation_status')
    .single();

  if (error) throw new Error(`Failed to create course: ${error.message}`);

  console.log(`[00:01] ✓ Курс создан: ${course.id}`);
  console.log(`        generation_mode = ${course.generation_mode}`);
  console.log(`        course_size = ${course.course_size}`);

  // Start pipeline
  console.log('\n[00:02] Запуск Stage 4 (Analysis)...');
  await addJob(
    JobType.STRUCTURE_ANALYSIS,
    {
      jobType: JobType.STRUCTURE_ANALYSIS,
      organizationId: TEST_ORG_ID,
      courseId: course.id,
      userId: TEST_USER_ID,
      createdAt: new Date().toISOString(),
      title: TEST_CONFIG.TOPIC,
      settings: {
        topic: TEST_CONFIG.TOPIC,
        language: TEST_CONFIG.LANGUAGE,
        style: TEST_CONFIG.STYLE,
        target_audience: 'beginner',
        difficulty: 'beginner',
        lesson_duration_minutes: TEST_CONFIG.LESSON_DURATION,
        course_size: TEST_CONFIG.COURSE_SIZE,
        generation_mode: TEST_CONFIG.GENERATION_MODE,
      },
    } as any,
    { priority: 10 }
  );
  console.log('[00:03] ✓ Stage 4 job queued');

  // Monitor progress
  console.log('\n--- Мониторинг прогресса ---');
  const startTime = Date.now();
  let lastStatus = '';
  let lastLessonProgress = '';

  while (Date.now() - startTime < TEST_CONFIG.MAX_WAIT_TIME) {
    const { data: c, error: e } = await supabase
      .from('courses')
      .select('generation_status, course_structure')
      .eq('id', course.id)
      .single();

    if (e) {
      console.log(`[ERROR] ${e.message}`);
      await delay(TEST_CONFIG.POLL_INTERVAL);
      continue;
    }

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const status = c.generation_status;

    if (status !== lastStatus) {
      console.log(`[${formatTime(elapsed)}] Status: ${status}`);
      lastStatus = status;
    }

    // Show lesson generation progress for Stage 6
    if (status === 'stage_6_generating') {
      const { data: lessons } = await supabase
        .from('course_lessons')
        .select('id, generation_status')
        .eq('course_id', course.id);

      if (lessons) {
        const completed = lessons.filter(l => l.generation_status === 'completed').length;
        const total = lessons.length;
        const progressStr = `${completed}/${total}`;
        if (progressStr !== lastLessonProgress) {
          console.log(`[${formatTime(elapsed)}]   Уроки: ${progressStr}`);
          lastLessonProgress = progressStr;
        }
      }
    }

    if (status === 'stage_6_complete' || status === 'completed') {
      console.log('\n✅ MINI Test PASSED!');
      const structure = c.course_structure as { sections: { lessons: unknown[] }[] } | null;
      const sectionCount = structure?.sections?.length || 0;
      const lessonCount = structure?.sections?.reduce((sum, s) => sum + s.lessons.length, 0) || 0;
      console.log(`   Секций: ${sectionCount} (ожидалось 2-4 для mini)`);
      console.log(`   Уроков: ${lessonCount} (ожидалось 8-16 для mini)`);

      // Validate constraints
      if (lessonCount < 8 || lessonCount > 16) {
        console.log(`\n⚠️  WARNING: Lesson count ${lessonCount} is outside mini range [8-16]`);
      }
      if (sectionCount < 2 || sectionCount > 4) {
        console.log(`\n⚠️  WARNING: Section count ${sectionCount} is outside mini range [2-4]`);
      }

      process.exit(0);
    }

    if (status === 'failed') {
      console.log('\n❌ MINI Test FAILED');
      process.exit(1);
    }

    await delay(TEST_CONFIG.POLL_INTERVAL);
  }

  console.log(`\n❌ Test failed: Timeout after ${TEST_CONFIG.MAX_WAIT_TIME}ms`);
  process.exit(1);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
