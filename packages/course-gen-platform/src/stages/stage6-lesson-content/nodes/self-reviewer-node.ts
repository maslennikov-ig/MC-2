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
 *    - TODO: Not implemented in MVP
 *    - Future: Semantic validation using self-reviewer-prompt.ts
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
import type {
  LessonGraphStateType,
  LessonGraphStateUpdate,
} from '../state';
import type {
  SelfReviewResult,
  SelfReviewIssue,
  SelfReviewStatus,
  ProgressSummary,
  NodeAttemptSummary,
  SummaryItem,
} from '@megacampus/shared-types/judge-types';
import {
  checkLanguageConsistency,
  checkContentTruncation,
} from '../judge/heuristic-filter';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Self-reviewer uses heuristics only (no LLM calls), so token usage is always 0.
 * Extracted as constant for clarity and to avoid magic numbers.
 */
const HEURISTIC_TOKENS_USED = 0;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Heuristic check details for trace logging
 */
interface HeuristicCheckDetails {
  languageCheck: {
    passed: boolean;
    foreignCharacters: number;
    scriptsFound: string[];
  };
  truncationCheck: {
    passed: boolean;
    issues: string[];
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Self-Review configuration
 * Adjust thresholds based on production data
 */
export const SELF_REVIEW_CONFIG = {
  /** Threshold for critical language failures (>20 chars = REGENERATE) */
  criticalLanguageThreshold: 20,
  /** Threshold for critical truncation failures (>2 issues = REGENERATE) */
  criticalTruncationThreshold: 2,
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build heuristic check details for trace logging
 *
 * @param languageCheck - Language consistency check result
 * @param truncationCheck - Content truncation check result
 * @returns Structured heuristic details
 */
function buildHeuristicDetails(
  languageCheck: ReturnType<typeof checkLanguageConsistency>,
  truncationCheck: ReturnType<typeof checkContentTruncation>
): HeuristicCheckDetails {
  return {
    languageCheck: {
      passed: languageCheck.passed,
      foreignCharacters: languageCheck.foreignCharacters,
      scriptsFound: languageCheck.scriptsFound,
    },
    truncationCheck: {
      passed: truncationCheck.passed,
      issues: truncationCheck.truncationIssues,
    },
  };
}

/**
 * Determine final status based on issues
 *
 * @param criticalIssues - Critical issues found
 * @param minorIssues - Minor issues found
 * @returns Self-review status
 */
function determineFinalStatus(
  criticalIssues: SelfReviewIssue[],
  minorIssues: SelfReviewIssue[]
): SelfReviewStatus {
  if (criticalIssues.length > 0) {
    return 'REGENERATE';
  }

  if (minorIssues.length > 0) {
    return 'PASS_WITH_FLAGS';
  }

  return 'PASS';
}

/**
 * Build reasoning message based on status and issues
 *
 * @param status - Self-review status
 * @param criticalCount - Number of critical issues
 * @param minorCount - Number of minor issues
 * @returns Human-readable reasoning
 */
function buildReasoningMessage(
  status: SelfReviewStatus,
  criticalCount: number,
  minorCount: number
): string {
  switch (status) {
    case 'REGENERATE':
      return `Critical issues detected: ${criticalCount} critical failures found in heuristic checks`;
    case 'PASS_WITH_FLAGS':
      return `Heuristic checks passed with ${minorCount} minor observations`;
    case 'PASS':
      return 'Content passed all heuristic pre-checks';
    case 'FIXED':
      return 'Content patched to fix minor hygiene issues';
    case 'FLAG_TO_JUDGE':
      return 'Semantic issues flagged for Judge attention';
    default:
      return 'Unknown status';
  }
}

/**
 * Build localized progress summary for UI display
 *
 * Generates user-friendly messages about what happened during self-review.
 * Messages are localized based on the course language.
 *
 * @param status - Self-review status
 * @param issues - Issues found during review
 * @param language - Target language ('ru' or 'en')
 * @param heuristicDetails - Details from heuristic checks
 * @param durationMs - Duration in milliseconds
 * @param attempt - Current attempt number
 * @param existingProgress - Existing progress summary to append to
 * @returns Updated progress summary
 */
function buildSelfReviewProgressSummary(
  status: SelfReviewStatus,
  issues: SelfReviewIssue[],
  language: string,
  heuristicDetails: HeuristicCheckDetails | undefined,
  durationMs: number,
  attempt: number,
  existingProgress: ProgressSummary | null
): ProgressSummary {
  const isRussian = language === 'ru';

  // Build issues found list
  const issuesFound: SummaryItem[] = [];

  const criticalIssues = issues.filter((i) => i.severity === 'CRITICAL');
  const minorIssues = issues.filter((i) => i.severity !== 'CRITICAL');

  if (criticalIssues.length > 0) {
    for (const issue of criticalIssues) {
      if (issue.type === 'LANGUAGE') {
        issuesFound.push({
          text: isRussian
            ? `Критическая ошибка языка: обнаружены посторонние символы`
            : `Critical language error: foreign characters detected`,
          severity: 'error',
        });
      } else if (issue.type === 'TRUNCATION') {
        issuesFound.push({
          text: isRussian
            ? `Критическая ошибка структуры: контент обрезан или повреждён`
            : `Critical structure error: content truncated or corrupted`,
          severity: 'error',
        });
      } else {
        issuesFound.push({
          text: issue.description,
          severity: 'error',
        });
      }
    }
  }

  if (minorIssues.length > 0) {
    issuesFound.push({
      text: isRussian
        ? `Найдено ${minorIssues.length} незначительных замечаний`
        : `Found ${minorIssues.length} minor observations`,
      severity: 'warning',
    });
  }

  // Build actions performed list
  const actionsPerformed: SummaryItem[] = [];

  if (heuristicDetails) {
    actionsPerformed.push({
      text: isRussian
        ? `Проверка языка: ${heuristicDetails.languageCheck.passed ? 'пройдена' : 'обнаружены проблемы'}`
        : `Language check: ${heuristicDetails.languageCheck.passed ? 'passed' : 'issues found'}`,
      severity: 'info',
    });
    actionsPerformed.push({
      text: isRussian
        ? `Проверка структуры: ${heuristicDetails.truncationCheck.passed ? 'пройдена' : 'обнаружены проблемы'}`
        : `Structure check: ${heuristicDetails.truncationCheck.passed ? 'passed' : 'issues found'}`,
      severity: 'info',
    });
  }

  // Build outcome message
  let outcome: string;
  switch (status) {
    case 'PASS':
      outcome = isRussian
        ? '→ Направлено в Judge для оценки качества'
        : '→ Routed to Judge for quality evaluation';
      break;
    case 'PASS_WITH_FLAGS':
      outcome = isRussian
        ? '→ Направлено в Judge с отмеченными замечаниями'
        : '→ Routed to Judge with flagged observations';
      break;
    case 'REGENERATE':
      outcome = isRussian
        ? '→ Требуется полная регенерация контента'
        : '→ Full content regeneration required';
      break;
    case 'FIXED':
      outcome = isRussian
        ? '→ Исправлено, направлено в Judge'
        : '→ Fixed, routed to Judge';
      break;
    default:
      outcome = isRussian
        ? '→ Направлено в Judge'
        : '→ Routed to Judge';
  }

  // Create attempt summary
  const attemptSummary: NodeAttemptSummary = {
    node: 'selfReviewer',
    attempt,
    status: status === 'REGENERATE' ? 'failed' : 'completed',
    resultLabel: status,
    issuesFound,
    actionsPerformed,
    outcome,
    startedAt: new Date(),
    durationMs,
    tokensUsed: HEURISTIC_TOKENS_USED,
  };

  // Merge with existing progress or create new
  const existingAttempts = existingProgress?.attempts || [];

  return {
    status: status === 'REGENERATE' ? 'failed' : 'reviewing',
    currentPhase: isRussian ? 'Проверка качества' : 'Quality review',
    language,
    attempts: [...existingAttempts, attemptSummary],
    outcome: status === 'REGENERATE' ? outcome : undefined,
  };
}

// ============================================================================
// MAIN NODE FUNCTION
// ============================================================================

/**
 * Self-Reviewer Node - Pre-judge validation with Fail-Fast heuristics
 *
 * This node implements two-phase validation:
 * 1. FREE heuristic pre-checks (language, truncation)
 * 2. LLM-based semantic review (TODO: future implementation)
 *
 * For MVP, only Phase 1 is implemented to filter broken content.
 * Phase 2 will be added in future iteration for semantic validation.
 *
 * @param state - Current graph state with generatedContent
 * @returns Updated state with selfReviewResult
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

      const emptyContentProgress = buildSelfReviewProgressSummary(
        'REGENERATE',
        result.issues,
        state.language || 'en',
        undefined,
        result.durationMs,
        (state.retryCount || 0) + 1,
        state.progressSummary
      );

      // Log trace for UI visibility
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
          progressSummary: emptyContentProgress,
        },
        durationMs: result.durationMs,
      });

      return {
        currentNode: 'selfReviewer',
        selfReviewResult: result,
        progressSummary: emptyContentProgress,
      };
    }

    const language = state.language || 'en';
    const issues: SelfReviewIssue[] = [];

    // ============================================================================
    // PHASE 1: Heuristic Pre-Checks (FREE, no LLM)
    // ============================================================================

    nodeLogger.debug({ msg: 'Running heuristic pre-checks' });

    // Check 1: Language consistency
    const languageCheck = checkLanguageConsistency(generatedContent, language);

    // Check 2: Content truncation
    const truncationCheck = checkContentTruncation(generatedContent);

    // ============================================================================
    // CRITICAL FAILURE ANALYSIS
    // ============================================================================

    // NOTE: checkLanguageConsistency fails at >5 chars (heuristic threshold)
    // but self-reviewer only escalates to CRITICAL at >20 chars.
    // This creates progressive severity:
    // - 0-5 chars: PASS (clean)
    // - 6-20 chars: PASS_WITH_FLAGS (minor issue, not blocking)
    // - 21+ chars: REGENERATE (critical issue, blocking)

    // Language failures: More than 20 foreign characters is critical
    if (!languageCheck.passed && languageCheck.foreignCharacters > SELF_REVIEW_CONFIG.criticalLanguageThreshold) {
      issues.push({
        type: 'LANGUAGE',
        severity: 'CRITICAL',
        location: 'global',
        description: `Found ${languageCheck.foreignCharacters} foreign characters from ${languageCheck.scriptsFound.join(', ')} scripts. Expected language: ${language}`,
      });

      nodeLogger.warn({
        msg: 'Critical language consistency failure',
        foreignCharacters: languageCheck.foreignCharacters,
        scriptsFound: languageCheck.scriptsFound,
        samples: languageCheck.foreignSamples,
      });
    }

    // Truncation failures: More than 2 truncation issues is critical
    if (!truncationCheck.passed && truncationCheck.truncationIssues.length > SELF_REVIEW_CONFIG.criticalTruncationThreshold) {
      issues.push({
        type: 'TRUNCATION',
        severity: 'CRITICAL',
        location: 'global',
        description: truncationCheck.truncationIssues.join('; '),
      });

      nodeLogger.warn({
        msg: 'Critical truncation failure',
        issuesCount: truncationCheck.truncationIssues.length,
        issues: truncationCheck.truncationIssues,
        lastCharacter: truncationCheck.lastCharacter,
        hasMatchedCodeBlocks: truncationCheck.hasMatchedCodeBlocks,
      });
    }

    // ============================================================================
    // CRITICAL ISSUES: Return REGENERATE immediately
    // ============================================================================

    const criticalIssues = issues.filter((i) => i.severity === 'CRITICAL');
    if (criticalIssues.length > 0) {
      nodeLogger.warn({
        msg: 'Critical heuristic failures detected, skipping LLM review',
        criticalCount: criticalIssues.length,
        issues: criticalIssues.map((i) => i.description),
      });

      const heuristicDetails = buildHeuristicDetails(languageCheck, truncationCheck);
      const durationMs = Date.now() - startTime;

      const result: SelfReviewResult = {
        status: 'REGENERATE',
        reasoning: buildReasoningMessage('REGENERATE', criticalIssues.length, 0),
        issues,
        patchedContent: null,
        tokensUsed: HEURISTIC_TOKENS_USED,
        durationMs,
        heuristicsPassed: false,
        heuristicDetails,
      };

      const criticalProgress = buildSelfReviewProgressSummary(
        'REGENERATE',
        issues,
        language,
        heuristicDetails,
        durationMs,
        (state.retryCount || 0) + 1,
        state.progressSummary
      );

      // Log trace for UI visibility
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
          progressSummary: criticalProgress,
        },
        durationMs: result.durationMs,
      });

      return {
        currentNode: 'selfReviewer',
        selfReviewResult: result,
        progressSummary: criticalProgress,
      };
    }

    // ============================================================================
    // MINOR ISSUES: Add INFO-level observations
    // ============================================================================

    // Minor language issues (1-20 foreign characters)
    if (!languageCheck.passed) {
      issues.push({
        type: 'LANGUAGE',
        severity: 'INFO',
        location: 'global',
        description: `Minor script mixing: ${languageCheck.foreignCharacters} foreign characters from ${languageCheck.scriptsFound.join(', ')}. Examples: "${languageCheck.foreignSamples.join('", "')}"`,
      });

      nodeLogger.debug({
        msg: 'Minor language consistency issues',
        foreignCharacters: languageCheck.foreignCharacters,
        samples: languageCheck.foreignSamples,
      });
    }

    // Minor truncation issues (1-2 issues)
    if (!truncationCheck.passed) {
      issues.push({
        type: 'TRUNCATION',
        severity: 'INFO',
        location: 'global',
        description: truncationCheck.truncationIssues.join('; '),
      });

      nodeLogger.debug({
        msg: 'Minor truncation issues',
        issues: truncationCheck.truncationIssues,
      });
    }

    nodeLogger.debug({
      msg: 'Heuristic pre-checks passed',
      languageCheckPassed: languageCheck.passed,
      truncationCheckPassed: truncationCheck.passed,
      minorIssuesCount: issues.length,
    });

    // ============================================================================
    // PHASE 2: LLM-based Self-Review (TODO: Future Implementation)
    // ============================================================================

    // TODO: Implement full LLM-based semantic review in future iteration
    // This would use:
    // - buildSelfReviewerSystemPrompt()
    // - buildSelfReviewerUserMessage(language, lessonSpec, ragChunks, lessonContent)
    // - OpenRouter API call with model from ModelConfigService
    // - Parse response for FIXED, FLAG_TO_JUDGE statuses
    // - Track token usage with estimateSelfReviewerTokens()

    // For MVP, skip LLM review and return PASS or PASS_WITH_FLAGS

    // ============================================================================
    // BUILD FINAL RESULT
    // ============================================================================

    const heuristicDetails = buildHeuristicDetails(languageCheck, truncationCheck);
    const durationMs = Date.now() - startTime;

    const finalStatus = determineFinalStatus(criticalIssues, issues);
    const reasoning = buildReasoningMessage(finalStatus, criticalIssues.length, issues.length);

    const result: SelfReviewResult = {
      status: finalStatus,
      reasoning,
      issues,
      patchedContent: null,
      tokensUsed: HEURISTIC_TOKENS_USED,
      durationMs,
      heuristicsPassed: true,
      heuristicDetails,
    };

    nodeLogger.info({
      msg: 'Self-review completed',
      status: result.status,
      issuesCount: result.issues.length,
      criticalIssues: criticalIssues.length,
      minorIssues: issues.length - criticalIssues.length,
      durationMs: result.durationMs,
    });

    const successProgress = buildSelfReviewProgressSummary(
      finalStatus,
      issues,
      language,
      heuristicDetails,
      durationMs,
      (state.retryCount || 0) + 1,
      state.progressSummary
    );

    // Log trace for UI visibility
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
        issuesCount: result.issues.length,
        heuristicsPassed: result.heuristicsPassed,
        heuristicDetails: result.heuristicDetails,
        progressSummary: successProgress,
      },
      durationMs: result.durationMs,
    });

    return {
      currentNode: 'selfReviewer',
      selfReviewResult: result,
      progressSummary: successProgress,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    nodeLogger.error({
      msg: 'Self-reviewer node error',
      error: errorMessage,
    });

    const durationMs = Date.now() - startTime;
    const errorResult: SelfReviewResult = {
      status: 'REGENERATE',
      reasoning: `Self-review failed: ${errorMessage}`,
      issues: [{
        type: 'EMPTY',
        severity: 'CRITICAL',
        location: 'global',
        description: `Self-review error: ${errorMessage}`,
      }],
      patchedContent: null,
      tokensUsed: HEURISTIC_TOKENS_USED,
      durationMs,
      heuristicsPassed: false,
    };

    const errorProgress = buildSelfReviewProgressSummary(
      'REGENERATE',
      errorResult.issues,
      state.language || 'en',
      undefined,
      durationMs,
      (state.retryCount || 0) + 1,
      state.progressSummary
    );

    // Log trace for UI visibility (error case)
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
        status: errorResult.status,
        issuesCount: errorResult.issues.length,
        progressSummary: errorProgress,
      },
      errorData: {
        error: errorMessage,
      },
      durationMs,
    });

    return {
      currentNode: 'selfReviewer',
      selfReviewResult: errorResult,
      progressSummary: errorProgress,
    };
  }
}
