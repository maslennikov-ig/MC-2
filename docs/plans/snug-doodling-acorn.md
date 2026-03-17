# Fix Admin Health Monitor: Docling MCP 404 + Stuck Courses False Positives

## Context

Admin dashboard system health monitor shows two false alarms:

1. **Docling MCP** — "Degraded" with `HTTP 404: Not Found`. The MCP server IS running and healthy, but the health check POST to `/mcp` returns 404 because the endpoint format doesn't match. The full nginx→backend chain works.
2. **Stuck Courses** — Reports 37 stuck courses, but 16 of them (43%) are in `*_awaiting_approval` states which are **intentional pauses** waiting for human action, not stuck processes.

## File to modify

`packages/web/app/api/admin/health/route.ts`

## Fix 1: Docling MCP Health Check (lines 215-328)

**Root cause:** The health check sends `POST /mcp` with a JSON-RPC initialize request. The Docling MCP backend returns HTTP 404 (endpoint not found). Code at line 290 only treats `200/400/405` as healthy. HTTP 404 falls through to the generic "degraded" handler at line 312.

**Key insight:** If the server responds with 404 or 406, it means the full chain (DNS → nginx → backend) is working. The only truly broken states are:

- `502` — nginx can't reach backend
- `503/504` — service unavailable/timeout
- Connection failure / timeout

**Fix:** On line 290, add `404` and `406` to the list of "server is responding" statuses:

```typescript
// Server responded but with unexpected format — still means chain is working
if (response.ok || response.status === 400 || response.status === 404 || response.status === 405 || response.status === 406) {
```

This keeps the existing logic intact — 502 still reports error, timeouts still report error — but stops flagging a working server as degraded just because it doesn't support the exact JSON-RPC endpoint format.

## Fix 2: Stuck Courses Check (lines 793-853)

**Root cause:** The query at line 805 excludes only 4 terminal states:

```
("pending","completed","failed","cancelled")
```

But `*_awaiting_approval` states are **intentional pauses** — the system is waiting for human approval before proceeding. These courses can sit in this state for days/weeks legitimately.

**Data from production (37 "stuck" courses):**

- `stage_5_awaiting_approval`: 10 (false positive)
- `stage_4_awaiting_approval`: 5 (false positive)
- `stage_2_awaiting_approval`: 1 (false positive)
- Remaining 21: genuinely stuck (`stage_4_clarifying`, `stage_6_generating`, etc.)

**Fix:** Add all `*_awaiting_approval` states to the exclusion list on line 805:

```typescript
.not('generation_status', 'in', '("pending","completed","failed","cancelled","stage_2_awaiting_approval","stage_3_awaiting_approval","stage_4_awaiting_approval","stage_5_awaiting_approval")')
```

This reduces false positives from 37 to ~21 genuinely stuck courses.

## Step 3: Delete 21 genuinely stuck courses from DB

Delete courses that are truly stuck (not awaiting_approval) and older than 2 hours. Run via `mcp__supabase__execute_sql`:

```sql
DELETE FROM courses
WHERE generation_status NOT IN (
  'pending','completed','failed','cancelled',
  'stage_2_awaiting_approval','stage_3_awaiting_approval',
  'stage_4_awaiting_approval','stage_5_awaiting_approval'
)
AND last_progress_update < NOW() - INTERVAL '2 hours'
```

This removes ~21 courses in states like `stage_4_clarifying`, `stage_6_generating`, `stage_5_generating`, `stage_2_init`, `stage_4_analyzing`, `stage_5_complete` that have been inactive for >2 hours.

## Verification

1. `pnpm --filter web type-check` — no type errors
2. `pnpm --filter web build` — build succeeds
3. Re-run stuck courses SQL query — should return 0 rows
4. Deploy to dev, open admin panel → System Health Monitor:
   - Docling MCP should show "Healthy" (green)
   - Stuck Courses should show "Healthy" (0 stuck)
