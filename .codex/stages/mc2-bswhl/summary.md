# Stage `mc2-bswhl` — actionable document-processing failure

Active stage id: `mc2-bswhl`
Status: accepted locally; remote delivery was not requested.

## Scope

Carry the persisted `file_catalog.error_message` into the existing Stage 2 document dashboard and
turn the known empty-text-layer failure into localized recovery guidance without exposing internal
paths or counters. Actual document extraction and upload-time content reading are out of scope.

## Implementation evidence

- `13efe27d6` carries the persisted failure through the Zustand-owned status path.
- `b06f7ff2b` narrows the translation helper to the two declared message keys.
- Known empty-text-layer failures become localized guidance inside the failed document row.
- Unknown backend failures use a safe generic explanation; raw paths and counters are not shown.
- Focused Vitest red-green passed 3/3, and the implemented Russian state was rendered locally with
  Playwright against the real component.

## Acceptance

- `pnpm --filter @megacampus/web exec vitest run components/generation-graph/hooks/__tests__/useStage2DashboardData.test.tsx components/generation-graph/panels/stage2/__tests__/Stage2Dashboard.document-error.test.tsx` — 3/3 passed after first failing against the old behavior.
- `pnpm run type-check` — passed.
- `pnpm run build` — passed; the existing Node `DEP0169` warning remains tracked by `mc2-p2908.1`.
- Canonical stage closeout and process verification — passed; receipt:
  `.codex/stages/mc2-bswhl/acceptance-receipt.json`.
- Beads issue `mc2-bswhl` — closed with commits `13efe27d6` and `b06f7ff2b`.

## Reviews

Documentation: no external/versioned boundary - the change uses repository-owned data and UI
copy only.

docs-reviewed: no-change-needed - the existing Stage 2 dashboard remains the stable owner; no
navigation, public contract, or operator procedure changed.

project-index: reviewed-no-change - no top-level subsystem or stable entrypoint was added.

graph-reviewed: updated - local Graphify refreshed the repository graph after product commit
`b06f7ff2b` without semantic/API extraction; `graphify check-update .` exited successfully.

design-reviewed: Lazyweb report `20d8da1b-2711-4b47-a5c7-de22b9df8521` grounded the existing
screen and kept the change within the failed document row instead of redesigning the dashboard.

## Delivery / Cleanup

The accepted change is committed on local `develop`. No child worktree or branch existed to clean.
No push, deploy, reindex, migration, or live paid document processing was performed.

## Explicit defers

- `mc2-3gz2m` remains the research-gated owner for actually reading scan-only or outlined-text
  documents. Browser preflight would duplicate document extraction and is not a cheap type/size
  validation.
