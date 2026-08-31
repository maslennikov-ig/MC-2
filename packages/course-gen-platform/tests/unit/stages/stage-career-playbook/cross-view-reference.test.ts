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
  // The question is who RECEIVES a block, and since the owner ruling of
  // 2026-08-31 that is a hierarchy: employee ⊂ manager ⊂ HR. A pointer is
  // unfollowable only when some reader of the source does not receive the
  // target — which now means an employee-read block pointing outside the
  // employee's guide.
  it('refuses a target the employee reader of the source never receives', () => {
    expect(careerPlaybookBlockMayCite('block_24', 'block_23')).toBe(false);
    expect(careerPlaybookBlockMayCite('block_1', 'block_12')).toBe(false);
    expect(careerPlaybookBlockMayCite('block_9', 'block_21')).toBe(false);
  });

  // Before the ruling these three were refused, and block_26 could cite almost
  // nothing: its HR reader was treated as missing every employee block.
  it('allows what the hierarchy makes reachable', () => {
    expect(careerPlaybookBlockMayCite('block_26', 'block_5')).toBe(true);
    expect(careerPlaybookBlockMayCite('block_12', 'block_5')).toBe(true);
    expect(careerPlaybookBlockMayCite('block_15', 'block_11')).toBe(true);
  });

  it('allows a target every reader of the source also receives', () => {
    expect(careerPlaybookBlockMayCite('block_16', 'block_5')).toBe(true);
    expect(careerPlaybookBlockMayCite('block_5', 'block_1')).toBe(true);
    expect(careerPlaybookBlockMayCite('block_24', 'block_1')).toBe(true);
  });

  it('is not symmetric', () => {
    // block_23 is read by the manager and HR, who both also receive block_24;
    // block_24 is read by the employee too, and no employee receives block_23.
    expect(careerPlaybookBlockMayCite('block_23', 'block_24')).toBe(true);
    expect(careerPlaybookBlockMayCite('block_24', 'block_23')).toBe(false);
  });

  // Everyone receives an employee block now, so pointing at one is always safe.
  it('lets any block point at the employee guide', () => {
    expect(careerPlaybookBlockMayCite('block_9', 'block_1')).toBe(true);
    expect(careerPlaybookBlockMayCite('block_1', 'block_9')).toBe(true);
    expect(careerPlaybookBlockMayCite('block_21', 'block_9')).toBe(true);
  });
});

describe('validateCrossViewReference', () => {
  it('flags a pointer at a block the reader was never given', () => {
    // block_1 is read by everyone; block_12 is HR-only, so its employee and
    // manager readers cannot follow the pointer.
    const [issue] = validateCrossViewReference(
      blocks([['block_1', 'Критерии отбора описаны в Block 12.']]),
      context
    );

    expect(issue.category).toBe('unreadable_reference');
    expect(issue.block_id).toBe('block_1');
    expect(issue.description).toContain('block_12');
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
    // block_24 is read by everyone, so every pointer outside the employee's
    // guide breaks for its employee reader.
    const issues = validateCrossViewReference(
      blocks([['block_24', 'См. Block 12, Block 21 и блок 23 для деталей.']]),
      context
    );

    expect(issues).toHaveLength(1);
    expect(issues[0].description).toContain('block_12');
    expect(issues[0].description).toContain('block_21');
    expect(issues[0].description).toContain('block_23');
  });
});

describe('the rule reaches both the generator and the regenerator', () => {
  // An exemption that lives only in the checker is a gate the executor cannot
  // pass: a regeneration told its pointer is wrong, but not which pointers are
  // right, spends both attempts reproducing the defect.
  it('renders the citable list for a group generator prompt', () => {
    const rendered = formatCareerPlaybookCitableBlocks(['block_24', 'block_26']);
    const lineFor = (blockId: string) =>
      rendered.split('\n').find(line => line.startsWith(`- ${blockId} may reference:`)) ?? '';

    expect(lineFor('block_24')).toContain('block_1 (Mission and key results)');
    // block_24 is read by the employee, who never receives the continuity plan.
    expect(lineFor('block_24')).not.toContain('block_23 (Continuity plan)');
    // block_26 is read by the manager and HR, and both receive block_23.
    expect(lineFor('block_26')).toContain('block_23 (Continuity plan)');
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

  // Owner ruling 2026-08-30 (mc2-de3vu): do not widen the audience checkboxes.
  // A whole section is too coarse a unit of access — the decision matrix holds
  // both what HR needs and what it does not — and every extra reader flattens
  // the voice the split existed to keep. Carrying one line across is the
  // mechanism, so the prompt has to say what "one line" means.
  it('tells the writer to carry a part, write it for these readers, or say nothing', () => {
    const prompt = careerPlaybookPrompts.find(
      entry => entry.promptKey === 'career_playbook_group_3_people'
    )!;

    expect(prompt.promptTemplate).toContain('never the whole section');
    expect(prompt.promptTemplate).toContain("Write that part for THIS block's readers");
    expect(prompt.promptTemplate).toContain('leave it out entirely');
    expect(careerPlaybookBlockRegeneratorPrompt.promptTemplate).toContain('leave it out entirely');
  });

  // A cadence used to be owned by whichever block published it first, which left
  // every other block choosing between an unreachable pointer and its own
  // wording. The cadence ledger replaces that choice: the rhythm has a home
  // outside the blocks, so nobody needs to point anywhere to state it.
  it('no longer tells a block to reference a cadence it may not name', () => {
    for (const prompt of careerPlaybookPrompts.filter(entry =>
      entry.promptKey.startsWith('career_playbook_group_')
    )) {
      expect(prompt.promptTemplate).not.toContain(
        "State each recurring commitment's cadence ONCE, in the block that owns it, and reference it elsewhere"
      );
      expect(prompt.promptTemplate).not.toContain(
        'pointing at the owning block is allowed only when that block is on your reference list'
      );
      expect(prompt.promptTemplate).toContain(
        'Reproduce the cadence of every commitment in the cadence ledger VERBATIM'
      );
      expect(prompt.promptTemplate).toContain('{{cadence_ledger_md}}');
    }
  });
});
