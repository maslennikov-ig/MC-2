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
    const rows = content.split('\n').filter(line => /^\| Block \d+ \|/.test(line));

    expect(rows).toHaveLength(2);
    expect(content).toContain('$120,000');
    expect(content).toContain('$5,000');
    // The model's own six-row attempt must not survive alongside the real one.
    expect(content).not.toContain('lead SLA');
    expect(content).toContain('Manager checklist');
  });

  it('adds nothing when the document carries no marked value', () => {
    const input = blocks({ block_26: '## 26. Implementation checklist\n\n- Align on KPI targets' });
    expect(appendCareerPlaybookCalibrationTable(input)).toBe(input);
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
