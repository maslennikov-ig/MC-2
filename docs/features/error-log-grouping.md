# Error Log Grouping

## Overview

Error log grouping is a feature that aggregates identical errors by fingerprint to reduce visual noise in the admin panel. Instead of showing 500 separate rows for the same repeated error, it shows 1 row with "×500 occurrences".

**Benefits:**

- Reduces admin panel noise significantly (e.g., 377 logs → 39 groups = 90% reduction)
- Faster identification of unique error patterns
- Bulk status management for entire error groups
- Better performance with server-side aggregation

## How It Works

### 1. Fingerprint Generation (Database Trigger)

When an error log is inserted, a PostgreSQL trigger automatically generates a fingerprint:

```
error_log → trigger → fingerprint (MD5 hash)
```

The fingerprint is based on:

- `job_type` - The type of background job that failed
- `normalized_message` - Error message with dynamic values removed
- `normalized_stack` - Stack trace with dynamic values removed

### 2. Normalization Process

The `normalize_stack_trace()` function removes dynamic values to ensure identical errors get the same fingerprint:

| Pattern        | Replacement    |
| -------------- | -------------- |
| UUIDs          | `<UUID>`       |
| Timestamps     | `<TIMESTAMP>`  |
| Line numbers   | `<LINE>`       |
| Column numbers | `<COL>`        |
| Process IDs    | `<PID>`        |
| Port numbers   | `<PORT>`       |
| Job IDs        | `<JOB_ID>`     |
| Request IDs    | `<REQUEST_ID>` |
| Numeric IDs    | `<ID>`         |

**Example:**

```
Before: "Error at file.ts:42:10 at 2026-01-16T10:00:00Z job_123"
After:  "Error at file.ts:<LINE>:<COL> at <TIMESTAMP> job_<JOB_ID>"
```

### 3. Server-Side Aggregation (RPC Functions)

Grouping is performed at the database level for optimal performance:

```sql
-- Main grouping function
SELECT * FROM get_grouped_error_logs(
  p_limit := 20,
  p_offset := 0,
  p_severity := 'ERROR',
  p_environment := 'stage',
  p_status := 'new'
);

-- Count function for pagination
SELECT get_grouped_error_logs_count(
  p_severity := 'ERROR',
  p_environment := 'stage',
  p_status := 'new'
);
```

**Returns:**

- `fingerprint` - MD5 hash identifying the error group
- `count` - Number of occurrences
- `first_seen` / `last_seen` - Time range
- `severity` - Worst severity in group (CRITICAL > ERROR > WARNING)
- `message` - Latest error message
- `environments` - Unique environments where error occurred
- `latest_log_id` - ID of most recent occurrence
- `latest_problem_id` - Associated problem ID if any

## Database Schema

### Tables

```sql
-- error_logs table (extended)
ALTER TABLE error_logs ADD COLUMN fingerprint TEXT;
CREATE INDEX idx_error_logs_fingerprint ON error_logs(fingerprint);
CREATE INDEX idx_error_logs_fingerprint_created ON error_logs(fingerprint, created_at DESC);

-- log_issue_status table (extended for group-level status)
ALTER TABLE log_issue_status ADD COLUMN fingerprint TEXT UNIQUE;
CREATE INDEX idx_log_issue_status_fingerprint ON log_issue_status(fingerprint);
```

### Functions

| Function                                               | Purpose                              |
| ------------------------------------------------------ | ------------------------------------ |
| `normalize_stack_trace(text)`                          | Removes dynamic values from text     |
| `generate_error_fingerprint(job_type, message, stack)` | Creates MD5 fingerprint              |
| `set_error_log_fingerprint()`                          | Trigger function for auto-generation |
| `get_grouped_error_logs(...)`                          | Returns grouped logs with filters    |
| `get_grouped_error_logs_count(...)`                    | Returns count for pagination         |

## Admin Panel Usage

### View Modes

The logs page supports two view modes:

1. **Grouped View** (default) - Shows error patterns with occurrence counts
2. **Flat View** - Shows individual error instances

Toggle between views using the view mode selector in the filter bar.

### Grouped View Features

- **Occurrence Count** - Color-coded badge showing how many times error occurred
  - Blue: 1-10 occurrences
  - Amber: 11-100 occurrences
  - Red: 100+ occurrences

- **Severity** - Worst severity across all occurrences in the group

- **Environments** - Badges showing which environments (dev/stage) have this error

- **Problem ID** - Link to associated problem if fingerprint is linked

### Bulk Status Management

1. Click on a group row to open the detail drawer
2. See recent occurrences (last 5)
3. Select new status (New, In Progress, To Verify, Resolved, Ignored)
4. Add optional notes
5. Click "Update All" to apply status to entire group

### Filtering

All filters work in both grouped and flat views:

- **Level** - WARNING, ERROR, CRITICAL
- **Status** - New, In Progress, To Verify, Resolved, Ignored
- **Environment** - Dev, Stage
- **Search** - Filter by error message content
- **Date Range** - From/To date filters

## API Reference

### tRPC Procedures

```typescript
// List grouped errors
admin.logs.listGrouped({
  page: 1,
  limit: 20,
  filters: {
    level: 'ERROR',
    status: 'new',
    environment: 'stage',
    search: 'connection',
    dateFrom: '2026-01-01T00:00:00Z',
    dateTo: '2026-01-31T23:59:59Z',
  },
});

// Get logs within a group
admin.logs.getGroupLogs({
  fingerprint: 'a1b2c3d4e5f6...', // 32-char MD5 hash
  page: 1,
  limit: 10,
});

// Update status for entire group
admin.logs.updateGroupStatus({
  fingerprint: 'a1b2c3d4e5f6...',
  status: 'resolved',
  notes: 'Fixed in v1.2.3',
});
```

### Server Actions

```typescript
import {
  listGroupedLogsAction,
  getGroupLogsAction,
  updateGroupStatusAction,
} from '@/app/actions/admin-logs';

// List grouped logs
const result = await listGroupedLogsAction({
  page: 1,
  limit: 20,
  filters: { status: 'new' },
});

// Get group details
const logs = await getGroupLogsAction({
  fingerprint: 'a1b2c3d4...',
  page: 1,
  limit: 5,
});

// Update group status
await updateGroupStatusAction({
  fingerprint: 'a1b2c3d4...',
  status: 'resolved',
  notes: 'Fixed',
});
```

## Performance Considerations

### Indexing Strategy

The following indexes optimize grouped queries:

```sql
-- Primary fingerprint lookup
CREATE INDEX idx_error_logs_fingerprint ON error_logs(fingerprint);

-- Time-ordered queries within fingerprint
CREATE INDEX idx_error_logs_fingerprint_created ON error_logs(fingerprint, created_at DESC);

-- Status lookup by fingerprint
CREATE INDEX idx_log_issue_status_fingerprint ON log_issue_status(fingerprint);
```

### Query Performance

- **Server-side grouping** via RPC functions ensures constant memory usage
- **Pagination** at database level prevents fetching entire dataset
- **Function marked STABLE** allows PostgreSQL query optimization
- **Composite indexes** support both grouping and time-based filtering

### Recommended Load Testing

Test with realistic data volumes:

- 10,000+ error logs
- 500+ unique fingerprints
- 50 concurrent admin users
- Target: Query times < 1 second

## Troubleshooting

### Common Issues

**Q: Fingerprints not being generated?**

- Check if trigger is installed: `SELECT * FROM pg_trigger WHERE tgname = 'tr_set_error_log_fingerprint'`
- Verify function exists: `SELECT * FROM pg_proc WHERE proname = 'set_error_log_fingerprint'`

**Q: Same errors getting different fingerprints?**

- Normalization may not cover all dynamic patterns
- Check `normalize_stack_trace()` function for missing patterns
- Add new replacement patterns if needed

**Q: Grouped view showing wrong counts?**

- Verify RPC function is deployed: `SELECT * FROM get_grouped_error_logs(1, 0)`
- Check for database migration issues

**Q: Status filter not working?**

- Ensure `log_issue_status.fingerprint` column exists
- Verify index exists on fingerprint column

## Migration History

| Migration                                       | Description                                             |
| ----------------------------------------------- | ------------------------------------------------------- |
| `20260117_add_error_log_fingerprint.sql`        | Added fingerprint column, functions, triggers, backfill |
| `20260117100000_add_grouped_error_logs_rpc.sql` | Added RPC functions for server-side grouping            |

## Related Documentation

- [Admin Logs Router](/packages/course-gen-platform/src/server/routers/admin/logs.ts)
- [Server Actions](/packages/web/app/actions/admin-logs.ts)
- [Grouped Log Table Component](/packages/web/app/[locale]/admin/logs/components/grouped-log-table.tsx)
- [Code Review Report](/docs/reports/code-review/2026-01/error-log-grouping-review.md)
