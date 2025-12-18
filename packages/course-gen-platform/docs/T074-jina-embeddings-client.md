# T074: Jina-v3 Embeddings API Client Implementation

**Status**: ✅ Complete
**Date**: 2025-10-14
**Task**: User Story 5 - RAG Infrastructure Ready

---

## Overview

This document describes the implementation of the Jina-embeddings-v3 API client for generating 768-dimensional text embeddings. The client is production-ready with comprehensive error handling, rate limiting, and exponential backoff retry logic.

## Implementation Details

### Files Created

1. **Primary Client**:
   - `/packages/course-gen-platform/src/shared/embeddings/jina-client.ts`
   - Core implementation with all API interaction logic
   - 500+ lines with comprehensive JSDoc documentation

2. **Module Exports**:
   - `/packages/course-gen-platform/src/shared/embeddings/index.ts`
   - Clean public API for importing client functions

3. **Verification Script**:
   - `/packages/course-gen-platform/scripts/verify-jina-embeddings.ts`
   - Comprehensive test suite validating all functionality

## Features Implemented

### Core Functionality

✅ **Rate Limiting**
- 1500 requests per minute (1 request per 40ms minimum)
- Simple timestamp-based implementation
- Queues requests to respect API limits

✅ **Exponential Backoff**
- Retry strategy: 1s → 2s → 4s → 8s → 16s → 32s (max)
- Maximum 3 retry attempts
- Handles 429 (rate limit), 500 (server error), and network failures
- Does not retry on 4xx client errors (except 429)

✅ **Task-Specific Embeddings**
- `retrieval.passage`: For indexing documents/content
- `retrieval.query`: For search queries
- Optimizes embeddings for each use case

✅ **Batch Processing**
- Supports up to 100 texts per API request
- Automatically splits larger batches into multiple requests
- Efficient for bulk document processing

✅ **Validation & Error Handling**
- Environment variable validation (JINA_API_KEY)
- Response structure validation
- Dimension verification (768 dimensions)
- Typed error classes with descriptive messages

### API Configuration

```typescript
{
  model: "jina-embeddings-v3",
  dimensions: 768,           // Matches Qdrant collection
  normalized: false,         // Qdrant handles normalization
  truncate: true,           // Auto-truncate texts >8192 tokens
  task: "retrieval.passage" | "retrieval.query"
}
```

### Public API

#### Single Embedding Generation

```typescript
import { generateEmbedding } from '@/shared/embeddings';

// For indexing documents
const documentEmbedding = await generateEmbedding(
  "Machine learning is a subset of AI...",
  "retrieval.passage"
);

// For search queries
const queryEmbedding = await generateEmbedding(
  "What is machine learning?",
  "retrieval.query"
);
```

#### Batch Embedding Generation

```typescript
import { generateEmbeddings } from '@/shared/embeddings';

const texts = [
  "First document chunk...",
  "Second document chunk...",
  "Third document chunk..."
];

const embeddings = await generateEmbeddings(texts, "retrieval.passage");
// Returns: number[][] - Array of 768-dimensional vectors
```

#### Health Check

```typescript
import { healthCheck } from '@/shared/embeddings';

// Verify API connectivity on startup
const isHealthy = await healthCheck(); // true/false
```

#### Error Handling

```typescript
import { JinaEmbeddingError } from '@/shared/embeddings';

try {
  const embedding = await generateEmbedding(text, "retrieval.passage");
} catch (error) {
  if (error instanceof JinaEmbeddingError) {
    console.error('Jina API Error:', {
      type: error.errorType,
      status: error.statusCode,
      message: error.message
    });
  }
}
```

## Verification Results

The implementation was verified with comprehensive tests:

```
✅ All tests passed successfully!

Performance Metrics:
   Health check:          1038ms
   Single embedding:      502ms
   Batch (5 embeddings):  509ms
   Average per embedding: 101.80ms

Configuration:
   Model: jina-embeddings-v3
   Dimensions: 768
   Rate limit: 1500 RPM (40ms between requests)
   Retry strategy: Exponential backoff (max 3 retries)
```

### Semantic Similarity Test

The verification tested semantic similarity between a passage and query:

- **Passage**: "Machine learning is a subset of artificial intelligence..."
- **Query**: "What is machine learning?"
- **Cosine Similarity**: 0.8491 (High similarity confirmed)

This validates that the embeddings correctly capture semantic relationships.

## Architecture Patterns

### Singleton Pattern

The rate limiter uses a singleton pattern to ensure rate limiting works across all API calls in the application:

```typescript
const rateLimiter = new RateLimiter();
// Shared across all generateEmbedding() calls
```

### Error Type Hierarchy

```typescript
export class JinaEmbeddingError extends Error {
  errorType: string;      // CONFIG_ERROR, API_ERROR, etc.
  statusCode?: number;    // HTTP status code
  originalError?: unknown; // Original error for debugging
}
```

### Rate Limiting Strategy

Simple timestamp-based approach:

```typescript
class RateLimiter {
  private lastRequestTime = 0;
  private readonly minInterval = 40; // 40ms = 1500 RPM

  async waitForSlot(): Promise<void> {
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    if (timeSinceLastRequest < this.minInterval) {
      await sleep(this.minInterval - timeSinceLastRequest);
    }
    this.lastRequestTime = Date.now();
  }
}
```

## Environment Configuration

Required environment variable:

```bash
JINA_API_KEY=jina_d7901bb462b54d9a84e4803a47e97f790iLLm0bIEhC6vShoSDFyrSHwtszH
```

Already configured in `.env` file.

## Integration with Qdrant

The embeddings are configured to match the Qdrant collection:

| Parameter         | Jina Client | Qdrant Collection | Status |
|-------------------|-------------|-------------------|--------|
| Dimensions        | 768         | 768               | ✅ Match |
| Distance Metric   | N/A         | Cosine            | ✅ Compatible |
| Normalization     | false       | Handled by Qdrant | ✅ Optimal |
| Max Token Length  | 8192        | N/A               | ✅ Auto-truncate |

## Cost Analysis

Based on Jina-v3 pricing ($0.02 per 1M tokens):

- **Stage 0 Estimate**: 5 courses × 200 pages × 500 tokens = 500K tokens
- **Cost**: $0.01 (negligible)
- **Rate Limit**: 1500 RPM = sufficient for 90K embeddings/hour
- **Break-even for Self-hosting**: >20GB indexed data (~$150/month)

## Performance Characteristics

### Latency Measurements

- **Single embedding**: ~500ms (includes rate limiting + API call)
- **Batch (5 texts)**: ~500ms total (~100ms per embedding)
- **Batch efficiency**: ~5x faster than individual calls

### Rate Limiting Overhead

- **Per-request overhead**: 40ms minimum (rate limit enforcement)
- **Actual API latency**: ~400-500ms
- **Total latency**: 440-540ms per embedding

### Batch Recommendations

For optimal performance:
- Use `generateEmbeddings()` for 2+ texts (amortizes API latency)
- Process in batches of 10-100 texts for best throughput
- Respect 1500 RPM limit (automatically enforced by client)

## Error Scenarios Handled

### Configuration Errors
- Missing `JINA_API_KEY` → Throws `CONFIG_ERROR` immediately
- Invalid API key → Throws `API_ERROR` with 401 status

### API Errors
- 429 (Rate limit) → Retry with exponential backoff (max 3 retries)
- 422 (Validation) → Retry (may be transient)
- 500 (Server error) → Retry with exponential backoff
- 4xx (Client errors) → Throw immediately (no retry)

### Network Errors
- Connection timeout → Retry with exponential backoff
- DNS resolution failure → Retry
- Network unreachable → Retry

### Response Validation Errors
- Invalid JSON → Throws `INVALID_RESPONSE`
- Missing data array → Throws `INVALID_RESPONSE`
- Wrong dimensions → Throws `DIMENSION_MISMATCH`

## TypeScript Integration

### Type Exports

```typescript
export type {
  JinaEmbeddingRequest,   // API request structure
  JinaEmbeddingResponse,  // API response structure
  JinaErrorResponse,      // API error structure
};

export class JinaEmbeddingError extends Error {
  // Custom error class
}
```

### Type Safety

All functions are fully typed:

```typescript
function generateEmbedding(
  text: string,
  task: 'retrieval.passage' | 'retrieval.query'
): Promise<number[]>;

function generateEmbeddings(
  texts: string[],
  task: 'retrieval.passage' | 'retrieval.query'
): Promise<number[][]>;
```

## Testing & Verification

### Running the Verification Script

```bash
# From packages/course-gen-platform directory
pnpm tsx scripts/verify-jina-embeddings.ts
```

### Test Coverage

The verification script validates:

1. ✅ Health check and API connectivity
2. ✅ Single passage embedding generation
3. ✅ Single query embedding generation
4. ✅ Batch embedding generation
5. ✅ Semantic similarity calculation
6. ✅ Error handling (missing API key)
7. ✅ Dimension validation (768 dimensions)
8. ✅ Performance metrics

## Next Steps

### Immediate Dependencies (Stage 0)

1. **T075 - Document Chunking Pipeline**
   - Implement text chunking (512 tokens per chunk, 50 token overlap)
   - Use with `generateEmbeddings()` for efficient batch processing

2. **T076 - Redis Caching Layer**
   - Cache embeddings to reduce API calls
   - Use embedding hash as cache key
   - TTL: 7 days for frequently accessed embeddings

3. **T077 - Vector Upload Service**
   - Integrate Jina client with Qdrant upsert
   - Batch upload vectors with proper error handling

### Integration Example (Preview of T077)

```typescript
import { generateEmbeddings } from '@/shared/embeddings';
import { qdrantClient } from '@/shared/qdrant/client';

// T075: Chunk document
const chunks = chunkDocument(documentText, { size: 512, overlap: 50 });

// T074: Generate embeddings (batch)
const embeddings = await generateEmbeddings(chunks, 'retrieval.passage');

// T077: Upload to Qdrant
const points = chunks.map((chunk, i) => ({
  id: generateId(),
  vector: embeddings[i],
  payload: { text: chunk, courseId, chunkIndex: i }
}));

await qdrantClient.upsert('knowledge-base', { points });
```

## Dependencies Added

No external dependencies were added. The implementation uses:

- Native `fetch` API (Node.js 18+ built-in)
- Native `Promise` and `setTimeout` for rate limiting
- TypeScript standard library

## Compilation Status

✅ **TypeScript compilation successful**

```bash
npx tsc --noEmit src/shared/embeddings/jina-client.ts
# No errors
```

Note: Pre-existing errors in `src/shared/qdrant/examples.ts` are unrelated to this implementation.

## Code Quality

### Documentation
- Comprehensive JSDoc comments on all public functions
- Usage examples in documentation
- Type annotations on all parameters and return values

### Error Handling
- Custom error class with detailed context
- Descriptive error messages for debugging
- Proper error propagation

### Performance
- Efficient rate limiting with minimal overhead
- Batch processing support for throughput optimization
- Automatic retry logic for resilience

### Maintainability
- Clear separation of concerns
- Single responsibility principle
- Easy to test and extend

## References

- **Jina AI Documentation**: https://jina.ai/embeddings/
- **Research Document**: `/specs/001-stage-0-foundation/research.md`
- **Qdrant Client Reference**: `/src/shared/qdrant/client.ts`
- **Task Specification**: `/specs/001-stage-0-foundation/tasks.md` (T074)

## Acceptance Criteria ✅

All acceptance criteria met:

- ✅ Client implementation with rate limiting
- ✅ Rate limiting (1500 RPM / 40ms between requests) enforced
- ✅ Exponential backoff on failures (1s → 2s → 4s → fail)
- ✅ Both task types supported ("retrieval.passage", "retrieval.query")
- ✅ 768 dimensions configured
- ✅ TypeScript types exported
- ✅ Comprehensive error handling
- ✅ JSDoc documentation with examples
- ✅ Environment variable validation
- ✅ Code compiles without errors
- ✅ Verification tests pass

---

**Implementation Complete**: Ready for T075 (Document Chunking)
