/**
 * Search-result deduplication (mc2-7frdr).
 *
 * A safety net behind the indexing fix: the same text can still reach the index
 * from a document reused across courses, and the existing production collection
 * carries duplicates that predate the fix. A caller asking for five chunks
 * wants five pieces of evidence, not one repeated five times.
 */
import { describe, expect, it } from 'vitest';

import { dedupeByContent } from '@/shared/qdrant/search';
import type { SearchResult } from '@/shared/qdrant/search-types';

function hit(
  overrides: Partial<SearchResult> & Pick<SearchResult, 'chunk_id' | 'content'>
): SearchResult {
  return {
    parent_chunk_id: null,
    level: 'child',
    heading_path: 'Root',
    chapter: null,
    section: null,
    document_id: 'doc-1',
    document_name: 'doc.md',
    page_number: null,
    page_range: null,
    token_count: 10,
    score: 0.5,
    metadata: { has_code: false, has_formulas: false, has_tables: false, has_images: false },
    ...overrides,
  } as SearchResult;
}

describe('dedupeByContent', () => {
  it('collapses the parent/child pair that carried identical text', () => {
    const text = 'Оценивать удалённого сотрудника по времени в сети — ошибка.';
    const results = [
      hit({ chunk_id: 'child_15', content: text, score: 0.5129 }),
      hit({ chunk_id: 'parent_15', content: text, level: 'parent', score: 0.5129 }),
    ];

    expect(dedupeByContent(results).map(r => r.chunk_id)).toEqual(['child_15']);
  });

  it('keeps the highest-scoring copy, which is the first one', () => {
    const results = [
      hit({ chunk_id: 'a', content: 'одно и то же', score: 0.61 }),
      hit({ chunk_id: 'b', content: 'одно и то же', score: 0.42 }),
    ];

    const deduped = dedupeByContent(results);

    expect(deduped).toHaveLength(1);
    expect(deduped[0].score).toBe(0.61);
  });

  it('does not merge different passages that happen to score alike', () => {
    const results = [
      hit({ chunk_id: 'a', content: 'первый фрагмент', score: 0.5 }),
      hit({ chunk_id: 'b', content: 'второй фрагмент', score: 0.5 }),
    ];

    expect(dedupeByContent(results)).toHaveLength(2);
  });

  it('ignores whitespace differences between copies', () => {
    const results = [
      hit({ chunk_id: 'a', content: 'текст фрагмента' }),
      hit({ chunk_id: 'b', content: '  текст фрагмента\n' }),
    ];

    expect(dedupeByContent(results)).toHaveLength(1);
  });

  it('leaves empty results alone rather than folding them together', () => {
    const results = [hit({ chunk_id: 'a', content: '' }), hit({ chunk_id: 'b', content: '' })];

    expect(dedupeByContent(results)).toHaveLength(2);
  });

  it('preserves order and returns the input unchanged when nothing repeats', () => {
    const results = [
      hit({ chunk_id: 'a', content: 'один', score: 0.6 }),
      hit({ chunk_id: 'b', content: 'два', score: 0.5 }),
      hit({ chunk_id: 'c', content: 'три', score: 0.4 }),
    ];

    expect(dedupeByContent(results).map(r => r.chunk_id)).toEqual(['a', 'b', 'c']);
  });
});
