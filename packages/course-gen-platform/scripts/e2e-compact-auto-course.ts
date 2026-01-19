#!/usr/bin/env tsx
/**
 * E2E Test: Compact Auto Course with Documents
 * Tests automatic generation mode with compact course size (16-32 lessons)
 * Uses real documents from docs/test/synergy/
 *
 * Documents are stored locally in uploads/ directory, NOT in Supabase Storage.
 */

import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getSupabaseAdmin } from '../src/shared/supabase/admin';
import { addJob } from '../src/orchestrator/queue';
import { JobType } from '@megacampus/shared-types';
import type { Database } from '@megacampus/shared-types';

config();

const TEST_CONFIG = {
  TOPIC: 'Продажи и работа с CRM для образовательных компаний',
  COURSE_SIZE: 'compact' as const,
  GENERATION_MODE: 'automatic' as const,
  LANGUAGE: 'ru',
  STYLE: 'business',
  LESSON_DURATION: 20,
  MAX_WAIT_TIME: 1800_000, // 30 minutes (compact with docs takes longer)
  POLL_INTERVAL: 10_000,
  DOCS_PATH: '/home/me/code/mc2/docs/test/synergy',
  UPLOADS_BASE: '/home/me/code/mc2/packages/course-gen-platform/uploads',
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

async function uploadDocuments(courseId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const docsDir = TEST_CONFIG.DOCS_PATH;
  const files = fs.readdirSync(docsDir).filter(f => f.endsWith('.pdf') || f.endsWith('.docx'));

  console.log(`   Найдено ${files.length} документов для загрузки`);

  // Create local storage directory
  const uploadDir = path.join(TEST_CONFIG.UPLOADS_BASE, TEST_ORG_ID, courseId);
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`   Создана директория: ${uploadDir}`);

  let uploaded = 0;

  for (const file of files) {
    const srcPath = path.join(docsDir, file);
    const dstPath = path.join(uploadDir, file);
    const fileExt = path.extname(file).toLowerCase();
    const mimeType =
      fileExt === '.pdf'
        ? 'application/pdf'
        : fileExt === '.docx'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/octet-stream';

    // Copy file to uploads directory
    const content = fs.readFileSync(srcPath);
    fs.writeFileSync(dstPath, content);
    const stats = fs.statSync(dstPath);

    // Calculate file hash
    const fileHash = crypto.createHash('md5').update(content).digest('hex');

    // Relative storage path (from uploads base)
    const storagePath = `${TEST_ORG_ID}/${courseId}/${file}`;

    // Create file catalog entry (only columns that exist in the table)
    const fileType = fileExt === '.pdf' ? 'pdf' : fileExt === '.docx' ? 'docx' : 'other';
    const { error: catalogError } = await supabase.from('file_catalog').insert({
      course_id: courseId,
      organization_id: TEST_ORG_ID,
      filename: file,
      original_name: file,
      file_type: fileType,
      mime_type: mimeType,
      file_size: stats.size,
      storage_path: storagePath,
      hash: fileHash,
      vector_status: 'pending' as Database['public']['Enums']['vector_status'],
    });

    if (catalogError) {
      console.log(`   ⚠️  Не удалось создать запись для ${file}: ${catalogError.message}`);
    } else {
      console.log(`   ✓ Загружен: ${file} (${(stats.size / 1024).toFixed(1)} KB)`);
      uploaded++;
    }
  }

  return uploaded;
}

async function main() {
  console.log('═'.repeat(50));
  console.log('  E2E Test: COMPACT Auto Course with Documents');
  console.log('═'.repeat(50));
  console.log(`  Тема: ${TEST_CONFIG.TOPIC}`);
  console.log('  Формат: compact (16-32 урока)');
  console.log('  Режим: automatic');
  console.log(`  Документы: ${TEST_CONFIG.DOCS_PATH}`);
  console.log('═'.repeat(50));
  console.log('');

  const supabase = getSupabaseAdmin();
  const slug = `compact-auto-${Date.now()}`;

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
      target_audience: 'intermediate',
      difficulty: 'intermediate',
      generation_status: 'pending' as Database['public']['Enums']['generation_status'],
      course_description: 'Курс по продажам и работе с CRM на основе реальных документов компании',
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

  // Upload documents to local storage
  console.log('\n[00:02] Загрузка документов в локальное хранилище...');
  const docsCount = await uploadDocuments(course.id);
  console.log(`[00:03] ✓ Загружено ${docsCount} документов`);

  // Update course status to stage_2_init
  await supabase
    .from('courses')
    .update({
      generation_status: 'stage_2_init' as Database['public']['Enums']['generation_status'],
    })
    .eq('id', course.id);

  // Get uploaded files from file_catalog
  const { data: files, error: filesError } = await supabase
    .from('file_catalog')
    .select('id, storage_path, mime_type')
    .eq('course_id', course.id)
    .eq('vector_status', 'pending');

  if (filesError || !files || files.length === 0) {
    throw new Error(`No files found for processing: ${filesError?.message || 'empty'}`);
  }

  // Start pipeline from Stage 2 (document processing) - one job per file
  console.log(`\n[00:04] Запуск Stage 2 (Document Processing) для ${files.length} файлов...`);

  const baseJobData = {
    organizationId: TEST_ORG_ID,
    courseId: course.id,
    userId: TEST_USER_ID,
    createdAt: new Date().toISOString(),
    locale: 'ru' as const,
  };

  for (const file of files) {
    const absoluteFilePath = `${TEST_CONFIG.UPLOADS_BASE}/${file.storage_path}`;
    await addJob(
      JobType.DOCUMENT_PROCESSING,
      {
        ...baseJobData,
        jobType: JobType.DOCUMENT_PROCESSING,
        fileId: file.id,
        filePath: absoluteFilePath,
        mimeType: file.mime_type,
      } as any,
      { priority: 10 }
    );
    console.log(`   ✓ Job queued for file: ${file.id}`);
  }
  console.log(`[00:05] ✓ Stage 2 jobs queued (${files.length} files)`);

  // Monitor progress
  console.log('\n--- Мониторинг прогресса ---');
  const startTime = Date.now();
  let lastStatus = '';

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

    if (status === 'stage_6_complete' || status === 'completed') {
      console.log('\n✅ COMPACT Test PASSED!');
      const structure = c.course_structure as { sections: { lessons: unknown[] }[] } | null;
      const lessonCount = structure?.sections?.reduce((sum, s) => sum + s.lessons.length, 0) || 0;
      console.log(`   Уроков: ${lessonCount} (ожидалось 16-32 для compact)`);
      process.exit(0);
    }

    if (status === 'failed') {
      console.log('\n❌ COMPACT Test FAILED');
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
