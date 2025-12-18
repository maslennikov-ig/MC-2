import { getSupabaseAdmin } from './supabase/admin';
import { logger } from './logger';

interface TraceLogParams {
  courseId: string;
  /** Lesson UUID (references lessons.id) - use lessonLabel for human-readable IDs like "1.1" */
  lessonId?: string;
  /** Human-readable lesson identifier like "1.1" - stored in input_data if lessonId not provided */
  lessonLabel?: string;
  stage: 'stage_2' | 'stage_3' | 'stage_4' | 'stage_5' | 'stage_6';
  phase: string;
  stepName: string;
  inputData?: Record<string, any>;
  outputData?: Record<string, any> | null;
  errorData?: Record<string, any> | null;
  modelUsed?: string | null;
  promptText?: string | null;
  completionText?: string | null;
  tokensUsed?: number | null;
  costUsd?: number | null;
  temperature?: number | null;
  durationMs: number;
  retryAttempt?: number;
  wasCached?: boolean;
  qualityScore?: number | null;
}

/**
 * Check if a string is a valid UUID v4 format
 */
function isValidUuid(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Log detailed generation trace to Supabase
 * This function is fire-and-forget (does not block execution) but logs errors if insertion fails.
 */
export async function logTrace(params: TraceLogParams): Promise<void> {
  // Don't await this in critical path, but catch errors
  try {
    const supabase = getSupabaseAdmin();

    // Validate lessonId is a proper UUID if provided
    // If lessonId is not a UUID (e.g., "1.1"), store it in input_data as lessonLabel
    let validLessonId: string | null = null;
    let lessonLabel = params.lessonLabel;

    if (params.lessonId) {
      if (isValidUuid(params.lessonId)) {
        validLessonId = params.lessonId;
      } else {
        // Non-UUID lessonId (e.g., "1.1") - store as label instead
        lessonLabel = params.lessonId;
      }
    }

    // Ensure inputs are objects (safe for JSONB)
    const safeInput = {
      ...params.inputData,
      // Include lessonLabel in input_data for searchability
      ...(lessonLabel ? { lessonLabel } : {}),
    };
    const safeOutput = params.outputData || undefined; // undefined to skip if null
    const safeError = params.errorData || undefined;

    // Cast to any to bypass type checking for new table until types are regenerated
    const { error } = await (supabase.from('generation_trace') as any).insert({
      course_id: params.courseId,
      lesson_id: validLessonId,
      stage: params.stage,
      phase: params.phase,
      step_name: params.stepName,
      input_data: safeInput,
      output_data: safeOutput,
      error_data: safeError,
      model_used: params.modelUsed || null,
      prompt_text: params.promptText || null,
      completion_text: params.completionText || null,
      tokens_used: params.tokensUsed || null,
      cost_usd: params.costUsd || null,
      temperature: params.temperature || null,
      duration_ms: params.durationMs,
      retry_attempt: params.retryAttempt || 0,
      was_cached: params.wasCached || false,
      quality_score: params.qualityScore || null,
    });

    if (error) {
      logger.error({ error, params }, 'Failed to log generation trace');
    }
  } catch (err) {
    // Don't throw - logging should never crash the app
    logger.error({ err, params }, 'Exception in trace logging');
  }
}
