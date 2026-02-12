# Plan: Migrate raw fetch() to type-safe tRPC client calls

## Context

**Problem**: `/api/coursegen/partial-generate` returns 400 on staging. Error logs confirm 400s on **5 different tRPC endpoints** in the past week:

- `lessonContent.partialGenerate` (Feb 12 — today, blocking user)
- `clarifying.submitAnswer` (Feb 9)
- `generation.approveStage` (Feb 10)
- `generation.applyProposal` (Feb 7)
- `documentProcessing.retryDocument` (Feb 11)

**Root cause**: ~40 places use raw `fetch(TRPC_URL/procedure)` with plain JSON bodies. tRPC v11 Express adapter expects wire format `{ json: { ...input } }` (or batch format `{ "0": { "json": {...} } }` with `?batch=1`). Without wrapper, tRPC reads `body.json` → `undefined` → Zod validation fails → 400 BAD_REQUEST.

**Why now?**: Project migrated to `@trpc/react-query` with `httpBatchLink` (commit `ec8c8b6e`). The React hooks work correctly through the tRPC client. But server actions and standalone API routes were never migrated — they still use raw `fetch()`.

**Solution exists**: `getServerTrpcClient()` at `packages/web/lib/trpc/server-caller.ts` was created (mc2-doti) but never adopted. It uses `createTRPCClient<AppRouter>` with `httpBatchLink` — correct wire format, full type safety.

---

## Approach: Server-caller for server code, tRPC hooks for client code

### Phase 1: Fix partial-generate (urgent, unblocks user)

**File**: `packages/web/app/api/coursegen/partial-generate/route.ts`

Replace raw fetch (lines 114-128) with `getServerTrpcClient()`:

```typescript
const client = await getServerTrpcClient();
const result = await client.lessonContent.partialGenerate.mutate({
  courseId: body.courseId,
  lessonIds: body.lessonIds,
  sectionIds: body.sectionIds,
  priority: body.priority ?? 5,
});
return NextResponse.json({ result: { data: result } });
```

Keep the auth check (lines 38-67) — it provides better error messages than tRPC's raw auth errors.

Also fix `packages/web/app/actions/lesson-actions.ts` — functions `retryLessonGeneration` and `retryMultipleLessons` that call the same endpoint directly.

### Phase 2: Migrate all server actions to getServerTrpcClient()

**Files to migrate** (all use raw `fetch(TRPC_URL/...)` with POST):

| File                                | Functions                                                             | Priority                          |
| ----------------------------------- | --------------------------------------------------------------------- | --------------------------------- |
| `app/actions/lesson-actions.ts`     | 8 functions (approve, update, regenerate, delete, export, retry)      | P1 — user-facing                  |
| `app/actions/admin-generation.ts`   | 12+ functions (initiate, approve, cancel, edit, etc.)                 | P1 — admin-facing, confirmed 400s |
| `app/actions/enrichment-actions.ts` | 3 functions (create, delete, regenerate)                              | P2                                |
| `app/actions/refinement.ts`         | 2 functions (chat, applyProposal) — confirmed 400 on Feb 7            | P1                                |
| `app/actions/document-actions.ts`   | 1 function (retryDocument) — confirmed 400 on Feb 11                  | P1                                |
| `app/actions/admin-logs.ts`         | 4 POST functions (updateStatus, bulkUpdate, updateGroupStatus + GETs) | P2                                |
| `app/[locale]/courses/actions.ts`   | 1 function (cleanupCourse)                                            | P2                                |

**Pattern** for each function:

```typescript
// BEFORE (broken)
const headers = await getBackendAuthHeaders();
const response = await fetch(`${TRPC_URL}/lessonContent.approveLesson`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ courseId, lessonId }),
});
const data = await response.json();
return data?.result?.data || data;

// AFTER (type-safe, correct wire format)
const client = await getServerTrpcClient();
return client.lessonContent.approveLesson.mutate({ courseId, lessonId });
```

For GET queries (admin-logs.ts list/getById/listGrouped/getGroupLogs):

```typescript
// BEFORE
const res = await fetch(`${TRPC_URL}/admin.logs.list?input=${query}`, { headers });

// AFTER
const client = await getServerTrpcClient();
return client.admin.logs.list.query({ ...params });
```

### Phase 3: Migrate standalone API routes

**Files**:

| Route                                                           | Calls                                  | Action                              |
| --------------------------------------------------------------- | -------------------------------------- | ----------------------------------- |
| `app/api/coursegen/partial-generate/route.ts`                   | `lessonContent.partialGenerate`        | Phase 1 (done)                      |
| `app/api/coursegen/generate/route.ts`                           | `generation.initiate`                  | Replace fetch with server-caller    |
| `app/api/coursegen/upload/route.ts`                             | `generation.uploadFile`                | Replace fetch (special: multipart)  |
| `app/api/coursegen/lesson-content/route.ts`                     | `lessonContent.getLessonContent` (GET) | Replace with server-caller .query() |
| `app/api/coursegen/job-status/route.ts`                         | `jobs.getStatus` (GET) — 404 errors!   | Check route, fix                    |
| `app/api/courses/[orgSlug]/[courseSlug]/delete/route.ts`        | `generation.cleanupCourse`             | Replace fetch                       |
| `app/api/courses/[orgSlug]/[courseSlug]/restart-stage/route.ts` | `generation.restartStage`              | Replace fetch                       |

**Note on upload route**: File upload uses `FormData`, not JSON. Need to verify if `getServerTrpcClient()` works for file uploads or keep special handling.

### Phase 4: Migrate client-side hooks

**Files** (these make raw fetch from browser to `/api/trpc` or `TRPC_URL`):

| File                                         | Calls                                        | Fix                                          |
| -------------------------------------------- | -------------------------------------------- | -------------------------------------------- |
| `hooks/useAutoCard.ts`                       | GET + POST to `enrichment.*`                 | Use `trpc.enrichment.*.useQuery/useMutation` |
| `lib/hooks/useEnrichmentGeneration.ts`       | POST to `enrichment.generateOnDemand/cancel` | Use tRPC mutations                           |
| `components/course/CourseVisualsManager.tsx` | POST to `BACKEND_URL/trpc/endpoint`          | Use tRPC mutations                           |

**Note**: `usePartialGeneration.ts` and `SelectionToolbar.tsx` call `/api/coursegen/partial-generate` (the Next.js route). After Phase 1 fix, these work correctly without changes. Future optimization: replace with tRPC mutations.

---

## Critical Files

- `packages/web/lib/trpc/server-caller.ts` — existing server-side tRPC client (reuse)
- `packages/web/lib/trpc/react.ts` — client-side tRPC hooks (reuse for Phase 4)
- `packages/web/lib/auth.ts` — `getBackendAuthHeaders()`, `TRPC_URL` (will be less used after migration)
- `packages/web/lib/api-error-handler.ts` — `extractApiError()` (replace with tRPC error handling)

## Error Handling Pattern

tRPC client throws `TRPCClientError` on failure. Server actions should catch and re-throw friendly errors:

```typescript
import { TRPCClientError } from '@trpc/client';

export async function approveLesson(courseId: string, lessonId: string) {
  try {
    const client = await getServerTrpcClient();
    return await client.lessonContent.approveLesson.mutate({ courseId, lessonId });
  } catch (error) {
    if (error instanceof TRPCClientError) {
      throw new Error(error.message);
    }
    throw new Error('Failed to approve lesson');
  }
}
```

---

## Verification

1. **Type-check**: `pnpm type-check` — must pass (tRPC client is fully typed)
2. **Build**: `pnpm --filter web build` — verify no runtime import issues
3. **Manual test on staging**:
   - Open course with generated structure
   - Click "Generate" on a lesson → should NOT get 400
   - Check admin panel → approve stage, retry doc should work
4. **Check error_logs**: After deploy, verify no more 400 errors from tRPC endpoints
5. **Unit tests**: `pnpm --filter web test` if applicable

## Execution Order

1. Phase 1 (urgent) → deploy → verify partial-generate works
2. Phase 2 (server actions) → batched, test each group
3. Phase 3 (API routes) → some routes may become candidates for removal if frontend can use tRPC directly
4. Phase 4 (client hooks) → lower priority, can be separate PR
