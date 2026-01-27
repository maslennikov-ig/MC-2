/**
 * Phase 0.5: Clarifying Questions
 *
 * Generates smart questions based on course context to gather user preferences.
 * Runs after Budget Allocation, before Phase 1 (Classification).
 *
 * Key Features:
 * - Generates 3-7 context-aware questions with priorities
 * - Provides suggested answers with rationale
 * - Stores questions in clarifying_questions table
 * - Supports 2-round iteration for refinement
 * - Integrates with Budget Allocator for condensed context
 *
 * Model: Configured via database (llm_model_config table, phase: stage_4_clarifying)
 * Output Language: Matches course language
 * Quality: Zod validation + structured logging
 *
 * @module phase-0.5-clarifying
 */

import { z } from 'zod';
import { getModelForPhase } from '@/shared/llm/langchain-models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { logTrace } from '@/shared/trace-logger';
import logger from '@/shared/logger';
import { safeJSONParse } from '@/shared/utils/json-repair';
import type { Stage4BudgetAllocation } from './stage4-budget-allocator';
import type { ClarifyingQuestionRow, UserAnswerValue } from '@megacampus/shared-types';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * LLM timeout for clarifying questions generation in milliseconds.
 * Configurable via environment variable for different model latencies.
 */
export const LLM_CLARIFYING_TIMEOUT_MS = parseInt(
  process.env.LLM_CLARIFYING_TIMEOUT_MS || '300000',
  10
);

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Question type determines UI rendering and answer validation
 * - open: Free text with AI recommendation
 * - single_choice: Select one option (radio buttons)
 * - multi_choice: Select multiple options (checkboxes)
 */
export const QuestionTypeSchema = z.enum(['open', 'single_choice', 'multi_choice']);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;

/**
 * Suggested answer for a clarifying question
 */
export const SuggestedAnswerSchema = z.object({
  text: z.string().min(5).max(500),
  rationale: z.string().min(10).max(300),
  is_recommended: z.boolean().optional(), // For open type: marks the AI-recommended answer
});

export type SuggestedAnswer = z.infer<typeof SuggestedAnswerSchema>;

/**
 * Single clarifying question with metadata
 *
 * Question types:
 * - open: AI provides a recommendation, user can accept, modify, or write custom
 * - single_choice: User selects ONE option from suggested answers
 * - multi_choice: User selects MULTIPLE options from suggested answers
 */
export const ClarifyingQuestionSchema = z.object({
  question_text: z.string().min(10).max(500),
  question_type: QuestionTypeSchema.default('open'),
  question_priority: z.enum(['critical', 'important', 'nice_to_have']),
  question_category: z.string().min(3).max(50),
  suggested_answers: z.array(SuggestedAnswerSchema).min(2).max(6), // Increased max to 6 for multi_choice
});

export type ClarifyingQuestion = z.infer<typeof ClarifyingQuestionSchema>;

/**
 * LLM output schema for clarifying questions generation
 */
export const ClarifyingOutputSchema = z.object({
  questions: z.array(ClarifyingQuestionSchema).min(3).max(7),
});

export type ClarifyingOutput = z.infer<typeof ClarifyingOutputSchema>;

// ============================================================================
// INPUT SCHEMA
// ============================================================================

/**
 * Previous answer schema for round 2
 */
const PreviousAnswerSchema = z.object({
  question_text: z.string().min(1),
  user_answer: z.string().min(1),
});

/**
 * Course context schema
 */
const CourseContextSchema = z.object({
  title: z.string().min(1, 'Course title is required'),
  description: z.string().optional(),
  target_audience: z.string().optional(),
});

/**
 * Input schema for Phase 0.5 Clarifying Questions
 *
 * Runtime validation ensures data integrity at module boundary.
 * budgetAllocation uses z.custom() since it's validated in its own module.
 */
export const Phase05InputSchema = z.object({
  /** Course UUID */
  course_id: z.string().uuid('Invalid course UUID'),

  /** Budget allocation from Stage 4 budget allocator (validated in its module) */
  budgetAllocation: z.custom<Stage4BudgetAllocation>(
    val => val !== null && typeof val === 'object' && 'documents' in val,
    { message: 'Invalid budget allocation object' }
  ),

  /** Course context */
  courseContext: CourseContextSchema,

  /** Language code (ISO 639-1) */
  language: z.string().min(2).max(5),

  /** Iteration round (1 or 2, max 2 rounds allowed) */
  iterationRound: z.union([z.literal(1), z.literal(2)]),

  /** Previous answers from round 1 (only for round 2) */
  previousAnswers: z.array(PreviousAnswerSchema).optional(),
});

export type Phase05Input = z.infer<typeof Phase05InputSchema>;

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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build condensed context from budget allocation
 *
 * Creates a compact summary of document context for prompt injection.
 * Similar to pattern used in other phases for token-aware context building.
 *
 * @param budgetAllocation - Stage 4 budget allocation result
 * @returns Condensed context string
 */
function buildCondensedContext(budgetAllocation: Stage4BudgetAllocation): string {
  const { documents, breakdown } = budgetAllocation;

  const contextParts: string[] = [];

  // Summary of document coverage
  contextParts.push(`Documents Available: ${documents.length} total`);
  contextParts.push(
    `- CORE: ${breakdown.core.count} document (${breakdown.core.tokens} tokens, full text)`
  );
  contextParts.push(
    `- IMPORTANT: ${breakdown.important.count} documents (${breakdown.important.fullTextCount} full text, ${breakdown.important.summaryCount} summaries)`
  );
  contextParts.push(`- SUPPLEMENTARY: ${breakdown.supplementary.count} documents (summaries only)`);

  // Model selection
  contextParts.push(`\nModel: ${budgetAllocation.modelSelection.modelId}`);
  contextParts.push(`Context Budget: ${budgetAllocation.totalTokens.toLocaleString()} tokens`);

  return contextParts.join('\n');
}

/**
 * Build prompt for clarifying questions generation
 *
 * Uses prompt template from database (prompt_templates table, key: stage_4/clarifying_questions)
 * Implements variable substitution with Handlebars-style syntax.
 *
 * @param input - Phase 0.5 input data
 * @returns Prompt messages for LLM
 */
function buildClarifyingPrompt(input: Phase05Input): [SystemMessage, HumanMessage] {
  const { courseContext, language, budgetAllocation, iterationRound, previousAnswers } = input;

  // Build condensed context from budget allocation
  const condensedContext = buildCondensedContext(budgetAllocation);

  // Build previous answers section (for round 2)
  let previousAnswersText = '';
  if (iterationRound === 2 && previousAnswers && previousAnswers.length > 0) {
    previousAnswersText = previousAnswers
      .map((ans, idx) => `Q${idx + 1}: ${ans.question_text}\nA: ${ans.user_answer}`)
      .join('\n\n');
  }

  // System message with role and constraints
  const systemMessage = new SystemMessage(
    `You are an expert course designer helping to create a tailored learning experience.

Your task is to generate clarifying questions that will help improve the course design based on the provided context.

CRITICAL RULES:
1. ALL output MUST be in ${language.toUpperCase()} (the course target language)
2. You MUST respond with valid JSON matching this EXACT schema:

{
  "questions": [
    {
      "question_text": "string (10-500 chars)",
      "question_type": "open|single_choice|multi_choice",
      "question_priority": "critical|important|nice_to_have",
      "question_category": "audience|content|depth|format|outcome|tool",
      "suggested_answers": [
        { "text": "string (5-500 chars)", "rationale": "string (10-300 chars)", "is_recommended": boolean }
      ]
    }
  ]
}

3. Generate 3-7 questions total
4. QUESTION TYPES - choose the optimal type for each question:
   - "open": When answer requires free-form text (e.g., specific goals, unique requirements)
     * MUST mark exactly ONE answer as "is_recommended": true
     * 2-3 suggested answers as starting points
   - "single_choice": When user must choose ONE option (e.g., difficulty level, format preference)
     * First answer = recommended option
     * 2-4 mutually exclusive options
   - "multi_choice": When user can select MULTIPLE options (e.g., topics to cover, features to include)
     * Mark recommended options with "is_recommended": true
     * 3-6 options that can be combined
5. Prioritize questions as:
   - critical: Must be answered for quality course (e.g., target skill level, key outcomes)
   - important: Will significantly improve course (e.g., preferred learning style, time constraints)
   - nice_to_have: Optional enhancements (e.g., specific tools/technologies preferences)
6. Focus on questions that cannot be inferred from the provided context
7. Avoid generic questions - be specific to this course topic`
  );

  // Human message with course context
  const humanMessage = new HumanMessage(
    `COURSE CONTEXT:
Title: ${courseContext.title}
${courseContext.description ? `Description: ${courseContext.description}` : ''}
Target Audience: ${courseContext.target_audience || 'mixed'}
Language: ${language.toUpperCase()}

DOCUMENT CONTEXT (condensed):
${condensedContext}

${previousAnswersText ? `PREVIOUS ROUND ANSWERS:\n${previousAnswersText}\n\n` : ''}
TASK:
Generate 3-7 clarifying questions that will help create a better course.
${iterationRound === 2 ? 'Build on the answers from round 1 to ask more specific follow-up questions.' : ''}

Output MUST be valid JSON with all text fields in ${language.toUpperCase()}.`
  );

  return [systemMessage, humanMessage];
}

/**
 * Store clarifying questions in database
 *
 * Inserts generated questions into clarifying_questions table.
 * Uses Supabase admin client for service-level access.
 *
 * @param courseId - Course UUID
 * @param questions - Generated questions from LLM
 * @param iterationRound - Round number (1 or 2)
 * @returns Promise<void>
 */
async function storeQuestions(
  courseId: string,
  questions: ClarifyingQuestion[],
  iterationRound: number
): Promise<void> {
  const supabase = getSupabaseAdmin();

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

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Run Phase 0.5: Clarifying Questions
 *
 * Generates smart questions based on course context to gather user preferences.
 *
 * Workflow:
 * 1. Build condensed context from budget allocation
 * 2. Get model from database config (phase: stage_4_clarifying)
 * 3. Build prompt with course context + document context
 * 4. Invoke LLM to generate questions
 * 5. Validate output with Zod schema
 * 6. Store questions in clarifying_questions table
 * 7. Log trace data for observability
 *
 * @param input - Phase 0.5 input data
 * @returns Promise<ClarifyingOutput> - Generated questions with metadata
 * @throws Error if LLM invocation or validation fails
 *
 * @example
 * const result = await runPhase05Clarifying({
 *   course_id: '550e8400-e29b-41d4-a716-446655440000',
 *   budgetAllocation: { ... },
 *   courseContext: { title: 'Python for Beginners', target_audience: 'beginner' },
 *   language: 'ru',
 *   iterationRound: 1,
 * });
 */
export async function runPhase05Clarifying(rawInput: Phase05Input): Promise<ClarifyingOutput> {
  // =================================================================
  // STEP 0: Validate input at module boundary
  // =================================================================
  const parseResult = Phase05InputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    const errorMessage = parseResult.error.issues
      .map(i => `${i.path.join('.')}: ${i.message}`)
      .join(', ');
    throw new Error(`Invalid Phase 0.5 input: ${errorMessage}`);
  }
  const input = parseResult.data;

  const { course_id: courseId, language, iterationRound } = input;
  const startTime = Date.now();

  const phaseLogger = logger.child({
    courseId,
    phase: 'phase_0.5_clarifying',
    iterationRound,
  });

  phaseLogger.info('Starting Phase 0.5: Clarifying Questions');

  try {
    // =================================================================
    // STEP 1: Get model from database config
    // =================================================================
    const model = await getModelForPhase('stage_4_clarifying', courseId, undefined, language);
    const modelId = model.model || 'unknown';

    phaseLogger.debug({ modelId }, 'Model selected for clarifying questions generation');

    // =================================================================
    // STEP 2: Build prompt
    // =================================================================
    const [systemMsg, humanMsg] = buildClarifyingPrompt(input);
    const promptMessages = [systemMsg, humanMsg];

    phaseLogger.debug('Prompt built with course context and document context');

    // =================================================================
    // STEP 3: Invoke LLM with timeout protection
    // =================================================================
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      phaseLogger.warn({ timeoutMs: LLM_CLARIFYING_TIMEOUT_MS }, 'LLM call timed out, aborting');
    }, LLM_CLARIFYING_TIMEOUT_MS);

    let response;
    try {
      response = await model.invoke(promptMessages, {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
    const rawOutput = response.content as string;

    phaseLogger.debug(
      { outputLength: rawOutput.length },
      'LLM response received for clarifying questions'
    );

    // Log trace data for observability
    const promptText = promptMessages
      .map(m => `${m._getType().toUpperCase()}:\n${m.content}`)
      .join('\n\n');

    await logTrace({
      courseId,
      stage: 'stage_4',
      phase: 'stage_4_clarifying',
      stepName: 'generate_questions',
      inputData: {
        title: input.courseContext.title,
        language,
        iterationRound,
        documentCount: input.budgetAllocation.documents.length,
      },
      promptText,
      completionText: rawOutput,
      modelUsed: modelId,
      durationMs: Date.now() - startTime,
    });

    // =================================================================
    // STEP 4: Parse and validate output (with JSON repair)
    // =================================================================
    let parsedOutput: unknown;
    try {
      // safeJSONParse includes: markdown extraction, jsonrepair library, 4-level custom repair
      parsedOutput = safeJSONParse(rawOutput);
    } catch (parseError) {
      phaseLogger.error(
        {
          error: parseError instanceof Error ? parseError.message : String(parseError),
          rawOutputPreview: rawOutput.substring(0, 500),
        },
        'Failed to parse LLM output as JSON after repair attempts'
      );
      throw new Error(
        `JSON parsing failed: ${parseError instanceof Error ? parseError.message : String(parseError)}`
      );
    }

    // Validate with Zod
    const validationResult = ClarifyingOutputSchema.safeParse(parsedOutput);

    if (!validationResult.success) {
      phaseLogger.error(
        {
          errors: validationResult.error.errors,
          rawOutputPreview: rawOutput.substring(0, 500),
        },
        'LLM output failed Zod validation'
      );
      throw new Error(`Validation failed: ${validationResult.error.message}`);
    }

    const output = validationResult.data;

    phaseLogger.debug(
      {
        questionCount: output.questions.length,
        criticalCount: output.questions.filter(q => q.question_priority === 'critical').length,
        importantCount: output.questions.filter(q => q.question_priority === 'important').length,
        niceToHaveCount: output.questions.filter(q => q.question_priority === 'nice_to_have')
          .length,
      },
      'Clarifying questions validated successfully'
    );

    // =================================================================
    // STEP 5: Store questions in database
    // =================================================================
    await storeQuestions(courseId, output.questions, iterationRound);

    // =================================================================
    // STEP 6: Log final trace
    // =================================================================
    const endTime = Date.now();

    await logTrace({
      courseId,
      stage: 'stage_4',
      phase: 'stage_4_clarifying',
      stepName: 'complete',
      outputData: {
        questionCount: output.questions.length,
        priorities: {
          critical: output.questions.filter(q => q.question_priority === 'critical').length,
          important: output.questions.filter(q => q.question_priority === 'important').length,
          nice_to_have: output.questions.filter(q => q.question_priority === 'nice_to_have').length,
        },
      },
      durationMs: endTime - startTime,
    });

    phaseLogger.info(
      { durationMs: endTime - startTime, questionCount: output.questions.length },
      'Phase 0.5: Clarifying Questions completed successfully'
    );

    return output;
  } catch (error) {
    const endTime = Date.now();

    phaseLogger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        durationMs: endTime - startTime,
      },
      'Phase 0.5: Clarifying Questions failed'
    );

    await logTrace({
      courseId,
      stage: 'stage_4',
      phase: 'stage_4_clarifying',
      stepName: 'failed',
      errorData: {
        error: error instanceof Error ? error.message : String(error),
      },
      durationMs: endTime - startTime,
    });

    throw error;
  }
}

// ============================================================================
// DATABASE QUERY HELPERS
// ============================================================================

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
 * Used by Phase 1+ to inject user preferences into analysis.
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
 * Implementation: Uses atomic RPC function (auto_answer_questions_atomic)
 * to ensure all-or-nothing updates. If any update fails, the entire
 * transaction rolls back - no partial state.
 *
 * @param courseId - Course UUID
 * @returns Promise<number> - Count of auto-answered questions
 * @throws Error if RPC call fails critically
 */
export async function autoAnswerAllQuestions(courseId: string): Promise<number> {
  const supabase = getSupabaseAdmin();

  // Use atomic RPC function for transaction safety
  // This ensures all questions are updated or none are (rollback on failure)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('auto_answer_questions_atomic', {
    p_course_id: courseId,
  });

  if (error) {
    logger.error(
      { courseId, error: error.message, code: error.code },
      'RPC auto_answer_questions_atomic failed'
    );
    throw new Error(`Failed to auto-answer questions: ${error.message}`);
  }

  const result = data as AutoAnswerRpcResponse;

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
    throw new Error(`Auto-answer failed: ${result.error || 'Unknown error'}`);
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
