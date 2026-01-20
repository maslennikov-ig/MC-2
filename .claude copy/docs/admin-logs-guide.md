# Admin Logs Guide

## Tables

- `error_logs` - system errors, tRPC errors
- `generation_trace` - LLM trace errors (when `error_data IS NOT NULL`)
- `log_issue_status` - admin review status (polymorphic: log_type + log_id)

## Statuses

`new` (no record) | `in_progress` | `to_verify` | `resolved` | `ignored`

## Get New Errors

```sql
-- From error_logs
SELECT el.id, el.severity, el.error_message, el.metadata, el.stack_trace
FROM error_logs el
LEFT JOIN log_issue_status lis ON lis.log_id = el.id AND lis.log_type = 'error_log'
WHERE lis.id IS NULL
ORDER BY el.created_at DESC LIMIT 30;

-- From generation_trace
SELECT gt.id, gt.stage, gt.phase, gt.error_data, c.title
FROM generation_trace gt
LEFT JOIN log_issue_status lis ON lis.log_id = gt.id AND lis.log_type = 'generation_trace'
LEFT JOIN courses c ON c.id = gt.course_id
WHERE gt.error_data IS NOT NULL AND lis.id IS NULL
ORDER BY gt.created_at DESC LIMIT 30;
```

## Mark Resolved

```sql
INSERT INTO log_issue_status (log_type, log_id, status, notes, updated_at)
VALUES ('error_log', '<id>', 'resolved', 'Fixed: <desc>', NOW())
ON CONFLICT (log_type, log_id) DO UPDATE SET status = 'resolved', notes = EXCLUDED.notes, updated_at = NOW();
```

## Workflow

1. Query new errors via SQL
2. Analyze root cause
3. Create beads task: `bd create -t bug --title "Fix: ..."`
4. Fix (delegate or direct)
5. Mark resolved in log_issue_status

## Code Locations

- Router: `packages/course-gen-platform/src/server/routers/admin/logs.ts`
- UI: `packages/web/app/[locale]/admin/logs/`
