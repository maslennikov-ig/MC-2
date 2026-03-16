# HJX-0705: Fix Document Processing Crash + Monitoring Blind Spots

## Context

Course HJX-0705 ("Как работать в B24", 9MB DOCX) fails at Stage 2 with empty error message.
This is **systemic** — 3 courses failed the same way since Mar 14 (WHM-7180, THJ-3678, HJX-0705), all at document processing step. Last successful course: CUQ-0146 (Mar 10).

**Root Cause**: nginx Docling proxy returns 502 Bad Gateway due to stale Docker DNS cache. Fix was committed (9a32658e, Mar 14) but likely not deployed to server. Additionally:

- Error details are lost (bug in RPC parameter passing)
- Monitoring shows "healthy" when Docling is actually broken

**Three problems to fix:**

1. Docling proxy not working → generation fails
2. Error message propagation broken → error_message is always NULL on failure
3. Monitoring blind spots → admin panel shows "all healthy" while courses silently fail

---

## Task 1: Fix Docling Proxy & Restart HJX-0705

### 1.1 Verify & apply nginx config on server

Check if `nginx-docling-proxy.conf` (with DNS resolver fix) is applied on the server:

```bash
ssh megacampus-prod "cat /etc/nginx/conf.d/docling-proxy.conf"  # or wherever it's deployed
```

Compare with repo version. If outdated — copy and reload nginx.

### 1.2 Test Docling end-to-end

From inside the Docker network, test actual document conversion:

```bash
# Test nginx proxy passes through to Docling backend
curl -s http://docling-mcp:8000/mcp -X POST -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
```

### 1.3 Reset course for re-generation

```sql
UPDATE courses
SET generation_status = 'pending',
    error_message = NULL,
    error_details = NULL,
    generation_progress = jsonb_set(
      generation_progress,
      '{steps,1,status}', '"pending"'
    ),
    last_progress_update = NOW()
WHERE id = 'c8d4bbcc-a115-4ec2-9ac9-04d02de3b985';

UPDATE file_catalog
SET vector_status = 'pending', error_message = NULL
WHERE course_id = 'c8d4bbcc-a115-4ec2-9ac9-04d02de3b985';
```

Then user can re-trigger generation from the UI.

---

## Task 2: Fix Error Message Propagation (Bug)

### Problem

`base-handler.ts` and `worker.ts` safety net pass `error_message` INSIDE `p_metadata` JSON, but the RPC `update_course_progress` expects it as a separate `p_error_message` TEXT parameter. Result: `courses.error_message` is always NULL on failure.

Additionally, `failed_at_stage` column is never set by the RPC.

### 2.1 Fix `base-handler.ts`

**File**: `packages/course-gen-platform/src/orchestrator/handlers/base-handler.ts`

At lines 258-270 (failure path) and 296-308 (exception path), extract error fields from metadata and pass as separate params:

```typescript
// BEFORE (broken):
await supabase.rpc('update_course_progress', {
  p_course_id: courseId,
  p_step_id: stepId,
  p_status: 'failed',
  p_message: message,
  p_metadata: {
    job_id: jobId,
    worker_type: this.jobType,
    ...metadata, // error_message is buried here
  },
});

// AFTER (fixed):
const errorMsg = metadata?.error_message as string | undefined;
const errorDetails = metadata?.error_details;
const { error_message: _em, error_details: _ed, ...restMetadata } = metadata || {};
await supabase.rpc('update_course_progress', {
  p_course_id: courseId,
  p_step_id: stepId,
  p_status: 'failed',
  p_message: message,
  p_error_message: errorMsg || null,
  p_error_details: errorDetails ? JSON.parse(JSON.stringify(errorDetails)) : null,
  p_metadata: {
    job_id: jobId,
    worker_type: this.jobType,
    ...restMetadata,
  },
});
```

Apply the same fix to the exception catch block (lines 296-308).

### 2.2 Fix `worker.ts` safety net

**File**: `packages/course-gen-platform/src/orchestrator/worker.ts`

At lines 383-397 (safety net RPC call):

```typescript
// BEFORE:
await supabase.rpc('update_course_progress', {
  p_course_id: courseId,
  p_step_id: stepId,
  p_status: 'failed',
  p_message: message,
  p_metadata: {
    job_id: job.id,
    worker_type: jobType,
    error_message: error?.message || ...,  // buried in metadata!
    safety_net: true,
  },
});

// AFTER:
const safetyNetErrorMsg = error?.message || error?.stack?.split('\n')[0] || 'Worker thread crashed';
await supabase.rpc('update_course_progress', {
  p_course_id: courseId,
  p_step_id: stepId,
  p_status: 'failed',
  p_message: message,
  p_error_message: safetyNetErrorMsg,
  p_error_details: { stack: error?.stack, name: error?.name },
  p_metadata: {
    job_id: job.id,
    worker_type: jobType,
    safety_net: true,
  },
});
```

### 2.3 Migration: Add `failed_at_stage` to RPC

**New migration**: `supabase/migrations/YYYYMMDDHHMMSS_fix_failed_at_stage_in_rpc.sql`

Add `failed_at_stage` update to the `update_course_progress` function:

```sql
CREATE OR REPLACE FUNCTION update_course_progress(
  p_course_id UUID,
  p_step_id INTEGER,
  p_status TEXT,
  p_message TEXT,
  p_error_message TEXT DEFAULT NULL,
  p_error_details JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
-- ... existing code unchanged ...
  UPDATE courses
  SET
    -- ... existing columns ...
    -- ADD: Set failed_at_stage when status is 'failed'
    failed_at_stage = CASE WHEN p_status = 'failed' THEN p_step_id ELSE failed_at_stage END,
    -- ... rest unchanged ...
  WHERE id = p_course_id
  RETURNING generation_progress INTO v_progress;
-- ... rest unchanged ...
```

### 2.4 Fix `file_catalog.vector_status` on sandbox crash

**File**: `packages/course-gen-platform/src/orchestrator/worker.ts`

In the safety net block (after line 411), also update `file_catalog.vector_status`:

```typescript
// After safety net progress update, also fix file_catalog
const fileId = (job.data as Record<string, unknown>)?.fileId as string;
if (fileId && jobType === JobType.DOCUMENT_PROCESSING) {
  await supabase
    .from('file_catalog')
    .update({ vector_status: 'failed', error_message: safetyNetErrorMsg.substring(0, 1000) })
    .eq('id', fileId);
}
```

---

## Task 3: Fix Monitoring Blind Spots

### 3.1 Fix Docling health check (tests proxy, not just nginx)

**File**: `packages/web/app/api/admin/health/route.ts`

The Docling health check currently hits `/health` on the nginx proxy which returns `200 OK` directly without testing the backend. Replace with a check that actually tests the proxy-to-backend path:

```typescript
// Instead of just hitting /health (nginx returns 200 without proxying),
// send a POST to /mcp with MCP initialize request to verify the full path
// through nginx → backend Docling MCP server
```

Send MCP `initialize` request (lightweight, no file processing) through the proxy. If it returns valid JSON-RPC response → healthy. If 502/timeout → error.

### 3.2 Add "stuck courses" detection

**File**: `packages/web/app/api/admin/health/route.ts` or `packages/course-gen-platform/src/server/routers/admin/generation-monitoring.ts`

Add a check for courses stuck in non-terminal states:

```sql
SELECT COUNT(*) as stuck_count
FROM courses
WHERE generation_status NOT IN ('pending', 'completed', 'failed', 'cancelled')
  AND last_progress_update < NOW() - INTERVAL '2 hours'
```

If `stuck_count > 0` → report as `degraded` with message listing stuck course codes.

### 3.3 Add recent failures alert

In the admin health check, add detection for repeated recent failures:

```sql
SELECT COUNT(*) as recent_failures
FROM courses
WHERE generation_status = 'failed'
  AND updated_at > NOW() - INTERVAL '24 hours'
```

If `recent_failures >= 3` → flag as `degraded` with "Multiple courses failing — check document processing pipeline".

---

## Files to Modify

| File                                                                     | Change                                                            |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `packages/course-gen-platform/src/orchestrator/handlers/base-handler.ts` | Fix error param passing (lines 258-270, 296-308, 584-594)         |
| `packages/course-gen-platform/src/orchestrator/worker.ts`                | Fix safety net error params (lines 383-397) + file_catalog update |
| `packages/course-gen-platform/supabase/migrations/NEW_migration.sql`     | Add `failed_at_stage` to RPC                                      |
| `packages/web/app/api/admin/health/route.ts`                             | Fix Docling health check + add stuck/failure detection            |
| Server nginx config                                                      | Verify `nginx-docling-proxy.conf` is deployed                     |

---

## Verification

1. **Docling connectivity**: After nginx fix, test from server:

   ```bash
   curl -s http://localhost:8000/mcp -X POST -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
   ```

2. **Error propagation**: After code fix, create a test course and intentionally trigger a failure (e.g., upload an unsupported file format). Verify:
   - `courses.error_message` is NOT NULL
   - `courses.failed_at_stage` is set
   - `file_catalog.vector_status = 'failed'`

3. **Type-check + build**:

   ```bash
   pnpm --filter course-gen-platform type-check
   pnpm --filter course-gen-platform build
   pnpm --filter web type-check
   ```

4. **Monitoring**: After health check fix, stop Docling container and verify health endpoint reports `degraded` or `error` for Docling service.

5. **Re-run HJX-0705**: After all fixes, reset course status and trigger re-generation from UI. Verify it progresses past Stage 2.
