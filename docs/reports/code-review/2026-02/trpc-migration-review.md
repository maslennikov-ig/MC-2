# Code Review: tRPC Migration (mc2-tlcj)

**Commit**: `ec8c8b6e refactor: migrate tRPC architecture to @trpc/react-query with typesafe hooks`
**Date**: 2026-02-08
**Reviewer**: Claude Code (automated)
**Files Changed**: 62 (+1,214 / -5,988 lines)
**Context7 Validation**: @trpc/react-query v11 patterns verified against `/trpc/trpc` docs

---

## Summary

This migration replaces ~40 React components' manual Server Action data-fetching patterns (fetch + useState + useEffect) with @trpc/react-query typesafe hooks and @tanstack/react-query's `queryOptions` pattern for benchmarks. The migration also:

- Installs `@trpc/react-query` v11.9.0 and configures `TRPCProvider` with `httpBatchLink` and Supabase JWT auth
- Creates a server-side tRPC caller for Server Actions that still need `revalidatePath`
- Deletes the unused `trpc-client-sdk` package (2,776 LOC removed)
- Deletes the old custom tRPC client (`client.ts`, 704 LOC)
- Creates `queryOptions` pattern for benchmarks (direct Supabase queries)

**Overall Assessment**: This is a well-executed, high-quality migration. The code demonstrates strong understanding of tRPC v11 patterns, proper cache invalidation, good error handling, and correct React Query usage. The net deletion of ~4,774 lines while maintaining the same functionality is impressive. There are a few issues to address, detailed below.

---

## Critical Issues (Must Fix)

### 1. `getSession()` deprecation warning in TRPCProvider (Supabase v2.x)

**File**: `/home/me/code/mc2/packages/web/lib/trpc/trpc-provider.tsx`, line 29
**Severity**: Critical

`supabase.auth.getSession()` reads from local storage and may return stale/tampered session data. Supabase recommends `getUser()` for security-critical operations like generating auth headers. While `getSession()` is appropriate for reading the access_token (since the backend validates the JWT independently), this should be explicitly documented to prevent future confusion or accidental misuse.

```typescript
// Current (line 27-29)
const {
  data: { session },
} = await supabase.auth.getSession();
```

**Recommendation**: This is technically acceptable because the access_token is validated server-side by the tRPC backend. However, add a comment explaining this security consideration:

```typescript
// getSession() reads from local storage which is sufficient here
// because the backend independently validates the JWT token.
// Do NOT use this session for client-side auth decisions.
const {
  data: { session },
} = await supabase.auth.getSession();
```

### 2. Server-side tRPC client creates a new client per call

**File**: `/home/me/code/mc2/packages/web/lib/trpc/server-caller.ts`, lines 22-33
**Severity**: Critical (Performance)

`getServerTrpcClient()` creates a brand-new `createTRPCClient` instance on every invocation. In the pricing page (`/admin/pricing/page.tsx`, line 15), this is called once per request which is fine. However, if multiple server actions call it in a single request, each gets a separate client instance with no connection reuse.

```typescript
// Current: creates new client every call
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

**Recommendation**: This is acceptable for now since server-side calls are infrequent (only pricing page uses it). But document the limitation, and consider caching per-request if usage grows:

```typescript
/**
 * NOTE: Creates a new client per call. Acceptable for low-frequency
 * server-side usage. If multiple calls per request become common,
 * consider request-scoped caching via AsyncLocalStorage.
 */
```

---

## Important Issues (Should Fix)

### 3. Multiple `as any` casts bypass type safety in pipeline admin components

**Files**:

- `/home/me/code/mc2/packages/web/app/[locale]/admin/pipeline/components/config-history-dialog.tsx`, lines 79, 121
- `/home/me/code/mc2/packages/web/app/[locale]/admin/pipeline/components/prompt-history-dialog.tsx`, lines 81, 123

**Severity**: Important

Four `as any` casts are used for `phaseName` and `stage` parameters in tRPC queries and mutations. These suppress TypeScript's type checking and could mask input validation issues.

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
phaseName: phaseName as any,
```

**Recommendation**: Create proper type unions that match the tRPC router's expected input types:

```typescript
// If the tRPC router expects specific phase names:
phaseName: phaseName as PhaseName,  // Import from shared-types or router definition
```

If the types genuinely don't match, this indicates a type mismatch between the frontend prop types and the backend router input types that should be resolved at the source.

### 4. `submitAnswerMutation` uses `as` cast to bypass type mismatch

**File**: `/home/me/code/mc2/packages/web/components/generation-graph/panels/clarifying/ClarifyingPanel.tsx`, line 401
**Severity**: Important

```typescript
.mutateAsync(payload as Parameters<typeof submitAnswerMutation.mutateAsync>[0])
```

The comment explains "Cast needed: backend accepts both single answer and multi_choice arrays, but SubmitAnswerInput only types single". This indicates the tRPC input type is incomplete.

**Recommendation**: Fix the backend `SubmitAnswerInput` Zod schema to properly accept the union type, then remove the cast. This is a type-safety gap that could cause runtime errors if the backend changes.

### 5. `questionsData` type assertion with `as unknown as ExtendedQuestionFromAPI`

**File**: `/home/me/code/mc2/packages/web/components/generation-graph/panels/clarifying/ClarifyingPanel.tsx`, line 231
**Severity**: Important

```typescript
const q = rawQ as unknown as ExtendedQuestionFromAPI;
```

The double cast (`as unknown as`) is a strong code smell. The `ExtendedQuestionFromAPI` interface defines fields not yet in generated types.

**Recommendation**: Update the generated types to include the new fields (`question_type`, etc.), then remove this cast. Until then, use a Zod schema to validate the shape at runtime:

```typescript
const q = ExtendedQuestionSchema.parse(rawQ);
```

### 6. `editsData` cast without type validation in EditHistoryPanel

**File**: `/home/me/code/mc2/packages/web/components/generation-graph/panels/output/EditHistoryPanel.tsx`, line 153
**Severity**: Important

```typescript
const edits: CourseEdit[] = (editsData as CourseEdit[] | undefined) ?? [];
```

The tRPC query returns typed data, so casting it to a local interface is fragile. If the backend return type changes, this cast silently hides the mismatch.

**Recommendation**: Either use the tRPC-inferred output type directly, or validate with Zod:

```typescript
// Option 1: Use inferred type
type CourseEdit = RouterOutputs['generation']['getEditHistory'][number];

// Option 2: Keep local type but remove cast
const edits = editsData ?? [];
```

### 7. Missing error handling in `handleExport` (export-import panel)

**File**: `/home/me/code/mc2/packages/web/app/[locale]/admin/pipeline/components/export-import.tsx`
**Severity**: Important

The `handleExport` function uses `utils.pipelineAdmin.exportConfiguration.fetch()` but the error is caught with a generic `err instanceof Error` pattern. The tRPC error type (`TRPCClientError`) contains additional structured information that should be used.

**Recommendation**: Use the TRPCClientError type for more informative error messages:

```typescript
} catch (err) {
  if (err instanceof TRPCClientError) {
    toast.error(err.message)
  } else {
    toast.error('Export failed')
  }
}
```

### 8. Provider nesting order differs from tRPC v11 documentation

**File**: `/home/me/code/mc2/packages/web/app/[locale]/providers.tsx`, lines 16-29
**Severity**: Important

Per the official tRPC v11 docs and Context7 documentation, the canonical nesting order is:

```tsx
<trpc.Provider client={trpcClient} queryClient={queryClient}>
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
</trpc.Provider>
```

The current code nests `TRPCProvider` **inside** `QueryClientProvider`:

```tsx
<QueryClientProvider client={queryClient}>
  <TRPCProvider>
    {' '}
    {/* TRPCProvider wraps trpc.Provider inside */}
    {children}
  </TRPCProvider>
</QueryClientProvider>
```

This works because `TRPCProvider` accesses the same `queryClient` singleton via `getQueryClient()`. However, it creates a subtle coupling: `TRPCProvider` independently calls `getQueryClient()` (line 19 of `trpc-provider.tsx`) instead of receiving it from the parent `QueryClientProvider` context.

**Recommendation**: This pattern works but is fragile. Document why both `QueryClientProvider` and `TRPCProvider` independently call `getQueryClient()`, or restructure so that `TRPCProvider` wraps `QueryClientProvider` as per the official pattern. Currently both access the same singleton, so this works, but it's not obvious.

### 9. Dynamic import of `getModelScenarioResultsAction` inside event handler

**File**: `/home/me/code/mc2/packages/web/app/[locale]/benchmarks/components/models-ranking-table.tsx`, line 108
**Severity**: Important

```typescript
const { getModelScenarioResultsAction } = await import('@/app/actions/benchmarks');
```

Dynamic `import()` inside a click handler means the module is fetched on-demand from the server. This adds latency to the user interaction and the import path is a string, not type-checked at build time (could break during refactoring).

**Recommendation**: Either use a tRPC query like the other benchmark queries, or import statically. If the intent is code-splitting, the Server Action will be bundled by Next.js anyway; the dynamic import provides no benefit here.

---

## Minor Issues (Nice to Fix)

### 10. Unused `XCircle` import removed but `Loader2` still imported when no longer needed

**File**: `/home/me/code/mc2/packages/web/app/[locale]/admin/pipeline/components/api-keys-panel.tsx`
**Severity**: Minor

Post-migration cleanup of unused imports was mostly done well, but a sweep for any remaining unused imports in all changed files would be beneficial. Tree-shaking handles this at build time, but clean imports improve readability.

### 11. `placeholderData: (prev) => prev` used in several queries for pagination

**Files**:

- `/home/me/code/mc2/packages/web/components/generation-monitoring/history-table.tsx`, line 216
- `/home/me/code/mc2/packages/web/app/[locale]/admin/users/components/users-table.tsx`

**Severity**: Minor

The pattern `placeholderData: (prev) => prev` is the v5 equivalent of `keepPreviousData` from v4. It works correctly. However, TanStack Query v5 exports `keepPreviousData` as a named function for exactly this purpose:

```typescript
import { keepPreviousData } from '@tanstack/react-query';

// Cleaner:
{
  placeholderData: keepPreviousData;
}
```

### 12. Inconsistent cache invalidation patterns

**Files**: Multiple admin components
**Severity**: Minor

Some components invalidate the cache after mutations using the `onSuccess` callback on the mutation (good pattern), while others use separate `handleRoleUpdate` / `handleActivationToggle` callbacks that call `utils.admin.listUsers.invalidate()`.

For example, `ActivationSwitch` does both:

1. `onSuccess` in the mutation already calls `void utils.admin.listUsers.invalidate()`
2. AND the parent `UsersTable` passes `onToggled` which also calls `void utils.admin.listUsers.invalidate()`

This double-invalidation is harmless (React Query deduplicates) but adds unnecessary complexity.

**Recommendation**: Choose one pattern consistently. Prefer invalidation in the mutation's `onSuccess` callback (co-located with the mutation) and remove redundant parent callbacks.

### 13. `confettiStorageKey` not used consistently

**File**: `/home/me/code/mc2/packages/web/components/generation-graph/panels/clarifying/ClarifyingPanel.tsx`, lines 299, 348
**Severity**: Minor

`confettiStorageKey` is defined at line 299 but line 348 reconstructs the key inline:

```typescript
// Line 299
const confettiStorageKey = `clarifying_confetti_shown_${courseId}`;

// Line 348 - should use confettiStorageKey instead
localStorage.setItem(`clarifying_confetti_shown_${courseId}`, 'true');
```

### 14. `handleDeleteConfirm` includes `deleteMutation` in useCallback deps (creates new ref on each render)

**File**: `/home/me/code/mc2/packages/web/components/generation-graph/panels/stage7/views/RootView.tsx`, line 616
**Severity**: Minor

```typescript
const handleDeleteConfirm = useCallback(() => {
  if (!deleteTarget || !courseInfo?.id) return;
  deleteMutation.mutate({ enrichmentId: deleteTarget });
}, [deleteTarget, courseInfo?.id, deleteMutation]);
```

`deleteMutation` is a new object on every render (from `useMutation`), which makes the `useCallback` effectively useless. The `.mutate` method is stable, so this is technically fine, but the dependency array is misleading.

**Recommendation**: Use `deleteMutation.mutate` as the dependency instead, or remove the `useCallback` wrapper since it provides no memoization benefit.

### 15. `handleRevert` declared as sync but invokes no async operations

**File**: `/home/me/code/mc2/packages/web/app/[locale]/admin/pipeline/components/config-history-dialog.tsx`, line 111
**Severity**: Minor

```typescript
const handleRevert = (version: number) => {
  setRevertTargetVersion(version);
  setRevertDialogOpen(true);
};
```

Clean and correct. This is actually well-done -- the migration properly converted async handlers to sync when the async operation moved into the mutation. Noted as positive.

### 16. `query-client.ts` default staleTime of 60s may cause stale tRPC data

**File**: `/home/me/code/mc2/packages/web/lib/query-client.ts`, line 24
**Severity**: Minor

The default `staleTime: 60 * 1000` (60 seconds) means tRPC query data is considered fresh for 60 seconds. This could cause issues if users expect immediate data freshness after mutations. However, the explicit `staleTime: 0` and `staleTime: Infinity` overrides in specific queries (ClarifyingPanel, GraphView) demonstrate awareness of this.

**Recommendation**: No action needed, but document that the 60s default is intentional and that queries needing fresher data should override.

---

## Positive Observations

### Architecture

1. **Clean separation of concerns**: `react.ts` (client hooks), `trpc-provider.tsx` (provider setup), `server-caller.ts` (server-side caller) -- each has a single responsibility and is well-documented.

2. **QueryClient singleton pattern**: Correctly implements the TanStack Query v5 SSR best practice with `getQueryClient()` returning a singleton in the browser and new instances on the server.

3. **Massive code reduction**: -4,774 net lines removed. The old `client.ts` (704 LOC) and entire `trpc-client-sdk` package (2,776+ LOC) are replaced by 90 LOC of clean infrastructure.

4. **Smart use of `queryOptions` factory**: The `benchmarkQueries` factory in `/home/me/code/mc2/packages/web/lib/queries/benchmarks.ts` follows the exact TanStack Query v5 recommended pattern for co-locating query keys with query functions.

### tRPC Patterns

5. **Correct `useUtils()` usage**: Cache invalidation via `utils.router.procedure.invalidate()` is used consistently and correctly across all migrated components. The invalidation keys match the query keys perfectly.

6. **Proper `enabled` conditions**: Queries correctly use `enabled: false` for deferred queries (e.g., clarifying progress only fetched when clarifying is enabled) and conditional `enabled` based on state.

7. **Good `refetchInterval` pattern**: The clarifying questions polling (`refetchInterval: (query) => query.state.data?.questions?.length ? false : 2000`) is an elegant pattern that stops polling when data arrives.

8. **Correct mutation with optimistic updates**: The `ActivationSwitch` component does optimistic updates (`setActive(checked)`) with proper rollback on error (`setActive(isActive)` in `onError`).

### Error Handling

9. **Consistent error toast pattern**: All mutations use `onError` callbacks with `toast.error()` and meaningful error messages. Error messages are user-facing and localized (Russian/English).

10. **Retry configuration**: The ClarifyingPanel mutations include sensible retry logic (`retry: 2, retryDelay: exponential`) which is appropriate for network-sensitive operations.

### Security

11. **Auth token handling**: JWT is correctly extracted from Supabase session and passed via `Authorization: Bearer` header. No tokens are exposed in URLs or logged.

12. **Server-side auth**: The server-caller correctly uses `getBackendAuthHeaders()` which reads from server-side cookies (secure, HttpOnly).

### Performance

13. **Selective cache invalidation**: Instead of invalidating all queries after mutations, each mutation only invalidates the specific queries that could be affected (e.g., `utils.clarifying.getQuestions.invalidate({ courseId })`).

14. **`staleTime: Infinity` for immutable data**: Used correctly for clarifying config (`isEnabled`) which doesn't change during a session.

15. **`refetchOnWindowFocus: false`** applied to queries where window focus refetch would cause rate limiting or unnecessary API calls.

### Code Quality

16. **Well-documented**: JSDoc comments on all new functions explain purpose, usage patterns, and architectural decisions.

17. **Consistent patterns**: All admin components follow the same mutation pattern (define mutation with `onSuccess`/`onError`, use `.mutate()` or `.mutateAsync()`, derive loading state from `mutation.isPending`).

18. **Clean deletion of old code**: Server Actions files (`admin-generation.ts`, `admin-history.ts`, `admin-tiers.ts`, `admin-users.ts`, `pipeline-admin.ts`) are fully deleted, not left as dead code.

---

## File-by-File Summary

| File                         | Status             | Notes                                               |
| ---------------------------- | ------------------ | --------------------------------------------------- |
| `lib/trpc/react.ts`          | Clean              | Minimal, correct `createTRPCReact` usage            |
| `lib/trpc/trpc-provider.tsx` | Issue #1           | getSession() deprecation concern                    |
| `lib/trpc/server-caller.ts`  | Issue #2           | New client per call, acceptable for now             |
| `lib/queries/benchmarks.ts`  | Clean              | Excellent queryOptions factory pattern              |
| `providers.tsx`              | Issue #8           | Provider nesting order, works but fragile           |
| `ClarifyingPanel.tsx`        | Issues #4, #5, #13 | Type casts, good overall migration                  |
| `GraphView.tsx`              | Clean              | Large file, tRPC integration is minimal and correct |
| `NodeDetailsDrawer.tsx`      | Clean              | `utils.fetch` for export is correct pattern         |
| `EditableField.tsx`          | Clean              | `utils.fetch` for cascade deps is correct           |
| `EditableChips.tsx`          | Clean              | Same pattern as EditableField                       |
| `useCascadeStageDelete.ts`   | Clean              | Proper `utils.fetch` for imperative queries         |
| `DetailView.tsx` (stage7)    | Clean              | Good mutation patterns                              |
| `RootView.tsx` (stage7)      | Issue #14          | Minor useCallback deps issue                        |
| `history-table.tsx`          | Issue #11          | Minor: use keepPreviousData import                  |
| `EditHistoryPanel.tsx`       | Issue #6           | Type cast on query result                           |
| Admin pipeline (16 files)    | Issues #3, #7      | `as any` casts, good mutation patterns              |
| Admin users (4 files)        | Issue #12          | Double invalidation, good optimistic updates        |
| `tier-edit-dialog.tsx`       | Clean              | Clean mutation with proper validation               |
| `pricing/page.tsx`           | Clean              | Server-side tRPC caller usage is correct            |
| Benchmark components         | Issue #9           | Dynamic import in handler                           |

---

## Validation Results

Not run as part of this review (code review only, no build/test execution requested). Recommended before merge:

```bash
pnpm type-check
pnpm build
pnpm --filter course-gen-platform test
```

---

## Next Steps

### Before Merge

1. **Fix Issue #1**: Add security comment to `getSession()` usage in TRPCProvider
2. **Fix Issue #3**: Replace `as any` casts with proper type unions in pipeline admin dialogs
3. **Fix Issue #4**: Update backend `SubmitAnswerInput` to accept union type

### After Merge (Technical Debt)

4. **Fix Issue #5**: Update generated types to include `question_type` field
5. **Fix Issue #6**: Remove type cast in EditHistoryPanel
6. **Fix Issue #9**: Replace dynamic import with static import or tRPC query
7. **Fix Issue #12**: Consolidate double-invalidation in admin user components
8. Consider migrating remaining Server Actions (lesson-actions, document-actions, enrichment-actions) to tRPC in a follow-up PR

---

**Review complete.** The migration is high-quality with strong adherence to tRPC v11 and TanStack Query v5 best practices. The critical issues are minor in impact and relate primarily to documentation and type safety rather than functional bugs.
