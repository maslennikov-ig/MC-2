/**
 * Which chunks reach the vector index (mc2-7frdr).
 *
 * Hierarchical chunking emitted a parent for every group and the pipeline
 * embedded parents and children alike. Because a parent group breaks on every
 * heading-path change and Docling merges peers within a section, every parent
 * ended up with exactly one child and therefore with that child's exact text:
 * on production, 6856 of 13712 indexed points were duplicates of the other
 * 6856. Search returned each passage twice and every embedding was paid for
 * twice.
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
    chunk_strategy: 'docling_hybrid',
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
  it('drops a parent that repeats its only child word for word', () => {
    const text = 'Асинхронная коммуникация — основа работы распределённой команды.';
    const input = result(
      [chunk({ chunk_id: 'parent_0', level: 'parent', content: text })],
      [chunk({ chunk_id: 'child_0', parent_chunk_id: 'parent_0', content: text })]
    );

    const indexable = selectIndexableChunks(input);

    expect(indexable.map(c => c.chunk_id)).toEqual(['child_0']);
    // The duplicate is removed from indexing only; the chunking result itself
    // still carries the parent, so parent lookup keeps working.
    expect(input.parent_chunks).toHaveLength(1);
  });

  it('keeps a parent that spans more than one child', () => {
    const input = result(
      [chunk({ chunk_id: 'parent_0', level: 'parent', content: 'первый абзац\n\nвторой абзац' })],
      [
        chunk({ chunk_id: 'child_0', parent_chunk_id: 'parent_0', content: 'первый абзац' }),
        chunk({ chunk_id: 'child_1', parent_chunk_id: 'parent_0', content: 'второй абзац' }),
      ]
    );

    const indexable = selectIndexableChunks(input);

    expect(indexable.map(c => c.chunk_id).sort()).toEqual(['child_0', 'child_1', 'parent_0']);
  });

  it('keeps a parent whose single child covers only part of it', () => {
    const input = result(
      [chunk({ chunk_id: 'parent_0', level: 'parent', content: 'вступление и затем вывод' })],
      [chunk({ chunk_id: 'child_0', parent_chunk_id: 'parent_0', content: 'вступление' })]
    );

    expect(selectIndexableChunks(input).map(c => c.chunk_id)).toContain('parent_0');
  });

  it('treats whitespace-only differences as the same text', () => {
    // The adapter trims parent content but not child content, so an otherwise
    // identical pair can differ by a trailing newline.
    const input = result(
      [chunk({ chunk_id: 'parent_0', level: 'parent', content: 'один и тот же текст' })],
      [
        chunk({
          chunk_id: 'child_0',
          parent_chunk_id: 'parent_0',
          content: '  один и тот  же текст\n',
        }),
      ]
    );

    expect(selectIndexableChunks(input).map(c => c.chunk_id)).toEqual(['child_0']);
  });

  it('keeps a childless parent, which nothing else covers', () => {
    const input = result(
      [chunk({ chunk_id: 'parent_0', level: 'parent', content: 'одинокий раздел' })],
      []
    );

    expect(selectIndexableChunks(input).map(c => c.chunk_id)).toEqual(['parent_0']);
  });

  it('indexes strictly less than the unfiltered set on the degenerate shape', () => {
    // The production shape: N parents, N children, one child each, same text.
    const parents = Array.from({ length: 5 }, (_, i) =>
      chunk({ chunk_id: `parent_${i}`, level: 'parent', content: `раздел ${i}`, chunk_index: i })
    );
    const children = parents.map((p, i) =>
      chunk({
        chunk_id: `child_${i}`,
        parent_chunk_id: p.chunk_id,
        content: `раздел ${i}`,
        chunk_index: i,
      })
    );
    const input = result(parents, children);

    expect(getAllChunks(input)).toHaveLength(10);
    expect(selectIndexableChunks(input)).toHaveLength(5);
  });
});
