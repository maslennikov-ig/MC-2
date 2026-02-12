# Plan: Fix trace staleness after stage restart

## Context

When a user restarts a generation stage, the `restart_from_stage` RPC correctly deletes old `generation_trace` records from the database. However, the frontend `RealtimeProvider` only subscribes to `INSERT` events on `generation_trace` — it never receives `DELETE` notifications. This causes the graph to display stale error traces (e.g., `docling_conversion_failed`) until the user manually refreshes the page.

The issue manifests when:

1. A stage fails (error traces are written)
2. User clicks "Restart" (backend deletes old traces via RPC)
3. Frontend still shows old error traces from React state
4. New success traces arrive via Realtime INSERT, creating a confusing mix

## Solution: Refetch traces on restart detection

When the Realtime course UPDATE handler detects a status change to any `*_init` status (restart indicator), trigger a full trace refetch from the database.

### Why this approach

- Works regardless of how restart was triggered (UI button, API, admin)
- Single change in one component (`RealtimeProvider`)
- Piggybacks on existing Realtime subscription for course updates
- No need to subscribe to DELETE events (which only return row IDs, not full cleanup context)

## Changes

### 1. `packages/web/components/generation-monitoring/realtime-provider.tsx`

In the `courses` UPDATE handler (line ~309), add restart detection:

```typescript
// After setting the new status (line 310):
const newStatus = payload.new.generation_status as CourseStatus;
if (newStatus) {
  setStatus(newStatus);

  // Detect restart: *_init statuses mean traces were cleaned by RPC
  const isRestart = newStatus.endsWith('_init');
  if (isRestart) {
    // Clear stale traces and refetch from DB (RPC already deleted old ones)
    setTraces([]);
    fetchTraces();
  }

  // ... existing toast logic
}
```

Key detail: `setTraces([])` first to immediately clear stale error traces from the graph, then `fetchTraces()` to load the fresh (empty) state from DB.

### 2. Fix `fetchTraces` stability (if needed)

`fetchTraces` is already wrapped in `useCallback` with deps `[courseId, supabase, isLoading, session]`, so it's stable and safe to call from the Realtime handler.

## Files to modify

| File                                                                  | Change                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `packages/web/components/generation-monitoring/realtime-provider.tsx` | Add restart detection + refetch in course UPDATE handler (~5 lines) |

## No changes needed

- **Backend**: `restart_from_stage` RPC already handles trace cleanup correctly (migration `20251218_fix_restart_from_stage_rpc.sql`)
- **`restartStage` router**: Already calls the RPC + cleans BullMQ jobs, Qdrant vectors, Redis cache
- **Frontend graph logic**: `updatePhasesMap`/`updateAttemptsMap` work correctly when traces are properly refreshed

## Verification

1. Start a course generation, let Stage 2 fail
2. Click "Restart" button in the graph UI
3. Verify: graph immediately clears old error nodes (no page refresh needed)
4. Verify: new traces appear correctly as the stage re-processes
5. Check browser console: `RealtimeProvider` should log "Fetching traces" after restart detection
6. Run type-check: `pnpm type-check`
