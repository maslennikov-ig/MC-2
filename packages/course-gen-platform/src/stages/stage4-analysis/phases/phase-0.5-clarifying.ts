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
import type { Stage4BudgetAllocation } from './stage4-budget-allocator';

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Suggested answer for a clarifying question
 */
export const SuggestedAnswerSchema = z.object({
  text: z.string().min(5).max(500),
  rationale: z.string().min(10).max(300),
});

export type SuggestedAnswer = z.infer<typeof SuggestedAnswerSchema>;

/**
 * Single clarifying question with metadata
 */
export const ClarifyingQuestionSchema = z.object({
  question_text: z.string().min(10).max(500),
  question_priority: z.enum(['critical', 'important', 'nice_to_have']),
  question_category: z.string().min(3).max(50),
  suggested_answers: z.array(SuggestedAnswerSchema).min(2).max(4),
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
// INPUT TYPES
// ============================================================================

/**
 * Input data for Phase 0.5 Clarifying Questions
 */
export interface Phase05Input {
  /** Course UUID */
  course_id: string;

  /** Budget allocation from Stage 4 budget allocator */
  budgetAllocation: Stage4BudgetAllocation;

  /** Course context */
  courseContext: {
    title: string;
    description?: string;
    target_audience?: string;
  };

  /** Language code (ISO 639-1) */
  language: string;

  /** Iteration round (1 or 2, max 2 rounds allowed) */
  iterationRound: 1 | 2;

  /** Previous answers from round 1 (only for round 2) */
  previousAnswers?: Array<{
    question_text: string;
    user_answer: string;
  }>;
}

/**
 * Database row type for clarifying_questions table
 */
export interface ClarifyingQuestionRow {
  id: string;
  course_id: string;
  question_text: string;
  question_priority: 'critical' | 'important' | 'nice_to_have';
  question_category: string;
  suggested_answers: SuggestedAnswer[];
  user_answer: string | null;
  answer_source: 'suggested' | 'modified' | 'custom' | null;
  selected_suggestion_index: number | null;
  user_modification: string | null;
  iteration_round: number;
  status: 'pending' | 'answered' | 'skipped';
  order_index: number;
  created_at: string;
  answered_at: string | null;
  metadata: Record<string, unknown>;
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
      "question_priority": "critical|important|nice_to_have",
      "question_category": "audience|content|depth|format|outcome|tool",
      "suggested_answers": [
        { "text": "string (5-500 chars)", "rationale": "string (10-300 chars)" }
      ]
    }
  ]
}

3. Generate 3-7 questions total
4. Each question MUST have 2-4 suggested answers
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
export async function runPhase05Clarifying(input: Phase05Input): Promise<ClarifyingOutput> {
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

    phaseLogger.info({ modelId }, 'Model selected for clarifying questions generation');

    // =================================================================
    // STEP 2: Build prompt
    // =================================================================
    const [systemMsg, humanMsg] = buildClarifyingPrompt(input);
    const promptMessages = [systemMsg, humanMsg];

    phaseLogger.debug('Prompt built with course context and document context');

    // =================================================================
    // STEP 3: Invoke LLM
    // =================================================================
    const response = await model.invoke(promptMessages);
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
    // STEP 4: Parse and validate output
    // =================================================================
    let parsedOutput: unknown;
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = rawOutput.match(/```json\s*\n?([\s\S]*?)\n?```/);
      const jsonText = jsonMatch ? jsonMatch[1] : rawOutput;

      parsedOutput = JSON.parse(jsonText);
    } catch (parseError) {
      phaseLogger.error(
        {
          error: parseError instanceof Error ? parseError.message : String(parseError),
          rawOutputPreview: rawOutput.substring(0, 500),
        },
        'Failed to parse LLM output as JSON'
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

    phaseLogger.info(
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
 * Determines if clarifying questions are enabled and if they've been skipped.
 * Used by orchestrator to decide whether to run Phase 0.5.
 *
 * @param courseId - Course UUID
 * @returns Promise<{ enabled: boolean; skipped: boolean }> - Configuration
 */
export async function getClarifyingConfig(
  courseId: string
): Promise<{ enabled: boolean; skipped: boolean }> {
  const supabase = getSupabaseAdmin();

  // Check if course has settings.clarifying_questions_enabled
  const { data: course, error } = await supabase
    .from('courses')
    .select('settings')
    .eq('id', courseId)
    .single();

  if (error) {
    logger.warn(
      { courseId, error: error.message },
      'Failed to fetch clarifying config, defaulting to disabled'
    );
    return { enabled: false, skipped: false };
  }

  const settings = (course?.settings as Record<string, unknown>) || {};
  const enabled = (settings.clarifying_questions_enabled as boolean) || false;
  const skipped = (settings.clarifying_questions_skipped as boolean) || false;

  return { enabled, skipped };
}
