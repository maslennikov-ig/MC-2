# Orchestrator Handoff

Updated: 2026-06-13
Stage: `mc2-owuag`
Branch: `codex/career-playbook-course-preview-bridge`
Beads: `mc2-owuag`

## Current State

- Career Playbook Role Guide -> course bridge preview/create flow is implemented locally.
- Private Role Guide viewer opens `CreateCourseFromPlaybookDialog`; read-only viewers do not see the create-course action.
- The dialog now loads a preview, lets the owner edit title, description, audience, outcomes, language, localized course size, localized style, and optional supporting sources before generation.
- Supporting sources default to off. Role Guide markdown is always primary; web research and uploaded business-context excerpts are included only by explicit opt-in.
- Backend bridge stores `course_size` and `style`, uploads bridge sources, starts generation, and rolls back created draft courses if required source upload/evidence/generation start fails.
- Explicit business-context opt-in now uses structured source evidence metadata: `hasAuthoritativeEvidence` and `unavailableReason`.
- Docs and Graphify were refreshed for the bridge behavior.

## Verification

- Passed: `pnpm exec vitest run --config vitest.config.unit.ts tests/unit/server/routers/career-playbook-course-bridge.service.test.ts tests/unit/server/routers/career-playbook.router.test.ts tests/unit/stages/stage-career-playbook/business-context.test.ts` from `packages/course-gen-platform` -> 69 tests.
- Passed: `pnpm exec vitest run tests/unit/components/career-playbook/create-course-from-playbook-dialog.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx tests/unit/components/career-playbook/library-page-client.test.tsx` from `packages/web` -> 21 tests.
- Passed: `pnpm --filter @megacampus/course-gen-platform type-check`.
- Passed: `pnpm --filter @megacampus/web type-check`.
- Passed: `pnpm build`.
- Passed: `python3 scripts/orchestration/run_stage_closeout.py --stage mc2-owuag --verify-group code_change_commands`.

## Next recommended

Next stage id: none.
Recommended action: review diff, then deliver through the normal dev delivery path when ready.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`; read `AGENTS.md`, `.codex/orchestrator.toml`, Beads `mc2-owuag`, `.codex/stages/mc2-owuag/summary.md`, and the current diff.

## Delivery

- docs-reviewed: updated - bridge flow and architecture docs describe structured business-context evidence metadata, localized preview/edit controls, default-off supporting sources, rollback, and generation start.
- graph-reviewed: updated - ran `graphify update .`; local ignored `graphify-out/graph.json` and `GRAPH_REPORT.md` were regenerated. HTML visualization was skipped because the graph is above the default node limit.

## Explicit defers

- Browser-level private viewer -> preview -> generation redirect E2E remains blocked by Beads `mc2-zt4ju` until the local course-gen-platform dev/start runtime is fixed.
