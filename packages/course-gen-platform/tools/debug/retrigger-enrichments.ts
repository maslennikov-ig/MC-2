#!/usr/bin/env npx tsx
/**
 * Retrigger Enrichments Script
 *
 * Manually triggers missing enrichments (course card, lesson cards, covers)
 * for a specific course.
 *
 * Usage:
 *   npx tsx tools/debug/retrigger-enrichments.ts <courseId|generationCode>
 *
 * Example:
 *   npx tsx tools/debug/retrigger-enrichments.ts JGS-4692
 *   npx tsx tools/debug/retrigger-enrichments.ts 3c57c126-14f5-4224-8f34-a97251c716cf
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: resolve(__dirname, '../../.env') });

import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import {
  triggerCourseCard,
  triggerAllLessonCards,
  triggerAllLessonCovers,
} from '../../src/stages/stage7-enrichments/services/auto-card-trigger';

async function main() {
  const courseIdentifier = process.argv[2];

  if (!courseIdentifier) {
    console.error('Usage: npx tsx tools/debug/retrigger-enrichments.ts <courseId|generationCode>');
    process.exit(1);
  }

  console.log(`\n🔍 Looking up course: ${courseIdentifier}\n`);

  const supabase = getSupabaseAdmin();

  // Try to find course by generation_code or id
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    courseIdentifier
  );

  const { data: course, error } = await supabase
    .from('courses')
    .select('id, generation_code, title, user_id, organization_id')
    .eq(isUuid ? 'id' : 'generation_code', courseIdentifier)
    .single();

  if (error || !course) {
    console.error(`❌ Course not found: ${courseIdentifier}`);
    console.error(error?.message);
    process.exit(1);
  }

  console.log(`✅ Found course: ${course.title}`);
  console.log(`   ID: ${course.id}`);
  console.log(`   Code: ${course.generation_code}`);
  console.log(`   User: ${course.user_id}`);
  console.log(`   Org: ${course.organization_id}\n`);

  // Check current enrichments status
  const { data: enrichments } = await supabase
    .from('lesson_enrichments')
    .select('enrichment_type, status, title')
    .eq('course_id', course.id);

  const courseCard = enrichments?.find(e => e.title === 'course-card');
  const lessonCards = enrichments?.filter(
    e => e.enrichment_type === 'card' && e.title !== 'course-card'
  );
  const covers = enrichments?.filter(e => e.enrichment_type === 'cover');

  console.log('📊 Current enrichments:');
  console.log(`   Course card: ${courseCard ? courseCard.status : 'MISSING'}`);
  console.log(`   Lesson cards: ${lessonCards?.length ?? 0}`);
  console.log(`   Covers: ${covers?.length ?? 0}\n`);

  // Get total lessons count via two-step query (sections -> lessons)
  const { data: sections } = await supabase
    .from('sections')
    .select('id')
    .eq('course_id', course.id);

  const sectionIds = sections?.map(s => s.id) ?? [];
  const { data: lessons } =
    sectionIds.length > 0
      ? await supabase.from('lessons').select('id').in('section_id', sectionIds)
      : { data: [] };

  const totalLessons = lessons?.length ?? 0;
  console.log(`   Total lessons: ${totalLessons}\n`);

  // Trigger missing enrichments
  console.log('🚀 Triggering missing enrichments...\n');

  // 1. Course card
  if (!courseCard) {
    console.log('   → Triggering course card...');
    const cardId = await triggerCourseCard({
      courseId: course.id,
      userId: course.user_id,
      organizationId: course.organization_id,
    });
    console.log(`   ✅ Course card triggered: ${cardId ?? 'skipped'}`);
  } else {
    console.log(`   ⏭️  Course card exists (${courseCard.status})`);
  }

  // 2. Lesson cards
  const missingCards = totalLessons - (lessonCards?.length ?? 0);
  if (missingCards > 0) {
    console.log(`\n   → Triggering ${missingCards} missing lesson cards...`);
    const cardResult = await triggerAllLessonCards({
      courseId: course.id,
      userId: course.user_id,
      organizationId: course.organization_id,
    });
    console.log(
      `   ✅ Lesson cards: ${cardResult.succeeded.length} triggered, ${cardResult.skipped.length} skipped, ${cardResult.failed.length} failed`
    );
  } else {
    console.log(`\n   ⏭️  All lesson cards exist (${lessonCards?.length})`);
  }

  // 3. Covers
  const missingCovers = totalLessons - (covers?.length ?? 0);
  if (missingCovers > 0) {
    console.log(`\n   → Triggering ${missingCovers} missing covers...`);
    const coverResult = await triggerAllLessonCovers({
      courseId: course.id,
      userId: course.user_id,
      organizationId: course.organization_id,
    });
    console.log(
      `   ✅ Covers: ${coverResult.succeeded.length} triggered, ${coverResult.skipped.length} skipped, ${coverResult.failed.length} failed`
    );
  } else {
    console.log(`\n   ⏭️  All covers exist (${covers?.length})`);
  }

  console.log('\n✨ Done! Check Stage 7 queue for processing status.\n');

  // Graceful shutdown
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
