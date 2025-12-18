-- ============================================================================
-- Draft Course Cleanup Monitoring Queries
-- ============================================================================
-- Purpose: SQL query library for tracking draft session cleanup effectiveness
-- System: MegaCampusAI Draft Course Cleanup
-- Database: PostgreSQL (Supabase)
-- Related: docs/specs/TECH-SPEC-DRAFT-COURSE-CLEANUP.md (section 8)
-- Guide: docs/monitoring/draft-cleanup-monitoring.md
-- ============================================================================

-- ============================================================================
-- QUERY 1: SYSTEM HEALTH DASHBOARD
-- ============================================================================
-- Purpose: Get current system state for real-time monitoring
-- Frequency: Every 5 minutes
-- Display: Dashboard gauges and stats
-- Performance: < 100ms (uses indexes)
-- ============================================================================

SELECT
  -- Total counts
  COUNT(*) FILTER (WHERE status = 'draft') AS total_drafts,
  COUNT(*) FILTER (WHERE status = 'draft' AND generation_status IS NULL) AS unused_drafts,
  COUNT(*) FILTER (WHERE status = 'draft' AND generation_status IS NOT NULL) AS active_drafts,

  -- Pollution percentage (KEY METRIC)
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'draft' AND generation_status IS NULL) /
    NULLIF(COUNT(*) FILTER (WHERE status = 'draft'), 0),
    2
  ) AS pollution_percentage,

  -- Time-based counts
  COUNT(*) FILTER (WHERE status = 'draft' AND created_at > NOW() - INTERVAL '1 hour') AS created_last_hour,
  COUNT(*) FILTER (WHERE status = 'draft' AND created_at BETWEEN NOW() - INTERVAL '24 hours' AND NOW() - INTERVAL '1 hour') AS created_last_24h,
  COUNT(*) FILTER (WHERE status = 'draft' AND created_at BETWEEN NOW() - INTERVAL '7 days' AND NOW() - INTERVAL '24 hours') AS created_last_week,

  -- Health indicators
  COUNT(*) FILTER (
    WHERE status = 'draft'
      AND generation_status IS NULL
      AND created_at < NOW() - INTERVAL '24 hours'
  ) AS pending_cleanup,

  -- Timestamp for monitoring
  NOW() AS snapshot_time

FROM courses;

-- Expected Output Example:
-- total_drafts | unused_drafts | active_drafts | pollution_percentage | created_last_hour | created_last_24h | created_last_week | pending_cleanup | snapshot_time
-- -------------|---------------|---------------|---------------------|-------------------|------------------|-------------------|-----------------|---------------------------
-- 12           | 3             | 9             | 25.00               | 2                 | 8                | 15                | 0               | 2025-11-08 14:30:00+00
--
-- Interpretation:
-- - Total: 12 drafts (HEALTHY if < 20)
-- - Pollution: 25% (WARNING - target < 10%)
-- - Pending cleanup: 0 (HEALTHY - cleanup working)


-- ============================================================================
-- QUERY 2: DRAFTS BY AGE DISTRIBUTION
-- ============================================================================
-- Purpose: Group drafts by age buckets to identify cleanup delays
-- Frequency: Every 15 minutes
-- Display: Horizontal bar chart
-- Alert: If "> 24h" bucket has entries, cleanup may be failing
-- ============================================================================

SELECT
  -- Age bucket classification
  CASE
    WHEN created_at > NOW() - INTERVAL '1 hour' THEN '< 1h'
    WHEN created_at > NOW() - INTERVAL '6 hours' THEN '1-6h'
    WHEN created_at > NOW() - INTERVAL '24 hours' THEN '6-24h'
    ELSE '> 24h'
  END AS age_bucket,

  -- Counts by status
  COUNT(*) AS draft_count,
  COUNT(*) FILTER (WHERE generation_status IS NULL) AS unused_count,
  COUNT(*) FILTER (WHERE generation_status IS NOT NULL) AS materialized_count,

  -- Percentage breakdown
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE generation_status IS NULL) /
    NULLIF(COUNT(*), 0),
    2
  ) AS unused_percentage,

  -- Oldest and newest in bucket
  MIN(created_at) AS oldest_in_bucket,
  MAX(created_at) AS newest_in_bucket

FROM courses
WHERE status = 'draft'
GROUP BY age_bucket
ORDER BY
  CASE age_bucket
    WHEN '< 1h' THEN 1
    WHEN '1-6h' THEN 2
    WHEN '6-24h' THEN 3
    WHEN '> 24h' THEN 4
  END;

-- Expected Output Example:
-- age_bucket | draft_count | unused_count | materialized_count | unused_percentage | oldest_in_bucket        | newest_in_bucket
-- -----------|-------------|--------------|-------------------|------------------|-------------------------|---------------------------
-- < 1h       | 5           | 2            | 3                 | 40.00            | 2025-11-08 13:45:00+00  | 2025-11-08 14:25:00+00
-- 1-6h       | 4           | 1            | 3                 | 25.00            | 2025-11-08 09:00:00+00  | 2025-11-08 13:30:00+00
-- 6-24h      | 3           | 0            | 3                 | 0.00             | 2025-11-07 18:00:00+00  | 2025-11-08 08:00:00+00
-- > 24h      | 0           | 0            | 0                 | NULL             | NULL                    | NULL
--
-- Interpretation:
-- - "> 24h" bucket is EMPTY → Cleanup working correctly ✅
-- - "< 1h" has 40% unused → Normal (users just opened form)
-- - "6-24h" has 0% unused → Healthy (all sessions materialized)


-- ============================================================================
-- QUERY 3: CLEANUP JOB PERFORMANCE
-- ============================================================================
-- Purpose: Monitor cleanup job execution and detect stalls
-- Frequency: Every 5 minutes
-- Display: Status indicator with time since last run
-- Alert: If hours_since_last_run > 2, job may be stalled
-- ============================================================================

SELECT
  j.jobid,
  j.jobname,
  j.schedule,
  j.active,
  j.last_run,
  j.next_run,

  -- Time intervals
  (j.next_run - j.last_run) AS interval_duration,
  EXTRACT(EPOCH FROM (NOW() - j.last_run)) / 3600 AS hours_since_last_run,
  EXTRACT(EPOCH FROM (j.next_run - NOW())) / 60 AS minutes_until_next_run,

  -- Health status
  CASE
    WHEN EXTRACT(EPOCH FROM (NOW() - j.last_run)) / 3600 > 2 THEN 'CRITICAL'
    WHEN EXTRACT(EPOCH FROM (NOW() - j.last_run)) / 3600 > 1.5 THEN 'WARNING'
    ELSE 'HEALTHY'
  END AS health_status,

  NOW() AS check_time

FROM cron.job j
WHERE j.jobname = 'cleanup-old-drafts-hourly';

-- Expected Output Example:
-- jobid | jobname                     | schedule    | active | last_run                | next_run                | interval_duration | hours_since_last_run | minutes_until_next_run | health_status | check_time
-- ------|----------------------------|-------------|--------|-------------------------|-------------------------|-------------------|---------------------|----------------------|---------------|---------------------------
-- 1     | cleanup-old-drafts-hourly  | 0 * * * *   | true   | 2025-11-08 14:00:00+00  | 2025-11-08 15:00:00+00  | 01:00:00          | 0.5                 | 29.5                 | HEALTHY       | 2025-11-08 14:30:30+00
--
-- Interpretation:
-- - Last run: 30 minutes ago → HEALTHY ✅
-- - Next run: in 29.5 minutes → On schedule ✅
-- - Status: HEALTHY → No action needed


-- Additional: Check recent job execution history
SELECT
  jr.runid,
  jr.jobid,
  jr.status,
  jr.return_message,
  jr.start_time,
  jr.end_time,
  EXTRACT(EPOCH FROM (jr.end_time - jr.start_time)) AS duration_seconds,
  CASE
    WHEN jr.status = 'succeeded' THEN '✅'
    WHEN jr.status = 'failed' THEN '❌'
    ELSE '⏳'
  END AS status_icon
FROM cron.job_run_details jr
WHERE jr.jobid = (SELECT jobid FROM cron.job WHERE jobname = 'cleanup-old-drafts-hourly')
ORDER BY jr.start_time DESC
LIMIT 10;


-- ============================================================================
-- QUERY 4: ORGANIZATION LEADERBOARD (TOP POLLUTERS)
-- ============================================================================
-- Purpose: Find organizations with most unused drafts
-- Frequency: Every hour
-- Display: Table with top 10 organizations
-- Use Case: Identify potential abuse or training needs
-- ============================================================================

SELECT
  o.id AS organization_id,
  o.name AS organization_name,
  o.slug AS organization_slug,

  -- Draft counts
  COUNT(*) FILTER (WHERE c.status = 'draft' AND c.generation_status IS NULL) AS unused_drafts,
  COUNT(*) FILTER (WHERE c.status = 'draft' AND c.generation_status IS NOT NULL) AS materialized_drafts,
  COUNT(*) FILTER (WHERE c.status = 'draft') AS total_drafts,

  -- Pollution rate
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE c.status = 'draft' AND c.generation_status IS NULL) /
    NULLIF(COUNT(*) FILTER (WHERE c.status = 'draft'), 0),
    2
  ) AS pollution_rate,

  -- Published courses (for context)
  COUNT(*) FILTER (WHERE c.status = 'published') AS published_courses,

  -- Activity indicators
  MAX(c.created_at) FILTER (WHERE c.status = 'draft') AS most_recent_draft,
  MIN(c.created_at) FILTER (WHERE c.status = 'draft') AS oldest_draft,

  -- User count (approximate, based on distinct creators)
  COUNT(DISTINCT c.created_by) AS unique_creators

FROM courses c
JOIN organizations o ON c.organization_id = o.id
WHERE c.status = 'draft'
GROUP BY o.id, o.name, o.slug
HAVING COUNT(*) FILTER (WHERE c.status = 'draft' AND c.generation_status IS NULL) > 0
ORDER BY unused_drafts DESC, pollution_rate DESC
LIMIT 10;

-- Expected Output Example:
-- organization_id | organization_name | organization_slug | unused_drafts | materialized_drafts | total_drafts | pollution_rate | published_courses | most_recent_draft       | oldest_draft            | unique_creators
-- ----------------|-------------------|-------------------|---------------|-------------------|--------------|---------------|------------------|-------------------------|-------------------------|------------------
-- org-123         | Acme University   | acme-university   | 8             | 12                | 20           | 40.00         | 50               | 2025-11-08 14:00:00+00  | 2025-11-01 10:00:00+00  | 3
-- org-456         | Test School       | test-school       | 3             | 5                 | 8            | 37.50         | 15               | 2025-11-08 13:30:00+00  | 2025-11-05 12:00:00+00  | 2
--
-- Interpretation:
-- - Acme University: 8 unused drafts (40% pollution) → Investigate
-- - Test School: 3 unused drafts (37.5% pollution) → Monitor
-- - Alert if single org has > 100 unused drafts (potential abuse)


-- ============================================================================
-- QUERY 5: DAILY TREND ANALYSIS
-- ============================================================================
-- Purpose: Track cleanup effectiveness over time (30-day window)
-- Frequency: Daily aggregation
-- Display: Time series line chart
-- Metrics: Usage rate, abandonment rate, daily creation count
-- ============================================================================

WITH daily_stats AS (
  SELECT
    DATE(created_at) AS date,
    COUNT(*) AS drafts_created,
    COUNT(*) FILTER (WHERE generation_status IS NOT NULL) AS drafts_used,
    COUNT(*) FILTER (WHERE generation_status IS NULL) AS drafts_abandoned,
    COUNT(DISTINCT organization_id) AS active_organizations,
    COUNT(DISTINCT created_by) AS active_users
  FROM courses
  WHERE status = 'draft'
    AND created_at > NOW() - INTERVAL '30 days'
  GROUP BY DATE(created_at)
)
SELECT
  date,
  drafts_created,
  drafts_used,
  drafts_abandoned,
  active_organizations,
  active_users,

  -- Percentage metrics
  ROUND(100.0 * drafts_used / NULLIF(drafts_created, 0), 2) AS usage_rate,
  ROUND(100.0 * drafts_abandoned / NULLIF(drafts_created, 0), 2) AS abandonment_rate,

  -- Rolling averages (7-day window)
  ROUND(
    AVG(drafts_created) OVER (ORDER BY date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW),
    2
  ) AS ma7_drafts_created,
  ROUND(
    AVG(drafts_abandoned) OVER (ORDER BY date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW),
    2
  ) AS ma7_drafts_abandoned,

  -- Day-over-day change
  LAG(drafts_created, 1) OVER (ORDER BY date) AS prev_day_created,
  drafts_created - LAG(drafts_created, 1) OVER (ORDER BY date) AS dod_change,

  -- Day of week (for pattern analysis)
  TO_CHAR(date, 'Day') AS day_of_week

FROM daily_stats
ORDER BY date DESC;

-- Expected Output Example:
-- date       | drafts_created | drafts_used | drafts_abandoned | active_organizations | active_users | usage_rate | abandonment_rate | ma7_drafts_created | ma7_drafts_abandoned | prev_day_created | dod_change | day_of_week
-- -----------|----------------|-------------|------------------|---------------------|--------------|-----------|-----------------|-------------------|---------------------|------------------|-----------|-------------
-- 2025-11-08 | 15             | 12          | 3                | 4                   | 8            | 80.00     | 20.00           | 18.57             | 5.29                | 20               | -5         | Friday
-- 2025-11-07 | 20             | 15          | 5                | 5                   | 10           | 75.00     | 25.00           | 19.14             | 6.00                | 18               | +2         | Thursday
-- 2025-11-06 | 18             | 14          | 4                | 3                   | 7            | 77.78     | 22.22           | 18.86             | 5.71                | 22               | -4         | Wednesday
--
-- Interpretation:
-- - Usage rate: 80% (EXCELLENT - target > 80%)
-- - Abandonment: 20% (GOOD - target < 20%)
-- - MA7 trend: Stable around 18-19 drafts/day
-- - Day-over-day: -5 (normal weekday variation)


-- ============================================================================
-- QUERY 6: PENDING CLEANUP AUDIT
-- ============================================================================
-- Purpose: Detailed audit of drafts pending cleanup (> 24h old)
-- Frequency: On-demand (when "> 24h" bucket shows entries)
-- Display: Detailed table for investigation
-- Use Case: Troubleshoot why old drafts weren't cleaned
-- ============================================================================

SELECT
  c.id AS course_id,
  c.slug AS course_slug,
  c.title,
  c.status,
  c.generation_status,
  c.created_at,
  EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 3600 AS age_hours,

  -- Organization context
  o.name AS organization_name,

  -- User context
  u.email AS created_by_email,

  -- Why wasn't it cleaned?
  CASE
    WHEN c.generation_status IS NOT NULL THEN 'Has generation_status (should not clean)'
    WHEN c.created_at >= NOW() - INTERVAL '24 hours' THEN 'Too recent (< 24h)'
    WHEN c.status != 'draft' THEN 'Not a draft'
    ELSE 'SHOULD BE CLEANED (investigate!)'
  END AS cleanup_eligibility,

  -- Additional metadata
  c.updated_at,
  (c.updated_at - c.created_at) AS time_to_update

FROM courses c
LEFT JOIN organizations o ON c.organization_id = o.id
LEFT JOIN auth.users u ON c.created_by = u.id
WHERE c.status = 'draft'
  AND c.created_at < NOW() - INTERVAL '24 hours'
ORDER BY c.created_at ASC
LIMIT 100;

-- Expected Output Example:
-- course_id | course_slug      | title          | status | generation_status | created_at              | age_hours | organization_name | created_by_email  | cleanup_eligibility                   | updated_at              | time_to_update
-- ----------|------------------|----------------|--------|------------------|-------------------------|-----------|------------------|------------------|--------------------------------------|-------------------------|----------------
-- c-123     | test-course-old  | Old Test       | draft  | NULL             | 2025-11-06 10:00:00+00  | 52.5      | Acme University  | user@example.com | SHOULD BE CLEANED (investigate!)     | 2025-11-06 10:05:00+00  | 00:05:00
-- c-456     | active-course    | Active Draft   | draft  | processing       | 2025-11-05 15:00:00+00  | 71.0      | Test School      | admin@test.com   | Has generation_status (should not clean) | 2025-11-07 12:00:00+00  | 1 day 21:00:00
--
-- Interpretation:
-- - c-123: Should have been cleaned by job → Investigate cleanup job logs
-- - c-456: Has generation_status → Correctly preserved


-- ============================================================================
-- QUERY 7: HOURLY TRAFFIC PATTERN ANALYSIS
-- ============================================================================
-- Purpose: Identify peak usage hours for capacity planning
-- Frequency: Weekly analysis
-- Display: Heatmap (hour of day vs day of week)
-- Use Case: Adjust cleanup frequency or thresholds
-- ============================================================================

SELECT
  EXTRACT(HOUR FROM created_at) AS hour_of_day,
  TO_CHAR(created_at, 'Day') AS day_of_week,
  COUNT(*) AS drafts_created,
  COUNT(*) FILTER (WHERE generation_status IS NOT NULL) AS materialized,
  ROUND(100.0 * COUNT(*) FILTER (WHERE generation_status IS NOT NULL) / NULLIF(COUNT(*), 0), 2) AS materialization_rate
FROM courses
WHERE status = 'draft'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY hour_of_day, day_of_week
ORDER BY hour_of_day,
  CASE day_of_week
    WHEN 'Monday   ' THEN 1
    WHEN 'Tuesday  ' THEN 2
    WHEN 'Wednesday' THEN 3
    WHEN 'Thursday ' THEN 4
    WHEN 'Friday   ' THEN 5
    WHEN 'Saturday ' THEN 6
    WHEN 'Sunday   ' THEN 7
  END;

-- Expected Output Example:
-- hour_of_day | day_of_week | drafts_created | materialized | materialization_rate
-- ------------|-------------|----------------|--------------|---------------------
-- 9           | Monday      | 12             | 10           | 83.33
-- 10          | Monday      | 18             | 15           | 83.33
-- 14          | Monday      | 25             | 20           | 80.00
-- 9           | Tuesday     | 15             | 12           | 80.00
--
-- Interpretation:
-- - Peak hours: 10:00 - 16:00 (weekdays)
-- - Low traffic: 22:00 - 07:00, weekends
-- - Materialization consistently ~80% (healthy)


-- ============================================================================
-- QUERY 8: REDIS SESSION CONSISTENCY CHECK
-- ============================================================================
-- Purpose: Identify PostgreSQL drafts that should have been Redis-only
-- Frequency: Weekly audit
-- Display: Count and sample records
-- Use Case: Verify Redis implementation working correctly
-- Alert: If recent drafts have generation_status=NULL, Redis may not be working
-- ============================================================================

WITH redis_era_drafts AS (
  SELECT
    id,
    title,
    created_at,
    generation_status,
    created_by,
    organization_id,
    -- Assume Redis implementation deployed on 2025-11-08
    CASE
      WHEN created_at >= '2025-11-08 00:00:00+00' THEN 'Post-Redis'
      ELSE 'Pre-Redis'
    END AS era
  FROM courses
  WHERE status = 'draft'
)
SELECT
  era,
  COUNT(*) AS total_drafts,
  COUNT(*) FILTER (WHERE generation_status IS NULL) AS unused_drafts,
  COUNT(*) FILTER (WHERE generation_status IS NOT NULL) AS materialized_drafts,
  ROUND(100.0 * COUNT(*) FILTER (WHERE generation_status IS NULL) / NULLIF(COUNT(*), 0), 2) AS unused_percentage,

  -- Sample IDs for investigation
  ARRAY_AGG(id ORDER BY created_at DESC) FILTER (WHERE generation_status IS NULL) AS sample_unused_ids
FROM redis_era_drafts
GROUP BY era
ORDER BY era DESC;

-- Expected Output Example:
-- era         | total_drafts | unused_drafts | materialized_drafts | unused_percentage | sample_unused_ids
-- ------------|--------------|---------------|-------------------|------------------|----------------------------------
-- Post-Redis  | 8            | 1             | 7                 | 12.50            | {c-789}
-- Pre-Redis   | 38           | 22            | 16                | 57.89            | {c-456, c-123, c-789, ...}
--
-- Interpretation:
-- - Pre-Redis: 57.89% unused (expected baseline)
-- - Post-Redis: 12.50% unused (EXCELLENT - target < 20%)
-- - Redis implementation working correctly ✅


-- ============================================================================
-- QUERY 9: CLEANUP JOB EFFECTIVENESS REPORT
-- ============================================================================
-- Purpose: Calculate cleanup job metrics for executive reports
-- Frequency: Monthly
-- Display: Summary table
-- Use Case: ROI analysis and stakeholder updates
-- ============================================================================

WITH cleanup_stats AS (
  SELECT
    DATE_TRUNC('week', start_time) AS week,
    COUNT(*) AS total_runs,
    COUNT(*) FILTER (WHERE status = 'succeeded') AS successful_runs,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed_runs,
    AVG(EXTRACT(EPOCH FROM (end_time - start_time))) AS avg_duration_seconds,
    MIN(start_time) AS first_run,
    MAX(start_time) AS last_run
  FROM cron.job_run_details
  WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'cleanup-old-drafts-hourly')
    AND start_time > NOW() - INTERVAL '30 days'
  GROUP BY week
)
SELECT
  week,
  total_runs,
  successful_runs,
  failed_runs,
  ROUND(100.0 * successful_runs / NULLIF(total_runs, 0), 2) AS success_rate_percentage,
  ROUND(avg_duration_seconds, 2) AS avg_duration_seconds,
  first_run,
  last_run,

  -- Expected vs actual runs (168 hours per week)
  168 AS expected_runs_per_week,
  168 - total_runs AS missed_runs,

  -- Health assessment
  CASE
    WHEN ROUND(100.0 * successful_runs / NULLIF(total_runs, 0), 2) >= 99 THEN '🟢 EXCELLENT'
    WHEN ROUND(100.0 * successful_runs / NULLIF(total_runs, 0), 2) >= 95 THEN '🟡 ACCEPTABLE'
    ELSE '🔴 NEEDS ATTENTION'
  END AS health_status

FROM cleanup_stats
ORDER BY week DESC;

-- Expected Output Example:
-- week                    | total_runs | successful_runs | failed_runs | success_rate_percentage | avg_duration_seconds | first_run               | last_run                | expected_runs_per_week | missed_runs | health_status
-- ------------------------|------------|----------------|-------------|------------------------|---------------------|-------------------------|-------------------------|----------------------|-------------|------------------
-- 2025-11-04 00:00:00+00  | 168        | 167            | 1           | 99.40                  | 2.35                | 2025-11-04 00:00:00+00  | 2025-11-10 23:00:00+00  | 168                  | 0           | 🟢 EXCELLENT
-- 2025-10-28 00:00:00+00  | 165        | 163            | 2           | 98.79                  | 2.41                | 2025-10-28 00:00:00+00  | 2025-11-03 23:00:00+00  | 168                  | 3           | 🟡 ACCEPTABLE
--
-- Interpretation:
-- - Week 1: 99.4% success rate, 0 missed runs → Excellent
-- - Week 2: 98.8% success rate, 3 missed runs → Acceptable, investigate missed runs


-- ============================================================================
-- QUERY 10: COMPARATIVE ANALYSIS (PRE vs POST REDIS)
-- ============================================================================
-- Purpose: Measure impact of Redis implementation
-- Frequency: Monthly
-- Display: Before/after comparison table
-- Use Case: Demonstrate ROI and validate solution effectiveness
-- ============================================================================

WITH pre_redis AS (
  SELECT
    COUNT(*) AS total_drafts,
    COUNT(*) FILTER (WHERE generation_status IS NULL) AS unused_drafts,
    AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) / 60 AS avg_session_duration_minutes
  FROM courses
  WHERE status = 'draft'
    AND created_at < '2025-11-08 00:00:00+00'
),
post_redis AS (
  SELECT
    COUNT(*) AS total_drafts,
    COUNT(*) FILTER (WHERE generation_status IS NULL) AS unused_drafts,
    AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) / 60 AS avg_session_duration_minutes
  FROM courses
  WHERE status = 'draft'
    AND created_at >= '2025-11-08 00:00:00+00'
),
current_state AS (
  SELECT
    COUNT(*) AS current_total_drafts,
    COUNT(*) FILTER (WHERE generation_status IS NULL) AS current_unused_drafts
  FROM courses
  WHERE status = 'draft'
)
SELECT
  'Pre-Redis (Baseline)' AS period,
  pre_redis.total_drafts,
  pre_redis.unused_drafts,
  ROUND(100.0 * pre_redis.unused_drafts / NULLIF(pre_redis.total_drafts, 0), 2) AS pollution_percentage,
  ROUND(pre_redis.avg_session_duration_minutes, 2) AS avg_session_minutes,
  NULL::NUMERIC AS improvement_percentage
FROM pre_redis

UNION ALL

SELECT
  'Post-Redis (Current)' AS period,
  post_redis.total_drafts,
  post_redis.unused_drafts,
  ROUND(100.0 * post_redis.unused_drafts / NULLIF(post_redis.total_drafts, 0), 2) AS pollution_percentage,
  ROUND(post_redis.avg_session_duration_minutes, 2) AS avg_session_minutes,
  ROUND(
    100.0 * (
      (pre_redis.unused_drafts::NUMERIC / NULLIF(pre_redis.total_drafts, 0)) -
      (post_redis.unused_drafts::NUMERIC / NULLIF(post_redis.total_drafts, 0))
    ) / NULLIF(pre_redis.unused_drafts::NUMERIC / NULLIF(pre_redis.total_drafts, 0), 0),
    2
  ) AS improvement_percentage
FROM pre_redis, post_redis

UNION ALL

SELECT
  'Current DB State' AS period,
  current_state.current_total_drafts,
  current_state.current_unused_drafts,
  ROUND(100.0 * current_state.current_unused_drafts / NULLIF(current_state.current_total_drafts, 0), 2) AS pollution_percentage,
  NULL AS avg_session_minutes,
  NULL AS improvement_percentage
FROM current_state;

-- Expected Output Example:
-- period                  | total_drafts | unused_drafts | pollution_percentage | avg_session_minutes | improvement_percentage
-- ------------------------|--------------|---------------|---------------------|-------------------|------------------------
-- Pre-Redis (Baseline)    | 46           | 26            | 56.52               | 15.3              | NULL
-- Post-Redis (Current)    | 18           | 3             | 16.67               | 22.1              | 70.50
-- Current DB State        | 12           | 2             | 16.67               | NULL              | NULL
--
-- Interpretation:
-- - Pollution reduced from 56.52% → 16.67% (70.5% improvement) ✅
-- - Total drafts reduced from 46 → 12 (73.9% reduction) ✅
-- - Success criteria MET (target: > 50% improvement)


-- ============================================================================
-- QUERY 11: USER BEHAVIOR ANALYSIS
-- ============================================================================
-- Purpose: Understand user patterns (how long do they spend in form?)
-- Frequency: Weekly
-- Display: Histogram
-- Use Case: UX optimization, form improvement insights
-- ============================================================================

WITH session_durations AS (
  SELECT
    id,
    created_at,
    updated_at,
    EXTRACT(EPOCH FROM (updated_at - created_at)) / 60 AS duration_minutes,
    generation_status,
    CASE
      WHEN EXTRACT(EPOCH FROM (updated_at - created_at)) / 60 < 1 THEN '< 1 min'
      WHEN EXTRACT(EPOCH FROM (updated_at - created_at)) / 60 < 5 THEN '1-5 min'
      WHEN EXTRACT(EPOCH FROM (updated_at - created_at)) / 60 < 15 THEN '5-15 min'
      WHEN EXTRACT(EPOCH FROM (updated_at - created_at)) / 60 < 60 THEN '15-60 min'
      ELSE '> 60 min'
    END AS duration_bucket
  FROM courses
  WHERE status = 'draft'
    AND updated_at > created_at
    AND created_at > NOW() - INTERVAL '7 days'
)
SELECT
  duration_bucket,
  COUNT(*) AS session_count,
  COUNT(*) FILTER (WHERE generation_status IS NOT NULL) AS completed_sessions,
  COUNT(*) FILTER (WHERE generation_status IS NULL) AS abandoned_sessions,
  ROUND(100.0 * COUNT(*) FILTER (WHERE generation_status IS NOT NULL) / NULLIF(COUNT(*), 0), 2) AS completion_rate,
  ROUND(AVG(duration_minutes), 2) AS avg_duration_minutes,
  ROUND(MIN(duration_minutes), 2) AS min_duration_minutes,
  ROUND(MAX(duration_minutes), 2) AS max_duration_minutes
FROM session_durations
GROUP BY duration_bucket
ORDER BY
  CASE duration_bucket
    WHEN '< 1 min' THEN 1
    WHEN '1-5 min' THEN 2
    WHEN '5-15 min' THEN 3
    WHEN '15-60 min' THEN 4
    WHEN '> 60 min' THEN 5
  END;

-- Expected Output Example:
-- duration_bucket | session_count | completed_sessions | abandoned_sessions | completion_rate | avg_duration_minutes | min_duration_minutes | max_duration_minutes
-- ----------------|---------------|-------------------|-------------------|----------------|---------------------|---------------------|----------------------
-- < 1 min         | 5             | 0                 | 5                 | 0.00           | 0.45                | 0.10                | 0.95
-- 1-5 min         | 12            | 2                 | 10                | 16.67          | 3.20                | 1.05                | 4.98
-- 5-15 min        | 20            | 16                | 4                 | 80.00          | 9.50                | 5.10                | 14.90
-- 15-60 min       | 8             | 7                 | 1                 | 87.50          | 28.30               | 16.20               | 55.40
-- > 60 min        | 3             | 3                 | 0                 | 100.00         | 85.60               | 62.10               | 120.30
--
-- Interpretation:
-- - Sessions < 5 min: High abandonment (quick form peek)
-- - Sessions 5-15 min: 80% completion (optimal range)
-- - Sessions > 15 min: Very high completion (engaged users)
-- - Insight: Most abandonments happen in first 5 minutes


-- ============================================================================
-- HELPER FUNCTION: MANUAL CLEANUP TRIGGER
-- ============================================================================
-- Purpose: Manually trigger cleanup for testing or emergency use
-- Usage: SELECT * FROM trigger_manual_cleanup();
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_manual_cleanup()
RETURNS TABLE (
  deleted_count BIGINT,
  deleted_ids UUID[],
  cutoff_time TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cutoff TIMESTAMPTZ;
  v_deleted_ids UUID[];
  v_deleted_count BIGINT;
BEGIN
  -- Calculate cutoff (24 hours ago)
  v_cutoff := NOW() - INTERVAL '24 hours';

  -- Delete old drafts and capture IDs
  WITH deleted AS (
    DELETE FROM courses
    WHERE status = 'draft'
      AND generation_status IS NULL
      AND created_at < v_cutoff
    RETURNING id
  )
  SELECT ARRAY_AGG(id), COUNT(*) INTO v_deleted_ids, v_deleted_count FROM deleted;

  -- Return results
  RETURN QUERY SELECT v_deleted_count, v_deleted_ids, v_cutoff;

  -- Log action
  RAISE NOTICE 'Manual cleanup: Deleted % drafts older than %', v_deleted_count, v_cutoff;
END;
$$;

COMMENT ON FUNCTION public.trigger_manual_cleanup() IS
  'Manually trigger cleanup of old draft courses (USE WITH CAUTION - for testing or emergency use)';


-- ============================================================================
-- END OF QUERY LIBRARY
-- ============================================================================
-- Total Queries: 11 + 1 helper function
-- Performance: All queries optimized for < 100ms execution
-- Indexes Required: See migration 20250108_cleanup_old_drafts_job.sql
-- ============================================================================
