# Fix: "Enrichment not found" misclassifies network errors, stops polling permanently

## Context

When generating NLM audio/video, the frontend polls `getGenerationStatus` every 2s. If the backend restarts (Turbopack HMR, deploy, etc.), the Supabase admin client's HTTP fetch fails with `TypeError: fetch failed`. The `verifyEnrichmentAccess` function treats ALL errors (including network) as "Enrichment not found" (NOT_FOUND), causing the frontend to count them toward the 5-failure permanent stop limit. After 5 failures (~10s during outage), polling stops permanently and the UI never transitions to show the completed enrichment.

**Evidence from logs**: enrichmentId `e36ba3c5` got `TypeError: fetch failed` at 10:35:22, followed by 6+ server restarts. Frontend stopped polling; user had to refresh page.

**Related**: `mc2-21pul` fixed a different symptom (status filter), `mc2-vs0r` fixed auth token expiry. This is a new root cause: network error misclassification.

## Changes

### 1. Backend: Differentiate network errors from "not found" in `verifyEnrichmentAccess`

**File**: `packages/course-gen-platform/src/server/routers/enrichment/helpers.ts` (lines 55-69)

**Current** (broken):

```typescript
if (error || !enrichment) {
  throw new TRPCError({ code: 'NOT_FOUND', message: 'Enrichment not found' });
}
```

**Fix**: Check error type before throwing:

```typescript
if (error) {
  // Supabase PGRST116 = "JSON object requested, multiple (or no) rows returned"
  // This means the row genuinely doesn't exist
  if (error.code === 'PGRST116' || (!enrichment && !error.message?.includes('fetch'))) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Enrichment not found' });
  }
  // Network/transient error — signal retry, not permanent failure
  logger.error({ requestId, enrichmentId, error }, 'Enrichment lookup failed (transient)');
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Temporary error checking enrichment',
  });
}
if (!enrichment) {
  throw new TRPCError({ code: 'NOT_FOUND', message: 'Enrichment not found' });
}
```

### 2. Frontend: Only count NOT_FOUND toward permanent failure limit

**File**: `packages/web/lib/hooks/useEnrichmentGeneration.ts` (lines 266-296)

**Current** (broken): All errors increment the same failure counter → 5 any-errors → stop.

**Fix**: Split error handling:

```typescript
} catch (error) {
  if (isAbortLikeError(error)) return;

  log.error('Poll error:', error);

  // Only count NOT_FOUND (enrichment truly deleted) toward permanent stop
  const isNotFound = error instanceof TRPCClientError && error.data?.code === 'NOT_FOUND';

  if (isNotFound) {
    const failures = (pollFailuresRef.current.get(type) || 0) + 1;
    pollFailuresRef.current.set(type, failures);

    if (failures >= MAX_POLL_FAILURES) {
      stopPolling(type);
      setGenerating(prev => { const next = new Map(prev); next.delete(type); return next; });
      const errorMessage = isResume
        ? `Failed to resume ${type} generation...`
        : 'Lost connection to server. Please refresh and try again.';
      onError?.(errorMessage);
    }
  } else {
    // Transient error (server restart, network) — backoff but keep retrying
    currentInterval = Math.min(currentInterval * 2, MAX_BACKOFF_INTERVAL);
  }
}
```

**Import needed**: `TRPCClientError` is already imported at line 4.

## Files to modify

1. `packages/course-gen-platform/src/server/routers/enrichment/helpers.ts` — `verifyEnrichmentAccess` function
2. `packages/web/lib/hooks/useEnrichmentGeneration.ts` — poll error handling in `startPolling`

## Verification

1. `pnpm type-check && pnpm build` — must pass
2. `cd packages/course-gen-platform && npx vitest run "get-generation-status"` — existing tests
3. `cd packages/web && npx vitest run "useEnrichmentGeneration"` — existing tests
4. Manual test: start NLM generation, kill/restart backend during polling, verify:
   - Frontend logs show transient errors but continues polling
   - After backend comes back, polling resumes and eventually shows completed enrichment
