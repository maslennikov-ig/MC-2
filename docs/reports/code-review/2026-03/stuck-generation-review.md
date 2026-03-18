# Code Review: Stuck Generation Detection

**Date**: 2026-03-18
**Reviewer**: Code Reviewer Worker (claude-sonnet-4-6)
**Branch**: develop
**Verdict**: NEEDS WORK

---

## Scope

Three artifacts reviewed:

1. `/packages/course-gen-platform/supabase/functions/detect-stuck-generations/index.ts` — new edge function
2. `/packages/course-gen-platform/src/orchestrator/worker.ts` lines ~304-309 — BullMQ stall config
3. pg_cron migration `add_detect_stuck_generations_cron` — applied via Supabase MCP (not on disk)

**Context reads**: `update_course_progress` RPC (migrations `20260316120000` and `20251126093000`), `cleanup-old-drafts/index.ts` (reference pattern), `last_progress_update` column definition (nullable, DEFAULT NULL).

---

## Findings Summary

| Severity    | Count |
| ----------- | ----- |
| High        | 3     |
| Medium      | 3     |
| Low         | 2     |
| Improvement | 3     |

---

## Issues

### HIGH-1: `last_progress_update` can be NULL — query silently skips affected rows

**File**: `detect-stuck-generations/index.ts:121-125`

```typescript
const { data: stuckCourses, error: queryError } = await supabase
  .from('courses')
  .select('id, title, generation_status, last_progress_update')
  .in('generation_status', [...STUCK_STATUSES])
  .lt('last_progress_update', cutoffTime);
```

**Problem**: The column `last_progress_update` is `TIMESTAMPTZ DEFAULT NULL` (confirmed in `20251021073547_apply_stage8_schema.sql`). In PostgreSQL, a `<` comparison against NULL evaluates to NULL (not TRUE), so the `.lt()` filter silently discards any course where `last_progress_update IS NULL`. A course that was enqueued, set to `stage_2_processing`, but whose worker immediately crashed and never called `update_course_progress` would have `last_progress_update = NULL`. These courses will never be detected by the stuck checker — which is exactly the scenario the function is meant to catch.

**Fix**: Use `.or()` to include both cases:

```typescript
.in('generation_status', [...STUCK_STATUSES])
.or(`last_progress_update.lt.${cutoffTime},last_progress_update.is.null`)
```

Or equivalently add a separate query for NULL and merge results. This is the highest-priority bug because it creates a blind spot in the safety net for the most critical failure mode (worker crash at start).

---

### HIGH-2: Security check is bypassable — any `Bearer <anything>` token passes

**File**: `detect-stuck-generations/index.ts:81-98`

```typescript
if (!authHeader || !authHeader.includes('Bearer')) {
```

**Problem**: The check only verifies that the word `Bearer` appears anywhere in the Authorization header. Any caller with `Authorization: Bearer fake` passes the check. The actual client created at line 108 uses `serviceRoleKey` regardless of what the caller sent — so this check provides no real authentication boundary. It does not compare the incoming token to `serviceRoleKey`.

The reference function `cleanup-old-drafts/index.ts` has the identical weakness — this is a copy-paste pattern that was already wrong.

**Note**: In practice, the function URL is not publicly listed and Supabase enforces the `apikey` header at the gateway level, so the practical risk is mitigated. However this is a false sense of security — the explicit comment says "Service role only" but the code does not enforce it. An attacker who learns the function URL and can supply any Bearer token will trigger mass course-failure marking.

**Fix**: Either compare the incoming token to the service role key:

```typescript
const incomingToken = authHeader?.replace('Bearer ', '');
if (incomingToken !== serviceRoleKey) {
  return 401;
}
```

Or remove the misleading comment and rely solely on Supabase gateway auth (document this decision). The same fix should be applied to `cleanup-old-drafts`.

---

### HIGH-3: No row limit — single invocation can time out on large backlogs

**File**: `detect-stuck-generations/index.ts:121-125`

The query has no `.limit()` clause. If there is a production incident that causes hundreds of courses to accumulate in stuck states, the edge function will attempt to call `update_course_progress` sequentially for every one of them. Edge functions on Supabase have a default timeout of 150 seconds. With N courses each requiring an RPC call (one round-trip per call), this will time out and leave the remaining courses unresolved.

Additionally, no `.limit()` on the initial SELECT means the function materializes all stuck courses in memory before processing them.

**Fix**: Add a processing batch limit (e.g., 50 per invocation) and rely on the next cron cycle for remaining courses:

```typescript
.in('generation_status', [...STUCK_STATUSES])
.lt('last_progress_update', cutoffTime)
.limit(50)
```

Log a warning when the limit is hit so operators know there is a backlog. The cron runs hourly so this is safe.

---

### MEDIUM-1: `p_metadata` is not used by the RPC — `safety_net` flag is silently dropped

**File**: `detect-stuck-generations/index.ts:188-191`

```typescript
p_metadata: {
  safety_net: true,
  detector: 'detect-stuck-generations',
},
```

Inspecting the `update_course_progress` RPC definition (both `20251126093000` and `20260316120000`), `p_metadata` is declared as a parameter but is never used in the function body — it is not written to any column. The metadata is accepted without error (Postgres does not reject extra JSONB) but is discarded. The `safety_net: true` flag cannot be queried later to distinguish safety-net failures from organic ones.

**Fix**: Either add `metadata` to the courses table update in the RPC, or accept this limitation and remove the misleading comment that implies it is stored. If you need to distinguish stuck-detector failures, write to `p_error_details` which IS persisted (`error_details` column).

---

### MEDIUM-2: BullMQ `stalledInterval` is too long relative to `lockDuration`

**File**: `worker.ts:304-309`

```typescript
lockDuration: 2700000,   // 45 minutes
stalledInterval: 300000, // 5 minutes
maxStalledCount: 2,
```

Per BullMQ documentation, `lockRenewTime` is automatically set to `lockDuration / 2` = 22.5 minutes. The stall checker runs every `stalledInterval` = 5 minutes. This combination is internally consistent — the lock renews at 22.5 min intervals and stalls are checked every 5 min.

However, with `maxStalledCount: 2`, a job that stalls (worker OOM-killed or crashed) will not be moved to failed until after **2 stall detection cycles at minimum** = 10 minutes of detection delay. Combined with the 45-minute lock, a stalled job where the lock does NOT expire (e.g., worker thread exits cleanly without releasing the lock, which can happen in some crash scenarios) will not be retried until the lock expires — 45 minutes later.

**The real concern**: The comment says "Check every 5 min (default 30s is too frequent for our long-running jobs)". The BullMQ default of 30 seconds is NOT too frequent — it is fine for long-running jobs. The stall checker does not pause or interrupt active jobs; it only promotes jobs whose locks have already expired back to the wait queue. Making `stalledInterval` 10x longer than default means a genuinely stalled job (worker crashed) takes up to `stalledInterval + lockDuration` = 50 minutes before being detected. This directly increases the window during which the stuck-generation edge function would need to intervene.

**Recommendation**: Reduce `stalledInterval` to 60000 (60 seconds) — it has no performance cost for running jobs and dramatically reduces stall detection latency. Keep `maxStalledCount: 2` (good — prevents false-positive retries for transiently slow jobs). The 45-minute `lockDuration` is correct and should stay.

---

### MEDIUM-3: Sequential RPC calls — no parallelism in stuck course resolution

**File**: `detect-stuck-generations/index.ts:169-231`

The `for...of` loop processes one course at a time:

```typescript
for (const course of courses) {
  const { error: rpcError } = await supabase.rpc('update_course_progress', ...);
```

With 10 stuck courses this means 10 sequential database round-trips. At ~50ms each, that is 500ms minimum. At 50 courses (see HIGH-3) it is 2.5 seconds of pure wait time — on top of the query time.

**Fix**: Use `Promise.allSettled` for parallel resolution, with the batch limit from HIGH-3:

```typescript
const results = await Promise.allSettled(
  courses.map(course => supabase.rpc('update_course_progress', { ... }))
);
```

This reduces resolution time from O(n) round-trips to O(1) round-trips.

---

### LOW-1: `detectedAt` timestamp is created inside the loop — micro-jitter between courses

**File**: `detect-stuck-generations/index.ts:171`

```typescript
const detectedAt = new Date().toISOString();
```

This is created per-iteration. In practice the times will be nearly identical, but semantically all courses in one detection run should share a single `detected_at` timestamp for consistency and easier correlation in logs/queries. Move it outside the loop alongside `timestamp` at line 134.

---

### LOW-2: Response returns `success: true` even when `failedToResolve > 0`

**File**: `detect-stuck-generations/index.ts:252-259`

```typescript
const result: DetectionResult = {
  success: true,
  stuckCount,
  resolvedCount,
  failedToResolve,
  ...
};
```

When `failedToResolve > 0`, the function returns HTTP 200 with `success: true`. The cron invoker (pg_cron) does not inspect the response body, so this does not affect scheduling. However, if this endpoint is ever called from monitoring pipelines or health checks that rely on `success: true` as an all-clear signal, this is misleading. Consider returning `success: resolvedCount === stuckCount` or `success: failedToResolve === 0`.

---

## Improvements

### IMP-1: Missing migration file on disk

The pg_cron migration `add_detect_stuck_generations_cron` was applied via Supabase MCP but no corresponding `.sql` file exists in `/packages/course-gen-platform/supabase/migrations/`. This breaks the migration history — the schema cannot be reproduced by running migrations from scratch (e.g., for a new environment, branch database, or team member setup). The migration should be written to disk as `20260318XXXXXX_add_detect_stuck_generations_cron.sql` and committed.

The cron SQL should look like:

```sql
SELECT cron.schedule(
  'detect-stuck-generations',
  '30 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/detect-stuck-generations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

---

### IMP-2: Deno std version is pinned to 0.168.0 — same as cleanup-old-drafts

**File**: `detect-stuck-generations/index.ts:16`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
```

This is the same pinned version as `cleanup-old-drafts`. Consistency is good, but 0.168.0 is from 2022. Supabase edge functions now use Deno 1.40+ and the `serve` pattern has been superseded by `Deno.serve`. This is not breaking (the old API still works) but new Supabase edge functions should use `Deno.serve(handler)` directly. Low priority since `cleanup-old-drafts` works fine with the same pin.

---

### IMP-3: No idempotency guard — concurrent invocations can double-mark courses

If the cron runs at `:30` and the edge function takes longer than 30 minutes (unlikely but possible with HIGH-3 scenarios), a second invocation could start while the first is still running. Both would find the same stuck courses (neither has completed the RPC calls yet) and both would call `update_course_progress` on them. The RPC is safe in the sense that calling `failed` on an already-`failed` course is idempotent (the FSM maps `p_status = 'failed'` unconditionally to the `failed` generation_status enum). However, it creates duplicate log entries and inflates the `resolvedCount` metrics.

The simplest guard is to add `status NOT IN ('failed', 'cancelled', 'completed')` to the query. The current query using `generation_status` already scopes to active processing states, but this makes the intent explicit.

---

## BullMQ Config Analysis

The three relevant settings with `lockDuration: 2700000`:

| Setting           | Value               | Analysis                                                                            |
| ----------------- | ------------------- | ----------------------------------------------------------------------------------- |
| `lockDuration`    | 2700000 ms (45 min) | Correct. LLM pipeline stages can take 30-40 min. Must match `PROCESSOR_MAX_TTL_MS`. |
| `stalledInterval` | 300000 ms (5 min)   | Too conservative — see MEDIUM-2. Recommend 60000 ms.                                |
| `maxStalledCount` | 2                   | Good. Prevents double-processing transient OOM spikes.                              |

Key insight from BullMQ docs: `stalledInterval` does not affect lock renewal (that is `lockDuration / 2` = 22.5 min automatically). It only affects how quickly a job whose lock has already expired is promoted back to waiting. Setting it to 5 minutes means a crashed-worker job waits up to 5 additional minutes after lock expiry. Setting it to 60 seconds reduces that to 60 seconds with zero cost to running jobs.

The layered safety architecture is sound:

1. BullMQ lock renewal keeps active jobs alive (22.5 min renew cadence)
2. BullMQ stall detection recovers crashed-worker jobs (currently 5 min, recommend 60s)
3. Worker `failed` event safety net updates course progress in Supabase
4. `detect-stuck-generations` edge function catches anything that fell through layers 1-3

The two-hour threshold in the edge function is appropriate given the 45-minute lock — a course stuck for 2 hours has definitely not been processing.

---

## Positive Observations

- The status-to-step-id mapping (`STATUS_TO_STEP_ID`) is correct against the RPC FSM table.
- Structured JSON logging (`event`, `timestamp`, `stuck_count`, etc.) is consistent with the rest of the codebase and suitable for log aggregation.
- The `p_error_details` payload (`timeout_hours`, `detected_at`, `previous_status`) is informative for post-mortems.
- The `SECURITY DEFINER` on the RPC combined with service-role client in the edge function is the correct pattern.
- The `autoRefreshToken: false, persistSession: false` client options are correct for server-side/edge usage.
- The `maxStalledCount: 2` choice is thoughtful — avoids immediate failure on transient stalls while still eventually failing genuinely dead jobs.
- Worker stall events are logged (line 520-528), maintaining observability.

---

## Verdict: NEEDS WORK

**Must fix before relying on this in production**:

- HIGH-1: NULL `last_progress_update` creates a blind spot for the most critical failure case
- HIGH-3: Missing query limit risks edge function timeout on backlogs
- IMP-1: Missing migration file means cron setup cannot be reproduced from source

**Should fix soon**:

- HIGH-2: Security check is bypassable (mitigated by Supabase gateway but misleading)
- MEDIUM-1: `p_metadata` is silently discarded
- MEDIUM-2: `stalledInterval` too conservative — reduces stall detection responsiveness
- MEDIUM-3: Sequential RPC calls when parallel would be safe and faster
