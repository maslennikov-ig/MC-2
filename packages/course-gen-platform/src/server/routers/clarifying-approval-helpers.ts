/**
 * Clarifying Questions Router - Approve & Proceed Helpers
 * @module server/routers/clarifying-approval-helpers
 *
 * Extracted from clarifying-helpers.ts to keep each file under 500 code lines.
 * Contains helpers for the approveAndProceed mutation:
 * - Atomic RPC execution and error mapping
 * - Status transition verification
 * - Data fetching with rollback on failure
 * - Analysis job creation
 */

import { TRPCError } from '@trpc/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../../shared/supabase/admin';
import { addJob } from '../../orchestrator/queue';
import { JobType, ClarifyingQuestionRow, Database, JobData } from '@megacampus/shared-types';
import { logger } from '../../shared/logger/index.js';
import { CourseDetails, getTierPriority } from './clarifying-helpers';

// ============================================================================
// TYPE ALIASES
// ============================================================================

/** Supabase admin client type shorthand */
type AdminClient = SupabaseClient<Database>;

/** TRPCError constructor options shape */
type TRPCErrorOpts = ConstructorParameters<typeof TRPCError>[0];

/**
 * RPC result from approve_and_proceed_atomic function
 */
export interface ApprovalRpcResult {
  success: boolean;
  error?: string;
  code?: string;
  unanswered_critical?: number;
  unanswered_important?: number;
  current_status?: string;
  existing_job_id?: string;
  is_duplicate?: boolean;
}

/** Document summary shape used in analysis job data */
export type DocumentSummary = {
  document_id: string;
  file_name: string;
  processed_content: string;
  processing_method: string;
  summary_metadata: unknown;
};

/** Parameters for building and creating the analysis job */
export interface CreateAnalysisJobParams {
  courseId: string;
  userId: string;
  organizationId: string;
  courseDetails: CourseDetails;
  answeredQuestions: ClarifyingQuestionRow[];
  documentSummaries: DocumentSummary[];
  requestId: string;
}

// ============================================================================
// APPROVE AND PROCEED HELPERS
// ============================================================================

/**
 * Execute the atomic RPC approval and map error codes to TRPC errors.
 *
 * @returns The RPC result on success
 * @throws TRPCError mapped from RPC error codes
 */
export async function executeAtomicApproval(
  courseId: string,
  userId: string,
  organizationId: string,
  requestId: string
): Promise<ApprovalRpcResult> {
  const supabase = getSupabaseAdmin();

  const rpcResponse = await (
    supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    }
  ).rpc('approve_and_proceed_atomic', {
    p_course_id: courseId,
    p_user_id: userId,
    p_org_id: organizationId,
  });

  if (rpcResponse.error) {
    logger.error(
      { requestId, courseId, error: rpcResponse.error.message },
      'RPC approve_and_proceed_atomic failed'
    );
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to proceed',
    });
  }

  const result = rpcResponse.data as ApprovalRpcResult;

  if (!result.success) {
    logger.warn({ requestId, courseId, rpcResult: result }, 'RPC returned failure');
    throwApprovalError(result);
  }

  return result;
}

/**
 * Map RPC failure codes to TRPC errors and throw.
 * Separated to reduce cyclomatic complexity of executeAtomicApproval.
 */
function throwApprovalError(result: ApprovalRpcResult): never {
  const errorMap: Record<string, TRPCErrorOpts> = {
    NOT_FOUND: { code: 'NOT_FOUND', message: 'Course not found' },
    FORBIDDEN: { code: 'FORBIDDEN', message: 'You do not have access to this course' },
    INVALID_STATUS: {
      code: 'BAD_REQUEST',
      message: `Cannot proceed from status '${result.current_status}'. Expected: stage_4_clarifying`,
    },
    UNANSWERED_QUESTIONS: {
      code: 'BAD_REQUEST',
      message: `Cannot proceed. ${result.unanswered_critical} critical and ${result.unanswered_important} important questions remain unanswered.`,
    },
    CONCURRENT_REQUEST: {
      code: 'CONFLICT',
      message: 'Another request is already processing this course. Please wait.',
    },
  };

  const mapped = result.code ? errorMap[result.code] : undefined;
  if (mapped) {
    throw new TRPCError(mapped);
  }

  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: result.error || 'Failed to proceed',
  });
}

/**
 * Defensive check: verify course status is stage_4_analyzing after RPC transition.
 *
 * @throws TRPCError(CONFLICT) if status has changed (race condition)
 */
export async function verifyStatusTransition(
  supabase: AdminClient,
  courseId: string,
  requestId: string
): Promise<void> {
  const statusCheckResult = (await supabase
    .from('courses')
    .select('generation_status')
    .eq('id', courseId)
    .single()) as { data: { generation_status: string | null } | null };

  const statusCheck = statusCheckResult.data;

  if (statusCheck?.generation_status !== 'stage_4_analyzing') {
    logger.warn(
      {
        requestId,
        courseId,
        expectedStatus: 'stage_4_analyzing',
        actualStatus: statusCheck?.generation_status,
      },
      'Course status changed during operation (race condition detected)'
    );
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'Course status changed during operation. Please try again.',
    });
  }
}

/**
 * Rollback course generation_status to stage_4_clarifying.
 * Used when post-approval steps fail.
 */
async function rollbackToClarifying(supabase: AdminClient, courseId: string): Promise<void> {
  await supabase
    .from('courses')
    .update({ generation_status: 'stage_4_clarifying' })
    .eq('id', courseId);
}

/**
 * Fetch all answered questions for a course.
 * Rolls back to stage_4_clarifying on failure.
 *
 * @throws TRPCError if fetch fails
 */
export async function fetchAnsweredQuestions(
  supabase: AdminClient,
  courseId: string,
  requestId: string
): Promise<ClarifyingQuestionRow[]> {
  const answeredResult = (await supabase
    .from('clarifying_questions')
    .select('*')
    .eq('course_id', courseId)
    .eq('status', 'answered')) as {
    data: unknown[] | null;
    error: { message: string } | null;
  };

  if (answeredResult.error) {
    logger.error(
      { requestId, courseId, error: answeredResult.error.message },
      'Failed to fetch answered questions'
    );
    await rollbackToClarifying(supabase, courseId);
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to fetch answers',
    });
  }

  return (answeredResult.data || []) as ClarifyingQuestionRow[];
}

/**
 * Fetch course details (with organization tier) for the analysis job.
 * Rolls back to stage_4_clarifying on failure.
 *
 * @throws TRPCError if fetch fails
 */
export async function fetchCourseDetailsForJob(
  supabase: AdminClient,
  courseId: string,
  requestId: string
): Promise<CourseDetails> {
  const courseDetailsResult = (await supabase
    .from('courses')
    .select(
      `
      *,
      organization:organizations(tier)
    `
    )
    .eq('id', courseId)
    .single()) as { data: unknown; error: { message: string } | null };

  if (courseDetailsResult.error || !courseDetailsResult.data) {
    logger.error(
      { requestId, courseId, error: courseDetailsResult.error?.message },
      'Failed to fetch course details'
    );
    await rollbackToClarifying(supabase, courseId);
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to fetch course details',
    });
  }

  return courseDetailsResult.data as unknown as CourseDetails;
}

/**
 * Fetch document summaries from file_catalog for a course.
 * Rolls back to stage_4_clarifying on failure.
 *
 * @returns Array of document summary objects for the analysis job
 * @throws TRPCError if fetch fails
 */
export async function fetchDocumentSummaries(
  supabase: AdminClient,
  courseId: string,
  requestId: string
): Promise<DocumentSummary[]> {
  const { data: documents, error: documentsError } = await supabase
    .from('file_catalog')
    .select('id, filename, processed_content, processing_method, summary_metadata')
    .eq('course_id', courseId)
    .not('processed_content', 'is', null)
    .not('processing_method', 'is', null);

  if (documentsError) {
    logger.error(
      { requestId, courseId, error: documentsError.message },
      'Failed to fetch document summaries'
    );
    await rollbackToClarifying(supabase, courseId);
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to fetch document summaries',
    });
  }

  return (documents || []).map(doc => ({
    document_id: doc.id,
    file_name: doc.filename,
    processed_content: doc.processed_content || '',
    processing_method: doc.processing_method || '',
    summary_metadata: doc.summary_metadata,
  }));
}

/**
 * Build job data and create a STRUCTURE_ANALYSIS BullMQ job.
 * Sets proceed_job_id on success. Rolls back status on failure.
 *
 * @returns The created job ID
 * @throws TRPCError if job creation fails
 */
export async function createAnalysisJob(params: CreateAnalysisJobParams): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { courseDetails, answeredQuestions, documentSummaries } = params;

  // Format clarifying answers for analysis job
  const clarifyingAnswers = answeredQuestions.map(q => ({
    question: q.question_text,
    answer: q.user_answer,
    priority: q.question_priority,
    category: q.question_category,
  }));

  // Get tier-based priority
  const tier = courseDetails.organization?.tier || 'free';
  const priority = getTierPriority(tier);

  // Extract settings for analysis input
  const settings = courseDetails.settings || {};
  const topic =
    (settings.topic as string) || courseDetails.title || courseDetails.course_description || '';
  const lessonDuration = (settings.lesson_duration_minutes as number) || 30;

  const jobData: Record<string, unknown> = {
    jobType: JobType.STRUCTURE_ANALYSIS,
    organizationId: params.organizationId,
    courseId: params.courseId,
    userId: params.userId,
    createdAt: new Date().toISOString(),
    course_id: params.courseId,
    organization_id: params.organizationId,
    user_id: params.userId,
    input: {
      topic,
      language: courseDetails.language || 'en',
      style: courseDetails.style || 'formal',
      target_audience: courseDetails.target_audience || '',
      difficulty: courseDetails.difficulty || 'intermediate',
      lesson_duration_minutes: lessonDuration,
      document_summaries: documentSummaries,
      clarifying_answers: clarifyingAnswers,
    },
    priority,
    attempt_count: 0,
    created_at: new Date().toISOString(),
  };

  let jobId: string;
  try {
    const job = await addJob(JobType.STRUCTURE_ANALYSIS, jobData as unknown as JobData, {
      priority,
    });
    jobId = String(job.id);

    // RACE CONDITION PROTECTION: Set proceed_job_id after successful job creation
    const { error: setJobIdError } = await (
      supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>
        ) => Promise<{ error: { message: string } | null }>;
      }
    ).rpc('set_proceed_job_id', {
      p_course_id: params.courseId,
      p_job_id: jobId,
    });

    if (setJobIdError) {
      // Non-fatal: log warning but continue - job was created successfully
      logger.warn(
        {
          requestId: params.requestId,
          courseId: params.courseId,
          jobId,
          error: setJobIdError.message,
        },
        'Failed to set proceed_job_id (non-fatal)'
      );
    }
  } catch (jobError) {
    logger.error(
      {
        requestId: params.requestId,
        courseId: params.courseId,
        error: jobError instanceof Error ? jobError.message : String(jobError),
      },
      'Failed to create analysis job, rolling back status'
    );

    await supabase
      .from('courses')
      .update({ generation_status: 'stage_4_clarifying' })
      .eq('id', params.courseId);

    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to create analysis job',
    });
  }

  return jobId;
}
