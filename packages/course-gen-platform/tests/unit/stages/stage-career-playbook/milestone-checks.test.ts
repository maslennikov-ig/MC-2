/**
 * Ramp deadlines, the third fact to get a ledger.
 *
 * The two contradictions below are the ones run 2896e72f actually shipped, and
 * the only reader who caught either was the LLM judge — once, late, and with no
 * way to confirm it. Everything here is a pure function over stored markdown.
 */

import { describe, expect, it } from 'vitest';
import type { CareerPlaybookBlockId, CareerPlaybookBlockState } from '@megacampus/shared-types';
import {
  validateMilestoneConsistency,
  validateRampOwnership,
} from '@/stages/stage-career-playbook/nodes/milestone-checks';
import {
  normalizeCareerPlaybookMilestone,
  normalizeCareerPlaybookMilestoneLedger,
  formatCareerPlaybookMilestoneLedgerForPrompt,
} from '@/stages/stage-career-playbook/nodes/quality-ledger';

function blocks(
  entries: Array<[CareerPlaybookBlockId, string]>
): Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> {
  return Object.fromEntries(
    entries.map(([blockId, content]) => [
      blockId,
      { content, status: 'completed', judge_verdict: null } as CareerPlaybookBlockState,
    ])
  );
}

const forecastLedger = [
  {
    key: 'first_forecast',
    label: 'Первый прогноз',
    offset: 'week 2',
    owner: 'Руководитель',
    scope: 'новый сотрудник',
  },
];

describe('normalizeCareerPlaybookMilestone', () => {
  it('reads a deadline written either way round, in either language', () => {
    expect(normalizeCareerPlaybookMilestone('Day 60')).toEqual({ canonical: 'day 60', days: 60 });
    expect(normalizeCareerPlaybookMilestone('60 days')).toEqual({ canonical: 'day 60', days: 60 });
    expect(normalizeCareerPlaybookMilestone('неделя 2')).toEqual({
      canonical: 'week 2',
      days: 14,
    });
    expect(normalizeCareerPlaybookMilestone('2 недели')).toEqual({ canonical: 'week 2', days: 14 });
  });

  it('reads an ordinal standing in for the number', () => {
    expect(normalizeCareerPlaybookMilestone('within the first month')).toEqual({
      canonical: 'month 1',
      days: 30,
    });
    expect(normalizeCareerPlaybookMilestone('за первый квартал')).toEqual({
      canonical: 'quarter 1',
      days: 90,
    });
  });

  // Days are the comparison unit precisely so that a guide mixing units for one
  // commitment can still be checked: these two are the same promise.
  it('makes mixed units comparable', () => {
    expect(normalizeCareerPlaybookMilestone('Day 60')?.days).toBe(
      normalizeCareerPlaybookMilestone('2 months')?.days
    );
  });

  it('returns null for a phrase carrying no readable deadline', () => {
    expect(normalizeCareerPlaybookMilestone('as soon as practical')).toBeNull();
    expect(normalizeCareerPlaybookMilestone('')).toBeNull();
  });
});

describe('normalizeCareerPlaybookMilestoneLedger', () => {
  it('canonicalizes the key and the deadline, and keeps the first of a duplicate', () => {
    const ledger = normalizeCareerPlaybookMilestoneLedger([
      { key: 'First Forecast', label: 'Первый прогноз', offset: '2 недели', owner: '', scope: '' },
      { key: 'first_forecast', label: 'Первый прогноз', offset: 'week 4', owner: '', scope: '' },
    ]);

    expect(ledger).toHaveLength(1);
    expect(ledger[0].key).toBe('first_forecast');
    expect(ledger[0].offset).toBe('week 2');
  });

  it('drops a row whose deadline nothing can read', () => {
    expect(
      normalizeCareerPlaybookMilestoneLedger([
        { key: 'ramp', label: 'Ramp', offset: 'when ready', owner: '', scope: '' },
      ])
    ).toEqual([]);
  });

  it('renders an explicit notice rather than an empty table', () => {
    expect(formatCareerPlaybookMilestoneLedgerForPrompt([])).toContain('none');
    expect(formatCareerPlaybookMilestoneLedgerForPrompt(forecastLedger)).toContain('| week 2 |');
  });
});

describe('validateMilestoneConsistency', () => {
  // Run 2896e72f, mc2-i6l0i: the Role Canvas promised week 4 while the
  // onboarding plan put the first forecast input at week 2.
  it('names the deviating block and tells it not to touch the others', () => {
    const issues = validateMilestoneConsistency(
      blocks([
        ['block_14', '| Первый прогноз отправлен в CRO | Неделя 2 |'],
        ['block_24', '- К неделе 4: первый прогноз сдан без поздних правок.'],
      ]),
      { milestoneLedger: forecastLedger }
    );

    expect(issues).toHaveLength(1);
    expect(issues[0].block_id).toBe('block_24');
    expect(issues[0].category).toBe('contradiction');
    expect(issues[0].description).toContain('week 4');
    expect(issues[0].description).toContain('week 2');
    expect(issues[0].suggestion).toContain('Change nothing in the other blocks');
  });

  it('accepts a block that states the same deadline in another unit', () => {
    expect(
      validateMilestoneConsistency(
        blocks([['block_24', '- В первые 14 дней: первый прогноз сдан.']]),
        { milestoneLedger: forecastLedger }
      )
    ).toEqual([]);
  });

  // The lesson the cadence check paid for: a checklist packs several
  // commitments, each with its own deadline, and reading across a comma blames
  // a sentence that is correct.
  it('reads the deadline inside the commitment own list item', () => {
    const issues = validateMilestoneConsistency(
      blocks([
        [
          'block_14',
          '- Онбординг: shadowing на неделе 4, первый прогноз на неделе 2, аттестация в месяце 3.',
        ],
      ]),
      { milestoneLedger: forecastLedger }
    );

    expect(issues).toEqual([]);
  });

  // Run 4e355bf4, block_18. Every date on this line is right, and the check
  // filed five criticals against it: every ledger label begins with "First", so
  // anchoring on the first long word started each search from five places and
  // found a neighbour's date. The locating word is the rarest one now.
  it('reads a whole ramp summarised on one line without blaming any of it', () => {
    const line =
      'The ramp is published in the onboarding plan, and each milestone has its own due point: first forecast submitted and first solo pipeline review in Week 2, first complete coaching cycle for each direct report and first documented playbook improvement by Day 30, first full owned operating cycle by Month 2, and first quarterly business review plus the end-of-probation assessment in Quarter 1.';

    const issues = validateMilestoneConsistency(blocks([['block_18', line]]), {
      milestoneLedger: [
        {
          key: 'first_forecast',
          label: 'First forecast submitted',
          offset: 'week 2',
          owner: '',
          scope: '',
        },
        {
          key: 'first_solo_review',
          label: 'First solo pipeline review',
          offset: 'week 2',
          owner: '',
          scope: '',
        },
        {
          key: 'first_coaching',
          label: 'First complete coaching cycle',
          offset: 'day 30',
          owner: '',
          scope: '',
        },
        {
          key: 'first_improvement',
          label: 'First documented playbook improvement',
          offset: 'day 30',
          owner: '',
          scope: '',
        },
        {
          key: 'first_cycle',
          label: 'First full owned operating cycle',
          offset: 'month 2',
          owner: '',
          scope: '',
        },
        {
          key: 'first_qbr',
          label: 'First quarterly business review completed',
          offset: 'quarter 1',
          owner: '',
          scope: '',
        },
      ],
    });

    expect(issues).toEqual([]);
  });

  it('still names the one wrong date on a line that lists several', () => {
    const line =
      'Each milestone has its own due point: first forecast submitted in Week 2, first complete coaching cycle by Quarter 1.';

    const issues = validateMilestoneConsistency(blocks([['block_18', line]]), {
      milestoneLedger: [
        {
          key: 'first_forecast',
          label: 'First forecast submitted',
          offset: 'week 2',
          owner: '',
          scope: '',
        },
        {
          key: 'first_coaching',
          label: 'First complete coaching cycle',
          offset: 'day 30',
          owner: '',
          scope: '',
        },
      ],
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].description).toContain('First complete coaching cycle');
    expect(issues[0].description).toContain('day 30');
  });

  it('ignores deadlines inside fenced diagrams', () => {
    expect(
      validateMilestoneConsistency(
        blocks([['block_11', '```mermaid\ngraph TD\n  A["Первый прогноз: неделя 4"]\n```']]),
        { milestoneLedger: forecastLedger }
      )
    ).toEqual([]);
  });

  // A playbook generated before the ledger existed must judge exactly as it did
  // before: silence is the only honest answer without an authority.
  it('says nothing when the ledger is empty', () => {
    expect(
      validateMilestoneConsistency(blocks([['block_24', '- К неделе 4: первый прогноз сдан.']]), {})
    ).toEqual([]);
  });

  it('says nothing about a commitment the ledger does not govern', () => {
    expect(
      validateMilestoneConsistency(
        blocks([['block_24', '- К неделе 6: аттестация по продукту пройдена.']]),
        { milestoneLedger: forecastLedger }
      )
    ).toEqual([]);
  });

  // Run b7925b1d. The paragraph states the deadline correctly and the NEXT
  // sentence happens to mention another week; without a sentence boundary the
  // neighbour sat closer to the anchor and block 18 was regenerated twice
  // against a date it had got right.
  it('does not read a deadline from the following sentence', () => {
    const line =
      'By Day 30 you complete your first documented coaching cycle, and by Day 60 you own one complete management and forecasting cycle. From Week 2 onward, you are in the seat.';

    expect(
      validateMilestoneConsistency(blocks([['block_18', line]]), {
        milestoneLedger: [
          {
            key: 'first_full_owned_cycle',
            label: 'Own one complete management and forecasting cycle',
            offset: 'day 60',
            owner: '',
            scope: '',
          },
        ],
      })
    ).toEqual([]);
  });

  it('still catches the deviation when the deadline in the same sentence is wrong', () => {
    const line =
      'By Week 2 you own one complete management and forecasting cycle. From Day 60 onward, you are in the seat.';

    const issues = validateMilestoneConsistency(blocks([['block_18', line]]), {
      milestoneLedger: [
        {
          key: 'first_full_owned_cycle',
          label: 'Own one complete management and forecasting cycle',
          offset: 'day 60',
          owner: '',
          scope: '',
        },
      ],
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].description).toContain('week 2');
  });
});

/**
 * The FAQ republishing the ramp.
 *
 * The ledger and the block_18 answer below are run b7925b1d's own, byte for
 * byte. That run had already been told to point at the ramp block rather than
 * repeat it, and its FAQ opens by saying so — then answers its first question
 * with Week 2, Day 30 and Day 60. Every date is correct, which is why nothing
 * caught it: the consistency check is looking for a disagreement.
 */
describe('validateRampOwnership', () => {
  const rampLedger = [
    {
      key: 'first_pipeline_review',
      label: 'Lead the first pipeline review',
      offset: 'week 2',
      owner: 'Hiring manager',
      scope: 'the new hire',
    },
    {
      key: 'first_forecast_submitted',
      label: 'Submit the first evidence-based forecast',
      offset: 'week 2',
      owner: 'Hiring manager',
      scope: 'the new hire',
    },
    {
      key: 'first_coaching_cycle',
      label: 'Complete the first documented coaching cycle',
      offset: 'day 30',
      owner: 'Hiring manager',
      scope: 'the new hire',
    },
    {
      key: 'first_full_owned_cycle',
      label: 'Own one complete management and forecasting cycle',
      offset: 'day 60',
      owner: 'Hiring manager',
      scope: 'the new hire',
    },
  ];

  const faqAnswerThatCopies = `## 18. FAQ

*Answers for the employee and the manager. Where an answer depends on ramp dates, the onboarding plan in Block 14 owns those dates — this section tells you what to do, not when.*

**1. I'm new to the role. When do I start running the team rhythms myself?**
You start with orientation and shadowing, then take the controls progressively. The onboarding plan in Block 14 sets the sequence and dates; what you should know now is that you lead your first pipeline review and submit your first evidence-based forecast in Week 2. By Day 30 you are expected to have completed your first documented coaching cycle, and by Day 60 you own one complete management and forecasting cycle.`;

  it('flags the FAQ answer that republishes dates the ramp block owns', () => {
    const issues = validateRampOwnership(blocks([['block_18', faqAnswerThatCopies]]), {
      milestoneLedger: rampLedger,
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ block_id: 'block_18', severity: 'critical' });
    expect(issues[0].description).toContain('Block 14');
    expect(issues[0].suggestion).toContain('Change nothing in Block 14');
  });

  it('says nothing when the FAQ answers the question and points at the ramp block', () => {
    const pointing = `## 18. FAQ

**1. I'm new to the role. What am I expected to run myself?**
You start with orientation and shadowing, then take the controls progressively. You lead the pipeline review and submit an evidence-based forecast yourself, with your hiring manager beside you rather than in front of you; the onboarding plan in Block 14 sets the sequence and the dates.`;

    expect(
      validateRampOwnership(blocks([['block_18', pointing]]), { milestoneLedger: rampLedger })
    ).toEqual([]);
  });

  it('leaves the ramp block alone: publishing the ramp is its job', () => {
    expect(
      validateRampOwnership(
        blocks([
          ['block_14', 'Lead the first pipeline review in Week 2. Coaching cycle by Day 30.'],
        ]),
        { milestoneLedger: rampLedger }
      )
    ).toEqual([]);
  });

  it('leaves a FAQ that names a commitment without a date alone', () => {
    const noDate = `## 18. FAQ

**1. Who runs the first pipeline review?**
You lead the first pipeline review; your hiring manager co-runs it. Block 14 has the date.`;

    expect(
      validateRampOwnership(blocks([['block_18', noDate]]), { milestoneLedger: rampLedger })
    ).toEqual([]);
  });

  it('says nothing without a ledger, as every check in this family does', () => {
    expect(validateRampOwnership(blocks([['block_18', faqAnswerThatCopies]]), {})).toEqual([]);
  });

  it('leaves a disagreeing date to the consistency check, which names the authority', () => {
    const wrongDate = `## 18. FAQ

**1. When do I lead the review?**
You lead the first pipeline review in Week 4.`;

    expect(
      validateRampOwnership(blocks([['block_18', wrongDate]]), { milestoneLedger: rampLedger })
    ).toEqual([]);
    expect(
      validateMilestoneConsistency(blocks([['block_18', wrongDate]]), {
        milestoneLedger: rampLedger,
      })
    ).not.toEqual([]);
  });
});
