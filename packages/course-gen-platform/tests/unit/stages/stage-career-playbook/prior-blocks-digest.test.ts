import { describe, expect, it } from 'vitest';
import type { CareerPlaybookBlockId, CareerPlaybookBlockState } from '@megacampus/shared-types';
import {
  buildCareerPlaybookPriorBlocksDigest,
  buildCareerPlaybookTargetPriorDigest,
} from '@/stages/stage-career-playbook/nodes/prior-blocks-digest';

function block(content: string): CareerPlaybookBlockState {
  return {
    content,
    status: 'generated',
    judge_verdict: null,
    generated_at: '2026-05-13T00:00:00.000Z',
    llm_model: 'mock-model',
    attempt: 1,
  };
}

function blocks(
  entries: Array<[CareerPlaybookBlockId, string]>
): Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> {
  return Object.fromEntries(entries.map(([blockId, content]) => [blockId, block(content)]));
}

describe('buildCareerPlaybookPriorBlocksDigest', () => {
  // block_2 (employee, manager) and block_5 (employee, manager) share no reader
  // with block_12 (hr-only). mc2-923ku: the digest's four sections are
  // contradiction guards over the single assembled document, not
  // repetition-avoidance guidance, so they must reach block_12 regardless.
  it("includes block_2's anti-goals and block_5's decision authority in block_12's digest", () => {
    const generatedBlocks = blocks([
      [
        'block_2',
        `## 2. Анти-цели

- Никогда не согласовывать скидку выше 20% без CRO.
- Никогда не нанимать сотрудника без утверждённого бюджета.
- Никогда не обещать клиенту недостижимый срок поставки.
- Никогда не менять план вознаграждения задним числом.`,
      ],
      [
        'block_5',
        `## 5. Матрица решений

| Решение | Автономия | Действие |
| --- | --- | --- |
| Ежедневные приоритеты | Full | Decide |
| Скидка 10% | Inform | Use policy |
| Скидка 20% | Recommend | Ask CRO |
| Условия контракта | Approval | Ask Legal |`,
      ],
    ]);

    const digest = buildCareerPlaybookPriorBlocksDigest(generatedBlocks, ['block_12']);

    expect(digest).toContain('Никогда не согласовывать скидку выше 20% без CRO');
    expect(digest).toContain('Скидка 20%');
  });

  // mc2-4win5: measured across the 14 stored completed playbooks, the six
  // targets of group_6_wrap were handed six byte-identical sections carved out
  // of one 1,500-token ceiling. Only 3% of the collected block 5 authority rows
  // survived and 66 of 84 targets lost an anti-goal.
  const LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К', 'Л', 'М'];

  function wrapFixture() {
    return blocks([
      [
        'block_2',
        [
          '## Анти-цели',
          ...LETTERS.map(
            letter => `- Никогда не допускать нарушение «${letter}» в ежедневной работе команды.`
          ),
        ].join('\n\n'),
      ],
      [
        'block_5',
        [
          '## Матрица решений',
          '| Решение | Автономия | Действие |',
          '| --- | --- | --- |',
          ...LETTERS.map(
            letter => `| Решение о бюджете «${letter}» | Approval | Согласовать с CRO |`
          ),
        ].join('\n'),
      ],
    ]);
  }

  const WRAP_TARGETS: CareerPlaybookBlockId[] = [
    'block_18',
    'block_22',
    'block_23',
    'block_24',
    'block_25',
    'block_26',
  ];

  // mc2-4win5: measured across the 14 stored completed playbooks, the six
  // targets of group_6_wrap were handed six byte-identical sections carved out
  // of one 1,500-token ceiling. Only 3% of the collected block 5 authority rows
  // survived and 66 of 84 targets lost an anti-goal.
  it('spends the ceiling once on the whole group instead of once per target', () => {
    const digest = buildCareerPlaybookPriorBlocksDigest(wrapFixture(), WRAP_TARGETS);

    expect(digest.split(/\n(?=For )/)).toHaveLength(1);
    expect(digest.startsWith('For every output block in this group:\n')).toBe(true);
    // Both priority sections survive in full instead of each copy fitting a sixth of the ceiling.
    for (const letter of LETTERS) {
      expect(digest).toContain(`Никогда не допускать нарушение «${letter}»`);
      expect(digest).toContain(`Решение о бюджете «${letter}»`);
    }
    expect(Math.ceil(digest.length / 4)).toBeLessThanOrEqual(1_500);
  });

  // `^решение\b` never fired: `\b` is an ASCII word boundary, so the Cyrillic
  // axis row was handed to the model as a decision and took one of the twelve
  // authority slots. `^decision\b` had the opposite failure and swallowed a real
  // English row.
  it('drops the table axis row without dropping a decision that starts with the same word', () => {
    const digest = buildCareerPlaybookPriorBlocksDigest(
      blocks([
        [
          'block_5',
          [
            '## Матрица решений',
            '| Решение | Автономия | Действие |',
            '| --- | --- | --- |',
            '| Решение о скидке до 20% | Inform | Применить политику |',
          ].join('\n'),
        ],
      ]),
      ['block_12']
    );

    expect(digest).not.toContain('Решение — Автономия — Действие');
    expect(digest).toContain('Решение о скидке до 20%');
  });

  it('drops an English axis row while keeping an English decision named "Decision …"', () => {
    const digest = buildCareerPlaybookPriorBlocksDigest(
      blocks([
        [
          'block_5',
          [
            '## Decision matrix',
            '| Decision | Autonomy | Action |',
            '| --- | --- | --- |',
            '| Decision on a discount above 20% | Recommend | Ask the CRO |',
          ].join('\n'),
        ],
      ]),
      ['block_12']
    );

    expect(digest).not.toContain('Decision — Autonomy — Action');
    expect(digest).toContain('Decision on a discount above 20%');
  });

  // The single section is only honest while no target sees different lines. If
  // a per-target difference is ever reintroduced, this fails instead of the
  // difference being silently dropped for every target but the first.
  it('gives every target of a group the same lines', () => {
    const generatedBlocks = wrapFixture();

    const perTarget = WRAP_TARGETS.map(blockId =>
      buildCareerPlaybookTargetPriorDigest(generatedBlocks, WRAP_TARGETS, blockId, 1_500)
    );

    expect(new Set(perTarget).size).toBe(1);

    // Including the one target the code guards against handing its own matrix
    // back: block_5 belongs to group_1, where it is never a prior block anyway.
    const foundationTargets: CareerPlaybookBlockId[] = ['header', 'block_1', 'block_2', 'block_5'];
    const foundationPerTarget = foundationTargets.map(blockId =>
      buildCareerPlaybookTargetPriorDigest(generatedBlocks, foundationTargets, blockId, 1_500)
    );
    expect(new Set(foundationPerTarget).size).toBe(1);
  });
});
