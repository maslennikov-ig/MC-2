/**
 * Ramp deadlines, the third fact to get a ledger.
 *
 * The two contradictions below are the ones run 2896e72f actually shipped, and
 * the only reader who caught either was the LLM judge — once, late, and with no
 * way to confirm it. Everything here is a pure function over stored markdown.
 */

import { describe, expect, it } from 'vitest';
import type { CareerPlaybookBlockId, CareerPlaybookBlockState } from '@megacampus/shared-types';
import { validateMilestoneConsistency } from '@/stages/stage-career-playbook/nodes/milestone-checks';
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
