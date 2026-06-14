# Orchestrator Handoff

Updated: 2026-06-14
Stage: `mc2-pmrmf` blocked
Branch: `codex/single-source-course-generation-flow`
Beads: `mc2-pmrmf`, blocker `mc2-pmrmf.1`

## Current State

- Structure-quality guardrails for auto-size and Career Playbook -> course bridge are implemented and pushed in commit `d9981d3d`.
- Follow-up live/dev E2E is blocked before Stage 5 by runtime model config, not by the guardrail implementation.
- Blocker: Stage 4 uses deprecated OpenRouter model `x-ai/grok-4.1-fast`; OpenRouter returns 404 and recommends moving to a newer Grok model.
- Child Bead `mc2-pmrmf.1` tracks the model-config blocker.

## E2E Verification

- Passed read-only dev preflight: `pnpm --dir packages/course-gen-platform smoke:career-playbook:preflight --target dev --json`.
- Passed browser Career Playbook E2E: `pnpm --filter @megacampus/web test:e2e:career-playbook`, 5/5 tests passed with `/usr/bin/google-chrome`.
- Live bridge fixture created disposable playbook `d55411ea-1f1f-407f-b4c5-d8a36daf2a56` and course `b4c904bc-e9c3-49ae-9411-c2f94360cdf7`.
- Initial cloud Qdrant endpoint returned 404; rerunning with local Qdrant `127.0.0.1:6333` allowed Stage 2 to complete.
- Stage 2 `document_processing` and Stage 3 `document_classification` completed.
- Stage 4 `structure_analysis` failed after retries with: `404 Grok 4.1 Fast is deprecated`.

## Next Recommended

1. Fix dev/runtime model config for Stage 4 classification/scope so it no longer references `x-ai/grok-4.1-fast`.
2. Rerun `mc2-pmrmf` live bridge E2E from a fresh disposable playbook/course fixture.
3. Verify Stage 5 reaches `role_playbook_bridge`, lesson count stays `<=30`, no critical structural issues appear, and the UI quality state is visible.

## Delivery Notes

- docs-reviewed: no-change-needed - E2E found a runtime config blocker; no durable product behavior or code contract changed in this pass.
- graph-reviewed: used - read `graphify-out/GRAPH_REPORT.md` and used focused Graphify query before E2E planning; no graph update needed because no code changed.
