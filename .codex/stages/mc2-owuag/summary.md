---
stage_id: mc2-owuag
beads: mc2-owuag
branch: codex/career-playbook-course-preview-bridge
status: closed
---

# Career Playbook Bridge Follow-Up Polish

## Scope

Implement useful follow-ups after the Role Guide -> course bridge review:

- localized course size/style labels in `CreateCourseFromPlaybookDialog`
- structured business-context source evidence gating for explicit company-context opt-in

No subagents were launched. The work stayed local because the frontend label polish and backend evidence helper shared the same bridge tests and closeout loop.

## Verification

- Passed: backend targeted Vitest for bridge router/service and business-context helper -> 69 tests.
- Passed: web targeted Vitest for create-course dialog, private viewer, and library card -> 21 tests.
- Passed: `pnpm --filter @megacampus/course-gen-platform type-check`.
- Passed: `pnpm --filter @megacampus/web type-check`.
- Passed: `pnpm build`.
- Passed: `python3 scripts/orchestration/run_stage_closeout.py --stage mc2-owuag --verify-group code_change_commands`.

docs-reviewed: updated - course bridge flow and Career Playbook architecture now describe structured business-context evidence metadata for bridge gating.

graph-reviewed: updated - ran `graphify update .`; local ignored `graphify-out/graph.json` and `GRAPH_REPORT.md` were regenerated. HTML visualization was skipped because the graph exceeds the default node limit.

project-index: reviewed-no-change - existing `.codex/project-index.md` already lists the Career Playbook course bridge service, business-context helper, web viewer/library UI, locale messages, docs, and verification entrypoints touched here.

## Explicit Defers

- Browser-level private viewer -> preview -> generation redirect E2E remains blocked by Beads `mc2-zt4ju` until the local course-gen-platform dev/start runtime is fixed.
