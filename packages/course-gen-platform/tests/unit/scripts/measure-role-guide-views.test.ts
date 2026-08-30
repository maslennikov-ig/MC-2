import { describe, expect, it } from 'vitest';
import type { CareerPlaybookBlockId, CareerPlaybookBlockState } from '@megacampus/shared-types';
import {
  blocksInView,
  collectViewReferences,
  type StoredPlaybook,
} from '../../../scripts/measure-role-guide-views';

function block(content: string): CareerPlaybookBlockState {
  return { content, status: 'generated', attempt: 1 };
}

function playbook(entries: Array<[CareerPlaybookBlockId, string]>, id = 'fixture'): StoredPlaybook {
  return {
    id,
    language: 'ru',
    generated_blocks: Object.fromEntries(
      entries.map(([blockId, content]) => [blockId, block(content)])
    ),
  };
}

describe('Role Guide view measurement', () => {
  it('counts a reference the reader cannot follow and ignores one they can', () => {
    // block_5 is employee+manager, block_12 is HR-only: an HR block pointing at
    // the decision matrix sends its reader to a page HR was never given.
    const playbooks = [
      playbook([
        ['block_12', 'Профиль кандидата сверяется с матрицей решений — см. Block 5.'],
        ['block_13', 'День роли расписан в Блоке 13 и опирается на Block 14.'],
      ]),
    ];

    const hr = collectViewReferences(playbooks, 'hr');
    expect(hr.references).toBe(2);
    expect(hr.dangling).toEqual([{ audience: 'hr', from: 'block_12', to: 'block_5' }]);
    expect(hr.playbooksWithDangling).toBe(1);

    // The same sentence is fine for a manager, who is given block_5 — but
    // block_12 is not in the manager view, so it is not read there at all.
    expect(blocksInView('manager')).not.toContain('block_12');
    expect(blocksInView('manager')).toContain('block_5');
  });

  it('does not count a block referring to itself', () => {
    const { references, dangling } = collectViewReferences(
      [playbook([['block_5', 'Матрица решений. Изменения фиксируются в Block 5.']])],
      'employee'
    );

    expect(references).toBe(0);
    expect(dangling).toEqual([]);
  });

  it('ignores a number that is not a block id', () => {
    const { references } = collectViewReferences(
      [playbook([['block_1', 'Целевое значение блока 99 не существует; см. Block 40.']])],
      'employee'
    );

    expect(references).toBe(0);
  });
});
