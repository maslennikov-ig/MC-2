# T076 - Redis Caching Implementation for Embedding Generation

## Implementation Summary

Successfully added Redis caching with 1-hour TTL to the embedding generation service as specified in task requirements.

## Changes Made

### File Modified
- **Path**: `/home/me/code/megacampus2/packages/course-gen-platform/src/shared/embeddings/generate.ts`

### Implementation Details

#### 1. Added Dependencies
```typescript
import { createHash } from 'crypto';
import { cache } from '../cache/redis';
import logger from '../logger';
```

#### 2. Cache Configuration
- **Cache TTL**: 3600 seconds (1 hour)
- **Cache Key Format**: `embedding:{sha256_hash}`
  - Hash combines text content and task type
  - Example: `embedding:a3f2b9c...` (SHA-256 hex digest)

#### 3. Cache Key Generation Function
```typescript
function generateCacheKey(text: string, task: string): string {
  const hash = createHash('sha256')
    .update(`${text}:${task}`)
    .digest('hex');
  return `embedding:${hash}`;
}
```

**Why SHA-256?**
- Deterministic: Same text always generates same key
- Collision-resistant: Virtually no hash collisions
- Fixed-length: Consistent key size regardless of text length
- Namespaced: Prefixed with `embedding:` for Redis organization

#### 4. Caching in `generateEmbeddingsWithLateChunking()`

**Flow:**
1. For each chunk in batch, check Redis cache
2. If cache hit (valid 768-dim embedding found):
   - Use cached embedding
   - Log cache hit with chunk metadata
3. If cache miss or invalid:
   - Add to API request queue
   - Track mapping between API response and batch index
4. Call Jina API only for uncached chunks
5. Cache newly generated embeddings with 1-hour TTL
6. Combine cached and new embeddings in correct order

**Benefits:**
- Reduced API calls for repeated content
- Lower costs (no Jina API charges for cached results)
- Faster response times (Redis is microseconds vs API milliseconds)
- Efficient batch processing (only embed what's needed)

**Error Handling:**
- Cache read errors → Fall back to API call
- Cache write errors → Log warning, continue without caching
- Always ensures embeddings are returned even if Redis fails

#### 5. Caching in `generateQueryEmbedding()`

**Flow:**
1. Generate cache key from query text + "retrieval.query"
2. Check Redis cache
3. If cache hit → Return cached embedding immediately
4. If cache miss:
   - Call Jina API
   - Cache result with 1-hour TTL
   - Return embedding

**Benefits:**
- Repeated queries (common in user sessions) are instant
- Reduces load on Jina API for popular queries
- Improves user experience with faster search

#### 6. Logging Implementation

**Log Levels:**
- `logger.debug()` - Cache hits/misses, individual operations
- `logger.info()` - Batch cache statistics
- `logger.warn()` - Cache errors, fallback operations

**Logged Metadata:**
- `cacheKey` - Full cache key for debugging
- `chunkId` - Chunk identifier for tracing
- `task` - Embedding task type (retrieval.passage/query)
- `batchSize`, `cacheHits`, `cacheMisses` - Batch statistics
- `ttl` - Cache expiration time
- `error` - Error details when cache operations fail

**Example Log Output:**
```json
{
  "timestamp": "2025-10-15T10:30:45.123Z",
  "level": "info",
  "message": "Embedding batch cache status",
  "batchSize": 50,
  "cacheHits": 35,
  "cacheMisses": 15,
  "task": "retrieval.passage"
}
```

## Cache Performance Metrics

### Expected Performance Improvements

#### First Request (Cold Cache)
- API calls: 100%
- Response time: ~500-2000ms (Jina API latency)
- Cost: Full Jina API charges

#### Subsequent Requests (Warm Cache)
- API calls: 0% (all from cache)
- Response time: ~5-20ms (Redis latency)
- Cost: Zero (no API calls)

#### Typical Production Scenario
Assuming 30% cache hit rate for document chunks:
- API calls reduced by 30%
- Average response time improved by ~200-600ms
- Cost savings of 30% on embedding generation

### Cache Hit Scenarios

1. **Document Reprocessing**
   - Same document uploaded multiple times
   - Cache hit rate: ~100%

2. **Similar Content Across Documents**
   - Common paragraphs, headers, footers
   - Cache hit rate: ~20-40%

3. **Query Repetition**
   - Users searching same terms
   - Cache hit rate: ~50-70% for popular queries

## Environment Configuration

### Required Environment Variables

```bash
# Redis connection (already configured)
REDIS_URL=redis://localhost:6379

# Jina API (required for embedding generation)
JINA_API_KEY=your-jina-api-key-here
```

### Redis Client Configuration
- **Connection**: Lazy connect (connects on first use)
- **Retry Strategy**: No retries per request (`maxRetriesPerRequest: null`)
- **Offline Queue**: Disabled (`enableOfflineQueue: false`)
- **Error Handling**: Graceful degradation (logs errors, continues without cache)

## Testing Recommendations

### Manual Testing

1. **Cache Miss Flow:**
```bash
# First request - should cache
curl -X POST http://localhost:3000/api/generate-embeddings \
  -H "Content-Type: application/json" \
  -d '{"text": "What is machine learning?", "task": "retrieval.query"}'

# Check Redis
redis-cli GET "embedding:$(echo -n 'What is machine learning?:retrieval.query' | sha256sum | cut -d' ' -f1)"
```

2. **Cache Hit Flow:**
```bash
# Second request - should use cache
curl -X POST http://localhost:3000/api/generate-embeddings \
  -H "Content-Type: application/json" \
  -d '{"text": "What is machine learning?", "task": "retrieval.query"}'

# Should be much faster, check logs for "cache hit"
```

3. **TTL Verification:**
```bash
# Check TTL in Redis
redis-cli TTL "embedding:{hash}"
# Should return value close to 3600
```

### Unit Test Template

```typescript
import { generateQueryEmbedding } from './generate';
import { cache } from '../cache/redis';

describe('generateQueryEmbedding with caching', () => {
  it('should cache embeddings with 1-hour TTL', async () => {
    const query = 'test query';
    const embedding = await generateQueryEmbedding(query);

    // Verify embedding dimensions
    expect(embedding).toHaveLength(768);

    // Verify cache was set
    const cacheKey = generateCacheKey(query, 'retrieval.query');
    const cached = await cache.get(cacheKey);
    expect(cached).toEqual(embedding);
  });

  it('should use cached embedding on second call', async () => {
    const query = 'test query 2';

    // First call - cache miss
    const embedding1 = await generateQueryEmbedding(query);

    // Second call - cache hit
    const embedding2 = await generateQueryEmbedding(query);

    // Should be identical
    expect(embedding1).toEqual(embedding2);
  });

  it('should handle Redis errors gracefully', async () => {
    // Mock Redis failure
    jest.spyOn(cache, 'get').mockRejectedValue(new Error('Redis down'));

    // Should still work (fallback to API)
    const embedding = await generateQueryEmbedding('test');
    expect(embedding).toHaveLength(768);
  });
});
```

## Monitoring and Observability

### Key Metrics to Track

1. **Cache Hit Rate**
   - Formula: `cache_hits / (cache_hits + cache_misses)`
   - Target: >30% for document chunks, >50% for queries

2. **Cache Latency**
   - p50: <10ms
   - p95: <20ms
   - p99: <50ms

3. **API Cost Savings**
   - Formula: `cache_hits * avg_api_cost`
   - Track monthly to demonstrate ROI

4. **Redis Memory Usage**
   - Each embedding: ~3KB (768 floats * 4 bytes)
   - 1000 cached embeddings ≈ 3MB
   - Monitor with `redis-cli INFO memory`

### Log Queries for Analysis

```bash
# Count cache hits vs misses
cat app.log | grep "cache hit" | wc -l
cat app.log | grep "cache miss" | wc -l

# Average batch cache efficiency
cat app.log | grep "Embedding batch cache status" | \
  jq '.cacheHits / .batchSize' | \
  awk '{sum+=$1; count++} END {print sum/count}'
```

## Production Deployment Checklist

- [x] Redis client properly configured
- [x] Cache TTL set to 3600 seconds (1 hour)
- [x] SHA-256 hashing for cache keys
- [x] Graceful error handling (fallback to API)
- [x] Comprehensive logging (debug, info, warn levels)
- [x] Type-safe cache operations (TypeScript types)
- [ ] Unit tests for caching logic
- [ ] Integration tests with Redis
- [ ] Performance benchmarking
- [ ] Cache hit rate monitoring dashboard
- [ ] Redis memory alerts configured

## Related Files

### Modified
- `/home/me/code/megacampus2/packages/course-gen-platform/src/shared/embeddings/generate.ts`

### Dependencies (Existing)
- `/home/me/code/megacampus2/packages/course-gen-platform/src/shared/cache/redis.ts` - Redis client
- `/home/me/code/megacampus2/packages/course-gen-platform/src/shared/logger/index.ts` - Logger

### Configuration
- `/home/me/code/megacampus2/packages/course-gen-platform/.env.example` - Environment variables

## Next Steps

1. **Add Unit Tests**
   - Test cache hit/miss scenarios
   - Test error handling
   - Test TTL behavior

2. **Performance Benchmarking**
   - Measure cache hit rate in production
   - Compare API costs before/after caching
   - Monitor Redis memory usage

3. **Optional Enhancements**
   - Add cache warming for popular queries
   - Implement cache eviction policies
   - Add cache statistics endpoint
   - Configure Redis persistence (RDB/AOF)

## Implementation Notes

- **Thread-Safe**: Redis operations are atomic
- **Production-Ready**: Graceful error handling prevents cascading failures
- **Cost-Effective**: Reduces Jina API costs significantly
- **Observable**: Comprehensive logging for debugging and monitoring
- **Maintainable**: Clear separation of concerns, well-documented

## Compliance with Task Requirements

✅ Accept document text and task type
✅ Call Jina-v3 API to generate embeddings
✅ Return 768-dimensional vector
✅ **Cache embeddings in Redis (1-hour TTL)** ← **COMPLETED**

All requirements from T076 have been implemented successfully.
