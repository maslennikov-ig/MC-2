import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getSupabaseAdmin } from './supabase/admin';
import { logger } from './logger';
import type { Database } from '@megacampus/shared-types';

const TRACE_PROMPTS_DIR = join(process.cwd(), 'data', 'traces');
const STORE_PROMPTS_IN_DB = process.env.TRACE_STORE_PROMPTS === 'true';

interface TraceLogParams {
  courseId: string;
  /** Lesson UUID (references lessons.id) - use lessonLabel for human-readable IDs like "1.1" */
  lessonId?: string;
  /** Human-readable lesson identifier like "1.1" - stored in input_data if lessonId not provided */
  lessonLabel?: string;
  stage: 'stage_1' | 'stage_2' | 'stage_3' | 'stage_4' | 'stage_5' | 'stage_6';
  phase: string;
  stepName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- trace data accepts arbitrary objects (Date, enums, etc.) that Supabase serializes
  inputData?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- trace data accepts arbitrary objects
  outputData?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- trace data accepts arbitrary objects
  errorData?: any;
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
 * Write prompt_text and completion_text to a local JSONL file instead of Supabase.
 * Reduces DB size (~10 KB per trace) and Realtime egress.
 */
async function writePromptsToFile(
  courseId: string,
  traceMetadata: { stage: string; phase: string; stepName: string; lessonId?: string | null },
  promptText: string | null,
  completionText: string | null
): Promise<void> {
  if (!promptText && !completionText) return;
  try {
    await mkdir(TRACE_PROMPTS_DIR, { recursive: true });
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        courseId,
        lessonId: traceMetadata.lessonId || null,
        stage: traceMetadata.stage,
        phase: traceMetadata.phase,
        step: traceMetadata.stepName,
        promptText,
        completionText,
      }) + '\n';
    await appendFile(join(TRACE_PROMPTS_DIR, `${courseId}.jsonl`), line, 'utf-8');
  } catch (err) {
    logger.warn({ err, courseId }, 'Failed to write trace prompts to file');
  }
}

/**
 * Log detailed generation trace to Supabase
 * This function is fire-and-forget (does not block execution) but logs errors if insertion fails.
 * prompt_text/completion_text are written to local files by default (set TRACE_STORE_PROMPTS=true to store in DB).
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
      ...(params.inputData || {}),
      // Include lessonLabel in input_data for searchability
      ...(lessonLabel ? { lessonLabel } : {}),
    };
    const safeOutput = params.outputData || undefined; // undefined to skip if null
    const safeError = params.errorData || undefined;

    // Write prompt_text/completion_text to local file (default) instead of Supabase
    void writePromptsToFile(
      params.courseId,
      {
        stage: params.stage,
        phase: params.phase,
        stepName: params.stepName,
        lessonId: validLessonId,
      },
      params.promptText || null,
      params.completionText || null
    );

    const insertPayload: Database['public']['Tables']['generation_trace']['Insert'] = {
      course_id: params.courseId,
      lesson_id: validLessonId,
      stage: params.stage,
      phase: params.phase,
      step_name: params.stepName,
      input_data: safeInput,
      output_data: safeOutput,
      error_data: safeError,
      model_used: params.modelUsed || null,
      prompt_text: STORE_PROMPTS_IN_DB ? params.promptText || null : null,
      completion_text: STORE_PROMPTS_IN_DB ? params.completionText || null : null,
      tokens_used: params.tokensUsed || null,
      cost_usd: params.costUsd || null,
      temperature: params.temperature || null,
      duration_ms: params.durationMs,
      retry_attempt: params.retryAttempt || 0,
      was_cached: params.wasCached || false,
      quality_score: params.qualityScore || null,
    };

    const { error } = await supabase.from('generation_trace').insert(insertPayload);

    if (error) {
      logger.error({ error, params }, 'Failed to log generation trace');
    }
  } catch (err) {
    // Don't throw - logging should never crash the app
    logger.error({ err, params }, 'Exception in trace logging');
  }
}
