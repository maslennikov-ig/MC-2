import type {
  JudgeRecommendation,
  ProgressSummary,
  SummaryItem,
} from '@megacampus/shared-types/judge-types';
import type { CascadeResult } from './cascade-evaluator';
import { DecisionAction } from './decision-engine';

/**
 * Copy for the judge progress summary, one entry per language.
 *
 * This used to be roughly thirty `isRussian ? … : …` ternaries threaded through the body of
 * `buildJudgeProgressSummary`, which is where its cyclomatic complexity of 59 came from: every
 * one of them is a branch, and none of them was a decision about anything. Putting the copy in
 * a table leaves the function with only the branches that ARE decisions, and puts every string
 * a user can see in one place, so adding a third language becomes adding a key rather than
 * editing thirty expressions.
 *
 * Selection is `language === 'ru' ? 'ru' : 'en'`, which is exactly what the ternaries did:
 * anything that is not Russian gets English.
 */
type ProgressLanguage = 'ru' | 'en';

interface ProgressCopy {
  phase: string;
  noCascadeData: string;
  evaluationCompleted: string;
  criticalIssues: (count: number) => string;
  majorIssues: (count: number) => string;
  heuristicCheck: (passed: boolean) => string;
  judgeConfidence: (confidence: string | undefined) => string;
  clevVoting: (voteCount: number) => string;
  decisions: Record<DecisionAction, string>;
  outcomes: Record<JudgeRecommendation, (scorePercent: number) => string>;
}

const COPY: Record<ProgressLanguage, ProgressCopy> = {
  ru: {
    phase: 'Оценка качества',
    noCascadeData: 'Нет данных каскадной оценки',
    evaluationCompleted: 'Оценка завершена',
    criticalIssues: count => `Найдено ${count} критических проблем`,
    majorIssues: count => `Найдено ${count} значительных проблем`,
    heuristicCheck: passed =>
      `Эвристическая проверка: ${passed ? 'пройдена' : 'обнаружены проблемы'}`,
    judgeConfidence: confidence => `Оценка судьи: ${confidence} уверенность`,
    clevVoting: voteCount => `CLEV голосование: ${voteCount} судей`,
    decisions: {
      [DecisionAction.ACCEPT]: 'Контент принят',
      [DecisionAction.TARGETED_FIX]: 'Выполнены точечные исправления',
      [DecisionAction.ITERATIVE_REFINEMENT]: 'Выполнено итеративное улучшение',
      [DecisionAction.REGENERATE]: 'Требуется полная регенерация',
      [DecisionAction.ESCALATE_TO_HUMAN]: 'Требуется проверка человеком',
    },
    outcomes: {
      ACCEPT: percent => `✓ Контент принят (оценка: ${percent}%)`,
      ACCEPT_WITH_MINOR_REVISION: percent =>
        `✓ Контент принят с исправлениями (оценка: ${percent}%)`,
      ITERATIVE_REFINEMENT: () => `→ Выполнено итеративное улучшение`,
      REGENERATE: percent => `✗ Требуется регенерация (оценка: ${percent}%)`,
      ESCALATE_TO_HUMAN: () => `⚠ Требуется проверка человеком`,
    },
  },
  en: {
    phase: 'Quality evaluation',
    noCascadeData: 'No cascade evaluation data',
    evaluationCompleted: 'Evaluation completed',
    criticalIssues: count => `Found ${count} critical issues`,
    majorIssues: count => `Found ${count} major issues`,
    heuristicCheck: passed => `Heuristic check: ${passed ? 'passed' : 'issues found'}`,
    judgeConfidence: confidence => `Judge evaluation: ${confidence} confidence`,
    clevVoting: voteCount => `CLEV voting: ${voteCount} judges`,
    decisions: {
      [DecisionAction.ACCEPT]: 'Content accepted',
      [DecisionAction.TARGETED_FIX]: 'Targeted fixes applied',
      [DecisionAction.ITERATIVE_REFINEMENT]: 'Iterative refinement applied',
      [DecisionAction.REGENERATE]: 'Full regeneration required',
      [DecisionAction.ESCALATE_TO_HUMAN]: 'Human review required',
    },
    outcomes: {
      ACCEPT: percent => `✓ Content accepted (score: ${percent}%)`,
      ACCEPT_WITH_MINOR_REVISION: percent =>
        `✓ Content accepted with revisions (score: ${percent}%)`,
      ITERATIVE_REFINEMENT: () => `→ Iterative refinement completed`,
      REGENERATE: percent => `✗ Regeneration required (score: ${percent}%)`,
      ESCALATE_TO_HUMAN: () => `⚠ Human review required`,
    },
  },
};

/** Anything that is not Russian is rendered in English, as it always has been. */
function copyFor(language: string): ProgressCopy {
  return language === 'ru' ? COPY.ru : COPY.en;
}

/**
 * What the judge found wrong: heuristic failure reasons verbatim, then a count per severity.
 *
 * `minor` issues are deliberately not surfaced — this list is what a user reads while waiting,
 * not the full verdict.
 */
function collectIssues(cascadeResult: CascadeResult, copy: ProgressCopy): SummaryItem[] {
  const issuesFound: SummaryItem[] = [];

  if (cascadeResult.heuristicResults && !cascadeResult.heuristicResults.passed) {
    for (const reason of cascadeResult.heuristicResults.failureReasons) {
      issuesFound.push({ text: reason, severity: 'warning' });
    }
  }

  const verdict = cascadeResult.singleJudgeVerdict || cascadeResult.clevResult?.verdicts?.[0];
  if (!verdict?.issues) return issuesFound;

  const criticalCount = verdict.issues.filter(issue => issue.severity === 'critical').length;
  const majorCount = verdict.issues.filter(issue => issue.severity === 'major').length;

  if (criticalCount > 0) {
    issuesFound.push({ text: copy.criticalIssues(criticalCount), severity: 'error' });
  }
  if (majorCount > 0) {
    issuesFound.push({ text: copy.majorIssues(majorCount), severity: 'warning' });
  }

  return issuesFound;
}

/** What the judge did: which cascade stages ran, then which decision came out of them. */
function collectActions(
  cascadeResult: CascadeResult,
  decisionAction: DecisionAction | null,
  copy: ProgressCopy
): SummaryItem[] {
  const actionsPerformed: SummaryItem[] = [
    {
      text: copy.heuristicCheck(cascadeResult.heuristicResults?.passed === true),
      severity: 'info',
    },
  ];

  if (cascadeResult.stage === 'single_judge') {
    actionsPerformed.push({
      text: copy.judgeConfidence(cascadeResult.singleJudgeVerdict?.confidence),
      severity: 'info',
    });
  } else if (cascadeResult.stage === 'clev_voting') {
    actionsPerformed.push({
      text: copy.clevVoting(cascadeResult.clevResult?.verdicts?.length ?? 0),
      severity: 'info',
    });
  }

  if (decisionAction) {
    actionsPerformed.push({
      text: copy.decisions[decisionAction],
      severity: decisionAction === DecisionAction.ACCEPT ? 'info' : 'warning',
    });
  }

  return actionsPerformed;
}

/**
 * Build localized progress summary for judge node UI display
 *
 * Generates user-friendly messages about what happened during judge evaluation.
 * Messages are localized based on the course language.
 *
 * @param recommendation - Final judge recommendation
 * @param cascadeResult - Result from cascade evaluation
 * @param decisionAction - Decision made by decision engine
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
  const copy = copyFor(language);
  const status = recommendation === 'REGENERATE' ? 'failed' : 'completed';
  const earlierAttempts = existingProgress?.attempts || [];

  // No cascade data: report the attempt, and say so rather than inventing a score.
  if (!cascadeResult) {
    return {
      status,
      currentPhase: copy.phase,
      language,
      attempts: [
        ...earlierAttempts,
        {
          node: 'judge',
          attempt,
          status,
          resultLabel: recommendation,
          issuesFound: [],
          actionsPerformed: [],
          outcome: copy.noCascadeData,
          durationMs,
          tokensUsed,
        },
      ],
      outcome: copy.evaluationCompleted,
    };
  }

  const scorePercent = Math.round((cascadeResult.finalScore ?? 0) * 100);
  const outcome = copy.outcomes[recommendation]?.(scorePercent) ?? copy.evaluationCompleted;

  return {
    status,
    currentPhase: copy.phase,
    language,
    attempts: [
      ...earlierAttempts,
      {
        node: 'judge',
        attempt,
        status,
        resultLabel: recommendation,
        issuesFound: collectIssues(cascadeResult, copy),
        actionsPerformed: collectActions(cascadeResult, decisionAction, copy),
        outcome,
        durationMs,
        tokensUsed,
      },
    ],
    outcome,
  };
}
