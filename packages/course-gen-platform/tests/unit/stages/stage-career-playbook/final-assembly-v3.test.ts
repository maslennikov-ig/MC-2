/**
 * Regression tests for the application-owned parts of final assembly.
 *
 * The calibration table exists because the 2026-08-11 guide left it to the model
 * and got a six-row list that named none of the seven money values in the
 * document — the figures most likely to be copied verbatim into an official role
 * guide.
 */

import { describe, expect, it } from 'vitest';
import type {
  CareerPlaybookBlockId,
  CareerPlaybookBlockState,
  CareerPlaybookMetricLedgerEntry,
} from '@megacampus/shared-types';
import { findUnresolvedFillablePlaceholders } from '@/stages/stage-career-playbook/nodes/placeholder-detection';
import {
  appendCareerPlaybookCalibrationTable,
  collectCareerPlaybookCalibrationItems,
  normalizeCareerPlaybookBlockReferences,
} from '@/stages/stage-career-playbook/nodes/final-assembler';

function blocks(
  entries: Partial<Record<CareerPlaybookBlockId, string>>
): Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> {
  return Object.fromEntries(
    Object.entries(entries).map(([blockId, content]) => [
      blockId,
      { content: content as string, status: 'generated' as const, attempt: 1 },
    ])
  );
}

function metric(
  overrides: Partial<CareerPlaybookMetricLedgerEntry> & { label: string; target: string }
): CareerPlaybookMetricLedgerEntry {
  return {
    key: overrides.label.toLowerCase().replace(/\s+/g, '_'),
    unit: '%',
    green: overrides.target,
    yellow: '',
    red: '',
    review_period: 'quarter',
    provenance: 'assumption',
    source_ref: null,
    ...overrides,
  };
}

describe('collectCareerPlaybookCalibrationItems', () => {
  it('finds every marked value across blocks, in block order', () => {
    const items = collectCareerPlaybookCalibrationItems(
      blocks({
        block_15:
          '- An illustrative package (example — replace) could be: base $120,000, target variable 50% of base.',
        block_12: '"What is more satisfying: closing a $100K (example — replace) deal yourself?"',
        block_16: '**A**ssessment: the gap equals approximately €200,000 (example — replace).',
      })
    );

    expect(items.map(item => item.blockId)).toEqual(['block_12', 'block_15', 'block_16']);
    expect(items[2].value).toContain('€200,000');
  });

  it('accepts marker variants that carry a qualifier', () => {
    const items = collectCareerPlaybookCalibrationItems(
      blocks({ block_15: '- Annual conference budget (example — replace: $4,000).' })
    );

    expect(items).toHaveLength(1);
  });

  it('ignores markers inside fenced blocks', () => {
    const items = collectCareerPlaybookCalibrationItems(
      blocks({ block_10: '```mermaid\nA["$5,000 (example — replace)"]\n```' })
    );

    expect(items).toEqual([]);
  });

  it('skips block 26, which hosts the table itself', () => {
    const items = collectCareerPlaybookCalibrationItems(
      blocks({ block_26: '| Block 15 | $120,000 (example — replace) | ... |' })
    );

    expect(items).toEqual([]);
  });
});

// The bracket rule was a whitelist of six labels, chosen to avoid false
// positives. Measured across all 19 stored playbooks it matched 11 of 158
// bracketed tokens, and 13 of them shipped a raw placeholder to a reader. The
// inverted rule matched all 158 and produced no false positive on that corpus.
describe('shouldTreatBracketAsFillableField', () => {
  it.each([
    '[Заполняется]',
    '[поле для заполнения]',
    '[Enter date]',
    '[Insert number]',
    '[ФИО, должность]',
    '[краткое описание]',
    '[research: onboarding insights]',
    '[название CRM]',
  ])('recognises %s, which the six-label list did not', token => {
    expect(findUnresolvedFillablePlaceholders(`A line with ${token} in it.`)).toEqual([token]);
  });

  it('leaves markdown alone: links, citations and task boxes', () => {
    const line = [
      'See [the policy](https://example.com/policy) and [S3], [S12].',
      '- [ ] Confirm the plan',
      '- [x] Signed off',
      'A [reference link][policy-ref] resolves elsewhere.',
    ].join('\n');

    expect(findUnresolvedFillablePlaceholders(line)).toEqual([]);
  });

  it('still ignores a Mermaid label inside a fence', () => {
    expect(findUnresolvedFillablePlaceholders('```mermaid\nA["Team Lead (Block 9)"]\n```')).toEqual(
      []
    );
  });
});

describe('appendCareerPlaybookCalibrationTable', () => {
  it('lists one row per marked value, replacing the model own attempt', () => {
    const result = appendCareerPlaybookCalibrationTable(
      blocks({
        block_15: 'base $120,000 (example — replace) and a $5,000 offsite (example — replace).',
        block_26:
          '## 26. Implementation checklist\n\n### Calibrate before publishing\n\n| Location | Value |\n| --- | --- |\n| Block 6 | lead SLA |\n\n### Manager checklist\n\n- Align on KPI targets',
      })
    );

    const content = result.block_26!.content;
    const rows = content.split('\n').filter(line => /^\| Motivation \|/.test(line));

    expect(rows).toHaveLength(2);
    expect(content).toContain('$120,000');
    expect(content).toContain('$5,000');
    // The model's own six-row attempt must not survive alongside the real one.
    expect(content).not.toContain('lead SLA');
    expect(content).toContain('Manager checklist');
  });

  // Run d5137bc5 and 638ed691 both broke the citation rule from inside this
  // function. Block 26 is read by the manager and HR; the table scans every
  // block; and labelling a row "Block 8" pointed both readers at a page only one
  // of them holds. 27 of the 28 unreachable references in run 638ed691 came from
  // here, and neither the prompt nor two regenerations could remove them,
  // because the table is re-appended at every assembly.
  it('names a row by its section, never as a block a reader may not hold', () => {
    const result = appendCareerPlaybookCalibrationTable(
      blocks({
        block_8:
          '## 8. Tools and technologies\n\n| CRM | Salesforce (example — replace) | System of record |',
        block_23: '## 23. Continuity plan\n\n- Backup contact: Dana Kovacs (example — replace).',
        block_26: '## 26. Implementation checklist\n\n- Align on KPI targets',
      })
    );

    const content = result.block_26!.content;
    expect(content).toContain('| Section | Value to replace | Context |');
    expect(content).toContain('| Tools and technologies |');
    expect(content).toContain('| Continuity plan |');
    expect(content).not.toMatch(/\|\s*Block\s*\d+\s*\|/);
  });

  it('uses the guide own localized heading rather than a second English copy', () => {
    const result = appendCareerPlaybookCalibrationTable(
      blocks({
        block_8:
          '## 8. Инструменты и технологии\n\n| CRM | Salesforce (пример — заменить) | Система учёта |',
        block_26: '## 26. Чеклист внедрения\n\n- Согласовать цели',
      })
    );

    expect(result.block_26!.content).toContain('| Инструменты и технологии |');
  });

  it('adds nothing when the document carries no marked value', () => {
    const input = blocks({ block_26: '## 26. Implementation checklist\n\n- Align on KPI targets' });
    expect(appendCareerPlaybookCalibrationTable(input)).toBe(input);
  });

  // Run 88fc2368 wrote "**Calibrate before publishing — replace every value
  // marked as an example**", and the pattern demanded the closing ** right after
  // the heading. The reader met the heading twice: the model's four-item list,
  // then this table.
  it('replaces a bold model section that carries a subtitle inside the bold', () => {
    const result = appendCareerPlaybookCalibrationTable(
      blocks({
        block_15: 'base $120,000 (example — replace).',
        block_26: [
          '## 26. Implementation checklist',
          '',
          '**Calibrate before publishing — replace every value marked as an example**',
          '',
          '- The peer buddy weekly time commitment (example — replace).',
        ].join('\n'),
      })
    );

    const content = result.block_26!.content;
    expect(content.match(/Calibrate before publishing/g)).toHaveLength(1);
    expect(content).not.toContain('peer buddy weekly time commitment');
  });

  // The continuity protocol marks every cell of its backup table, so a marker
  // per cell put that one table into sixteen of run 88fc2368's twenty-nine rows.
  // A table row is one instruction to whoever calibrates it.
  it('gives a marked table row one line, not one line per marked cell', () => {
    const items = collectCareerPlaybookCalibrationItems(
      blocks({
        block_23: [
          '| Weekly reviews | Senior AE (example — replace) | Has shadowed two cycles (example — replace) |',
          '| Daily triage | SDR team lead (example — replace) | Runs triage solo (example — replace) |',
        ].join('\n'),
      })
    );

    expect(items).toHaveLength(2);
    expect(items[0].value).toBe('Senior AE; Has shadowed two cycles');
  });

  it('still lists two prose values written on one line', () => {
    const items = collectCareerPlaybookCalibrationItems(
      blocks({
        block_15: 'base $120,000 (example — replace) and a $5,000 offsite (example — replace).',
      })
    );

    expect(items).toHaveLength(2);
    expect(items[0].value).toBe('base $120,000');
    expect(items[1].value).toContain('$5,000 offsite');
  });

  it('lists a value repeated across rows of one section once', () => {
    const items = collectCareerPlaybookCalibrationItems(
      blocks({
        block_23: [
          '| Weekly reviews | Senior AE (example — replace) |',
          '| Forecast submission | Senior AE (example — replace) |',
        ].join('\n'),
      })
    );

    expect(items).toHaveLength(1);
  });

  it('cuts a long value and its context on a word boundary', () => {
    const long = `Playbook, qualification standard, and escalation map are current as of the last quarterly playbook and process audit — yes/no (example — replace).`;
    const items = collectCareerPlaybookCalibrationItems(blocks({ block_23: `- ${long}` }));

    expect(items).toHaveLength(1);
    // The old fixed-offset slice opened this row with "…d escalation map": the
    // kept tail must begin where a word begins, not inside one.
    const keptTail = items[0].value.replace(/^…/, '');
    expect(long).toContain(` ${keptTail.split(' ')[0]} `);
    expect(items[0].value.startsWith('…')).toBe(true);
    expect(items[0].context.endsWith('…')).toBe(true);
    const keptHead = items[0].context.replace(/…$/, '');
    expect(long).toContain(keptHead.slice(2));
  });

  // A metric value never carries the example marker — the ledger is the single
  // source, and marking one would let blocks drift from it. So the checklist
  // built from markers could never name a threshold: run 88fc2368 listed 29
  // values and none of its six assumed numbers, while block 1 of the same guide
  // told the reader those six needed validating in the first quarter.
  it('lists an assumed metric threshold, which no marker can produce', () => {
    const result = appendCareerPlaybookCalibrationTable(
      blocks({
        block_6: '## 6. KPI and metrics\n\n| Forecast accuracy | >=80% |',
        block_26: '## 26. Implementation checklist\n\n- Align on KPI targets',
      }),
      {
        metric_ledger: [
          metric({ label: 'Forecast accuracy', target: '>=80% accuracy' }),
          metric({ label: 'Revenue attainment', target: '100%', provenance: 'user_answer' }),
        ],
      } as never
    );

    const content = result.block_26!.content;
    expect(content).toContain('| KPI and metrics | Forecast accuracy — >=80% accuracy |');
    expect(content).toContain('assumed threshold, not company data');
    // What the company already told us is not a value to calibrate.
    expect(content).not.toContain('Revenue attainment');
  });

  it('replaces a bold model calibration section and stays idempotent', () => {
    const first = appendCareerPlaybookCalibrationTable(
      blocks({
        block_15: 'base $120,000 (example — replace).',
        block_26: [
          '## 26. Implementation checklist',
          '',
          '**Manager checklist**',
          '',
          '- Align on KPI targets',
          '',
          '**Calibrate before publishing**',
          '',
          '| # | Value in guide | Location | Replace with |',
          '| --- | --- | --- | --- |',
          '| 1 | Old model value | Block 15 | Approved value |',
        ].join('\n'),
      })
    );
    const second = appendCareerPlaybookCalibrationTable(first);
    const content = second.block_26!.content;

    expect(content.match(/Calibrate before publishing/g)).toHaveLength(1);
    expect(content).toContain('Manager checklist');
    expect(content).toContain('$120,000');
    expect(content).not.toContain('Old model value');
    expect(content).toBe(first.block_26!.content);
  });
});

describe('normalizeCareerPlaybookBlockReferences', () => {
  it('rewrites internal identifiers to the reader-facing form', () => {
    expect(normalizeCareerPlaybookBlockReferences('See block_5 and Block_17.')).toBe(
      'See Block 5 and Block 17.'
    );
  });

  it('leaves fenced content untouched', () => {
    const markdown = '```mermaid\nblock_5 --> block_6\n```';
    expect(normalizeCareerPlaybookBlockReferences(markdown)).toBe(markdown);
  });
});
