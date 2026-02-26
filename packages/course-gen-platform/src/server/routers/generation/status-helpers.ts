import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, GenerationMetadata, JobData } from '@megacampus/shared-types';
import { JobType } from '@megacampus/shared-types';
import { TRPCError } from '@trpc/server';
import { addJob } from '../../../orchestrator/queue';
import { logger } from '../../../shared/logger/index.js';
import { throwOnSupabaseError } from '../../utils/supabase-query-guard';
import { isValidStyle } from '@megacampus/shared-types/style-prompts';
import type { CourseSettings } from './_shared/types';

// Extended type for error states which may have additional fields
type GenerationMetadataWithError = GenerationMetadata & {
  last_progress?: number;
  last_phase?: string;
  error_message?: string;
};

interface PhaseWeights {
  validate_input: number;
  generate_metadata: number;
  generate_sections: number;
  validate_quality: number;
  validate_lessons: number;
}

interface StatusResult {
  progress: number;
  currentPhase: string | null;
  estimatedTimeRemaining: number | null;
  error?: string;
}

/** Total estimated generation time in milliseconds (150 seconds) */
const TOTAL_ESTIMATED_TIME_MS = 150_000;

const PHASE_WEIGHTS: PhaseWeights = {
  validate_input: 5, // 0-5%
  generate_metadata: 20, // 5-25%
  generate_sections: 60, // 25-85%
  validate_quality: 10, // 85-95%
  validate_lessons: 5, // 95-100%
};

/**
 * Calculate progress for queued status
 */
function calculateQueuedProgress(): StatusResult {
  return {
    progress: 0,
    currentPhase: 'validate_input',
    estimatedTimeRemaining: TOTAL_ESTIMATED_TIME_MS,
  };
}

/**
 * Calculate progress for generating status based on metadata
 */
function calculateGeneratingProgress(
  generationMetadata: GenerationMetadataWithError | null
): StatusResult {
  if (!generationMetadata?.duration_ms) {
    return {
      progress: 5,
      currentPhase: 'validate_input',
      estimatedTimeRemaining: TOTAL_ESTIMATED_TIME_MS - 5000,
    };
  }

  const { duration_ms } = generationMetadata;
  let progress = 0;
  let currentPhase: string | null = null;

  if (duration_ms.validation > 0) {
    currentPhase = 'validate_lessons';
    progress = 95 + PHASE_WEIGHTS.validate_lessons * 0.5;
  } else if (duration_ms.sections > 0) {
    currentPhase = 'generate_sections';
    const batchProgress = (generationMetadata.batch_count || 0) / 8; // 8 batches assumed
    progress = 25 + PHASE_WEIGHTS.generate_sections * batchProgress;
  } else if (duration_ms.metadata > 0) {
    currentPhase = 'generate_metadata';
    progress = 5 + PHASE_WEIGHTS.generate_metadata * 0.5;
  } else {
    currentPhase = 'validate_input';
    progress = 2.5;
  }

  // Estimate remaining time
  const totalEstimated = TOTAL_ESTIMATED_TIME_MS;
  const elapsed = duration_ms.total || 0;
  const estimatedTimeRemaining = Math.max(0, totalEstimated - elapsed);

  return {
    progress,
    currentPhase,
    estimatedTimeRemaining,
  };
}

/**
 * Calculate progress for completed status
 */
function calculateCompletedProgress(): StatusResult {
  return {
    progress: 100,
    currentPhase: 'validate_lessons',
    estimatedTimeRemaining: null,
  };
}

/**
 * Calculate progress for failed status
 */
function calculateFailedProgress(
  generationMetadata: GenerationMetadataWithError | null
): StatusResult {
  return {
    progress: generationMetadata?.last_progress || 0,
    currentPhase: generationMetadata?.last_phase || null,
    estimatedTimeRemaining: null,
    error: generationMetadata?.error_message || 'Generation failed',
  };
}

/**
 * Determine progress based on generation status
 */
export function calculateProgress(
  generationStatus: string,
  generationMetadata: GenerationMetadataWithError | null
): StatusResult {
  if (generationStatus === 'queued') {
    return calculateQueuedProgress();
  }

  if (generationStatus === 'generating') {
    return calculateGeneratingProgress(generationMetadata);
  }

  if (generationStatus === 'completed') {
    return calculateCompletedProgress();
  }

  if (generationStatus === 'failed') {
    return calculateFailedProgress(generationMetadata);
  }

  // Default fallback
  return {
    progress: 0,
    currentPhase: null,
    estimatedTimeRemaining: null,
  };
}

/**
 * Fetch course with generation metadata
 */
export async function fetchCourseWithMetadata(
  supabase: SupabaseClient<Database>,
  courseId: string
) {
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, organization_id, generation_status, generation_metadata, created_at, updated_at')
    .eq('id', courseId)
    .single();

  throwOnSupabaseError(courseError, 'Course', { courseId });
  if (!course) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Course not found',
    });
  }

  return course;
}

/**
 * Verify organization access
 */
export function verifyOrganizationAccess(
  courseOrganizationId: string | null,
  userOrganizationId: string | null | undefined
): void {
  if (courseOrganizationId !== userOrganizationId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have access to this course',
    });
  }
}

/**
 * Handle status query - orchestrates status check
 */
export async function handleGetStatus(
  supabase: SupabaseClient<Database>,
  courseId: string,
  userOrganizationId: string | null | undefined
) {
  const course = await fetchCourseWithMetadata(supabase, courseId);
  verifyOrganizationAccess(course.organization_id, userOrganizationId);

  const generationStatus = (course.generation_status as string) || 'idle';
  const generationMetadata =
    course.generation_metadata as unknown as GenerationMetadataWithError | null;

  const statusResult = calculateProgress(generationStatus, generationMetadata);

  return {
    courseId: course.id,
    status: generationStatus,
    progress: Math.round(statusResult.progress),
    currentPhase: statusResult.currentPhase,
    estimatedTimeRemaining: statusResult.estimatedTimeRemaining,
    generationMetadata: generationStatus === 'completed' ? generationMetadata : undefined,
    error: statusResult.error,
  };
}

type Course = Database['public']['Tables']['courses']['Row'];
type Organization = Database['public']['Tables']['organizations']['Row'];

/**
 * Validate document priorities (for Stage 3 -> 4 transition)
 */
async function validateDocumentPriorities(
  supabase: SupabaseClient<Database>,
  courseId: string
): Promise<void> {
  const { data: docsWithPriority } = await supabase
    .from('file_catalog')
    .select('id, filename, priority')
    .eq('course_id', courseId);

  // Check that all documents have a priority set
  const withoutPriority = docsWithPriority?.filter(d => !d.priority);
  if (withoutPriority && withoutPriority.length > 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Все документы должны иметь установленный приоритет',
    });
  }

  // Check that exactly 1 document has priority='CORE'
  const coreCount = docsWithPriority?.filter(d => d.priority === 'CORE').length ?? 0;
  if (coreCount !== 1) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        coreCount === 0
          ? 'Необходимо выбрать один ключевой документ'
          : 'Может быть только один ключевой документ',
    });
  }
}

/**
 * Handle Stage 2 -> Stage 3 transition
 */
async function handleStage2Approval(
  supabase: SupabaseClient<Database>,
  courseId: string,
  organizationId: string | null,
  userId: string,
  priority: number
): Promise<{ success: boolean; nextStage: number }> {
  await supabase
    .from('courses')
    .update({
      generation_status:
        'stage_3_init' as unknown as Database['public']['Enums']['generation_status'],
    })
    .eq('id', courseId);

  const classificationJobData = {
    jobType: JobType.DOCUMENT_CLASSIFICATION,
    organizationId,
    courseId,
    userId,
    createdAt: new Date().toISOString(),
  };

  await addJob(JobType.DOCUMENT_CLASSIFICATION, classificationJobData as unknown as JobData, {
    priority,
  });

  logger.info(
    { courseId, userId },
    'Stage 2 approved, queued DOCUMENT_CLASSIFICATION job for Stage 3'
  );

  return { success: true, nextStage: 3 };
}

/**
 * Handle Stage 3 -> Stage 4 transition
 */
async function handleStage3Approval(
  supabase: SupabaseClient<Database>,
  courseId: string,
  course: Course,
  userId: string,
  priority: number
): Promise<{ success: boolean; nextStage: number }> {
  await validateDocumentPriorities(supabase, courseId);

  await supabase
    .from('courses')
    .update({
      generation_status:
        'stage_4_init' as unknown as Database['public']['Enums']['generation_status'],
    })
    .eq('id', courseId);

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

  const settings = (course.settings as unknown as CourseSettings) || {};
  const jobData = {
    jobType: JobType.STRUCTURE_ANALYSIS,
    organizationId: course.organization_id,
    courseId,
    userId,
    createdAt: new Date().toISOString(),
    course_id: courseId,
    organization_id: course.organization_id,
    user_id: userId,
    input: {
      topic: settings.topic || course.title || '',
      language: course.language || 'en',
      style: course.style || 'formal',
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
  return { success: true, nextStage: 4 };
}

/**
 * Handle Stage 4 -> Stage 5 transition
 */
async function handleStage4Approval(
  supabase: SupabaseClient<Database>,
  courseId: string,
  course: Course,
  userId: string,
  priority: number
): Promise<{ success: boolean; nextStage: number }> {
  await supabase
    .from('courses')
    .update({
      generation_status:
        'stage_5_init' as unknown as Database['public']['Enums']['generation_status'],
    })
    .eq('id', courseId);

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

  const jobInput = {
    course_id: courseId,
    organization_id: course.organization_id,
    user_id: userId,
    analysis_result: analysisResult,
    frontend_parameters: {
      course_title: course.title,
      language: course.language ?? undefined,
      style: course.style && isValidStyle(course.style) ? course.style : undefined,
      target_audience: course.target_audience ?? undefined,
      difficulty: course.difficulty ?? 'intermediate',
      description: course.course_description ?? undefined,
      course_size: course.course_size ?? undefined,
      desired_lessons_count: (course.settings as unknown as CourseSettings)?.desired_lessons_count,
      desired_modules_count: (course.settings as unknown as CourseSettings)?.desired_modules_count,
      lesson_duration_minutes: (course.settings as unknown as CourseSettings)
        ?.lesson_duration_minutes,
      learning_outcomes: (course.settings as unknown as CourseSettings)?.learning_outcomes,
    },
    vectorized_documents: hasVectorizedDocs,
    document_summaries: documentSummaries,
  };

  await addJob(JobType.STRUCTURE_GENERATION, jobInput as unknown as JobData, { priority });
  return { success: true, nextStage: 5 };
}

/**
 * Handle Stage 5 -> Stage 5 Complete transition
 */
async function handleStage5Approval(
  supabase: SupabaseClient<Database>,
  courseId: string
): Promise<{ success: boolean; nextStage: number }> {
  await supabase
    .from('courses')
    .update({
      generation_status:
        'stage_5_complete' as unknown as Database['public']['Enums']['generation_status'],
    })
    .eq('id', courseId);

  return { success: true, nextStage: 6 };
}

/**
 * Orchestrate stage approval based on current stage
 */
export async function handleApproveStage(
  supabase: SupabaseClient<Database>,
  courseId: string,
  currentStage: number,
  course: Course & { organization: Organization | null },
  userId: string
): Promise<{ success: boolean; nextStage: number }> {
  const tier = course.organization?.tier || 'free';
  const priority = tier === 'premium' ? 10 : tier === 'standard' ? 5 : 1;

  if (currentStage === 2) {
    return handleStage2Approval(supabase, courseId, course.organization_id, userId, priority);
  }

  if (currentStage === 3) {
    return handleStage3Approval(supabase, courseId, course, userId, priority);
  }

  if (currentStage === 4) {
    return handleStage4Approval(supabase, courseId, course, userId, priority);
  }

  if (currentStage === 5) {
    return handleStage5Approval(supabase, courseId);
  }

  return { success: false, nextStage: currentStage };
}
