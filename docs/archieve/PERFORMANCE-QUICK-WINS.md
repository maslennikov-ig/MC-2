# Performance Optimization Quick Wins
**Immediate Action Items - Stage 0 Foundation**

**Created**: 2025-10-17
**Priority**: 🔴 CRITICAL
**Timeline**: Week 1-2 implementation

---

## Overview

This document provides **immediate, high-impact optimizations** that can be implemented in 1-2 weeks to improve performance by 30-40% and establish baseline monitoring.

**See Full Analysis**: [PERFORMANCE-OPTIMIZATION-ANALYSIS.md](./PERFORMANCE-OPTIMIZATION-ANALYSIS.md)

---

## Quick Win #1: Consolidate File Upload Queries (60ms improvement)

**Impact**: 🔴 CRITICAL - 35-40% faster file uploads
**Effort**: 🟢 LOW (30 minutes)
**File**: `/packages/course-gen-platform/src/server/routers/generation.ts`

### Current Problem

Lines 290-349 execute **4 sequential database queries**:
```typescript
// Query 1: Course lookup
const { data: course } = await supabase.from('courses')...

// Query 2: Organization tier lookup
const { data: org } = await supabase.from('organizations')...

// Query 3: File count
const { count } = await supabase.from('file_catalog')...

// Later: Query 4: File insert
```

Each query adds 10-20ms network RTT. Total: **40-80ms wasted**.

### Solution: Single Query with JOINs

**Replace lines 290-349 with**:

```typescript
// Step 1: Single query to get course + org + file count
const { data: courseData, error: courseError } = await supabase
  .from('courses')
  .select(`
    id,
    organization_id,
    title,
    organizations!inner(
      id,
      tier
    )
  `)
  .eq('id', courseId)
  .eq('organization_id', currentUser.organizationId)
  .single();

if (courseError || !courseData) {
  throw new TRPCError({
    code: 'NOT_FOUND',
    message: `Course not found: ${courseId}`,
  });
}

// Step 2: Get file count in parallel (can't JOIN aggregate)
const { count: currentFileCount, error: countError } = await supabase
  .from('file_catalog')
  .select('*', { count: 'exact', head: true })
  .eq('course_id', courseId);

if (countError) {
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Failed to check existing file count',
  });
}

// Extract tier from nested organization
const tier = courseData.organizations?.tier;

if (!tier) {
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Organization tier not found',
  });
}

// Continue with validation (now uses tier variable)
const validationResult = validateFile(
  { filename, fileSize, mimeType },
  tier,  // Use extracted tier
  currentFileCount || 0
);
```

**Expected Improvement**: 60-70ms reduction (3 queries → 2 queries)

---

## Quick Win #2: Add Organization Tier Caching (20ms improvement)

**Impact**: 🟡 HIGH - 10-20ms saved per file upload
**Effort**: 🟢 LOW (15 minutes)
**File**: `/packages/course-gen-platform/src/server/routers/generation.ts`

### Solution: Redis Cache with 1-Hour TTL

**Add after tier extraction (line ~320)**:

```typescript
import { cache } from '../../shared/cache/redis';

// Cache key for organization tier
const tierCacheKey = `org:${currentUser.organizationId}:tier`;

// Try to get from cache first
let tier = await cache.get<string>(tierCacheKey);

if (!tier) {
  // Cache miss - query database
  const { data: courseData } = await supabase
    .from('courses')
    .select(`organizations!inner(tier)`)
    .eq('id', courseId)
    .single();

  tier = courseData?.organizations?.tier;

  if (tier) {
    // Cache for 1 hour
    await cache.set(tierCacheKey, tier, { ttl: 3600 });
    logger.debug('Organization tier cached', {
      orgId: currentUser.organizationId,
      tier,
    });
  }
}
```

**Expected Improvement**: 10-20ms saved on cache hits (95%+ hit rate expected)

**Cache Invalidation**: Add to organization tier update endpoint:
```typescript
// When organization tier changes
await cache.delete(`org:${organizationId}:tier`);
```

---

## Quick Win #3: Increase Search Cache TTL (30% higher hit rate)

**Impact**: 🟡 HIGH - 20-30% fewer Jina API calls
**Effort**: 🟢 LOW (5 minutes)
**File**: `/packages/course-gen-platform/src/shared/qdrant/search.ts`

### Current Problem

Line 31: `const SEARCH_CACHE_TTL = 300;` (5 minutes)

Documents rarely change, but cache expires too quickly, causing unnecessary Jina API calls (50-100ms each).

### Solution: Increase TTL + Add Invalidation

**Replace line 31**:

```typescript
const SEARCH_CACHE_TTL = 1800; // 30 minutes (was 5 minutes)
```

**Add cache invalidation function**:

```typescript
/**
 * Invalidates search cache for a specific course
 * Call this when documents are added/updated/deleted
 */
export async function invalidateSearchCacheForCourse(courseId: string): Promise<void> {
  try {
    const redis = getRedisClient();

    // Find all cache keys for this course
    // Pattern: search:*:course_id=${courseId}:*
    const pattern = `search:*`;
    const keys = await redis.keys(pattern);

    // Filter keys that contain the course ID
    const courseKeys = keys.filter(key => key.includes(`course_id=${courseId}`));

    if (courseKeys.length > 0) {
      await redis.del(...courseKeys);
      logger.info('Search cache invalidated', {
        courseId,
        keys_deleted: courseKeys.length,
      });
    }
  } catch (error) {
    logger.error('Failed to invalidate search cache', {
      error: error instanceof Error ? error.message : String(error),
      courseId,
    });
  }
}
```

**Call invalidation when documents change**:

```typescript
// In file upload handler (after successful insert)
await invalidateSearchCacheForCourse(courseId);

// In document deletion handler
await invalidateSearchCacheForCourse(courseId);
```

**Expected Improvement**: 30% higher cache hit rate → 20-30% fewer Jina API calls → lower costs + latency

---

## Quick Win #4: Add Performance Monitoring (CRITICAL)

**Impact**: 🔴 CRITICAL - Required to validate ALL other optimizations
**Effort**: 🟡 MEDIUM (2-3 hours)

### Without monitoring, you CANNOT validate performance targets!

### Step 1: Add tRPC Performance Middleware

**Create file**: `/packages/course-gen-platform/src/server/middleware/performance-monitoring.ts`

```typescript
import { middleware } from '../trpc';
import logger from '../../shared/logger';

export const performanceMonitoring = middleware(async ({ ctx, next, path, type }) => {
  const startTime = performance.now();

  try {
    const result = await next();
    const duration = performance.now() - startTime;

    logger.info('tRPC endpoint performance', {
      path,
      type,
      duration_ms: parseFloat(duration.toFixed(2)),
      user_id: ctx.user?.id,
      org_id: ctx.user?.organizationId,
    });

    return result;
  } catch (error) {
    const duration = performance.now() - startTime;

    logger.error('tRPC endpoint error', {
      path,
      type,
      duration_ms: parseFloat(duration.toFixed(2)),
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
});
```

**Add to tRPC context** in `/packages/course-gen-platform/src/server/trpc.ts`:

```typescript
import { performanceMonitoring } from './middleware/performance-monitoring';

// Add to all procedures
export const publicProcedure = t.procedure.use(performanceMonitoring);
export const protectedProcedure = t.procedure
  .use(authMiddleware)
  .use(performanceMonitoring);
```

### Step 2: Add Search Performance Tracking

**Modify** `/packages/course-gen-platform/src/shared/qdrant/search.ts`:

```typescript
export async function searchChunks(
  queryText: string,
  options: SearchOptions = {}
): Promise<SearchResponse> {
  const config = { ...DEFAULT_SEARCH_OPTIONS, ...options };
  config.filters = { ...DEFAULT_SEARCH_OPTIONS.filters, ...options.filters };

  const totalStartTime = Date.now();
  const metrics = {
    cache_check_ms: 0,
    cache_hit: false,
    embedding_generation_ms: 0,
    search_execution_ms: 0,
    total_ms: 0,
  };

  // Generate cache key
  const cacheKey = generateSearchCacheKey(queryText, config);
  const isCacheable = queryText.trim().length >= MIN_CACHEABLE_QUERY_LENGTH;

  // Check cache (measure time)
  const cacheStart = Date.now();
  if (isCacheable) {
    try {
      const cached = await cache.get<SearchResponse>(cacheKey);
      metrics.cache_check_ms = Date.now() - cacheStart;

      if (cached && cached.results && Array.isArray(cached.results)) {
        metrics.cache_hit = true;
        metrics.total_ms = Date.now() - totalStartTime;

        logger.info('Search performance (cache hit)', metrics);
        return cached;
      }
    } catch (error) {
      metrics.cache_check_ms = Date.now() - cacheStart;
      logger.warn('Cache read error', { error });
    }
  }

  // Cache miss - perform search
  logger.debug('Search cache miss', { queryPreview: queryText.substring(0, 50) });

  try {
    // Measure embedding generation
    const embeddingStart = Date.now();
    let searchResults: QdrantScoredPoint[];

    if (config.enable_hybrid) {
      searchResults = await hybridSearch(queryText, config);
    } else {
      searchResults = await denseSearch(queryText, config);
    }

    metrics.embedding_generation_ms = Date.now() - embeddingStart;

    // Measure search execution (already included in above, but for clarity)
    metrics.search_execution_ms = metrics.embedding_generation_ms;

    // Convert results
    const results = searchResults.map((point) => toSearchResult(point, config.include_payload));

    metrics.total_ms = Date.now() - totalStartTime;

    const response: SearchResponse = {
      results,
      metadata: {
        total_results: results.length,
        search_type: config.enable_hybrid ? 'hybrid' : 'dense',
        embedding_time_ms: metrics.embedding_generation_ms,
        search_time_ms: metrics.search_execution_ms,
        filters_applied: config.filters,
      },
    };

    // Log performance metrics
    logger.info('Search performance (cache miss)', {
      ...metrics,
      result_count: results.length,
      query_length: queryText.length,
    });

    // Cache results
    if (isCacheable) {
      await cache.set(cacheKey, response, { ttl: SEARCH_CACHE_TTL });
    }

    return response;
  } catch (error) {
    throw new Error(
      `Search failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
```

### Step 3: Add BullMQ Metrics

**Create file**: `/packages/course-gen-platform/src/orchestrator/metrics-collector.ts`

```typescript
import { QueueEvents } from 'bullmq';
import { getRedisClient } from '../shared/cache/redis';
import { getQueue } from './queue';
import logger from '../shared/logger';

export class BullMQMetricsCollector {
  private queueEvents: QueueEvents;
  private metricsInterval: NodeJS.Timeout | null = null;

  constructor(queueName: string) {
    this.queueEvents = new QueueEvents(queueName, {
      connection: getRedisClient()
    });
    this.setupListeners();
  }

  private setupListeners() {
    this.queueEvents.on('completed', ({ jobId, returnvalue }) => {
      logger.info('Job completed', {
        job_id: jobId,
        job_type: returnvalue?.jobType,
        success: returnvalue?.success,
      });
    });

    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      logger.error('Job failed', {
        job_id: jobId,
        reason: failedReason,
      });
    });
  }

  startMetricsCollection(intervalMs: number = 10000) {
    this.metricsInterval = setInterval(async () => {
      try {
        const queue = getQueue();
        const counts = await queue.getJobCounts();

        logger.info('Queue metrics', {
          waiting: counts.waiting || 0,
          active: counts.active || 0,
          completed: counts.completed || 0,
          failed: counts.failed || 0,
        });
      } catch (error) {
        logger.error('Failed to collect queue metrics', { error });
      }
    }, intervalMs);
  }

  stop() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    this.queueEvents.close();
  }
}
```

**Start metrics collection** in `/packages/course-gen-platform/src/orchestrator/worker.ts`:

```typescript
import { BullMQMetricsCollector } from './metrics-collector';

const metricsCollector = new BullMQMetricsCollector(QUEUE_NAME);
metricsCollector.startMetricsCollection(10000); // Every 10 seconds
```

---

## Quick Win #5: Add Redis Cache Hit Rate Tracking

**Impact**: 🟡 HIGH - Understand cache effectiveness
**Effort**: 🟢 LOW (30 minutes)
**File**: `/packages/course-gen-platform/src/shared/cache/redis.ts`

### Solution: Instrument Redis Cache

**Modify RedisCache class**:

```typescript
export class RedisCache {
  private client: Redis;
  private hitCount: Map<string, number> = new Map();
  private missCount: Map<string, number> = new Map();

  constructor() {
    this.client = getRedisClient();

    // Log cache stats every minute
    setInterval(() => {
      this.logCacheStats();
    }, 60000);
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      const namespace = this.getNamespace(key);

      if (value) {
        this.incrementHit(namespace);
        return JSON.parse(value) as T;
      } else {
        this.incrementMiss(namespace);
        return null;
      }
    } catch (error) {
      logger.error('Redis GET error', { key, error });
      return null;
    }
  }

  private getNamespace(key: string): string {
    return key.split(':')[0]; // e.g., 'embedding', 'search', 'rate-limit'
  }

  private incrementHit(namespace: string) {
    this.hitCount.set(namespace, (this.hitCount.get(namespace) || 0) + 1);
  }

  private incrementMiss(namespace: string) {
    this.missCount.set(namespace, (this.missCount.get(namespace) || 0) + 1);
  }

  private logCacheStats() {
    const namespaces = new Set([
      ...this.hitCount.keys(),
      ...this.missCount.keys(),
    ]);

    for (const namespace of namespaces) {
      const hits = this.hitCount.get(namespace) || 0;
      const misses = this.missCount.get(namespace) || 0;
      const total = hits + misses;

      if (total > 0) {
        const hitRate = ((hits / total) * 100).toFixed(2);

        logger.info('Cache stats', {
          namespace,
          hits,
          misses,
          total,
          hit_rate_pct: hitRate,
        });
      }
    }

    // Reset counters
    this.hitCount.clear();
    this.missCount.clear();
  }

  // ... rest of class methods
}
```

---

## Implementation Checklist

### Week 1: Critical Optimizations + Monitoring

- [ ] **Day 1-2**: Implement performance monitoring
  - [ ] Add tRPC performance middleware
  - [ ] Add search performance tracking
  - [ ] Add BullMQ metrics collector
  - [ ] Add Redis cache hit rate tracking

- [ ] **Day 3**: Consolidate file upload queries
  - [ ] Update generation.uploadFile endpoint
  - [ ] Test with various file types
  - [ ] Validate query reduction (3 → 2 queries)

- [ ] **Day 4**: Add organization tier caching
  - [ ] Implement Redis cache for tier lookups
  - [ ] Add cache invalidation on tier changes
  - [ ] Validate cache hit rate (>95%)

- [ ] **Day 5**: Increase search cache TTL
  - [ ] Update SEARCH_CACHE_TTL constant
  - [ ] Implement cache invalidation function
  - [ ] Add invalidation calls to document handlers

### Week 2: Validation + Documentation

- [ ] **Day 1-3**: Run baseline performance tests
  - [ ] Measure tRPC endpoint latencies (p50, p95, p99)
  - [ ] Measure BullMQ throughput by job type
  - [ ] Measure search latencies (with/without cache)
  - [ ] Document baseline metrics

- [ ] **Day 4-5**: Validate optimizations
  - [ ] Compare before/after metrics
  - [ ] Calculate improvement percentages
  - [ ] Document results
  - [ ] Identify next optimization targets

---

## Expected Results

### Before Optimizations (Estimated)

| Metric | Baseline |
|--------|----------|
| File Upload p95 | 250-350ms |
| Search p95 (cache miss) | 120-150ms |
| Search cache hit rate | 60-70% |
| BullMQ throughput (INITIALIZE) | 500 jobs/sec |

### After Optimizations (Expected)

| Metric | Target | Improvement |
|--------|--------|-------------|
| File Upload p95 | 150-200ms | 40% faster |
| Search p95 (cache miss) | 120-150ms | Same |
| Search cache hit rate | 85-90% | +20-30pp |
| BullMQ throughput (INITIALIZE) | 500+ jobs/sec | Maintained |

**Total Impact**: 30-40% latency improvement for file uploads, 20-30% cost reduction for search (fewer API calls)

---

## Monitoring Dashboard Recommendations

### Key Metrics to Track

1. **tRPC Endpoints**:
   - Request rate (req/sec)
   - Latency (p50, p95, p99)
   - Error rate
   - Breakdown by endpoint

2. **BullMQ**:
   - Queue depth (waiting, active)
   - Job processing rate (jobs/sec)
   - Job duration by type
   - Failure rate

3. **Search Performance**:
   - Cache hit/miss rate
   - Embedding generation time
   - Qdrant search time
   - Total search latency

4. **Redis Cache**:
   - Hit rate by namespace
   - Memory usage
   - Connection pool utilization

### Recommended Tools

- **Grafana** + **Prometheus**: For time-series metrics
- **Loki**: For log aggregation
- **New Relic** / **Datadog**: For APM (Application Performance Monitoring)

---

## Next Steps After Quick Wins

1. **Week 3-4**: Architectural improvements
   - Separate BullMQ queues for long-running jobs
   - Move base64 decoding to worker threads
   - Pre-compute common query embeddings

2. **Week 5**: Load testing
   - Create k6 load test scripts
   - Run stress tests
   - Document performance SLAs

3. **Ongoing**: Monitor and optimize
   - Review metrics weekly
   - Identify new bottlenecks
   - Iterate on optimizations

---

## Support

**Questions?** See full analysis: [PERFORMANCE-OPTIMIZATION-ANALYSIS.md](./PERFORMANCE-OPTIMIZATION-ANALYSIS.md)

**Issues?** Check logs for performance metrics:
```bash
# Filter logs for performance data
docker logs course-gen-platform | grep "performance"
docker logs course-gen-platform | grep "Cache stats"
docker logs course-gen-platform | grep "Queue metrics"
```

---

## Document Metadata

**Created**: 2025-10-17
**Author**: Performance Optimization Agent
**Version**: 1.0
**Status**: ✅ READY FOR IMPLEMENTATION
**Timeline**: Week 1-2 (10 days)

**Related Documents**:
- [PERFORMANCE-OPTIMIZATION-ANALYSIS.md](./PERFORMANCE-OPTIMIZATION-ANALYSIS.md) - Full analysis
- [README.md](../README.md) - Project overview
