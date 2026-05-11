/**
 * Phase 0.5: Clarifying Questions
 *
 * Generates smart questions based on course context and Phase 1 classification data.
 * Runs after Phase 1 (Classification), before Phase 2 (Scope).
 *
 * @module phase-0.5-clarifying
 */

import { getModelForPhase, getTextContent } from '../../../shared/llm/langchain-models.js';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { logTrace } from '../../../shared/trace-logger.js';
import logger from '../../../shared/logger/index.js';
import { safeJSONParse } from '@megacampus/shared-utils';

import {
  Phase05InputSchema,
  ClarifyingOutputSchema,
  SufficiencyVerdictSchema,
  type Phase05Input,
  type ClarifyingOutput,
  type SufficiencyVerdict,
} from './phase-0.5-clarifying/types.js';

import { LLM_CLARIFYING_TIMEOUT_MS, storeQuestions } from './phase-0.5-clarifying/utils.js';

import {
  buildClarifyingPrompt,
  SUFFICIENCY_SYSTEM_PROMPT,
} from './phase-0.5-clarifying/prompts.js';

// Re-export everything for backwards compatibility
export * from './phase-0.5-clarifying/types.js';
export * from './phase-0.5-clarifying/utils.js';
export * from './phase-0.5-clarifying/prompts.js';

type ValidationIssuePath = Array<string | number>;

interface ValidationIssueLike {
  code?: string;
  message: string;
  path: ValidationIssuePath;
  type?: string;
}

interface ValidationIssueSummary {
  code?: string;
  message: string;
  path: string;
}

interface OffendingStringValue {
  path: string;
  index: number | null;
  length: number;
  snippet: string;
}

interface ValidationDiagnostics {
  issues: ValidationIssueSummary[];
  offendingValue?: OffendingStringValue;
}

interface ValidationErrorWithMetadata extends Error {
  validationMetadata?: ValidationDiagnostics;
}

function formatIssuePath(path: ValidationIssuePath): string {
  return path.reduce<string>((acc, segment) => {
    if (typeof segment === 'number') {
      return `${acc}[${segment}]`;
    }
    return acc ? `${acc}.${segment}` : segment;
  }, '');
}

function getValueAtPath(root: unknown, path: ValidationIssuePath): unknown {
  let current = root;
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current) || segment >= current.length) {
        return undefined;
      }
      current = current[segment];
      continue;
    }

    if (!current || typeof current !== 'object' || !(segment in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function extractValidationDiagnostics(
  parsedOutput: unknown,
  issues: ValidationIssueLike[]
): ValidationDiagnostics {
  const summaries = issues.map(issue => ({
    code: issue.code,
    message: issue.message,
    path: formatIssuePath(issue.path),
  }));

  const offendingIssue = issues.find(
    issue =>
      (issue.code === 'too_small' && issue.type === 'string') ||
      issue.message.includes('String must contain at least')
  );

  if (!offendingIssue) {
    return { issues: summaries };
  }

  const offendingValue = getValueAtPath(parsedOutput, offendingIssue.path);
  if (typeof offendingValue !== 'string') {
    return { issues: summaries };
  }

  const numericSegments = offendingIssue.path.filter(
    (segment): segment is number => typeof segment === 'number'
  );

  return {
    issues: summaries,
    offendingValue: {
      path: formatIssuePath(offendingIssue.path),
      index: numericSegments.at(-1) ?? null,
      length: offendingValue.length,
      snippet: offendingValue.slice(0, 120),
    },
  };
}

function buildValidationError(
  message: string,
  validationMetadata: ValidationDiagnostics
): ValidationErrorWithMetadata {
  const error = new Error(message) as ValidationErrorWithMetadata;
  error.validationMetadata = validationMetadata;
  return error;
}

function getValidationMetadata(error: unknown): ValidationDiagnostics | undefined {
  if (error instanceof Error && 'validationMetadata' in error) {
    return (error as ValidationErrorWithMetadata).validationMetadata;
  }
  return undefined;
}

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
 */
export async function runPhase05Clarifying(rawInput: Phase05Input): Promise<ClarifyingOutput> {
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
    const totalDocTokens = input.budgetAllocation?.totalTokens ?? undefined;
    const model = await getModelForPhase('stage_4_clarifying', courseId, totalDocTokens, language);
    const modelId = model.model || 'unknown';

    phaseLogger.debug(
      { modelId, totalDocTokens, tier: input.budgetAllocation?.modelSelection?.tier },
      'Model selected for clarifying questions generation'
    );

    const [systemMsg, humanMsg] = buildClarifyingPrompt(input);
    const promptMessages = [systemMsg, humanMsg];

    phaseLogger.debug('Prompt built with course context and document context');

    // Adaptive timeout: base + extra time for large documents, cap at 30 min
    const extraTokens = Math.max(0, (totalDocTokens ?? 0) - 5000);
    const extraTimeMs = Math.ceil(extraTokens / 5000) * 60_000; // +1 min per 5K tokens above 5K
    const adaptiveTimeout = Math.min(LLM_CLARIFYING_TIMEOUT_MS + extraTimeMs, 1_800_000);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      phaseLogger.warn(
        { timeoutMs: adaptiveTimeout, totalDocTokens, modelId },
        'LLM call timed out, aborting'
      );
    }, adaptiveTimeout);

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

    let parsedOutput: unknown;
    try {
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

        raw.questions = raw.questions.filter(q => {
          const answers = (q as Record<string, unknown>).suggested_answers;
          if (!Array.isArray(answers) || answers.length < 2) {
            phaseLogger.warn(
              {
                questionText: String((q as Record<string, unknown>).question_text).substring(0, 80),
                answersCount: Array.isArray(answers) ? answers.length : 0,
              },
              'Filtered out question with insufficient suggested_answers (likely truncated output)'
            );
            return false;
          }
          return true;
        });

        if (raw.questions.length < originalCount) {
          phaseLogger.warn(
            { originalCount, filteredCount: raw.questions.length },
            'Filtered out malformed questions from LLM output'
          );
        }
      }
    }

    const validationResult = ClarifyingOutputSchema.safeParse(parsedOutput);

    if (!validationResult.success) {
      const validationMetadata = extractValidationDiagnostics(
        parsedOutput,
        validationResult.error.issues
      );

      await logTrace({
        courseId,
        stage: 'stage_4',
        phase: 'stage_4_clarifying',
        stepName: 'validation_failure',
        errorData: {
          error: 'Validation failed',
          ...validationMetadata,
        },
        durationMs: Date.now() - startTime,
      });

      phaseLogger.error(
        {
          errors: validationResult.error.errors,
          offendingValue: validationMetadata.offendingValue,
          rawOutputPreview: rawOutput.substring(0, 500),
        },
        'LLM output failed Zod validation'
      );
      throw buildValidationError(
        `Validation failed: ${validationResult.error.message}`,
        validationMetadata
      );
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

    await storeQuestions(courseId, output.questions, 1);

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
    const validationMetadata = getValidationMetadata(error);

    if (error instanceof Error && error.name === 'AbortError') {
      phaseLogger.error(
        { durationMs: endTime - startTime, totalDocTokens: input.budgetAllocation?.totalTokens },
        'Phase 0.5 LLM timeout — consider increasing LLM_CLARIFYING_TIMEOUT_MS or switching model'
      );
    }

    phaseLogger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        offendingValue: validationMetadata?.offendingValue,
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
        ...(validationMetadata ? validationMetadata : {}),
      },
      durationMs: endTime - startTime,
    });

    throw error;
  }
}

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
    `${SUFFICIENCY_SYSTEM_PROMPT}\n6. ALL output MUST be in ${language.toUpperCase()}\n7. ${roundGuidance}`
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
    const validationMetadata = extractValidationDiagnostics(parsed, result.error.issues);

    logger.error(
      {
        courseId: input.course_id,
        currentRound,
        errors: result.error.errors,
        offendingValue: validationMetadata.offendingValue,
      },
      'Sufficiency verdict validation failed, defaulting to sufficient'
    );

    await logTrace({
      courseId: input.course_id,
      stage: 'stage_4',
      phase: 'stage_4_clarifying',
      stepName: `sufficiency_validation_failure_round_${currentRound}`,
      errorData: {
        error: 'Validation failed',
        ...validationMetadata,
      },
      durationMs: Date.now() - startTime,
    });

    return {
      is_sufficient: true,
      confidence: 0.3,
      gaps: ['Validation failure - proceeding by default'],
    };
  }

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
