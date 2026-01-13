/**
 * Trigger Stage 5 Structure Generation directly via BullMQ
 * Usage: npx tsx scripts/trigger-stage5.ts <course_uuid>
 *
 * This script bypasses tRPC authentication and directly adds a STRUCTURE_GENERATION
 * job to the BullMQ queue. Use for E2E testing on dev environment.
 */

import 'dotenv/config';
import { getSupabaseAdmin } from '../src/shared/supabase/admin';
import { addJob, closeQueue } from '../src/orchestrator/queue';
import { JobType } from '@megacampus/shared-types';
import type { JobData, Database } from '@megacampus/shared-types';

interface CourseSettings {
  target_audience?: string;
  desired_lessons_count?: number;
  desired_modules_count?: number;
  lesson_duration_minutes?: number;
  learning_outcomes?: string;
}

async function main() {
  const courseId = process.argv[2];

  if (!courseId) {
    console.error('Usage: npx tsx scripts/trigger-stage5.ts <course_uuid>');
    process.exit(1);
  }

  console.log(`Triggering Stage 5 generation for course: ${courseId}`);

  const supabase = getSupabaseAdmin();

  // Fetch course with all required data
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('*')
    .eq('id', courseId)
    .single();

  if (courseError || !course) {
    console.error('Failed to fetch course:', courseError?.message);
    process.exit(1);
  }

  console.log(`Course: ${course.title}`);
  console.log(`Status: ${course.generation_status}`);
  console.log(`Language: ${course.language}`);

  // Check analysis_result
  if (!course.analysis_result) {
    console.error('Course has no analysis_result. Stage 4 must complete first.');
    process.exit(1);
  }

  console.log('Analysis result found');

  // Check for vectorized documents
  const { data: vectorizedFiles, error: filesError } = await supabase
    .from('file_catalog')
    .select('id, filename, processed_content, mime_type')
    .eq('course_id', courseId)
    .eq('vector_status', 'indexed' as unknown as Database['public']['Enums']['vector_status']);

  if (filesError) {
    console.log('Warning: Failed to check vectorized files:', filesError.message);
  }

  const hasVectorizedDocs = !filesError && vectorizedFiles && vectorizedFiles.length > 0;
  console.log(`Vectorized docs: ${hasVectorizedDocs ? vectorizedFiles.length : 0}`);

  // Build document summaries
  const documentSummaries = hasVectorizedDocs
    ? vectorizedFiles.map(file => ({
        file_id: file.id,
        file_name: file.filename,
        summary: file.processed_content || '',
        key_topics: [],
      }))
    : [];

  // Build job input (matches lifecycle.router.ts generate endpoint)
  const settings = course.settings as unknown as CourseSettings | null;

  const jobInput = {
    course_id: courseId,
    organization_id: course.organization_id,
    user_id: course.user_id,
    analysis_result: course.analysis_result,
    frontend_parameters: {
      course_title: course.title,
      language: course.language,
      style: course.style,
      target_audience: settings?.target_audience,
      desired_lessons_count: settings?.desired_lessons_count,
      desired_modules_count: settings?.desired_modules_count,
      lesson_duration_minutes: settings?.lesson_duration_minutes,
      learning_outcomes: settings?.learning_outcomes,
    },
    vectorized_documents: hasVectorizedDocs,
    document_summaries: documentSummaries,
  };

  console.log('\nEnqueuing Stage 5 job...');
  console.log(`  Course: ${course.title}`);
  console.log(`  Has documents: ${hasVectorizedDocs}`);

  // Add job to queue
  const job = await addJob(JobType.STRUCTURE_GENERATION, jobInput as unknown as JobData, {
    priority: 5,
  });

  console.log(`\nJob enqueued: ${job.id}`);

  // Update course status
  const { error: updateError } = await supabase
    .from('courses')
    .update({
      generation_status:
        'stage_5_generating' as unknown as Database['public']['Enums']['generation_status'],
      updated_at: new Date().toISOString(),
    })
    .eq('id', courseId);

  if (updateError) {
    console.log('Warning: Failed to update course status:', updateError.message);
  } else {
    console.log('Course status updated to: stage_5_generating');
  }

  await closeQueue();
  console.log('\nDone! Monitor worker logs to see generation progress.');
  console.log('Course will transition to stage_5_complete when done.');
}

main().catch(console.error);
