# Plan: Fix Banner Generation and Related Issues

## Summary

Fix 4 issues discovered from log analysis:

1. **P2** Cover/Banner generation hangs at 50% (mc2-48o0)
2. **P3** Prompt validation 500 char limit exceeded (mc2-xxj6)
3. **P3** UNAUTHORIZED errors during polling (mc2-vs0r)
4. **P4** Frontend Fast Refresh runtime error (mc2-v90d)

## Root Cause Analysis

### Issue 1: Cover/Banner hangs at 50% (DETAILED)

**Root cause**: On-demand generation uses `isDraftPhase: true` while batch generation uses `isDraftPhase: false`.

**Code trace:**

1. **On-demand (broken)** - `generate-on-demand.ts:184`:

   ```typescript
   isDraftPhase: isTwoStageType(enrichmentType),  // cover = true
   ```

   - Creates job with `isDraftPhase: true`
   - Worker generates draft, status = `draft_ready`
   - **STUCK**: No UI or API to approve draft → Phase 2 never starts

2. **Batch generation (working)** - `auto-card-trigger.ts:410`:

   ```typescript
   await addEnrichmentJob(queue, jobInput, {...});  // isDraftPhase NOT set
   ```

   - `isDraftPhase` defaults to `false` in `job-processor.ts:101`
   - Falls through to `handler.generate()` directly (line 307)
   - Generates image in single-stage → works!

**Solution**: Make on-demand cover/banner use single-stage (like batch does)

### Issue 2: Prompt validation fails

**Root cause**: Zod schema at `cover-handler.ts:157`:

```typescript
prompt_en: z.string().min(20).max(500),  // Too restrictive
```

LLM generates prompts ~550+ chars due to:

- Visual style descriptions: ~100 chars
- Mandatory no-text suffix: ~100 chars
- LLM output: ~350+ chars

### Issue 3: UNAUTHORIZED polling

**Root cause**: `useEnrichmentGeneration.ts` uses direct `fetch()`:

```typescript
const headers = getAuthHeaders(); // Captured at mount time
const response = await fetch(`${TRPC_URL}/enrichment.getGenerationStatus`, { headers });
```

- Token captured in closure, never refreshed
- After ~1 hour, token expires, 401 errors
- After 5 failures, polling stops

### Issue 4: Frontend runtime error

**Status**: Needs separate investigation - low priority (P4)

---

## Implementation Plan

### Phase 1: Fix Cover/Banner On-Demand Generation (single-stage)

**Goal**: Make on-demand cover/banner use single-stage flow (like batch generation already does)

**Key insight**: The fix is simple - just set `isDraftPhase: false` for cover/banner in on-demand.

**Files to modify**:

1. `packages/course-gen-platform/src/server/routers/enrichment/procedures/generate-on-demand.ts`

   **Line 184** - Change from:

   ```typescript
   isDraftPhase: isTwoStageType(enrichmentType),
   ```

   To:

   ```typescript
   // Cover and banner use single-stage on-demand (no draft approval UI)
   // Two-stage is only for video/presentation which have approval UI
   isDraftPhase: enrichmentType === 'video' || enrichmentType === 'presentation',
   ```

2. `packages/course-gen-platform/src/server/routers/enrichment/helpers.ts`

   **Lines 396-400** - Update `isTwoStageType()` to exclude cover:

   ```typescript
   export function isTwoStageType(enrichmentType: string): boolean {
     // Only video and presentation use two-stage (have approval UI)
     // Cover/banner use single-stage for on-demand generation
     return enrichmentType === 'video' || enrichmentType === 'presentation';
   }
   ```

   **Note**: This function is used in multiple places, so the change will be consistent.

### Phase 2: Fix Prompt Validation Limit

**Goal**: Increase character limit to accommodate visual style + no-text suffix

**File to modify**:

- `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/cover-handler.ts`

**Changes**:

1. **Line 157** - Increase validation limit:

   ```typescript
   // From:
   prompt_en: z.string().min(20).max(500),
   // To:
   prompt_en: z.string().min(20).max(800),
   ```

2. **System prompt** (~line 480) - Request shorter output:
   ```typescript
   // From: "2-4 sentences, 60-120 words"
   // To: "2-3 sentences, 50-80 words"
   ```

This gives buffer for:

- Visual style (~100 chars)
- No-text suffix (~100 chars)
- LLM output (~400 chars)
- Total: ~600 chars (under 800 limit)

### Phase 3: Fix Token Refresh During Polling

**Goal**: Handle 401 errors gracefully with token refresh

**File to modify**:

- `packages/web/lib/hooks/useEnrichmentGeneration.ts`

**Changes** (~line 190-220):

```typescript
// Before fetch, always get fresh token
const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
  // Force refresh if token is about to expire
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
  };
}, [supabase]);

// In pollStatus function
const pollStatus = async () => {
  try {
    const headers = await getAuthHeaders();  // Now async
    const response = await fetch(..., { headers });

    if (response.status === 401) {
      // Try to refresh session
      const { data, error } = await supabase.auth.refreshSession();
      if (!error && data.session) {
        // Retry immediately with new token (don't count as failure)
        void pollStatus();
        return;
      }
      // Refresh failed - treat as auth error
      stopPolling(type);
      onError?.('Session expired. Please log in again.');
      return;
    }
    // ... rest of logic
  }
};
```

### Phase 4: Investigate Frontend Runtime Error (Deferred)

**Status**: P4, will investigate separately after main fixes

---

## Critical Files

| File                                                         | Changes                                    |
| ------------------------------------------------------------ | ------------------------------------------ |
| `server/routers/enrichment/procedures/generate-on-demand.ts` | Set `isDraftPhase: false` for cover/banner |
| `server/routers/enrichment/helpers.ts`                       | Remove 'cover' from `isTwoStageType()`     |
| `stages/stage7-enrichments/handlers/cover-handler.ts`        | Increase limit 500→800, shorter prompt     |
| `web/lib/hooks/useEnrichmentGeneration.ts`                   | Add 401 handling with token refresh        |

---

## Verification

1. **Cover/Banner generation**:

   ```bash
   # Start dev servers
   pnpm dev

   # Test in browser:
   # 1. Navigate to course → Media section
   # 2. Click generate cover/banner
   # 3. Should complete to 100% with image (no 50% hang)
   # 4. Check logs: grep "Stage 7 job completed" logs/dev/worker-stage7-latest.log
   #    Should show status='completed', not 'draft_ready'
   ```

2. **Prompt validation**:

   ```bash
   # After generating cover, check worker logs:
   grep "failed to validate draft variants" logs/dev/worker-stage7-latest.log
   # Should return NO results (validation now passes)
   ```

3. **Token refresh** (manual test):
   - Start a generation that takes >5 minutes
   - Polling should continue without 401 errors
   - Or: check code review for proper async getSession usage

4. **Type check & build**:
   ```bash
   pnpm type-check
   pnpm build
   ```

---

## Alternatives Considered

### For Issue 1 (Cover hangs):

- **Option A**: Create `approveCoverDraft` UI flow (complex, requires new components)
- **Option B**: Make cover single-stage for on-demand (CHOSEN - simple, unified)
- Reasoning: Batch covers already use single-stage, user wants "unified approach"

### For Issue 3 (Token refresh):

- **Option A**: Use Supabase Realtime subscriptions (larger refactor)
- **Option B**: Add token refresh on 401 (CHOSEN - minimal change)
- **Option C**: Extend JWT expiry (security concern)

---

## Risk Assessment

| Change                           | Risk                        | Mitigation                     |
| -------------------------------- | --------------------------- | ------------------------------ |
| Remove cover from isTwoStageType | Medium - affects other uses | Check all 8 usages in codebase |
| Increase prompt limit            | Low                         | Only affects validation        |
| Async getAuthHeaders             | Low                         | Standard pattern               |

## Dependencies

- No new packages required
- No database migrations
- No deployment changes
