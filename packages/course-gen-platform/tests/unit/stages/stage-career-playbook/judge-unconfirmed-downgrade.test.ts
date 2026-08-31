/**
 * The judge's authority stops where a deterministic check has its own.
 *
 * Run 2896e72f filed a `stale_date` critical against block_25 whose own text
 * ended "no defect is established here", and the block went to regeneration
 * anyway (mc2-3dw6j, the surviving form of mc2-1mr7r). These tests pin the fix
 * to the authority rather than to the wording: no assertion below depends on a
 * single word of the description, because a gate that recognises a verdict by
 * its prose is blinded by one rewrite.
 */

import { describe, expect, it } from 'vitest';
import type {
  CareerPlaybookJudgeIssue,
  CareerPlaybookJudgeVerdict,
} from '@megacampus/shared-types';
import { downgradeUnconfirmedDeterministicIssues } from '@/stages/stage-career-playbook/nodes/cross-block-judge';

function verdict(issues: CareerPlaybookJudgeIssue[]): CareerPlaybookJudgeVerdict {
  return { pass: issues.length === 0, score: 80, issues, needs_regeneration: [] };
}

const staleDateCritical: CareerPlaybookJudgeIssue = {
  block_id: 'block_25',
  severity: 'critical',
  category: 'stale_date',
  description:
    'The block-25 footer date matches the generation date, but it also contains an absolute version date and is otherwise compliant.',
  suggestion: 'Use a relative label.',
};

describe('downgradeUnconfirmedDeterministicIssues', () => {
  it('downgrades a critical the deterministic check ran on and did not confirm', () => {
    const [issue] = downgradeUnconfirmedDeterministicIssues([staleDateCritical], verdict([]), [
      'block_25',
    ]);

    expect(issue.severity).toBe('warning');
    expect(issue.category).toBe('stale_date');
    // The reason travels with the issue, so the downgrade rate is measurable
    // from a stored verdict without paying for another run.
    expect(issue.description).toContain('downgraded');
  });

  it('keeps the critical when the deterministic check found the same thing', () => {
    const deterministic = verdict([
      {
        block_id: 'block_25',
        severity: 'critical',
        category: 'stale_date',
        description: 'block_25 contains absolute calendar year(s) 2024.',
      },
    ]);

    expect(
      downgradeUnconfirmedDeterministicIssues([staleDateCritical], deterministic, ['block_25'])
    ).toEqual([staleDateCritical]);
  });

  it('keeps the critical for a block the deterministic pass never covered', () => {
    // The checks run over the current window; the judge also sees previously
    // generated groups. "No deterministic issue here" and "no deterministic
    // check ran here" are different facts, and only the first one is evidence.
    expect(
      downgradeUnconfirmedDeterministicIssues([staleDateCritical], verdict([]), ['block_5'])
    ).toEqual([staleDateCritical]);
  });

  it('leaves a contradiction critical alone — no deterministic check owns it', () => {
    const contradiction: CareerPlaybookJudgeIssue = {
      block_id: 'block_24',
      severity: 'critical',
      category: 'contradiction',
      description: 'The canvas promises week 4 while the onboarding plan puts it at week 2.',
    };

    expect(
      downgradeUnconfirmedDeterministicIssues([contradiction], verdict([]), ['block_24'])
    ).toEqual([contradiction]);
  });

  it('leaves warnings and uncategorized issues untouched', () => {
    const issues: CareerPlaybookJudgeIssue[] = [
      { ...staleDateCritical, severity: 'warning' },
      { block_id: 'block_25', severity: 'critical', description: 'No category at all.' },
    ];

    expect(downgradeUnconfirmedDeterministicIssues(issues, verdict([]), ['block_25'])).toEqual(
      issues
    );
  });

  it('downgrades each deterministically-owned category the pass did not confirm', () => {
    const categories = [
      'unmarked_example',
      'unreadable_reference',
      'metric_conflict',
      'unsourced_claim',
    ] as const;
    const issues = categories.map(category => ({
      ...staleDateCritical,
      block_id: 'block_9' as const,
      category,
    }));

    const downgraded = downgradeUnconfirmedDeterministicIssues(issues, verdict([]), ['block_9']);

    expect(downgraded.map(issue => issue.severity)).toEqual(categories.map(() => 'warning'));
  });
});
