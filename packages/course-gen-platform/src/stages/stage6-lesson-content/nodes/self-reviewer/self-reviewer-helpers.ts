/**
 * Self-Reviewer Helper Functions
 * @module stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-helpers
 *
 * Utility functions for the self-reviewer node including retry logic,
 * status determination, and result building.
 */

import type {
  SelfReviewResult,
  SelfReviewIssue,
  SelfReviewStatus,
} from '@megacampus/shared-types/judge-types';
import type { LessonGraphStateType, LessonGraphStateUpdate } from '../../state';
import {
  checkLanguageConsistency,
  checkContentTruncation,
  checkMermaidSyntax,
} from '../../judge/heuristic-filter';
import { locationToSectionId } from '../../utils/markdown-section-parser';
import { HEURISTIC_TOKENS_USED, type HeuristicCheckDetails } from './self-reviewer-constants';
import { buildSelfReviewProgressSummary } from './self-reviewer-progress';

// ============================================================================
// RETRY HELPER
// ============================================================================

/**
 * Retry helper with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts: number;
    delayMs: number;
    backoffMultiplier: number;
    retryOn?: (error: Error) => boolean;
  }
): Promise<T> {
  const { maxAttempts, delayMs, backoffMultiplier, retryOn } = options;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const shouldRetry = retryOn ? retryOn(lastError) : true;
      if (!shouldRetry || attempt === maxAttempts) {
        throw lastError;
      }

      const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error('All retry attempts failed');
}

// ============================================================================
// HEURISTIC DETAIL BUILDERS
// ============================================================================

/**
 * Build heuristic check details for trace logging
 *
 * @param languageCheck - Language consistency check result
 * @param truncationCheck - Content truncation check result
 * @param mermaidCheck - Mermaid syntax check result
 * @returns Structured heuristic details
 */
export function buildHeuristicDetails(
  languageCheck: ReturnType<typeof checkLanguageConsistency>,
  truncationCheck: ReturnType<typeof checkContentTruncation>,
  mermaidCheck?: ReturnType<typeof checkMermaidSyntax>
): HeuristicCheckDetails {
  const details: HeuristicCheckDetails = {
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

  if (mermaidCheck) {
    details.mermaidCheck = {
      passed: mermaidCheck.passed,
      issues: mermaidCheck.mermaidIssues,
      affectedDiagrams: mermaidCheck.affectedDiagrams,
      totalDiagrams: mermaidCheck.totalDiagrams,
    };
  }

  return details;
}

// ============================================================================
// STATUS DETERMINATION
// ============================================================================

/**
 * Determine final status based on issues
 *
 * @param criticalIssues - Critical issues found
 * @param minorIssues - Minor issues found
 * @returns Self-review status
 */
export function determineFinalStatus(
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
 * Extract unique section IDs from issues that are fixable
 *
 * Only includes sections with FIXABLE or COMPLEX issues (not CRITICAL).
 * Used to populate sectionsToRegenerate for partial content fixes.
 *
 * @param issues - List of self-review issues
 * @returns Array of unique section IDs
 */
export function extractSectionsToRegenerate(issues: SelfReviewIssue[]): string[] {
  const sectionIds = new Set<string>();

  for (const issue of issues) {
    // Only include fixable/complex issues, not critical (which require full regen)
    if (issue.severity === 'CRITICAL') {
      continue;
    }

    // Map location to section ID
    const sectionId = locationToSectionId(issue.location);
    if (sectionId) {
      sectionIds.add(sectionId);
    }
  }

  return Array.from(sectionIds);
}

// ============================================================================
// MESSAGE BUILDERS
// ============================================================================

/**
 * Build reasoning message based on status and issues
 *
 * @param status - Self-review status
 * @param criticalCount - Number of critical issues
 * @param minorCount - Number of minor issues
 * @returns Human-readable reasoning
 */
export function buildReasoningMessage(
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

// ============================================================================
// RESULT BUILDERS
// ============================================================================

/**
 * Build heuristic-only result when LLM review is skipped or fails
 *
 * @param heuristicDetails - Details from heuristic checks
 * @param issues - All detected issues
 * @param language - Target language code
 * @param state - Current graph state
 * @param startTime - Start timestamp for duration calculation
 * @param llmError - Optional LLM error message (e.g., "invalid response format")
 * @param llmTokensUsed - Optional tokens consumed by LLM call (even on failure)
 */
export function buildHeuristicOnlyResult(
  heuristicDetails: HeuristicCheckDetails,
  issues: SelfReviewIssue[],
  language: string,
  state: LessonGraphStateType,
  startTime: number,
  llmError?: string,
  llmTokensUsed?: number
): LessonGraphStateUpdate {
  const criticalIssues = issues.filter(i => i.severity === 'CRITICAL');
  const minorIssues = issues.filter(i => i.severity !== 'CRITICAL');
  const durationMs = Date.now() - startTime;
  const finalStatus = determineFinalStatus(criticalIssues, minorIssues);
  const reasoning = buildReasoningMessage(finalStatus, criticalIssues.length, minorIssues.length);

  // Include LLM error in reasoning if provided
  const reasoningSuffix = llmError ? `(LLM review failed: ${llmError})` : '(LLM review skipped)';

  const result: SelfReviewResult = {
    status: finalStatus,
    reasoning: `${reasoning} ${reasoningSuffix}`,
    issues,
    patchedContent: null,
    tokensUsed: llmTokensUsed ?? HEURISTIC_TOKENS_USED,
    durationMs,
    heuristicsPassed: true,
    heuristicDetails,
  };

  const progress = buildSelfReviewProgressSummary(
    finalStatus,
    issues,
    language,
    heuristicDetails,
    false, // llmReviewPerformed
    false, // patchedContent
    durationMs,
    (state.retryCount || 0) + 1,
    state.progressSummary
  );

  return {
    currentNode: 'selfReviewer',
    selfReviewResult: result,
    progressSummary: progress,
  };
}
