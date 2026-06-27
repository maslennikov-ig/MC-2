# Stage Summary: mc2-db696.83

Date: 2026-06-26
Branch: `codex/career-playbook-live-smoke-fixes`
Worktree: `/home/me/code/mc2`
Status: completed locally, pending feature-branch delivery

## Goal

Fix Career Playbook live E2E regressions exposed by the full mutation smoke pass:

- `mc2-db696.83` public share lookup returned 404 when the dev DB lacked role-guide image columns.
- `mc2-db696.84` course bridge Stage 2 could exceed Jina late-chunking token limits.
- `mc2-db696.85` official live smoke omitted the required `business_context` phase.
- `mc2-6g1rr` generation crashed when the model omitted required group blocks.

## Routing Reviewed

- Repo contract: `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, `.codex/project-index.md`.
- Beads: `mc2-db696.83`, `mc2-db696.84`, `mc2-db696.85`, `mc2-6g1rr`.
- Graphify: read `graphify-out/GRAPH_REPORT.md`; used focused local source tracing because Graphify queries were low-signal for the exact smoke failures. Graph will be refreshed during closeout after code changes.
- Docs L1/L2: no current dependency/API lookup was needed for implementation after local error traces identified repo-owned failures; Jina behavior was verified through provider response handling and tests, not docs assumptions.
- Reuse/build-vs-buy: reused existing Career Playbook smoke runner, library service, shared embedding client, group splitter contract, and existing verification scripts.

## Parallel Decomposition

| Stream            | Goal                                                                   | Agent                     | Write Zone                                                | Dependencies | Verification                                                | Decision |
| ----------------- | ---------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------- | ------------ | ----------------------------------------------------------- | -------- |
| S1 `mc2-db696.83` | Public share/image-column compatibility and DB repair migration        | local orchestrator/worker | Supabase migration, Career Playbook library service/tests | none         | targeted library/router unit tests, live public share smoke | accepted |
| S2 `mc2-db696.84` | Prevent Jina token-limit failures in course bridge Stage 2             | local orchestrator/worker | shared embedding generation/tests                         | none         | embedding unit tests, live course bridge smoke              | accepted |
| S3 `mc2-db696.85` | Update live smoke for `business_context` and course bridge status wait | local orchestrator/worker | smoke runner/scripts/validation/tests                     | none         | smoke runner unit tests, live mutation smoke                | accepted |
| S4 `mc2-6g1rr`    | Keep generation from crashing on missing group blocks                  | local orchestrator/worker | Career Playbook group generator/tests                     | none         | group-generator unit test, live generation smoke            | accepted |

Visible subagents were authorized, but the work was kept local after discovery because the branch already contained shared smoke state and the fixes touched overlapping backend runtime/test gates; separate write-heavy subagent worktrees would have increased reconciliation risk more than speed.

## Implementation Outcome

- Added rollout-compatible public share fallback when image columns are missing, plus idempotent DB repair migration for Career Playbook image fields.
- Hardened shared Jina embedding generation with `truncate: true` and adaptive split/retry for late-chunking token-window 422 responses.
- Updated live smoke to submit `business_context`, support resume mode, wait for course document-processing status, and validate course bridge failures explicitly.
- Added group-generator fallback blocks and structured critical quality issues when required model group blocks are omitted.
- Fixed tRPC auth header extraction for lowercase `authorization`.

## Verification

- `git diff --check`: passed before stage-file closeout edits.
- `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/career-playbook-library-service.test.ts tests/unit/server/routers/career-playbook.router.test.ts tests/unit/shared/embeddings/generate.test.ts tests/unit/smoke/career-playbook-live-smoke.test.ts tests/unit/stages/stage-career-playbook/group-generator.test.ts tests/unit/stages/stage-career-playbook/final-assembler.test.ts`: passed, 6 files / 88 tests.
- `pnpm type-check`: passed.
- `pnpm build`: passed; pre-existing warnings remained for stale Browserslist data and Node `url.parse()` deprecation.
- Live Career Playbook mutation smoke against local API/worker on dedicated queue passed with disposable fixture and `--include-course-bridge`.
- Live smoke evidence: all 27 required generated blocks present, deterministic checks passed, PDF export succeeded, public share resolved through canonical slug, course bridge created a course, and Stage 2 reached `stage_2_awaiting_approval`.
- Cleanup verified: smoke playbooks/courses/files/jobs/errors/org/user/auth user removed, local upload directory removed, smoke queue obliterated, and Qdrant vectors for smoke course IDs deleted.

## Explicit Defers

- `mc2-db696.86`: configured dev/staging cloud Qdrant endpoint returned `Not Found`; live E2E passed by overriding to local Docker Qdrant. Fix endpoint/key/collection config before relying on deployed dev worker for course bridge Stage 2.
- `mc2-db696.87`: Career Playbook cleanup helper has import-time side effects in tsx stdin/script context; cleanup used a safe inline script instead. Make cleanup utilities import-safe.
- Pre-existing build warnings were not fixed: Browserslist `caniuse-lite` stale and Node `[DEP0169] url.parse()` deprecation during Next build.

## Closeout Markers

- docs-reviewed: no-change-needed - implementation changes internal smoke tooling, DB rollout compatibility, and backend remediation behavior; stable navigation already lists the touched entrypoints and no public/operator docs need new behavior instructions beyond tracked Beads defers.
- graph-reviewed: updated - `graphify update . --force` rebuilt the local code graph, then `graphify cluster-only . --no-viz` refreshed `GRAPH_REPORT.md`; final report shows 52,602 nodes, 77,116 edges, and 3,273 communities.
- project-index: reviewed-no-change - existing project index already covers Career Playbook routes, library service, smoke commands, migrations, shared contracts, and Graphify verification entrypoints.
