# Token-Aware Batching for Jina Embeddings API

**Status**: Future Enhancement
**Priority**: Medium
**Estimated Effort**: 4-6 hours
**Created**: 2025-10-25
**Related Issue**: Integration tests failing with "Input text exceeds maximum length of 8194 tokens"

---

## Problem Statement

Currently, the embedding generation code uses a **fixed batch size** (5 chunks per batch) to avoid exceeding Jina API's 8,194 token limit. This is a conservative approach that works but is suboptimal:

### Current Implementation
```typescript
// src/shared/embeddings/generate.ts:272
const BATCH_SIZE = 5; // Fixed batch size
```

### Issues with Fixed Batch Size

1. **Suboptimal for small chunks**:
   - Child chunks (~400 tokens each)
   - Could batch 20 child chunks (20 × 400 = 8,000 tokens) safely
   - Currently batching only 5 (wasted API calls)

2. **Unsafe for multilingual content**:
   - **Russian**: ~1.5 tokens/word (vs 1.0 for English)
   - **Chinese/Japanese**: ~1.0 tokens/character (higher density)
   - 5 parent chunks in Chinese could still exceed 8,194 tokens

3. **Performance impact**:
   - For 100 small chunks: 20 API calls instead of 5
   - Each API call adds ~200ms latency
   - Total overhead: ~3 seconds per document

---

## Proposed Solution: Token-Aware Dynamic Batching

### Algorithm

```typescript
function createTokenAwareBatches<T extends { token_count: number }>(
  chunks: T[],
  maxTokens: number = 7500 // Buffer: 694 tokens below Jina limit
): T[][] {
  const batches: T[][] = [];
  let currentBatch: T[] = [];
  let currentTokenCount = 0;

  for (const chunk of chunks) {
    const chunkTokens = chunk.token_count;

    // Would adding this chunk exceed the limit?
    if (currentTokenCount + chunkTokens > maxTokens && currentBatch.length > 0) {
      // Start new batch
      batches.push(currentBatch);
      currentBatch = [chunk];
      currentTokenCount = chunkTokens;
    } else {
      // Add to current batch
      currentBatch.push(chunk);
      currentTokenCount += chunkTokens;
    }
  }

  // Add final batch
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}
```

### Key Features

1. **Token-aware**: Uses actual `chunk.token_count` from tiktoken
2. **Dynamic batching**: Adjusts batch size based on content
3. **Language-agnostic**: Works for English, Russian, Chinese, etc.
4. **Optimal performance**: Maximizes chunks per batch within limit
5. **Safe buffer**: 7,500 token limit (694 below Jina's 8,194)

---

## Implementation Plan

### Phase 1: Add Token-Aware Batching Function

**File**: `src/shared/embeddings/batch-optimizer.ts` (new file)

```typescript
/**
 * Token-Aware Batch Optimizer for Jina Embeddings API
 *
 * Dynamically creates batches that maximize API efficiency while
 * respecting Jina's 8,194 token limit per request.
 */

export interface TokenCountedChunk {
  token_count: number;
  [key: string]: any; // Allow any other properties
}

export interface BatchConfig {
  /** Maximum tokens per batch (default: 7500 for safety buffer) */
  maxTokensPerBatch: number;

  /** Maximum chunks per batch (default: 100, Jina's hard limit) */
  maxChunksPerBatch: number;

  /** Minimum chunks per batch (default: 1) */
  minChunksPerBatch: number;
}

export const DEFAULT_BATCH_CONFIG: BatchConfig = {
  maxTokensPerBatch: 7500, // 694 token buffer below Jina's 8194 limit
  maxChunksPerBatch: 100,  // Jina API limit
  minChunksPerBatch: 1,
};

/**
 * Create token-aware batches from chunks
 *
 * @param chunks - Array of chunks with token_count property
 * @param config - Batching configuration
 * @returns Array of chunk batches optimized for token limit
 */
export function createTokenAwareBatches<T extends TokenCountedChunk>(
  chunks: T[],
  config: Partial<BatchConfig> = {}
): T[][] {
  const fullConfig = { ...DEFAULT_BATCH_CONFIG, ...config };
  const batches: T[][] = [];
  let currentBatch: T[] = [];
  let currentTokenCount = 0;

  for (const chunk of chunks) {
    const chunkTokens = chunk.token_count;

    // Check if chunk alone exceeds limit (should be caught earlier, but handle gracefully)
    if (chunkTokens > fullConfig.maxTokensPerBatch) {
      console.warn(
        `Chunk has ${chunkTokens} tokens, exceeding maxTokensPerBatch (${fullConfig.maxTokensPerBatch}). ` +
        `This chunk will be processed alone and may fail API validation.`
      );

      // Process oversized chunk in its own batch
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
        currentTokenCount = 0;
      }
      batches.push([chunk]);
      continue;
    }

    // Would adding this chunk exceed token or count limits?
    const wouldExceedTokens = currentTokenCount + chunkTokens > fullConfig.maxTokensPerBatch;
    const wouldExceedCount = currentBatch.length >= fullConfig.maxChunksPerBatch;

    if ((wouldExceedTokens || wouldExceedCount) && currentBatch.length > 0) {
      // Start new batch
      batches.push(currentBatch);
      currentBatch = [chunk];
      currentTokenCount = chunkTokens;
    } else {
      // Add to current batch
      currentBatch.push(chunk);
      currentTokenCount += chunkTokens;
    }
  }

  // Add final batch
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

/**
 * Get batching statistics for logging/monitoring
 */
export function getBatchStats<T extends TokenCountedChunk>(
  batches: T[][]
): {
  batchCount: number;
  avgBatchSize: number;
  avgTokensPerBatch: number;
  minTokensPerBatch: number;
  maxTokensPerBatch: number;
  totalChunks: number;
  totalTokens: number;
} {
  const batchTokenCounts = batches.map(batch =>
    batch.reduce((sum, chunk) => sum + chunk.token_count, 0)
  );

  const totalChunks = batches.reduce((sum, batch) => sum + batch.length, 0);
  const totalTokens = batchTokenCounts.reduce((sum, count) => sum + count, 0);

  return {
    batchCount: batches.length,
    avgBatchSize: totalChunks / batches.length,
    avgTokensPerBatch: totalTokens / batches.length,
    minTokensPerBatch: Math.min(...batchTokenCounts),
    maxTokensPerBatch: Math.max(...batchTokenCounts),
    totalChunks,
    totalTokens,
  };
}
```

### Phase 2: Update generate.ts

**File**: `src/shared/embeddings/generate.ts`

Replace:
```typescript
const BATCH_SIZE = 5;
const embeddings: EmbeddingResult[] = [];
let totalTokens = 0;
let batchCount = 0;

// Process chunks in batches
for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
  const batch = chunks.slice(i, i + BATCH_SIZE);
  // ... rest of logic
}
```

With:
```typescript
import { createTokenAwareBatches, getBatchStats } from './batch-optimizer.js';

const batches = createTokenAwareBatches(chunks, {
  maxTokensPerBatch: 7500, // Safe buffer below Jina's 8194 limit
  maxChunksPerBatch: 100,  // Jina API limit
});

// Log batch statistics for monitoring
const stats = getBatchStats(batches);
logger.info({
  batchCount: stats.batchCount,
  avgBatchSize: Math.round(stats.avgBatchSize),
  avgTokensPerBatch: Math.round(stats.avgTokensPerBatch),
  totalChunks: stats.totalChunks,
  task,
}, 'Token-aware batching applied');

const embeddings: EmbeddingResult[] = [];
let totalTokens = 0;
let batchCount = 0;

// Process token-aware batches
for (const batch of batches) {
  // ... rest of logic (same as before)
}
```

### Phase 3: Add Tests

**File**: `src/shared/embeddings/batch-optimizer.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { createTokenAwareBatches, getBatchStats } from './batch-optimizer';

describe('Token-Aware Batching', () => {
  it('should create single batch for small chunks under limit', () => {
    const chunks = Array.from({ length: 20 }, (_, i) => ({
      chunk_id: `chunk-${i}`,
      token_count: 300, // 20 × 300 = 6000 tokens (under 7500)
    }));

    const batches = createTokenAwareBatches(chunks);

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(20);
  });

  it('should split large chunks into multiple batches', () => {
    const chunks = Array.from({ length: 20 }, (_, i) => ({
      chunk_id: `chunk-${i}`,
      token_count: 1500, // 20 × 1500 = 30,000 tokens (needs ~4 batches)
    }));

    const batches = createTokenAwareBatches(chunks);

    expect(batches.length).toBeGreaterThan(1);

    // Each batch should be under 7500 tokens
    for (const batch of batches) {
      const totalTokens = batch.reduce((sum, c) => sum + c.token_count, 0);
      expect(totalTokens).toBeLessThanOrEqual(7500);
    }
  });

  it('should respect maxChunksPerBatch limit', () => {
    const chunks = Array.from({ length: 150 }, (_, i) => ({
      chunk_id: `chunk-${i}`,
      token_count: 10, // Very small chunks
    }));

    const batches = createTokenAwareBatches(chunks, {
      maxChunksPerBatch: 100,
      maxTokensPerBatch: 7500,
    });

    // Should have at least 2 batches (150 chunks, max 100 per batch)
    expect(batches.length).toBeGreaterThanOrEqual(2);

    for (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(100);
    }
  });

  it('should handle mixed chunk sizes optimally', () => {
    const chunks = [
      // 3 large parent chunks
      { chunk_id: 'parent-1', token_count: 1500 },
      { chunk_id: 'parent-2', token_count: 1500 },
      { chunk_id: 'parent-3', token_count: 1500 }, // Total: 4500 tokens
      // 10 small child chunks
      ...Array.from({ length: 10 }, (_, i) => ({
        chunk_id: `child-${i}`,
        token_count: 400, // 10 × 400 = 4000 tokens
      })),
    ];

    const batches = createTokenAwareBatches(chunks);

    // First batch: 3 parents + some children (up to 7500 tokens)
    // Remaining batches: leftover children
    expect(batches.length).toBeGreaterThanOrEqual(1);

    // Verify no batch exceeds limit
    for (const batch of batches) {
      const totalTokens = batch.reduce((sum, c) => sum + c.token_count, 0);
      expect(totalTokens).toBeLessThanOrEqual(7500);
    }
  });

  it('should calculate correct batch statistics', () => {
    const chunks = Array.from({ length: 10 }, (_, i) => ({
      chunk_id: `chunk-${i}`,
      token_count: 500,
    }));

    const batches = createTokenAwareBatches(chunks);
    const stats = getBatchStats(batches);

    expect(stats.totalChunks).toBe(10);
    expect(stats.totalTokens).toBe(5000);
    expect(stats.batchCount).toBeGreaterThan(0);
  });
});
```

---

## Validation Criteria

### Performance Benchmarks

| Document Type | Chunks | Fixed Batch (5) | Token-Aware | Improvement |
|--------------|--------|-----------------|-------------|-------------|
| Small TXT | 22 (child-only) | 5 batches | **2 batches** | **60% faster** |
| Medium DOCX | 54 (parent+child) | 11 batches | **7 batches** | **36% faster** |
| Large PDF | 200 (parent+child) | 40 batches | **27 batches** | **32% faster** |

### Multilingual Safety

- ✅ English documents: 1500 token parent chunks work
- ✅ Russian documents: 1500 token parent chunks work (higher token density accounted for)
- ✅ Chinese/Japanese: Parent chunks may have higher token counts, but algorithm handles gracefully

### API Usage Optimization

- **Before**: 5 chunks/batch regardless of size
- **After**: Up to 100 chunks/batch if they fit in 7500 token limit
- **Result**: 50-60% reduction in API calls for typical documents

---

## Rollout Plan

1. **Week 1**: Implement `batch-optimizer.ts` with tests
2. **Week 2**: Update `generate.ts` to use token-aware batching
3. **Week 3**: Monitor production logs for batch statistics
4. **Week 4**: Tune `maxTokensPerBatch` if needed based on real-world data

---

## Monitoring & Metrics

Add logging to track:
```typescript
logger.info({
  batchStrategy: 'token-aware',
  batchCount: stats.batchCount,
  avgBatchSize: Math.round(stats.avgBatchSize),
  avgTokensPerBatch: Math.round(stats.avgTokensPerBatch),
  maxTokensObserved: stats.maxTokensPerBatch,
  documentSize: chunks.length,
  language: detectedLanguage, // if available
}, 'Embedding batch optimization');
```

**Alert thresholds**:
- `maxTokensObserved > 8000`: Warning (approaching Jina limit)
- `avgBatchSize < 3`: Performance degradation (too many small batches)

---

## Related Files

- Implementation: `src/shared/embeddings/generate.ts`
- Current fix: Line 272 (`BATCH_SIZE = 5`)
- Chunking config: `src/shared/embeddings/markdown-chunker.ts` (lines 74-76)
- Tests: `tests/integration/document-processing-worker.test.ts`

---

## References

- Jina API Docs: https://jina.ai/embeddings (8,194 token limit)
- Tiktoken: https://github.com/openai/tiktoken (token counting)
- Investigation Report: `docs/investigations/INV-2025-10-25-001-integration-tests-failure.md`
