# Stage Summary: mc2-evr7l

## Scope

- Investigated failed production/stage course `default-organization/sekretar`: Stage 2 failed during Qdrant upload for generated source document `career-playbook-sekretar.md` with `404 page not found` after 3 retries.
- Added Qdrant upload error classification so non-retryable `Not Found`/invalid configuration errors fail fast instead of wasting retries.
- Added a 3-hour delayed recovery policy for retryable Qdrant outages, with retry delays of 5, 10, 20, then 30 minutes capped to the remaining recovery window.
- Changed Stage 2 document processing to move retryable Qdrant upload failures into BullMQ delayed state instead of immediately marking the course failed.
- Kept Stage 2 progress `in_progress` while waiting for Qdrant recovery, and preserved file `vector_status=indexing` during delayed recovery.
- Reused existing `notifyCourseError` Telegram path: retryable outages notify only after the 3-hour window is exhausted; non-retryable Qdrant configuration errors notify immediately.
- Preserved Qdrant SDK `status`/`data` details when wrapping upload errors so classification has enough context.
- Updated Stage 2 and automatic-generation notification docs.

## Routing

- Stage classification: medium/complex reliability fix touching Stage 2, shared Qdrant upload, BullMQ delayed control flow, shared job options, tests, docs, and Graphify closeout.
- Selected Beads task: `mc2-evr7l`.
- Docs L1/L2: `orch-prompts docs-resolve --cwd /home/me/code/mc2 --ecosystem npm --package @qdrant/js-client-rest --version 1.18.0 --topic "upsert getCollection 404 error status data Not Found retry classification" --runtime codex --profile gpt-5.5 --json` returned fallback-needed because L1 package install returned 404. Used official Qdrant docs for collection/upsert/client behavior.
- Graphify: read `graphify-out/GRAPH_REPORT.md`; focused query `graphify query "Qdrant upload stage document availability classifyQdrantAvailabilityError executeQdrantUpload" --limit 8` located Stage 2 upload, shared Qdrant upload, and existing RAG availability classification.
- Subagents: authorized by user’s earlier orchestrator instruction, but not launched for write streams because repo delegation requires clean dedicated worktrees and the primary worktree already had overlapping prior-stage changes.

## Parallel Decomposition Matrix

| Stream                | Goal                                                                         | Agent | Write zone                                         | Dependencies      | Verification                         | Decision                           |
| --------------------- | ---------------------------------------------------------------------------- | ----- | -------------------------------------------------- | ----------------- | ------------------------------------ | ---------------------------------- |
| Incident evidence     | Confirm why `sekretar` failed and whether current fixes cover it             | local | read-only Supabase, logs, Graphify                 | no prod mutation  | SQL evidence, code trace             | local                              |
| Qdrant classification | Distinguish retryable Qdrant outages from non-retryable config/404 errors    | local | Stage 2 Qdrant policy/upload tests                 | incident evidence | focused Vitest                       | sequential due shared error flow   |
| Durable recovery      | Keep Stage 2 alive for 3 hours via delayed recovery and Telegram final alert | local | Stage 2 handler, BaseJobHandler, job options       | classification    | focused Vitest, type-check, build    | sequential due coupled BullMQ flow |
| Docs/closeout         | Record behavior and refresh graph                                            | local | Stage 2 README, automatic-generation docs, handoff | code complete     | repo gates, Graphify, stage closeout | local                              |

## Verification

- RED observed: focused tests failed because `qdrant-recovery-policy` was missing and `Not Found` retried 3 times.
- Passed: `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/stages/stage2-document-processing/phase-6-qdrant-upload.test.ts tests/unit/stages/stage2-document-processing/qdrant-recovery-policy.test.ts` — 7 tests.
- Passed: `pnpm --filter @megacampus/course-gen-platform type-check`.
- Passed: `pnpm type-check`.
- Passed: `pnpm build`.

## Documentation

- docs-reviewed: updated - `packages/course-gen-platform/src/stages/stage2-document-processing/README.md` documents Qdrant short retries, 3-hour delayed recovery, and non-retryable notification behavior; `docs/features/automatic-generation-mode.md` documents Telegram behavior for Stage 2 Qdrant outages.
- project-index: reviewed-no-change - no new package, route, public API, or ownership boundary was added.

## Knowledge Graph

- graph-reviewed: updated - `graphify update . --force` completed after code/docs changes; final result 54,222 nodes, 78,728 edges, 3,372 communities.

## Explicit Defers

- No live/stage/prod course data was mutated. Existing failed course `c3662efb-4632-4902-945a-ad1e013ddde1` still needs explicit authorization for restart/regeneration.
- The durable recovery currently re-runs Stage 2 work on each delayed retry. Avoiding repeated embedding generation would require a larger follow-up: persist/reuse embeddings or resume from a stored vector-upload checkpoint.
- Build warnings were pre-existing/environmental and not fixed here: Browserslist `caniuse-lite` stale and Node `[DEP0169] url.parse()` deprecation during `next build`.
