/**
 * Auto-Approval Service for Automatic Generation Mode
 *
 * Handles automatic stage transitions when generation_mode = 'automatic'.
 * Instead of waiting for user approval, automatically proceeds to next stage.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../supabase/admin';
import { addJob } from '../../orchestrator/queue';
import { JobType, JobData } from '@megacampus/shared-types';
import { logger } from '../logger/index.js';
import type { Database } from '@megacampus/shared-types';
import type { CourseSettings } from '../../server/routers/generation/_shared/types';

type GenerationStatus = Database['public']['Enums']['generation_status'];

// Minimal course interface for auto-approval
interface CourseForAutoApproval {
  user_id: string | null;
  organization_id: string;
  title: string | null;
  settings: unknown;
  language: string | null;
  style: string | null;
  target_audience: string | null;
  difficulty: string | null;
  course_description: string | null;
  course_size: string | null;
  analysis_result: unknown;
  organization: { tier: string | null } | { tier: string | null }[] | null;
}

/**
 * Handle stage completion with automatic mode support
 *
 * If generation_mode = 'automatic':
 *   - Auto-approve and transition to next stage
 *   - Queue next stage job
 *
 * If generation_mode = 'semi_automatic':
 *   - Set status to awaiting_approval (current behavior)
 */
export async function handleStageCompletion(
  courseId: string,
  currentStage: number,
  supabase?: SupabaseClient
): Promise<{ autoApproved: boolean; nextStage?: number }> {
  const db = supabase || getSupabaseAdmin();

  // Fetch course with generation mode
  const { data: course, error } = await db
    .from('courses')
    .select(
      'generation_mode, user_id, organization_id, title, settings, language, style, target_audience, difficulty, course_description, course_size, analysis_result, organization:organizations(tier)'
    )
    .eq('id', courseId)
    .single();

  if (error || !course) {
    logger.error({ courseId, error }, 'Failed to fetch course for auto-approval');
    throw new Error(`Course not found: ${courseId}`);
  }

  // Check if automatic mode
  const isAutomatic = course.generation_mode === 'automatic';

  if (!isAutomatic) {
    // Semi-automatic: set to awaiting_approval
    const awaitingStatus = `stage_${currentStage}_awaiting_approval` as GenerationStatus;
    await db
      .from('courses')
      .update({
        generation_status: awaitingStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', courseId);

    logger.info(
      { courseId, currentStage, status: awaitingStatus },
      'Stage awaiting approval (semi-automatic)'
    );
    return { autoApproved: false };
  }

  // Automatic mode: proceed to next stage
  logger.info({ courseId, currentStage }, 'Auto-approving stage (automatic mode)');

  const nextStage = currentStage + 1;
  const nextStatus = `stage_${nextStage}_init` as GenerationStatus;

  // Update status to next stage
  await db
    .from('courses')
    .update({
      generation_status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', courseId);

  // Queue next stage job based on stage number
  try {
    await queueNextStageJob(courseId, nextStage, course);
  } catch (queueError) {
    // Rollback status on job queueing failure
    const rollbackStatus = `stage_${currentStage}_complete` as GenerationStatus;
    logger.error(
      {
        courseId,
        nextStage,
        error: queueError instanceof Error ? queueError.message : String(queueError),
      },
      'Failed to queue next stage job, rolling back status'
    );

    await db
      .from('courses')
      .update({
        generation_status: rollbackStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', courseId);

    throw new Error(
      `Failed to queue stage ${nextStage}: ${queueError instanceof Error ? queueError.message : String(queueError)}`
    );
  }

  logger.info({ courseId, currentStage, nextStage }, 'Stage auto-approved, next stage queued');
  return { autoApproved: true, nextStage };
}

/**
 * Queue the appropriate job for the next stage
 */
async function queueNextStageJob(
  courseId: string,
  nextStage: number,
  course: CourseForAutoApproval
): Promise<void> {
  const userId = course.user_id || 'system';
  const organizationId = course.organization_id;

  // Handle organization type (could be array or single object from Supabase select)
  const orgData = Array.isArray(course.organization) ? course.organization[0] : course.organization;
  const tier = orgData?.tier || 'free';
  const priority = tier === 'premium' ? 10 : tier === 'standard' ? 5 : 1;

  const baseJobData = {
    organizationId,
    courseId,
    userId,
    createdAt: new Date().toISOString(),
  };

  switch (nextStage) {
    case 3: {
      // Stage 3: Document Classification
      const classificationJobData = {
        ...baseJobData,
        jobType: JobType.DOCUMENT_CLASSIFICATION,
      };

      await addJob(JobType.DOCUMENT_CLASSIFICATION, classificationJobData as unknown as JobData, {
        priority,
      });
      logger.info({ courseId, nextStage: 3 }, 'Queued DOCUMENT_CLASSIFICATION job');
      break;
    }

    case 4: {
      // Stage 4: Structure Analysis
      const supabase = getSupabaseAdmin();
      const { data: documents } = await supabase
        .from('file_catalog')
        .select('id, filename, processed_content, processing_method, summary_metadata')
        .eq('course_id', courseId)
        .not('processed_content', 'is', null);

      const document_summaries = (documents || []).map(doc => ({
        document_id: doc.id,
        file_name: doc.filename,
        processed_content: doc.processed_content,
        processing_method: doc.processing_method,
        summary_metadata: doc.summary_metadata,
      }));

      const settings = (course.settings as CourseSettings) || {};
      const jobData = {
        ...baseJobData,
        jobType: JobType.STRUCTURE_ANALYSIS,
        course_id: courseId,
        organization_id: organizationId,
        user_id: userId,
        input: {
          topic: settings.topic || course.title || '',
          language: course.language || 'en',
          style: course.style || 'formal',
          answers: settings.answers || null,
          target_audience: course.target_audience || '',
          difficulty: course.difficulty || 'intermediate',
          lesson_duration_minutes: settings.lesson_duration_minutes || 30,
          document_summaries,
        },
        priority,
        attempt_count: 0,
        created_at: new Date().toISOString(),
      };

      await addJob(JobType.STRUCTURE_ANALYSIS, jobData as unknown as JobData, { priority });
      logger.info({ courseId, nextStage: 4 }, 'Queued STRUCTURE_ANALYSIS job');
      break;
    }

    case 5: {
      // Stage 5: Structure Generation
      const supabase = getSupabaseAdmin();
      const analysisResult = course.analysis_result;
      const { data: vectorizedFiles } = await supabase
        .from('file_catalog')
        .select('id, filename, processed_content')
        .eq('course_id', courseId)
        .eq('vector_status', 'indexed' as unknown as Database['public']['Enums']['vector_status']);

      const hasVectorizedDocs = vectorizedFiles && vectorizedFiles.length > 0;
      const documentSummaries = hasVectorizedDocs
        ? (
            vectorizedFiles as Array<{
              id: string;
              filename: string;
              processed_content: string | null;
            }>
          ).map(file => ({
            file_id: file.id,
            file_name: file.filename,
            summary: file.processed_content || '',
            key_topics: [],
          }))
        : [];

      const settings = (course.settings as CourseSettings) || {};
      const jobInput = {
        course_id: courseId,
        organization_id: organizationId,
        user_id: userId,
        analysis_result: analysisResult,
        frontend_parameters: {
          course_title: course.title,
          language: course.language,
          style: course.style,
          target_audience: settings.target_audience,
          difficulty: course.difficulty,
          description: course.course_description,
          course_size: course.course_size,
          desired_lessons_count: settings.desired_lessons_count,
          desired_modules_count: settings.desired_modules_count,
          lesson_duration_minutes: settings.lesson_duration_minutes,
          learning_outcomes: settings.learning_outcomes,
        },
        vectorized_documents: hasVectorizedDocs,
        document_summaries: documentSummaries,
      };

      await addJob(JobType.STRUCTURE_GENERATION, jobInput as unknown as JobData, { priority });
      logger.info({ courseId, nextStage: 5 }, 'Queued STRUCTURE_GENERATION job');
      break;
    }

    default:
      logger.warn({ courseId, nextStage }, 'Unknown next stage for auto-queue');
  }
}

export { handleStageCompletion as default };
