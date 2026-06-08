# Stage Summary: mc2-xevm1

## Scope

- Adapted Career Playbook Business Context source loading so follow-up and spec-builder prompts receive a source evidence pack instead of short processed-source excerpts.
- The evidence pack prefers full Docling markdown from `file_catalog.markdown_content` as authoritative source content and keeps `processed_content` as summary overview or fallback.
- Raised the Career Playbook source-context budget to an aggregate 250,000 estimated tokens across selected sources, while preserving source boundaries and unavailable-content warnings.
- Kept existing prompt variable names for compatibility and updated prompt wording/docs to describe source evidence rather than excerpts.
- Added regression coverage for markdown-over-summary preference, aggregate budget trimming, markdown-first behavior under tight budgets, source-load fallback, and follow-up prompt propagation.

## Verification

- Passed: `pnpm --filter @megacampus/course-gen-platform exec vitest run tests/unit/stages/stage-career-playbook/business-context.test.ts tests/unit/stages/stage-career-playbook/followup-questions.test.ts tests/unit/stages/stage-career-playbook/spec-builder.test.ts --config vitest.config.unit.ts` — 18 tests.
- Passed: `pnpm --filter @megacampus/course-gen-platform exec vitest run tests/unit/stages/stage-career-playbook tests/unit/orchestrator/handlers/career-playbook-handler.test.ts tests/unit/stages/stage-career-playbook/source-processing.test.ts --config vitest.config.unit.ts` — 61 tests.
- Passed: `pnpm --filter @megacampus/course-gen-platform type-check`.
- Passed: `pnpm type-check`.
- Passed: `pnpm build`.
- Passed: `git diff --check`.

## Reviews

- `correctness_reviewer`: fixed both findings with regression tests:
  - authoritative markdown now appears before summary overview under constrained budgets;
  - source loading is inside the fallback `try` path.
- `improvement_reviewer`: accepted compatibility-key guidance; tracked follow-ups for phase-specific source budgets and rendered prompt token-count model routing.
- `docs_reviewer`: updated stale unavailable-content wording in `docs/career-playbook/architecture.md`.

## Documentation

- docs-reviewed: updated - `docs/career-playbook/architecture.md` documents Docling markdown source evidence, summary overview/fallback, 250k aggregate budget, and unavailable-source-content warnings.
- project-index: reviewed-no-change - no new routes, packages, entrypoints, verification commands, or ownership boundaries were added.

## Knowledge Graph

- graph-reviewed: updated - ran `graphify update .` and `graphify cluster-only . --no-viz`; commands completed successfully.

## Explicit Defers

- `mc2-db696.61` tracks evaluating whether follow-up generation should use a smaller/sharper source evidence budget than spec-builder.
- `mc2-db696.62` tracks passing rendered prompt token count into Career Playbook model routing and adding context-window guards.
