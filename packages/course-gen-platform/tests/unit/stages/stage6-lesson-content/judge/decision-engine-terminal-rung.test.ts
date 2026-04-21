import { describe, expect, it } from 'vitest';
import {
  DecisionAction,
  makeDecision,
  type DecisionContext,
} from '@/stages/stage6-lesson-content/judge/decision-engine';
import type { JudgeIssue } from '@megacampus/shared-types';

function createContext(overrides: Partial<DecisionContext> = {}): DecisionContext {
  return {
    score: 0.76,
    confidence: 'medium',
    issues: [],
    iterationCount: 0,
    previousScores: [],
    contentAffectedPercentage: 0,
    isTerminalRemediationRung: true,
    ...overrides,
  };
}

describe('decision engine terminal remediation rung policy', () => {
  it('accepts pragmatic-quality terminal remediation results when no blocking issues remain', () => {
    const result = makeDecision(createContext());

    expect(result.action).toBe(DecisionAction.ACCEPT);
    expect(result.reason).toMatch(/terminal remediation/i);
  });

  it('does not depend on refinementIterationCount to pragmatically accept terminal remediation content', () => {
    const result = makeDecision(
      createContext({
        iterationCount: 0,
        previousScores: [],
      })
    );

    expect(result.action).toBe(DecisionAction.ACCEPT);
  });

  it('keeps non-terminal high-0.7 scores on the regenerate path after max iterations', () => {
    const result = makeDecision(
      createContext({
        isTerminalRemediationRung: false,
        iterationCount: 2,
        previousScores: [0.68, 0.72],
      })
    );

    expect(result.action).toBe(DecisionAction.REGENERATE);
  });

  it('does not auto-accept terminal remediation when factual issues remain', () => {
    const factualIssue: JudgeIssue = {
      criterion: 'factual_accuracy',
      severity: 'major',
      location: 'section 2',
      description: 'Claim is not supported by source material',
      suggestedFix: 'Verify against provided references',
    };

    const result = makeDecision(
      createContext({
        issues: [factualIssue],
      })
    );

    expect(result.action).toBe(DecisionAction.REGENERATE);
  });

  it('does not auto-accept terminal remediation below the pragmatic threshold', () => {
    const result = makeDecision(
      createContext({
        score: 0.74,
      })
    );

    expect(result.action).toBe(DecisionAction.REGENERATE);
  });
});
