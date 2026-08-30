/**
 * Regression tests for the application-owned parts of final assembly.
 *
 * The calibration table exists because the 2026-08-11 guide left it to the model
 * and got a six-row list that named none of the seven money values in the
 * document — the figures most likely to be copied verbatim into an official role
 * guide.
 */

import { describe, expect, it } from 'vitest';
import type { CareerPlaybookBlockId, CareerPlaybookBlockState } from '@megacampus/shared-types';
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
