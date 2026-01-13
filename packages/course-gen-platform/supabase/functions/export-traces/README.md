# Export Traces Edge Function

Exports old generation trace archive records to cold storage (Supabase Storage) as part of the data lifecycle management strategy.

## Purpose

Part of the tiered data lifecycle:

- **HOT** (0-30 days): `generation_trace` - Active debugging
- **WARM** (30-90 days): `generation_trace_archive` - Problem analysis
- **COLD** (90+ days): `trace-archives` bucket - Compliance, audit

This function handles the WARM → COLD transition.

## Prerequisites

1. **Create Storage Bucket**: Before running this function, create the `trace-archives` bucket via Supabase Dashboard:
   - Go to Storage section
   - Create new bucket: `trace-archives`
   - Set as private (not public)

2. **Database Functions**: The following functions must exist (created by migration):
   - `export_archive_to_json(p_age_days INTEGER)`
   - `purge_exported_archive(p_age_days INTEGER)`

## Trigger

Scheduled via pg_cron (not implemented in migration - manual trigger):

```sql
-- Add to cron.job if needed
SELECT cron.schedule(
    'trace-weekly-export',
    '0 3 * * 0',  -- Sundays at 3:00 UTC
    $$SELECT net.http_post(
        url := 'https://<project-ref>.supabase.co/functions/v1/export-traces',
        headers := '{"Authorization": "Bearer <service-role-key>"}'::jsonb
    )$$
);
```

## API

### Request

```bash
# Manual invocation
curl -X POST https://<project-ref>.supabase.co/functions/v1/export-traces \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{"age_days": 90}'
```

### Parameters

| Parameter  | Type    | Default | Description                                      |
| ---------- | ------- | ------- | ------------------------------------------------ |
| `age_days` | integer | 90      | Archive records older than this will be exported |

### Response

```json
{
  "success": true,
  "exportedCount": 1500,
  "purgedCount": 1500,
  "fileName": "traces/archive_2026-01-14_1705200000000.json",
  "timestamp": "2026-01-14T03:00:00.000Z"
}
```

## File Format

Exported files are stored as JSON arrays in Supabase Storage:

- Bucket: `trace-archives`
- Path: `traces/archive_YYYY-MM-DD_timestamp.json`
- Format: Array of generation_trace_archive records

## Security

- Requires service role key (bypasses RLS)
- Storage bucket should be private
- Only service role can trigger export

## Monitoring

Check function logs in Supabase Dashboard → Edge Functions → export-traces → Logs

Events logged:

- `export_completed` - Successful export with counts
- `export_failed` - Error with message

## Related

- Migration: `20260114000000_generation_trace_lifecycle.sql`
- ADR: `docs/ADR-006-generation-trace-lifecycle.md` (if exists)
- Plan: `.claude/plans/linear-snuggling-pearl.md`
