# Draft Cleanup Alerting Rules

**Generated:** 2025-11-08
**System:** MegaCampusAI Draft Course Cleanup
**Purpose:** Define alerting conditions, severities, and response procedures
**Related:** `/docs/monitoring/draft-cleanup-monitoring.md`

---

## Table of Contents

1. [Alert Priority Matrix](#alert-priority-matrix)
2. [Alert Definitions](#alert-definitions)
3. [Escalation Procedures](#escalation-procedures)
4. [Alert Configuration Examples](#alert-configuration-examples)
5. [On-Call Runbook](#on-call-runbook)

---

## Alert Priority Matrix

### Severity Levels

| Severity | Color | Icon | Response Time | Escalation | Example |
|----------|-------|------|---------------|------------|---------|
| **CRITICAL** | 🔴 Red | 🚨 | 15-30 min | Immediate page | Cleanup job stalled > 2h |
| **HIGH** | 🟠 Orange | ⚠️ | 1 hour | Team notification | Pollution > 50% |
| **MEDIUM** | 🟡 Yellow | ℹ️ | 4 hours | Slack message | Pollution > 30% |
| **LOW** | 🟢 Green | ✅ | 24 hours | Log only | Normal traffic spike |

### Alert State Transitions

```
FIRING → ACKNOWLEDGED → INVESTIGATING → RESOLVED
         ↓
         ↳ ESCALATED (if not resolved within SLA)
```

---

## Alert Definitions

### Alert 1: High Pollution Rate

**Alert Name:** `draft_pollution_high`
**Severity:** 🟡 MEDIUM
**Description:** Percentage of unused drafts exceeds 30%

**Condition:**
```sql
-- Alert fires when:
SELECT
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'draft' AND generation_status IS NULL) /
        NULLIF(COUNT(*) FILTER (WHERE status = 'draft'), 0), 2) AS pollution_percentage
FROM courses
HAVING pollution_percentage > 30;
```

**Frequency:** Every 5 minutes
**Duration:** Alert after sustained for 15 minutes (avoid false positives)

**Impact:**
- Database pollution increasing
- Cleanup may be ineffective
- Redis sessions may not be working

**Response Actions:**

1. **Immediate (< 5 min):**
   - Check Redis availability: `redis-cli ping`
   - Verify Redis session creation in application logs
   - Check current unused draft count: Query 1 from `draft-cleanup-queries.sql`

2. **Investigation (5-30 min):**
   - Check cleanup job status:
     ```sql
     SELECT * FROM public.cleanup_job_monitoring ORDER BY start_time DESC LIMIT 5;
     ```
   - Review drafts by age distribution: Query 2
   - Check for > 24h old drafts (should be zero)

3. **Remediation (30-60 min):**
   - If Redis is down: Restart Redis container
   - If cleanup job failing: Check Edge Function logs
   - If traffic spike: Verify not abuse (Query 4)
   - Manual cleanup if needed: `SELECT * FROM trigger_manual_cleanup();`

**Auto-Resolution:**
- Alert auto-resolves when pollution < 30% for 30 minutes

**Escalation:**
- If not resolved in 4 hours → Escalate to HIGH severity
- If pollution reaches 50% → Trigger Alert 2 (Critical Pollution)

---

### Alert 2: Critical Pollution Rate

**Alert Name:** `draft_pollution_critical`
**Severity:** 🔴 HIGH
**Description:** Percentage of unused drafts exceeds 50%

**Condition:**
```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'draft' AND generation_status IS NULL) AS unused_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'draft' AND generation_status IS NULL) /
        NULLIF(COUNT(*) FILTER (WHERE status = 'draft'), 0), 2) AS pollution_percentage
FROM courses
HAVING pollution_percentage > 50 OR unused_count > 100;
```

**Frequency:** Every 2 minutes
**Duration:** Alert immediately (no wait period)

**Impact:**
- **CRITICAL:** System experiencing significant database pollution
- Cleanup system likely completely failed
- Potential performance degradation

**Response Actions:**

1. **Immediate (< 5 min):**
   - Page on-call engineer
   - Execute emergency manual cleanup:
     ```sql
     SELECT * FROM trigger_manual_cleanup();
     ```
   - Check cleanup job:
     ```sql
     SELECT * FROM cron.job WHERE jobname = 'cleanup-old-drafts-hourly';
     ```

2. **Emergency Investigation (5-15 min):**
   - Check Edge Function deployment:
     ```bash
     supabase functions list
     ```
   - Verify pg_cron extension:
     ```sql
     SELECT * FROM pg_extension WHERE extname = 'pg_cron';
     ```
   - Check for job failures:
     ```sql
     SELECT * FROM cron.job_run_details
     WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'cleanup-old-drafts-hourly')
     ORDER BY start_time DESC LIMIT 10;
     ```

3. **Remediation (15-30 min):**
   - Re-deploy Edge Function if missing
   - Restart pg_cron if job not running
   - Check database permissions
   - Implement temporary manual cleanup script

**Post-Incident:**
- Document root cause
- Update runbook
- Add preventive monitoring

**Auto-Resolution:**
- Alert resolves when pollution < 30% for 1 hour

**Escalation:**
- Immediate page to on-call
- If not resolved in 1 hour → Page engineering manager
- If not resolved in 2 hours → Page CTO

---

### Alert 3: Cleanup Job Stalled

**Alert Name:** `cleanup_job_stalled`
**Severity:** 🔴 HIGH
**Description:** Cleanup job hasn't run in > 2 hours

**Condition:**
```sql
SELECT
  jobname,
  last_run,
  EXTRACT(EPOCH FROM (NOW() - last_run)) / 3600 AS hours_since_last_run
FROM cron.job
WHERE jobname = 'cleanup-old-drafts-hourly'
  AND EXTRACT(EPOCH FROM (NOW() - last_run)) / 3600 > 2;
```

**Frequency:** Every 5 minutes
**Duration:** Alert immediately

**Impact:**
- Drafts accumulating without cleanup
- Pollution will increase over time
- System degradation imminent

**Response Actions:**

1. **Immediate (< 5 min):**
   - Check job status:
     ```sql
     SELECT jobid, schedule, active, last_run, next_run
     FROM cron.job WHERE jobname = 'cleanup-old-drafts-hourly';
     ```
   - Check if job is active (should be `true`)
   - Verify recent executions:
     ```sql
     SELECT * FROM public.cleanup_job_monitoring LIMIT 5;
     ```

2. **Investigation (5-15 min):**
   - Check Edge Function availability:
     ```bash
     curl -X POST https://diqooqbuchsliypgwksu.supabase.co/functions/v1/cleanup-old-drafts \
       -H "Authorization: Bearer SERVICE-ROLE-KEY" \
       -H "Content-Type: application/json" \
       -d '{}'
     ```
   - Check pg_net extension (required for HTTP calls):
     ```sql
     SELECT * FROM pg_extension WHERE extname = 'pg_net';
     ```
   - Review recent job run details:
     ```sql
     SELECT status, return_message FROM cron.job_run_details
     WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'cleanup-old-drafts-hourly')
     ORDER BY start_time DESC LIMIT 5;
     ```

3. **Remediation (15-30 min):**
   - If job inactive, re-enable:
     ```sql
     SELECT cron.alter_job('cleanup-old-drafts-hourly', active := true);
     ```
   - If Edge Function down, re-deploy:
     ```bash
     supabase functions deploy cleanup-old-drafts
     ```
   - If pg_cron broken, restart:
     ```sql
     SELECT cron.unschedule('cleanup-old-drafts-hourly');
     -- Then re-run migration to recreate
     ```
   - Manual cleanup as fallback:
     ```sql
     SELECT * FROM trigger_manual_cleanup();
     ```

**Post-Incident:**
- Add redundant cleanup mechanism
- Implement health check endpoint
- Create dead letter queue

**Auto-Resolution:**
- Alert resolves when job runs successfully

**Escalation:**
- If not resolved in 30 minutes → Page senior engineer
- If not resolved in 1 hour → Page infrastructure team

---

### Alert 4: Old Drafts Pending Cleanup

**Alert Name:** `old_drafts_pending`
**Severity:** 🟡 MEDIUM
**Description:** Drafts older than 24 hours still exist in database

**Condition:**
```sql
SELECT
  COUNT(*) AS old_drafts_count,
  MIN(created_at) AS oldest_draft
FROM courses
WHERE status = 'draft'
  AND generation_status IS NULL
  AND created_at < NOW() - INTERVAL '24 hours'
HAVING COUNT(*) > 5;
```

**Frequency:** Every 15 minutes
**Duration:** Alert after sustained for 30 minutes

**Impact:**
- Cleanup not processing drafts correctly
- May indicate partial Edge Function failure
- Database accumulating stale data

**Response Actions:**

1. **Investigation (< 30 min):**
   - Get detailed list:
     ```sql
     -- Query 6 from draft-cleanup-queries.sql
     SELECT * FROM courses
     WHERE status = 'draft'
       AND generation_status IS NULL
       AND created_at < NOW() - INTERVAL '24 hours'
     ORDER BY created_at ASC
     LIMIT 20;
     ```
   - Check cleanup job logs:
     ```sql
     SELECT return_message FROM public.cleanup_job_monitoring
     ORDER BY start_time DESC LIMIT 3;
     ```

2. **Verification (30-60 min):**
   - Verify drafts should be cleaned (no generation_status)
   - Check for database locks preventing deletion
   - Review Edge Function logs in Supabase Dashboard

3. **Remediation (60-120 min):**
   - Manual cleanup:
     ```sql
     SELECT * FROM trigger_manual_cleanup();
     ```
   - Verify cleanup worked:
     ```sql
     SELECT * FROM public.check_pending_cleanup();
     ```
   - If recurring, investigate Edge Function logic

**Auto-Resolution:**
- Alert resolves when old_drafts_count < 5

**Escalation:**
- If not resolved in 2 hours → Escalate to HIGH
- If > 50 old drafts → Immediate escalation

---

### Alert 5: Unusual Traffic Spike

**Alert Name:** `draft_traffic_spike`
**Severity:** 🟡 MEDIUM
**Description:** More than 100 drafts created in last hour

**Condition:**
```sql
SELECT
  COUNT(*) AS created_last_hour,
  COUNT(DISTINCT organization_id) AS affected_orgs,
  COUNT(DISTINCT created_by) AS unique_users
FROM courses
WHERE status = 'draft'
  AND created_at > NOW() - INTERVAL '1 hour'
HAVING COUNT(*) > 100;
```

**Frequency:** Every 5 minutes
**Duration:** Alert immediately (investigate quickly)

**Impact:**
- Potential bot/abuse traffic
- System load increase
- May indicate genuine traffic spike (marketing campaign)

**Response Actions:**

1. **Immediate Analysis (< 15 min):**
   - Check top organizations:
     ```sql
     -- Query 4 from draft-cleanup-queries.sql (Top Polluters)
     SELECT o.name, COUNT(*) AS drafts_last_hour
     FROM courses c
     JOIN organizations o ON c.organization_id = o.id
     WHERE c.status = 'draft' AND c.created_at > NOW() - INTERVAL '1 hour'
     GROUP BY o.id, o.name
     ORDER BY drafts_last_hour DESC
     LIMIT 10;
     ```
   - Check for single user abuse:
     ```sql
     SELECT created_by, COUNT(*) AS drafts_count
     FROM courses
     WHERE status = 'draft' AND created_at > NOW() - INTERVAL '1 hour'
     GROUP BY created_by
     HAVING COUNT(*) > 20
     ORDER BY drafts_count DESC;
     ```

2. **Determine Cause (15-30 min):**
   - **Legitimate traffic:** Marketing campaign, school semester start
   - **Bot traffic:** Single org/user with 50+ drafts
   - **Attack:** Distributed pattern across many orgs

3. **Response (30-60 min):**
   - **If legitimate:** Increase cleanup frequency temporarily
   - **If bot/abuse:**
     - Block offending users/orgs
     - Implement rate limiting
     - Contact security team
   - **If attack:**
     - Enable CAPTCHA
     - Implement IP rate limiting
     - Escalate to security team

**Auto-Resolution:**
- Alert resolves when traffic returns to < 50 drafts/hour

**Escalation:**
- If confirmed abuse → Escalate to security team
- If system performance impacted → Escalate to infrastructure

---

### Alert 6: Redis Unavailable

**Alert Name:** `redis_unavailable`
**Severity:** 🔴 HIGH
**Description:** Redis connection fails or timeout

**Condition:**
- Application logs show Redis connection errors
- Health check endpoint returns Redis failure

**Monitoring:**
```bash
# Manual health check
redis-cli -h localhost -p 6379 ping
# Should return: PONG

# Docker health check
docker ps --filter name=redis --format "{{.Status}}"
# Should show: Up
```

**Frequency:** Every 1 minute
**Duration:** Alert after 2 failed checks

**Impact:**
- **CRITICAL:** Draft sessions not being created
- Fallback to old behavior (immediate DB creation)
- Loss of main benefit of Redis implementation

**Response Actions:**

1. **Immediate (< 5 min):**
   - Check Redis container:
     ```bash
     docker ps | grep redis
     docker logs redis --tail 50
     ```
   - Check disk space: `df -h`
   - Check memory: `free -h`

2. **Quick Restart (5-10 min):**
   ```bash
   # Restart Redis container
   docker restart redis

   # Verify restart
   redis-cli ping

   # Check memory usage
   redis-cli INFO memory
   ```

3. **Verify Application Recovery (10-15 min):**
   - Check application logs for Redis reconnection
   - Test draft form creation manually
   - Verify DraftSessionManager working

**Fallback Behavior:**
- Application should gracefully fallback to direct DB creation
- Users should not experience errors
- Monitor for error rate increase

**Post-Incident:**
- Check Redis logs for root cause
- Review memory/disk usage trends
- Implement Redis persistence if not configured
- Add Redis clustering for high availability

**Auto-Resolution:**
- Alert resolves when Redis responds to PING

**Escalation:**
- If not resolved in 15 minutes → Page infrastructure team
- If recurring (3+ times per week) → Investigate root cause

---

### Alert 7: Cleanup Job Consecutive Failures

**Alert Name:** `cleanup_job_failures`
**Severity:** 🔴 HIGH
**Description:** 3 or more consecutive cleanup job failures

**Condition:**
```sql
WITH recent_runs AS (
  SELECT
    runid,
    status,
    start_time,
    ROW_NUMBER() OVER (ORDER BY start_time DESC) AS rn
  FROM cron.job_run_details
  WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'cleanup-old-drafts-hourly')
)
SELECT COUNT(*) AS consecutive_failures
FROM recent_runs
WHERE rn <= 3 AND status = 'failed'
HAVING COUNT(*) >= 3;
```

**Frequency:** Every 5 minutes
**Duration:** Alert immediately

**Impact:**
- Systematic failure in cleanup process
- Drafts will accumulate quickly
- Likely code or configuration issue

**Response Actions:**

1. **Immediate (< 10 min):**
   - Get failure messages:
     ```sql
     SELECT start_time, status, return_message
     FROM cron.job_run_details
     WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'cleanup-old-drafts-hourly')
     ORDER BY start_time DESC
     LIMIT 5;
     ```
   - Check Edge Function logs in Supabase Dashboard
   - Verify Edge Function deployed:
     ```bash
     supabase functions list
     ```

2. **Investigation (10-30 min):**
   - Test Edge Function manually:
     ```bash
     curl -X POST https://diqooqbuchsliypgwksu.supabase.co/functions/v1/cleanup-old-drafts \
       -H "Authorization: Bearer SERVICE-ROLE-KEY" \
       -H "Content-Type: application/json" \
       -d '{}' -v
     ```
   - Check common issues:
     - Service role key expired/invalid
     - Edge Function code error
     - Database permission denied
     - Network connectivity

3. **Remediation (30-60 min):**
   - Fix identified issue (re-deploy, update key, fix code)
   - Manual cleanup to clear backlog:
     ```sql
     SELECT * FROM trigger_manual_cleanup();
     ```
   - Monitor next scheduled run for success

**Common Failure Causes:**

| Error Message | Cause | Solution |
|---------------|-------|----------|
| `Authorization failed` | Invalid service role key | Update key in pg_cron job |
| `Function not found` | Edge Function not deployed | Re-deploy function |
| `Connection timeout` | Network issue | Check Supabase status |
| `Permission denied` | RLS policy blocking | Grant service role bypass |

**Auto-Resolution:**
- Alert resolves after 3 consecutive successful runs

**Escalation:**
- If not resolved in 30 minutes → Page backend team
- If recurring → Add to sprint backlog for investigation

---

## Escalation Procedures

### Escalation Path

```
MEDIUM Alert (4h SLA)
  ↓ (not resolved)
HIGH Alert (1h SLA)
  ↓ (not resolved)
On-Call Engineer
  ↓ (not resolved in 30min)
Senior Engineer
  ↓ (not resolved in 1h)
Engineering Manager
  ↓ (not resolved in 2h)
CTO
```

### Contact Methods

| Role | Slack | Email | Phone | PagerDuty |
|------|-------|-------|-------|-----------|
| On-Call Engineer | @oncall | oncall@example.com | - | Yes |
| Backend Team | #backend | backend@example.com | - | No |
| Infrastructure Team | #infra | infra@example.com | - | Yes |
| Engineering Manager | @manager | manager@example.com | +1-xxx | Yes |

### Business Hours vs After-Hours

**Business Hours (9 AM - 6 PM):**
- MEDIUM: Slack message to #backend
- HIGH: @oncall in Slack
- CRITICAL: PagerDuty page

**After-Hours:**
- MEDIUM: Can wait until next business day
- HIGH: PagerDuty page
- CRITICAL: PagerDuty page + phone call

---

## Alert Configuration Examples

### Grafana Alert Configuration

```yaml
# Example: High Pollution Rate Alert
groups:
  - name: draft_cleanup_alerts
    interval: 5m
    rules:
      - alert: draft_pollution_high
        expr: |
          (
            sum(courses{status="draft",generation_status="null"})
            /
            sum(courses{status="draft"})
          ) * 100 > 30
        for: 15m
        labels:
          severity: medium
          team: backend
          service: draft-cleanup
        annotations:
          summary: "High draft pollution rate detected"
          description: "Pollution rate is {{ $value }}% (threshold: 30%)"
          runbook: "https://docs.example.com/runbooks/draft-cleanup#high-pollution"
```

### Prometheus AlertManager Configuration

```yaml
route:
  receiver: 'default'
  group_by: ['alertname', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty'
      continue: true
    - match:
        severity: high
      receiver: 'slack-oncall'
    - match:
        severity: medium
      receiver: 'slack-backend'

receivers:
  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: 'YOUR-PAGERDUTY-KEY'

  - name: 'slack-oncall'
    slack_configs:
      - api_url: 'YOUR-SLACK-WEBHOOK'
        channel: '#oncall'
        title: '{{ .CommonAnnotations.summary }}'
        text: '{{ .CommonAnnotations.description }}'

  - name: 'slack-backend'
    slack_configs:
      - api_url: 'YOUR-SLACK-WEBHOOK'
        channel: '#backend'
```

### Supabase Edge Function Alert (Webhook)

```typescript
// In cleanup-old-drafts Edge Function
if (deletedCount > 100) {
  // Send alert to monitoring service
  await fetch('https://your-monitoring-service.com/alerts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      alert: 'high_deletion_count',
      severity: 'medium',
      message: `Cleanup deleted ${deletedCount} drafts (unusual)`,
      timestamp: new Date().toISOString()
    })
  });
}
```

---

## On-Call Runbook

### Quick Reference Card

**Emergency Commands:**

```bash
# 1. Check system health
docker ps | grep redis
redis-cli ping

# 2. Check cleanup job status
psql -c "SELECT * FROM public.cleanup_job_monitoring LIMIT 3;"

# 3. Manual cleanup (EMERGENCY ONLY)
psql -c "SELECT * FROM trigger_manual_cleanup();"

# 4. Check pollution rate
psql -c "SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'draft' AND generation_status IS NULL) / NULLIF(COUNT(*) FILTER (WHERE status = 'draft'), 0), 2) AS pollution_percentage FROM courses;"

# 5. Restart services
docker restart redis
supabase functions deploy cleanup-old-drafts
```

**Documentation Links:**
- Monitoring Guide: `/docs/monitoring/draft-cleanup-monitoring.md`
- Query Library: `/docs/monitoring/draft-cleanup-queries.sql`
- Tech Spec: `/docs/specs/TECH-SPEC-DRAFT-COURSE-CLEANUP.md`

---

## Alert Testing

### Test Procedures

**1. Test High Pollution Alert:**
```sql
-- Temporarily lower threshold to trigger alert
-- (DO NOT RUN IN PRODUCTION)
SELECT
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'draft' AND generation_status IS NULL) /
        NULLIF(COUNT(*) FILTER (WHERE status = 'draft'), 0), 2) AS pollution_percentage
FROM courses
HAVING pollution_percentage > 5;  -- Lower threshold for testing
```

**2. Test Cleanup Job Stall:**
```sql
-- Disable job temporarily
SELECT cron.alter_job('cleanup-old-drafts-hourly', active := false);

-- Wait 2 hours, verify alert fires

-- Re-enable
SELECT cron.alter_job('cleanup-old-drafts-hourly', active := true);
```

**3. Test Manual Cleanup:**
```sql
-- Create test drafts
INSERT INTO courses (title, status, organization_id, created_at)
VALUES ('Test Draft', 'draft', 'org-id', NOW() - INTERVAL '25 hours');

-- Trigger cleanup
SELECT * FROM trigger_manual_cleanup();

-- Verify deletion
SELECT COUNT(*) FROM courses WHERE title = 'Test Draft';
-- Should return 0
```

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2025-11-08 | 1.0 | Initial alerting rules created |

---

**END OF ALERTING RULES**
