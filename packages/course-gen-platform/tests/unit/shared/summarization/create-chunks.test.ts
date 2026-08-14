/**
 * Contract for the sliding window that splits a document before summarization.
 *
 * Every chunk it returns is paid for: one LLM call each, and each summary is
 * merged into the document summary. So the window must cover the text once —
 * overlap is context for the next window, never a chunk of its own.
 */

import { describe, it, expect } from 'vitest';

import { createChunks } from '@/shared/summarization/hierarchical-chunking';

// 4 chars/token for 'ru' (tokenEstimator language ratio), so chunkSize is in tokens.
const RU_CHARS_PER_TOKEN = 4;
const OPTIONS = { chunkSize: 1000, overlapPercent: 5, language: 'ru' };
const WINDOW_CHARS = OPTIONS.chunkSize * RU_CHARS_PER_TOKEN;

const textOf = (chars: number) => 'а'.repeat(chars);

describe('createChunks', () => {
  it('covers a document shorter than the window with a single chunk', () => {
    const text = textOf(Math.floor(WINDOW_CHARS * 0.8));

    const chunks = createChunks(text, OPTIONS);

    expect(chunks).toEqual([text]);
  });

  it('covers a document exactly one window long with a single chunk', () => {
    const text = textOf(WINDOW_CHARS);

    expect(createChunks(text, OPTIONS)).toHaveLength(1);
  });

  it('never emits a chunk whose text a previous chunk already contains', () => {
    for (const size of [0.5, 1, 1.5, 2, 3.7].map(f => Math.floor(WINDOW_CHARS * f))) {
      // Every position must be unique: with repeating filler a later chunk is a
      // substring of an earlier one by coincidence, and the check passes for a
      // reason that has nothing to do with the window.
      let text = '';
      for (let word = 0; text.length < size; word += 1) text += `слово${word} `;
      text = text.slice(0, size);

      const chunks = createChunks(text, OPTIONS);

      chunks.forEach((chunk, index) => {
        const earlier = chunks.slice(0, index);
        expect(
          earlier.some(previous => previous.includes(chunk)),
          `size ${size}: chunk ${index} repeats text already covered`
        ).toBe(false);
      });
    }
  });

  it('splits a long document into overlapping windows that reach its end', () => {
    const text = textOf(WINDOW_CHARS * 3);

    const chunks = createChunks(text, OPTIONS);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('').length).toBeGreaterThanOrEqual(text.length);
    expect(chunks[chunks.length - 1].endsWith(text.slice(-50))).toBe(true);
  });
});
