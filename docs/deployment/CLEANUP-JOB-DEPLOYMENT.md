# Deployment Guide: Draft Course Cleanup Job

## Overview

This guide covers the deployment of the automated cleanup system for abandoned draft courses. The system consists of:

1. **Supabase Edge Function** (`cleanup-old-drafts`)
2. **Database Index** for query optimization
3. **pg_cron Job** for hourly execution

## Prerequisites

### Required Tools

- Supabase CLI: `npm install -g supabase`
- PostgreSQL client: `psql` (for manual migration testing)
- curl (for testing)

### Required Access

- Supabase project admin access
- Database credentials
- Service role API key

### Project Information

- **Project Name**: MegaCampusAI
- **Project Ref**: `diqooqbuchsliypgwksu`
- **Supabase URL**: `https://diqooqbuchsliypgwksu.supabase.co`

## Deployment Steps

### Step 1: Authenticate with Supabase

```bash
# Login to Supabase (opens browser)
supabase login

# Link to the project
cd packages/course-gen-platform/supabase
supabase link --project-ref diqooqbuchsliypgwksu
```

### Step 2: Deploy the Edge Function

```bash
# Deploy the Edge Function
supabase functions deploy cleanup-old-drafts

# Expected output:
# Deploying function cleanup-old-drafts...
# Function deployed successfully!
```

### Step 3: Configure Edge Function Environment

The Edge Function needs access to the service role key. This is automatically available in Supabase Edge Functions, but you can verify:

1. Go to: https://supabase.com/dashboard/project/diqooqbuchsliypgwksu/settings/api
2. Copy the `service_role` key (NOT the `anon` key)
3. Go to: https://supabase.com/dashboard/project/diqooqbuchsliypgwksu/functions/cleanup-old-drafts
4. Verify environment variables (usually auto-configured):
   - `SUPABASE_URL`: `https://diqooqbuchsliypgwksu.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY`: (your service role key)

### Step 4: Test the Edge Function

```bash
# Get your service role key from Supabase dashboard
# Then test the function:

curl -X POST https://diqooqbuchsliypgwksu.supabase.co/functions/v1/cleanup-old-drafts \
  -H "Authorization: Bearer YOUR-SERVICE-ROLE-KEY" \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "success": true,
  "deletedCount": 0,
  "cutoffTime": "2025-01-07T12:00:00.000Z",
  "timestamp": "2025-01-08T12:00:00.000Z"
}
```

### Step 5: Apply Database Migrations

Run migrations in the correct order:

```bash
# Option A: Using Supabase CLI (recommended)
cd packages/course-gen-platform/supabase
supabase db push

# Option B: Using psql (manual)
# First, get the database URL from Supabase dashboard
psql "postgresql://postgres:[PASSWORD]@db.diqooqbuchsliypgwksu.supabase.co:5432/postgres" \
  -f migrations/20250108_add_draft_cleanup_index.sql

psql "postgresql://postgres:[PASSWORD]@db.diqooqbuchsliypgwksu.supabase.co:5432/postgres" \
  -f migrations/20250108_cleanup_old_drafts_job.sql
```

### Step 6: Configure Service Role Key for pg_cron

The cron job needs access to the service role key. Set it as a database parameter:

```sql
-- Connect to your database and run:
ALTER DATABASE postgres SET app.settings.service_role_key = 'YOUR-SERVICE-ROLE-KEY';

-- Verify it's set:
SHOW app.settings.service_role_key;
```

**Security Note**: This setting is only accessible to database roles with proper permissions.

### Step 7: Verify Cron Job Setup

```sql
-- Check if cron job is created
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname = 'cleanup-old-drafts-hourly';

-- Expected output:
-- jobname: cleanup-old-drafts-hourly
-- schedule: 0 * * * *
-- active: t
```

### Step 8: Test the Complete System

```bash
# 1. Create a test draft course older than 24 hours
psql "YOUR-DATABASE-URL" <<EOF
INSERT INTO courses (
  id,
  title,
  status,
  generation_status,
  organization_id,
  created_at
) VALUES (
  gen_random_uuid(),
  'TEST: Old Draft (DELETE ME)',
  'draft',
  NULL,
  (SELECT id FROM organizations LIMIT 1),
  NOW() - INTERVAL '25 hours'
);
EOF

# 2. Check pending cleanup count
psql "YOUR-DATABASE-URL" -c "SELECT * FROM public.check_pending_cleanup();"

# 3. Manually trigger cleanup (or wait for hourly cron)
curl -X POST https://diqooqbuchsliypgwksu.supabase.co/functions/v1/cleanup-old-drafts \
  -H "Authorization: Bearer YOUR-SERVICE-ROLE-KEY"

# 4. Verify test draft was deleted
psql "YOUR-DATABASE-URL" -c "SELECT * FROM public.check_pending_cleanup();"
# Should show one less pending draft
```

## Verification

### Check Edge Function Logs

```bash
# View recent logs
supabase functions logs cleanup-old-drafts --follow

# Or in Supabase Dashboard:
# https://supabase.com/dashboard/project/diqooqbuchsliypgwksu/functions/cleanup-old-drafts/logs
```

### Check Cron Job Execution

```sql
-- View last 10 cron job runs
SELECT * FROM public.cleanup_job_monitoring;

-- Check for errors
SELECT *
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'cleanup-old-drafts-hourly')
  AND status != 'succeeded'
ORDER BY start_time DESC
LIMIT 10;
```

### Monitor Cleanup Metrics

```sql
-- Current draft pollution metrics
SELECT
  COUNT(*) FILTER (WHERE status = 'draft') as total_drafts,
  COUNT(*) FILTER (WHERE status = 'draft' AND generation_status IS NULL) as unused_drafts,
  COUNT(*) FILTER (WHERE status = 'draft' AND generation_status IS NOT NULL) as used_drafts,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'draft' AND generation_status IS NULL) /
    NULLIF(COUNT(*) FILTER (WHERE status = 'draft'), 0),
    2
  ) as unused_percentage
FROM courses;

-- Drafts by age
SELECT
  CASE
    WHEN created_at > NOW() - INTERVAL '1 hour' THEN '< 1 hour'
    WHEN created_at > NOW() - INTERVAL '24 hours' THEN '1-24 hours'
    WHEN created_at > NOW() - INTERVAL '7 days' THEN '1-7 days'
    ELSE '> 7 days'
  END as age_group,
  COUNT(*) as count
FROM courses
WHERE status = 'draft' AND generation_status IS NULL
GROUP BY age_group
ORDER BY age_group;
```

### Verify Index Usage

```sql
-- Check if index is being used
EXPLAIN (ANALYZE, BUFFERS)
DELETE FROM courses
WHERE status = 'draft'
  AND generation_status IS NULL
  AND created_at < NOW() - INTERVAL '24 hours';

-- Should show: "Index Scan using idx_courses_draft_cleanup"
```

## Monitoring and Alerts

### Key Metrics

Track these metrics in your monitoring system:

1. **Cleanup Job Success Rate**: Should be >99%
2. **Drafts Deleted Per Run**: Typical range 0-20
3. **Pending Cleanup Count**: Should decrease over time
4. **Unused Draft Percentage**: Target <10% (down from 57%)

### Recommended Alerts

Set up alerts for:

```sql
-- Alert 1: High pending cleanup (>50 drafts)
SELECT COUNT(*) as pending
FROM courses
WHERE status = 'draft'
  AND generation_status IS NULL
  AND created_at < NOW() - INTERVAL '24 hours'
HAVING COUNT(*) > 50;

-- Alert 2: Cleanup job failures (>3 consecutive failures)
SELECT COUNT(*) as consecutive_failures
FROM (
  SELECT status
  FROM cron.job_run_details
  WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'cleanup-old-drafts-hourly')
  ORDER BY start_time DESC
  LIMIT 3
) recent_runs
WHERE status != 'succeeded'
HAVING COUNT(*) = 3;

-- Alert 3: High deletion count (>100 drafts in one run)
-- Monitor Edge Function logs for: "High number of drafts deleted"
```

## Rollback Procedure

If you need to rollback the deployment:

### 1. Disable the Cron Job

```sql
-- Stop automated cleanup
SELECT cron.unschedule('cleanup-old-drafts-hourly');
```

### 2. Remove the Edge Function (Optional)

```bash
# Delete the Edge Function
supabase functions delete cleanup-old-drafts
```

### 3. Rollback Database Changes (Optional)

```sql
-- Drop monitoring view
DROP VIEW IF EXISTS public.cleanup_job_monitoring;

-- Drop helper function
DROP FUNCTION IF EXISTS public.check_pending_cleanup();

-- Drop index (safe to keep, but can be removed)
DROP INDEX IF EXISTS idx_courses_draft_cleanup;
```

## Troubleshooting

### Edge Function Not Found (404)

- Verify deployment: `supabase functions list`
- Redeploy: `supabase functions deploy cleanup-old-drafts`

### Unauthorized (401)

- Check service role key is correct
- Verify `app.settings.service_role_key` is set in database

### Cron Job Not Running

```sql
-- Check if pg_cron is enabled
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- Check if job is active
SELECT * FROM cron.job WHERE jobname = 'cleanup-old-drafts-hourly';

-- If not active, rerun the migration
```

### No Drafts Being Deleted

```sql
-- Check if drafts exist that meet criteria
SELECT COUNT(*)
FROM courses
WHERE status = 'draft'
  AND generation_status IS NULL
  AND created_at < NOW() - INTERVAL '24 hours';

-- Check Edge Function logs for errors
```

## Success Criteria

The deployment is successful when:

- ✅ Edge Function deployed and accessible
- ✅ Cron job scheduled and active
- ✅ Index created and being used
- ✅ Test cleanup deletes old drafts
- ✅ Monitoring queries return data
- ✅ No errors in Edge Function logs
- ✅ Unused draft percentage decreasing

## Timeline

| Day | Expected Metric | Target |
|-----|----------------|--------|
| Day 1 | Initial deployment | All systems green |
| Day 7 | Unused draft % | <15% (from 57%) |
| Day 30 | Total drafts in DB | <20 (from 46) |
| Day 30 | Unused draft % | <5% |

## Support

For issues:

1. Check Edge Function logs: `supabase functions logs cleanup-old-drafts`
2. Check cron monitoring: `SELECT * FROM public.cleanup_job_monitoring`
3. Review technical spec: `docs/specs/TECH-SPEC-DRAFT-COURSE-CLEANUP.md`
4. Check Edge Function README: `supabase/functions/cleanup-old-drafts/README.md`

## Related Documentation

- **Technical Spec**: `/docs/specs/TECH-SPEC-DRAFT-COURSE-CLEANUP.md`
- **Edge Function README**: `/packages/course-gen-platform/supabase/functions/cleanup-old-drafts/README.md`
- **Migration Files**:
  - `migrations/20250108_add_draft_cleanup_index.sql`
  - `migrations/20250108_cleanup_old_drafts_job.sql`
