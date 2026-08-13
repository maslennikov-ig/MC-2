/**
 * Which chunks reach the vector index (mc2-v7dod, spec 027).
 *
 * Only the child grain is indexed. `docs/RAG-CHUNKING-STRATEGY.md` always said
 * so — it separates `uploadChunksToQdrant(child_chunks)` from
 * `storeParentChunks(parent_chunks)` — but the second call was never written,
 * so parents were uploaded alongside their children.
 *
 * Measured over six Docling conversions on 2026-08-13: parents were 26.2% of
 * points and 91.2% extra embedding tokens, and carried no text of their own —
 * 57 of 57 were fully reconstructible from their own children. The surrounding
 * passage is rebuilt from siblings at retrieval time instead.
 *
 * The one thing this must never do is lose text, so a childless parent — the
 * sole carrier of its content — is still indexed.
 */
import { describe, expect, it } from 'vitest';

import {
  getAllChunks,
  selectIndexableChunks,
  type ChunkingResult,
  type TextChunk,
} from '@/shared/embeddings/markdown-chunker';

function chunk(overrides: Partial<TextChunk> & Pick<TextChunk, 'chunk_id' | 'content'>): TextChunk {
  return {
    parent_chunk_id: null,
    sibling_chunk_ids: [],
    level: 'child',
    token_count: 10,
    char_count: overrides.content.length,
    chunk_index: 0,
    total_chunks: 1,
    heading_path: 'Root',
    chapter: null,
    section: null,
    chunk_strategy: 'hierarchical_markdown',
    overlap_tokens: 0,
    ...overrides,
  } as TextChunk;
}

function result(parents: TextChunk[], children: TextChunk[]): ChunkingResult {
  return {
    parent_chunks: parents,
    child_chunks: children,
    total_tokens: 0,
    metadata: {
      parent_count: parents.length,
      child_count: children.length,
      avg_parent_tokens: 0,
      avg_child_tokens: 0,
      config: {
        parent_chunk_size: 1500,
        child_chunk_size: 400,
        child_chunk_overlap: 50,
        tiktoken_model: 'gpt-3.5-turbo',
      },
    },
  } as ChunkingResult;
}

describe('selectIndexableChunks', () => {
  it('indexes the child grain and leaves the parent out of the index', () => {
    const parent = chunk({
      chunk_id: 'p1',
      content: 'первая часть. вторая часть.',
      level: 'parent',
    });
    const children = [
      chunk({ chunk_id: 'c1', content: 'первая часть.', parent_chunk_id: 'p1', chunk_index: 0 }),
      chunk({ chunk_id: 'c2', content: 'вторая часть.', parent_chunk_id: 'p1', chunk_index: 1 }),
    ];

    const selected = selectIndexableChunks(result([parent], children));

    expect(selected.map(c => c.chunk_id)).toEqual(['c1', 'c2']);
    expect(selected.some(c => c.level === 'parent')).toBe(false);
  });

  it('still leaves out a parent that holds exactly one child', () => {
    // This was the shape that duplicated half the collection. It is no longer a
    // special case: no parent is indexed, whatever its child count.
    const parent = chunk({ chunk_id: 'p1', content: 'один и тот же текст', level: 'parent' });
    const child = chunk({ chunk_id: 'c1', content: 'один и тот же текст', parent_chunk_id: 'p1' });

    expect(selectIndexableChunks(result([parent], [child])).map(c => c.chunk_id)).toEqual(['c1']);
  });

  it('keeps a childless parent, because nothing else carries its text', () => {
    const orphan = chunk({ chunk_id: 'p_orphan', content: 'только здесь', level: 'parent' });
    const other = chunk({ chunk_id: 'p1', content: 'есть ребёнок', level: 'parent' });
    const child = chunk({ chunk_id: 'c1', content: 'есть ребёнок', parent_chunk_id: 'p1' });

    const selected = selectIndexableChunks(result([orphan, other], [child]));

    expect(selected.map(c => c.chunk_id).sort()).toEqual(['c1', 'p_orphan']);
  });

  it('loses no text: every parent word survives in what gets indexed', () => {
    const parents = [
      chunk({ chunk_id: 'p1', content: 'альфа бета гамма дельта', level: 'parent' }),
      chunk({ chunk_id: 'p2', content: 'эпсилон дзета', level: 'parent' }),
    ];
    const children = [
      chunk({ chunk_id: 'c1', content: 'альфа бета', parent_chunk_id: 'p1', chunk_index: 0 }),
      chunk({ chunk_id: 'c2', content: 'гамма дельта', parent_chunk_id: 'p1', chunk_index: 1 }),
      chunk({ chunk_id: 'c3', content: 'эпсилон дзета', parent_chunk_id: 'p2', chunk_index: 0 }),
    ];

    const indexedWords = new Set(
      selectIndexableChunks(result(parents, children)).flatMap(c => c.content.split(' '))
    );

    for (const parent of parents) {
      for (const word of parent.content.split(' ')) {
        expect(indexedWords, `"${word}" is only in a parent and would be lost`).toContain(word);
      }
    }
  });

  it('returns chunks in index order', () => {
    const children = [
      chunk({ chunk_id: 'c2', content: 'второй', parent_chunk_id: 'p1', chunk_index: 1 }),
      chunk({ chunk_id: 'c1', content: 'первый', parent_chunk_id: 'p1', chunk_index: 0 }),
    ];

    expect(selectIndexableChunks(result([], children)).map(c => c.chunk_index)).toEqual([0, 1]);
  });

  it('differs from getAllChunks, which is what the pipeline used to upload', () => {
    const parent = chunk({ chunk_id: 'p1', content: 'a b', level: 'parent' });
    const child = chunk({ chunk_id: 'c1', content: 'a b', parent_chunk_id: 'p1' });
    const chunking = result([parent], [child]);

    expect(getAllChunks(chunking)).toHaveLength(2);
    expect(selectIndexableChunks(chunking)).toHaveLength(1);
  });
});
