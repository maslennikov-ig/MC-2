# Stage Summary: mc2-db696.86

Date: 2026-06-26
Branch: `codex/career-playbook-live-smoke-fixes`
Worktree: `/home/me/code/mc2`
Status: completed locally; `mc2-db696.86` remains externally blocked for cloud endpoint validation

## Goal

Resolve the two follow-ups left by Career Playbook live-smoke closeout:

- `mc2-db696.86`: dev Qdrant endpoint/config made course bridge smoke require a local Qdrant override.
- `mc2-db696.87`: importing Qdrant collection/cleanup utilities could trigger collection creation as an import-time side effect.

## Runtime And Routing

- Requested `orchestration-bridge:orchestrator-stage` is not installed in this Codex runtime; used installed `orchestrator-stage` equivalent.
- Claude CLI exists locally (`claude 2.1.183`), but this thread is running in Codex Desktop. No hidden Claude-native agents were used.
- Repo contract read: `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`.
- Beads selected: `mc2-db696.86`, `mc2-db696.87`.
- Graphify used: `graphify-out/GRAPH_REPORT.md` plus focused low-signal Qdrant/cleanup queries.
- Docs L1/L2: `orch-prompts docs-resolve` for `@qdrant/js-client-rest@1.18.0` returned `fallback-needed`; official Qdrant Cloud docs were checked for REST endpoint behavior.
- Prompt gate: `orch-prompts prompt-check --runtime codex --profile gpt-5.5 --kind worker` passed for the Qdrant diagnostic prompt and cleanup worker prompt.

## Parallel Decomposition

| Stream            | Goal                                                            | Agent                                                  | Write Zone                                                                               | Dependencies                                             | Verification                                        | Decision                                  |
| ----------------- | --------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------- |
| S1 `mc2-db696.86` | Diagnose Qdrant endpoint 404 and fix tracked dev runtime wiring | Volta debugger + local orchestrator                    | `docker-compose.dev.yml`, read-only Qdrant probes                                        | no live mutation; correct cloud endpoint/key is external | masked read-only Qdrant probe, compose config check | parallel read-only diagnosis, local patch |
| S2 `mc2-db696.87` | Make `create-collection.ts` safe to import                      | local orchestrator (spawn for worker hit thread limit) | `packages/course-gen-platform/src/shared/qdrant/create-collection.ts`, focused unit test | none                                                     | RED/GREEN import-safety test                        | local                                     |

## Implementation Outcome

- Dev compose now overrides `QDRANT_URL=http://qdrant-dev:6333` for `api-dev`, `worker-dev`, and `worker-stage6-dev`, aligning runtime with the local `qdrant-dev` service and existing dev health check.
- Read-only Qdrant probe confirmed current local cloud URL/API-key pair returns plain HTTP 404 on `/collections`, so this is not a missing `course_embeddings` collection.
- `create-collection.ts` now uses full resolved path comparison for direct execution instead of basename suffix matching.
- Added unit coverage proving import with the same basename does not call Qdrant and exact path direct-execution detection still works.

## Verification So Far

- `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/shared/qdrant/create-collection.test.ts`: failed before fix as expected.
- `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/shared/qdrant/create-collection.test.ts`: passed after fix.
- `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/shared/qdrant/create-collection.test.ts tests/unit/shared/qdrant/lifecycle.test.ts tests/unit/shared/rag/document-availability.test.ts`: passed, 3 files / 11 tests.
- `docker compose -f docker-compose.dev.yml config --no-interpolate --quiet`: passed.
- `git diff --check`: passed.
- `python3 scripts/orchestration/run_stage_closeout.py --stage mc2-db696.86`: passed, including `pnpm type-check`, `pnpm build`, and process verification.

## Explicit Defers

- `mc2-db696.86`: cloud endpoint/key itself is still not verified fixed. Current configured cloud endpoint returns plain `404 page not found` on `/collections`; fixing that requires a valid active Qdrant database endpoint/API key or Qdrant Cloud console access. The tracked dev-compose fix avoids that bad cloud URL for dev containers.

## Closeout Markers

- docs-reviewed: no-change-needed - compose/runtime wiring and internal Qdrant utility behavior are tracked in stage artifacts and Beads; stable project index already lists deploy and Qdrant entrypoints.
- graph-reviewed: updated - `graphify update . --force` and `graphify cluster-only . --no-viz` completed; final report shows 52,430 nodes, 76,670 edges, and 3,272 communities.
- project-index: reviewed-no-change - no new stable entrypoint or ownership boundary was added.
