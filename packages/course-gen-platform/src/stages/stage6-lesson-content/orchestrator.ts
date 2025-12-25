/**
 * Stage 6 LangGraph Orchestrator
 * @module stages/stage6-lesson-content/orchestrator
 *
 * Wires together the LangGraph nodes (generator -> selfReviewer -> sectionRegenerator/judge)
 * using StateGraph for lesson content generation pipeline.
 *
 * Pipeline flow:
 * __start__ -> generator -> selfReviewer -> judge -> __end__
 *                             |              |
 *                             |              +-> generator (if regenerate needed)
 *                             +-> generator (if REGENERATE status)
 *                             +-> sectionRegenerator (if sectionsToRegenerate) -> judge
 *
 * The generator node:
 * - Generates complete lesson content in one pass using serial section-by-section generation
 * - Replaces the previous planner -> expander -> assembler -> smoother pipeline
 * - Uses context window for natural transitions between sections
 *
 * The selfReviewer node:
 * - Performs pre-judge validation (Fail-Fast architecture)
 * - Detects fatal errors before expensive judge evaluation
 * - Routes to generator for full regeneration, sectionRegenerator for section-level fixes, or judge for evaluation
 *
 * The sectionRegenerator node:
 * - Regenerates specific sections identified by selfReviewer (instead of full content)
 * - Merges regenerated sections back into existing content
 * - Routes to judge for evaluation after regeneration
 *
 * The judge node:
 * - Evaluates content quality using cascade evaluation (heuristics -> single judge -> CLEV)
 * - Makes decisions: ACCEPT, TARGETED_FIX, ITERATIVE_REFINEMENT, REGENERATE, ESCALATE_TO_HUMAN
 * - Executes refinement loop for fixable issues
 * - Routes back to generator for complete regeneration if needed
 *
 * Reference:
 * - LangGraph.js StateGraph API
 * - specs/022-lesson-enrichments/stage-7-lesson-enrichments.md
 * - docs/research/010-stage6-generation-strategy/
 */

import { StateGraph, START, END } from '@langchain/langgraph';
import { LessonGraphState, type LessonGraphStateType, type LessonGraphStateUpdate, type LessonGraphNode } from './state';
import { generatorNode } from './nodes/generator';
import { selfReviewerNode } from './nodes/self-reviewer-node';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { LessonContent, LessonContentBody, RAGChunk } from '@megacampus/shared-types/lesson-content';
import type {
  JudgeRecommendation,
  JudgeVerdict,
  ProgressSummary,
  NodeAttemptSummary,
  SummaryItem,
} from '@megacampus/shared-types/judge-types';
import {
  executeCascadeEvaluation,
  type CascadeEvaluationInput,
  type CascadeResult,
  type CascadeStage,
} from './judge/cascade-evaluator';
import {
  makeDecisionFromVerdict,
  DecisionAction,
  type DecisionResult,
} from './judge/decision-engine';
import {
  executeTargetedRefinement,
  type TargetedRefinementInput,
  type TargetedRefinementOutput,
} from './judge/targeted-refinement';
import { consolidateVerdicts } from './judge/arbiter';
import type { ArbiterInput } from '@megacampus/shared-types/judge-types';
import { logger } from '@/shared/logger';
import { logTrace } from '@/shared/trace-logger';
import { HANDLER_CONFIG } from './config';
import { parseMarkdownContent } from './utils/markdown-parser';
import { regenerateSections } from './utils/section-regenerator';

// ============================================================================
// PUBLIC INTERFACES
// ============================================================================

/**
 * Stage 6 orchestrator input
 *
 * Contains all required inputs for lesson content generation.
 */
export interface Stage6Input {
  /** Lesson specification from Stage 5 */
  lessonSpec: LessonSpecificationV2;
  /** Course UUID for context */
  courseId: string;
  /** Target language for content generation (ISO 639-1 code, e.g., 'ru', 'en') */
  language: string;
  /** Lesson UUID resolved from lesson_id (optional, for trace logging) */
  lessonUuid?: string | null;
  /** Pre-retrieved RAG chunks (optional) */
  ragChunks?: RAGChunk[];
  /** RAG context cache ID for tracking (optional) */
  ragContextId?: string;
  /** User instructions for refinement (optional) */
  userRefinementPrompt?: string;
  /** Model override for fallback retry (optional) */
  modelOverride?: string;
}

/**
 * Stage 6 orchestrator output
 *
 * Contains generated content and execution metrics.
 */
export interface Stage6Output {
  /** Generated lesson content (null if failed) */
  lessonContent: LessonContent | null;
  /** Whether generation succeeded */
  success: boolean;
  /** Accumulated errors during generation */
  errors: string[];
  /** Execution metrics */
  metrics: {
    /** Total tokens used across all nodes */
    tokensUsed: number;
    /** Total duration in milliseconds */
    durationMs: number;
    /** Model used for generation */
    modelUsed: string | null;
    /** Quality score from judge (0-1, or 0 if not evaluated) */
    qualityScore: number;
  };
}

// ============================================================================
// JUDGE NODE
// ============================================================================

/**
 * Extract LessonContentBody from state
 * Uses the structured lessonContent.content from generator node
 */
function extractContentBody(state: LessonGraphStateType): LessonContentBody | null {
  // Primary path: use lessonContent.content from generator node
  if (state.lessonContent?.content) {
    return state.lessonContent.content;
  }

  // Fallback: if lessonContent not available but generatedContent exists
  // This can happen in edge cases or tests
  if (!state.generatedContent) {
    return null;
  }

  try {
    // If generatedContent is already parsed, validate structure before casting
    if (
      typeof state.generatedContent === 'object' &&
      state.generatedContent !== null &&
      !Array.isArray(state.generatedContent) &&
      'intro' in state.generatedContent &&
      'sections' in state.generatedContent
    ) {
      return state.generatedContent as LessonContentBody;
    }

    // Try to parse JSON from string (for backward compatibility)
    const parsed = JSON.parse(state.generatedContent);
    return parsed as LessonContentBody;
  } catch {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = state.generatedContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]) as LessonContentBody;
      } catch {
        logger.debug('Failed to parse JSON from code block, trying markdown parser');
      }
    }

    // NEW: Parse markdown content using the markdown parser
    // This is the primary path for the new generator node which outputs markdown
    const parsedMarkdown = parseMarkdownContent(state.generatedContent);

    if (parsedMarkdown.sections.length === 0) {
      logger.warn({
        title: parsedMarkdown.title,
        wordCount: parsedMarkdown.wordCount,
        headingCount: parsedMarkdown.headingStructure.length,
      }, 'Markdown parsed but no sections extracted');
      return null;
    }

    // Convert ParsedMarkdown to LessonContentBody
    const contentBody: LessonContentBody = {
      intro: parsedMarkdown.introduction || parsedMarkdown.summary || '',
      sections: parsedMarkdown.sections,
      examples: [], // Markdown doesn't have structured examples
      exercises: parsedMarkdown.exercises.map((exerciseText) => ({
        question: exerciseText,
        solution: 'См. содержание урока для получения рекомендаций.',
        hints: [],
      })),
    };

    logger.info({
      title: parsedMarkdown.title,
      sectionsCount: contentBody.sections.length,
      exercisesCount: contentBody.exercises.length,
      introLength: contentBody.intro.length,
      wordCount: parsedMarkdown.wordCount,
    }, 'Successfully parsed markdown to LessonContentBody');

    return contentBody;
  }
}

/**
 * Count words in a content body
 */
function countWords(contentBody: LessonContentBody): number {
  let wordCount = 0;

  // Count intro words
  wordCount += contentBody.intro.split(/\s+/).filter(Boolean).length;

  // Count section words
  for (const section of contentBody.sections) {
    wordCount += section.title.split(/\s+/).filter(Boolean).length;
    wordCount += section.content.split(/\s+/).filter(Boolean).length;
  }

  // Count example words
  for (const example of contentBody.examples) {
    wordCount += example.title.split(/\s+/).filter(Boolean).length;
    wordCount += example.content.split(/\s+/).filter(Boolean).length;
    if (example.code) {
      wordCount += example.code.split(/\s+/).filter(Boolean).length;
    }
  }

  // Count exercise words
  for (const exercise of contentBody.exercises) {
    wordCount += exercise.question.split(/\s+/).filter(Boolean).length;
    wordCount += exercise.solution.split(/\s+/).filter(Boolean).length;
    if (exercise.hints) {
      for (const hint of exercise.hints) {
        wordCount += hint.split(/\s+/).filter(Boolean).length;
      }
    }
  }

  return wordCount;
}

/**
 * Build LessonContent from state after successful judge evaluation
 */
function buildLessonContent(
  state: LessonGraphStateType,
  contentBody: LessonContentBody,
  qualityScore: number,
): LessonContent {
  const totalWords = countWords(contentBody);
  const now = new Date();

  return {
    lesson_id: state.lessonSpec.lesson_id,
    course_id: state.courseId,
    content: contentBody,
    metadata: {
      total_words: totalWords,
      total_tokens: state.tokensUsed,
      cost_usd: 0, // Will be calculated by orchestrator or billing service
      quality_score: qualityScore,
      rag_chunks_used: state.ragChunks.length,
      generation_duration_ms: state.durationMs,
      model_used: state.modelUsed ?? 'unknown',
      archetype_used: state.lessonSpec.metadata.content_archetype,
      temperature_used: state.temperature,
    },
    status: 'completed',
    created_at: now,
    updated_at: now,
  };
}

/**
 * Return type for buildEnrichedJudgeOutput
 */
type EnrichedJudgeOutput = {
  cascadeStage: CascadeStage;
  stageReason: string;
  heuristics: {
    passed: boolean;
    wordCount?: number;
    fleschKincaid?: number;
    examplesCount?: number;
    exercisesCount?: number;
    failureReasons: string[];
  } | null;
  singleJudge: {
    model: string;
    score: number;
    confidence: 'high' | 'medium' | 'low';
    criteriaScores: Record<string, number>;
    issues: Array<{
      criterion: string;
      severity: string;
      location: string;
      description: string;
      quotedText?: string;
      suggestedFix: string;
    }>;
    strengths: string[];
    recommendation: JudgeRecommendation;
  } | null;
  votes?: Array<{
    judge_id: string;
    model_id: string;
    model_display_name: string;
    verdict: JudgeRecommendation;
    score: number;
    coherence: number;
    accuracy: number;
    completeness: number;
    readability: number;
    reasoning: string | undefined;
    evaluated_at: string;
  }>;
  consensus_method?: string;
  is_third_judge_invoked: boolean;
  heuristics_passed: boolean;
  heuristics_issues: string[];
  finalRecommendation: JudgeRecommendation;
  final_verdict: JudgeRecommendation;
  qualityScore: number;
  needsRegeneration: boolean;
  needsHumanReview: boolean;
  retryCount: number;
  costSavingsRatio: number;
};

/**
 * Simple cache for last enriched judge output
 * Since this function is called once per judge execution (not on every render),
 * we cache the last result to avoid redundant computation if called multiple times
 * with the same inputs.
 */
let lastEnrichedJudgeOutputCache: {
  key: string;
  result: EnrichedJudgeOutput;
} | null = null;

/**
 * Build enriched judge output data for trace logging
 * Transforms cascade evaluation results into UI-friendly format
 */
function buildEnrichedJudgeOutput(
  cascadeResult: CascadeResult,
  state: LessonGraphStateType,
  needsRegeneration: boolean,
  needsHumanReview: boolean,
): EnrichedJudgeOutput {
  // Input validation
  if (!cascadeResult || !cascadeResult.stage) {
    logger.warn({
      hasCascadeResult: Boolean(cascadeResult),
      stage: cascadeResult?.stage
    }, 'buildEnrichedJudgeOutput: Invalid cascadeResult');
    return {
      cascadeStage: 'heuristic' as const,
      stageReason: 'Invalid cascade result - defaulting to heuristic',
      heuristics: null,
      singleJudge: null,
      votes: undefined,
      consensus_method: undefined,
      is_third_judge_invoked: false,
      heuristics_passed: false,
      heuristics_issues: ['Invalid cascade result'],
      finalRecommendation: 'REGENERATE',
      final_verdict: 'REGENERATE',
      qualityScore: 0,
      needsRegeneration: true,
      needsHumanReview: false,
      retryCount: state?.retryCount ?? 0,
      costSavingsRatio: 1,
    };
  }

  // Create cache key from inputs
  const cacheKey = `${cascadeResult.stage}-${state.retryCount}-${needsRegeneration}-${needsHumanReview}-${cascadeResult.finalScore}`;

  // Check cache
  if (lastEnrichedJudgeOutputCache?.key === cacheKey) {
    logger.debug({ cacheKey }, 'buildEnrichedJudgeOutput: Using cached result');
    return lastEnrichedJudgeOutputCache.result;
  }

  // Compute stage reason
  const stageReasonMap: Record<CascadeStage, string> = {
    heuristic: 'Failed heuristic pre-filters',
    single_judge: 'High confidence single judge decision',
    clev_voting: 'CLEV voting consensus',
  };
  const stageReason = stageReasonMap[cascadeResult.stage];

  // Build heuristics data
  const heuristics = cascadeResult.heuristicResults ? {
    passed: cascadeResult.heuristicResults.passed,
    wordCount: cascadeResult.heuristicResults.wordCount,
    fleschKincaid: cascadeResult.heuristicResults.fleschKincaid,
    examplesCount: cascadeResult.heuristicResults.examplesCount,
    exercisesCount: cascadeResult.heuristicResults.exercisesCount,
    failureReasons: cascadeResult.heuristicResults.failureReasons,
  } : null;

  // Build single judge data
  const singleJudge = cascadeResult.singleJudgeVerdict ? {
    model: cascadeResult.singleJudgeVerdict.judgeModel,
    score: cascadeResult.singleJudgeVerdict.overallScore,
    confidence: cascadeResult.singleJudgeVerdict.confidence,
    criteriaScores: cascadeResult.singleJudgeVerdict.criteriaScores,
    issues: cascadeResult.singleJudgeVerdict.issues,
    strengths: cascadeResult.singleJudgeVerdict.strengths,
    recommendation: cascadeResult.singleJudgeVerdict.recommendation,
  } : null;

  // Build CLEV votes array for UI
  const votes = cascadeResult.clevResult ? cascadeResult.clevResult.verdicts.map(v => ({
    judge_id: v.judgeModel || 'unknown',
    model_id: v.judgeModel,
    model_display_name: v.judgeModel || 'Unknown Model',
    verdict: v.recommendation,
    score: v.overallScore,
    coherence: v.criteriaScores?.clarity_readability ?? v.overallScore,
    accuracy: v.criteriaScores?.factual_accuracy ?? v.overallScore,
    completeness: v.criteriaScores?.completeness ?? v.overallScore,
    readability: v.criteriaScores?.clarity_readability ?? v.overallScore,
    reasoning: v.strengths?.join('; '),
    evaluated_at: new Date().toISOString(),
  })) : undefined;

  const result = {
    // Cascade info
    cascadeStage: cascadeResult.stage,
    stageReason,

    // Heuristic results
    heuristics,

    // Single judge results
    singleJudge,

    // CLEV results
    votes,

    // Voting metadata
    consensus_method: cascadeResult.clevResult?.votingMethod,
    is_third_judge_invoked: cascadeResult.clevResult ? cascadeResult.clevResult.verdicts.length > 2 : false,

    // Heuristics for backward compat
    heuristics_passed: cascadeResult.heuristicResults?.passed ?? true,
    heuristics_issues: cascadeResult.heuristicResults?.failureReasons ?? [],

    // Decision
    finalRecommendation: cascadeResult.finalRecommendation,
    final_verdict: cascadeResult.finalRecommendation,
    qualityScore: cascadeResult.finalScore,
    needsRegeneration,
    needsHumanReview,

    // Retry info
    retryCount: state.retryCount,

    // Metrics
    costSavingsRatio: cascadeResult.costSavingsRatio,
  };

  // Cache result before returning
  lastEnrichedJudgeOutputCache = { key: cacheKey, result };

  return result;
}

/**
 * Build localized progress summary for judge node UI display
 *
 * Generates user-friendly messages about what happened during judge evaluation.
 * Messages are localized based on the course language.
 *
 * @param recommendation - Final judge recommendation
 * @param cascadeResult - Result from cascade evaluation
 * @param decision - Decision made by decision engine
 * @param language - Target language ('ru' or 'en')
 * @param durationMs - Duration in milliseconds
 * @param tokensUsed - Tokens used in evaluation
 * @param attempt - Current attempt number
 * @param existingProgress - Existing progress summary to append to
 * @returns Updated progress summary
 */
function buildJudgeProgressSummary(
  recommendation: JudgeRecommendation,
  cascadeResult: CascadeResult | null,
  decisionAction: DecisionAction | null,
  language: string,
  durationMs: number,
  tokensUsed: number,
  attempt: number,
  existingProgress: ProgressSummary | null
): ProgressSummary {
  const isRussian = language === 'ru';

  // Early return for null cascadeResult - return minimal progress summary
  if (!cascadeResult) {
    const existingAttempts = existingProgress?.attempts || [];
    return {
      status: recommendation === 'REGENERATE' ? 'failed' : 'completed',
      currentPhase: isRussian ? 'Оценка качества' : 'Quality evaluation',
      language,
      attempts: [...existingAttempts, {
        node: 'judge',
        attempt,
        status: recommendation === 'REGENERATE' ? 'failed' : 'completed',
        resultLabel: recommendation,
        issuesFound: [],
        actionsPerformed: [],
        outcome: isRussian ? 'Нет данных каскадной оценки' : 'No cascade evaluation data',
        durationMs,
        tokensUsed,
      }],
      outcome: isRussian ? 'Оценка завершена' : 'Evaluation completed',
    };
  }

  // Build issues found list
  const issuesFound: SummaryItem[] = [];

  // Add heuristic failures if any
  if (cascadeResult.heuristicResults && !cascadeResult.heuristicResults.passed) {
    for (const reason of cascadeResult.heuristicResults.failureReasons) {
      issuesFound.push({
        text: reason,
        severity: 'warning',
      });
    }
  }

  // Add verdict issues if any
  const verdict = cascadeResult?.singleJudgeVerdict || cascadeResult?.clevResult?.verdicts?.[0];
  if (verdict?.issues) {
    const criticalCount = verdict.issues.filter(i => i.severity === 'critical').length;
    const majorCount = verdict.issues.filter(i => i.severity === 'major').length;

    if (criticalCount > 0) {
      issuesFound.push({
        text: isRussian
          ? `Найдено ${criticalCount} критических проблем`
          : `Found ${criticalCount} critical issues`,
        severity: 'error',
      });
    }
    if (majorCount > 0) {
      issuesFound.push({
        text: isRussian
          ? `Найдено ${majorCount} значительных проблем`
          : `Found ${majorCount} major issues`,
        severity: 'warning',
      });
    }
  }

  // Build actions performed list
  const actionsPerformed: SummaryItem[] = [];

  // Describe cascade stages
  if (cascadeResult) {
    actionsPerformed.push({
      text: isRussian
        ? `Эвристическая проверка: ${cascadeResult.heuristicResults?.passed ? 'пройдена' : 'обнаружены проблемы'}`
        : `Heuristic check: ${cascadeResult.heuristicResults?.passed ? 'passed' : 'issues found'}`,
      severity: 'info',
    });

    if (cascadeResult.stage === 'single_judge') {
      actionsPerformed.push({
        text: isRussian
          ? `Оценка судьи: ${cascadeResult.singleJudgeVerdict?.confidence} уверенность`
          : `Judge evaluation: ${cascadeResult.singleJudgeVerdict?.confidence} confidence`,
        severity: 'info',
      });
    } else if (cascadeResult.stage === 'clev_voting') {
      const voteCount = cascadeResult.clevResult?.verdicts?.length ?? 0;
      actionsPerformed.push({
        text: isRussian
          ? `CLEV голосование: ${voteCount} судей`
          : `CLEV voting: ${voteCount} judges`,
        severity: 'info',
      });
    }
  }

  // Add action description
  if (decisionAction) {
    const actionLabels: Record<DecisionAction, { ru: string; en: string }> = {
      [DecisionAction.ACCEPT]: {
        ru: 'Контент принят',
        en: 'Content accepted',
      },
      [DecisionAction.TARGETED_FIX]: {
        ru: 'Выполнены точечные исправления',
        en: 'Targeted fixes applied',
      },
      [DecisionAction.ITERATIVE_REFINEMENT]: {
        ru: 'Выполнено итеративное улучшение',
        en: 'Iterative refinement applied',
      },
      [DecisionAction.REGENERATE]: {
        ru: 'Требуется полная регенерация',
        en: 'Full regeneration required',
      },
      [DecisionAction.ESCALATE_TO_HUMAN]: {
        ru: 'Требуется проверка человеком',
        en: 'Human review required',
      },
    };

    actionsPerformed.push({
      text: isRussian ? actionLabels[decisionAction].ru : actionLabels[decisionAction].en,
      severity: decisionAction === DecisionAction.ACCEPT ? 'info' : 'warning',
    });
  }

  // Build outcome message
  let outcome: string;
  const score = cascadeResult?.finalScore ?? 0;
  const scorePercent = Math.round(score * 100);

  switch (recommendation) {
    case 'ACCEPT':
      outcome = isRussian
        ? `✓ Контент принят (оценка: ${scorePercent}%)`
        : `✓ Content accepted (score: ${scorePercent}%)`;
      break;
    case 'ACCEPT_WITH_MINOR_REVISION':
      outcome = isRussian
        ? `✓ Контент принят с исправлениями (оценка: ${scorePercent}%)`
        : `✓ Content accepted with revisions (score: ${scorePercent}%)`;
      break;
    case 'ITERATIVE_REFINEMENT':
      outcome = isRussian
        ? `→ Выполнено итеративное улучшение`
        : `→ Iterative refinement completed`;
      break;
    case 'REGENERATE':
      outcome = isRussian
        ? `→ Требуется полная регенерация контента`
        : `→ Full content regeneration required`;
      break;
    case 'ESCALATE_TO_HUMAN':
      outcome = isRussian
        ? `→ Передано на проверку человеку`
        : `→ Escalated to human review`;
      break;
    default:
      outcome = isRussian
        ? `→ Оценка завершена`
        : `→ Evaluation completed`;
  }

  // Determine status
  const isFailure = recommendation === 'REGENERATE';
  const isCompleted = recommendation === 'ACCEPT' || recommendation === 'ACCEPT_WITH_MINOR_REVISION';

  // Create attempt summary
  const attemptSummary: NodeAttemptSummary = {
    node: 'judge',
    attempt,
    status: isFailure ? 'failed' : isCompleted ? 'completed' : 'fixing',
    resultLabel: recommendation,
    issuesFound,
    actionsPerformed,
    outcome,
    startedAt: new Date(),
    durationMs,
    tokensUsed,
  };

  // Merge with existing progress or create new
  const existingAttempts = existingProgress?.attempts || [];

  return {
    status: isFailure ? 'failed' : isCompleted ? 'completed' : 'fixing',
    currentPhase: isRussian ? 'Оценка качества' : 'Quality evaluation',
    language,
    attempts: [...existingAttempts, attemptSummary],
    outcome: isCompleted || isFailure ? outcome : undefined,
  };
}

/**
 * Judge node - Evaluates content quality and handles refinement/regeneration decisions
 *
 * Implements the cascade evaluation pattern:
 * 1. Run cascade evaluation (heuristics -> single judge -> CLEV if needed)
 * 2. Make decision based on score and issues
 * 3. Execute refinement loop if needed (TARGETED_FIX or ITERATIVE_REFINEMENT)
 * 4. Return final state with verdict and recommendations
 *
 * @param state - Current LangGraph state after selfReviewer node
 * @returns Updated state with judge verdict and final content
 */
async function judgeNode(state: LessonGraphStateType): Promise<LessonGraphStateUpdate> {
  const startTime = Date.now();

  logger.info({
    lessonId: state.lessonSpec.lesson_id,
    currentNode: 'judge',
    hasGeneratedContent: Boolean(state.generatedContent),
    refinementIterationCount: state.refinementIterationCount,
  }, 'Judge node: Starting content evaluation');

  // Log trace at start
  await logTrace({
    courseId: state.courseId,
    lessonId: state.lessonUuid || undefined,
    stage: 'stage_6',
    phase: 'judge',
    stepName: 'judge_start',
    inputData: {
      lessonLabel: state.lessonSpec.lesson_id,
      lessonTitle: state.lessonSpec.title,
      moduleNumber: state.lessonSpec.lesson_id.split('.')[0],
      hasGeneratedContent: Boolean(state.generatedContent),
      refinementIterationCount: state.refinementIterationCount,
    },
    durationMs: 0,
  });

  // Extract content body for evaluation
  const contentBody = extractContentBody(state);

  if (!contentBody) {
    logger.error({
      lessonId: state.lessonSpec.lesson_id,
    }, 'Judge node: No valid content body to evaluate');

    const noContentProgress = buildJudgeProgressSummary(
      'REGENERATE',
      null,
      null,
      state.language,
      Date.now() - startTime,
      0,
      (state.retryCount || 0) + 1,
      state.progressSummary
    );

    return {
      currentNode: 'judge',
      errors: ['Judge node: No valid content body to evaluate'],
      needsRegeneration: true,
      judgeRecommendation: 'REGENERATE' as JudgeRecommendation,
      progressSummary: noContentProgress,
    };
  }

  try {
    // =========================================================================
    // STEP 1: Execute Cascade Evaluation
    // =========================================================================

    // Use authoritative language from state (passed from database via job data)
    // This is critical for Flesch-Kincaid readability which only works for English
    const cascadeInput: CascadeEvaluationInput = {
      lessonContent: contentBody,
      lessonSpec: state.lessonSpec,
      ragChunks: state.ragChunks,
      language: state.language, // Use state.language instead of heuristic detection
    };

    logger.info({
      lessonId: state.lessonSpec.lesson_id,
    }, 'Judge node: Executing cascade evaluation');

    const cascadeResult: CascadeResult = await executeCascadeEvaluation(cascadeInput);

    // Extract verdict for decision making
    let verdict = cascadeResult.clevResult?.verdicts?.[0]
      ?? cascadeResult.singleJudgeVerdict
      ?? null;

    // If no verdict but heuristic failures exist, create synthetic verdict for targeted fix
    if (!verdict && cascadeResult.heuristicResults) {
      // Check for structural issues that can be fixed with targeted refinement
      const structuralIssues = cascadeResult.heuristicResults.failureReasons
        .filter(r => r.includes('Missing required sections'));

      if (structuralIssues.length > 0 && contentBody) {
        // Parse missing section names from failure reasons
        // Format: "Missing required sections: conclusion, examples"
        const parsedIssues = structuralIssues.map(issue => {
          // Extract section name after colon
          const colonIndex = issue.indexOf(':');
          const sectionPart = colonIndex > 0 ? issue.slice(colonIndex + 1).trim() : 'content';
          // Take first section name if multiple
          const sectionName = sectionPart.split(',')[0].trim().toLowerCase();
          return {
            description: issue,
            // Use 'completeness' criterion - this triggers REGENERATE_SECTION in arbiter
            // (pedagogical_structure with major severity would trigger SURGICAL_EDIT)
            criterion: 'completeness' as const,
            severity: 'major' as const,
            location: sectionName || 'content',
            suggestedFix: `Add the missing ${sectionName} section with appropriate content based on the lesson specification`,
          };
        });

        // Create synthetic verdict for targeted fix
        // Score 0.78 is in the 0.75-0.90 range which triggers TARGETED_FIX for localized issues
        const syntheticVerdict: JudgeVerdict = {
          judgeModel: 'heuristic-fixer',
          overallScore: 0.78,
          confidence: 'high' as const,
          recommendation: 'ACCEPT_WITH_MINOR_REVISION' as JudgeRecommendation,
          criteriaScores: {
            learning_objective_alignment: 0.85,
            pedagogical_structure: 0.8,
            factual_accuracy: 0.9,
            clarity_readability: 0.85,
            engagement_examples: 0.8,
            completeness: 0.55, // Low score for completeness issue (missing sections)
          },
          issues: parsedIssues,
          strengths: ['Content quality is acceptable', 'Most sections are complete', 'Learning objectives addressed'],
          temperature: 0.3,
          passed: false,
          durationMs: 0,
          tokensUsed: 0,
        };

        // Assign synthetic verdict to be used by decision engine
        verdict = syntheticVerdict;

        logger.info({
          lessonId: state.lessonSpec.lesson_id,
          structuralIssues,
          parsedLocations: parsedIssues.map(i => i.location),
        }, 'Judge node: Created synthetic verdict for heuristic structural fix');
      }
    }

    if (!verdict) {
      logger.warn({
        lessonId: state.lessonSpec.lesson_id,
        cascadeStage: cascadeResult.stage,
      }, 'Judge node: No verdict from cascade evaluation');

      // Use cascade result to make a synthetic decision
      const recommendation = cascadeResult.finalRecommendation;
      const needsRegeneration = recommendation === 'REGENERATE';
      const needsHumanReview = recommendation === 'ESCALATE_TO_HUMAN';
      const durationMs = Date.now() - startTime;

      // Build enriched output for trace
      const enrichedOutput = buildEnrichedJudgeOutput(
        cascadeResult,
        state,
        needsRegeneration,
        needsHumanReview,
      );

      // Log trace at completion (even for synthetic decision)
      await logTrace({
        courseId: state.courseId,
        lessonId: state.lessonUuid || undefined,
        stage: 'stage_6',
        phase: 'judge',
        stepName: 'judge_complete',
        inputData: {
          lessonLabel: state.lessonSpec.lesson_id,
          lessonTitle: state.lessonSpec.title,
          moduleNumber: state.lessonSpec.lesson_id.split('.')[0],
          syntheticDecision: true,
        },
        outputData: enrichedOutput,
        tokensUsed: cascadeResult.totalTokensUsed,
        durationMs,
      });

      const syntheticProgress = buildJudgeProgressSummary(
        recommendation,
        cascadeResult,
        null,
        state.language,
        durationMs,
        cascadeResult.totalTokensUsed,
        (state.retryCount || 0) + 1,
        state.progressSummary
      );

      return {
        currentNode: 'judge',
        qualityScore: cascadeResult.finalScore,
        judgeRecommendation: recommendation,
        needsRegeneration,
        needsHumanReview,
        // Clear lessonContent if regeneration needed to allow retry
        lessonContent: needsRegeneration ? null : state.lessonContent,
        // Increment retryCount if regeneration needed
        retryCount: needsRegeneration ? state.retryCount + 1 : state.retryCount,
        tokensUsed: cascadeResult.totalTokensUsed,
        durationMs,
        progressSummary: syntheticProgress,
      };
    }

    // =========================================================================
    // STEP 2: Make Decision Based on Verdict
    // =========================================================================

    const decision: DecisionResult = makeDecisionFromVerdict(
      verdict,
      contentBody,
      state.refinementIterationCount,
      state.previousScores,
    );

    logger.info({
      lessonId: state.lessonSpec.lesson_id,
      action: decision.action,
      score: verdict.overallScore,
      confidence: verdict.confidence,
      reason: decision.reason,
    }, 'Judge node: Decision made');

    // =========================================================================
    // STEP 3: Handle Decision Actions
    // =========================================================================

    let finalContent: LessonContent | null = null;
    let finalScore = verdict.overallScore;
    let finalRecommendation: JudgeRecommendation = verdict.recommendation;
    let needsRegeneration = false;
    let needsHumanReview = false;
    let refinementTokensUsed = 0;
    let arbiterOutput = null;

    switch (decision.action) {
      case DecisionAction.ACCEPT: {
        // Content accepted - build final LessonContent
        logger.info({
          lessonId: state.lessonSpec.lesson_id,
          score: verdict.overallScore,
        }, 'Judge node: Content ACCEPTED');

        finalContent = buildLessonContent(state, contentBody, verdict.overallScore);
        break;
      }

      case DecisionAction.TARGETED_FIX:
      case DecisionAction.ITERATIVE_REFINEMENT: {
        // Execute targeted refinement with arbiter consolidation
        logger.info({
          lessonId: state.lessonSpec.lesson_id,
          action: decision.action,
        }, 'Judge node: Starting targeted refinement');

        // Get operation mode from state (default: full-auto)
        const operationMode = state.targetedRefinementMode ?? 'full-auto';

        // Consolidate verdicts to create refinement plan
        const arbiterInput: ArbiterInput = {
          clevResult: cascadeResult.clevResult ?? {
            verdicts: verdict ? [verdict] : [],
            aggregatedScore: verdict?.overallScore ?? 0,
            finalRecommendation: verdict?.recommendation ?? 'REGENERATE',
            votingMethod: 'majority',
            consensusReached: false,
          },
          lessonContent: contentBody,
          operationMode,
        };

        arbiterOutput = await consolidateVerdicts(arbiterInput);

        // Build temporary LessonContent for refinement
        const tempLessonContent = buildLessonContent(state, contentBody, verdict.overallScore);

        // Execute targeted refinement
        const refinementInput: TargetedRefinementInput = {
          content: tempLessonContent,
          arbiterOutput,
          operationMode,
          ragChunks: state.ragChunks,
          lessonSpec: state.lessonSpec,
          language: state.language,
        };

        const refinementResult: TargetedRefinementOutput = await executeTargetedRefinement(refinementInput);

        refinementTokensUsed = refinementResult.tokensUsed;

        if (refinementResult.status === 'accepted' || refinementResult.status === 'accepted_warning') {
          finalContent = refinementResult.content;
          finalScore = refinementResult.finalScore;
          finalRecommendation = refinementResult.status === 'accepted' ? 'ACCEPT' : 'ACCEPT_WITH_MINOR_REVISION';

          logger.info({
            lessonId: state.lessonSpec.lesson_id,
            initialScore: verdict.overallScore,
            finalScore: refinementResult.finalScore,
            iterations: refinementResult.iterations,
            status: refinementResult.status,
          }, 'Judge node: Targeted refinement successful');
        } else if (refinementResult.status === 'best_effort') {
          finalContent = refinementResult.content;
          finalScore = refinementResult.finalScore;
          finalRecommendation = 'ACCEPT_WITH_MINOR_REVISION';

          logger.info({
            lessonId: state.lessonSpec.lesson_id,
            finalScore: refinementResult.finalScore,
            qualityStatus: refinementResult.bestEffortResult?.qualityStatus,
          }, 'Judge node: Targeted refinement returned best-effort');
        } else {
          // Escalated status handling:
          // - In semi-auto mode: escalate to human review
          // - In full-auto mode with no work done: if original CLEV score >= 0.75, accept with warning
          const noWorkDone = refinementResult.iterations <= 1 && refinementResult.tokensUsed <= arbiterOutput.tokensUsed;
          const originalScoreIsGood = verdict.overallScore >= 0.75;

          if (operationMode === 'full-auto' && noWorkDone && originalScoreIsGood) {
            // Arbiter rejected all issues but CLEV score was good - accept the original content
            // FIX: Use buildLessonContent instead of state.lessonContent which may be null
            // state.lessonContent is only set when content is ACCEPTED, not during the evaluation flow
            finalContent = buildLessonContent(state, contentBody, verdict.overallScore);
            finalScore = verdict.overallScore;
            finalRecommendation = 'ACCEPT_WITH_MINOR_REVISION';

            logger.info({
              lessonId: state.lessonSpec.lesson_id,
              status: 'accepted_fallback',
              originalScore: verdict.overallScore,
              heuristicScore: refinementResult.finalScore,
              reason: 'Arbiter rejected issues but CLEV score was good',
            }, 'Judge node: Targeted refinement escalated but accepting original (good CLEV score)');
          } else {
            needsRegeneration = refinementResult.status === 'escalated' && operationMode === 'semi-auto';
            needsHumanReview = refinementResult.status === 'escalated' && operationMode === 'semi-auto';
            finalRecommendation = needsRegeneration ? 'REGENERATE' : 'ESCALATE_TO_HUMAN';

            logger.warn({
              lessonId: state.lessonSpec.lesson_id,
              status: refinementResult.status,
              finalScore: refinementResult.finalScore,
            }, 'Judge node: Targeted refinement escalated');
          }
        }
        break;
      }

      case DecisionAction.REGENERATE: {
        // Content needs complete regeneration
        needsRegeneration = true;
        finalRecommendation = 'REGENERATE';

        logger.info({
          lessonId: state.lessonSpec.lesson_id,
          score: verdict.overallScore,
          reason: decision.reason,
        }, 'Judge node: Content needs REGENERATION');
        break;
      }

      case DecisionAction.ESCALATE_TO_HUMAN: {
        // Requires human review
        needsHumanReview = true;
        finalRecommendation = 'ESCALATE_TO_HUMAN';

        logger.info({
          lessonId: state.lessonSpec.lesson_id,
          score: verdict.overallScore,
          confidence: verdict.confidence,
        }, 'Judge node: Escalating to HUMAN REVIEW');
        break;
      }
    }

    // =========================================================================
    // STEP 4: Return Updated State
    // =========================================================================

    const durationMs = Date.now() - startTime;
    const totalTokensUsed = cascadeResult.totalTokensUsed + refinementTokensUsed;

    // Build enriched output for trace
    const enrichedOutput = buildEnrichedJudgeOutput(
      cascadeResult,
      state,
      needsRegeneration,
      needsHumanReview,
    );

    // Check if targeted refinement was used
    const usedTargetedRefinement = decision.action === DecisionAction.TARGETED_FIX || decision.action === DecisionAction.ITERATIVE_REFINEMENT;

    // Build progress summary for UI
    const completionProgress = buildJudgeProgressSummary(
      finalRecommendation,
      cascadeResult,
      decision.action,
      state.language,
      durationMs,
      totalTokensUsed,
      (state.retryCount || 0) + 1,
      state.progressSummary
    );

    // Log trace at completion (with progressSummary for UI)
    await logTrace({
      courseId: state.courseId,
      lessonId: state.lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'judge',
      stepName: 'judge_complete',
      inputData: {
        lessonLabel: state.lessonSpec.lesson_id,
        lessonTitle: state.lessonSpec.title,
        moduleNumber: state.lessonSpec.lesson_id.split('.')[0],
      },
      outputData: {
        ...enrichedOutput,
        hasLessonContent: finalContent !== null,
        progressSummary: completionProgress,
      },
      tokensUsed: totalTokensUsed,
      durationMs,
    });

    return {
      currentNode: 'judge',
      lessonContent: finalContent,
      qualityScore: finalScore,
      judgeVerdict: verdict,
      judgeRecommendation: finalRecommendation,
      needsRegeneration,
      needsHumanReview,
      previousScores: [finalScore],
      refinementIterationCount: state.refinementIterationCount + 1,
      // Increment retryCount if regeneration needed
      retryCount: needsRegeneration ? state.retryCount + 1 : state.retryCount,
      tokensUsed: totalTokensUsed,
      durationMs,
      progressSummary: completionProgress,
      // Targeted refinement state updates (only if used)
      ...(usedTargetedRefinement && {
        arbiterOutput,
        targetedRefinementStatus: finalContent ? 'accepted' as const : 'escalated' as const,
        targetedRefinementTokensUsed: refinementTokensUsed,
      }),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startTime;

    logger.error({
      lessonId: state.lessonSpec.lesson_id,
      error: errorMessage,
      durationMs,
    }, 'Judge node: Evaluation failed with exception');

    // Log trace on error
    await logTrace({
      courseId: state.courseId,
      lessonId: state.lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'judge',
      stepName: 'judge_error',
      inputData: {
        lessonLabel: state.lessonSpec.lesson_id,
        lessonTitle: state.lessonSpec.title,
        moduleNumber: state.lessonSpec.lesson_id.split('.')[0],
      },
      errorData: {
        error: errorMessage,
      },
      durationMs,
    });

    const errorProgress = buildJudgeProgressSummary(
      'REGENERATE',
      null,
      null,
      state.language,
      durationMs,
      0,
      (state.retryCount || 0) + 1,
      state.progressSummary
    );

    return {
      currentNode: 'judge',
      errors: [`Judge node error: ${errorMessage}`],
      needsRegeneration: true,
      judgeRecommendation: 'REGENERATE' as JudgeRecommendation,
      durationMs,
      progressSummary: errorProgress,
    };
  }
}

/**
 * Section Regenerator Node - Regenerates specific sections identified by self-reviewer
 *
 * Called when selfReviewResult.sectionsToRegenerate is populated.
 * Regenerates only the problematic sections and merges them back into the content.
 *
 * @param state - Current LangGraph state after selfReviewer node
 * @returns Updated state with regenerated content
 */
async function sectionRegeneratorNode(state: LessonGraphStateType): Promise<LessonGraphStateUpdate> {
  const startTime = Date.now();
  const sectionsToRegenerate = state.selfReviewResult?.sectionsToRegenerate || [];

  logger.info({
    lessonId: state.lessonSpec.lesson_id,
    currentNode: 'sectionRegenerator',
    sectionsToRegenerate,
    sectionCount: sectionsToRegenerate.length,
  }, 'Section regenerator: Starting section-level regeneration');

  // Log trace at start
  await logTrace({
    courseId: state.courseId,
    lessonId: state.lessonUuid || undefined,
    stage: 'stage_6',
    phase: 'section_regenerator',
    stepName: 'section_regen_start',
    inputData: {
      lessonLabel: state.lessonSpec.lesson_id,
      sectionsToRegenerate,
    },
    durationMs: 0,
  });

  try {
    // Regenerate sections
    const result = await regenerateSections({
      markdown: state.generatedContent || '',
      sectionIds: sectionsToRegenerate,
      lessonSpec: state.lessonSpec,
      ragChunks: state.ragChunks,
      language: state.language,
      modelOverride: state.modelOverride,
    });

    const durationMs = Date.now() - startTime;

    // Log trace at completion
    await logTrace({
      courseId: state.courseId,
      lessonId: state.lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'section_regenerator',
      stepName: 'section_regen_complete',
      inputData: {
        lessonLabel: state.lessonSpec.lesson_id,
      },
      outputData: {
        success: result.success,
        regeneratedSections: result.regeneratedSections,
        failedSections: result.failedSections,
        tokensUsed: result.tokensUsed,
      },
      tokensUsed: result.tokensUsed,
      durationMs,
    });

    if (!result.success) {
      logger.warn({
        lessonId: state.lessonSpec.lesson_id,
        failedSections: result.failedSections,
        errorMessage: result.errorMessage,
      }, 'Section regenerator: Some sections failed, proceeding with partial result');
    }

    logger.info({
      lessonId: state.lessonSpec.lesson_id,
      regeneratedSections: result.regeneratedSections,
      tokensUsed: result.tokensUsed,
      durationMs,
    }, 'Section regenerator: Completed');

    return {
      currentNode: 'sectionRegenerator' as LessonGraphNode,
      generatedContent: result.content,
      tokensUsed: result.tokensUsed,
      durationMs,
      sectionRegenerationResult: {
        sectionsRegenerated: result.regeneratedSections,
        tokensUsed: result.tokensUsed,
        durationMs,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startTime;

    logger.error({
      lessonId: state.lessonSpec.lesson_id,
      error: errorMessage,
      durationMs,
    }, 'Section regenerator: Failed with exception');

    // Log trace on error
    await logTrace({
      courseId: state.courseId,
      lessonId: state.lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'section_regenerator',
      stepName: 'section_regen_error',
      inputData: {
        lessonLabel: state.lessonSpec.lesson_id,
      },
      errorData: {
        error: errorMessage,
      },
      durationMs,
    });

    // On error, proceed to judge with original content
    return {
      currentNode: 'sectionRegenerator' as LessonGraphNode,
      errors: [`Section regeneration failed: ${errorMessage}`],
      durationMs,
    };
  }
}

// ============================================================================
// CONDITIONAL EDGE ROUTING
// ============================================================================

/**
 * Routing function for judge node conditional edges
 *
 * Determines next step based on judge evaluation:
 * - 'end': Content passed or needs human review (end the graph)
 * - 'generator': Content needs regeneration (restart pipeline)
 *
 * @param state - Current graph state after judge evaluation
 * @returns Next node name or END
 */
function shouldRetryAfterJudge(state: LessonGraphStateType): string {
  const maxRetries = HANDLER_CONFIG.MAX_REGENERATION_RETRIES;

  // Priority 1: If regeneration needed and we haven't exceeded retry limit, retry
  if (state.needsRegeneration && state.retryCount < maxRetries) {
    logger.debug({
      lessonId: state.lessonSpec.lesson_id,
      retryCount: state.retryCount,
      maxRetries,
    }, 'Judge routing: Routing to generator for regeneration');
    return 'generator';
  }

  // Priority 2: Max retries exceeded - log error and end
  if (state.needsRegeneration && state.retryCount >= maxRetries) {
    logger.error({
      lessonId: state.lessonSpec.lesson_id,
      retryCount: state.retryCount,
      maxRetries,
      qualityScore: state.qualityScore,
    }, 'Judge routing: Max regeneration retries exceeded - ending with failure');

    // Add error to state via mutation (LangGraph allows this for annotations)
    state.errors.push(
      `Max regeneration retries (${maxRetries}) exceeded. Quality score: ${((state.qualityScore ?? 0) * 100).toFixed(1)}%. ` +
      `Review LessonSpecification for key_topics/lesson_objectives mismatch.`
    );
    return '__end__';
  }

  // Priority 3: If content was accepted or needs human review, end the graph
  if (state.lessonContent !== null || state.needsHumanReview) {
    logger.debug({
      lessonId: state.lessonSpec.lesson_id,
      hasContent: state.lessonContent !== null,
      needsHumanReview: state.needsHumanReview,
    }, 'Judge routing: Ending graph');
    return '__end__';
  }

  // Default: end the graph (other condition)
  logger.debug({
    lessonId: state.lessonSpec.lesson_id,
    retryCount: state.retryCount,
    needsRegeneration: state.needsRegeneration,
  }, 'Judge routing: Ending graph (default)');
  return '__end__';
}

// ============================================================================
// SELF-REVIEWER ROUTING
// ============================================================================

/**
 * Routing function for selfReviewer node conditional edges
 *
 * Determines next step based on self-review evaluation:
 * - 'judge': Content passed or needs judge attention (PASS, PASS_WITH_FLAGS, FIXED, FLAG_TO_JUDGE)
 * - 'sectionRegenerator': Specific sections need regeneration (sectionsToRegenerate populated)
 * - 'generator': Content needs regeneration (REGENERATE status)
 * - '__end__': Max retries exceeded
 *
 * @param state - Current graph state after selfReviewer evaluation
 * @returns Next node name: 'judge', 'sectionRegenerator', 'generator', or '__end__'
 */
function shouldProceedToJudge(state: LessonGraphStateType): string {
  const selfReviewResult = state.selfReviewResult;

  // If no self-review result, proceed to judge (backward compatibility)
  if (!selfReviewResult) {
    logger.warn({
      lessonId: state.lessonSpec?.lesson_id ?? 'unknown',
    }, 'SelfReviewer routing: No selfReviewResult, proceeding to judge');
    return 'judge';
  }

  const status = selfReviewResult.status;

  // REGENERATE status: Fatal errors detected, skip judge and restart pipeline
  if (status === 'REGENERATE') {
    logger.info({
      lessonId: state.lessonSpec.lesson_id,
      status,
      reasoning: selfReviewResult.reasoning,
      issueCount: selfReviewResult.issues.length,
    }, 'SelfReviewer routing: REGENERATE status - routing to generator');

    // Check retry limit
    const maxRetries = HANDLER_CONFIG.MAX_REGENERATION_RETRIES;
    if (state.retryCount >= maxRetries) {
      logger.error({
        lessonId: state.lessonSpec.lesson_id,
        retryCount: state.retryCount,
        maxRetries,
      }, 'SelfReviewer routing: Max retries exceeded - ending graph');
      return '__end__';
    }

    return 'generator';
  }

  // NEW: Check if specific sections need regeneration (not full regenerate)
  const sectionsToRegenerate = selfReviewResult.sectionsToRegenerate;
  if (sectionsToRegenerate && sectionsToRegenerate.length > 0) {
    logger.info({
      lessonId: state.lessonSpec.lesson_id,
      status,
      sectionsToRegenerate,
      sectionCount: sectionsToRegenerate.length,
    }, 'SelfReviewer routing: Section-level regeneration needed - routing to sectionRegenerator');

    return 'sectionRegenerator';
  }

  // PASS, PASS_WITH_FLAGS, FIXED, FLAG_TO_JUDGE: Proceed to judge
  logger.debug({
    lessonId: state.lessonSpec.lesson_id,
    status,
    heuristicsPassed: selfReviewResult.heuristicsPassed,
    issueCount: selfReviewResult.issues.length,
  }, 'SelfReviewer routing: Proceeding to judge');

  return 'judge';
}

// ============================================================================
// GRAPH CREATION
// ============================================================================

/**
 * Create the Stage 6 StateGraph workflow
 *
 * Builds the lesson generation pipeline with:
 * - generator: Generate complete lesson content in one pass (serial section-by-section)
 * - selfReviewer: Pre-judge validation (Fail-Fast architecture)
 * - sectionRegenerator: Regenerate specific sections identified by selfReviewer
 * - judge: Validate quality and handle refinement/regeneration
 *
 * Pipeline flow:
 * START -> generator -> selfReviewer -> judge -> END
 *                        |              |
 *                        |              +-> generator (if regenerate needed)
 *                        +-> generator (if REGENERATE status)
 *                        +-> sectionRegenerator (if sectionsToRegenerate) -> judge
 *
 * @returns Compiled StateGraph ready for invocation
 */
function createStage6Graph() {
  const builder = new StateGraph(LessonGraphState)
    // Add nodes
    .addNode('generator', generatorNode)
    .addNode('selfReviewer', selfReviewerNode)
    .addNode('sectionRegenerator', sectionRegeneratorNode)
    .addNode('judge', judgeNode)
    // Define edges
    .addEdge(START, 'generator')
    .addEdge('generator', 'selfReviewer')
    // Conditional edge from selfReviewer: proceed to judge, sectionRegenerator, or regenerate
    .addConditionalEdges('selfReviewer', shouldProceedToJudge, {
      judge: 'judge',
      generator: 'generator',
      sectionRegenerator: 'sectionRegenerator',
      __end__: END,
    })
    // After section regeneration, proceed to judge
    .addEdge('sectionRegenerator', 'judge')
    // Conditional edge from judge: either end or retry
    .addConditionalEdges('judge', shouldRetryAfterJudge, {
      generator: 'generator',
      __end__: END,
    });

  return builder.compile();
}

// Singleton compiled graph for efficiency
let compiledGraph: ReturnType<typeof createStage6Graph> | null = null;

/**
 * Get or create the compiled graph (singleton pattern)
 *
 * Lazy initialization ensures graph is only compiled once.
 *
 * @returns Compiled StateGraph instance
 */
function getGraph() {
  if (!compiledGraph) {
    compiledGraph = createStage6Graph();
    logger.debug('Stage 6 graph compiled');
  }
  return compiledGraph;
}

// ============================================================================
// EXECUTION FUNCTIONS
// ============================================================================

/**
 * Execute Stage 6 lesson content generation
 *
 * Main entry point for generating a single lesson's content.
 * Invokes the LangGraph pipeline with the provided inputs.
 *
 * @param input - Stage 6 input with lessonSpec, courseId, and optional RAG context
 * @returns Stage 6 output with generated content and metrics
 *
 * @example
 * ```typescript
 * const result = await executeStage6({
 *   lessonSpec: myLessonSpec,
 *   courseId: 'abc-123',
 *   ragChunks: retrievedChunks,
 * });
 *
 * if (result.success) {
 *   console.log('Generated content:', result.lessonContent);
 * } else {
 *   console.error('Generation failed:', result.errors);
 * }
 * ```
 */
export async function executeStage6(input: Stage6Input): Promise<Stage6Output> {
  const startTime = Date.now();

  logger.info(
    {
      lessonId: input.lessonSpec.lesson_id,
      courseId: input.courseId,
      hasRagContext: Boolean(input.ragChunks?.length),
      ragChunkCount: input.ragChunks?.length ?? 0,
    },
    'Starting Stage 6 lesson generation'
  );

  try {
    const graph = getGraph();

    // Validate modelOverride format (should be "provider/model-name")
    let validatedModelOverride = input.modelOverride ?? null;
    if (validatedModelOverride && !validatedModelOverride.includes('/')) {
      logger.warn({
        lessonId: input.lessonSpec.lesson_id,
        modelOverride: validatedModelOverride,
      }, 'ModelOverride format invalid (expected "provider/model-name"), falling back to database config');
      validatedModelOverride = null;
    }

    // Build initial state
    const initialState: Partial<LessonGraphStateType> = {
      lessonSpec: input.lessonSpec,
      courseId: input.courseId,
      language: input.language,
      lessonUuid: input.lessonUuid ?? null,
      ragChunks: input.ragChunks ?? [],
      ragContextId: input.ragContextId ?? null,
      userRefinementPrompt: input.userRefinementPrompt ?? null,
      modelOverride: validatedModelOverride,
      currentNode: 'generator',
      errors: [],
      retryCount: 0,
    };

    // Execute graph
    const result = await graph.invoke(initialState);

    const durationMs = Date.now() - startTime;

    // Determine success based on output
    const success = Boolean(result.lessonContent) && result.errors.length === 0;

    logger.info(
      {
        lessonId: input.lessonSpec.lesson_id,
        success,
        durationMs,
        tokensUsed: result.tokensUsed,
        finalNode: result.currentNode,
        errorCount: result.errors.length,
      },
      'Stage 6 generation complete'
    );

    return {
      lessonContent: result.lessonContent ?? null,
      success,
      errors: result.errors,
      metrics: {
        tokensUsed: result.tokensUsed,
        durationMs,
        modelUsed: result.modelUsed ?? null,
        qualityScore: result.qualityScore ?? 0,
      },
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        lessonId: input.lessonSpec.lesson_id,
        error: errorMessage,
        durationMs,
      },
      'Stage 6 generation failed with exception'
    );

    return {
      lessonContent: null,
      success: false,
      errors: [errorMessage],
      metrics: {
        tokensUsed: 0,
        durationMs,
        modelUsed: null,
        qualityScore: 0,
      },
    };
  }
}

/**
 * Execute Stage 6 for multiple lessons (batch processing)
 *
 * Processes lessons in batches with controlled concurrency.
 * Uses Promise.all within batches for parallel execution.
 *
 * @param inputs - Array of Stage 6 inputs to process
 * @param concurrency - Maximum concurrent lesson generations (default: 5)
 * @returns Map of lesson_id -> Stage6Output
 *
 * @example
 * ```typescript
 * const inputs = lessons.map(spec => ({
 *   lessonSpec: spec,
 *   courseId: 'abc-123',
 *   ragChunks: ragChunksMap.get(spec.lesson_id),
 * }));
 *
 * const results = await executeStage6Batch(inputs, 3);
 *
 * results.forEach((output, lessonId) => {
 *   console.log(`Lesson ${lessonId}: ${output.success ? 'OK' : 'FAILED'}`);
 * });
 * ```
 */
export async function executeStage6Batch(
  inputs: Stage6Input[],
  concurrency: number = 5
): Promise<Map<string, Stage6Output>> {
  const results = new Map<string, Stage6Output>();

  logger.info(
    {
      totalLessons: inputs.length,
      concurrency,
    },
    'Starting Stage 6 batch generation'
  );

  const startTime = Date.now();

  // Process in batches
  for (let i = 0; i < inputs.length; i += concurrency) {
    const batch = inputs.slice(i, i + concurrency);
    const batchNumber = Math.floor(i / concurrency) + 1;
    const totalBatches = Math.ceil(inputs.length / concurrency);

    logger.debug(
      {
        batch: batchNumber,
        totalBatches,
        batchSize: batch.length,
      },
      'Processing batch'
    );

    // Execute batch in parallel
    const batchResults = await Promise.all(batch.map((input) => executeStage6(input)));

    // Store results
    batch.forEach((input, idx) => {
      results.set(input.lessonSpec.lesson_id, batchResults[idx]);
    });
  }

  const totalDuration = Date.now() - startTime;
  const successCount = Array.from(results.values()).filter((r) => r.success).length;

  logger.info(
    {
      totalLessons: inputs.length,
      successCount,
      failedCount: inputs.length - successCount,
      totalDurationMs: totalDuration,
      avgDurationMs: Math.round(totalDuration / inputs.length),
    },
    'Stage 6 batch generation complete'
  );

  return results;
}

// ============================================================================
// EXPORTS FOR TESTING
// ============================================================================

/**
 * Export graph creation for testing purposes
 * Allows unit tests to create isolated graph instances
 */
export { createStage6Graph };

/**
 * Export routing functions for testing
 * Allows unit tests to verify conditional edge logic
 */
export { shouldProceedToJudge, shouldRetryAfterJudge };

/**
 * Reset the singleton graph (for testing only)
 * Forces graph recompilation on next getGraph() call
 */
export function resetGraph(): void {
  compiledGraph = null;
  logger.debug('Stage 6 graph reset');
}
