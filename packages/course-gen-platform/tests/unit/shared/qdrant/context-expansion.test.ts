/**
 * Passage reconstruction around a retrieved chunk (mc2-kn2hy, spec 027).
 *
 * The design was always "search small, answer large". Only the search half
 * existed, so callers got a ~290 token fragment instead of the ~900 token
 * passage the strategy promised. These tests pin the half that was missing,
 * including the parts that must not happen: exceeding a caller's token budget,
 * losing a result when a fetch fails, or letting one passage take two slots.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const retrieve = vi.fn();

vi.mock('@/shared/qdrant/client', () => ({
  qdrantClient: {
    retrieve: (...args: unknown[]) => retrieve(...args),
  },
}));

const { expandToSiblingContext, stitch } = await import('@/shared/qdrant/context-expansion');
const { generatePointId } = await import('@/shared/qdrant/upload-helpers');

import type { SearchResult } from '@/shared/qdrant/search-types';

function hit(overrides: Partial<SearchResult> & Pick<SearchResult, 'chunk_id'>): SearchResult {
  return {
    parent_chunk_id: 'p1',
    level: 'child',
    content: 'фрагмент',
    heading_path: 'Root',
    chapter: null,
    section: null,
    document_id: 'doc-1',
    document_name: 'doc.md',
    page_number: null,
    page_range: null,
    token_count: 100,
    score: 0.5,
    metadata: { has_code: false, has_formulas: false, has_tables: false, has_images: false },
    ...overrides,
  } as SearchResult;
}

function record(chunkId: string, content: string, chunkIndex: number, tokens = 100) {
  return {
    id: generatePointId('doc-1', chunkId),
    payload: {
      chunk_id: chunkId,
      content,
      chunk_index: chunkIndex,
      token_count: tokens,
      level: 'child',
      document_id: 'doc-1',
    },
  };
}

beforeEach(() => {
  retrieve.mockReset();
});

describe('stitch', () => {
  it('joins pieces that do not overlap', () => {
    expect(stitch(['первая часть.', 'вторая часть.'])).toBe('первая часть.\n\nвторая часть.');
  });

  it('removes the boundary that legacy chunking repeats between neighbours', () => {
    // Children overlap by child_chunk_overlap, so a plain join would put the
    // shared sentence into the prompt twice.
    const first = 'Руководитель согласует объём работ. Общая граница здесь.';
    const second = 'Общая граница здесь. Исполнитель фиксирует результат.';

    const result = stitch([first, second]);

    expect(result).toContain('Руководитель согласует объём работ.');
    expect(result).toContain('Исполнитель фиксирует результат.');
    expect(result.match(/Общая граница здесь\./g)).toHaveLength(1);
  });

  it('ignores empty pieces', () => {
    expect(stitch(['текст', '   ', ''])).toBe('текст');
  });
});

describe('expandToSiblingContext', () => {
  it('returns the input untouched when there is nothing to expand', async () => {
    expect(await expandToSiblingContext([])).toEqual([]);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('leaves a chunk alone when it has no siblings recorded', async () => {
    // Every point indexed before spec 027 looks like this, so expansion has to
    // be a no-op on the existing collection rather than an error.
    const results = [hit({ chunk_id: 'c1', content: 'одиночный', sibling_chunk_ids: [] })];

    expect(await expandToSiblingContext(results)).toEqual(results);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('rebuilds the passage from siblings in index order', async () => {
    retrieve.mockResolvedValue([
      record('c2', 'вторая часть.', 1),
      record('c0', 'нулевая часть.', 0),
      record('c1', 'первая часть.', 2),
    ]);

    const [expanded] = await expandToSiblingContext([
      hit({ chunk_id: 'c1', content: 'первая часть.', sibling_chunk_ids: ['c0', 'c2'] }),
    ]);

    expect(expanded.content).toBe('нулевая часть.\n\nвторая часть.\n\nпервая часть.');
    expect(expanded.token_count).toBe(300);
  });

  it('fetches siblings by deterministic point id rather than scanning', async () => {
    retrieve.mockResolvedValue([record('c1', 'a', 0)]);

    await expandToSiblingContext([hit({ chunk_id: 'c1', sibling_chunk_ids: ['c2'] })]);

    const [, args] = retrieve.mock.calls[0] as [string, { ids: string[] }];
    expect(args.ids).toEqual([generatePointId('doc-1', 'c1'), generatePointId('doc-1', 'c2')]);
  });

  it('collapses two hits from one passage into a single result', async () => {
    retrieve.mockResolvedValue([record('c1', 'первая.', 0), record('c2', 'вторая.', 1)]);

    const expanded = await expandToSiblingContext([
      hit({ chunk_id: 'c1', score: 0.9, sibling_chunk_ids: ['c2'] }),
      hit({ chunk_id: 'c2', score: 0.4, sibling_chunk_ids: ['c1'] }),
    ]);

    expect(expanded).toHaveLength(1);
    expect(expanded[0].score).toBe(0.9);
    expect(retrieve).toHaveBeenCalledTimes(1);
  });

  it('keeps passages from different documents apart', async () => {
    retrieve.mockResolvedValue([record('c1', 'текст', 0)]);

    const expanded = await expandToSiblingContext([
      hit({ chunk_id: 'c1', document_id: 'doc-1', sibling_chunk_ids: ['c2'] }),
      hit({ chunk_id: 'c1', document_id: 'doc-2', sibling_chunk_ids: ['c2'] }),
    ]);

    expect(expanded).toHaveLength(2);
  });

  it('stops before crossing the caller budget and returns the matched chunk instead', async () => {
    retrieve.mockResolvedValue([
      record('c1', 'полный текст первый', 0, 400),
      record('c2', 'полный текст второй', 1, 400),
    ]);

    const expanded = await expandToSiblingContext(
      [hit({ chunk_id: 'c1', content: 'короткий', token_count: 90, sibling_chunk_ids: ['c2'] })],
      { maxTokens: 500 }
    );

    expect(expanded[0].content).toBe('короткий');
    expect(expanded[0].token_count).toBe(90);
  });

  it('expands what fits and leaves the rest unexpanded', async () => {
    retrieve
      .mockResolvedValueOnce([record('a1', 'первый развёрнутый', 0, 200)])
      .mockResolvedValueOnce([record('b1', 'второй развёрнутый', 0, 900)]);

    const expanded = await expandToSiblingContext(
      [
        hit({
          chunk_id: 'a1',
          parent_chunk_id: 'pa',
          content: 'a',
          token_count: 50,
          score: 0.9,
          sibling_chunk_ids: ['a2'],
        }),
        hit({
          chunk_id: 'b1',
          parent_chunk_id: 'pb',
          content: 'b',
          token_count: 50,
          score: 0.8,
          sibling_chunk_ids: ['b2'],
        }),
      ],
      { maxTokens: 400 }
    );

    expect(expanded[0].content).toBe('первый развёрнутый');
    expect(expanded[1].content).toBe('b');
  });

  it('never drops a retrieved chunk to stay under the budget', async () => {
    // Measured on dev: three chunks totalling 411 tokens under a 250 budget came
    // back whole and unexpanded. The budget bounds what expansion adds; dropping
    // search hits belongs to the formatter, which counts its own markup and runs
    // last. Enforcing it twice with two accountings would be worse.
    retrieve.mockResolvedValue([record('c1', 'широкий отрывок', 0, 400)]);

    const results = [
      hit({
        chunk_id: 'c1',
        parent_chunk_id: 'pa',
        content: 'a',
        token_count: 220,
        sibling_chunk_ids: ['c2'],
      }),
      hit({
        chunk_id: 'b1',
        parent_chunk_id: 'pb',
        content: 'b',
        token_count: 191,
        sibling_chunk_ids: [],
      }),
    ];

    const expanded = await expandToSiblingContext(results, { maxTokens: 250 });

    expect(expanded).toHaveLength(2);
    expect(expanded.map(r => r.content)).toEqual(['a', 'b']);
    expect(expanded.reduce((sum, r) => sum + r.token_count, 0)).toBe(411);
  });

  it('returns the matched chunk when the sibling fetch fails', async () => {
    retrieve.mockRejectedValue(new Error('qdrant unavailable'));

    const expanded = await expandToSiblingContext([
      hit({ chunk_id: 'c1', content: 'что нашлось', sibling_chunk_ids: ['c2'] }),
    ]);

    expect(expanded).toHaveLength(1);
    expect(expanded[0].content).toBe('что нашлось');
  });
});
