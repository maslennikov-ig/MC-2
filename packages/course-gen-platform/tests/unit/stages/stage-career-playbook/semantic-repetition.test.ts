import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateEmbeddingsMock } = vi.hoisted(() => ({
  generateEmbeddingsMock: vi.fn(),
}));

vi.mock('@/shared/embeddings/jina-client', () => ({
  generateEmbeddings: generateEmbeddingsMock,
}));

import {
  CareerPlaybookSemanticEmbeddingCache,
  evaluateCareerPlaybookSemanticRepetition,
  isCareerPlaybookSemanticRepetitionIssue,
} from '@/stages/stage-career-playbook/nodes/semantic-repetition';

describe('CareerPlaybookSemanticEmbeddingCache', () => {
  it('evicts the least-recently-used hash entry at its hard bound', () => {
    const cache = new CareerPlaybookSemanticEmbeddingCache(2);
    cache.set('playbook-1', 'first customer text', [1]);
    cache.set('playbook-1', 'second customer text', [2]);
    expect(cache.get('playbook-1', 'first customer text')).toEqual([1]);

    cache.set('playbook-1', 'third customer text', [3]);

    expect(cache.get('playbook-1', 'first customer text')).toEqual([1]);
    expect(cache.get('playbook-1', 'second customer text')).toBeUndefined();
    expect(cache.get('playbook-1', 'third customer text')).toEqual([3]);
  });
});

describe('isCareerPlaybookSemanticRepetitionIssue', () => {
  beforeEach(() => {
    generateEmbeddingsMock.mockReset();
    // Every text embeds to the same unit vector, so every compared pair scores 1.0
    // and both issue families are produced in one call.
    generateEmbeddingsMock.mockImplementation((texts: string[]) =>
      texts.map(() => [1, ...Array.from({ length: 767 }, () => 0)])
    );
  });

  /**
   * The fail-closed branch in `crossBlockJudgeNode` finds its own issues by
   * substring, so the predicate and the two issue builders share a literal that
   * no type checks. If a reword desynchronises them the gate stops recognising
   * its own critical issues, `semanticErrors` never fires, and a document with a
   * 1.0 repetition pair is accepted in silence. This pins the pair together.
   */
  it('recognises every issue the evaluator actually produces', async () => {
    const paragraph = (marker: string): string =>
      `${marker} paragraph carrying enough normalized characters to clear the semantic minimum of one hundred, so it is compared.`;

    const issues = await evaluateCareerPlaybookSemanticRepetition({
      // block_1 and block_2 both sit in the employee and manager views, so the
      // pair is inside a shared view and is eligible for the cross-block check.
      block_1: { content: paragraph('first') } as never,
      block_2: {
        content: `${paragraph('second')}\n\n${paragraph('third')}`,
      } as never,
    });

    const crossBlock = issues.filter(issue => issue.description.includes('shared audience view'));
    const withinBlock = issues.filter(issue => issue.description.includes('paragraphs 1 and 2'));

    expect(crossBlock.length).toBeGreaterThan(0);
    expect(withinBlock.length).toBeGreaterThan(0);
    expect(issues.every(isCareerPlaybookSemanticRepetitionIssue)).toBe(true);
  });

  it('rejects an issue from another deterministic check', () => {
    expect(
      isCareerPlaybookSemanticRepetitionIssue({
        block_id: 'block_1',
        severity: 'critical',
        category: 'contradiction',
        description: 'block_1 contradicts the published anti-goals.',
        suggestion: 'Align the duty with block_2.',
      })
    ).toBe(false);
  });
});
