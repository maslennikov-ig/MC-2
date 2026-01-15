---
name: process-logs
description: Process error logs from admin panel - fetch new errors, analyze, create tasks, fix, and mark resolved
version: 1.0.0
---

# Process Error Logs

Automated workflow for processing error logs from `/admin/logs`.

## Usage

Invoke via: `/process-logs` or "обработай логи ошибок"

## Workflow

### 1. Fetch New Errors

```sql
SELECT el.id, el.severity, el.error_message, el.metadata, el.stack_trace,
       el.course_id, el.lesson_id, el.request_id, el.trpc_path, el.trpc_input, el.attempted_value
FROM error_logs el
LEFT JOIN log_issue_status lis ON lis.log_id = el.id AND lis.log_type = 'error_log'
WHERE lis.id IS NULL
ORDER BY
  CASE el.severity WHEN 'CRITICAL' THEN 1 WHEN 'ERROR' THEN 2 ELSE 3 END,
  el.created_at DESC
LIMIT 20;
```

### 2. Categorize Each Error

| Pattern                      | Category       | Action            |
| ---------------------------- | -------------- | ----------------- |
| `violates.*constraint`       | DB constraint  | Fix via migration |
| `tRPC error`                 | API bug        | Fix code          |
| `ENRICHMENTS_STORAGE_BUCKET` | Config warning | Ignore            |
| `Cloudflare 500`             | External       | Ignore            |
| `Error querying`             | Query bug      | Fix code          |

### 3. For Fixable Errors

```bash
# Create Beads task
bd create --type=bug --priority=<1-3> --title="Fix: <message>" --files "<files>"
bd update <id> --status=in_progress

# Delegate to subagent based on type:
# - database-architect: DB errors
# - fullstack-nextjs-specialist: API errors
# - typescript-types-specialist: Type errors

# After fix
pnpm type-check && pnpm build

# Mark resolved
INSERT INTO log_issue_status (log_type, log_id, status, notes, updated_at)
VALUES ('error_log', '<id>', 'resolved', 'Fixed: <desc>', NOW())
ON CONFLICT (log_type, log_id) DO UPDATE SET status = 'resolved', notes = EXCLUDED.notes, updated_at = NOW();

# Close task
bd close <id> --reason="Fixed"
```

### 4. For Ignorable Errors

```sql
INSERT INTO log_issue_status (log_type, log_id, status, notes, updated_at)
VALUES ('error_log', '<id>', 'ignored', '<reason>', NOW())
ON CONFLICT (log_type, log_id) DO UPDATE SET status = 'ignored', notes = EXCLUDED.notes, updated_at = NOW();
```

## Output Summary

```markdown
## Log Processing Summary

| Severity | Fixed | Ignored | Remaining |
| -------- | ----- | ------- | --------- |
| CRITICAL | X     | 0       | Y         |
| ERROR    | X     | Y       | Z         |
| WARNING  | 0     | X       | 0         |

### Fixed:

- mc2-xxx: <description>

### Ignored:

- <id>: <reason>
```

## Reference Docs

- Admin Logs Guide: `.claude/docs/admin-logs-guide.md`
- Error Types: `packages/course-gen-platform/src/shared/logger/types.ts`
- Logs Router: `packages/course-gen-platform/src/server/routers/admin/logs.ts`
