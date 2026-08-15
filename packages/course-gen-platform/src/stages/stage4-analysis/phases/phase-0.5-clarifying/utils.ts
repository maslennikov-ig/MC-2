import { getSupabaseAdmin } from '../../../../shared/supabase/admin.js';
import logger from '../../../../shared/logger/index.js';
import type { ClarifyingQuestionRow, UserAnswerValue } from '@megacampus/shared-types';
import type { ClarifyingQuestion } from './types.js';

/**
 * LLM timeout for clarifying questions generation in milliseconds.
 * Configurable via environment variable for different model latencies.
 */
export const LLM_CLARIFYING_TIMEOUT_MS = parseInt(
  process.env.LLM_CLARIFYING_TIMEOUT_MS || '1800000', // 30 min
  10
);

/**
 * Extract string representation from UserAnswerValue
 * Used for backwards compatibility with code expecting string answers
 *
 * @param answer - UserAnswerValue or string (for backwards compatibility)
 * @returns String representation of the answer
 */
export function extractAnswerString(answer: UserAnswerValue | string | null): string {
  if (!answer) return '';
  // Handle legacy string format
  if (typeof answer === 'string') return answer;
  // Handle JSONB format
  if (answer.value) return answer.value;
  if (answer.values && answer.values.length > 0) return answer.values.join(', ');
  return '';
}

/**
 * Truncate document content to stay within token budget.
 * Same pattern as phase-1-classifier.ts — 4:1 char-to-token ratio.
 */
export function truncateContent(content: string, maxTokens: number): string {
  const estimatedTokens = Math.ceil(content.length / 4);
  if (estimatedTokens <= maxTokens) return content;
  const maxChars = maxTokens * 4;
  return `${content.substring(0, maxChars)}\n[... truncated ...]`;
}

/**
 * Validate that question_type matches suggested_answers count
 *
 * MEDIUM-002 fix: Ensures structural consistency between question type and suggestions.
 *
 * Expected ranges:
 * - open: 2-3 suggestions (one recommendation + alternatives)
 * - single_choice: 2-4 mutually exclusive options
 * - multi_choice: 3-6 combinable options
 *
 * @param question - Question to validate
 * @returns true if valid, logs warning if mismatch but continues
 */
export function validateQuestionTypeSuggestions(question: ClarifyingQuestion): boolean {
  const type = question.question_type || 'open';
  const count = question.suggested_answers.length;

  const expectedRanges: Record<string, { min: number; max: number }> = {
    open: { min: 2, max: 3 },
    single_choice: { min: 2, max: 4 },
    multi_choice: { min: 3, max: 6 },
  };

  const range = expectedRanges[type];
  if (!range) {
    logger.warn({ questionType: type }, 'Unknown question type, skipping validation');
    return true;
  }

  if (count < range.min || count > range.max) {
    logger.warn(
      {
        questionText: question.question_text.substring(0, 50),
        questionType: type,
        suggestionCount: count,
        expectedMin: range.min,
        expectedMax: range.max,
      },
      'Question type / suggestion count mismatch - consider reviewing'
    );
    // Don't throw - let the question through with a warning
    // The UI can handle any count, this is just a quality signal
  }

  return true;
}

/**
 * Store clarifying questions in database
 *
 * @param courseId - Course UUID
 * @param questions - Generated questions from LLM
 * @param iterationRound - Clarifying round (1-3)
 * @returns Promise<void>
 */
export async function storeQuestions(
  courseId: string,
  questions: ClarifyingQuestion[],
  iterationRound: number
): Promise<void> {
  const supabase = getSupabaseAdmin();

  // MEDIUM-002: Validate question type vs suggestion count
  questions.forEach(validateQuestionTypeSuggestions);

  // Build insert data
  const rows = questions.map((q, index) => ({
    course_id: courseId,
    question_text: q.question_text,
    question_type: q.question_type || 'open', // Default to 'open' for backwards compatibility
    question_priority: q.question_priority,
    question_category: q.question_category,
    suggested_answers: q.suggested_answers,
    iteration_round: iterationRound,
    status: 'pending' as const,
    order_index: index,
    metadata: {},
  }));

  // Insert all questions in batch
  const { error } = await supabase.from('clarifying_questions').insert(rows);

  if (error) {
    throw new Error(`Failed to store clarifying questions: ${error.message}`);
  }

  logger.info(
    {
      courseId,
      questionCount: questions.length,
      iterationRound,
    },
    'Clarifying questions stored in database'
  );
}

/**
 * Get pending questions for a course
 *
 * Retrieves questions that need user answers (status: pending).
 * Used by orchestrator to check if clarifying phase should pause.
 *
 * @param courseId - Course UUID
 * @returns Promise<ClarifyingQuestionRow[]> - Pending questions
 */
export async function getPendingQuestions(courseId: string): Promise<ClarifyingQuestionRow[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('clarifying_questions')
    .select('*')
    .eq('course_id', courseId)
    .eq('status', 'pending')
    .order('order_index');

  if (error) {
    throw new Error(`Failed to fetch pending questions: ${error.message}`);
  }

  return (data || []) as ClarifyingQuestionRow[];
}

/**
 * Get answered questions for a course
 *
 * Retrieves questions with user answers (status: answered).
 * Used by Phase 2+ to inject user preferences into analysis.
 *
 * @param courseId - Course UUID
 * @returns Promise<ClarifyingQuestionRow[]> - Answered questions
 */
export async function getAnsweredQuestions(courseId: string): Promise<ClarifyingQuestionRow[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('clarifying_questions')
    .select('*')
    .eq('course_id', courseId)
    .eq('status', 'answered')
    .order('order_index');

  if (error) {
    throw new Error(`Failed to fetch answered questions: ${error.message}`);
  }

  return (data || []) as ClarifyingQuestionRow[];
}

/**
 * Get clarifying configuration for a course
 *
 * Determines if clarifying questions are enabled, if they've been skipped,
 * and whether the course is in automatic mode (for self-reflection).
 * Used by orchestrator to decide whether to run Phase 0.5.
 *
 * @param courseId - Course UUID
 * @returns Promise<{ enabled: boolean; skipped: boolean; isAutomatic: boolean }> - Configuration
 */
export async function getClarifyingConfig(
  courseId: string
): Promise<{ enabled: boolean; skipped: boolean; isAutomatic: boolean }> {
  const supabase = getSupabaseAdmin();

  // Check if course has settings.clarifying_questions_enabled and generation_mode
  const { data: course, error } = await supabase
    .from('courses')
    .select('settings, generation_mode')
    .eq('id', courseId)
    .single();

  if (error) {
    logger.warn(
      { courseId, error: error.message },
      'Failed to fetch clarifying config, defaulting to disabled'
    );
    return { enabled: false, skipped: false, isAutomatic: false };
  }

  const settings = (course?.settings as Record<string, unknown>) || {};
  const enabled = (settings.clarifying_questions_enabled as boolean) || false;
  const skipped = (settings.clarifying_questions_skipped as boolean) || false;
  const isAutomatic = course?.generation_mode === 'automatic';

  return { enabled, skipped, isAutomatic };
}

/**
 * RPC response type for auto_answer_questions_atomic function
 */
interface AutoAnswerRpcResponse {
  success: boolean;
  updated_count: number;
  fallback_count: number;
  total_pending: number;
  answered_at?: string;
  error?: string;
  code?: string;
  message?: string;
}

/**
 * Auto-answer all pending questions with first suggested answer
 *
 * Used in automatic mode for self-reflection without user input.
 * The AI generates questions and automatically selects the first
 * suggested answer for each question.
 *
 * @param courseId - Course UUID
 * @returns Promise<number> - Count of auto-answered questions
 * @throws Error if RPC call fails critically
 */
export async function autoAnswerAllQuestions(courseId: string): Promise<number> {
  const supabase = getSupabaseAdmin();

  // Use atomic RPC function for transaction safety
  const { data, error } = await supabase.rpc('auto_answer_questions_atomic', {
    p_course_id: courseId,
  });

  if (error) {
    logger.error(
      { courseId, error: error.message, code: error.code },
      'RPC auto_answer_questions_atomic failed'
    );
    throw new Error(`Failed to auto-answer questions: ${String(error.message)}`);
  }

  const result = data as unknown as AutoAnswerRpcResponse;

  if (!result.success) {
    logger.error(
      {
        courseId,
        error: result.error,
        code: result.code,
        totalPending: result.total_pending,
      },
      'Auto-answer atomic operation failed'
    );
    // The function's own sentence says nothing; what the database said does.
    const said = [result.code, result.message].filter(Boolean).join(' ');
    throw new Error(
      `Auto-answer failed: ${result.error || 'Unknown error'}${said ? ` (database said: ${said})` : ''}`
    );
  }

  // Log success with statistics
  if (result.updated_count === 0) {
    logger.debug({ courseId }, 'No pending questions to auto-answer');
  } else {
    logger.info(
      {
        courseId,
        answeredCount: result.updated_count,
        fallbackCount: result.fallback_count,
        totalPending: result.total_pending,
        answeredAt: result.answered_at,
      },
      'Auto-answered clarifying questions in automatic mode (atomic)'
    );
  }

  return result.updated_count;
}
