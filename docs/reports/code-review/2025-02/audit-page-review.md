# Code Review: Generation Trace Audit Page

**Date**: 2026-02-20
**Reviewer**: Code Review Agent (claude-sonnet-4-6)
**Scope**: Generation Trace Audit page — backend tRPC procedures + all frontend components
**Context7 Libraries Checked**: @tanstack/react-table v8, tRPC v11

---

## Files Reviewed

| File                                                                                             | Role                            |
| ------------------------------------------------------------------------------------------------ | ------------------------------- |
| `packages/course-gen-platform/src/server/routers/admin/generation-monitoring.ts` (lines 456–663) | Backend — 3 new tRPC procedures |
| `packages/web/app/[locale]/admin/generation/[courseId]/audit/page.tsx`                           | Server component route          |
| `packages/web/components/generation-audit/audit-client.tsx`                                      | Client orchestrator             |
| `packages/web/components/generation-audit/audit-summary.tsx`                                     | Summary cards                   |
| `packages/web/components/generation-audit/audit-filter-bar.tsx`                                  | Filter controls                 |
| `packages/web/components/generation-audit/audit-table.tsx`                                       | Traces table                    |
| `packages/web/components/generation-audit/audit-detail-sheet.tsx`                                | Detail side panel               |
| `packages/web/components/generation-monitoring/history-table.tsx`                                | Modified — Audit button         |
| `packages/web/app/[locale]/admin/generation/[courseId]/page.tsx`                                 | Modified — Audit link           |

---

## Summary

| Priority | Count |
| -------- | ----- |
| Critical | 3     |
| High     | 7     |
| Medium   | 8     |
| Low      | 6     |

---

## Critical Issues

### C1 — SQL Injection via unsanitized `.or()` / `.ilike()` in `getAuditTraces`

**File**: `packages/course-gen-platform/src/server/routers/admin/generation-monitoring.ts`
**Lines**: 618–620

**Description**: The `search` field is interpolated directly into the Supabase `.or()` filter string without any sanitization:

```typescript
// Current — VULNERABLE
if (input.search) {
  query = query.or(`phase.ilike.%${input.search}%,step_name.ilike.%${input.search}%`);
}
```

Supabase's `.or()` method builds a raw PostgREST filter string. A crafted input such as `%,id.eq.00000000-0000-0000-0000-000000000000` or `%'),id.eq.(select` can break out of the intended filter and match rows the user is not permitted to see, or in pathological edge cases, trigger server-side errors that leak schema information.

The same pattern exists in `getGenerationHistory` (line 381) but is less critical because that procedure only queries its own admin data.

**Severity**: CRITICAL — admin-only endpoint, but the pattern establishes a dangerous precedent and could be copy-pasted to user-facing endpoints.

**Suggested Fix**: Strip or reject characters that are meaningful in PostgREST filter expressions before interpolation, or use separate parameterized column filters instead of `.or()`:

```typescript
// Option 1 — Sanitize by allowing only safe characters
const safeSearch = input.search.replace(/[%_,()'"\\]/g, '');
if (safeSearch.length > 0) {
  query = query.or(`phase.ilike.%${safeSearch}%,step_name.ilike.%${safeSearch}%`);
}

// Option 2 — Use separate ilike filters with OR logic via Supabase API (preferred)
// Supabase JS v2 does not expose OR of ilike natively without the string form,
// so Option 1 is the pragmatic fix. Document that `search` is a prefix/substring
// match only on safe characters.
```

Zod validation already caps the string at an implicit default, but does not constrain characters. Add a Zod refinement:

```typescript
search: z.string().max(100).regex(/^[a-zA-Z0-9_\-. ]*$/, 'Invalid search characters').optional(),
```

---

### C2 — `getAuditSummary` fetches ALL traces into Node.js memory (no LIMIT)

**File**: `packages/course-gen-platform/src/server/routers/admin/generation-monitoring.ts`
**Lines**: 465–481, 484–571

**Description**: `getAuditSummary` fetches **every row** from `generation_trace` for a course with no `LIMIT`:

```typescript
supabase
  .from('generation_trace')
  .select(
    'id, stage, phase, step_name, model_used, lesson_id, tokens_used, cost_usd, duration_ms, error_data, retry_attempt, quality_score, created_at'
  )
  .eq('course_id', input.courseId)
  .order('created_at', { ascending: true });
// NO .limit() call
```

A large course can easily accumulate 5,000–50,000+ trace rows (one per LLM call across every lesson). Fetching all of them:

- Allocates large objects in the tRPC server process, risking OOM under concurrent requests.
- Sends the full dataset over the network from Supabase to the Node process.
- Increases response time to multiple seconds.

All aggregations (totals, stage breakdown, model breakdown, lesson breakdown) are computed in JavaScript after the fetch. None require the full row set to be in memory simultaneously — they can all be expressed as SQL GROUP BY queries.

**Suggested Fix**: Move all aggregation to the database using `GROUP BY` queries. Use the Supabase RPC (stored function) or multiple targeted aggregate queries:

```typescript
// Replace the full-fetch + JS aggregation with parallel aggregate queries:
const [totalsRes, stageGroupRes, modelGroupRes, lessonGroupRes] = await Promise.all([
  supabase
    .from('generation_trace')
    .select('id.count(), tokens_used.sum(), cost_usd.sum()') // or use rpc
    .eq('course_id', input.courseId),
  // ... etc
]);
```

For immediate remediation, add a hard limit and document it:

```typescript
.limit(10_000) // Guard against extreme cases; remove when SQL aggregation is implemented
```

---

### C3 — `getAuditTraceDetail` missing authorization check — any `traceId` can be fetched

**File**: `packages/course-gen-platform/src/server/routers/admin/generation-monitoring.ts`
**Lines**: 643–663

**Description**: `getAuditTraceDetail` accepts a `traceId` UUID and returns the full row from `generation_trace` — including `prompt_text`, `completion_text`, `input_data`, and `output_data` — without verifying that the trace belongs to a course the caller is allowed to see:

```typescript
getAuditTraceDetail: adminProcedure
  .input(z.object({ traceId: z.string().uuid() }))
  .query(async ({ input }) => {
    const { data, error } = await supabase
      .from('generation_trace')
      .select('*')         // includes prompt_text, completion_text — potentially sensitive
      .eq('id', input.traceId)
      .single()
```

The procedure is behind `adminProcedure`, so non-admin users cannot call it. However, if an admin is managing multiple organizations, they can use this endpoint to read traces from any organization's courses by guessing or brute-forcing UUIDs. The `prompt_text` and `completion_text` fields may contain sensitive user-provided content or proprietary LLM prompts.

**Suggested Fix**: Accept `courseId` as well and add a course scoping filter:

```typescript
getAuditTraceDetail: adminProcedure
  .input(z.object({
    traceId: z.string().uuid(),
    courseId: z.string().uuid(),  // add this
  }))
  .query(async ({ input }) => {
    const { data, error } = await supabase
      .from('generation_trace')
      .select('*')
      .eq('id', input.traceId)
      .eq('course_id', input.courseId)  // scope to course
      .single()
```

Update `AuditDetailSheet` to pass `courseId` from its parent context.

---

## High Priority Issues

### H1 — Missing `placeholderData: keepPreviousData` on `tracesQuery` causes table flicker on filter/page change

**File**: `packages/web/components/generation-audit/audit-client.tsx`
**Lines**: 51–56

**Description**: The traces query has no `placeholderData` option. Every filter or page change immediately sets `isLoading: true` and empties `tracesQuery.data`, causing the table to flash the loading skeleton. The history table (`history-table.tsx` line 217) uses `keepPreviousData` correctly — the audit table does not.

As confirmed by Context7 TanStack Table docs, the canonical pattern is:

```typescript
// Correct — from TanStack official example
const dataQuery = useQuery({
  queryKey: ['data', pagination],
  queryFn: () => fetchData(pagination),
  placeholderData: keepPreviousData,
});
```

**Suggested Fix**:

```typescript
import { keepPreviousData } from '@tanstack/react-query';

const tracesQuery = trpc.admin.getAuditTraces.useQuery(
  { courseId, ...filters, limit: pageSize, offset: pageIndex * pageSize },
  { placeholderData: keepPreviousData }
);
```

---

### H2 — Client-side sorting applied to a single page of server-side data

**File**: `packages/web/components/generation-audit/audit-table.tsx`
**Lines**: 98, 286–309

**Description**: The table uses `getSortedRowModel()` for sorting but `manualPagination: true` for pagination. This creates an inconsistency: sorting is performed **client-side on the current page only** rather than globally. Clicking "Time" or "Tokens" sorts the 50 rows visible in the current page, not all traces for the course.

Context7 TanStack Table docs state:

> `manualSorting: true` — use pre-sorted row model instead of sorted row model

**Suggested Fix**: Either:

1. Add `manualSorting: true` to `useReactTable`, remove `getSortedRowModel()`, and pass sorting state as parameters to `getAuditTraces` (adding `sortBy`/`sortOrder` inputs to the tRPC procedure), OR
2. Remove the sort toggle UI from columns to avoid misleading the user.

Option 1 is preferred. If Option 2 is chosen, the sortable `ArrowUpDown` icons should be removed from the column headers.

---

### H3 — Error state missing in `AuditClient` — query errors are silently swallowed

**File**: `packages/web/components/generation-audit/audit-client.tsx`
**Lines**: 50–56

**Description**: Neither `summaryQuery` nor `tracesQuery` error states are handled. If either query fails (network error, Supabase down, server error), the component renders `AuditSummary` with `data={undefined}` which returns `null`, and `AuditTable` with an empty array — the user sees a blank page with no feedback.

**Suggested Fix**:

```typescript
if (summaryQuery.error) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-2 text-red-500">
      <AlertTriangle className="h-8 w-8" />
      <p className="font-medium">Failed to load audit data</p>
      <p className="text-sm text-muted-foreground">{summaryQuery.error.message}</p>
    </div>
  )
}
```

Add a similar guard for `tracesQuery.error` in the table section.

---

### H4 — `computeCourseDuration` uses `Date.now()` for in-progress courses; duration grows stale

**File**: `packages/web/components/generation-audit/audit-client.tsx`
**Lines**: 27–42

**Description**: When `completedAt` is null (generation still running), the duration is computed once at render time using `Date.now()`. The displayed duration will not update unless the component re-renders from another state change (e.g. a filter change). For a course running for several minutes, the duration card could show a value that is minutes out of date.

```typescript
const end = completedAt ? new Date(completedAt).getTime() : Date.now();
// ^ computed once at useMemo evaluation time, never updates
```

**Suggested Fix**: Use a `useInterval`/`setInterval` approach for live courses, or explicitly document that duration is a snapshot. A simple `useEffect` with a 30-second refresh interval on the summary query would also fix this:

```typescript
summaryQuery = trpc.admin.getAuditSummary.useQuery(
  { courseId },
  { refetchInterval: isGenerationComplete ? false : 30_000 }
);
```

---

### H5 — `getAuditTraceDetail` returns `select('*')` — exposes all columns including large text fields via tRPC serialization

**File**: `packages/course-gen-platform/src/server/routers/admin/generation-monitoring.ts`
**Lines**: 648–652

**Description**: Using `select('*')` returns every column, including potentially very large `prompt_text` and `completion_text` fields. If these fields contain full LLM prompts/completions, individual response payloads could be many KB to MB. This increases:

- Serialization time in the tRPC server
- Network transfer
- Memory pressure in the browser

The `TraceDetail` interface in `audit-detail-sheet.tsx` (lines 29–48) already defines the exact fields needed. The backend should match this.

**Suggested Fix**: Enumerate the columns explicitly:

```typescript
.select('id, stage, phase, step_name, model_used, tokens_used, cost_usd, duration_ms, quality_score, temperature, retry_attempt, was_cached, error_data, input_data, output_data, prompt_text, completion_text, created_at')
```

---

### H6 — `AuditDetailSheet` uses non-null assertion `traceId!` while `enabled` guard can race

**File**: `packages/web/components/generation-audit/audit-detail-sheet.tsx`
**Lines**: 105–108

**Description**: The non-null assertion `traceId!` is used to satisfy TypeScript, but the actual guard is the `enabled: open && !!traceId` option. If `open` becomes `true` before `traceId` is set (e.g. due to a state update ordering issue), the query fires with an invalid input. The non-null assertion also suppresses TypeScript's safety check without a runtime guard.

```typescript
const { data: rawTrace, isLoading } = trpc.admin.getAuditTraceDetail.useQuery(
  { traceId: traceId! }, // Non-null assertion with no runtime guard
  { enabled: open && !!traceId }
);
```

Additionally, with tRPC v11's React Query v5 integration, `traceId!` will be evaluated even when `enabled: false` — it just won't fire the query — but Zod on the server expects a UUID. A null/undefined value passed after the `!` assertion will cause a TypeScript type lie.

**Suggested Fix**: Use a conditional query pattern or a separate component that is only rendered when `traceId` is non-null:

```typescript
// Option: render a non-null variant only when traceId exists
<Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
  <SheetContent>
    {traceId ? <TraceDetailContent traceId={traceId} /> : null}
  </SheetContent>
</Sheet>
```

Where `TraceDetailContent` accepts `traceId: string` (non-optional) and calls the query unconditionally.

---

### H7 — `AuditTable` re-creates `columns` definition when `lessonTitleMap` reference changes — expensive on every filter refetch

**File**: `packages/web/components/generation-audit/audit-table.tsx`
**Lines**: 100–283

**Description**: `columns` is memoized with `[lessonTitleMap]` as the dependency. `lessonTitleMap` is constructed in `audit-client.tsx` with `useMemo(() => new Map(...), [summaryQuery.data])`. Every time `summaryQuery` data reference changes (even to identical content), a new `Map` is created, which invalidates the `columns` memo and causes all column definitions to be rebuilt. Since the column definitions create many closure functions, this is not free.

The `summaryQuery` can re-fetch on window focus or network reconnect, causing spurious column rebuilds even when no data changed.

**Suggested Fix**: Stabilize the `lessonTitleMap` reference with deep equality or use a plain object instead of a `Map` (which does not do structural equality):

```typescript
// In audit-client.tsx: use a plain record to make shallow comparison possible
const lessonTitleMap = useMemo(() => {
  const lessons = summaryQuery.data?.filterOptions?.lessons ?? [];
  return Object.fromEntries(lessons.map(l => [l.id, l.title]));
}, [summaryQuery.data?.filterOptions?.lessons]);
```

Change `AuditTable` prop type to `Record<string, string>` and update the lookup accordingly.

---

## Medium Priority Issues

### M1 — `getAuditSummary` lesson breakdown is hardcoded to `stage_6` only

**File**: `packages/course-gen-platform/src/server/routers/admin/generation-monitoring.ts`
**Lines**: 530–551

**Description**: The per-lesson breakdown filters to `t.stage === 'stage_6'` only. Traces from other stages that have a `lesson_id` (possible in future stages or existing edge cases) are silently excluded from the lesson breakdown without explanation.

```typescript
const lessonTraces = traces.filter(t => t.lesson_id && t.stage === 'stage_6');
```

**Suggested Fix**: Include all traces with a non-null `lesson_id` (drop the stage filter), or make the stage filter configurable. Add a comment explaining the intentional scope limitation if stage_6-only is deliberate.

---

### M2 — `filterOptions.lessons` in `getAuditSummary` returns ALL lessons for the course, not just those with traces

**File**: `packages/course-gen-platform/src/server/routers/admin/generation-monitoring.ts`
**Lines**: 477–480, 570

**Description**: The `lessons` filter option is built from a separate `lessons` table query, returning all lessons for the course regardless of whether they have any associated traces. The lesson filter dropdown will show lessons with no data, leading to confusing empty results when selected.

**Suggested Fix**: Build the lesson list from actual trace data (lessons with at least one trace), not from the `lessons` table. Replace the separate `lessons` query with:

```typescript
const lessons = Array.from(lessonAggMap.entries()).map(([id]) => ({
  id,
  title: lessonMap.get(id) || id,
}));
```

Keep the `lessonMap` lookup (from the DB query) for title resolution but use it only as a name lookup, not as the source of truth for which lessons appear in the filter.

---

### M3 — `AuditFilterBar` search fires a new tRPC request on every keystroke (no debounce)

**File**: `packages/web/components/generation-audit/audit-filter-bar.tsx`
**Lines**: 45–53
**File**: `packages/web/components/generation-audit/audit-client.tsx`
**Lines**: 51–56

**Description**: The search input in `AuditFilterBar` calls `onFilterChange` on every `onChange` event, which immediately updates `filters` in `AuditClient`, triggering a new `getAuditTraces` query on every keystroke. Contrast this with `history-table.tsx` (lines 193–199) which debounces the filter by 300ms.

```typescript
// AuditFilterBar — no debounce
const handleSearchChange = useCallback(
  (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilterChange({ ...filters, search: e.target.value || undefined });
  },
  [filters, onFilterChange]
);
```

**Suggested Fix**: Apply debouncing either inside `AuditFilterBar` (using `useEffect` + `setTimeout`) or in `AuditClient` by splitting the `search` filter state into an immediate display value and a debounced query value:

```typescript
// In AuditClient
const [searchInput, setSearchInput] = useState('');
const [debouncedSearch, setDebouncedSearch] = useState('');

useEffect(() => {
  const t = setTimeout(() => setDebouncedSearch(searchInput), 300);
  return () => clearTimeout(t);
}, [searchInput]);

// Use debouncedSearch in the query, searchInput for the input value
```

---

### M4 — `AuditTable` pagination "Next" button can go beyond last page when `totalCount` is 0

**File**: `packages/web/components/generation-audit/audit-table.tsx`
**Lines**: 285, 424–432

**Description**: `pageCount` is computed as `Math.ceil(totalCount / pageSize)`. When `totalCount` is 0, `pageCount` is 0. The "Next" button disabled condition is `pageIndex >= pageCount - 1`, which evaluates to `0 >= -1` — `false` — so the "Next" button is **enabled** when there is no data and `pageIndex` is 0. Clicking "Next" calls `onPageChange(1)`, triggering a query with `offset: pageSize` on an empty dataset.

**Suggested Fix**:

```typescript
// Change the disabled condition to handle the zero case
disabled={pageCount === 0 || pageIndex >= pageCount - 1 || isLoading}
```

---

### M5 — `formatDurationMs` is duplicated in `audit-client.tsx` and `audit-table.tsx` with inconsistent behavior

**File**: `packages/web/components/generation-audit/audit-client.tsx` lines 17–24
**File**: `packages/web/components/generation-audit/audit-table.tsx` lines 79–85

**Description**: `formatDurationMs` exists in two files with slightly different behavior:

- `audit-client.tsx`: `< 1000ms` → `${ms}ms`, `< 60s` → `${seconds.toFixed(1)}s`, else → `${minutes}m ${secs}s`
- `audit-table.tsx`: `< 1000ms` → `${ms}ms`, `< 10s` → `${seconds.toFixed(1)}s`, `>= 10s` → `${Math.round(seconds)}s` (never reaches minutes format)

The table version silently caps display at seconds even for very long traces.

**Suggested Fix**: Extract to a shared utility file (e.g. `packages/web/lib/format-utils.ts`) and import from both components.

---

### M6 — `audit-detail-sheet.tsx` `CodeBlock` `copied` state is not cleaned up if the component unmounts

**File**: `packages/web/components/generation-audit/audit-detail-sheet.tsx`
**Lines**: 68–93

**Description**: The `CodeBlock` component uses `setTimeout(() => setCopied(false), 2000)` without cleanup. If the Sheet is closed within 2 seconds of clicking Copy, the timeout fires on an unmounted component, causing a React state update on an unmounted component warning (or, in strict mode, a no-op that is nonetheless wasteful).

```typescript
const handleCopy = async () => {
  await navigator.clipboard.writeText(content);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000); // No cleanup
};
```

**Suggested Fix**:

```typescript
const handleCopy = useCallback(async () => {
  await navigator.clipboard.writeText(content);
  setCopied(true);
  const t = setTimeout(() => setCopied(false), 2000);
  return () => clearTimeout(t); // or use useEffect pattern
}, [content]);
```

Better: use a `useEffect` with a ref to manage the timeout:

```typescript
const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
const handleCopy = async () => {
  await navigator.clipboard.writeText(content);
  setCopied(true);
  clearTimeout(timeoutRef.current);
  timeoutRef.current = setTimeout(() => setCopied(false), 2000);
};
useEffect(() => () => clearTimeout(timeoutRef.current), []);
```

---

### M7 — `audit-page/page.tsx` uses public Supabase client but accesses `courses` table — no RLS verification

**File**: `packages/web/app/[locale]/admin/generation/[courseId]/audit/page.tsx`
**Lines**: 19–28

**Description**: The server page uses `createClient()` (the user-scoped client, not the admin client) to fetch course data. If the `courses` table has RLS policies that restrict access by `user_id` or `organization_id`, an admin accessing another organization's course audit page would hit the RLS policy and receive an error or `null`, triggering `notFound()`.

This is likely correct behavior (admin should use the admin client or have a separate admin RLS policy), but it should be audited:

- If the intent is that any admin can view any course's audit, use `getSupabaseAdmin()` (service role) in the server component.
- If access should be scoped to the admin's own organization, the current approach is correct but should be documented.

**Suggested Fix**: Clarify intent with a comment. If cross-org admin access is needed:

```typescript
// Use admin client for server-side course lookup (bypasses RLS for admin routes)
import { getSupabaseAdmin } from '@/server/supabase/admin';
const supabase = getSupabaseAdmin();
```

---

### M8 — `getStageColor` in `audit-table.tsx` can incorrectly match `stage_2` prefix against `stage_21` or similar future stage names

**File**: `packages/web/components/generation-audit/audit-table.tsx`
**Lines**: 63–69

**Description**: The stage color lookup uses `stage.startsWith(key)`. If a future stage is named `stage_21` or `stage_2_retry_phase`, it would incorrectly match the `stage_2` color rule:

```typescript
for (const [key, color] of Object.entries(stageColors)) {
  if (stage === key || stage.startsWith(key)) return color;
  // "stage_21".startsWith("stage_2") === true — matches stage_2 color
}
```

**Suggested Fix**: Use `stage.startsWith(key + '_') || stage === key` to ensure the prefix ends on a boundary:

```typescript
if (stage === key || stage.startsWith(key + '_')) return color;
```

---

## Low Priority Issues

### L1 — `audit-table.tsx`: Client-side sorting icon always shows `ArrowUpDown` (bidirectional) regardless of current sort direction

**File**: `packages/web/components/generation-audit/audit-table.tsx`
**Lines**: 103–112, 190–196, 209–215, 228–234

**Description**: The sortable column headers always render `<ArrowUpDown />` regardless of whether that column is currently sorted ascending or descending. Best practice (as seen in shadcn/ui DataTable examples) is to show directional icons (`ChevronUp`/`ChevronDown`) when a sort is active.

**Suggested Fix**:

```typescript
header: ({ column }) => {
  const sorted = column.getIsSorted()
  return (
    <div className="flex cursor-pointer items-center gap-2 select-none"
         onClick={() => column.toggleSorting(sorted === 'asc')}>
      Time
      {sorted === 'asc' ? <ChevronUp className="h-4 w-4" /> :
       sorted === 'desc' ? <ChevronDown className="h-4 w-4" /> :
       <ArrowUpDown className="h-4 w-4 text-gray-500" />}
    </div>
  )
}
```

---

### L2 — `history-table.tsx` Audit button title is hardcoded English string, not i18n

**File**: `packages/web/components/generation-monitoring/history-table.tsx`
**Lines**: 393

**Description**: The new Audit action button uses a hardcoded `title="Audit"` while all other action buttons use `t('actions.openWorkflow')` and `t('actions.adminPanel')`. The page title in `audit/page.tsx` also has no i18n wrapper.

**Suggested Fix**: Add a translation key `actions.audit` to the existing admin history locale files and use `t('actions.audit')`.

---

### L3 — `audit-client.tsx` `useMemo` for `filterOptions` uses optional chaining with nullish fallback — `lessons` property missing from type check

**File**: `packages/web/components/generation-audit/audit-client.tsx`
**Lines**: 118–126

**Description**: `summaryQuery.data?.filterOptions?.lessons` relies on the backend returning a `lessons` array on `filterOptions`. If the backend type changes (e.g. the field is renamed), this silently falls back to `[]` with no TypeScript error because the type of `summaryQuery.data` is inferred from the tRPC procedure return type. This is acceptable tRPC usage, but worth noting that the backend `filterOptions` object (line 570 in the router) currently returns `{ stages, phases, models, lessons }` where `lessons` is the full lessons DB result (`Array<{ id: string, title: string, order_index: number }>`), but the client expects `Array<{ id: string, title: string }>`. The extra `order_index` field is fine (TypeScript structural typing), but if the backend removes `order_index`, no TS error will surface on the client — this is a normal tRPC inference characteristic, just worth documenting.

---

### L4 — `AuditDetailSheet` `SheetHeader` renders before data is available but sheet can open with `isLoading` state showing no header

**File**: `packages/web/components/generation-audit/audit-detail-sheet.tsx`
**Lines**: 112–136

**Description**: When `isLoading` is true, the Sheet renders a full-height spinner with no `SheetHeader`. Screen readers and keyboard users have no title for the sheet while loading. The `Sheet` component uses `role="dialog"` and expects an accessible title via `SheetTitle`.

**Suggested Fix**: Always render a `SheetHeader` with at minimum a loading placeholder:

```typescript
<SheetHeader>
  <SheetTitle>
    {isLoading ? <Skeleton className="h-5 w-48" /> : trace?.phase ?? 'Trace Detail'}
  </SheetTitle>
</SheetHeader>
```

---

### L5 — `AuditSummary` loading state shows 6 skeleton cards even when `data` returns quickly — no `isFetching` vs `isLoading` distinction

**File**: `packages/web/components/generation-audit/audit-summary.tsx`
**Lines**: 66–87

**Description**: `isLoading` is true only on the initial load (no cached data). If the summary refetches in the background (e.g. user navigates away and back), `isLoading` is false but `isFetching` is true — the component correctly shows stale data. However, the `isLoading` guard causes the entire summary to disappear and show skeletons only on first load, while subsequent loads show no indicator at all. For a data-heavy component like this, a subtle "updating" indicator on refetch would improve UX.

**Suggested Fix**: Pass `isFetching` as a separate prop and show a subtle spinner or opacity reduction during background refetches:

```typescript
<AuditSummary data={summaryData} isLoading={summaryQuery.isLoading} isFetching={summaryQuery.isFetching} />
```

---

### L6 — `audit-table.tsx` `colIdx` key used in skeleton rows — fragile if columns are reordered

**File**: `packages/web/components/generation-audit/audit-table.tsx`
**Lines**: 337–343

**Description**: Skeleton rows use `colIdx` (array index) as the React `key`. If columns are reordered or a column is dynamically added/removed, React may incorrectly reuse DOM nodes. This is a minor issue since skeleton rows are transient.

**Suggested Fix**: Use a stable key based on column id:

```typescript
{table.getAllColumns().map((col) => (
  <td key={col.id} className="p-4 align-middle">
    <div className="h-4 w-full animate-pulse rounded bg-gray-200 dark:bg-slate-700" />
  </td>
))}
```

---

## Context7 Best Practices Validation

### @tanstack/react-table v8 — Compliance

| Pattern                                           | Status        | Notes                                                                                     |
| ------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------- |
| `manualPagination: true` for server-side data     | Compliant     | Correctly used in `AuditTable`                                                            |
| `rowCount` instead of `pageCount` (newer API)     | Non-compliant | Uses deprecated `pageCount` prop; `rowCount` is preferred and auto-calculates `pageCount` |
| `keepPreviousData` on paginated queries           | Non-compliant | Missing from `tracesQuery` — see H1                                                       |
| `manualSorting: true` when sorting is server-side | Non-compliant | Client-side sorting applied to server-paginated data — see H2                             |
| Stable `data` reference (memoized defaultData)    | Compliant     | `traces ?? []` is fine as it's computed inline                                            |
| Column `id` for non-accessor columns              | Compliant     | `id: 'status'` used correctly                                                             |

### tRPC v11 — Compliance

| Pattern                                     | Status        | Notes                                                                    |
| ------------------------------------------- | ------------- | ------------------------------------------------------------------------ |
| `enabled` flag to prevent premature queries | Compliant     | Used in `AuditDetailSheet`                                               |
| Error handling on queries                   | Non-compliant | `tracesQuery.error` and `summaryQuery.error` not surfaced — see H3       |
| Input validation with Zod                   | Compliant     | All inputs validated; search input needs character restrictions (see C1) |
| `adminProcedure` for all admin procedures   | Compliant     | All new procedures correctly use `adminProcedure`                        |
| Throwing `TRPCError` vs raw error           | Compliant     | All catch blocks re-throw as `TRPCError`                                 |

### Next.js 15 — Compliance

| Pattern                                        | Status    | Notes                                                                        |
| ---------------------------------------------- | --------- | ---------------------------------------------------------------------------- |
| `params: Promise<{...}>` async params          | Compliant | Both `audit/page.tsx` and `[courseId]/page.tsx` use `await params` correctly |
| Server/Client component separation             | Compliant | Server component fetches course, passes `courseId` to client                 |
| `setRequestLocale` called before any async ops | Compliant | Called immediately after `await params`                                      |

---

## Quick Reference — Files with Issues

| File                                 | Critical   | High       | Medium      | Low        |
| ------------------------------------ | ---------- | ---------- | ----------- | ---------- |
| `generation-monitoring.ts` (backend) | C1, C2, C3 | H5         | M1, M2      | —          |
| `audit-client.tsx`                   | —          | H1, H3, H4 | M3          | L3         |
| `audit-table.tsx`                    | —          | H2, H7     | M4, M5, M8  | L1, L6     |
| `audit-detail-sheet.tsx`             | —          | H6         | M6          | L4         |
| `audit-summary.tsx`                  | —          | —          | —           | L5         |
| `audit-filter-bar.tsx`               | —          | —          | M3 (source) | —          |
| `audit/page.tsx`                     | —          | —          | M7          | —          |
| `history-table.tsx`                  | —          | —          | —           | L2         |
| `[courseId]/page.tsx`                | —          | —          | —           | L2 (title) |

---

## Recommended Fix Order

1. **C1** — SQL injection via search (15 min fix — add Zod regex + sanitize before `.or()`)
2. **C2** — Unbounded memory query in `getAuditSummary` (2–4h — migrate aggregation to SQL GROUP BY)
3. **C3** — Missing `courseId` scope in `getAuditTraceDetail` (30 min fix)
4. **H1** — Add `keepPreviousData` to `tracesQuery` (5 min)
5. **H2** — Fix client-side sorting on server-paginated data (1h — add server-side sort params)
6. **H3** — Add error states to `AuditClient` (30 min)
7. **M3** — Add search debounce in `AuditFilterBar` (15 min)
8. **M4** — Fix "Next" button enabled state when `totalCount` is 0 (5 min)
