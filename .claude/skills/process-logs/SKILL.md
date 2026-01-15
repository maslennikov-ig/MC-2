---
name: process-logs
description: Process error logs from admin panel - fetch new errors, analyze, create tasks, fix, and mark resolved
version: 1.1.0
---

# Process Error Logs

Automated workflow for processing error logs from `/admin/logs`.

## Orchestrator Role

**YOU ARE THE ORCHESTRATOR.** Follow these rules:

1. **Simple tasks** (config fixes, single-line changes) - execute directly
2. **Complex tasks** (multi-file fixes, migrations, API changes) - delegate to subagents
3. **ALWAYS verify** subagent results by reading modified files and running `pnpm type-check && pnpm build`
4. **Use MCP tools**: `mcp__supabase__execute_sql` for DB queries, `mcp__context7__query-docs` for documentation
5. **ALWAYS use context7** for documentation and examples before implementing

## Usage

Invoke via: `/process-logs` or "обработай логи ошибок"

## Workflow

### 1. Fetch New Errors (use mcp**supabase**execute_sql)

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

### 2. Categorize & Assign

| Pattern                | Category      | Subagent                      |
| ---------------------- | ------------- | ----------------------------- |
| `violates.*constraint` | DB constraint | `database-architect`          |
| `tRPC error`           | API bug       | `fullstack-nextjs-specialist` |
| `Type.*error`          | Type error    | `typescript-types-specialist` |
| `Error querying`       | Query bug     | `database-architect`          |
| Config missing         | Config issue  | **ask user** how to resolve   |
| External service       | External      | mark `to_verify`, monitor     |

**IMPORTANT**: Never auto-ignore errors. Always fix or ask user.

### 3. For Each Error

```bash
# 1. Create Beads task
bd create --type=bug --priority=<1-3> --title="Fix: <message>" --files "<files>"
bd update <id> --status=in_progress

# 2. Query context7 for relevant docs
mcp__context7__resolve-library-id + mcp__context7__query-docs

# 3. Delegate to subagent OR fix directly (simple cases only)

# 4. VERIFY results (MANDATORY):
# - Read modified files
# - Run: pnpm type-check && pnpm build
# - Re-delegate if errors

# 5. Mark resolved
INSERT INTO log_issue_status (log_type, log_id, status, notes, updated_at)
VALUES ('error_log', '<id>', 'resolved', 'Fixed: <desc>', NOW())
ON CONFLICT (log_type, log_id) DO UPDATE SET status = 'resolved', notes = EXCLUDED.notes, updated_at = NOW();

# 6. Close task
bd close <id> --reason="Fixed"
```

### 4. Verification Checklist

Before marking resolved:

- [ ] Files modified correctly (Read tool)
- [ ] `pnpm type-check` passes
- [ ] `pnpm build` passes
- [ ] No new errors introduced

## Output Summary

```markdown
## Log Processing Summary

| Severity | Fixed | Pending | To Verify |
| -------- | ----- | ------- | --------- |
| CRITICAL | X     | Y       | Z         |
| ERROR    | X     | Y       | Z         |
| WARNING  | X     | Y       | Z         |

### Fixed:

- mc2-xxx: <description>

### Pending (need user input):

- <id>: <reason>
```

## Subagent Selection

| Error Type            | Subagent                      | When                |
| --------------------- | ----------------------------- | ------------------- |
| DB schema/constraints | `database-architect`          | Migrations, RLS     |
| API/tRPC errors       | `fullstack-nextjs-specialist` | Backend logic       |
| Type errors           | `typescript-types-specialist` | Complex types       |
| UI errors             | `nextjs-ui-designer`          | Frontend components |

## Reference Docs

- Admin Logs Guide: `.claude/docs/admin-logs-guide.md`
- Error Types: `packages/course-gen-platform/src/shared/logger/types.ts`
- Logs Router: `packages/course-gen-platform/src/server/routers/admin/logs.ts`
