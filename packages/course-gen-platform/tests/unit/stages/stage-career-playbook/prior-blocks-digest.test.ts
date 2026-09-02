import { describe, expect, it } from 'vitest';
import type { CareerPlaybookBlockId, CareerPlaybookBlockState } from '@megacampus/shared-types';
import {
  CAREER_PLAYBOOK_PRIOR_DIGEST_MAX_TOKENS,
  buildCareerPlaybookPriorBlocksDigest,
  buildCareerPlaybookTargetPriorDigest,
} from '@/stages/stage-career-playbook/nodes/prior-blocks-digest';
import { validateContractLeakage } from '@/stages/stage-career-playbook/nodes/quality-checks';
import type { CareerPlaybookQualityCheckContext } from '@/stages/stage-career-playbook/nodes/quality-checks';

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
    expect(Math.ceil(digest.length / 4)).toBeLessThanOrEqual(
      CAREER_PLAYBOOK_PRIOR_DIGEST_MAX_TOKENS
    );
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

  // mc2-539pz: `\b` is an ASCII word boundary, so the Cyrillic stems never
  // matched and every Russian playbook shipped an empty cadence section. On the
  // 14 stored playbooks the fix takes Russian cadence lines from 12 to 221.
  it('collects a Russian cadence, not only an English one', () => {
    const digest = buildCareerPlaybookPriorBlocksDigest(
      blocks([
        [
          'block_1',
          [
            '## Метрики',
            '- Время первого ответа проверяется ежедневно.',
            '- Точность прогноза подтверждается ежеквартально.',
            '- Forecast accuracy is reviewed weekly.',
          ].join('\n'),
        ],
      ]),
      ['block_12']
    );

    expect(digest).toContain('Cadences already promised');
    expect(digest).toContain('проверяется ежедневно');
    expect(digest).toContain('подтверждается ежеквартально');
    expect(digest).toContain('reviewed weekly');
  });

  // mc2-u3t9n: the old rule accepted any line with a digit — 33% of every line
  // across the 14 stored playbooks — so row ordinals and clock times crowded the
  // real thresholds out of a shared ceiling.
  it('keeps a threshold and drops a number that is only structure', () => {
    const digest = buildCareerPlaybookPriorBlocksDigest(
      blocks([
        [
          'block_6',
          [
            '## KPI',
            '| 1 | Доля решённых с первого раза | Растёт по кварталам |',
            '| 2 | Целевое значение CSAT **>=90%** |',
            '| 09:00 – 09:30 | Просмотр дашбордов |',
            '3. Согласовать изменения с руководителем.',
            '- Средняя оценка качества — не менее 4 из 5.',
            '- Подробности приведены в Block 5.',
          ].join('\n'),
        ],
      ]),
      ['block_12']
    );

    expect(digest).toContain('Целевое значение CSAT >=90%');
    expect(digest).toContain('не менее 4 из 5');
    expect(digest).not.toContain('Доля решённых с первого раза');
    expect(digest).not.toContain('Просмотр дашбордов');
    expect(digest).not.toContain('Согласовать изменения с руководителем');
    expect(digest).not.toContain('Подробности приведены');
  });

  // The single section is only honest while no target sees different lines. If
  // a per-target difference is ever reintroduced, this fails instead of the
  // difference being silently dropped for every target but the first.
  it('gives every target of a group the same lines', () => {
    const generatedBlocks = wrapFixture();

    const perTarget = WRAP_TARGETS.map(blockId =>
      buildCareerPlaybookTargetPriorDigest(
        generatedBlocks,
        WRAP_TARGETS,
        blockId,
        CAREER_PLAYBOOK_PRIOR_DIGEST_MAX_TOKENS
      )
    );

    expect(new Set(perTarget).size).toBe(1);

    // Including the one target the code guards against handing its own matrix
    // back: block_5 belongs to group_1, where it is never a prior block anyway.
    const foundationTargets: CareerPlaybookBlockId[] = ['header', 'block_1', 'block_2', 'block_5'];
    const foundationPerTarget = foundationTargets.map(blockId =>
      buildCareerPlaybookTargetPriorDigest(
        generatedBlocks,
        foundationTargets,
        blockId,
        CAREER_PLAYBOOK_PRIOR_DIGEST_MAX_TOKENS
      )
    );
    expect(new Set(foundationPerTarget).size).toBe(1);
  });

  // The Role Canvas is generated by group 6 and summarizes blocks 11 and 14,
  // which group 4 wrote. It could not see either. Run 88fc2368 published
  // "growth toward director of sales / head of revenue" against a ladder that
  // names Head of Sales and VP of Sales, and promised a CRO-accepted forecast
  // "within the first month" against an onboarding plan that puts the first
  // forecast on Day 60. A job title is not a ledger metric and a ramp milestone
  // is not a cadence, so nothing carried them across.
  it('carries the published career steps and ramp milestones to a later summary block', () => {
    const generatedBlocks = blocks([
      [
        'block_11',
        `## 11. Career growth

| Step | Track | Promotion criterion |
| --- | --- | --- |
| Sales Manager B2B (current) | — | Baseline |
| Head of Sales | Management | Two consecutive green quarters |
| Principal Sales Strategist | Individual contributor | Playbook adopted function-wide |`,
      ],
      [
        'block_14',
        `## 14. Onboarding

| # | Win | Deadline |
| --- | --- | --- |
| 5 | Submits first forecast number to the CRO | Day 60 |

- Sprint gate (Day 30): can describe the funnel from CRM evidence.`,
      ],
    ]);

    const digest = buildCareerPlaybookTargetPriorDigest(
      generatedBlocks,
      ['block_24'],
      'block_24',
      CAREER_PLAYBOOK_PRIOR_DIGEST_MAX_TOKENS
    );

    expect(digest).toContain('Career steps and ramp milestones already published');
    expect(digest).toContain('Head of Sales');
    expect(digest).toContain('Principal Sales Strategist');
    expect(digest).toContain('Day 60');
    expect(digest).toContain('Day 30');
    // The column header is not a published step.
    expect(digest).not.toMatch(/block_11: Step\b/);
  });

  it('says nothing about steps when neither block has been written yet', () => {
    const digest = buildCareerPlaybookTargetPriorDigest(
      blocks([['block_2', '## 2. Anti-goals\n\n- Never change a comp plan retroactively.']]),
      ['block_24'],
      'block_24',
      CAREER_PLAYBOOK_PRIOR_DIGEST_MAX_TOKENS
    );

    expect(digest).not.toContain('Career steps and ramp milestones');
  });

  // mc2-o29g8. The digest sits in the prompt beside the content the model is
  // about to write, and a title that carries a writing rule gets written down
  // for the reader: six leaks across three stored documents, five of them about
  // restating a published fact. The guard is the shipped check itself — if the
  // digest would be a contract leak when it appears inside a block, the model
  // has a leak available to copy.
  it('carries nothing the contract-leak check would file against a block', () => {
    const digest = buildCareerPlaybookTargetPriorDigest(
      blocks([
        ['block_2', '## 2. Anti-goals\n\n- Never change a comp plan retroactively.'],
        [
          'block_5',
          `## 5. Decision authority

| Decision | Who decides |
| --- | --- |
| Tool selection | Align with the CRO before executing |
| Quota setting | Manager decision |`,
        ],
        [
          'block_6',
          `## 6. Metrics

| Metric | Target | Review |
| --- | --- | --- |
| Forecast accuracy | >=90% | Monthly |`,
        ],
        [
          'block_11',
          `## 11. Career ladder

| Step | Track | Promotion criterion |
| --- | --- | --- |
| Head of Sales | Management | Two consecutive green quarters |`,
        ],
      ]),
      ['block_10'],
      'block_10',
      CAREER_PLAYBOOK_PRIOR_DIGEST_MAX_TOKENS
    );

    const asBlock: Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> = {
      block_10: block(digest),
    };
    const leaks = validateContractLeakage(asBlock, {} as CareerPlaybookQualityCheckContext).filter(
      issue => issue.severity === 'critical'
    );

    expect(leaks).toEqual([]);
  });
});
