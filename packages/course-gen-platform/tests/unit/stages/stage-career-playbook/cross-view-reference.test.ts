import { describe, expect, it } from 'vitest';
import type { CareerPlaybookBlockId, CareerPlaybookBlockState } from '@megacampus/shared-types';
import {
  careerPlaybookBlockMayCite,
  formatCareerPlaybookCitableBlocks,
} from '@/stages/stage-career-playbook/nodes/audience-scope';
import { validateCrossViewReference } from '@/stages/stage-career-playbook/nodes/quality-checks';
import { careerPlaybookPrompts } from '@/shared/prompts/career-playbook-prompts';
import { careerPlaybookBlockRegeneratorPrompt } from '@/shared/prompts/career-playbook-block-regenerator-prompt';

const context = { metricLedger: [], evidenceLedger: [] } as const;

function blocks(
  entries: Array<[CareerPlaybookBlockId, string]>
): Partial<Record<CareerPlaybookBlockId, CareerPlaybookBlockState>> {
  return Object.fromEntries(
    entries.map(([blockId, content]) => [blockId, { content, status: 'generated', attempt: 1 }])
  );
}

describe('careerPlaybookBlockMayCite', () => {
  // Subset, not intersection: a manager reads both block_26 and block_5, but the
  // HR reader of block_26 does not get block_5, so the pointer is unfollowable.
  it('refuses a target that only some of the source readers receive', () => {
    expect(careerPlaybookBlockMayCite('block_26', 'block_5')).toBe(false);
    expect(careerPlaybookBlockMayCite('block_12', 'block_5')).toBe(false);
    expect(careerPlaybookBlockMayCite('block_24', 'block_23')).toBe(false);
  });

  it('allows a target every reader of the source also receives', () => {
    expect(careerPlaybookBlockMayCite('block_16', 'block_5')).toBe(true);
    expect(careerPlaybookBlockMayCite('block_5', 'block_1')).toBe(true);
    // A block read by everyone may only cite blocks read by everyone.
    expect(careerPlaybookBlockMayCite('block_24', 'block_1')).toBe(true);
  });

  it('is not symmetric', () => {
    // block_9 is employee-only, block_1 is universal.
    expect(careerPlaybookBlockMayCite('block_9', 'block_1')).toBe(true);
    expect(careerPlaybookBlockMayCite('block_1', 'block_9')).toBe(false);
  });
});

describe('validateCrossViewReference', () => {
  it('flags a pointer at a block the reader was never given', () => {
    const [issue] = validateCrossViewReference(
      blocks([['block_8', 'Полномочия по инструментам описаны в Block 5.']]),
      context
    );

    expect(issue.category).toBe('unreadable_reference');
    expect(issue.block_id).toBe('block_8');
    expect(issue.description).toContain('block_5');
  });

  it('accepts a pointer every reader can follow, and a self-reference', () => {
    expect(
      validateCrossViewReference(
        blocks([
          ['block_16', 'Уровень согласования описан в Block 5.'],
          ['block_5', 'Изменения матрицы фиксируются в Block 5.'],
        ]),
        context
      )
    ).toEqual([]);
  });

  it('ignores a reference inside a fenced diagram', () => {
    expect(
      validateCrossViewReference(
        blocks([['block_12', '```mermaid\ngraph TD\n  A["Block 5"]\n```']]),
        context
      )
    ).toEqual([]);
  });

  it('reports one issue per block however many pointers it breaks', () => {
    const issues = validateCrossViewReference(
      blocks([['block_26', 'См. Block 5, Block 2 и блок 22 для деталей.']]),
      context
    );

    expect(issues).toHaveLength(1);
    expect(issues[0].description).toContain('block_5');
    expect(issues[0].description).toContain('block_2');
    expect(issues[0].description).toContain('block_22');
  });
});

describe('the rule reaches both the generator and the regenerator', () => {
  // An exemption that lives only in the checker is a gate the executor cannot
  // pass: a regeneration told its pointer is wrong, but not which pointers are
  // right, spends both attempts reproducing the defect.
  it('renders the citable list for a group generator prompt', () => {
    const rendered = formatCareerPlaybookCitableBlocks(['block_24', 'block_26']);

    expect(rendered).toContain('- block_24 may reference:');
    expect(rendered).toContain('block_1 (Mission and key results)');
    expect(rendered).not.toContain('block_23 (Continuity plan)');
  });

  it('declares citable_blocks_md in every group prompt and in the regenerator', () => {
    const groupPrompts = careerPlaybookPrompts.filter(prompt =>
      prompt.promptKey.startsWith('career_playbook_group_')
    );
    expect(groupPrompts).toHaveLength(6);

    for (const prompt of groupPrompts) {
      expect(prompt.promptTemplate).toContain('{{citable_blocks_md}}');
      expect(prompt.variables?.some(variable => variable.name === 'citable_blocks_md')).toBe(true);
    }

    expect(careerPlaybookBlockRegeneratorPrompt.promptTemplate).toContain('{{citable_blocks_md}}');
    expect(
      careerPlaybookBlockRegeneratorPrompt.variables?.some(
        variable => variable.name === 'citable_blocks_md'
      )
    ).toBe(true);
  });
});
