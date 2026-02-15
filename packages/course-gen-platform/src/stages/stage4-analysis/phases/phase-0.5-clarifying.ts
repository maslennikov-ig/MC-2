/**
 * Phase 0.5: Clarifying Questions
 *
 * Generates smart questions based on course context and Phase 1 classification data.
 * Runs after Phase 1 (Classification), before Phase 2 (Scope).
 *
 * Key Features:
 * - Generates 3-20 context-aware questions with data-driven priorities
 * - Uses Phase 1 output (missing_elements, completeness, key_concepts) for targeted questions
 * - Provides suggested answers with rationale
 * - Stores questions in clarifying_questions table
 * - Integrates with Budget Allocator for condensed context
 *
 * Model: Configured via database (llm_model_config table, phase: stage_4_clarifying)
 * Output Language: Matches course language
 * Quality: Zod validation + structured logging
 *
 * @module phase-0.5-clarifying
 */

import { z } from 'zod';
import { getModelForPhase, getTextContent } from '@/shared/llm/langchain-models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { logTrace } from '@/shared/trace-logger';
import logger from '@/shared/logger';
import { safeJSONParse } from '@/shared/utils/json-repair';
import type { Stage4BudgetAllocation } from './stage4-budget-allocator';
import { createLLMEnumSchema } from '@megacampus/shared-types';
import type { ClarifyingQuestionRow, UserAnswerValue } from '@megacampus/shared-types';
import type { Phase1Output } from '@megacampus/shared-types/analysis-result';

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
  rationale: z.string().min(10).max(300).default('Auto-generated rationale for this answer option'),
  is_recommended: z.boolean().optional(), // For open type: marks the AI-recommended answer
});

export type SuggestedAnswer = z.infer<typeof SuggestedAnswerSchema>;

/**
 * Normalize a single suggested answer from LLM output.
 * Handles strings, arrays, and malformed objects that LLMs sometimes produce.
 */
function normalizeSuggestedAnswer(val: unknown): unknown {
  if (val && typeof val === 'object' && !Array.isArray(val) && 'text' in val) {
    const obj = val as Record<string, unknown>;
    // Ensure rationale exists — LLMs sometimes omit it
    if (!obj.rationale || typeof obj.rationale !== 'string' || obj.rationale.length < 10) {
      return {
        ...obj,
        rationale:
          obj.rationale && typeof obj.rationale === 'string'
            ? `${obj.rationale} (auto-completed rationale)`
            : 'Auto-generated rationale for this answer option',
      };
    }
    return val;
  }
  if (typeof val === 'string' && val.trim().length > 0) {
    const text = val.length >= 5 ? val : `${val} (вариант ответа)`;
    return { text, rationale: 'Auto-generated rationale', is_recommended: false };
  }
  if (Array.isArray(val) && val.length > 0) {
    const raw = String(val[0]);
    const text = raw.length >= 5 ? raw : `${raw} (вариант ответа)`;
    return { text, rationale: 'Auto-generated rationale', is_recommended: false };
  }
  return null;
}

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
  question_type: z.preprocess(
    val => (val === null || val === undefined ? undefined : val),
    QuestionTypeSchema.default('open')
  ),
  question_priority: z.preprocess(
    val => (val === null || val === undefined ? 'important' : val),
    createLLMEnumSchema(
      ['critical', 'important', 'nice_to_have'] as const,
      {
        essential: 'critical',
        'must-have': 'critical',
        urgent: 'critical',
        high: 'critical',
        mandatory: 'critical',
        significant: 'important',
        needed: 'important',
        medium: 'important',
        useful: 'important',
        optional: 'nice_to_have',
        low: 'nice_to_have',
        bonus: 'nice_to_have',
        supplementary: 'nice_to_have',
        extra: 'nice_to_have',
      },
      'questionPriority'
    )
  ),
  question_category: z.preprocess(
    val => (val === null || val === undefined ? 'content_structure' : val),
    createLLMEnumSchema(
      [
        'company_context',
        'audience',
        'expected_outcomes',
        'content_structure',
        'focus_priorities',
        'business_goals',
        'practical_application',
        'constraints',
      ] as const,
      {
        company: 'company_context',
        organization: 'company_context',
        corporate: 'company_context',
        employer: 'company_context',
        learners: 'audience',
        students: 'audience',
        users: 'audience',
        target: 'audience',
        outcomes: 'expected_outcomes',
        results: 'expected_outcomes',
        goals: 'expected_outcomes',
        objectives: 'expected_outcomes',
        structure: 'content_structure',
        format: 'content_structure',
        layout: 'content_structure',
        arrangement: 'content_structure',
        focus: 'focus_priorities',
        priorities: 'focus_priorities',
        emphasis: 'focus_priorities',
        key_areas: 'focus_priorities',
        business: 'business_goals',
        commercial: 'business_goals',
        revenue: 'business_goals',
        roi: 'business_goals',
        practical: 'practical_application',
        'hands-on': 'practical_application',
        'real-world': 'practical_application',
        applied: 'practical_application',
        limits: 'constraints',
        restrictions: 'constraints',
        requirements: 'constraints',
        boundaries: 'constraints',
      },
      'questionCategory'
    )
  ),
  suggested_answers: z.preprocess(val => {
    if (val === null || val === undefined) return [];
    if (!Array.isArray(val)) return val;
    return val
      .map(normalizeSuggestedAnswer)
      .filter(a => a !== null)
      .slice(0, 6);
  }, z.array(SuggestedAnswerSchema).min(2).max(6)),
});

export type ClarifyingQuestion = z.infer<typeof ClarifyingQuestionSchema>;

/**
 * LLM output schema for clarifying questions generation
 */
export const ClarifyingOutputSchema = z.object({
  questions: z.array(ClarifyingQuestionSchema).min(3).max(50),
});

export type ClarifyingOutput = z.infer<typeof ClarifyingOutputSchema>;

// ============================================================================
// INPUT SCHEMA
// ============================================================================

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

  /** Budget allocation from Stage 4 budget allocator (nullable when no documents) */
  budgetAllocation: z
    .custom<Stage4BudgetAllocation | null>(
      val => val === null || (typeof val === 'object' && 'documents' in val),
      { message: 'Invalid budget allocation object' }
    )
    .nullable(),

  /** Course context */
  courseContext: CourseContextSchema,

  /** Language code (ISO 639-1) */
  language: z.string().min(2).max(5),

  /** Document summaries from Stage 3 (reused from orchestrator, no extra DB calls) */
  document_summaries: z
    .array(
      z.object({
        file_name: z.string(),
        processed_content: z.string(),
      })
    )
    .optional(),

  /** Phase 1 classification output for data-driven question generation */
  phase1_output: z.custom<Phase1Output>().optional(),
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
 * Truncate document content to stay within token budget.
 * Same pattern as phase-1-classifier.ts — 4:1 char-to-token ratio.
 */
function truncateContent(content: string, maxTokens: number): string {
  const estimatedTokens = Math.ceil(content.length / 4);
  if (estimatedTokens <= maxTokens) return content;
  const maxChars = maxTokens * 4;
  return `${content.substring(0, maxChars)}\n[... truncated ...]`;
}

/**
 * Build condensed context from budget allocation and document content.
 *
 * Creates a compact summary of document context for prompt injection.
 * Includes actual document text (already budget-resolved by allocator) with safety truncation
 * to prevent extreme cases from breaking the LLM context.
 *
 * @param budgetAllocation - Stage 4 budget allocation result (nullable when no documents)
 * @param documentSummaries - Document content from Stage 3 (reused from orchestrator)
 * @returns Condensed context string
 */
function buildCondensedContext(
  budgetAllocation: Stage4BudgetAllocation | null,
  documentSummaries?: Array<{ file_name: string; processed_content: string }>
): string {
  // Handle case when no documents were uploaded
  if (!budgetAllocation) {
    return 'No documents provided. Course will be generated based on title and description only.';
  }

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

  // Actual document content (use per-document content as-is, already budget-resolved by allocator)
  // Safety truncation: per-doc limit + total limit across all documents
  if (documentSummaries && documentSummaries.length > 0) {
    const SAFETY_MAX_TOKENS_PER_DOC = 100_000;
    const SAFETY_MAX_TOTAL_TOKENS = 500_000;
    let totalTokensUsed = 0;
    contextParts.push('\nDOCUMENT CONTENTS:');
    for (const doc of documentSummaries) {
      const availableTokens = Math.min(
        SAFETY_MAX_TOKENS_PER_DOC,
        SAFETY_MAX_TOTAL_TOKENS - totalTokensUsed
      );
      if (availableTokens <= 0) {
        contextParts.push(
          `\n[TRUNCATED] Remaining documents omitted — total context limit (${SAFETY_MAX_TOTAL_TOKENS} tokens) reached.`
        );
        break;
      }
      const truncated = truncateContent(doc.processed_content, availableTokens);
      contextParts.push(`\n[${doc.file_name}]\n${truncated}`);
      // Estimate tokens used (same heuristic as truncateContent: 1 token ≈ 4 chars)
      totalTokensUsed += Math.ceil(truncated.length / 4);
    }
  }

  return contextParts.join('\n');
}

/**
 * Build preliminary analysis context from Phase 1 output
 * Provides data-driven context for smarter question generation
 */
function buildPhase1Context(phase1Output: Phase1Output): string {
  const { course_category, topic_analysis } = phase1Output;

  const parts: string[] = [];
  parts.push('PRELIMINARY ANALYSIS (from Phase 1 Classification):');
  parts.push(
    `- Course Category: ${course_category.primary} (confidence: ${(course_category.confidence * 100).toFixed(0)}%)`
  );
  parts.push(`- Topic Complexity: ${topic_analysis.complexity}`);
  parts.push(`- Information Completeness: ${topic_analysis.information_completeness}%`);

  if (topic_analysis.key_concepts.length > 0) {
    parts.push(`- Key Concepts Already Identified: ${topic_analysis.key_concepts.join(', ')}`);
  }

  if (
    Array.isArray(topic_analysis.missing_elements) &&
    topic_analysis.missing_elements.length > 0
  ) {
    parts.push(
      `- MISSING ELEMENTS (prioritize questions about these): ${topic_analysis.missing_elements.join(', ')}`
    );
  }

  // Priority guidance based on completeness
  const completeness = topic_analysis.information_completeness;
  if (completeness < 50) {
    parts.push(
      '\nPRIORITY GUIDANCE: Information completeness is LOW (<50%). Focus on CRITICAL questions that fill major knowledge gaps. Be thorough — cover all 8 category blocks with detailed questions.'
    );
  } else if (completeness < 80) {
    parts.push(
      '\nPRIORITY GUIDANCE: Information completeness is MODERATE (50-80%). Balance IMPORTANT questions across all category blocks. Ask targeted follow-ups where gaps exist.'
    );
  } else {
    parts.push(
      '\nPRIORITY GUIDANCE: Information completeness is HIGH (>80%). Focus on NICE_TO_HAVE refinement questions. Still ensure each category block has at least one question.'
    );
  }

  return parts.join('\n');
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
  const { courseContext, language, budgetAllocation, document_summaries, phase1_output } = input;

  // Build condensed context from budget allocation + document content
  const condensedContext = buildCondensedContext(budgetAllocation, document_summaries);

  // System message with role and constraints
  const systemMessage = new SystemMessage(
    `You are an expert course designer helping to create a tailored learning experience.

Your task is to generate clarifying questions that will help improve the course design based on the provided context.

PLATFORM: MegaCampus is an online course platform. Courses are always text-based lessons with optional enrichments (quiz, audio, video, presentation). The delivery format is fixed — do not ask about it.

CRITICAL RULES:
1. ALL output MUST be in ${language.toUpperCase()} (the course target language)
2. You MUST respond with valid JSON matching this EXACT schema:

{
  "questions": [
    {
      "question_text": "string (10-500 chars)",
      "question_type": "open|single_choice|multi_choice",
      "question_priority": "critical|important|nice_to_have",
      "question_category": "company_context|audience|expected_outcomes|content_structure|focus_priorities|business_goals|practical_application|constraints",
      "suggested_answers": [
        { "text": "string (5-500 chars)", "rationale": "string (10-300 chars)", "is_recommended": boolean }
      ]
    }
  ]
}

3. Generate as many questions as needed for complete understanding of the course requirements. Minimum 1 question per category block. No artificial upper limits — thoroughness is more important than brevity
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

   QUESTION TYPE SELECTION RULES:
   - Use "single_choice" when options are MUTUALLY EXCLUSIVE:
     * "What difficulty level?" (only one level possible)
     * "What format is preferred?" (one format)
     * "What language for the course?" (one language)
   - Use "multi_choice" when user can SELECT MULTIPLE:
     * "What topics to include?" (multiple topics)
     * "What metrics are important?" (multiple metrics)
     * "What tools to use?" (multiple tools)
     * HINT: If question uses plural form ("какие", "which ones", "welche") → multi_choice
   - Use "open" when answer requires FREE TEXT:
     * "Describe the target audience"
     * "What are the specific learning goals?"
5. Prioritize questions as:
   - critical: Must be answered for quality course (e.g., target skill level, key outcomes)
   - important: Will significantly improve course (e.g., preferred learning style, time constraints)
   - nice_to_have: Optional enhancements (e.g., specific tools/technologies preferences)
6. Focus on questions that cannot be inferred from the provided context
7. Avoid generic questions - be specific to this course topic
8. **MANDATORY COVERAGE**: Generate at least 1 question for EACH of the 8 category blocks:
   - company_context: Company description, industry, size, culture, existing training programs
   - audience: Target audience, roles, experience level, pain points, learning preferences
   - expected_outcomes: Measurable skills, competencies, certifications after course completion
   - content_structure: Required topics, modules, theses, case studies, depth of coverage
   - focus_priorities: Key competencies, emphasis areas, critical skills to develop
   - business_goals: ROI expectations, performance metrics, business objectives alignment
   - practical_application: Exercises, projects, real-world scenarios, hands-on activities
   - constraints: Time limits, budget, compliance requirements, technical limitations
9. Adjust question depth based on information completeness — ask more detailed questions where information gaps exist
10. Ensure questions from different categories get diverse priorities (not all critical)`
  );

  // Build Phase 1 context if available
  const phase1Context = phase1_output ? buildPhase1Context(phase1_output) : '';

  // Human message with course context
  const humanMessage = new HumanMessage(
    `COURSE CONTEXT:
Title: ${courseContext.title}
${courseContext.description ? `Description: ${courseContext.description}` : ''}
Target Audience: ${courseContext.target_audience || 'mixed'}
Language: ${language.toUpperCase()}
${phase1Context ? `\n${phase1Context}\n` : ''}
DOCUMENT CONTEXT (condensed):
${condensedContext}

TASK:
Generate comprehensive clarifying questions covering ALL 8 category blocks to fully understand the course requirements.
${phase1_output ? 'Use the PRELIMINARY ANALYSIS above to ask targeted questions about identified gaps and missing elements.' : ''}
Each category block (company_context, audience, expected_outcomes, content_structure, focus_priorities, business_goals, practical_application, constraints) MUST have at least 1 question.
Output MUST be valid JSON with all text fields in ${language.toUpperCase()}.`
  );

  return [systemMessage, humanMessage];
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
function validateQuestionTypeSuggestions(question: ClarifyingQuestion): boolean {
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
 * Inserts generated questions into clarifying_questions table.
 * Uses Supabase admin client for service-level access.
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

  const { course_id: courseId, language } = input;
  const startTime = Date.now();

  const phaseLogger = logger.child({
    courseId,
    phase: 'phase_0.5_clarifying',
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
    const rawOutput = getTextContent(response.content);

    phaseLogger.debug(
      { outputLength: rawOutput.length },
      'LLM response received for clarifying questions'
    );

    // Log trace data for observability
    const promptText = promptMessages
      .map(m => `${m._getType().toUpperCase()}:\n${getTextContent(m.content)}`)
      .join('\n\n');

    await logTrace({
      courseId,
      stage: 'stage_4',
      phase: 'stage_4_clarifying',
      stepName: 'generate_questions',
      inputData: {
        title: input.courseContext.title,
        language,
        documentCount: input.budgetAllocation?.documents.length ?? 0,
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

    // Defensive: filter out malformed questions before validation
    if (parsedOutput && typeof parsedOutput === 'object' && 'questions' in parsedOutput) {
      const raw = parsedOutput as { questions: unknown[] };
      if (Array.isArray(raw.questions)) {
        const originalCount = raw.questions.length;
        raw.questions = raw.questions.filter(
          q =>
            q &&
            typeof q === 'object' &&
            'question_text' in q &&
            typeof (q as Record<string, unknown>).question_text === 'string'
        );
        if (raw.questions.length < originalCount) {
          phaseLogger.warn(
            { originalCount, filteredCount: raw.questions.length },
            'Filtered out malformed questions without question_text from LLM output'
          );
        }
      }
    }

    // Validate with Zod (normalization of suggested_answers handled by z.preprocess in schema)
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
    await storeQuestions(courseId, output.questions, 1);

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

// ============================================================================
// SUFFICIENCY ANALYSIS FOR MULTI-ROUND CLARIFICATION
// ============================================================================

/**
 * Sufficiency verdict from LLM analysis of user answers
 */
export interface SufficiencyVerdict {
  /** Whether gathered information is sufficient to proceed */
  is_sufficient: boolean;
  /** Confidence level (0-1) */
  confidence: number;
  /** Identified information gaps */
  gaps: string[];
  /** Follow-up questions if not sufficient */
  follow_up_questions?: ClarifyingQuestion[];
}

const SufficiencyVerdictSchema = z.object({
  is_sufficient: z.boolean(),
  confidence: z.number().min(0).max(1),
  gaps: z.array(z.string()),
  follow_up_questions: z.array(ClarifyingQuestionSchema).optional(),
});

const SUFFICIENCY_SYSTEM_PROMPT = `You are an expert course designer evaluating whether enough information has been gathered to create a high-quality course.

Analyze the user's answers to clarifying questions and determine if the information is SUFFICIENT to proceed with course design.

CRITICAL RULES:
1. Respond with valid JSON matching this schema:
{
  "is_sufficient": boolean,
  "confidence": number (0-1),
  "gaps": ["string array of identified information gaps"],
  "follow_up_questions": [
    {
      "question_text": "string (10-500 chars)",
      "question_type": "open|single_choice|multi_choice",
      "question_priority": "critical|important|nice_to_have",
      "question_category": "company_context|audience|expected_outcomes|content_structure|focus_priorities|business_goals|practical_application|constraints",
      "suggested_answers": [{ "text": "string", "rationale": "string", "is_recommended": boolean }]
    }
  ]
}

2. Set is_sufficient=true if you have enough information to design a comprehensive course
3. Set is_sufficient=false if there are SIGNIFICANT gaps that would lead to poor course quality
4. If not sufficient, generate follow_up_questions targeting the specific gaps
5. Be pragmatic — minor gaps are OK. Focus on information that would MATERIALLY change the course design`;

/**
 * Analyze sufficiency of user answers and generate follow-up questions if needed.
 *
 * @param input - Phase 0.5 input data
 * @param answeredQuestions - All answered questions from current and previous rounds
 * @param currentRound - Current round number (1 or 2)
 * @returns SufficiencyVerdict with potential follow-up questions
 */
export async function analyzeSufficiency(
  input: Phase05Input,
  answeredQuestions: Array<{ question: string; answer: string; category: string | null }>,
  currentRound: number
): Promise<SufficiencyVerdict> {
  const { courseContext, language } = input;

  const model = await getModelForPhase('stage_4_clarifying', input.course_id, undefined, language);

  const roundGuidance =
    currentRound === 2
      ? 'This is round 2 of max 3. Be more lenient — only ask truly critical follow-ups'
      : 'This is round 1 of max 3. Ask follow-ups if there are significant gaps';

  const systemMsg = new SystemMessage(
    `${SUFFICIENCY_SYSTEM_PROMPT}
6. ALL output MUST be in ${language.toUpperCase()}
7. ${roundGuidance}`
  );

  const answersContext = answeredQuestions
    .map(
      (a, i) => `[Q${i + 1}] (${a.category || 'general'}) ${a.question}\n[A${i + 1}] ${a.answer}`
    )
    .join('\n\n');

  const humanMsg = new HumanMessage(`COURSE CONTEXT:
Title: ${courseContext.title}
${courseContext.description ? `Description: ${courseContext.description}` : ''}
Target Audience: ${courseContext.target_audience || 'mixed'}
Language: ${language.toUpperCase()}
Current Round: ${currentRound} of 3

ALL ANSWERS GATHERED SO FAR:
${answersContext}

TASK:
Analyze whether the gathered information is sufficient to design a comprehensive, high-quality course.
If NOT sufficient, generate follow-up questions targeting the specific gaps.
Output valid JSON.`);

  const startTime = Date.now();
  const response = await model.invoke([systemMsg, humanMsg]);
  const rawOutput = getTextContent(response.content);

  // Log trace
  await logTrace({
    courseId: input.course_id,
    stage: 'stage_4',
    phase: 'stage_4_clarifying',
    stepName: `sufficiency_analysis_round_${currentRound}`,
    inputData: { answeredCount: answeredQuestions.length, currentRound },
    completionText: rawOutput,
    modelUsed: model.model || 'unknown',
    durationMs: Date.now() - startTime,
  });

  // Parse and validate
  let parsed: unknown;
  try {
    parsed = safeJSONParse(rawOutput);
  } catch (parseError) {
    logger.error(
      {
        courseId: input.course_id,
        currentRound,
        error: parseError instanceof Error ? parseError.message : String(parseError),
        rawOutputPreview: rawOutput.slice(0, 200),
      },
      'Sufficiency analysis JSON parse failed, defaulting to sufficient'
    );
    // Store failure in trace for audit trail
    await logTrace({
      courseId: input.course_id,
      stage: 'stage_4',
      phase: 'stage_4_clarifying',
      stepName: `sufficiency_parse_failure_round_${currentRound}`,
      errorData: {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        rawOutput: rawOutput.slice(0, 500),
      },
      durationMs: Date.now() - startTime,
    });
    return {
      is_sufficient: true,
      confidence: 0.3,
      gaps: ['Parse failure - proceeding by default'],
    };
  }

  const result = SufficiencyVerdictSchema.safeParse(parsed);
  if (!result.success) {
    logger.error(
      { courseId: input.course_id, currentRound, errors: result.error.errors },
      'Sufficiency verdict validation failed, defaulting to sufficient'
    );
    return {
      is_sufficient: true,
      confidence: 0.3,
      gaps: ['Validation failure - proceeding by default'],
    };
  }

  // CRITICAL-002 fix: Confidence threshold to prevent unnecessary follow-ups
  // If LLM says "not sufficient" but confidence is high (>=0.6), override to sufficient
  if (!result.data.is_sufficient && result.data.confidence >= 0.6) {
    logger.info(
      {
        courseId: input.course_id,
        currentRound,
        confidence: result.data.confidence,
        gapCount: result.data.gaps.length,
      },
      'Overriding to sufficient: confidence too high for follow-ups'
    );
    result.data.is_sufficient = true;
    result.data.follow_up_questions = undefined;
  }

  // HIGH-003 fix: Validate and truncate follow-up question count per round
  const maxFollowUps = currentRound === 1 ? 20 : 10;
  if (result.data.follow_up_questions && result.data.follow_up_questions.length > maxFollowUps) {
    logger.warn(
      {
        courseId: input.course_id,
        currentRound,
        followUpCount: result.data.follow_up_questions.length,
        maxAllowed: maxFollowUps,
      },
      'LLM generated too many follow-up questions, truncating'
    );
    const priorityOrder: Record<string, number> = { critical: 0, important: 1, nice_to_have: 2 };
    result.data.follow_up_questions = result.data.follow_up_questions
      .sort(
        (a, b) =>
          (priorityOrder[a.question_priority] ?? 2) - (priorityOrder[b.question_priority] ?? 2)
      )
      .slice(0, maxFollowUps);
  }

  logger.info(
    {
      courseId: input.course_id,
      currentRound,
      isSufficient: result.data.is_sufficient,
      confidence: result.data.confidence,
      gapCount: result.data.gaps.length,
      followUpCount: result.data.follow_up_questions?.length || 0,
    },
    'Sufficiency analysis complete'
  );

  return result.data;
}
