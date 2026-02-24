# Plan: Generation Trace Audit Page

## Context

The admin panel has a generation monitoring page (`/admin/generation/[courseId]`) built for **realtime** tracking during generation — Supabase subscriptions, timeline, trace viewer. But there's no convenient way to **audit a completed course** after the fact: see which models generated each lesson, where retries/escalations happened, aggregate costs, and filter by stage/phase/model/errors. The user needs a structured, post-hoc audit view to answer questions like "why did Gemini 3 appear in Stage 6?" quickly.

## Approach

Add a new audit route `/admin/generation/[courseId]/audit` with server-side filtered traces, summary stats, and a filterable table. Reuse existing patterns: `@tanstack/react-table` (from `history-table.tsx`), `Sheet` detail panel (from `log-detail-drawer.tsx`), `Select` filters (from `filter-bar.tsx`), stat `Card` layout (from `generation-overview-panel.tsx`).

## Files to Create

### 1. Backend — new tRPC procedures

**File**: `packages/course-gen-platform/src/server/routers/admin/generation-monitoring.ts`

Add 2 new procedures to the existing `generationMonitoringRouter`:

**`getAuditSummary`** (query)

- Input: `{ courseId: string }`
- Runs parallel queries:
  - Aggregate: `SELECT count(*), sum(cost_usd), sum(tokens_used), count(CASE WHEN error_data IS NOT NULL), count(CASE WHEN retry_attempt > 0)` from `generation_trace`
  - Per-stage breakdown: `GROUP BY stage` with same aggregates
  - Model breakdown: `GROUP BY model_used` with count + total cost + total tokens
  - Lesson breakdown: `GROUP BY lesson_id` joined to `lessons.title`, with model_used, cost, tokens
  - Course info: title, generation_status, generation_started_at, generation_completed_at
- Returns structured summary object

**`getAuditTraces`** (query)

- Input: `{ courseId, stage?, phase?, modelUsed?, lessonId?, hasError?, hasRetry?, search?, limit (default 50), offset (default 0) }`
- Server-side filtered query on `generation_trace` with optional `.eq()` for each filter
- `hasError` → `.not('error_data', 'is', null)`
- `hasRetry` → `.gt('retry_attempt', 0)`
- `search` → `.or('phase.ilike.%${search}%,step_name.ilike.%${search}%')`
- Returns `{ traces, totalCount }` — lightweight rows (no `prompt_text`, no `completion_text`, no `input_data`, no `output_data`)
- Existing `getGenerationTrace` already fetches full trace by ID — reuse it for detail panel

### 2. Frontend — route + components

**`packages/web/app/[locale]/admin/generation/[courseId]/audit/page.tsx`** — Server component

- Fetch course from Supabase (title, generation_status)
- Render header with course title + back link to monitoring page
- Render `<AuditClient courseId={courseId} />`

**`packages/web/components/generation-audit/audit-client.tsx`** — Main client component

- Manages filter state, selected trace for detail sheet
- Orchestrates: AuditSummary + AuditFilterBar + AuditTable + AuditDetailSheet
- Uses `trpc.admin.getAuditSummary.useQuery` and `trpc.admin.getAuditTraces.useQuery`

**`packages/web/components/generation-audit/audit-summary.tsx`** — Summary cards

- Grid of stat cards (pattern: `generation-overview-panel.tsx` with `Card` + icon)
  - Total cost ($), Total tokens, Duration, Trace count, Error count, Retry count
- Below: two collapsible sections:
  - **Model Usage** — table: model name | call count | tokens | cost (sorted by calls desc)
  - **Per-Stage Breakdown** — table: stage | calls | tokens | cost | errors

**`packages/web/components/generation-audit/audit-filter-bar.tsx`** — Filter controls

- Pattern: `filter-bar.tsx` from logs
- Dropdowns: Stage (all/stage_2/.../stage_6), Phase (dynamically populated from data), Model (dynamically populated), Lesson (dynamically populated)
- Toggles: "Errors only", "Retries only" (checkbox or toggle buttons)
- Search input (debounced, searches phase/step_name)
- Clear filters button

**`packages/web/components/generation-audit/audit-table.tsx`** — Traces table

- Pattern: `history-table.tsx` with `@tanstack/react-table`
- Columns: Time | Stage | Phase | Step | Model | Lesson | Tokens | Cost | Duration | Retry | Status (error badge)
- Server-side pagination (manual pagination via tRPC offset/limit)
- Sortable columns: Time, Tokens, Cost, Duration
- Row click opens detail sheet
- Color-coded: red tint for error rows, yellow tint for retry rows

**`packages/web/components/generation-audit/audit-detail-sheet.tsx`** — Side panel

- Pattern: `log-detail-drawer.tsx` using `Sheet`/`SheetContent`
- Shows full trace: all metadata fields, input/output JSON, prompt/completion text
- Reuses `MetadataItem` and `CodeBlock` patterns from `trace-viewer.tsx`
- Fetches full trace via existing `getGenerationTrace` with `courseId + traceId` filter, or adds a `getTraceById` proc

### 3. Navigation — entry points

**`packages/web/components/generation-monitoring/history-table.tsx`**

- Add "Audit" icon button (e.g. `FileSearch`) in actions column next to existing "Admin Panel" button
- Links to `/admin/generation/${row.original.id}/audit`

**`packages/web/app/[locale]/admin/generation/[courseId]/page.tsx`**

- Add "Audit" button in header (next to existing "Konstruktor kursa" button)
- Links to `/admin/generation/${courseId}/audit`

## Implementation Order

1. **Backend**: Add `getAuditSummary` + `getAuditTraces` to `generation-monitoring.ts`
2. **Route**: Create `audit/page.tsx` server component
3. **Components**: `audit-client.tsx` → `audit-summary.tsx` → `audit-filter-bar.tsx` → `audit-table.tsx` → `audit-detail-sheet.tsx`
4. **Navigation**: Add links in `history-table.tsx` + `[courseId]/page.tsx`
5. **Type-check + build verification**

## Key Patterns to Reuse

| Pattern                                      | Source File                                   |
| -------------------------------------------- | --------------------------------------------- |
| @tanstack/react-table with server pagination | `history-table.tsx`                           |
| Sheet detail panel                           | `log-detail-drawer.tsx`                       |
| Filter bar with Select dropdowns             | `logs/components/filter-bar.tsx`              |
| Stat cards with icons                        | `generation-overview-panel.tsx`               |
| MetadataItem + CodeBlock                     | `trace-viewer.tsx`                            |
| tRPC admin queries                           | `generation-monitoring.ts` (`adminProcedure`) |
| Badge color scheme for statuses              | `history-table.tsx` (`statusColors`)          |

## Verification

1. `pnpm type-check` — no type errors
2. `pnpm build` — successful build
3. Manual: navigate to `/admin/generation/history`, click Audit icon for a course
4. Manual: verify filters work (stage, model, errors-only)
5. Manual: click a trace row, verify detail sheet opens with full data
6. Manual: verify summary cards show correct aggregated data
