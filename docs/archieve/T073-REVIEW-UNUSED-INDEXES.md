# T073: Review and Remove Unused Indexes

**Priority**: P3 - Low (Database optimization)
**Status**: ⏳ **PENDING**
**Created**: 2025-10-13
**Completed**: -
**Parent Task**: Stage 0 Foundation - Quality Improvements
**Impact**: Storage - Reduce database size, improve write performance
**Estimated Effort**: 1-2 hours (+ 30 days monitoring)
**Actual Effort**: -

---

## 📋 Executive Summary

Supabase Performance Advisor identified **18 indexes** that have not been used since database statistics were last reset. Unused indexes consume storage and slow down INSERT/UPDATE/DELETE operations without providing query benefits.

**Current State**:
- 18 indexes identified as potentially unused
- Each index consumes storage (varies by table size)
- Indexes slow down write operations
- Some indexes may be legitimately unused (new database)

**Recommended Approach**:
- ⚠️ **DO NOT DELETE IMMEDIATELY**
- Monitor index usage in production for 30 days
- Remove only confirmed unused indexes
- Keep indexes that are unused due to new database state

**Note**: This is a **P3 - Low Priority** task. Unused indexes have minimal impact in early stages. This is a maintenance task for production optimization.

---

## 🔍 Issue Analysis

### What Are Unused Indexes?

**Definition**: Indexes that PostgreSQL statistics show have not been used for query execution since the last stats reset.

**Query to Identify Unused Indexes**:
```sql
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,  -- Number of index scans (0 = unused)
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  pg_get_indexdef(indexrelid) AS index_definition
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname = 'public'
  AND indexrelname NOT LIKE 'pg_toast%'
ORDER BY pg_relation_size(indexrelid) DESC;
```

### Why Indexes May Appear Unused

**Legitimate Reasons**:
1. **New Database** - Statistics recently reset, not enough query history
2. **Infrequent Queries** - Index used rarely (e.g., monthly reports)
3. **Future Use** - Index created for planned features not yet implemented
4. **Backup/Recovery** - Index used for specific operations not captured in stats
5. **Seasonal Data** - Index used only during peak periods

**Genuine Unused**:
1. **Redundant Index** - Covered by another index
2. **Query Pattern Changed** - Queries optimized to not need index
3. **Mistakenly Created** - Created during testing, never used
4. **Table Rarely Queried** - Table has very low read volume

### Affected Indexes (18 total)

**Note**: Specific index list requires querying current database state. Below are likely candidates based on typical schema:

**Potentially Unused**:
1. Secondary indexes on foreign keys already covered by primary/unique constraints
2. Indexes on rarely-queried columns (e.g., `created_at` without date range queries)
3. Partial indexes for edge cases not yet encountered
4. Indexes on enum columns with low cardinality
5. Composite indexes with wrong column order

**Likely Needed** (do not remove):
1. Primary key indexes (btree on `id`)
2. Unique constraint indexes (email, usernames)
3. Foreign key indexes for join performance
4. Indexes used by RLS policies
5. Indexes for common filtering columns

---

## 💡 Proposed Solution

### Phase 1: Identification and Documentation (1 hour)

**Step 1: Query Current Unused Indexes**

```sql
-- Get detailed unused index report
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan AS scan_count,
  idx_tup_read AS tuples_read,
  idx_tup_fetch AS tuples_fetched,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  pg_get_indexdef(indexrelid) AS index_definition,
  -- Check if index is unique/primary
  (SELECT indisunique FROM pg_index WHERE indexrelid = i.indexrelid) AS is_unique,
  (SELECT indisprimary FROM pg_index WHERE indexrelid = i.indexrelid) AS is_primary
FROM pg_stat_user_indexes i
WHERE schemaname = 'public'
  AND idx_scan = 0
  AND indexrelname NOT LIKE 'pg_toast%'
ORDER BY pg_relation_size(indexrelid) DESC;
```

**Step 2: Categorize Each Index**

For each unused index, determine:
- **Keep**: Primary key, unique constraint, foreign key, RLS policy support
- **Monitor**: May be used infrequently, monitor for 30 days
- **Remove**: Redundant or genuinely unused

**Step 3: Document Findings**

Create report: `docs/UNUSED_INDEX_ANALYSIS.md`

```markdown
# Unused Index Analysis - 2025-10-13

## Indexes to Keep (Functional Requirement)
- index_name_1: Primary key on table_name
- index_name_2: Used by RLS policy policy_name

## Indexes to Monitor (30 Days)
- index_name_3: Created for feature X, monitor usage
- index_name_4: May be used by infrequent report queries

## Indexes to Remove (After Monitoring)
- index_name_5: Redundant with index_name_6
- index_name_6: Table rarely queried, no performance benefit
```

### Phase 2: Production Monitoring (30 days)

**Setup Monitoring Query**

```sql
-- Create view for ongoing monitoring
CREATE OR REPLACE VIEW unused_indexes_monitor AS
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size,
  pg_get_indexdef(indexrelid) AS definition,
  (SELECT indisunique FROM pg_index WHERE indexrelid = i.indexrelid) AS is_unique,
  (SELECT indisprimary FROM pg_index WHERE indexrelid = i.indexrelid) AS is_primary,
  -- Calculate days since stats reset
  EXTRACT(epoch FROM (now() - stats_reset)) / 86400 AS days_monitored
FROM pg_stat_user_indexes i
JOIN pg_stat_database d ON d.datname = current_database()
WHERE schemaname = 'public'
  AND idx_scan = 0
  AND indexrelname NOT LIKE 'pg_toast%'
ORDER BY pg_relation_size(indexrelid) DESC;

COMMENT ON VIEW unused_indexes_monitor IS
'Monitor potentially unused indexes over time. Check weekly for 30 days before removal.';
```

**Weekly Check Script**

File: `scripts/check-unused-indexes.ts`

```typescript
import { getSupabaseAdmin } from '../src/shared/supabase/admin';

async function checkUnusedIndexes() {
  const supabase = getSupabaseAdmin();

  console.log('Checking unused indexes...\n');

  const { data, error } = await supabase.rpc('exec_sql', {
    sql: 'SELECT * FROM unused_indexes_monitor;'
  });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${data.length} potentially unused indexes:\n`);

  data.forEach((index: any) => {
    console.log(`- ${index.indexname} on ${index.tablename}`);
    console.log(`  Size: ${index.size}`);
    console.log(`  Scans: ${index.idx_scan}`);
    console.log(`  Monitored: ${Math.floor(index.days_monitored)} days`);
    console.log('');
  });

  // Identify indexes safe to remove (monitored 30+ days, still 0 scans)
  const safeToRemove = data.filter(
    (idx: any) => idx.days_monitored >= 30 && idx.idx_scan === 0 && !idx.is_unique && !idx.is_primary
  );

  if (safeToRemove.length > 0) {
    console.log('\n⚠️  Indexes safe to remove (30+ days, 0 scans):');
    safeToRemove.forEach((idx: any) => {
      console.log(`- ${idx.indexname} on ${idx.tablename} (${idx.size})`);
    });
  } else {
    console.log('\n✅ No indexes ready for removal yet.');
  }
}

checkUnusedIndexes();
```

**Run Weekly**:
```bash
# Week 1, 2, 3, 4
pnpm tsx scripts/check-unused-indexes.ts
```

### Phase 3: Removal (1 hour, after 30 days)

**Only remove indexes that**:
- Have 0 scans after 30 days of production traffic
- Are NOT primary keys or unique constraints
- Are NOT used by RLS policies
- Are NOT foreign key indexes
- Team confirms are not needed for planned features

**Removal Migration**

File: `supabase/migrations/20250214_remove_unused_indexes.sql`

```sql
-- =============================================================================
-- Migration: Remove Confirmed Unused Indexes
--
-- Monitoring Period: 2025-01-14 to 2025-02-14 (30 days)
-- Indexes Analyzed: 18
-- Indexes Removed: X (confirmed unused)
-- Indexes Kept: Y (used or functionally required)
--
-- Storage Saved: ~X MB
-- Write Performance Improvement: ~X%
-- =============================================================================

-- =============================================================================
-- REMOVAL RATIONALE
-- =============================================================================

-- Each index removal includes:
-- 1. Index name and table
-- 2. Why it's unused (redundant, query pattern changed, etc.)
-- 3. Monitoring period stats (30 days, 0 scans)
-- 4. Storage savings
-- 5. Impact assessment (low risk)

-- =============================================================================
-- Example: Remove redundant index
-- =============================================================================

-- Index: idx_users_email (redundant with unique constraint)
-- Table: users
-- Size: 128 KB
-- Scans (30 days): 0
-- Reason: Covered by users_email_key unique constraint
-- Risk: Low - unique constraint provides same functionality

DROP INDEX IF EXISTS idx_users_email;

-- Verify unique constraint still exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_email_key'
  ) THEN
    RAISE EXCEPTION 'Unique constraint users_email_key missing - restore index!';
  END IF;

  RAISE NOTICE 'Index idx_users_email removed, unique constraint verified ✓';
END $$;

-- =============================================================================
-- ... (Continue for each confirmed unused index)
-- =============================================================================

-- =============================================================================
-- Post-Removal Verification
-- =============================================================================

DO $$
DECLARE
  v_unused_count INTEGER;
  v_total_indexes INTEGER;
BEGIN
  -- Count remaining unused indexes
  SELECT COUNT(*) INTO v_unused_count
  FROM pg_stat_user_indexes
  WHERE schemaname = 'public'
    AND idx_scan = 0
    AND indexrelname NOT LIKE 'pg_toast%';

  -- Count total indexes
  SELECT COUNT(*) INTO v_total_indexes
  FROM pg_stat_user_indexes
  WHERE schemaname = 'public';

  RAISE NOTICE 'Post-removal stats:';
  RAISE NOTICE '  Total indexes: %', v_total_indexes;
  RAISE NOTICE '  Unused indexes: % (should be < 5)', v_unused_count;

  IF v_unused_count > 10 THEN
    RAISE WARNING 'Still % unused indexes - review needed', v_unused_count;
  END IF;
END $$;
```

---

## 📊 Impact Analysis

### Storage Savings

**Estimated Savings** (depends on table sizes):
- Small indexes (< 100 KB): 18 indexes × 50 KB = ~900 KB
- Medium indexes (100 KB - 1 MB): 5 indexes × 500 KB = ~2.5 MB
- Large indexes (> 1 MB): 2 indexes × 3 MB = ~6 MB

**Total Estimated Savings**: 1-10 MB (minimal in early stages)

### Write Performance Improvement

**Impact on INSERT/UPDATE/DELETE**:
- Each index adds ~5-10% overhead to write operations
- Removing 18 indexes: ~90-180% overhead reduction
- Real-world impact: 10-20% faster writes on affected tables

**Example: Inserting 1000 rows**:
- Before: 1000ms (with 18 unused indexes)
- After: 800-900ms (without unused indexes)
- Improvement: 10-20%

### Risk Assessment

**Risk: Removing Used Index**
- Impact: Query performance degradation on affected queries
- Mitigation: 30-day monitoring period, keep all critical indexes
- Recovery: Fast - restore index with CREATE INDEX CONCURRENTLY

**Risk: False Positive (Index Actually Needed)**
- Impact: Slow queries appear after removal
- Mitigation: Monitor query performance after removal
- Recovery: Recreate index immediately

---

## 🎯 Implementation Plan

### Timeline

| Phase | Duration | Actions |
|-------|----------|---------|
| Phase 1: Identification | 1 hour | Query DB, categorize indexes, document findings |
| Phase 2: Monitoring | 30 days | Weekly checks, track usage stats |
| Phase 3: Removal | 1 hour | Create migration, remove confirmed unused |
| Phase 4: Verification | 1 week | Monitor query performance post-removal |

### Step-by-Step

**Week 0: Setup** (1 hour)
1. Run unused index query
2. Create UNUSED_INDEX_ANALYSIS.md document
3. Categorize all 18 indexes
4. Create monitoring view and script
5. Reset PostgreSQL statistics: `SELECT pg_stat_reset();`

**Weeks 1-4: Monitor** (5 min/week)
1. Run `pnpm tsx scripts/check-unused-indexes.ts`
2. Document any indexes that show usage
3. Verify production traffic is representative

**Week 5: Removal** (1 hour)
1. Review monitoring results
2. Finalize removal list
3. Create migration with DROP INDEX statements
4. Apply migration in staging
5. Test application thoroughly
6. Apply to production

**Week 6: Verification** (30 min)
1. Monitor query performance
2. Check for slow query alerts
3. Verify no application errors
4. Document results

---

## ✅ Acceptance Criteria

### Documentation
- [ ] UNUSED_INDEX_ANALYSIS.md created with all 18 indexes categorized
- [ ] Monitoring script created and tested
- [ ] Weekly monitoring results documented
- [ ] Removal rationale documented for each dropped index

### Monitoring (30 Days)
- [ ] Monitoring view created
- [ ] Weekly checks completed (4 weeks minimum)
- [ ] Usage stats tracked for all indexes
- [ ] Any used indexes marked as "keep"

### Removal
- [ ] Only 30-day confirmed unused indexes removed
- [ ] Primary keys and unique constraints NOT removed
- [ ] Foreign key indexes NOT removed
- [ ] RLS policy indexes NOT removed
- [ ] Migration includes verification checks

### Verification
- [ ] All tests pass after removal
- [ ] No new slow query alerts
- [ ] Query performance equal or better
- [ ] Write operations 10-20% faster on affected tables

---

## 🔄 Rollback Plan

If query performance degrades after index removal:

**Immediate Rollback** (< 5 minutes):
```sql
-- Recreate index concurrently (no table lock)
CREATE INDEX CONCURRENTLY idx_name ON table_name (column_name);

-- Verify index created
SELECT indexname, idx_scan
FROM pg_stat_user_indexes
WHERE indexname = 'idx_name';
```

**Note**: CREATE INDEX CONCURRENTLY allows rebuilding without blocking queries.

---

## ⚠️ Important Warnings

### DO NOT REMOVE

**Never remove these types of indexes**:
1. **Primary keys** - Required for table integrity
2. **Unique constraints** - Enforces data uniqueness
3. **Foreign keys** - Critical for join performance
4. **Indexes used by RLS policies** - Security requirement
5. **Indexes on frequently joined columns** - Even if stats show 0, may be used in complex queries

### CHECK BEFORE REMOVING

**Always verify**:
1. Index not used by application code (check codebase for column references)
2. Index not used by reports or analytics queries
3. Index not planned for future features
4. Team consensus on removal
5. Staging environment testing completed

---

## 📈 Monitoring After Removal

**Week 1-2 Post-Removal**:
```sql
-- Check for new slow queries
SELECT
  query,
  calls,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100  -- queries taking >100ms
ORDER BY mean_exec_time DESC
LIMIT 20;
```

**If Slow Queries Appear**:
1. Identify affected table/column
2. Check if removed index would help: `EXPLAIN ANALYZE query`
3. If yes, recreate index immediately
4. Document false positive for future reference

---

## 🔗 Related Tasks

- **T068**: Fix RLS InitPlan Performance - Database optimization
- **T072**: Consolidate RLS Policies - Code quality improvement
- **Stage 0 Foundation**: Quality improvements post-UserStory 1-4

---

## 📚 References

### PostgreSQL Documentation
- [Index Monitoring](https://www.postgresql.org/docs/current/monitoring-stats.html#MONITORING-STATS-VIEWS)
- [pg_stat_user_indexes](https://www.postgresql.org/docs/current/monitoring-stats.html#MONITORING-PG-STAT-ALL-INDEXES-VIEW)
- [CREATE INDEX CONCURRENTLY](https://www.postgresql.org/docs/current/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY)
- [Index Best Practices](https://www.postgresql.org/docs/current/indexes.html)

### Supabase Documentation
- [Database Performance](https://supabase.com/docs/guides/database/database-linter)
- [Index Optimization](https://supabase.com/docs/guides/database/postgres/indexes)

### Articles
- [Finding Unused Indexes in PostgreSQL](https://www.cybertec-postgresql.com/en/get-rid-of-your-unused-indexes/)
- [Index Maintenance Best Practices](https://wiki.postgresql.org/wiki/Index_Maintenance)

---

## 🚀 Next Steps

1. **Immediate** (Week 0):
   - Review this task document
   - Run unused index query on production database
   - Create UNUSED_INDEX_ANALYSIS.md
   - Categorize all 18 indexes (keep/monitor/remove)
   - Create monitoring script
   - Reset PostgreSQL statistics: `SELECT pg_stat_reset();`

2. **Ongoing** (Weeks 1-4):
   - Run weekly monitoring script
   - Document any index usage
   - Adjust categories as needed

3. **After 30 Days** (Week 5):
   - Review monitoring results
   - Create removal migration
   - Test in staging
   - Apply to production
   - Monitor for 1 week

4. **Long-term**:
   - Run quarterly unused index reviews
   - Incorporate into database maintenance routine
   - Document index strategy for team

---

## 💡 Best Practices Going Forward

### Index Creation Guidelines

**Before creating any new index**:
1. Measure query performance without index
2. Check if existing index can cover query (composite indexes)
3. Estimate index size and maintenance cost
4. Document index purpose in migration
5. Add monitoring for index usage

**Example: Documented Index Creation**
```sql
-- Index for quarterly report query
-- Query: SELECT * FROM courses WHERE created_at BETWEEN '2025-01-01' AND '2025-03-31'
-- Expected usage: 4 times/year
-- Size: ~500 KB
-- Created: 2025-01-14
CREATE INDEX idx_courses_created_at ON courses(created_at)
WHERE created_at >= '2025-01-01';

COMMENT ON INDEX idx_courses_created_at IS
'Partial index for quarterly course reports. Expected usage: 4x/year. Monitor for removal if unused after 12 months.';
```

### Quarterly Index Review

Add to maintenance routine:
```bash
# Every 3 months
pnpm tsx scripts/check-unused-indexes.ts

# Review results
# Remove indexes with 90+ days and 0 scans
# Document in quarterly maintenance report
```

---

**Created By**: Claude Code (Anthropic)
**Research Duration**: 30 minutes
**Priority**: P3 - Low (Database Optimization)
**Complexity**: Low (Straightforward monitoring and removal)
**Estimated Effort**: 1-2 hours (+ 30 days monitoring)
**Confidence Level**: 🟢 **HIGH (90%)** - Standard PostgreSQL optimization practice with low risk

---

## 📝 Decision Log

### Why P3 (Low Priority)?

1. **Early Stage Database** - Limited production data, indexes may not show usage yet
2. **Storage Impact** - Minimal (1-10 MB) in current stage
3. **Performance Impact** - Low in early stages, more important at scale
4. **Risk vs Reward** - Small gain, moderate risk if wrong index removed

### Why 30-Day Monitoring?

1. **Representative Traffic** - Captures full month of user activity patterns
2. **Seasonal Patterns** - Catches weekly/monthly operations
3. **False Positives** - Reduces risk of removing legitimately-needed indexes
4. **Best Practice** - Industry standard monitoring period

### Why Not Remove Immediately?

**Reasons to wait**:
- New database (statistics may not be representative)
- Infrequent but critical queries may use indexes
- Planned features may need indexes
- Cost of mistake (slow queries) outweighs benefit (storage savings)

**When immediate removal is OK**:
- Clear redundant indexes (covered by other indexes)
- Indexes on deleted/renamed columns
- Indexes from testing that were never used
- Development environment only
