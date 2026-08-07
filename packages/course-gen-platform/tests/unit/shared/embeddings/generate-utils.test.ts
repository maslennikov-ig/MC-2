import { afterEach, describe, expect, it } from 'vitest';

import {
  generateCacheKey,
  type EmbeddingCacheIdentity,
} from '../../../../src/shared/embeddings/generate-utils.js';

const BASE: EmbeddingCacheIdentity = {
  task: 'retrieval.passage',
  lateChunking: false,
  dimensions: 768,
  model: 'jina-embeddings-v3',
};

describe('generateCacheKey', () => {
  const original = process.env.EMBEDDING_CACHE_NAMESPACE;

  afterEach(() => {
    if (original === undefined) delete process.env.EMBEDDING_CACHE_NAMESPACE;
    else process.env.EMBEDDING_CACHE_NAMESPACE = original;
  });

  it('is stable for the same text and identity', () => {
    expect(generateCacheKey('текст', BASE)).toBe(generateCacheKey('текст', BASE));
  });

  it('separates every request parameter the vector depends on', () => {
    // The first version hashed `${text}:${task}` only, so all four of these
    // collided onto one key and served whichever vector was written last.
    const keys = new Set([
      generateCacheKey('текст', BASE),
      generateCacheKey('текст', { ...BASE, task: 'retrieval.query' }),
      generateCacheKey('текст', { ...BASE, dimensions: 1024 }),
      generateCacheKey('текст', { ...BASE, model: 'jina-embeddings-v4' }),
      generateCacheKey('текст', { ...BASE, lateChunking: true, batchContext: ['текст'] }),
    ]);
    expect(keys.size).toBe(5);
  });

  it('makes a late-chunked vector belong to its batch', () => {
    // Same text, different neighbours: Jina embeds the concatenated input and
    // splits afterwards, so these are genuinely different vectors.
    const alone = generateCacheKey('текст', {
      ...BASE,
      lateChunking: true,
      batchContext: ['текст'],
    });
    const withNeighbour = generateCacheKey('текст', {
      ...BASE,
      lateChunking: true,
      batchContext: ['текст', 'сосед'],
    });
    const reordered = generateCacheKey('текст', {
      ...BASE,
      lateChunking: true,
      batchContext: ['сосед', 'текст'],
    });

    expect(new Set([alone, withNeighbour, reordered]).size).toBe(3);
  });

  it('ignores the batch when late chunking is off, because each text stands alone', () => {
    expect(generateCacheKey('текст', { ...BASE, batchContext: ['текст', 'сосед'] })).toBe(
      generateCacheKey('текст', BASE)
    );
  });

  it('refuses to build a late-chunking key without its batch context', () => {
    expect(() => generateCacheKey('текст', { ...BASE, lateChunking: true })).toThrow(
      /whole request input/u
    );
  });

  it('namespaces keys so a benchmark never shares production vectors', () => {
    process.env.EMBEDDING_CACHE_NAMESPACE = 'embedding-bench:run-1';
    expect(generateCacheKey('текст', BASE).startsWith('embedding-bench:run-1:')).toBe(true);
    delete process.env.EMBEDDING_CACHE_NAMESPACE;
    expect(generateCacheKey('текст', BASE).startsWith('embedding:')).toBe(true);
  });
});
