import type { JudgeAggregatedResult, JudgeIssue } from '@megacampus/shared-types';

export interface FactualIssueVetoResult extends JudgeAggregatedResult {
  blockingFactualIssue?: JudgeIssue;
  vetoedJudgeModel?: string;
}

function isConcreteFactualIssue(issue: JudgeIssue): boolean {
  if (issue.criterion !== 'factual_accuracy') return false;
  if (issue.severity !== 'major' && issue.severity !== 'critical') return false;

  const text = `${issue.quotedText ?? ''} ${issue.description} ${issue.suggestedFix}`;
  return Boolean(issue.quotedText) || /\d/.test(text);
}

export function findBlockingFactualIssue(
  result: JudgeAggregatedResult
): { issue: JudgeIssue; judgeModel: string } | null {
  for (const verdict of result.verdicts) {
    const issue = verdict.issues.find(isConcreteFactualIssue);
    if (issue) {
      return {
        issue,
        judgeModel: verdict.judgeModel,
      };
    }
  }

  return null;
}

export function applyFactualIssueVeto(result: JudgeAggregatedResult): FactualIssueVetoResult {
  const blocking = findBlockingFactualIssue(result);
  if (!blocking) return result;

  const finalRecommendation =
    result.finalRecommendation === 'ACCEPT' ||
    result.finalRecommendation === 'ACCEPT_WITH_MINOR_REVISION'
      ? 'ITERATIVE_REFINEMENT'
      : result.finalRecommendation;

  return {
    ...result,
    finalRecommendation,
    aggregatedScore: Math.min(result.aggregatedScore, 0.79),
    blockingFactualIssue: blocking.issue,
    vetoedJudgeModel: blocking.judgeModel,
  };
}
