# Code Review Report: NLM Single-Stage Migration (Audio + Video)

Date: 2026-02-20
Scope: `nlm_audio` and `nlm_video` migration to single-stage generation, legacy compatibility, viewer UX alignment.

## Summary

Implemented migration from two-stage to single-stage for NotebookLM enrichments (`nlm_audio`, `nlm_video`) while keeping true two-stage flow for `video` and `presentation`.

Also fixed a backend validation mismatch in `approveDraft` and added legacy compatibility for old NLM rows stuck in `draft_ready`/`draft_generating`.

## Context Used

- Internal codebase analysis (Stage7 handlers, enrichment procedures, viewer).
- Context7 docs: `/teng-lin/notebooklm-py` for current artifact generation capabilities (audio/video, source-driven generation, presets).

## Main Behavior Changes

1. NLM flow mode

- `nlm_audio` and `nlm_video` are no longer treated as two-stage.
- Enqueue behavior now uses `isDraftPhase: false` for NLM.

2. Legacy compatibility

- Existing NLM rows in legacy draft statuses (`draft_ready`, `draft_generating`) can be reset/reused instead of hard conflict.
- Viewer preserves a restart path for these legacy statuses by showing NLM placeholders (Generate) rather than stuck cards.

3. Two-stage APIs narrowed

- `approveDraft`, `updateDraft`, `regenerateDraft` now explicitly apply only to `video` and `presentation`.

4. Draft validation fix

- `approveDraft` now validates draft content from `enrichment.content` (actual storage shape), rather than `content.draft`.

## Files Changed

### Backend / Shared Types

- `packages/shared-types/src/enrichment-on-demand.ts`
- `packages/course-gen-platform/src/server/routers/enrichment/helpers.ts`
- `packages/course-gen-platform/src/server/routers/enrichment/procedures/generate-on-demand.ts`
- `packages/course-gen-platform/src/server/routers/enrichment/procedures/create.ts`
- `packages/course-gen-platform/src/server/routers/enrichment/procedures/regenerate.ts`
- `packages/course-gen-platform/src/server/routers/enrichment/procedures/approve-draft.ts`
- `packages/course-gen-platform/src/server/routers/enrichment/procedures/update-draft.ts`
- `packages/course-gen-platform/src/server/routers/enrichment/procedures/regenerate-draft.ts`
- `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/nlm-audio-handler.ts`
- `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/nlm-video-handler.ts`

### Frontend (Viewer)

- `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx`
- `packages/web/components/course/viewer/components/UnifiedEnrichmentCard.tsx`

### Tests Added/Updated

- `packages/course-gen-platform/tests/unit/enrichment-procedures/is-two-stage-type.test.ts`
- `packages/course-gen-platform/tests/unit/enrichment-procedures/generate-on-demand.test.ts`
- `packages/course-gen-platform/tests/unit/stages/stage7-enrichment-router.test.ts`
- `packages/course-gen-platform/tests/unit/enrichment-procedures/approve-draft.test.ts` (new)
- `packages/course-gen-platform/tests/unit/enrichment-procedures/create.test.ts` (new)
- `packages/course-gen-platform/tests/unit/enrichment-procedures/regenerate.test.ts` (new)
- `packages/shared-types/tests/enrichment-on-demand-two-stage.test.ts` (new)
- `packages/web/components/course/viewer/__tests__/EnrichmentsPanel.test.tsx`
- `packages/web/components/course/viewer/__tests__/UnifiedEnrichmentCard.test.tsx` (new)

## Verification Evidence

Executed locally:

```bash
pnpm --filter @megacampus/course-gen-platform test -- tests/unit/enrichment-procedures/is-two-stage-type.test.ts tests/unit/enrichment-procedures/generate-on-demand.test.ts tests/unit/enrichment-procedures/approve-draft.test.ts tests/unit/enrichment-procedures/create.test.ts tests/unit/enrichment-procedures/regenerate.test.ts tests/unit/stages/stage7-enrichment-router.test.ts
# Result: 24 passed

pnpm --filter @megacampus/course-gen-platform test -- tests/unit/enrichment-procedures
# Result: 35 passed

pnpm --filter @megacampus/shared-types test
# Result: 156 passed

pnpm --filter @megacampus/web test -- components/course/viewer/__tests__
# Result: 61 passed

pnpm --filter @megacampus/course-gen-platform type-check
pnpm --filter @megacampus/shared-types type-check
pnpm --filter @megacampus/web type-check
# Result: all passed
```

Operational check:

- Redis/queues were reset for clean local retest (`FLUSHALL`, `DBSIZE=0`).

## Residual Risks / Notes for Reviewer

1. `create` procedure now includes legacy NLM reuse path; for non-legacy duplicates, behavior remains pre-existing (insert can still fail on unique constraints). This migration did not redesign generic duplicate UX for `create`.
2. Viewer includes a legacy-only placeholder path for NLM draft statuses. New NLM runs should not produce these statuses.
3. Existing unrelated workspace modifications were intentionally not reverted.

## Suggested Reviewer Focus

1. Confirm no regression for true two-stage `video/presentation` workflows (draft review and approve).
2. Validate end-to-end NLM generation from Viewer (`Generate` -> pending/generating -> completed) for both audio and video.
3. Validate legacy NLM rows in `draft_ready` can be restarted from Viewer without manual DB edits.
