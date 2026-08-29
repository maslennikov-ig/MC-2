import { describe, expect, it } from 'vitest';
import { CareerPlaybookSemanticEmbeddingCache } from '@/stages/stage-career-playbook/nodes/semantic-repetition';

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
