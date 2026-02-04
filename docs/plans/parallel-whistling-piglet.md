# Plan: Optimize get_grouped_error_logs RPC - Statement Timeout Fix

**Task:** mc2-ahmo
**Type:** Bug fix (Performance)
**Priority:** P3

## Problem Analysis

### Current State

- **Table size:** 157,847 error_logs (59MB data + 57MB indexes = 118MB total)
- **Unique groups:** 1,018 fingerprints
- **Avg logs/group:** ~155 records
- **shared_buffers:** 224MB (Supabase default)

### Performance Measurements

| Scenario                | Time        | Notes                                      |
| ----------------------- | ----------- | ------------------------------------------ |
| Cold cache (no filters) | **8,300ms** | First request after restart - TIMEOUT RISK |
| Warm cache (no filters) | 336ms       | Acceptable                                 |
| With status filter      | 302ms       | Acceptable                                 |
| With ILIKE search       | 625ms       | Suboptimal, GIN index not used             |
| Count function          | 166ms       | Acceptable                                 |

### Root Causes Identified

1. **Cold cache penalty** - First query reads 158K buffers from disk (~118MB), causing 8+ second execution. This is the PRIMARY issue.
2. **ILIKE search ignores index** - GIN index exists for `to_tsvector()` but RPC uses `ILIKE '%search%'` which requires pg_trgm extension to be indexed.
3. **Table size growth** - 157K records accumulated; needs archival strategy.

### Existing Indexes (14 total)

- `idx_error_logs_fingerprint` - for GROUP BY ✓
- `idx_error_logs_fingerprint_created` - for sorting (fingerprint, created_at DESC) ✓
- `idx_error_logs_environment` - for environment filter ✓
- `idx_error_logs_error_message_gin` - GIN for full-text (NOT used by ILIKE!)
- `idx_error_logs_severity_critical` - partial index for CRITICAL only
- Others: problem_id, course_id, organization_id, request_id, trpc_path, user_id

### What Was Tested and Rejected

**LATERAL subquery approach:** Tested alternative query structure using LATERAL to fetch latest row instead of multiple ARRAY_AGG. Result: **3,235ms** (10x slower than current 294ms). PostgreSQL creates nested loop with 1018 iterations. **REJECTED.**

---

## Solution Plan

### Phase 1: Install pg_trgm and Create Trigram Index for ILIKE

This will optimize the ILIKE search which currently takes 625ms.

```sql
-- Enable pg_trgm extension for ILIKE optimization
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram index for ILIKE '%search%' queries
CREATE INDEX CONCURRENTLY idx_error_logs_error_message_trgm
ON error_logs USING gin (error_message gin_trgm_ops);
```

**Rationale:** pg_trgm allows GIN index to accelerate `ILIKE '%pattern%'` queries. Currently search takes 625ms because it does sequential scan.

### Phase 2: Add Cache Warming on Server Start

Add a lightweight query on application startup to warm the shared buffers. This addresses the PRIMARY issue (cold cache 8.3s timeout).

```typescript
// In packages/course-gen-platform/src/server/index.ts or similar initialization
async function warmDatabaseCache() {
  const logger = createLogger('db-warmup');
  try {
    // Warm error_logs table into shared_buffers
    // This runs the grouped query with limit 1 to load index pages
    await supabaseAdmin.rpc('get_grouped_error_logs', { p_limit: 1 });
    logger.info('Database cache warmed for error_logs');
  } catch (error) {
    // Non-fatal - just log and continue
    logger.warn({ error }, 'Failed to warm database cache');
  }
}
```

**Rationale:** The first cold query takes 8.3s because PostgreSQL must read 118MB from disk. After warming, subsequent queries take 300-600ms which is acceptable.

### Phase 3: Archive Old Error Logs (Future Optimization)

Create an archival strategy to move old error_logs to a separate table/partition. This is **optional** but recommended when table grows further.

```sql
-- Move logs older than 30 days to archive table
-- (To be implemented when table exceeds 500K rows)
```

**NOT implementing now** - current 158K rows with warm cache performs acceptably.

---

## Files to Modify

| File                                                                                       | Change                                                 |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `packages/course-gen-platform/supabase/migrations/20260202_optimize_error_logs_search.sql` | NEW: pg_trgm extension + trigram index                 |
| `packages/course-gen-platform/src/server/index.ts`                                         | Add cache warming in `initializeServices()` (line ~92) |

---

## Implementation Details

### Migration File

```sql
-- Migration: 20260202_optimize_error_logs_search.sql
-- Purpose: Optimize ILIKE search performance for error_logs
-- Task: mc2-ahmo

-- ============================================================================
-- 1. Enable pg_trgm extension for trigram-based text search
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- 2. Create GIN trigram index for ILIKE searches
-- ============================================================================
-- This index accelerates queries like: WHERE error_message ILIKE '%pattern%'
-- Without this index, ILIKE with leading wildcard does sequential scan

CREATE INDEX CONCURRENTLY idx_error_logs_error_message_trgm
ON error_logs USING gin (error_message gin_trgm_ops);

COMMENT ON INDEX idx_error_logs_error_message_trgm IS
'GIN trigram index for fast ILIKE searches on error_message. Used by get_grouped_error_logs RPC.';

-- ============================================================================
-- 3. Verify index was created
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_error_logs_error_message_trgm'
  ) THEN
    RAISE EXCEPTION 'Failed to create idx_error_logs_error_message_trgm';
  END IF;
END;
$$;
```

### Cache Warming Code

Add to existing `initializeServices()` function in `src/server/index.ts`:

```typescript
// In initializeServices() function, after embedding cache warmup:

async function initializeServices() {
  try {
    // ... existing embedding cache warmup code ...

    // Warm error_logs database cache
    // This prevents 8+ second cold cache timeout on first admin panel access
    logger.info('[Startup] Warming database cache for error_logs...');
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const startTime = Date.now();
    await supabase.rpc('get_grouped_error_logs', { p_limit: 1 });
    const elapsed = Date.now() - startTime;
    logger.info({ elapsed_ms: elapsed }, '[Startup] Database cache warmed for error_logs');
  } catch (error) {
    // Non-critical - server can start without cache warming
    logger.warn({ error }, '[Startup] Failed to warm database cache (non-fatal)');
  }
}
```

**Key points:**

- Uses dynamic import to avoid circular dependencies
- Runs after embedding warmup (same function)
- Non-blocking, non-fatal on failure
- Logs timing for observability

---

## Verification

### Pre-deployment

```bash
# Type check
pnpm type-check

# Build
pnpm build
```

### Post-deployment SQL Verification

```sql
-- 1. Verify pg_trgm extension is installed
SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_trgm';

-- 2. Verify trigram index exists
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'error_logs' AND indexname LIKE '%trgm%';

-- 3. Test ILIKE search uses new index (should show Bitmap Index Scan)
EXPLAIN (ANALYZE)
SELECT * FROM error_logs
WHERE error_message ILIKE '%timeout%'
LIMIT 10;

-- 4. Test full RPC with search filter
EXPLAIN (ANALYZE)
SELECT * FROM get_grouped_error_logs(p_limit := 20, p_search := 'timeout');
-- Target: < 300ms (was 625ms)
```

### UI Verification

1. Restart the application (to test cache warming)
2. Open Admin Panel → Error Logs → Grouped View
3. First load should be fast (cache was warmed on startup)
4. Apply search filter: type "timeout" in search box
5. Verify response time < 1s
6. Check browser DevTools Network tab for actual latency

---

## Rollback Plan

```sql
-- Drop trigram index (if needed)
DROP INDEX CONCURRENTLY IF EXISTS idx_error_logs_error_message_trgm;

-- Note: pg_trgm extension can remain installed, it doesn't affect anything
```

Remove cache warming code from server initialization if causing issues.

---

## Risk Assessment

| Risk                            | Likelihood | Mitigation                      |
| ------------------------------- | ---------- | ------------------------------- |
| Index creation locks table      | None       | Using `CONCURRENTLY` - no locks |
| pg_trgm extension unavailable   | None       | Standard on Supabase            |
| Cache warming fails on startup  | Low        | Wrapped in try/catch, non-fatal |
| Trigram index increases storage | Low        | ~5-10MB additional, acceptable  |

---

## Expected Outcome

| Metric                | Before            | After                 |
| --------------------- | ----------------- | --------------------- |
| Cold cache query      | 8,300ms (TIMEOUT) | ~400ms (cache warmed) |
| ILIKE search          | 625ms             | < 200ms               |
| Warm cache query      | 336ms             | 336ms (unchanged)     |
| Additional index size | 0                 | ~5-10MB               |

---

## Summary

**Problem:** First query after server restart times out (8.3s) because database cache is cold.

**Solution:**

1. Add pg_trgm extension + trigram index for ILIKE search optimization
2. Warm database cache on server startup

**NOT doing:**

- Rewriting RPC function (tested LATERAL approach - 10x slower)
- Adding composite indexes (existing indexes are sufficient)
- Table partitioning/archival (not needed at current 158K row scale)
