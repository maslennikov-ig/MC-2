# Progress Bar Stage Milestone Sync (2026-02-21)

## Context

User-reported issue: after preparation stage, staged progress could quickly move above 50% while still in `generating`.

## Root Cause

`EnrichmentGeneratingCard` used `useSmoothProgress` with `nextMilestone=getNextMilestone(globalProgress)`.
For `generating` status (`globalProgress=75` from status polling), this selected milestone `100`, enabling asymptotic crawl beyond 75 while `currentStep` remained `generating`.
That made the staged bar drift into >50% overall before actual step transition.

## Changes

1. Added stage-bounded milestone calculation:

- `getStageMilestone(currentStep, globalProgress)` in
  `packages/web/components/course/viewer/components/EnrichmentGeneratingCard.tsx`.
- Mapping:
  - prepare-related steps (`queued`, `syncing`, `analyzing_content`) -> `50`
  - `generating` -> `75`
  - save/finalization steps (`finalizing`, `uploading_assets`) -> `100`
  - fallback -> existing `getNextMilestone(...)`

2. Wired smoothing to stage milestone:

- Replaced `nextMilestone: getNextMilestone(...)` with
  `nextMilestone: getStageMilestone(currentStep, ...)`.

3. Updated unit test expectation:

- `packages/web/components/course/viewer/__tests__/EnrichmentGeneratingCard.test.tsx`
- The `useSmoothProgress` call for `generating` now expects `nextMilestone: 75`.

## Verification

Executed:

1. `pnpm --filter @megacampus/web test -- components/course/viewer/__tests__/EnrichmentGeneratingCard.test.tsx`

- Result: 56/56 tests passed.

2. `pnpm --filter @megacampus/web type-check`

- Result: passed (`tsc --noEmit`).

## Notes

- Existing unrelated warning in tests remains:
  - `Received 'true' for a non-boolean attribute 'jsx'.`
  - Not introduced by this change.
