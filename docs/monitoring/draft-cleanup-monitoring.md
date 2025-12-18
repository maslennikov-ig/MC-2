# Draft Course Cleanup Monitoring Guide

**Generated:** 2025-11-08
**System:** MegaCampusAI Draft Course Cleanup System
**Database:** PostgreSQL (Supabase)
**Related:** `/docs/specs/TECH-SPEC-DRAFT-COURSE-CLEANUP.md`

---

## Table of Contents

1. [Overview](#overview)
2. [Real-time Metrics](#real-time-metrics)
3. [Historical Metrics](#historical-metrics)
4. [Alerts and Thresholds](#alerts-and-thresholds)
5. [Dashboard Setup](#dashboard-setup)
6. [Troubleshooting](#troubleshooting)

---

## Overview

This guide provides comprehensive monitoring for the draft course cleanup system, which uses a hybrid Redis + PostgreSQL approach to eliminate database pollution from abandoned draft courses.

### Key Components

- **Redis Sessions:** Temporary storage for draft form data (TTL: 24 hours)
- **PostgreSQL Courses:** Permanent storage after materialization
- **Cleanup Job:** Hourly pg_cron job invoking Edge Function
- **Monitoring View:** `cleanup_job_monitoring` view from migration

### System Health Indicators

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| **Unused Drafts** | < 10 | 10-20 | > 50 |
| **Pollution %** | < 10% | 10-30% | > 30% |
| **Cleanup Job Gap** | < 1h | 1-2h | > 2h |
| **Pending Cleanup** | < 5 | 5-20 | > 20 |

---

## Real-time Metrics

### 1. Current System State

**Purpose:** Get instant snapshot of draft course pollution

**Query:** See `draft-cleanup-queries.sql` → Query 1
**Frequency:** Every 5 minutes
**Display:** Gauge chart

**Interpretation:**
- `total_drafts`: All courses with status='draft'
- `unused_drafts`: Drafts never materialized (generation_status IS NULL)
- `active_drafts`: Drafts currently processing or materialized
- `pollution_percentage`: Key health metric (target: < 10%)

**Alert Conditions:**
- ⚠️ WARNING: `pollution_percentage > 30%`
- 🚨 CRITICAL: `pollution_percentage > 50%`

---

### 2. Drafts by Age Distribution

**Purpose:** Understand age distribution of drafts

**Query:** See `draft-cleanup-queries.sql` → Query 2
**Frequency:** Every 15 minutes
**Display:** Horizontal bar chart

**Age Buckets:**
- `< 1h`: Fresh drafts (expected to be high)
- `1-6h`: Active sessions (normal usage)
- `6-24h`: Approaching cleanup threshold
- `> 24h`: SHOULD BE ZERO (cleanup failure indicator)

**Alert Conditions:**
- ⚠️ WARNING: `> 24h` bucket has > 5 drafts
- 🚨 CRITICAL: `> 24h` bucket has > 20 drafts

---

### 3. Current Drafts Count by Organization

**Purpose:** Identify organizations with highest draft creation

**Query:** See `draft-cleanup-queries.sql` → Query 4
**Frequency:** Every hour
**Display:** Table with top 10 organizations

**Use Cases:**
- Identify potential abuse (bot traffic)
- Understand usage patterns
- Plan capacity

**Alert Conditions:**
- 🚨 CRITICAL: Single org has > 100 unused drafts (potential abuse)

---

### 4. Cleanup Job Health

**Purpose:** Monitor cleanup job execution status

**Query:** See `draft-cleanup-queries.sql` → Query 3
**Frequency:** Every 5 minutes
**Display:** Status indicator + time since last run

**Metrics:**
- `last_run`: When job last executed
- `next_run`: When job will execute next
- `hours_since_last_run`: Time gap (should be < 1.5h)

**Alert Conditions:**
- ⚠️ WARNING: `hours_since_last_run > 1.5`
- 🚨 CRITICAL: `hours_since_last_run > 2.0`

**Using Existing View:**
```sql
-- Use the monitoring view from migration
SELECT
  jobname,
  schedule,
  active,
  status,
  return_message,
  start_time,
  end_time,
  EXTRACT(EPOCH FROM (NOW() - end_time)) / 3600 AS hours_since_completion
FROM public.cleanup_job_monitoring
ORDER BY start_time DESC
LIMIT 1;
```

---

### 5. Redis Session Count (Manual Check)

**Purpose:** Verify Redis session health

**Method:** Manual inspection (no SQL query available)

**Steps:**
1. Connect to Redis:
   ```bash
   redis-cli -h localhost -p 6379
   ```

2. Count draft sessions:
   ```redis
   KEYS draft:session:*
   DBSIZE
   ```

3. Inspect sample session:
   ```redis
   GET draft:session:user-123:abc-def-456
   TTL draft:session:user-123:abc-def-456
   ```

**Expected Values:**
- Active sessions: 5-50 (depends on traffic)
- TTL: 0-86400 seconds (24 hours)

**Alert Conditions:**
- ⚠️ WARNING: > 200 active sessions (unusual traffic)
- 🚨 CRITICAL: Redis unavailable or returns errors

---

## Historical Metrics

### 1. Daily Draft Creation Rate

**Purpose:** Track long-term trends in draft creation

**Query:** See `draft-cleanup-queries.sql` → Query 5
**Frequency:** Daily aggregation
**Display:** Time series line chart (30 days)

**Metrics:**
- `drafts_created`: Total drafts created per day
- `drafts_used`: Drafts successfully materialized
- `drafts_abandoned`: Drafts never materialized
- `usage_rate`: Percentage of drafts materialized
- `abandonment_rate`: Percentage never used

**Target Metrics (Post-Redis Implementation):**
- `usage_rate`: > 80% (was ~43% pre-Redis)
- `abandonment_rate`: < 20% (was ~57% pre-Redis)
- Daily draft creation: < 20 (was 20-30)

**Trend Analysis:**
```sql
-- Compare week-over-week changes
WITH weekly_stats AS (
  SELECT
    DATE_TRUNC('week', created_at) AS week,
    COUNT(*) FILTER (WHERE status = 'draft') AS drafts_created,
    COUNT(*) FILTER (WHERE status = 'draft' AND generation_status IS NOT NULL) AS drafts_used
  FROM courses
  WHERE created_at > NOW() - INTERVAL '8 weeks'
  GROUP BY week
)
SELECT
  week,
  drafts_created,
  drafts_used,
  ROUND(100.0 * drafts_used / NULLIF(drafts_created, 0), 2) AS usage_rate,
  LAG(drafts_created) OVER (ORDER BY week) AS prev_week_created,
  ROUND(100.0 * (drafts_created - LAG(drafts_created) OVER (ORDER BY week)) /
        NULLIF(LAG(drafts_created) OVER (ORDER BY week), 0), 2) AS week_over_week_change
FROM weekly_stats
ORDER BY week DESC;
```

---

### 2. Monthly Trend Analysis

**Purpose:** Executive summary for monthly reports

**Query:**
```sql
-- Monthly aggregation with year-over-year comparison
SELECT
  DATE_TRUNC('month', created_at) AS month,
  COUNT(*) FILTER (WHERE status = 'draft') AS total_drafts,
  COUNT(*) FILTER (WHERE status = 'draft' AND generation_status IS NULL) AS unused_drafts,
  COUNT(*) FILTER (WHERE status = 'published') AS published_courses,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'draft' AND generation_status IS NULL) /
        NULLIF(COUNT(*) FILTER (WHERE status = 'draft'), 0), 2) AS pollution_rate
FROM courses
WHERE created_at > NOW() - INTERVAL '12 months'
GROUP BY month
ORDER BY month DESC;
```

**Frequency:** Monthly
**Display:** Table + trend chart

---

### 3. Cleanup Effectiveness Report

**Purpose:** Measure cleanup job performance over time

**Query:**
```sql
-- Analyze cleanup job execution history
SELECT
  DATE(start_time) AS execution_date,
  COUNT(*) AS executions_count,
  AVG(EXTRACT(EPOCH FROM (end_time - start_time))) AS avg_duration_seconds,
  COUNT(*) FILTER (WHERE status = 'succeeded') AS successful_runs,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed_runs,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'succeeded') /
        NULLIF(COUNT(*), 0), 2) AS success_rate
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'cleanup-old-drafts-hourly')
  AND start_time > NOW() - INTERVAL '30 days'
GROUP BY DATE(start_time)
ORDER BY execution_date DESC;
```

**Frequency:** Weekly review
**Display:** Table with sparklines

**Target Metrics:**
- Success rate: > 99%
- Avg duration: < 5 seconds
- Executions per day: 24 (hourly job)

---

### 4. Before/After Comparison

**Purpose:** Demonstrate ROI of Redis implementation

**Manual Calculation:**

**Pre-Redis Baseline (before 2025-11-08):**
- Total drafts: 46
- Unused drafts: 26 (57%)
- Daily creation rate: 20-30

**Post-Redis Target (after 2 weeks):**
- Total drafts: < 20
- Unused drafts: < 5%
- Daily creation rate: < 10

**Query:**
```sql
-- Calculate metrics for comparison
WITH pre_redis AS (
  SELECT
    COUNT(*) AS total_drafts,
    COUNT(*) FILTER (WHERE generation_status IS NULL) AS unused_drafts
  FROM courses
  WHERE status = 'draft' AND created_at < '2025-11-08'
),
post_redis AS (
  SELECT
    COUNT(*) AS total_drafts,
    COUNT(*) FILTER (WHERE generation_status IS NULL) AS unused_drafts
  FROM courses
  WHERE status = 'draft' AND created_at >= '2025-11-08'
)
SELECT
  'Pre-Redis' AS period,
  pre_redis.total_drafts,
  pre_redis.unused_drafts,
  ROUND(100.0 * pre_redis.unused_drafts / NULLIF(pre_redis.total_drafts, 0), 2) AS pollution_rate
FROM pre_redis
UNION ALL
SELECT
  'Post-Redis' AS period,
  post_redis.total_drafts,
  post_redis.unused_drafts,
  ROUND(100.0 * post_redis.unused_drafts / NULLIF(post_redis.total_drafts, 0), 2) AS pollution_rate
FROM post_redis;
```

---

## Alerts and Thresholds

### Alert Priority Matrix

| Alert Name | Condition | Severity | Action | SLA |
|------------|-----------|----------|--------|-----|
| **High Pollution Rate** | `pollution_percentage > 30%` | 🟡 MEDIUM | Investigate Redis failures | 4 hours |
| **Critical Pollution** | `pollution_percentage > 50%` | 🔴 HIGH | Trigger manual cleanup | 1 hour |
| **Cleanup Job Stalled** | `hours_since_last_run > 2` | 🔴 HIGH | Restart pg_cron, check Edge Function | 30 min |
| **Old Drafts Pending** | `> 24h` age bucket has > 20 drafts | 🟡 MEDIUM | Verify cleanup job execution | 2 hours |
| **Unusual Traffic Spike** | `created_last_hour > 100` | 🟡 MEDIUM | Check for abuse/bot traffic | 1 hour |
| **Redis Unavailable** | Redis connection fails | 🔴 HIGH | Fallback to DB, investigate Redis | 15 min |
| **Cleanup Job Failures** | 3+ consecutive failures | 🔴 HIGH | Check Edge Function logs | 30 min |

---

### Alert 1: High Pollution Rate

**Condition:**
```sql
SELECT
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'draft' AND generation_status IS NULL) /
        NULLIF(COUNT(*) FILTER (WHERE status = 'draft'), 0), 2) AS pollution_percentage
FROM courses
HAVING pollution_percentage > 30;
```

**Severity:** MEDIUM
**Impact:** Database pollution increasing, cleanup may be failing

**Actions:**
1. Check Redis availability: `redis-cli ping`
2. Verify cleanup job last run: `SELECT * FROM public.cleanup_job_monitoring ORDER BY start_time DESC LIMIT 1;`
3. Check Edge Function logs in Supabase Dashboard
4. Manually trigger cleanup if needed: `SELECT * FROM public.check_pending_cleanup();`

**Prevention:**
- Monitor Redis uptime
- Set up Redis health checks
- Implement automatic failover

---

### Alert 2: Cleanup Job Stalled

**Condition:**
```sql
SELECT
  jobname,
  EXTRACT(EPOCH FROM (NOW() - last_run)) / 3600 AS hours_since_last_run
FROM cron.job
WHERE jobname = 'cleanup-old-drafts-hourly'
  AND EXTRACT(EPOCH FROM (NOW() - last_run)) / 3600 > 2;
```

**Severity:** HIGH
**Impact:** Drafts accumulating, cleanup not running

**Actions:**
1. Check pg_cron status:
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'cleanup-old-drafts-hourly';
   ```

2. Check recent job failures:
   ```sql
   SELECT * FROM public.cleanup_job_monitoring
   WHERE status = 'failed'
   ORDER BY start_time DESC
   LIMIT 5;
   ```

3. Manually invoke Edge Function:
   ```bash
   curl -X POST https://diqooqbuchsliypgwksu.supabase.co/functions/v1/cleanup-old-drafts \
     -H "Authorization: Bearer YOUR-SERVICE-ROLE-KEY"
   ```

4. Restart cron job if necessary:
   ```sql
   -- Unschedule and reschedule
   SELECT cron.unschedule('cleanup-old-drafts-hourly');
   -- Then re-run migration to recreate
   ```

**Prevention:**
- Set up pg_cron monitoring
- Add redundant cleanup job (e.g., daily fallback)
- Implement dead letter queue for failed cleanups

---

### Alert 3: Unusual Traffic Spike

**Condition:**
```sql
SELECT
  COUNT(*) AS created_last_hour
FROM courses
WHERE status = 'draft'
  AND created_at > NOW() - INTERVAL '1 hour'
HAVING created_last_hour > 100;
```

**Severity:** MEDIUM
**Impact:** Potential abuse or bot traffic

**Actions:**
1. Identify source organizations:
   ```sql
   SELECT
     o.name,
     COUNT(*) AS drafts_last_hour
   FROM courses c
   JOIN organizations o ON c.organization_id = o.id
   WHERE c.status = 'draft' AND c.created_at > NOW() - INTERVAL '1 hour'
   GROUP BY o.id, o.name
   ORDER BY drafts_last_hour DESC
   LIMIT 10;
   ```

2. Check for suspicious patterns:
   ```sql
   SELECT
     created_by,
     COUNT(*) AS drafts_created,
     COUNT(DISTINCT organization_id) AS orgs_count
   FROM courses
   WHERE status = 'draft' AND created_at > NOW() - INTERVAL '1 hour'
   GROUP BY created_by
   HAVING COUNT(*) > 20
   ORDER BY drafts_created DESC;
   ```

3. Implement rate limiting if confirmed abuse

**Prevention:**
- Add rate limiting to `/create` endpoint
- Implement CAPTCHA for suspicious patterns
- Monitor user behavior analytics

---

### Alert 4: Redis Session Leak

**Condition:** Redis session count > 200 and growing

**Manual Check:**
```bash
# Count sessions
redis-cli KEYS "draft:session:*" | wc -l

# Check memory usage
redis-cli INFO memory | grep used_memory_human
```

**Severity:** MEDIUM
**Impact:** Redis memory exhaustion

**Actions:**
1. Check for sessions without TTL:
   ```bash
   # Sample 10 sessions and check TTL
   redis-cli KEYS "draft:session:*" | head -10 | while read key; do
     echo "$key: $(redis-cli TTL $key)"
   done
   ```

2. Manually cleanup if necessary:
   ```bash
   # CAREFUL: This deletes ALL draft sessions
   redis-cli --scan --pattern "draft:session:*" | xargs redis-cli DEL
   ```

3. Fix TTL setting in `DraftSessionManager.createSession()`

**Prevention:**
- Add monitoring for Redis memory usage
- Set maxmemory policy: `maxmemory-policy allkeys-lru`
- Implement session cleanup cron

---

## Dashboard Setup

### Recommended Tools

1. **Grafana** (recommended)
   - Native PostgreSQL datasource
   - Real-time updates
   - Alert manager integration

2. **Metabase** (alternative)
   - User-friendly interface
   - Easy query builder
   - Scheduled reports

3. **Supabase Dashboard** (built-in)
   - Basic SQL queries
   - Limited visualization
   - No alerting

---

### Grafana Dashboard Configuration

**Dashboard JSON:** See `docs/monitoring/grafana-dashboard.json` (if Grafana is used)

**Panels:**

1. **System Health** (Top Row)
   - Gauge: Total Drafts (green < 20, yellow < 50, red > 50)
   - Gauge: Pollution % (green < 10%, yellow < 30%, red > 30%)
   - Stat: Cleanup Job Status (last run time)

2. **Trend Analysis** (Middle Row)
   - Time Series: Drafts Created vs Cleaned (7 days)
   - Bar Chart: Drafts by Age Distribution
   - Table: Top 5 Organizations by Draft Count

3. **Performance** (Bottom Row)
   - Histogram: Session Duration (creation to materialization)
   - Counter: Cleanup Job Success Rate
   - Log Panel: Recent Cleanup Job Errors

**Sample Panel Configuration:**
```json
{
  "type": "gauge",
  "title": "Draft Pollution Rate",
  "targets": [
    {
      "rawSql": "SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'draft' AND generation_status IS NULL) / NULLIF(COUNT(*) FILTER (WHERE status = 'draft'), 0), 2) AS pollution_percentage FROM courses;",
      "format": "table"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "thresholds": {
        "steps": [
          { "value": 0, "color": "green" },
          { "value": 10, "color": "yellow" },
          { "value": 30, "color": "red" }
        ]
      },
      "unit": "percent"
    }
  }
}
```

---

### Metabase Dashboard

**Questions to Create:**

1. **System Health Dashboard**
   - Query: `draft-cleanup-queries.sql` → Query 1
   - Visualization: Number (pollution_percentage)

2. **Daily Trends**
   - Query: `draft-cleanup-queries.sql` → Query 5
   - Visualization: Line chart (date vs drafts_created)

3. **Top Organizations**
   - Query: `draft-cleanup-queries.sql` → Query 4
   - Visualization: Table

**Scheduled Email Reports:**
- Frequency: Daily at 9:00 AM
- Recipients: Engineering team, Product owner
- Format: PDF attachment with all 3 questions

---

## Troubleshooting

### Issue 1: Pollution Rate Not Decreasing

**Symptoms:**
- Pollution percentage stays > 30% after Redis implementation
- Unused drafts count not decreasing

**Diagnosis:**
```sql
-- Check if Redis sessions are being created
SELECT
  COUNT(*) AS recent_drafts,
  COUNT(*) FILTER (WHERE generation_status IS NULL) AS unused,
  COUNT(*) FILTER (WHERE generation_status IS NOT NULL) AS materialized
FROM courses
WHERE status = 'draft' AND created_at > NOW() - INTERVAL '24 hours';

-- If recent_drafts is still high, Redis may not be working
```

**Solutions:**
1. Verify Redis is running: `docker ps | grep redis`
2. Check Redis connection in application logs
3. Verify `NEXT_PUBLIC_FEATURE_REDIS_SESSIONS=true` in env
4. Check `DraftSessionManager` is being used in form component

---

### Issue 2: Cleanup Job Not Running

**Symptoms:**
- `hours_since_last_run > 2`
- Old drafts (> 24h) accumulating

**Diagnosis:**
```sql
-- Check job status
SELECT * FROM cron.job WHERE jobname = 'cleanup-old-drafts-hourly';

-- Check recent failures
SELECT * FROM public.cleanup_job_monitoring
ORDER BY start_time DESC LIMIT 5;
```

**Solutions:**
1. Check pg_cron extension: `SELECT * FROM pg_extension WHERE extname = 'pg_cron';`
2. Verify Edge Function is deployed: `supabase functions list`
3. Check service role key configuration
4. Manually trigger cleanup to test

---

### Issue 3: Redis Sessions Not Expiring

**Symptoms:**
- Redis memory usage growing
- Sessions older than 24 hours still present

**Diagnosis:**
```bash
# Check sessions without TTL
redis-cli --scan --pattern "draft:session:*" | while read key; do
  ttl=$(redis-cli TTL $key)
  if [ "$ttl" -eq "-1" ]; then
    echo "No TTL: $key"
  fi
done
```

**Solutions:**
1. Fix TTL setting in `DraftSessionManager.createSession()`:
   ```typescript
   await this.cache.set(key, session, { ttl: 86400 }) // 24 hours in seconds
   ```

2. Manually set TTL for existing sessions:
   ```bash
   redis-cli --scan --pattern "draft:session:*" | xargs -I {} redis-cli EXPIRE {} 86400
   ```

3. Add Redis maxmemory policy:
   ```bash
   redis-cli CONFIG SET maxmemory-policy allkeys-lru
   ```

---

### Issue 4: False Positives in Monitoring

**Symptoms:**
- Alerts triggering during normal traffic
- Pollution percentage spikes temporarily

**Diagnosis:**
- Review hourly traffic patterns
- Identify peak usage times
- Adjust thresholds based on actual traffic

**Solutions:**
1. Use time-based thresholds:
   ```sql
   -- Different thresholds for peak hours (9 AM - 5 PM)
   SELECT
     CASE
       WHEN EXTRACT(HOUR FROM NOW()) BETWEEN 9 AND 17 THEN 50  -- Peak hours
       ELSE 20  -- Off-peak hours
     END AS dynamic_threshold;
   ```

2. Implement rolling averages:
   ```sql
   -- Use 7-day moving average instead of instant value
   WITH daily_stats AS (
     SELECT
       DATE(created_at) AS day,
       COUNT(*) FILTER (WHERE status = 'draft' AND generation_status IS NULL) AS unused
     FROM courses
     WHERE created_at > NOW() - INTERVAL '7 days'
     GROUP BY day
   )
   SELECT AVG(unused) AS avg_unused_last_7_days FROM daily_stats;
   ```

---

## Related Documentation

- **Technical Spec:** `/docs/specs/TECH-SPEC-DRAFT-COURSE-CLEANUP.md`
- **Migration:** `/packages/course-gen-platform/supabase/migrations/20250108_cleanup_old_drafts_job.sql`
- **Query Library:** `/docs/monitoring/draft-cleanup-queries.sql`
- **Architecture:** `/docs/architecture/ADR-001-redis-draft-sessions.md`

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2025-11-08 | 1.0 | Initial monitoring guide created |

---

**END OF MONITORING GUIDE**
