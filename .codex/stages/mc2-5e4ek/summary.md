# Stage mc2-5e4ek Summary

Status: review-and-fix complete with E2E blockers tracked
Branch: `codex/single-source-course-generation-flow`
Base branch: `develop`
Base commit: `96f82eb63cd82223237742e6002e4651d7dd34bb`
Started from: `cf35a67087d2c99eb1ab2375ac4a4bfc6166670d`

## Classification / Routing

Classification: medium/complex, review-heavy, backend + UI + docs + E2E.
Routing: `orchestrator-stage`, `code-review`, `systematic-debugging`, `verification-before-completion`, `orchestration-closeout`, `webapp-testing`/`playwright`.

Graphify: read `graphify-out/GRAPH_REPORT.md`; ran `graphify update .` during closeout, rebuilding 58005 nodes / 80426 edges / 3737 communities. `graph.html` was skipped because the graph is too large.

## Parallel Decomposition Matrix

| Stream | Goal                     | Owner                | Write zone           | Dependencies       | Verification                | Decision | Reason                               |
| ------ | ------------------------ | -------------------- | -------------------- | ------------------ | --------------------------- | -------- | ------------------------------------ |
| S1     | Correctness review       | correctness_reviewer | read-only            | none               | targeted backend tests      | parallel | Independent review lens              |
| S2     | Improvement review       | improvement_reviewer | read-only            | none               | accepted fixes + type-check | parallel | Independent maintainability/UX lens  |
| S3     | QA/E2E review            | qa_expert            | read-only            | local/dev env      | preflight + Playwright      | parallel | Independent verification lens        |
| S4     | Docs review              | docs_reviewer        | read-only            | none               | docs updates + build        | parallel | Durable docs risk                    |
| S5     | Prompt regression review | orchestrator local   | prompt/policy review | agent thread limit | official docs + tests       | local    | Prompt subagent could not be spawned |

## Accepted Findings / Fixes

- Preserved `course_size` and bridge `settings` in Stage 5 job input builders.
- Added blocking `section_count_out_of_bounds` validator issue.
- Recomputed `generation_metadata.quality_scores.structure` after Stage 5 field updates, regeneration, chat structural operations, and element add/delete.
- Added regression tests for Stage 5 profile preservation, section bounds, and stale structural metadata clearing.
- Updated Stage 5 UI i18n for section-count blocker.
- Updated durable docs and DB reference for the structure quality contract.

## Rejected / Deferred Findings

- Raw LLM metadata validation before reconciliation was rejected as a must-fix; persisted metadata is intentionally reconciled first.
- `mc2-5e4ek.2`: centralize Stage 5 structural quality UI state contract and add behavioral UI tests.
- `mc2-pmrmf.1.1`: add read-only model config health check for deprecated provider model IDs.
- `mc2-5e4ek.1`: Career Playbook viewer-editor authenticated E2E fixture returns `Failed to fetch`.
- `mc2-pmrmf.1`: live dev course bridge E2E remains blocked by runtime model config using deprecated Grok 4.1 Fast.

## Verification

- `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/stage5-structural-quality.test.ts tests/unit/server/routers/generation/lifecycle/generate.router.test.ts tests/unit/server/routers/generation/build-stage5-job-input.test.ts tests/unit/server/routers/generation/editing/structural-quality-metadata.test.ts tests/unit/stages/stage5-generation/section-batch-constraints.test.ts tests/unit/shared/auto-approval/force-auto-approval.test.ts`: passed, 6 files / 10 tests.
- `pnpm --filter @megacampus/web exec eslint components/generation-graph/controls/ApprovalControls.tsx components/generation-graph/panels/stage5/Stage5OutputTab.tsx components/generation-graph/panels/stage5/types.ts`: passed.
- `pnpm type-check`: passed.
- `pnpm build`: passed.
- `git diff --check`: passed.
- `pnpm --dir packages/course-gen-platform smoke:career-playbook:preflight --target dev --json`: passed, read-only.
- `PLAYWRIGHT_PORT=3101 pnpm --filter @megacampus/web test:e2e:career-playbook`: failed, 4/5 passed; `viewer-editor authenticated flow` failed with missing `Sales Director` heading and UI `Role Guide is unavailable / Failed to fetch`.

## Docs / Graph

docs-reviewed: updated - structure policy, Career Playbook architecture, Stage 4/5 READMEs, and Supabase DB reference now reflect profile bounds, blockers, edit recomputation, and `quality_scores.structure`.

graph-reviewed: updated - `graphify update .` passed without LLM/API extraction and refreshed `graphify-out/GRAPH_REPORT.md` / `graph.json`.

project-index: reviewed-no-change - no new route, package, entrypoint, or ownership boundary was introduced.

## Explicit Defers

- `mc2-5e4ek.1`
- `mc2-5e4ek.2`
- `mc2-pmrmf.1`
- `mc2-pmrmf.1.1`
