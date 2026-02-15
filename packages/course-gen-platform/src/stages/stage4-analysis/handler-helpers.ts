/**
 * Stage 4 Analysis Handler - Helper Functions
 *
 * Extracted from handler.ts to reduce file size and function complexity.
 * Contains:
 * - Error classification utilities
 * - Worker validation and FSM fallback
 * - Analysis input building from database
 * - Status management utilities
 * - Error handling utilities
 *
 * @module orchestrator/handlers/stage4-analysis/helpers
 */

import type { Job } from 'bullmq';
import type { StructureAnalysisJobData, Database } from '@megacampus/shared-types';
import {
  getCourseSizePreset,
  type CourseSize,
  DEFAULT_COURSE_STYLE,
} from '@megacampus/shared-types';
import logger from '../../shared/logger';
import { getSupabaseAdmin } from '../../shared/supabase/admin';
import {
  ClarifyingQuestionsInterrupt,
  BarrierFailedError,
  MinimumLessonsNotMetError,
  LLMError,
  PipelineError,
  classifyPipelineError,
} from '@/shared/errors';
import type { Stage4BudgetAllocation } from './phases/stage4-budget-allocator';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Error details for STRUCTURE_ANALYSIS jobs
 */
export interface AnalysisErrorDetails {
  /** Error code for classification */
  code:
    | 'AWAITING_CLARIFYING_ANSWERS'
    | 'BARRIER_FAILED'
    | 'MINIMUM_LESSONS_NOT_MET'
    | 'LLM_ERROR'
    | 'UNKNOWN';

  /** Human-readable error message */
  message: string;

  /** Phase where error occurred (if applicable) */
  phase?: string;

  /** Additional error context */
  details?: Record<string, unknown>;
}

/**
 * Job result structure for STRUCTURE_ANALYSIS jobs
 */
export interface StructureAnalysisJobResult {
  /** Success flag */
  success: boolean;
  /** Status message */
  message?: string;
  /** Course UUID */
  course_id: string;
  /** Complete analysis result (only on success) */
  analysis_result?: import('@megacampus/shared-types/analysis-result').AnalysisResult;
  /** Error details (only on failure) */
  error?: AnalysisErrorDetails;
  /** Job execution metadata */
  metadata: {
    total_duration_ms: number;
    retry_count: number;
    completed_at: string;
  };
}

/** Analysis error code type */
export type AnalysisErrorCode =
  | 'AWAITING_CLARIFYING_ANSWERS'
  | 'BARRIER_FAILED'
  | 'MINIMUM_LESSONS_NOT_MET'
  | 'LLM_ERROR'
  | 'UNKNOWN';

// ============================================================================
// ERROR CLASSIFICATION
// ============================================================================

/** Classify error by instanceof check (Priority 1) */
function classifyByInstance(error: Error | string): AnalysisErrorCode | null {
  if (error instanceof ClarifyingQuestionsInterrupt) return 'AWAITING_CLARIFYING_ANSWERS';
  if (error instanceof BarrierFailedError) return 'BARRIER_FAILED';
  if (error instanceof MinimumLessonsNotMetError) return 'MINIMUM_LESSONS_NOT_MET';
  if (error instanceof LLMError) return 'LLM_ERROR';
  if (error instanceof PipelineError) {
    const code = classifyPipelineError(error);
    if (
      code === 'AWAITING_CLARIFYING_ANSWERS' ||
      code === 'BARRIER_FAILED' ||
      code === 'MINIMUM_LESSONS_NOT_MET' ||
      code === 'LLM_ERROR'
    ) {
      return code;
    }
    return 'UNKNOWN';
  }
  return null;
}

/** Classify error by message string matching (Priority 2) */
function classifyByMessage(errorMessage: string): AnalysisErrorCode {
  if (errorMessage.includes('AWAITING_CLARIFYING_ANSWERS')) {
    return 'AWAITING_CLARIFYING_ANSWERS';
  }
  if (errorMessage.includes('BARRIER_FAILED') || errorMessage.includes('Stage 3 barrier')) {
    return 'BARRIER_FAILED';
  }
  if (
    errorMessage.includes('Insufficient scope for minimum 10 lessons') ||
    errorMessage.includes('MINIMUM_LESSONS_NOT_MET')
  ) {
    return 'MINIMUM_LESSONS_NOT_MET';
  }
  if (
    errorMessage.includes('LLM_ERROR') ||
    errorMessage.includes('OpenRouter') ||
    errorMessage.includes('rate limit') ||
    errorMessage.includes('API error') ||
    errorMessage.includes('aborted') ||
    errorMessage.includes('AbortError')
  ) {
    return 'LLM_ERROR';
  }
  return 'UNKNOWN';
}

/**
 * Classify error into specific error codes for Stage 4
 */
export function classifyAnalysisError(error: Error | string): AnalysisErrorCode {
  const instanceResult = classifyByInstance(error);
  if (instanceResult) return instanceResult;

  const errorMessage = error instanceof Error ? error.message : String(error);
  return classifyByMessage(errorMessage);
}

/**
 * Determine phase from error message
 */
export function determinePhaseFromError(error: Error): string | undefined {
  const msg = error.message;
  if (msg.includes('Phase 0') || msg.includes('BARRIER_FAILED')) return 'preflight_validation';
  if (msg.includes('Phase 1')) return 'stage_4_classification';
  if (msg.includes('Phase 2') || msg.includes('minimum 10 lessons')) return 'stage_4_scope';
  if (msg.includes('Phase 3')) return 'stage_4_expert';
  if (msg.includes('Phase 4')) return 'stage_4_synthesis';
  if (msg.includes('Phase 5')) return 'final_assembly';
  return undefined;
}

// ============================================================================
// WORKER VALIDATION & FSM FALLBACK
// ============================================================================

/**
 * Perform Layer 3 worker validation and fallback initialization for Stage 4.
 */
export async function validateAndInitializeStage4(
  courseId: string,
  userId: string | undefined,
  organizationId: string | undefined,
  jobId: string | undefined
): Promise<void> {
  const supabaseForValidation = getSupabaseAdmin();
  const { data: course, error: courseError } = await supabaseForValidation
    .from('courses')
    .select('generation_status')
    .eq('id', courseId)
    .single();

  if (courseError || !course) {
    logger.error(
      {
        courseId,
        jobId,
        error: courseError?.message,
        errorCode: courseError?.code,
        errorDetails: courseError?.details,
        errorHint: courseError?.hint,
      },
      'Worker validation: Course not found'
    );
    throw new Error(`Course not found: ${courseError?.message || 'No data returned'}`);
  }

  const validStage4States = ['stage_4_init', 'stage_4_analyzing', 'stage_4_awaiting_approval'];
  if (!validStage4States.includes(course.generation_status as string)) {
    logger.warn(
      { courseId, jobId, currentStatus: course.generation_status },
      'Worker validation: Stage 4 not initialized, initializing as fallback'
    );

    try {
      const { InitializeFSMCommandHandler } = await import(
        '../../shared/fsm/fsm-initialization-command-handler'
      );
      const { metricsStore } = await import('../../orchestrator/metrics');

      const commandHandler = new InitializeFSMCommandHandler();
      await commandHandler.handle({
        entityId: courseId,
        userId: userId || 'system',
        organizationId: organizationId || 'unknown',
        idempotencyKey: `worker-fallback-stage4-${jobId}`,
        initiatedBy: 'WORKER',
        initialState: 'stage_4_init',
        data: { trigger: 'worker_fallback_stage4' },
        jobs: [],
      });

      metricsStore.recordLayer3Activation(true, courseId);
      logger.info({ courseId, jobId }, 'Worker fallback: Stage 4 initialized successfully');
    } catch (error) {
      const { metricsStore } = await import('../../orchestrator/metrics');
      metricsStore.recordLayer3Activation(false, courseId);

      logger.warn(
        {
          courseId,
          jobId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Worker fallback initialization failed (continuing processing)'
      );
    }
  }
}

// ============================================================================
// ANALYSIS INPUT BUILDING
// ============================================================================

/** Language name to ISO 639-1 code mapping */
const LANGUAGE_NAME_TO_CODE: Record<string, string> = {
  Russian: 'ru',
  English: 'en',
  Chinese: 'zh',
  Spanish: 'es',
  French: 'fr',
  German: 'de',
  Japanese: 'ja',
  Korean: 'ko',
  Arabic: 'ar',
  Portuguese: 'pt',
  Italian: 'it',
  Turkish: 'tr',
  Vietnamese: 'vi',
  Thai: 'th',
  Indonesian: 'id',
  Malay: 'ms',
  Hindi: 'hi',
  Bengali: 'bn',
  Polish: 'pl',
};

/** Summary metadata shape from DB */
type SummaryMetadata = {
  original_tokens?: number;
  summary_tokens?: number;
  compression_ratio?: number;
  quality_score?: number;
};

/** Document summary shape returned from buildAnalysisInput */
export type DocumentSummaryResult = {
  document_id: string;
  file_name: string;
  processed_content: string;
  processing_method: 'balanced';
  summary_metadata: {
    original_tokens: number;
    summary_tokens: number;
    compression_ratio: number;
    quality_score: number;
  };
};

/** Fetch course metadata from database */
async function fetchCourseMetadata(courseId: string): Promise<{
  title: string | null;
  language: string | null;
  style: string | null;
  difficulty: string | null;
  target_audience: string | null;
  course_description: string | null;
  learning_outcomes: string | null;
  settings: unknown;
  course_size: string | null;
}> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('courses')
    .select(
      'title, language, style, difficulty, target_audience, course_description, learning_outcomes, settings, course_size'
    )
    .eq('id', courseId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to fetch course data: ${error?.message || 'Course not found'}`);
  }
  return data;
}

/** Fetch and transform document summaries from file_catalog */
async function fetchDocumentSummaries(courseId: string): Promise<DocumentSummaryResult[]> {
  const supabase = getSupabaseAdmin();
  const { data: documents } = await supabase
    .from('file_catalog')
    .select('id, original_name, filename, processed_content, summary_metadata')
    .eq('course_id', courseId)
    .eq('vector_status', 'indexed')
    .not('processed_content', 'is', null);

  return (documents || []).map(doc => {
    const metadata = doc.summary_metadata as SummaryMetadata | null;
    return {
      document_id: doc.id,
      file_name: doc.original_name || doc.filename || 'unknown',
      processed_content: doc.processed_content || '',
      processing_method: 'balanced' as const,
      summary_metadata: {
        original_tokens: metadata?.original_tokens || 0,
        summary_tokens: metadata?.summary_tokens || 0,
        compression_ratio: metadata?.compression_ratio || 1,
        quality_score: metadata?.quality_score || 0.8,
      },
    };
  });
}

/** Fetch full text (markdown_content) for documents that need full text mode */
async function fetchFullTextDocuments(documentIds: string[]): Promise<Map<string, string>> {
  if (documentIds.length === 0) return new Map();

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('file_catalog')
    .select('id, markdown_content')
    .in('id', documentIds)
    .not('markdown_content', 'is', null);

  const map = new Map<string, string>();
  for (const doc of data || []) {
    if (doc.markdown_content) map.set(doc.id, doc.markdown_content);
  }
  return map;
}

/**
 * Resolve document content based on budget allocation.
 * Replaces processed_content with markdown_content for documents marked as mode: 'full_text'.
 *
 * @param allocation - Budget allocation result with mode decisions
 * @param documents - Original document summaries
 * @returns Document summaries with full text loaded for full_text mode documents
 */
export async function resolveDocumentContent(
  allocation: Stage4BudgetAllocation,
  documents: DocumentSummaryResult[]
): Promise<DocumentSummaryResult[]> {
  const fullTextIds = allocation.documents
    .filter(d => d.mode === 'full_text')
    .map(d => d.file_id);

  if (fullTextIds.length === 0) return documents;

  const fullTextMap = await fetchFullTextDocuments(fullTextIds);

  return documents.map(doc => {
    const fullText = fullTextMap.get(doc.document_id);
    if (fullText) {
      return { ...doc, processed_content: fullText };
    }
    return doc;
  });
}

/** Resolve course size from job data or database (GTQ-6162) */
function resolveCourseSize(
  jobCourseSize: CourseSize | undefined,
  dbCourseSize: CourseSize | null,
  jobLogger: { info: (obj: Record<string, unknown>, msg: string) => void }
): ReturnType<typeof getCourseSizePreset> | null {
  const courseSize: CourseSize | null = jobCourseSize ?? dbCourseSize;
  const courseSizeSource = jobCourseSize !== undefined ? 'job_data' : 'database';

  jobLogger.info(
    { jobCourseSize, dbCourseSize, effectiveCourseSize: courseSize, source: courseSizeSource },
    'Course size resolution (GTQ-6162 fix)'
  );

  return courseSize ? getCourseSizePreset(courseSize) : null;
}

/**
 * Build the StructureAnalysisInput from database.
 * Fetches course metadata and document summaries.
 */
export async function buildAnalysisInput(
  courseId: string,
  _organizationId: string | undefined,
  jobCourseSize: CourseSize | undefined,
  jobLogger: { info: (obj: Record<string, unknown>, msg: string) => void }
): Promise<{
  analysisInput: import('@megacampus/shared-types').StructureAnalysisInput;
  documentSummaries: DocumentSummaryResult[];
}> {
  const courseForInput = await fetchCourseMetadata(courseId);
  const documentSummaries = await fetchDocumentSummaries(courseId);

  // Resolve language
  const rawLang = courseForInput.language || 'ru';
  const language = rawLang.length === 2 ? rawLang : LANGUAGE_NAME_TO_CODE[rawLang] || 'ru';

  // Resolve course size (GTQ-6162: job data has priority over DB)
  const dbCourseSize = courseForInput.course_size as CourseSize | null;
  const sizePreset = resolveCourseSize(jobCourseSize, dbCourseSize, jobLogger);

  // Extract lesson_duration_minutes from settings JSONB
  const settings = courseForInput.settings as { lesson_duration_minutes?: number } | null;
  const lessonDuration = settings?.lesson_duration_minutes || 15;

  const analysisInput: import('@megacampus/shared-types').StructureAnalysisInput = {
    topic: courseForInput.title || 'Course Topic',
    language,
    style: courseForInput.style || DEFAULT_COURSE_STYLE,
    target_audience: (courseForInput.target_audience ||
      'mixed') as import('@megacampus/shared-types').TargetAudience,
    difficulty: courseForInput.difficulty || 'intermediate',
    lesson_duration_minutes: lessonDuration,
    document_summaries: documentSummaries,
    course_size: sizePreset?.size,
    target_lessons: sizePreset?.targetLessons,
    target_sections: sizePreset?.targetSections,
    size_guidance: sizePreset?.llmGuidance,
    min_lessons: sizePreset?.minLessons,
    max_lessons: sizePreset?.maxLessons,
    course_description: courseForInput.course_description || undefined,
    learning_outcomes: courseForInput.learning_outcomes || undefined,
  };

  return { analysisInput, documentSummaries };
}

// ============================================================================
// STATUS MANAGEMENT
// ============================================================================

/**
 * Handle status initialization and transitions for Stage 4.
 * Manages the stage_4_init -> stage_4_clarifying -> stage_4_analyzing flow.
 */
export async function handleStatusTransitions(
  courseId: string,
  organizationId: string | undefined,
  job: Job<StructureAnalysisJobData>,
  jobLogger: { info: (obj: Record<string, unknown> | string, msg?: string) => void }
): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: currentCourse } = await supabaseAdmin
    .from('courses')
    .select('generation_status')
    .eq('id', courseId)
    .single();

  if (!currentCourse) {
    throw new Error('Course not found during status check');
  }

  const currentStatus = currentCourse.generation_status;
  const validProgressStates = ['stage_4_init', 'stage_4_clarifying', 'stage_4_analyzing'];

  if (!validProgressStates.includes(currentStatus as string)) {
    // Not in Stage 4 progression - perform full initialization
    await initializeStage4Status(supabaseAdmin, courseId, organizationId, jobLogger);
  } else {
    // Already in Stage 4 - handle specific state
    await handleExistingStage4Status(
      supabaseAdmin,
      courseId,
      organizationId,
      currentStatus as string,
      job,
      jobLogger
    );
  }
}

/** Update course status with organization_id filter */
async function updateCourseStatus(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  courseId: string,
  organizationId: string | undefined,
  status: string
): Promise<void> {
  const query = supabaseAdmin
    .from('courses')
    .update({
      generation_status: status as 'stage_4_init' | 'stage_4_analyzing',
      updated_at: new Date().toISOString(),
    })
    .eq('id', courseId);

  // Apply organization filter if available
  const result = organizationId ? await query.eq('organization_id', organizationId) : await query;

  if (result.error) {
    throw new Error(`Failed to update status to ${status}: ${result.error.message}`);
  }
}

/** Initialize Stage 4 status from scratch */
async function initializeStage4Status(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  courseId: string,
  organizationId: string | undefined,
  jobLogger: { info: (obj: Record<string, unknown> | string, msg?: string) => void }
): Promise<void> {
  jobLogger.info('Setting course status to stage_4_init');
  await updateCourseStatus(supabaseAdmin, courseId, organizationId, 'stage_4_init');

  jobLogger.info('Setting course status to stage_4_analyzing');
  await updateCourseStatus(supabaseAdmin, courseId, organizationId, 'stage_4_analyzing');
}

/** Handle existing Stage 4 status transitions */
async function handleExistingStage4Status(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  courseId: string,
  organizationId: string | undefined,
  currentStatus: string,
  _job: Job<StructureAnalysisJobData>,
  jobLogger: { info: (obj: Record<string, unknown> | string, msg?: string) => void }
): Promise<void> {
  if (currentStatus === 'stage_4_init') {
    jobLogger.info('Transitioning from stage_4_init to stage_4_analyzing');
    await updateCourseStatus(supabaseAdmin, courseId, organizationId, 'stage_4_analyzing');
  } else if (currentStatus === 'stage_4_clarifying') {
    await handleClarifyingStatus(supabaseAdmin, courseId, organizationId, jobLogger);
  }
  // If already stage_4_analyzing, no status change needed
}

/** Handle the clarifying questions status */
async function handleClarifyingStatus(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  courseId: string,
  organizationId: string | undefined,
  jobLogger: { info: (obj: Record<string, unknown> | string, msg?: string) => void }
): Promise<void> {
  jobLogger.info('Status is stage_4_clarifying - checking if answers are complete');

  const { getPendingQuestions } = await import('./phases/phase-0.5-clarifying');
  const pendingQuestions = await getPendingQuestions(courseId);

  const criticalPending = pendingQuestions.filter(
    q => q.question_priority === 'critical' || q.question_priority === 'important'
  );

  if (criticalPending.length > 0) {
    jobLogger.info(
      { criticalPendingCount: criticalPending.length, totalPendingCount: pendingQuestions.length },
      'Critical/important questions still pending - aborting job'
    );
    throw new Error(
      `AWAITING_CLARIFYING_ANSWERS: ${criticalPending.length} critical/important questions pending`,
      {
        cause: {
          code: 'QUESTIONS_PENDING',
          criticalCount: criticalPending.length,
          totalCount: pendingQuestions.length,
          message: 'Please answer the critical and important questions to continue',
        },
      }
    );
  }

  jobLogger.info('All critical/important questions answered - transitioning to analyzing');
  await updateCourseStatus(supabaseAdmin, courseId, organizationId, 'stage_4_analyzing');
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Mark course as failed in the database
 */
export async function markCourseAsFailed(
  courseId: string,
  organizationId: string | undefined,
  errorCode: AnalysisErrorCode,
  jobLogger: {
    info: (obj: Record<string, unknown>, msg: string) => void;
    error: (obj: Record<string, unknown>, msg: string) => void;
  }
): Promise<void> {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const query = supabaseAdmin
      .from('courses')
      .update({
        generation_status: 'failed',
        failed_at_stage: 4,
        error_code: errorCode as Database['public']['Enums']['stage_error_code'],
        updated_at: new Date().toISOString(),
      })
      .eq('id', courseId);

    // Apply organization filter if available
    const { error: statusUpdateError } = organizationId
      ? await query.eq('organization_id', organizationId)
      : await query;

    if (statusUpdateError) {
      jobLogger.error(
        { error: statusUpdateError },
        'Failed to update course status with failure details'
      );
    }
  } catch (statusError) {
    jobLogger.error({ error: statusError }, 'Exception updating course status');
  }
}

/**
 * Track stage 4 token usage
 */
export async function trackStage4Tokens(
  courseId: string,
  tokens: number | undefined,
  jobLogger: { warn: (obj: Record<string, unknown>, msg: string) => void }
): Promise<void> {
  if (tokens && tokens > 0) {
    const supabaseAdmin = getSupabaseAdmin();
    const { error: tokenError } = await supabaseAdmin.rpc('upsert_stage_tokens', {
      p_course_id: courseId,
      p_stage_key: 'stage_4',
      p_tokens: tokens,
    });
    if (tokenError) {
      jobLogger.warn(
        { courseId, tokens, error: tokenError.message },
        'Failed to upsert stage tokens (non-fatal)'
      );
    }
  }
}
