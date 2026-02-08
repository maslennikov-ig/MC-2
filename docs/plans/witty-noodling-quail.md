# Plan: tRPC Architecture Refactoring (mc2-tlcj)

## Context

**Problem**: `packages/trpc-client-sdk` — unused external SDK (467 LOC). Active tRPC client in `web/lib/trpc/client.ts` (704 LOC) is a custom fetch-wrapper covering only 1 of 16 backend routers. Remaining 15 routers are accessed via raw fetch in 18 Server Action files (~4600 LOC) with manual typing, no caching, and boilerplate `useEffect+useState` patterns in components.

**Goal**: Install official `@trpc/react-query`, connect it to all 16 backend routers, migrate ~24 read-only functions to auto-generated typesafe hooks, and clean up dead code. This gives us automatic type inference, React Query caching, DevTools, and deduplication for all API calls.

**Source**: AUDIT_REPORT.md Section 6.3, 4.3 (Beads mc2-tlcj)

---

## Phase 0: Delete trpc-client-sdk (~30 min)

1. Remove `packages/trpc-client-sdk/` directory entirely
2. Remove from `pnpm-workspace.yaml` if explicitly listed (currently uses glob `packages/*`)
3. Clean references:
   - `packages/course-gen-platform/tools/verify/verify-structure.ts` — remove mention
   - `packages/README.md` — remove SDK section
   - Root `CHANGELOG.md` — leave as historical record
4. Run `pnpm install` to update lockfile
5. Verify: `pnpm type-check && pnpm build`

---

## Phase 1: Install @trpc/react-query + Setup (~2h)

### 1.1 Install packages in web

```bash
pnpm --filter @megacampus/web add @trpc/client@^11.8.0 @trpc/react-query@^11.8.0
```

### 1.2 Add type-only dependency on backend

Add to `packages/web/package.json`:

```json
"@megacampus/course-gen-platform": "workspace:*"
```

This gives access to `AppRouter` type. The import is `import type { AppRouter }` — type-only, no runtime code bundled.

Verify `packages/course-gen-platform/package.json` exports the type properly. The `AppRouter` type is in `src/server/app-router.ts`.

### 1.3 Create tRPC React client

**NEW**: `packages/web/lib/trpc/react.ts`

```typescript
'use client';

import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@megacampus/course-gen-platform/src/server/app-router';

export const trpc = createTRPCReact<AppRouter>();
```

### 1.4 Create tRPC client setup with httpBatchLink

**NEW**: `packages/web/lib/trpc/trpc-provider.tsx`

Based on tRPC v11 docs pattern (Context7):

```tsx
'use client';

import { useState } from 'react';
import { httpBatchLink } from '@trpc/client';
import { trpc } from './react';
import { getQueryClient } from '@/lib/query-client';
import { BACKEND_URL } from '@/lib/env-client';
import { getSupabaseClient } from '@/lib/supabase/browser-client';

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${BACKEND_URL}/trpc`, // Direct to backend (bypasses proxy)
          // OR: '/api/trpc' (uses existing proxy route)
          async headers() {
            const supabase = getSupabaseClient();
            const {
              data: { session },
            } = await supabase.auth.getSession();
            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
            };
            if (session?.access_token) {
              headers['Authorization'] = `Bearer ${session.access_token}`;
            }
            return headers;
          },
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      {children}
    </trpc.Provider>
  );
}
```

**Decision: URL routing**

- Option A: `BACKEND_URL/trpc` — direct to backend (faster, skips proxy, but requires CORS)
- Option B: `/api/trpc` — uses existing proxy route (proven, handles auth)
- **Recommend Option B** (`/api/trpc`) — already works, no CORS setup needed

### 1.5 Update providers.tsx

**MODIFY**: `packages/web/app/[locale]/providers.tsx`

Wrap existing tree with `TRPCProvider`:

```tsx
import { TRPCProvider } from '@/lib/trpc/trpc-provider'

export function Providers({ children }) {
  const queryClient = getQueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider>
        <AppThemeProvider>
          <SupabaseProvider>
            {children}
            ...
          </SupabaseProvider>
        </AppThemeProvider>
      </TRPCProvider>
      <ReactQueryDevtools ... />
    </QueryClientProvider>
  )
}
```

Note: `QueryClientProvider` stays outside `TRPCProvider` because tRPC uses the same QueryClient instance.

### 1.6 Verify Phase 1

- `pnpm type-check` — AppRouter type resolves
- `pnpm build` — no bundling errors
- Open any page — app works as before (no behavior change yet)

**Critical files**:

- `packages/web/lib/trpc/react.ts` (NEW)
- `packages/web/lib/trpc/trpc-provider.tsx` (NEW)
- `packages/web/app/[locale]/providers.tsx` (MODIFY)
- `packages/web/package.json` (MODIFY — new deps)

---

## Phase 2: Migrate Pipeline Admin reads (~3h)

The biggest module — 11 read-only functions + 16 consuming components.

### 2.1 Pattern: Replace manual fetch with tRPC hooks

With `@trpc/react-query`, every backend procedure automatically gets a typesafe hook:

```tsx
// Before (in component):
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
useEffect(() => {
  getStagesInfo()
    .then(setData)
    .finally(() => setLoading(false));
}, []);

// After:
import { trpc } from '@/lib/trpc/react';
const { data, isLoading } = trpc.pipelineAdmin.getStagesInfo.useQuery();
```

No manual hook files needed — the types come from `AppRouter` automatically.

### 2.2 Components to update

| Component                                                | Current SA call                | New tRPC hook                                              |
| -------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------- |
| `admin/pipeline/components/pipeline-overview.tsx`        | `getStagesInfo()`              | `trpc.pipelineAdmin.getStagesInfo.useQuery()`              |
| `admin/pipeline/components/pipeline-stats.tsx`           | `getPipelineStats()`           | `trpc.pipelineAdmin.getPipelineStats.useQuery()`           |
| `admin/pipeline/components/models-config.tsx`            | `listModelConfigs()`           | `trpc.pipelineAdmin.listModelConfigs.useQuery()`           |
| `admin/pipeline/components/model-browser.tsx`            | `listOpenRouterModels()`       | `trpc.pipelineAdmin.listOpenRouterModels.useQuery()`       |
| `admin/pipeline/components/prompts-editor.tsx`           | `listPromptTemplates()`        | `trpc.pipelineAdmin.listPromptTemplates.useQuery()`        |
| `admin/pipeline/components/settings-panel.tsx`           | `getGlobalSettings()`          | `trpc.pipelineAdmin.getGlobalSettings.useQuery()`          |
| `admin/pipeline/components/config-history-dialog.tsx`    | `getModelConfigHistory()`      | `trpc.pipelineAdmin.getModelConfigHistory.useQuery()`      |
| `admin/pipeline/components/prompt-history-dialog.tsx`    | `getPromptHistory()`           | `trpc.pipelineAdmin.getPromptHistory.useQuery()`           |
| `admin/pipeline/components/context-reserve-settings.tsx` | `listContextReserveSettings()` | `trpc.pipelineAdmin.listContextReserveSettings.useQuery()` |
| Various                                                  | `getReservePercent()`          | `trpc.pipelineAdmin.getReservePercent.useQuery()`          |
| Various                                                  | `listJudgeConfigs()`           | `trpc.pipelineAdmin.listJudgeConfigs.useQuery()`           |

### 2.3 Also migrate pipeline admin mutations

Since we have `@trpc/react-query`, mutations also get typesafe hooks:

```tsx
// Before:
const handleSave = async () => {
  await updateModelConfig(input);
  // manual refetch...
};

// After:
const utils = trpc.useUtils();
const mutation = trpc.pipelineAdmin.updateModelConfig.useMutation({
  onSuccess: () => {
    utils.pipelineAdmin.listModelConfigs.invalidate();
  },
});
```

This gives automatic cache invalidation on mutations — a key benefit.

### 2.4 Remove migrated functions from `pipeline-admin.ts`

After all components are updated, delete the 11 read + 10 mutation functions from `app/actions/pipeline-admin.ts`. File may become empty (delete it).

**Critical files**:

- `packages/web/app/actions/pipeline-admin.ts` (MODIFY → likely DELETE)
- `packages/web/app/[locale]/admin/pipeline/components/*.tsx` (~10 files MODIFY)

---

## Phase 3: Migrate Admin modules (~2h)

### 3.1 Admin Users

| Component                                | Current                  | New                                            |
| ---------------------------------------- | ------------------------ | ---------------------------------------------- |
| `admin/users/components/users-table.tsx` | `listUsersAction()`      | `trpc.admin.listUsers.useQuery()`              |
| Same                                     | `updateUserRoleAction()` | `trpc.admin.updateUserRole.useMutation()` etc. |

Remove migrated functions from `app/actions/admin-users.ts`.

### 3.2 Admin Tiers

| Component                | Current             | New                                                         |
| ------------------------ | ------------------- | ----------------------------------------------------------- |
| `admin/pricing/page.tsx` | `listTiersAction()` | `trpc.billing.getQuota.useQuery()` or appropriate procedure |

Remove migrated from `app/actions/admin-tiers.ts`.

### 3.3 Admin Logs

| Component             | Current                                       | New                                   |
| --------------------- | --------------------------------------------- | ------------------------------------- |
| Admin logs components | `listLogsAction()`, `getLogByIdAction()` etc. | `trpc.admin.listLogs.useQuery()` etc. |

Remove migrated from `app/actions/admin-logs.ts`.

### 3.4 Admin History

| Component          | Current                        | New                        |
| ------------------ | ------------------------------ | -------------------------- |
| Admin history page | `getGenerationHistoryAction()` | Appropriate tRPC procedure |

Remove `app/actions/admin-history.ts` if empty.

### 3.5 Admin Generation reads

| Component                                 | Current                         | New       |
| ----------------------------------------- | ------------------------------- | --------- |
| `StageResultsPreview.tsx`                 | `getStageResults()`             | tRPC hook |
| `EditableChips.tsx` / `EditableField.tsx` | `getBlockDependenciesAction()`  | tRPC hook |
| `EditHistoryPanel.tsx`                    | `getEditHistoryAction()`        | tRPC hook |
| `useCascadeStageDelete.ts`                | `checkDownstreamStagesAction()` | tRPC hook |

Keep mutation functions in `admin-generation.ts` that use `revalidatePath()`.

**Critical files**:

- `packages/web/app/actions/admin-users.ts` (MODIFY)
- `packages/web/app/actions/admin-tiers.ts` (MODIFY)
- `packages/web/app/actions/admin-logs.ts` (MODIFY)
- `packages/web/app/actions/admin-history.ts` (MODIFY → likely DELETE)
- `packages/web/app/actions/admin-generation.ts` (MODIFY — remove reads only)
- Multiple component files in `admin/` directories

---

## Phase 4: Migrate Enrichments + Lessons (~2h)

### 4.1 Enrichment reads

**Note**: `enrichment-actions.ts` uses **direct Supabase** (not tRPC) for some functions. But the backend has `enrichment` tRPC router with all these procedures. Migrate to tRPC hooks.

| Component                     | Current                             | New                                      |
| ----------------------------- | ----------------------------------- | ---------------------------------------- |
| `stage7/views/DetailView.tsx` | `getEnrichment()` (Supabase)        | `trpc.enrichment.getByLesson.useQuery()` |
| `course-viewer-enhanced.tsx`  | `getLessonEnrichments()` (Supabase) | `trpc.enrichment.getByLesson.useQuery()` |

Also migrate enrichment mutations: `createEnrichment`, `deleteEnrichment`, `regenerateEnrichment`, `reorderEnrichments`.

### 4.2 Lesson reads

| Component               | Current                 | New       |
| ----------------------- | ----------------------- | --------- |
| `NodeDetailsDrawer.tsx` | `exportModuleLessons()` | tRPC hook |

### 4.3 Clarifying module

**MODIFY** existing `packages/web/lib/trpc/client.ts`:

- Replace all 704 lines of custom fetch+hooks with tRPC native hooks
- Or keep as-is and let components gradually migrate to `trpc.clarifying.getQuestions.useQuery()` etc.
- **Recommend**: Replace entirely — the new tRPC setup covers everything clarifying does

**Critical files**:

- `packages/web/app/actions/enrichment-actions.ts` (MODIFY)
- `packages/web/app/actions/lesson-actions.ts` (MODIFY)
- `packages/web/lib/trpc/client.ts` (REPLACE or DEPRECATE)
- Component files consuming enrichments/lessons/clarifying

---

## Phase 5: Migrate Benchmarks (~1.5h)

### Special case: Benchmarks use direct Supabase, NOT tRPC

The backend doesn't have a `benchmarks` tRPC router. These functions query Supabase directly.

**Approach**: Use TanStack Query `queryOptions` pattern (not tRPC hooks):

**NEW**: `packages/web/lib/queries/benchmarks.ts`

```typescript
import { queryOptions } from '@tanstack/react-query'
import {
  getBenchmarksAction, getTopModelsAction, ...
} from '@/app/actions/benchmarks'

export const benchmarkQueries = {
  all: () => queryOptions({
    queryKey: ['benchmarks'],
    queryFn: getBenchmarksAction,
  }),
  topModels: () => queryOptions({
    queryKey: ['benchmarks', 'topModels'],
    queryFn: getTopModelsAction,
  }),
  // ... etc for all 9 functions
}
```

Components use: `useQuery(benchmarkQueries.topModels())`

Server Actions remain (they use server-side Supabase). Hooks wrap them.

### Components to update

- `benchmarks/components/models-ranking-table.tsx`
- `benchmarks/components/benchmarks-client.tsx`
- `benchmarks/components/sample-content-viewer.tsx`
- `benchmarks/components/top-models-cards.tsx`
- `benchmarks/page.tsx`

**Critical files**:

- `packages/web/lib/queries/benchmarks.ts` (NEW)
- `packages/web/app/[locale]/benchmarks/components/*.tsx` (~5 files MODIFY)
- `packages/web/app/actions/benchmarks.ts` (KEEP — still used as queryFn)

---

## Phase 6: Server-side tRPC caller for remaining SAs (~1.5h)

### Remaining mutations that use `revalidatePath()`

These MUST stay as Server Actions. But we can type-safe the fetch:

**NEW**: `packages/web/lib/trpc/server-caller.ts`

```typescript
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@megacampus/course-gen-platform/src/server/app-router';
import { getBackendAuthHeaders, TRPC_URL } from '@/lib/auth';

export async function getServerTrpcClient() {
  const headers = await getBackendAuthHeaders();
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: TRPC_URL,
        headers: () => headers,
      }),
    ],
  });
}
```

Then in Server Actions:

```typescript
// Before:
const res = await fetch(`${TRPC_URL}/pipelineAdmin.updateModelConfig`, {
  method: 'POST',
  headers,
  body: JSON.stringify(input),
});

// After:
const client = await getServerTrpcClient();
const result = await client.pipelineAdmin.updateModelConfig.mutate(input);
```

Full type safety, no manual URL/parsing.

### Files to refactor

- `app/actions/admin-generation.ts` — remaining mutations (~8)
- `app/actions/courses.ts` — `triggerCourseGeneration`
- `app/actions/refinement.ts` — `sendChatMessage`, `applyProposal`
- `app/actions/document-actions.ts` — `retryDocument`, `retryFailedDocuments`
- `app/actions/lesson-actions.ts` — remaining mutations (~6)

**Critical files**:

- `packages/web/lib/trpc/server-caller.ts` (NEW)
- Multiple `app/actions/*.ts` files (MODIFY)

---

## Phase 7: Cleanup + Final Verification (~1h)

1. Delete `packages/web/lib/trpc/client.ts` (replaced by `@trpc/react-query`)
2. Delete empty Server Action files
3. Remove unused types/imports
4. Run full verification:

```bash
pnpm type-check          # All types resolve
pnpm build               # Build succeeds
pnpm --filter @megacampus/web test  # Tests pass
```

5. Manual smoke test:
   - [ ] Pipeline admin panel loads (stages, stats, configs, prompts)
   - [ ] Benchmarks page loads with data
   - [ ] Admin users/tiers pages work
   - [ ] Course generation flow works
   - [ ] Clarifying questions flow works
   - [ ] Enrichments (Stage 7) display and create
   - [ ] Lesson actions work

---

## Risk Mitigation

| Risk                                     | Mitigation                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| AppRouter type import bloats web bundle  | `import type` — TypeScript-only, zero runtime                                  |
| httpBatchLink changes request format     | Using `/api/trpc` proxy; tRPC proxy route already handles standard tRPC format |
| Component regressions                    | Each phase is independently deployable; revert per-phase                       |
| Auth flow differences                    | `httpBatchLink.headers()` uses same Supabase session as current client.ts      |
| Server Actions with revalidatePath break | They stay as SA; only query functions are migrated                             |

## Rollback

Each phase commits separately. If Phase N fails:

- Revert Phase N commit
- All prior phases remain working
- Phase 0 (delete SDK) is independent and risk-free

---

## Summary

| Phase                    | Effort     | Files Changed           | Key Deliverable                           |
| ------------------------ | ---------- | ----------------------- | ----------------------------------------- |
| 0: Delete SDK            | 30min      | ~3 deleted, ~2 modified | Clean unused package                      |
| 1: Install + Setup       | 2h         | 4 new/modified          | `createTRPCReact<AppRouter>()` working    |
| 2: Pipeline Admin        | 3h         | ~12 modified            | All pipeline admin on tRPC hooks          |
| 3: Admin modules         | 2h         | ~10 modified            | Users/tiers/logs/history on hooks         |
| 4: Enrichments + Lessons | 2h         | ~8 modified             | Enrichment/lesson queries on hooks        |
| 5: Benchmarks            | 1.5h       | ~6 new/modified         | queryOptions pattern for Supabase queries |
| 6: Server caller         | 1.5h       | ~8 modified             | Type-safe server-side tRPC client         |
| 7: Cleanup               | 1h         | ~5 deleted              | Remove dead code                          |
| **Total**                | **~13.5h** | **~55 files**           |                                           |
