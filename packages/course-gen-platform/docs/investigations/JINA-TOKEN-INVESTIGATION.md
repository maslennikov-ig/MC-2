# Jina Token Consumption Investigation

**Date**: 2025-12-06
**Issue**: ~1,000,000 tokens consumed in 3 days during development
**Status**: ✅ FIXES IMPLEMENTED - Token tracking + Redis caching added to reranker

---

## Executive Summary

Found **6 major token consumption sources** in the codebase. The main suspects are:
1. **Jina Reranker** - called for every section (Stage 5) and lesson (Stage 6)
2. **Quality Validator** - multiple embedding calls per course generation
3. **RAG Query Embeddings** - generated for each search query (with caching)
4. **Document Embedding** - full document chunk embeddings (with caching)
5. **Semantic Matching Warmup** - ~608 tokens per server restart
6. **Integration Tests** - if running tests with real API

---

## Token Consumption Sources

### 1. Server Warmup (~608 tokens/restart)

**File**: `src/server/index.ts:87-117`
**Calls**: `warmupEmbeddingCache()` from `semantic-matching.ts`

```typescript
await warmupEmbeddingCache({
  exercise_types: [...],   // 6 values
  exercise_type: [...],    // 7 values
  primary_strategy: [...], // 5 values
  // ... total 38 unique values
});
```

**Caching**: In-memory Map only (NOT Redis)
**Per restart**: ~608 tokens
**Risk**: LOW - minimal consumption

---

### 2. Quality Validator (MAJOR CONSUMER)

**File**: `src/shared/validation/quality-validator.ts`
**Functions**:
- `validateMetadata()` - 2 embedding calls (lines 188, 197)
- `validateSections()` - 2 calls × N sections (lines 323-324)
- `validateSummaryQuality()` - 2 embedding calls (lines 605-606)

**Caching**: NONE - uses `jina-client.ts` directly
**Per course (10 sections)**:
- Metadata: 2 × ~100 tokens = ~200 tokens
- Sections: 10 × 2 × ~100 tokens = ~2,000 tokens
- Summaries: depends on usage

**Risk**: HIGH - no caching, called during generation

---

### 3. Jina Reranker (SUSPECTED MAJOR CONSUMER)

**File**: `src/shared/jina/reranker-client.ts`
**Called from**:
- `src/stages/stage5-generation/utils/section-rag-retriever.ts:288`
- `src/stages/stage6-lesson-content/utils/lesson-rag-retriever.ts:28`

**Pattern**:
```typescript
const reranked = await rerankDocuments(
  combinedQuery,                          // Query text
  sortedChunks.map(chunk => chunk.content), // ALL chunk contents
  targetChunks                            // top_n
);
```

**Caching**: NONE
**Token tracking**: NONE (no usage tracking!)
**Per section (Stage 5)**:
- Query: variable length
- Documents: 25-100 chunk contents (~500-2000 chars each)
- **Estimated**: 5,000-20,000 tokens per section

**Per lesson (Stage 6)**:
- Documents: 7-28 chunks
- **Estimated**: 1,000-5,000 tokens per lesson

**Per course (10 sections, 50 lessons)**:
- Section reranking: 10 × 10,000 = ~100,000 tokens
- Lesson reranking: 50 × 3,000 = ~150,000 tokens
- **Total reranking: ~250,000 tokens per course!**

**Risk**: CRITICAL - likely the main consumer

---

### 4. RAG Query Embeddings

**File**: `src/shared/qdrant/search-operations.ts:24`
**Calls**: `generateQueryEmbedding(queryText)`

**Caching**: YES (Redis, 1-hour TTL in `generate.ts:601-614`)
**Per query**: ~50-100 tokens
**Risk**: LOW-MEDIUM (cached, but many queries per course)

---

### 5. Document Chunk Embeddings (Stage 2)

**File**: `src/stages/stage2-document-processing/phases/phase-5-embedding.ts:30`
**Calls**: `generateEmbeddingsWithLateChunking()`

**Caching**: YES (Redis, 1-hour TTL)
**Per document**: Depends on chunk count
**Risk**: MEDIUM (cached, but large documents = many tokens)

---

### 6. Integration Tests

**File**: `tests/integration/jina-embeddings.test.ts`
**Risk**: HIGH if tests run with real API

Check if tests are running in CI or locally with real API key.

---

## API Endpoints Used

| API | Endpoint | Model | Tokens Per Call |
|-----|----------|-------|-----------------|
| Embeddings | `api.jina.ai/v1/embeddings` | jina-embeddings-v3 | ~tokens in text |
| Reranker | `api.jina.ai/v1/rerank` | jina-reranker-v2-base-multilingual | query + all docs |

---

## Current Token Tracking

| Component | Has Tracking? | Location |
|-----------|---------------|----------|
| jina-client.ts (Embeddings) | YES | `TokenUsageTracker` class |
| reranker-client.ts | NO! | Missing |
| generate.ts | Partial | Logs only |

---

## Debugging Steps for Live Session

### Step 1: Check current token stats

```bash
# Start server and observe warmup
cd packages/course-gen-platform
pnpm dev

# Watch for [Jina] log entries
```

### Step 2: Check Jina Admin

1. Go to https://jina.ai/embeddings/ dashboard
2. Look at:
   - **Requests** tab - number of API calls
   - **Tokens** tab - token consumption over time
   - **Models** tab - which models are being used

### Step 3: Add Reranker Token Tracking

Edit `src/shared/jina/reranker-client.ts`, add after line 231:

```typescript
// Track token usage (add this)
if (data.usage?.total_tokens) {
  logger.info({
    tokensUsed: data.usage.total_tokens,
    queryLength: payload.query.length,
    documentsCount: payload.documents.length,
  }, '[Jina Reranker] Request completed');
}
```

### Step 4: Trigger Course Generation

1. Start a course generation job
2. Watch logs for:
   - `[Jina] Embedding request completed` - embedding tokens
   - `[Jina Reranker] Request completed` - reranker tokens (after adding tracking)
   - `[Section RAG] Reranking completed` - reranker calls
   - `[Lesson RAG] Reranking completed` - reranker calls

### Step 5: Count Actual Consumption

During generation, count:
- Number of embedding API calls
- Number of reranker API calls
- Total tokens per stage

---

## Hypotheses

### Hypothesis 1: Reranker is the main consumer

**Evidence**:
- No caching on reranker
- Called for every section AND every lesson
- Sends ALL chunk content (not just IDs)
- 10 sections × 50-100 chunks = massive token usage

**Test**: Add token tracking to reranker, run one course generation

### Hypothesis 2: Tests are running with real API

**Evidence**:
- `tests/integration/jina-embeddings.test.ts` has many test cases
- Each test generates real embeddings

**Test**: Check CI logs, check if tests run locally

### Hypothesis 3: Multiple course generations

**Evidence**:
- Development involves repeated test runs
- Each run consumes tokens

**Test**: Check Jina admin for request timestamps

---

## Quick Wins (Optimizations)

### 1. Add Reranker Token Tracking (Priority: HIGH)

Add logging to understand consumption.

### 2. Cache Reranker Results (Priority: HIGH)

```typescript
// In section-rag-retriever.ts
const cacheKey = `rerank:${courseId}:${sectionId}:${queriesHash}`;
const cached = await cache.get(cacheKey);
if (cached) return cached;
```

### 3. Reduce Reranker Candidate Count (Priority: MEDIUM)

Current: `candidateMultiplier: 4` (fetches 4× chunks for reranking)
Change to: `candidateMultiplier: 2` to reduce tokens

### 4. Disable Quality Validator in Dev (Priority: MEDIUM)

Add feature flag to skip semantic quality validation during development.

### 5. Mock Tests (Priority: MEDIUM)

Use mocked embeddings in tests to avoid API calls.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/shared/jina/reranker-client.ts` | Add token tracking |
| `src/stages/stage5-generation/utils/section-rag-retriever.ts` | Add caching for reranker |
| `src/stages/stage6-lesson-content/utils/lesson-rag-retriever.ts` | Add caching for reranker |
| `src/shared/validation/quality-validator.ts` | Add caching or feature flag |

---

## Live Debugging Commands

```bash
# Start server with verbose logging
LOG_LEVEL=debug pnpm dev

# Watch for Jina-related logs
pnpm dev 2>&1 | grep -E "\[Jina|embedding|rerank"

# Check Redis for cached embeddings
redis-cli KEYS "embedding:*" | wc -l

# Check Redis for cached search results
redis-cli KEYS "search:*" | wc -l
```

---

## Next Steps

1. **Start server**, observe warmup tokens
2. **Check Jina Admin** for request history
3. **Add reranker tracking** (quick edit)
4. **Trigger one course generation**, count tokens
5. **Compare with Jina Admin** to verify
6. **Implement caching** for biggest consumers

---

## Appendix: All Jina API Call Sites

### Embeddings API (`jina-embeddings-v3`)

| File | Function | Caching |
|------|----------|---------|
| `jina-client.ts:326` | `generateEmbedding()` | NO |
| `jina-client.ts:397` | `generateEmbeddings()` | NO |
| `generate.ts:349` | `generateEmbeddingsWithLateChunking()` | YES (Redis) |
| `generate.ts:556` | `generateQueryEmbedding()` | YES (Redis) |
| `semantic-matching.ts:54` | `getEmbedding()` | In-memory only |
| `quality-validator.ts:188,197,323,324,605,606` | Multiple calls | NO |

### Reranker API (`jina-reranker-v2-base-multilingual`)

| File | Function | Caching |
|------|----------|---------|
| `reranker-client.ts:387` | `rerankDocuments()` | **YES (Redis, 1-hour TTL)** |
| `section-rag-retriever.ts:288` | Per-section reranking | **YES (via reranker-client)** |
| `lesson-rag-retriever.ts` | Per-lesson reranking | **YES (via reranker-client)** |

---

## Implemented Fixes (2025-12-06)

### Fix 1: Reranker Token Tracking ✅

**File**: `src/shared/jina/reranker-client.ts`

Added `TokenUsageTracker` class identical to `jina-client.ts`:
- Tracks `totalTokens`, `requestCount`, `sessionDurationMs`
- Logs every request with `[Jina Reranker] Request completed`
- Exports `getRerankerTokenStats()` and `resetRerankerTokenStats()`

**Log output now includes**:
```
[Jina Reranker] Request completed {
  tokensUsed: 15234,
  totalTokensSession: 45123,
  requestCount: 3,
  documentsReranked: 100,
  queryLength: 250,
  topN: 25
}
```

### Fix 2: Reranker Result Caching ✅

**File**: `src/shared/jina/reranker-client.ts`

Added Redis caching with 1-hour TTL (matching embeddings cache):
- Cache key: SHA-256 hash of `query:topN:documents.join('|')`
- Cache hits skip API call entirely
- Cache misses make API call and store result

**Expected token savings per course**:
- First run: ~480,000 tokens (section + lesson reranking)
- Retries: ~0 tokens (cache hits)
- **Savings: 100% on retries, significant savings on similar queries**

### New API

```typescript
import {
  getRerankerTokenStats,
  resetRerankerTokenStats
} from '@/shared/jina';

// Get current session stats
const stats = getRerankerTokenStats();
console.log(`Reranker tokens used: ${stats.totalTokens}`);
console.log(`Requests made: ${stats.requestCount}`);

// Reset for new session
resetRerankerTokenStats();
```

### Monitoring Commands

```bash
# Watch for reranker token usage
pnpm dev 2>&1 | grep -E "\[Jina Reranker\]"

# Check Redis for cached reranker results
redis-cli KEYS "rerank:*" | wc -l

# Get sample reranker cache key
redis-cli KEYS "rerank:*" | head -1
```

---

## Remaining Optimizations (TODO)

1. **Reduce candidateMultiplier** - Consider reducing from 4× to 2× in `section-rag-retriever.ts` and `lesson-rag-retriever.ts`
2. **Quality Validator caching** - Add caching for `quality-validator.ts` embedding calls
3. **Test mocking** - Mock Jina API in integration tests to avoid real token usage
