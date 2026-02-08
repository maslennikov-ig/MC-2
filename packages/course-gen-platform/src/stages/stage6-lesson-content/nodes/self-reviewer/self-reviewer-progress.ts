/**
 * Self-Reviewer Progress Summary Builder
 * @module stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-progress
 *
 * Builds localized progress summaries for UI display.
 */

import type {
  SelfReviewStatus,
  SelfReviewIssue,
  ProgressSummary,
  NodeAttemptSummary,
  SummaryItem,
} from '@megacampus/shared-types/judge-types';
import { HEURISTIC_TOKENS_USED, type HeuristicCheckDetails } from './self-reviewer-constants';

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
 * @param llmReviewPerformed - Whether LLM review was performed
 * @param patchedContent - Whether content was auto-fixed
 * @param durationMs - Duration in milliseconds
 * @param attempt - Current attempt number
 * @param existingProgress - Existing progress summary to append to
 * @returns Updated progress summary
 */
export function buildSelfReviewProgressSummary(
  status: SelfReviewStatus,
  issues: SelfReviewIssue[],
  language: string,
  heuristicDetails: HeuristicCheckDetails | undefined,
  llmReviewPerformed: boolean,
  patchedContent: boolean,
  durationMs: number,
  attempt: number,
  existingProgress: ProgressSummary | null
): ProgressSummary {
  const isRussian = language === 'ru';

  // Build issues found list
  const issuesFound: SummaryItem[] = [];

  const criticalIssues = issues.filter(i => i.severity === 'CRITICAL');
  const minorIssues = issues.filter(i => i.severity !== 'CRITICAL');

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

  if (llmReviewPerformed) {
    actionsPerformed.push({
      text: isRussian ? `LLM-проверка выполнена` : `LLM review completed`,
      severity: 'info',
    });

    if (patchedContent) {
      const fixedCount = issues.filter(i => i.severity === 'FIXABLE').length;
      actionsPerformed.push({
        text: isRussian
          ? `Исправлено: ${fixedCount} проблем автоматически устранено`
          : `Fixed: ${fixedCount} issues automatically resolved`,
        severity: 'info',
      });
    }
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
      outcome = isRussian ? '→ Исправлено, направлено в Judge' : '→ Fixed, routed to Judge';
      break;
    default:
      outcome = isRussian ? '→ Направлено в Judge' : '→ Routed to Judge';
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
