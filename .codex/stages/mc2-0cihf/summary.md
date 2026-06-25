# Stage Summary: mc2-0cihf

## Scope

- Fixed Stage 6 content extraction so runtime lesson bodies must pass the shared `LessonContentBody` schema, and markdown output is parsed as markdown instead of being blindly accepted after JSON repair.
- Changed Stage 6 sanity failures from a non-blocking warning into a `review_required` lesson marker; failed sanity no longer writes `completed` lesson content.
- Hardened Stage 6 completion/finalization so `completed`/`approved` rows only count as fully complete when stored markdown is non-empty and passes sanity checks; invalid completed rows are marked for review and block auto-finalization.
- Changed Career Playbook course bridge creation to `semi_automatic` with `clarifying_questions_enabled = true`, so the user sees course-level clarifying questions after converting a Role Guide into a course.
- Recorded synthetic Career Playbook source filenames, sizes, and `text/markdown` type in initial course progress so document processing can show which generated source document was processed.
- Updated Career Playbook architecture docs to reflect the semi-automatic bridge, clarifying-question step, source metadata, and pre-course business-context gating.

## Routing

- Stage classification: medium/complex backend behavior fix touching AI generation, DB status semantics, bridge behavior, tests, and durable docs.
- Selected Beads task: `mc2-0cihf`.
- Docs L1/L2: `orch-prompts docs-resolve --cwd /home/me/code/mc2 --package zod --topic "safeParse schema validation object parsing"` resolved `npm/zod@3.25.76` from lockfile but L1 install returned 404, so fallback was needed. Used official Zod behavior for schema `safeParse`/validation as the build-vs-buy basis.
- Graphify: read `graphify-out/GRAPH_REPORT.md`; focused queries for Stage 6/content sanity and Career Playbook bridge returned no matching nodes, so local grep/read filled the code path map.
- Subagents: available and authorized, but not launched for write streams because the primary worktree was already dirty before this stage and repo delegation policy requires a clean base/worktree for safe delegated writes.

## Parallel Decomposition Matrix

| Stream                 | Goal                                                                     | Agent | Write zone                                               | Dependencies                     | Verification                      | Decision                               |
| ---------------------- | ------------------------------------------------------------------------ | ----- | -------------------------------------------------------- | -------------------------------- | --------------------------------- | -------------------------------------- |
| Stage 6 parser         | Reject invalid repaired JSON/structured bodies and parse markdown safely | local | `judge-helpers.ts`, parser tests                         | shared schema                    | focused Vitest                    | sequential due dirty worktree          |
| Stage 6 persistence    | Mark sanity failures/repaired empties for review and block publish       | local | `job-processor.ts`, `database-service.ts`, service tests | parser result, sanity helper     | focused Vitest, type-check        | sequential due shared status semantics |
| Career Playbook bridge | Restore user clarifying questions and source metadata                    | local | `course-bridge.service.ts`, bridge tests, docs           | Stage 4 clarifying mode contract | focused Vitest, type-check, build | sequential due dirty worktree          |
| Closeout               | Verify, docs, Graphify, Beads/handoff                                    | local | `.codex/stages/mc2-0cihf/`, `.codex/handoff.md`, Beads   | code complete                    | repo gates, Graphify              | local                                  |

## Verification

- Passed RED/GREEN focused tests: `pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage6-lesson-content/judge/judge-helpers.test.ts tests/unit/stages/stage6-lesson-content/services/job-processor.test.ts tests/unit/stages/stage6-lesson-content/services/database-service.completion-check.test.ts tests/unit/server/routers/career-playbook-course-bridge.service.test.ts` — 65 tests.
- Passed: `pnpm --filter @megacampus/course-gen-platform type-check`.
- Passed: `pnpm type-check`.
- Passed: `pnpm build`.

## Documentation

- docs-reviewed: updated - `docs/career-playbook/architecture.md` now describes bridge `semi_automatic`, clarifying questions, synthetic source metadata, and pre-course business-context failure behavior.
- project-index: reviewed-no-change - no new packages, routes, entrypoints, integrations, verification commands, or ownership boundaries were added.

## Knowledge Graph

- graph-reviewed: updated - ran `graphify update .` successfully, then reran after docs update; second run required `graphify update . --force` because Graphify refused to overwrite a smaller regenerated graph. Final result: 54,794 nodes, 79,233 edges, 3,405 communities.

## Explicit Defers

- Existing Dev course `c5cd1cc8-f24b-4f55-9dcd-795dbc0d6aa9` and other already-generated affected courses still need an authorized live-data repair/regeneration/backfill; no dev/prod data mutation was performed in this stage.
- Build warnings were pre-existing/environmental and not fixed here: Browserslist `caniuse-lite` stale and Node `[DEP0169] url.parse()` deprecation during `next build`.
