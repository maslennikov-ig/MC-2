# Orchestrator Handoff

Updated: 2026-06-14
Stage: `mc2-dqdv8` local_verified
Branch: `codex/single-source-course-generation-flow`
Beads: `mc2-dqdv8`

## Current State

- Stage `mc2-dqdv8` implements course structure quality guardrails for auto-size and Career Playbook -> course bridge.
- Stage 4 now resolves a `structure_profile` (`general_auto`, `role_playbook_bridge`, or explicit size), removes broad auto expansion guidance, normalizes section counts and lesson caps, and recomputes totals/durations before Stage 5.
- Stage 5 now uses each Stage 4 section's `estimated_lessons` budget, reconciles actual duration/difficulty metadata, and stores deterministic structural quality under `generation_metadata.quality_scores.structure`.
- Critical Stage 5 structure issues block automatic Stage 6 transition, manual Stage 5 approval, and direct Stage 6 starts.
- Stage 5 UI now shows "needs fixes" / warning / can-continue quality states and disables approval when critical structural issues exist.
- Durable docs/spec added for the policy in `docs/course-generation/structure-quality-spec.md`; Career Playbook and Stage 4/5 docs updated.

## Verification

- Passed targeted backend tests: `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/course-structure-policy.test.ts tests/unit/stage5-structural-quality.test.ts tests/unit/stages/stage5-generation/section-batch-constraints.test.ts`.
- Passed targeted UI lint: `pnpm --filter @megacampus/web exec eslint components/generation-graph/controls/ApprovalControls.tsx components/generation-graph/panels/stage5/Stage5OutputTab.tsx components/generation-graph/panels/stage5/types.ts`.
- Passed: `pnpm type-check`.
- Passed: `pnpm build`.

## Delivery

- docs-reviewed: updated - structure quality spec plus Career Playbook and Stage 4/5 docs.
- graph-reviewed: updated - ran `graphify update .`; graph rebuilt successfully, `graph.html` skipped by Graphify size limit, no tracked graph diff remained.

## Next recommended

Next stage id: `mc2-dqdv8` closeout/delivery.
Recommended action: commit and push `codex/single-source-course-generation-flow`; merge/deploy only with explicit current-task authorization. Follow-up live E2E is tracked as `mc2-pmrmf`.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`; read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, `.codex/stages/mc2-dqdv8/summary.md`, and Beads. Current branch contains structure-quality guardrails for auto-size and Career Playbook course bridge. Verify latest status, commit, pull --rebase, `bd dolt push`, and push if still clean.

## Explicit defers

- `mc2-pmrmf`: live dev E2E for Career Playbook -> course with real LLM/Tavily calls was not run because disposable data and explicit cost budget were not available in this closeout. Covered by targeted unit tests, UI lint, type-check, and build.
