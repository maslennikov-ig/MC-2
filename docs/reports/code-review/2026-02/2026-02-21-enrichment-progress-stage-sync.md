# Code Review Report — Enrichment Progress Bar Stage Sync

Date: 2026-02-21
Issue: Progress bar jumped above 50% immediately after preparation stage.

## Root Cause

`EnrichmentGeneratingCard` passed **global progress (0-100)** into `StagedProgress` as `stageProgress`.
But `StagedProgress` expects **progress within current stage (0-100)**.

This mismatch inflated total progress right after switching to `generating` stage.

## Fix Implemented

- `packages/web/components/course/viewer/components/EnrichmentGeneratingCard.tsx`
  - Added normalization helpers:
    - `clampProgress(...)`
    - `toStageProgress(currentStep, globalProgress)`
  - Mapped global progress to stage-local progress:
    - prepare/sync/analyze: global `0-50` -> stage `0-100`
    - generating: global `50-100` -> stage `0-100`
    - finalizing/uploading: global `75-100` -> stage `0-100`
  - Extended stage index mapping for `analyzing_content` and `uploading_assets`.
  - `StagedProgress` now receives normalized stage-local value (`stagedProgress`) instead of raw global progress.

- `packages/web/components/course/viewer/__tests__/EnrichmentGeneratingCard.test.tsx`
  - Updated assertion for generating state normalization:
    - global smooth progress `75` now becomes stage-local `50`.

## Verification

Commands run:

- `pnpm --filter @megacampus/web test -- components/course/viewer/__tests__/EnrichmentGeneratingCard.test.tsx`
- `pnpm --filter @megacampus/web type-check`

Result: both passed.
