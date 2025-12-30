#!/usr/bin/env npx tsx
import 'dotenv/config';

/**
 * E2E Test: Verify primary_documents from DRM are used in buildMinimalLessonSpec
 *
 * This script tests that the bug fix for primary_documents is working:
 * - Fetches a real course with analysis_result from DB
 * - Calls buildMinimalLessonSpec with the analysis_result
 * - Verifies that primary_documents contains real UUIDs (not placeholder)
 *
 * Usage: npx tsx scripts/test-drm-primary-documents.ts
 */

import { getSupabaseAdmin } from '../src/shared/supabase/admin';
import { buildMinimalLessonSpec } from '../src/server/routers/lesson-content/helpers';
import { parseAnalysisResult } from '@megacampus/shared-types';

const TEST_COURSE_ID = '97f639f7-eae7-4846-b5f5-203211610b8a';

async function main() {
  console.log('🧪 Testing DRM primary_documents flow\n');

  // Step 1: Fetch course with analysis_result
  const supabase = getSupabaseAdmin();
  const { data: course, error } = await supabase
    .from('courses')
    .select('id, title, course_structure, analysis_result')
    .eq('id', TEST_COURSE_ID)
    .single();

  if (error || !course) {
    console.error('❌ Failed to fetch course:', error);
    process.exit(1);
  }

  console.log(`✅ Course found: "${course.title}"`);

  // Step 2: Parse analysis_result
  const analysisResult = parseAnalysisResult(course.analysis_result);
  if (!analysisResult) {
    console.error('❌ Failed to parse analysis_result');
    process.exit(1);
  }

  const drm = analysisResult.document_relevance_mapping;
  console.log(`✅ DRM sections found: ${drm ? Object.keys(drm).join(', ') : 'none'}`);

  if (drm?.['1']) {
    console.log(`   Section 1 primary_documents: ${JSON.stringify(drm['1'].primary_documents)}`);
    console.log(`   Section 1 search_queries: ${JSON.stringify(drm['1'].search_queries?.slice(0, 2))}...`);
  }

  // Step 3: Get lesson from course_structure
  const structure = course.course_structure as {
    sections: Array<{
      section_number: number;
      lessons: Array<{
        lesson_number: number;
        lesson_title: string;
        lesson_objectives?: string[];
        key_topics?: string[];
      }>;
    }>;
  };

  if (!structure?.sections?.[0]?.lessons?.[0]) {
    console.error('❌ No lessons found in course_structure');
    process.exit(1);
  }

  const lesson = structure.sections[0].lessons[0];
  console.log(`\n📖 Testing with lesson: "${lesson.lesson_title}"`);

  // Step 4: Call buildMinimalLessonSpec
  const spec = buildMinimalLessonSpec(
    '1.1',
    lesson,
    1, // sectionNumber
    'test-request-id',
    analysisResult
  );

  // Step 5: Verify primary_documents
  console.log('\n📋 Generated LessonSpecificationV2:');
  console.log(`   lesson_id: ${spec.lesson_id}`);
  console.log(`   title: ${spec.title}`);
  console.log(`   rag_context.primary_documents: ${JSON.stringify(spec.rag_context.primary_documents)}`);
  console.log(`   rag_context.search_queries: ${JSON.stringify(spec.rag_context.search_queries?.slice(0, 2))}...`);
  console.log(`   rag_context.expected_chunks: ${spec.rag_context.expected_chunks}`);

  // Step 6: Assertions
  const hasPlaceholder = spec.rag_context.primary_documents.some(
    (doc) => doc.includes('default') || doc === 'default-course-document'
  );

  const hasRealUUIDs = spec.rag_context.primary_documents.length > 0 &&
    spec.rag_context.primary_documents.every(
      (doc) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(doc)
    );

  console.log('\n🔍 Verification:');

  if (hasPlaceholder) {
    console.error('❌ FAIL: primary_documents contains placeholder "default-course-document"');
    process.exit(1);
  }
  console.log('   ✅ No placeholder documents found');

  if (!hasRealUUIDs && spec.rag_context.primary_documents.length > 0) {
    console.error('❌ FAIL: primary_documents contains invalid UUIDs');
    process.exit(1);
  }
  console.log('   ✅ All primary_documents are valid UUIDs');

  // Check that DRM values are actually used
  const expectedDocs = drm?.['1']?.primary_documents || [];
  const actualDocs = spec.rag_context.primary_documents;

  if (JSON.stringify(expectedDocs) !== JSON.stringify(actualDocs)) {
    console.error(`❌ FAIL: primary_documents mismatch`);
    console.error(`   Expected: ${JSON.stringify(expectedDocs)}`);
    console.error(`   Actual: ${JSON.stringify(actualDocs)}`);
    process.exit(1);
  }
  console.log('   ✅ primary_documents match DRM values');

  const expectedQueries = drm?.['1']?.search_queries || [];
  const actualQueries = spec.rag_context.search_queries;

  if (expectedQueries.length > 0 && JSON.stringify(expectedQueries) !== JSON.stringify(actualQueries)) {
    console.error(`❌ FAIL: search_queries mismatch`);
    console.error(`   Expected: ${JSON.stringify(expectedQueries)}`);
    console.error(`   Actual: ${JSON.stringify(actualQueries)}`);
    process.exit(1);
  }
  console.log('   ✅ search_queries match DRM values');

  console.log('\n🎉 All tests passed! DRM primary_documents flow is working correctly.\n');
}

main().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
