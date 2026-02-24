# Code Review Report: NLM 30-Minute Timeout + Countdown Loader

Date: 2026-02-20  
Author: Codex

## Scope

Implemented requested behavior for long-running NLM generation:

- Increase NLM generation timeout to **30 minutes** for both audio and video paths.
- Add UI loader feedback with **30-minute countdown** (remaining + elapsed) for `nlm_audio` and `nlm_video` generation cards.

## Changes

### 1) Backend timeout defaults set to 30 minutes

- `packages/course-gen-platform/src/stages/stage7-enrichments/services/notebooklm-bridge-client.ts`
  - `DEFAULT_TIMEOUT_MS` changed from `5 * 60 * 1000` to `30 * 60 * 1000`.
- `packages/course-gen-platform/docker/notebooklm-bridge/app/config.py`
  - `notebooklm_generation_timeout_seconds` default changed from `240.0` to `1800.0`.

### 2) Frontend long-running countdown for NLM media

- `packages/web/lib/hooks/useEnrichmentGeneration.ts`
  - Added per-generation metadata:
    - `startedAtMs`
    - `maxDurationMs`
  - Added 30-minute max duration for `nlm_audio` and `nlm_video` only.
  - `resumeGeneration` now accepts optional `startedAtMs` to restore timer across refresh/reload.
- `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx`
  - Passes `created_at` timestamp into `resumeGeneration(...)`.
  - Passes `startedAtMs` and `maxDurationMs` into `EnrichmentGeneratingCard`.
- `packages/web/components/course/viewer/components/EnrichmentGeneratingCard.tsx`
  - Added countdown UI block for NLM types:
    - Remaining time (`30:00 -> 00:00`)
    - Elapsed time
  - Added per-second ticker while card is active.

### 3) i18n strings for countdown text

- `packages/web/messages/en/enrichments.json`
- `packages/web/messages/ru/enrichments.json`
- Added:
  - `longGeneration.remaining`
  - `longGeneration.elapsed`

## Tests Updated

- `packages/course-gen-platform/tests/unit/stages/stage7-notebooklm-bridge-client.test.ts`
  - Added test asserting default timeout is 30 minutes when env override is absent.
- `packages/web/lib/hooks/__tests__/useEnrichmentGeneration.test.ts`
  - Updated generation object expectations for new fields.
  - Added test asserting `nlm_audio` receives `maxDurationMs = 30 * 60 * 1000`.
  - Updated one existing expectation to match current behavior (`settings: undefined` when omitted).
- `packages/web/components/course/viewer/__tests__/EnrichmentGeneratingCard.test.tsx`
  - Added countdown rendering test for `nlm_audio`.
  - Added negative test ensuring non-NLM types do not show countdown.

## Verification Run

### Passed

- `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/stages/stage7-notebooklm-bridge-client.test.ts`
- `pnpm --filter @megacampus/web test -- lib/hooks/__tests__/useEnrichmentGeneration.test.ts components/course/viewer/__tests__/EnrichmentGeneratingCard.test.tsx components/course/viewer/__tests__/EnrichmentsPanel.test.tsx`
- `pnpm --filter @megacampus/course-gen-platform type-check`
- `pnpm --filter @megacampus/web type-check`

### Not run

- Python bridge pytest command unavailable in current shell:
  - `pytest packages/course-gen-platform/docker/notebooklm-bridge/tests/test_api.py -q`
  - Result: `pytest: command not found`

## Runtime Notes

- Frontend warnings about duplicate `shiki` versions (`1.29.2` vs `3.19.0`) are not blockers for this NLM timeout/countdown change, but should be resolved as separate dependency hygiene task.

## Reviewer Checklist

1. Confirm timeout defaults are 30 min in both TS bridge client and Python bridge config.
2. Confirm NLM generation cards show countdown (`remaining` + `elapsed`) only for `nlm_audio`/`nlm_video`.
3. Confirm timer survives refresh/resume (uses enrichment `created_at`).
4. Confirm tests listed above pass in CI environment.
