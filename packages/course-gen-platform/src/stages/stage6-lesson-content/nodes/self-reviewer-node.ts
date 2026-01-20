/**
 * Self-Reviewer Node for Stage 6 Lesson Content Generation
 * @module stages/stage6-lesson-content/nodes/self-reviewer-node
 *
 * Implements Fail-Fast pre-judge validation to reduce Judge token costs by 30-50%.
 * Runs between Smoother and Judge nodes.
 *
 * Architecture:
 * 1. Phase 1: Heuristic Pre-Checks (FREE, no LLM cost)
 *    - Language consistency (Unicode script detection)
 *    - Content truncation (incomplete sentences, unmatched code blocks)
 *    - Critical errors trigger immediate REGENERATE
 *
 * 2. Phase 2: LLM-based Self-Review (if heuristics pass)
 *    - Semantic validation using self-reviewer-prompt.ts
 *    - Self-fix capability for hygiene issues
 *    - Factual accuracy and alignment checks
 *
 * Status outcomes:
 * - PASS: Content clean, proceed to Judge
 * - PASS_WITH_FLAGS: Minor observations noted, proceed to Judge
 * - FIXED: Content patched, proceed to Judge with patched_content
 * - REGENERATE: Fatal errors, skip Judge and return failure
 * - FLAG_TO_JUDGE: Semantic issues flagged for Judge attention
 *
 * Reference:
 * - docs/DeepThink/enrichment-add-flow-ux-analysis.md
 * - specs/022-lesson-enrichments/stage-7-lesson-enrichments.md
 */

import { logger } from '@/shared/logger';
import { logTrace } from '@/shared/trace-logger';
import { saveRejectedContent } from '../services/database-service';
import type { LessonGraphStateType, LessonGraphStateUpdate } from '../state';
import type { SelfReviewResult, SelfReviewIssue } from '@megacampus/shared-types/judge-types';
import { MODEL_FALLBACK } from '../config';

// Import from extracted modules
import { HEURISTIC_TOKENS_USED, SELF_REVIEW_CONFIG } from './self-reviewer/self-reviewer-constants';
import { removeChatbotArtifacts } from './self-reviewer/self-reviewer-heuristics';
import {
  buildHeuristicDetails,
  buildReasoningMessage,
  buildHeuristicOnlyResult,
} from './self-reviewer/self-reviewer-helpers';
import { buildSelfReviewProgressSummary } from './self-reviewer/self-reviewer-progress';
import {
  runHeuristicPhase,
  analyzeCriticalIssues,
  buildMinorIssues,
} from './self-reviewer/self-reviewer-phases';
import {
  runLLMReview,
  buildLLMReviewResult,
  applyPatching,
} from './self-reviewer/self-reviewer-llm';

// Re-export for backward compatibility
export { removeChatbotArtifacts, SELF_REVIEW_CONFIG };

/**
 * Self-Reviewer Node - Pre-judge validation with two-phase Fail-Fast architecture
 *
 * Implements complete two-phase validation:
 * 1. FREE heuristic pre-checks (language consistency, content truncation)
 *    - Critical failures (>20 foreign chars, >2 truncation issues) → immediate REGENERATE
 *    - Minor issues added for LLM review
 * 2. LLM-based semantic review with self-fix capability
 *    - Uses buildSelfReviewerSystemPrompt() and buildSelfReviewerUserMessage()
 *    - Returns FIXED status with patchedContent for hygiene issues
 *    - Retry logic (3 attempts, exponential backoff) with heuristic fallback
 *
 * @param state - Current graph state with generatedContent
 * @returns Updated state with selfReviewResult (and updated generatedContent if patched)
 */
export async function selfReviewerNode(
  state: LessonGraphStateType
): Promise<LessonGraphStateUpdate> {
  const startTime = Date.now();
  const nodeLogger = logger.child({
    node: 'selfReviewer',
    lessonId: state.lessonSpec?.lesson_id,
  });

  try {
    nodeLogger.info({ msg: 'Starting self-review' });

    // ============================================================================
    // VALIDATION: Check for generated content
    // ============================================================================

    const generatedContent = state.generatedContent;
    if (!generatedContent) {
      return handleEmptyContent(state, startTime);
    }

    const language = state.language || 'en';

    // ============================================================================
    // PHASE 1: Heuristic Pre-Checks (FREE, no LLM)
    // ============================================================================

    nodeLogger.debug({ msg: 'Running heuristic pre-checks' });
    const heuristics = runHeuristicPhase(generatedContent, language);
    const totalSections = state.lessonSpec?.sections?.length ?? 0;
    const retryCount = state.retryCount ?? 0;

    // Analyze for critical issues
    const criticalAnalysis = analyzeCriticalIssues(
      generatedContent,
      heuristics,
      language,
      retryCount,
      totalSections
    );

    // ============================================================================
    // CRITICAL ISSUES: Return REGENERATE immediately
    // ============================================================================

    const criticalIssues = criticalAnalysis.issues.filter(i => i.severity === 'CRITICAL');
    if (criticalIssues.length > 0) {
      return handleCriticalIssues(
        state,
        generatedContent,
        heuristics,
        criticalAnalysis,
        criticalIssues,
        language,
        startTime
      );
    }

    // ============================================================================
    // MODEL FALLBACK: Persistent CJK issues
    // ============================================================================

    if (criticalAnalysis.requiresModelFallback) {
      return handleModelFallback(
        state,
        generatedContent,
        heuristics,
        criticalAnalysis,
        language,
        startTime
      );
    }

    // ============================================================================
    // MINOR ISSUES: Add INFO-level observations
    // ============================================================================

    const minorIssues = buildMinorIssues(heuristics);
    const allHeuristicIssues: SelfReviewIssue[] = [...criticalAnalysis.issues, ...minorIssues];

    nodeLogger.debug({
      msg: 'Heuristic pre-checks passed',
      languageCheckPassed: heuristics.languageCheck.passed,
      truncationCheckPassed: heuristics.truncationCheck.passed,
      minorIssuesCount: allHeuristicIssues.length,
    });

    // ============================================================================
    // PHASE 2: LLM-based Self-Review
    // ============================================================================

    nodeLogger.debug({ msg: 'Running LLM-based semantic review' });

    const llmResult = await runLLMReview({
      lessonSpec: state.lessonSpec,
      ragChunks: state.ragChunks || [],
      generatedContent,
      language,
    });

    // Handle LLM failure - fallback to heuristics only
    if (!llmResult.success) {
      nodeLogger.warn({
        msg: 'LLM review failed, falling back to heuristics-only',
        error: llmResult.error,
      });
      return buildHeuristicOnlyResult(
        buildHeuristicDetails(
          heuristics.languageCheck,
          heuristics.truncationCheck,
          heuristics.mermaidCheck
        ),
        allHeuristicIssues,
        language,
        state,
        startTime,
        llmResult.error || 'unknown error',
        llmResult.tokensUsed
      );
    }

    // ============================================================================
    // BUILD FINAL RESULT
    // ============================================================================

    const heuristicDetails = buildHeuristicDetails(
      heuristics.languageCheck,
      heuristics.truncationCheck,
      heuristics.mermaidCheck
    );
    const durationMs = Date.now() - startTime;

    let result = buildLLMReviewResult(
      llmResult,
      allHeuristicIssues,
      heuristicDetails,
      llmResult.tokensUsed,
      durationMs
    );

    // Apply patching if needed
    const { result: patchedResult, patchedContent } = applyPatching(result, generatedContent);
    result = patchedResult;

    nodeLogger.info({
      msg: 'Self-review completed with LLM',
      status: result.status,
      issuesCount: result.issues.length,
      heuristicIssues: allHeuristicIssues.length,
      llmIssues: llmResult.parsed?.issues.length ?? 0,
      wasPatched: patchedContent !== null,
      tokensUsed: result.tokensUsed,
      durationMs: result.durationMs,
    });

    const progressSummary = buildSelfReviewProgressSummary(
      result.status,
      result.issues,
      language,
      heuristicDetails,
      true,
      patchedContent !== null,
      durationMs,
      retryCount + 1,
      state.progressSummary
    );

    await logTrace({
      courseId: state.courseId,
      lessonId: state.lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'selfReviewer',
      stepName: 'selfReviewer_complete',
      inputData: {
        lessonLabel: state.lessonSpec.lesson_id,
        lessonTitle: state.lessonSpec.title,
      },
      outputData: {
        status: result.status,
        reasoning: result.reasoning,
        issuesCount: result.issues.length,
        issuesByType: countIssuesByType(result.issues),
        heuristicsPassed: result.heuristicsPassed,
        heuristicDetails: result.heuristicDetails,
        llmReviewPerformed: true,
        tokensUsed: result.tokensUsed,
        wasPatched: patchedContent !== null,
        progressSummary,
      },
      durationMs: result.durationMs,
    });

    // Build state update
    const stateUpdate: LessonGraphStateUpdate = {
      currentNode: 'selfReviewer',
      selfReviewResult: result,
      progressSummary,
    };

    if (patchedContent) {
      stateUpdate.generatedContent = patchedContent;
    }

    // Save rejected content if LLM returned REGENERATE status
    if (result.status === 'REGENERATE') {
      await saveRejectedContent(
        state.courseId,
        state.lessonSpec?.lesson_id ?? 'unknown',
        state.lessonUuid,
        generatedContent,
        result,
        retryCount + 1
      );
    }

    return stateUpdate;
  } catch (error) {
    return handleError(state, error, startTime);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Handle empty content case
 */
async function handleEmptyContent(
  state: LessonGraphStateType,
  startTime: number
): Promise<LessonGraphStateUpdate> {
  const nodeLogger = logger.child({ node: 'selfReviewer' });
  nodeLogger.warn({ msg: 'No generated content to review' });

  const result: SelfReviewResult = {
    status: 'REGENERATE',
    reasoning: 'No content available for review',
    issues: [
      {
        type: 'EMPTY',
        severity: 'CRITICAL',
        location: 'global',
        description: 'Generated content is missing or empty',
      },
    ],
    patchedContent: null,
    tokensUsed: HEURISTIC_TOKENS_USED,
    durationMs: Date.now() - startTime,
    heuristicsPassed: false,
  };

  const progressSummary = buildSelfReviewProgressSummary(
    'REGENERATE',
    result.issues,
    state.language || 'en',
    undefined,
    false,
    false,
    result.durationMs,
    (state.retryCount || 0) + 1,
    state.progressSummary
  );

  await logTrace({
    courseId: state.courseId,
    lessonId: state.lessonUuid || undefined,
    stage: 'stage_6',
    phase: 'selfReviewer',
    stepName: 'selfReviewer_complete',
    inputData: {
      lessonLabel: state.lessonSpec?.lesson_id ?? 'unknown',
      lessonTitle: state.lessonSpec?.title ?? 'Untitled',
    },
    outputData: {
      status: result.status,
      issuesCount: result.issues.length,
      heuristicsPassed: result.heuristicsPassed,
      progressSummary,
    },
    durationMs: result.durationMs,
  });

  return {
    currentNode: 'selfReviewer',
    selfReviewResult: result,
    progressSummary,
  };
}

/**
 * Handle critical heuristic issues
 */
async function handleCriticalIssues(
  state: LessonGraphStateType,
  generatedContent: string,
  heuristics: ReturnType<typeof runHeuristicPhase>,
  criticalAnalysis: ReturnType<typeof analyzeCriticalIssues>,
  criticalIssues: SelfReviewIssue[],
  language: string,
  startTime: number
): Promise<LessonGraphStateUpdate> {
  const nodeLogger = logger.child({ node: 'selfReviewer' });
  const retryCount = state.retryCount ?? 0;

  nodeLogger.warn({
    msg: 'Critical heuristic failures detected, skipping LLM review',
    criticalCount: criticalIssues.length,
    issues: criticalIssues.map(i => i.description),
  });

  const heuristicDetails = buildHeuristicDetails(
    heuristics.languageCheck,
    heuristics.truncationCheck,
    heuristics.mermaidCheck
  );
  const durationMs = Date.now() - startTime;

  const result: SelfReviewResult = {
    status: 'REGENERATE',
    reasoning: buildReasoningMessage('REGENERATE', criticalIssues.length, 0),
    issues: criticalAnalysis.issues,
    patchedContent: null,
    tokensUsed: HEURISTIC_TOKENS_USED,
    durationMs,
    heuristicsPassed: false,
    heuristicDetails,
  };

  const progressSummary = buildSelfReviewProgressSummary(
    'REGENERATE',
    criticalAnalysis.issues,
    language,
    heuristicDetails,
    false,
    false,
    durationMs,
    retryCount + 1,
    state.progressSummary
  );

  await logTrace({
    courseId: state.courseId,
    lessonId: state.lessonUuid || undefined,
    stage: 'stage_6',
    phase: 'selfReviewer',
    stepName: 'selfReviewer_complete',
    inputData: {
      lessonLabel: state.lessonSpec?.lesson_id ?? 'unknown',
      lessonTitle: state.lessonSpec?.title ?? 'Untitled',
    },
    outputData: {
      status: result.status,
      issuesCount: result.issues.length,
      criticalIssuesCount: criticalIssues.length,
      heuristicsPassed: result.heuristicsPassed,
      heuristicDetails: result.heuristicDetails,
      progressSummary,
    },
    durationMs: result.durationMs,
  });

  await saveRejectedContent(
    state.courseId,
    state.lessonSpec?.lesson_id ?? 'unknown',
    state.lessonUuid,
    generatedContent,
    result,
    retryCount + 1
  );

  // Include modelOverride if analysis requires fallback
  // This happens when CJK issue persists across retries
  const baseResult: LessonGraphStateUpdate = {
    currentNode: 'selfReviewer',
    selfReviewResult: result,
    progressSummary,
  };

  if (criticalAnalysis.requiresModelFallback && criticalAnalysis.fallbackModel) {
    return {
      ...baseResult,
      modelOverride: criticalAnalysis.fallbackModel,
      retryCount: retryCount + 1,
    };
  }

  return baseResult;
}

/**
 * Handle model fallback for persistent CJK issues
 */
async function handleModelFallback(
  state: LessonGraphStateType,
  generatedContent: string,
  heuristics: ReturnType<typeof runHeuristicPhase>,
  criticalAnalysis: ReturnType<typeof analyzeCriticalIssues>,
  language: string,
  startTime: number
): Promise<LessonGraphStateUpdate> {
  const retryCount = state.retryCount ?? 0;
  const heuristicDetails = buildHeuristicDetails(
    heuristics.languageCheck,
    heuristics.truncationCheck,
    heuristics.mermaidCheck
  );
  const durationMs = Date.now() - startTime;

  const result: SelfReviewResult = {
    status: 'REGENERATE',
    reasoning: `Persistent foreign characters (${heuristics.languageCheck.scriptsFound.join(', ')}) after ${retryCount} retry(ies). Switching to fallback model for regeneration.`,
    issues: criticalAnalysis.issues,
    patchedContent: null,
    tokensUsed: HEURISTIC_TOKENS_USED,
    durationMs,
    heuristicsPassed: false,
    heuristicDetails,
  };

  const progressSummary = buildSelfReviewProgressSummary(
    'REGENERATE',
    criticalAnalysis.issues,
    language,
    heuristicDetails,
    false,
    false,
    durationMs,
    retryCount + 1,
    state.progressSummary
  );

  await saveRejectedContent(
    state.courseId,
    state.lessonSpec?.lesson_id ?? 'unknown',
    state.lessonUuid,
    generatedContent,
    result,
    retryCount + 1
  );

  return {
    currentNode: 'selfReviewer',
    selfReviewResult: result,
    progressSummary,
    modelOverride: MODEL_FALLBACK.fallback,
    retryCount: retryCount + 1,
  };
}

/**
 * Handle errors during self-review
 */
async function handleError(
  state: LessonGraphStateType,
  error: unknown,
  startTime: number
): Promise<LessonGraphStateUpdate> {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const nodeLogger = logger.child({ node: 'selfReviewer' });
  const retryCount = state.retryCount ?? 0;

  nodeLogger.error({
    msg: 'Self-reviewer node error',
    error: errorMessage,
  });

  const durationMs = Date.now() - startTime;
  const result: SelfReviewResult = {
    status: 'REGENERATE',
    reasoning: `Self-review failed: ${errorMessage}`,
    issues: [
      {
        type: 'EMPTY',
        severity: 'CRITICAL',
        location: 'global',
        description: `Self-review error: ${errorMessage}`,
      },
    ],
    patchedContent: null,
    tokensUsed: HEURISTIC_TOKENS_USED,
    durationMs,
    heuristicsPassed: false,
  };

  const progressSummary = buildSelfReviewProgressSummary(
    'REGENERATE',
    result.issues,
    state.language || 'en',
    undefined,
    false,
    false,
    durationMs,
    retryCount + 1,
    state.progressSummary
  );

  await logTrace({
    courseId: state.courseId,
    lessonId: state.lessonUuid || undefined,
    stage: 'stage_6',
    phase: 'selfReviewer',
    stepName: 'selfReviewer_error',
    inputData: {
      lessonLabel: state.lessonSpec.lesson_id,
      lessonTitle: state.lessonSpec.title,
    },
    outputData: {
      status: result.status,
      issuesCount: result.issues.length,
      progressSummary,
    },
    errorData: {
      error: errorMessage,
    },
    durationMs,
  });

  await saveRejectedContent(
    state.courseId,
    state.lessonSpec?.lesson_id ?? 'unknown',
    state.lessonUuid,
    state.generatedContent,
    result,
    retryCount + 1
  );

  return {
    currentNode: 'selfReviewer',
    selfReviewResult: result,
    progressSummary,
  };
}

/**
 * Count issues by type for logging
 */
function countIssuesByType(issues: SelfReviewIssue[]): Record<string, number> {
  return {
    LANGUAGE: issues.filter(i => i.type === 'LANGUAGE').length,
    TRUNCATION: issues.filter(i => i.type === 'TRUNCATION').length,
    ALIGNMENT: issues.filter(i => i.type === 'ALIGNMENT').length,
    HALLUCINATION: issues.filter(i => i.type === 'HALLUCINATION').length,
    HYGIENE: issues.filter(i => i.type === 'HYGIENE').length,
    GRAMMAR: issues.filter(i => i.type === 'GRAMMAR').length,
    EMPTY: issues.filter(i => i.type === 'EMPTY').length,
    SHORT_SECTION: issues.filter(i => i.type === 'SHORT_SECTION').length,
    LOGIC: issues.filter(i => i.type === 'LOGIC').length,
  };
}
