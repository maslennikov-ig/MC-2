import type {
  JudgeRecommendation,
  ProgressSummary,
  SummaryItem,
} from '@megacampus/shared-types/judge-types';
import type { CascadeResult } from './cascade-evaluator';
import { DecisionAction } from './decision-engine';

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
export function buildJudgeProgressSummary(
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
      attempts: [
        ...existingAttempts,
        {
          node: 'judge',
          attempt,
          status: recommendation === 'REGENERATE' ? 'failed' : 'completed',
          resultLabel: recommendation,
          issuesFound: [],
          actionsPerformed: [],
          outcome: isRussian ? 'Нет данных каскадной оценки' : 'No cascade evaluation data',
          durationMs,
          tokensUsed,
        },
      ],
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
        ? `✗ Требуется регенерация (оценка: ${scorePercent}%)`
        : `✗ Regeneration required (score: ${scorePercent}%)`;
      break;
    case 'ESCALATE_TO_HUMAN':
      outcome = isRussian ? `⚠ Требуется проверка человеком` : `⚠ Human review required`;
      break;
    default:
      outcome = isRussian ? 'Оценка завершена' : 'Evaluation completed';
  }

  return {
    status: recommendation === 'REGENERATE' ? 'failed' : 'completed',
    currentPhase: isRussian ? 'Оценка качества' : 'Quality evaluation',
    language,
    attempts: [
      ...(existingProgress?.attempts || []),
      {
        node: 'judge',
        attempt,
        status: recommendation === 'REGENERATE' ? 'failed' : 'completed',
        resultLabel: recommendation,
        issuesFound,
        actionsPerformed,
        outcome,
        durationMs,
        tokensUsed,
      },
    ],
    outcome,
  };
}
