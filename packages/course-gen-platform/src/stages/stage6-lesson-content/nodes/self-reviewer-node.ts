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
import { MODEL_FALLBACK, HANDLER_CONFIG } from '../config';

// Import from extracted modules
import { HEURISTIC_TOKENS_USED, SELF_REVIEW_CONFIG } from './self-reviewer/self-reviewer-constants';
import {
  removeChatbotArtifacts,
  extractForeignCharFragments,
} from './self-reviewer/self-reviewer-heuristics';
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

    // Build detected issues from heuristic findings for targeted LLM fixing
    const detectedIssues =
      !heuristics.languageCheck.passed && heuristics.languageCheck.foreignCharacters > 0
        ? extractForeignCharFragments(generatedContent, heuristics.languageCheck.scriptsFound).map(
            frag => ({
              fragment: frag.fragment,
              context: frag.context,
              issueType: 'foreign_script' as const,
              description: `Foreign ${frag.scriptTypes.join('/')} characters detected. Translate to ${language} or remove if meaning is preserved.`,
            })
          )
        : undefined;

    // Log if detected issues were truncated (formatDetectedIssues limits to 10)
    if (detectedIssues && detectedIssues.length > 10) {
      nodeLogger.warn({
        msg: 'Detected issues truncated for LLM prompt',
        totalIssues: detectedIssues.length,
        included: 10,
        dropped: detectedIssues.length - 10,
      });
    }

    const llmResult = await runLLMReview({
      lessonSpec: state.lessonSpec,
      ragChunks: state.ragChunks || [],
      generatedContent,
      language,
      detectedIssues: detectedIssues && detectedIssues.length > 0 ? detectedIssues : undefined,
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

    // Apply patching if needed (includes safety net for foreign character stripping)
    const { result: patchedResult, patchedContent } = applyPatching(
      result,
      generatedContent,
      language
    );
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
        modelUsed: llmResult.modelUsed,
        heuristicsPassed: result.heuristicsPassed,
        heuristicDetails: result.heuristicDetails,
        llmReviewPerformed: true,
        tokensUsed: result.tokensUsed,
        wasPatched: patchedContent !== null,
        progressSummary,
      },
      modelUsed: llmResult.modelUsed,
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

    // Channel-safe terminal-state setup. Section-cap and REGENERATE paths are
    // MUTUALLY EXCLUSIVE to avoid double-stamping contradictory channel writes
    // (e.g. needsHumanReview=true AND regenerationMode='full_regenerate').
    //
    // Priority:
    //   1. Section-cap exceeded → terminal review_required, no REGENERATE mode
    //   2. REGENERATE status → telemetry + escalation/terminal policy
    //   3. Otherwise → state update proceeds without terminal flags
    const sections = result.sectionsToRegenerate;
    const sectionCapExceeded =
      sections != null && sections.length > HANDLER_CONFIG.MAX_SECTIONS_TO_REGENERATE;

    if (sectionCapExceeded) {
      const skipped = sections.length - HANDLER_CONFIG.MAX_SECTIONS_TO_REGENERATE;
      const reason =
        `Section regeneration request exceeds cap (${HANDLER_CONFIG.MAX_SECTIONS_TO_REGENERATE}). ` +
        `Requested ${sections.length} sections, skipped ${skipped}.`;
      stateUpdate.needsHumanReview = true;
      stateUpdate.needsRegeneration = false;
      stateUpdate.reviewInfo = { needsReview: true, reasons: [reason] };
      stateUpdate.errors = [reason];
      // Also bump retryCount so the safety net sees consistent counters
      stateUpdate.retryCount = retryCount + 1;
    } else if (result.status === 'REGENERATE') {
      const telemetryUpdate = buildRegenerateTelemetryUpdate(state, result.issues);
      stateUpdate.retryCount = retryCount + 1;
      stateUpdate.regenerationMode = telemetryUpdate.regenerationMode;
      stateUpdate.regenerateCount = telemetryUpdate.regenerateCount;
      stateUpdate.truncationCount = telemetryUpdate.truncationCount;
      stateUpdate.rejectedTokens = telemetryUpdate.rejectedTokens;

      applyChannelSafeEscalation(stateUpdate, retryCount + 1);

      // modelOverride is set even if escalation marked terminal: admin-triggered
      // retries and resume logic use this value to decide which model to try
      // next. Downstream (saveRejectedContent) records it for debugging.
      if (shouldEscalateTruncationRegenerate(retryCount, result.issues)) {
        stateUpdate.modelOverride = MODEL_FALLBACK.fallback;
      }
    }

    // Save rejected content if LLM returned REGENERATE status
    if (result.status === 'REGENERATE') {
      await saveRejectedContent(
        state.courseId,
        state.lessonSpec?.lesson_id ?? 'unknown',
        state.lessonUuid,
        generatedContent,
        result,
        retryCount + 1,
        {
          modelUsed: llmResult.modelUsed ?? state.modelUsed,
          selectedModel: state.selectedModel,
          fallbackModel: state.fallbackModel,
          selectedModelTier: state.selectedModelTier,
          selectedModelTierReason: state.selectedModelTierReason,
          modelOverride: state.modelOverride,
          regenerateCount: stateUpdate.regenerateCount ?? state.regenerateCount,
          truncationCount: stateUpdate.truncationCount ?? state.truncationCount,
          rejectedTokens: stateUpdate.rejectedTokens ?? state.rejectedTokens,
        }
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

  const telemetryUpdate = buildRegenerateTelemetryUpdate(state, result.issues);
  const nextRetryCount = (state.retryCount || 0) + 1;

  const stateUpdate: LessonGraphStateUpdate = {
    currentNode: 'selfReviewer',
    selfReviewResult: result,
    progressSummary,
    regenerationMode: telemetryUpdate.regenerationMode,
    regenerateCount: telemetryUpdate.regenerateCount,
    truncationCount: telemetryUpdate.truncationCount,
    rejectedTokens: telemetryUpdate.rejectedTokens,
    retryCount: nextRetryCount,
  };

  applyChannelSafeEscalation(stateUpdate, nextRetryCount);
  return stateUpdate;
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

  const telemetryUpdate = buildRegenerateTelemetryUpdate(state, result.issues);

  await saveRejectedContent(
    state.courseId,
    state.lessonSpec?.lesson_id ?? 'unknown',
    state.lessonUuid,
    generatedContent,
    result,
    retryCount + 1,
    {
      modelUsed: state.modelUsed,
      selectedModel: state.selectedModel,
      fallbackModel: state.fallbackModel,
      selectedModelTier: state.selectedModelTier,
      selectedModelTierReason: state.selectedModelTierReason,
      modelOverride: state.modelOverride,
      regenerateCount: telemetryUpdate.regenerateCount,
      truncationCount: telemetryUpdate.truncationCount,
      rejectedTokens: telemetryUpdate.rejectedTokens,
    }
  );

  // Include modelOverride if analysis requires fallback
  // This happens when CJK issue persists across retries
  const baseResult: LessonGraphStateUpdate = {
    currentNode: 'selfReviewer',
    selfReviewResult: result,
    progressSummary,
    regenerationMode: telemetryUpdate.regenerationMode,
    regenerateCount: telemetryUpdate.regenerateCount,
    truncationCount: telemetryUpdate.truncationCount,
    rejectedTokens: telemetryUpdate.rejectedTokens,
    retryCount: retryCount + 1,
  };

  applyChannelSafeEscalation(baseResult, retryCount + 1);

  // modelOverride is set even when escalation marked this state as terminal:
  // (1) admin retry / resume logic uses it to pick the model for the next run
  // (2) saveRejectedContent records it for debugging/attribution
  // The CJK persistent-fallback contract specifically requires this value
  // to survive into the terminal state.

  if (criticalAnalysis.requiresModelFallback && criticalAnalysis.fallbackModel) {
    return {
      ...baseResult,
      modelOverride: criticalAnalysis.fallbackModel,
    };
  }

  if (shouldEscalateTruncationRegenerate(retryCount, criticalAnalysis.issues)) {
    return {
      ...baseResult,
      modelOverride: MODEL_FALLBACK.fallback,
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

  const telemetryUpdate = buildRegenerateTelemetryUpdate(state, result.issues);

  await saveRejectedContent(
    state.courseId,
    state.lessonSpec?.lesson_id ?? 'unknown',
    state.lessonUuid,
    generatedContent,
    result,
    retryCount + 1,
    {
      modelUsed: state.modelUsed,
      selectedModel: state.selectedModel,
      fallbackModel: state.fallbackModel,
      selectedModelTier: state.selectedModelTier,
      selectedModelTierReason: state.selectedModelTierReason,
      modelOverride: state.modelOverride,
      regenerateCount: telemetryUpdate.regenerateCount,
      truncationCount: telemetryUpdate.truncationCount,
      rejectedTokens: telemetryUpdate.rejectedTokens,
    }
  );

  const stateUpdate: LessonGraphStateUpdate = {
    currentNode: 'selfReviewer',
    selfReviewResult: result,
    progressSummary,
    regenerationMode: telemetryUpdate.regenerationMode,
    regenerateCount: telemetryUpdate.regenerateCount,
    truncationCount: telemetryUpdate.truncationCount,
    rejectedTokens: telemetryUpdate.rejectedTokens,
    modelOverride: MODEL_FALLBACK.fallback,
    retryCount: retryCount + 1,
  };

  applyChannelSafeEscalation(stateUpdate, retryCount + 1);
  // modelOverride = MODEL_FALLBACK.fallback is preserved even when terminal:
  // downstream (saveRejectedContent, admin retry) consumes it.
  return stateUpdate;
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

  const telemetryUpdate = buildRegenerateTelemetryUpdate(state, result.issues);

  await saveRejectedContent(
    state.courseId,
    state.lessonSpec?.lesson_id ?? 'unknown',
    state.lessonUuid,
    state.generatedContent,
    result,
    retryCount + 1,
    {
      modelUsed: state.modelUsed,
      selectedModel: state.selectedModel,
      fallbackModel: state.fallbackModel,
      selectedModelTier: state.selectedModelTier,
      selectedModelTierReason: state.selectedModelTierReason,
      modelOverride: state.modelOverride,
      regenerateCount: telemetryUpdate.regenerateCount,
      truncationCount: telemetryUpdate.truncationCount,
      rejectedTokens: telemetryUpdate.rejectedTokens,
    }
  );

  const stateUpdate: LessonGraphStateUpdate = {
    currentNode: 'selfReviewer',
    selfReviewResult: result,
    progressSummary,
    regenerationMode: telemetryUpdate.regenerationMode,
    regenerateCount: telemetryUpdate.regenerateCount,
    truncationCount: telemetryUpdate.truncationCount,
    rejectedTokens: telemetryUpdate.rejectedTokens,
    retryCount: retryCount + 1,
  };

  // NOTE ON RETRY BUDGET (handler errors):
  // Unexpected exceptions in the self-reviewer flow (DB timeout during
  // trace-logging, serialization errors, etc.) ARE counted against the
  // regular MAX_REGENERATION_RETRIES budget via applyChannelSafeEscalation.
  // This means a transient error at the last budget step terminates
  // the graph as review_required. This is intentional fail-open behavior:
  //   - Persistent errors → terminate cleanly (avoid infinite loop)
  //   - Transient errors with budget left → retry via generator
  //   - Transient at last step → review_required is acceptable outcome
  //     because we can't distinguish transient vs persistent without
  //     tracking a separate handler-error counter.
  // If handler-error rate rises, consider a dedicated counter (follow-up).
  applyChannelSafeEscalation(stateUpdate, retryCount + 1);
  return stateUpdate;
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

export function buildRegenerateTelemetryUpdate(
  state: LessonGraphStateType,
  issues: SelfReviewIssue[]
): {
  regenerationMode: 'full_regenerate' | 'truncation_continuation';
  regenerateCount: number;
  truncationCount: number;
  rejectedTokens: number;
} {
  const lastGenerationTokens = state.lastGenerationTokens ?? 0;
  const rejectedTokens = (state.rejectedTokens ?? 0) + Math.max(0, lastGenerationTokens);
  const truncationOnly = isCriticalTruncationOnly(issues);

  if (truncationOnly) {
    return {
      regenerationMode: 'truncation_continuation',
      regenerateCount: state.regenerateCount ?? 0,
      truncationCount: (state.truncationCount ?? 0) + 1,
      rejectedTokens,
    };
  }

  return {
    regenerationMode: 'full_regenerate',
    regenerateCount: (state.regenerateCount ?? 0) + 1,
    truncationCount: state.truncationCount ?? 0,
    rejectedTokens,
  };
}

export function isCriticalTruncationOnly(issues: SelfReviewIssue[]): boolean {
  const criticalIssues = issues.filter(issue => issue.severity === 'CRITICAL');
  return criticalIssues.length > 0 && criticalIssues.every(issue => issue.type === 'TRUNCATION');
}

function shouldEscalateTruncationRegenerate(
  retryCount: number,
  issues: SelfReviewIssue[]
): boolean {
  if (!isCriticalTruncationOnly(issues)) {
    return false;
  }

  // retryCount is the count before this REGENERATE result is applied.
  return retryCount + 1 >= MODEL_FALLBACK.maxPrimaryAttempts;
}

/**
 * Channel-safe escalation and terminal-state decisions.
 *
 * LangGraph conditional-edge routing functions cannot reliably mutate state
 * (direct property assignments bypass the channel/reducer system and are lost
 * in the final graph output). All state transitions MUST be set inside nodes
 * so they go through the Annotation reducers.
 *
 * This function is called after buildRegenerateTelemetryUpdate to overlay:
 * - Truncation-cap → full_regenerate escalation (regenerationMode, regenerateCount)
 * - Terminal review_required (needsHumanReview, reviewInfo, errors) when all budgets are exhausted
 *
 * CAP OPERATOR CONVENTIONS (verify invariants):
 * - truncationCount > MAX_TRUNCATION_CONTINUATION_ATTEMPTS:
 *     Strict-greater semantics. MAX represents the NUMBER of allowed attempts;
 *     after MAX attempts the counter equals MAX, the (MAX+1)-th attempt triggers
 *     escalation. Example: MAX=2 allows 2 continuations (counter 1, 2), then
 *     on the 3rd attempt counter becomes 3 > 2 → escalate to full_regenerate.
 * - nextRetryCount >= MAX_REGENERATION_RETRIES:
 *     Greater-or-equal semantics. MAX represents the cap VALUE; when counter
 *     reaches MAX we terminate. Example: MAX=2 means on the 2nd retry the
 *     counter is 2 >= 2 → terminal review_required.
 *
 * The different operators are load-bearing: truncation uses "attempts completed
 * past MAX before escalating" (permissive), while regeneration uses "reached cap"
 * (strict). Keep in sync with safety-net operators in execute-stage6.ts.
 *
 * @param stateUpdate - Mutable state update being built by the self-reviewer node
 * @param nextRetryCount - retryCount AFTER this REGENERATE (i.e. already incremented)
 */
export function applyChannelSafeEscalation(
  stateUpdate: LessonGraphStateUpdate,
  nextRetryCount: number
): void {
  const isTruncation = stateUpdate.regenerationMode === 'truncation_continuation';
  const nextTruncationCount = stateUpdate.truncationCount ?? 0;
  const nextRegenerateCount = stateUpdate.regenerateCount ?? 0;

  if (isTruncation && nextTruncationCount > HANDLER_CONFIG.MAX_TRUNCATION_CONTINUATION_ATTEMPTS) {
    // Truncation cap exceeded — escalate or fail-open
    if (nextRegenerateCount < HANDLER_CONFIG.MAX_REGENERATION_RETRIES) {
      // ESCALATE to full_regenerate (channel-safe: fields go through reducer)
      stateUpdate.regenerationMode = 'full_regenerate';
      stateUpdate.regenerateCount = nextRegenerateCount + 1;
    } else {
      // Both budgets exhausted — terminal review_required
      const reason =
        `Truncation continuation attempts exceeded (${HANDLER_CONFIG.MAX_TRUNCATION_CONTINUATION_ATTEMPTS}). ` +
        `Marked as review_required (fail-open).`;
      stateUpdate.needsHumanReview = true;
      stateUpdate.needsRegeneration = false;
      stateUpdate.reviewInfo = { needsReview: true, reasons: [reason] };
      stateUpdate.errors = [reason];
    }
    return;
  }

  if (!isTruncation && nextRetryCount >= HANDLER_CONFIG.MAX_REGENERATION_RETRIES) {
    // Full-regenerate budget exhausted — terminal review_required
    const reason =
      `Self-review regeneration retries exceeded (${HANDLER_CONFIG.MAX_REGENERATION_RETRIES}). ` +
      `Last status: REGENERATE.`;
    stateUpdate.needsHumanReview = true;
    stateUpdate.needsRegeneration = false;
    stateUpdate.reviewInfo = { needsReview: true, reasons: [reason] };
    stateUpdate.errors = [reason];
  }
}
