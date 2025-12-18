# Draft Cleanup Monitoring System

**Created:** 2025-11-08
**System:** MegaCampusAI Draft Course Cleanup
**Purpose:** Comprehensive monitoring documentation for tracking cleanup effectiveness

---

## Overview

This directory contains complete monitoring documentation for the Draft Course Cleanup system, which uses a hybrid Redis + PostgreSQL approach to eliminate database pollution from abandoned draft courses.

### System Architecture

```
User Opens /create
      ↓
Redis Session Created (TTL: 24h)
      ↓
Auto-save every 3 sec
      ↓
Submit/Upload → Materialize to PostgreSQL
      ↓
Hourly Cleanup Job (pg_cron + Edge Function)
```

---

## Documentation Structure

| File | Purpose | Audience | Last Updated |
|------|---------|----------|--------------|
| **[draft-cleanup-monitoring.md](./draft-cleanup-monitoring.md)** | Monitoring guide with metrics definitions | DevOps, SRE | 2025-11-08 |
| **[draft-cleanup-queries.sql](./draft-cleanup-queries.sql)** | SQL query library (11 queries + 1 helper function) | Engineers, Analysts | 2025-11-08 |
| **[alerting-rules.md](./alerting-rules.md)** | Alert definitions and escalation procedures | On-call, SRE | 2025-11-08 |

---

## Quick Start

### 1. Check System Health (30 seconds)

```sql
-- Run Query 1 from draft-cleanup-queries.sql
SELECT
  COUNT(*) FILTER (WHERE status = 'draft') AS total_drafts,
  COUNT(*) FILTER (WHERE status = 'draft' AND generation_status IS NULL) AS unused_drafts,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'draft' AND generation_status IS NULL) /
        NULLIF(COUNT(*) FILTER (WHERE status = 'draft'), 0), 2) AS pollution_percentage
FROM courses;
```

**Expected Result:**
- `total_drafts`: < 20 (HEALTHY)
- `pollution_percentage`: < 10% (TARGET), < 30% (ACCEPTABLE)

---

### 2. Verify Cleanup Job Running

```sql
-- Check last run time
SELECT
  jobname,
  last_run,
  next_run,
  EXTRACT(EPOCH FROM (NOW() - last_run)) / 3600 AS hours_since_last_run
FROM cron.job
WHERE jobname = 'cleanup-old-drafts-hourly';
```

**Expected Result:**
- `hours_since_last_run`: < 1.5 (HEALTHY)

---

### 3. Check for Old Drafts (Should Be Zero)

```sql
-- Drafts older than 24h should not exist
SELECT COUNT(*) AS old_drafts_count
FROM courses
WHERE status = 'draft'
  AND generation_status IS NULL
  AND created_at < NOW() - INTERVAL '24 hours';
```

**Expected Result:**
- `old_drafts_count`: 0 (HEALTHY), < 5 (ACCEPTABLE)

---

## Key Metrics

### Real-time Metrics (Dashboard)

| Metric | Query | Threshold | Frequency |
|--------|-------|-----------|-----------|
| **Total Drafts** | Query 1 | < 20 | 5 min |
| **Pollution %** | Query 1 | < 10% | 5 min |
| **Pending Cleanup** | Query 6 | 0 | 15 min |
| **Job Status** | Query 3 | < 1.5h since run | 5 min |
| **Age Distribution** | Query 2 | No "> 24h" | 15 min |

### Historical Metrics (Trends)

| Metric | Query | Frequency | Display |
|--------|-------|-----------|---------|
| **Daily Trend** | Query 5 | Daily | Line chart |
| **Usage Rate** | Query 5 | Daily | Percentage |
| **Top Organizations** | Query 4 | Hourly | Table |
| **Pre/Post Comparison** | Query 10 | Weekly | Summary |

---

## Alert Summary

| Alert | Severity | Threshold | Response Time |
|-------|----------|-----------|---------------|
| **Critical Pollution** | 🔴 HIGH | > 50% | 30 min |
| **High Pollution** | 🟡 MEDIUM | > 30% | 4 hours |
| **Cleanup Job Stalled** | 🔴 HIGH | > 2h gap | 30 min |
| **Old Drafts Pending** | 🟡 MEDIUM | > 5 drafts | 2 hours |
| **Traffic Spike** | 🟡 MEDIUM | > 100/hour | 1 hour |
| **Redis Down** | 🔴 HIGH | Connection fail | 15 min |
| **Job Failures** | 🔴 HIGH | 3 consecutive | 30 min |

**See:** [alerting-rules.md](./alerting-rules.md) for complete definitions and runbooks

---

## Query Library Overview

### Query 1: System Health Dashboard
**Purpose:** Current snapshot of draft pollution
**Performance:** < 100ms
**Use:** Dashboard gauge display

### Query 2: Drafts by Age Distribution
**Purpose:** Identify cleanup delays by age bucket
**Performance:** < 100ms
**Use:** Bar chart showing age distribution

### Query 3: Cleanup Job Performance
**Purpose:** Monitor job execution status
**Performance:** < 50ms
**Use:** Job health indicator

### Query 4: Organization Leaderboard
**Purpose:** Find organizations with most unused drafts
**Performance:** < 200ms
**Use:** Identify abuse or training needs

### Query 5: Daily Trend Analysis
**Purpose:** 30-day trend of draft creation and abandonment
**Performance:** < 300ms
**Use:** Time series charts

### Query 6: Pending Cleanup Audit
**Purpose:** Detailed list of drafts pending cleanup
**Performance:** < 200ms
**Use:** Troubleshooting old drafts

### Query 7: Hourly Traffic Pattern Analysis
**Purpose:** Identify peak usage hours
**Performance:** < 250ms
**Use:** Capacity planning

### Query 8: Redis Session Consistency Check
**Purpose:** Verify Redis implementation working correctly
**Performance:** < 150ms
**Use:** Weekly audit

### Query 9: Cleanup Job Effectiveness Report
**Purpose:** Measure cleanup job performance over time
**Performance:** < 300ms
**Use:** Monthly executive reports

### Query 10: Pre vs Post Redis Comparison
**Purpose:** Demonstrate ROI of Redis implementation
**Performance:** < 200ms
**Use:** Before/after analysis

### Query 11: User Behavior Analysis
**Purpose:** Understand session duration patterns
**Performance:** < 250ms
**Use:** UX optimization insights

### Helper Function: Manual Cleanup Trigger
**Purpose:** Emergency manual cleanup
**Usage:** `SELECT * FROM trigger_manual_cleanup();`
**Use Case:** Backup/emergency

---

## Dashboard Setup

### Recommended Tools

1. **Grafana** (Recommended)
   - Native PostgreSQL support
   - Real-time updates
   - Alert manager
   - **Setup Time:** 2-4 hours

2. **Metabase** (Alternative)
   - User-friendly
   - Easy query builder
   - Scheduled reports
   - **Setup Time:** 1-2 hours

3. **Supabase Dashboard** (Built-in)
   - No setup required
   - Basic queries only
   - No alerting
   - **Setup Time:** 0 hours

### Essential Dashboard Panels

**Top Row (System Health):**
- Gauge: Total Drafts (green < 20, red > 50)
- Gauge: Pollution % (green < 10%, red > 30%)
- Stat: Job Status (hours since last run)

**Middle Row (Trends):**
- Time Series: Drafts Created vs Cleaned (7 days)
- Bar Chart: Age Distribution
- Table: Top 5 Organizations

**Bottom Row (Performance):**
- Histogram: Session Duration
- Counter: Job Success Rate
- Log Panel: Recent Errors

---

## Troubleshooting Guide

### Issue: High Pollution Rate

**Symptoms:**
- Pollution > 30%
- Unused drafts increasing

**Quick Check:**
```bash
# 1. Check Redis
redis-cli ping

# 2. Check cleanup job
psql -c "SELECT * FROM public.cleanup_job_monitoring LIMIT 1;"

# 3. Manual cleanup if needed
psql -c "SELECT * FROM trigger_manual_cleanup();"
```

**See:** [draft-cleanup-monitoring.md](./draft-cleanup-monitoring.md) § Troubleshooting

---

### Issue: Cleanup Job Not Running

**Symptoms:**
- `hours_since_last_run > 2`
- Old drafts accumulating

**Quick Check:**
```sql
-- Check job active status
SELECT jobname, active, last_run FROM cron.job
WHERE jobname = 'cleanup-old-drafts-hourly';

-- Check recent failures
SELECT status, return_message FROM public.cleanup_job_monitoring LIMIT 3;
```

**Solutions:**
1. Re-enable job if inactive
2. Re-deploy Edge Function
3. Restart pg_cron
4. Manual cleanup as fallback

**See:** [alerting-rules.md](./alerting-rules.md) § Alert 3

---

### Issue: Redis Sessions Not Working

**Symptoms:**
- New drafts still created in PostgreSQL immediately
- Pollution not decreasing

**Quick Check:**
```bash
# Check Redis running
docker ps | grep redis

# Check session count
redis-cli KEYS "draft:session:*" | wc -l

# Check application logs
docker logs courseai-next --tail 50 | grep -i redis
```

**Solutions:**
1. Verify `NEXT_PUBLIC_FEATURE_REDIS_SESSIONS=true`
2. Check `DraftSessionManager` integration
3. Review application error logs

**See:** [draft-cleanup-monitoring.md](./draft-cleanup-monitoring.md) § Issue 3

---

## Maintenance Tasks

### Daily (Automated)

- ✅ Run Query 1 (System Health Dashboard)
- ✅ Check cleanup job execution
- ✅ Alert on thresholds

### Weekly (Manual)

- ⏰ Review Query 5 (Daily Trend Analysis)
- ⏰ Check Query 4 (Top Organizations)
- ⏰ Run Query 8 (Redis Consistency Check)
- ⏰ Review alert history

### Monthly (Manual)

- 📅 Run Query 9 (Cleanup Job Effectiveness)
- 📅 Run Query 10 (Pre/Post Comparison)
- 📅 Generate executive summary
- 📅 Update documentation

---

## Success Criteria

### Week 1 (Immediate Results)

- ✅ Pollution < 30% (baseline: 57%)
- ✅ Total drafts < 30 (baseline: 46)
- ✅ Cleanup job uptime > 95%
- ✅ Zero user complaints

### Week 4 (Stable State)

- ✅ Pollution < 10% (target)
- ✅ Total drafts < 20 (target)
- ✅ Cleanup job uptime > 99%
- ✅ Daily draft creation < 20

### Month 3 (Optimization)

- ✅ Pollution < 5%
- ✅ Total drafts < 15
- ✅ Usage rate > 85%
- ✅ Zero manual interventions

---

## Related Documentation

### Technical Specifications

- **Tech Spec:** `/docs/specs/TECH-SPEC-DRAFT-COURSE-CLEANUP.md`
- **Migration:** `/packages/course-gen-platform/supabase/migrations/20250108_cleanup_old_drafts_job.sql`
- **Architecture:** `/docs/architecture/ADR-001-redis-draft-sessions.md` (if created)

### Code References

- **DraftSessionManager:** `courseai-next/lib/draft-session.ts`
- **Form Component:** `courseai-next/components/forms/create-course-form.tsx`
- **Edge Function:** `supabase/functions/cleanup-old-drafts/index.ts`

---

## Contact / Support

### Questions?

- **Slack:** #backend or #infrastructure
- **Email:** backend-team@example.com
- **Docs:** This directory

### Emergency?

- **On-Call:** PagerDuty → #oncall
- **Runbook:** [alerting-rules.md](./alerting-rules.md) § On-Call Runbook

---

## Changelog

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-11-08 | 1.0 | Initial monitoring system created | Claude Code Agent |

---

## Quick Links

- 📊 [Monitoring Guide](./draft-cleanup-monitoring.md)
- 📝 [Query Library](./draft-cleanup-queries.sql)
- 🚨 [Alerting Rules](./alerting-rules.md)
- 📖 [Tech Spec](../specs/TECH-SPEC-DRAFT-COURSE-CLEANUP.md)

---

**END OF README**
