# Cleanup Old Drafts Edge Function

## Overview

This Supabase Edge Function automatically deletes abandoned draft courses that were never processed. It runs hourly via pg_cron and helps maintain database hygiene by removing stale data.

## Cleanup Criteria

The function deletes draft courses that meet ALL of the following conditions:

- `status = 'draft'`
- `generation_status IS NULL` (never started processing)
- `created_at < NOW() - INTERVAL '24 hours'` (older than 24 hours)

## Security

- **Authentication**: Requires service role key (bypasses RLS)
- **Access**: Only callable via pg_cron job or direct invocation with service role key
- **Transaction Safety**: Uses atomic DELETE operations

## Response Format

### Success Response (200)

```json
{
  "success": true,
  "deletedCount": 5,
  "cutoffTime": "2025-01-07T12:00:00.000Z",
  "timestamp": "2025-01-08T12:00:00.000Z",
  "deletedCourses": [
    {
      "id": "uuid-1",
      "title": "Draft Course 1",
      "created_at": "2025-01-06T10:00:00.000Z"
    }
    // ... up to 10 courses for debugging
  ]
}
```

### Error Response (500)

```json
{
  "success": false,
  "error": "Error message",
  "deletedCount": 0,
  "cutoffTime": "2025-01-08T12:00:00.000Z",
  "timestamp": "2025-01-08T12:00:00.000Z"
}
```

## Deployment

### Prerequisites

1. Supabase CLI installed: `npm install -g supabase`
2. Authenticated: `supabase login`
3. Linked to project: `supabase link --project-ref diqooqbuchsliypgwksu`

### Deploy Command

```bash
# From the repository root
cd packages/course-gen-platform/supabase

# Deploy the Edge Function
supabase functions deploy cleanup-old-drafts

# Verify deployment
supabase functions list
```

### Set Environment Variables

The Edge Function requires these environment variables to be set in Supabase Dashboard:

1. Go to: https://supabase.com/dashboard/project/diqooqbuchsliypgwksu/settings/functions
2. Set variables for `cleanup-old-drafts`:
   - `SUPABASE_URL`: `https://diqooqbuchsliypgwksu.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY`: (get from Settings > API > service_role key)

**Note**: These are automatically available in Edge Functions, but explicitly set for clarity.

## Testing

### Manual Test

```bash
# Test the Edge Function directly
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

### Verify Cleanup Logic

```sql
-- Check drafts pending cleanup (should match function's deletedCount)
SELECT COUNT(*)
FROM courses
WHERE status = 'draft'
  AND generation_status IS NULL
  AND created_at < NOW() - INTERVAL '24 hours';
```

### Check Logs

```bash
# View Edge Function logs
supabase functions logs cleanup-old-drafts --follow
```

Or in Supabase Dashboard:
1. Go to Edge Functions > cleanup-old-drafts
2. Click "Logs" tab

## Database Migration

After deploying the Edge Function, run the database migrations to set up the automated cron job:

```bash
# Apply migrations in order
supabase db push

# Or apply individually
psql $DATABASE_URL -f migrations/20250108_add_draft_cleanup_index.sql
psql $DATABASE_URL -f migrations/20250108_cleanup_old_drafts_job.sql
```

### Verify Cron Job

```sql
-- Check if cron job is scheduled
SELECT * FROM cron.job WHERE jobname = 'cleanup-old-drafts-hourly';

-- Check recent job runs
SELECT * FROM public.cleanup_job_monitoring;

-- Check pending cleanup count
SELECT * FROM public.check_pending_cleanup();
```

## Monitoring

### Key Metrics to Track

1. **Deletion Count**: Number of drafts deleted per run
2. **Execution Time**: How long the function takes
3. **Error Rate**: Failed invocations
4. **Pending Cleanup**: Drafts waiting to be cleaned up

### Monitoring Queries

```sql
-- View last 10 cleanup job runs
SELECT * FROM public.cleanup_job_monitoring;

-- Check current pending cleanup
SELECT * FROM public.check_pending_cleanup();

-- Check draft pollution metrics
SELECT
  COUNT(*) FILTER (WHERE status = 'draft') as total_drafts,
  COUNT(*) FILTER (WHERE status = 'draft' AND generation_status IS NULL) as unused_drafts,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'draft' AND generation_status IS NULL) /
    NULLIF(COUNT(*) FILTER (WHERE status = 'draft'), 0),
    2
  ) as unused_percentage
FROM courses;
```

### Alerts

Consider setting up alerts for:

- **High deletion count** (>100 drafts): May indicate a problem
- **Cleanup failures**: Check logs and fix issues
- **High pending count** (>50): Cleanup job may not be running

## Troubleshooting

### Edge Function Not Running

1. Check if cron job is active:
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'cleanup-old-drafts-hourly';
   ```

2. Check job run history:
   ```sql
   SELECT * FROM public.cleanup_job_monitoring;
   ```

3. Manually trigger the function for testing:
   ```bash
   curl -X POST https://diqooqbuchsliypgwksu.supabase.co/functions/v1/cleanup-old-drafts \
     -H "Authorization: Bearer YOUR-SERVICE-ROLE-KEY"
   ```

### No Drafts Being Deleted

1. Verify drafts exist:
   ```sql
   SELECT * FROM public.check_pending_cleanup();
   ```

2. Check if drafts meet deletion criteria:
   ```sql
   SELECT id, title, status, generation_status, created_at
   FROM courses
   WHERE status = 'draft'
     AND generation_status IS NULL
     AND created_at < NOW() - INTERVAL '24 hours'
   LIMIT 5;
   ```

### Permission Errors

Ensure the service role key is correctly set:

1. Go to: https://supabase.com/dashboard/project/diqooqbuchsliypgwksu/settings/api
2. Copy the `service_role` key (not `anon` key)
3. Update Edge Function environment variables
4. Update database setting:
   ```sql
   ALTER DATABASE postgres SET app.settings.service_role_key = 'your-service-role-key';
   ```

## Rollback

### Disable Cleanup Job

```sql
-- Unschedule the cron job
SELECT cron.unschedule('cleanup-old-drafts-hourly');
```

### Remove Edge Function

```bash
# Delete the Edge Function
supabase functions delete cleanup-old-drafts
```

### Rollback Database Migration

```sql
-- Remove cron job
SELECT cron.unschedule('cleanup-old-drafts-hourly');

-- Drop monitoring view
DROP VIEW IF EXISTS public.cleanup_job_monitoring;

-- Drop helper function
DROP FUNCTION IF EXISTS public.check_pending_cleanup();

-- Drop index
DROP INDEX IF EXISTS idx_courses_draft_cleanup;
```

## Performance

### Index Usage

The function uses the `idx_courses_draft_cleanup` partial index for optimal performance:

```sql
-- Verify index is being used
EXPLAIN (ANALYZE, BUFFERS)
DELETE FROM courses
WHERE status = 'draft'
  AND generation_status IS NULL
  AND created_at < NOW() - INTERVAL '24 hours';
```

Expected output should show: `Index Scan using idx_courses_draft_cleanup`

### Expected Performance

- **Small dataset** (<1000 courses): <100ms
- **Medium dataset** (1000-10000 courses): <500ms
- **Large dataset** (>10000 courses): <2s

## Related Files

- **Edge Function**: `supabase/functions/cleanup-old-drafts/index.ts`
- **Index Migration**: `migrations/20250108_add_draft_cleanup_index.sql`
- **Cron Job Migration**: `migrations/20250108_cleanup_old_drafts_job.sql`
- **Technical Spec**: `docs/specs/TECH-SPEC-DRAFT-COURSE-CLEANUP.md`

## Support

For issues or questions:
1. Check Edge Function logs: `supabase functions logs cleanup-old-drafts`
2. Check cron job status: `SELECT * FROM public.cleanup_job_monitoring`
3. Review technical spec: `docs/specs/TECH-SPEC-DRAFT-COURSE-CLEANUP.md`
