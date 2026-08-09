# Stage `mc2-3sz3d` — backend Vitest exit integrity

Active stage id: `mc2-3sz3d`
Status: accepted locally; remote delivery was not requested.

## Scope

Make the default backend Vitest bootstrap, empty-run, and cleanup failure paths nonzero. Preserve
strict Qdrant bootstrap by default and provide only an exact, visible test-only opt-out. Do not
change Qdrant compatibility, schema, or live state.

## Root-cause evidence

- `tests/global-setup.ts` throws when Qdrant bootstrap fails, as intended.
- Installed Vitest 4.1.8 uses `passWithNoTests` to decide whether zero test modules fail; the shared
  config sets it to true.
- The same global teardown calls `process.exit(0)` if worker or Redis cleanup fails, so it can
  overwrite a prior failing status.
- The reachable local Qdrant is 1.17.1 while the repository compatibility contract requires 1.18.2;
  changing that contract is not a justified fix.
- A safe loopback run reproduced the bootstrap failure and misleading code-0 message but ended 1;
  the exact historical live-config exit 0 was not rerun because bootstrap can mutate live Qdrant.

## Classification and acceptance boundary

Medium root-owned backend test-infrastructure slice. Acceptance covers the default backend Vitest
config, global setup/teardown exit behavior, one explicit opt-out, focused unit tests, and a safe
loopback child-process proof.

## Implementation evidence

- `f2eab74db` overrides `passWithNoTests` to false in the default backend config.
- Global setup keeps Qdrant strict by default and accepts only the exact value
  `SKIP_QDRANT_TEST_SETUP=1` as a visible opt-out; worker startup remains mandatory.
- Global teardown now forces exit 1, never exit 0, when either worker or Redis cleanup fails.
- The opt-out is documented beside Qdrant settings in the package env example.
- Focused TDD: 8/20 checks failed against the old behavior, then 21/21 passed after both cleanup
  owners were covered.
- Safe child process: an unreachable loopback Qdrant produced the expected bootstrap error,
  reported no-tests code 1, and exited 1 without a code-0 message.

## Reviews

Documentation: docs-resolve - installed Vitest 4.1.8 runtime and types were inspected because
`globalSetup` and `passWithNoTests` are versioned external behavior.

docs-reviewed: updated - the test-only Qdrant opt-out will be documented in the package env
example.

project-index: reviewed-no-change - no stable product entrypoint or ownership boundary changes.

graph-reviewed: updated - focused local Graphify query confirmed global setup ownership of worker,
Redis, and Qdrant bootstrap; after `f2eab74db`, the graph was rebuilt without semantic/API
extraction to 61,117 nodes and 88,027 edges, then reclustered to 7,267 communities.

## Acceptance

- Focused backend unit tests through `vitest.config.unit.ts` — 21/21 passed after 8 checks failed
  against the old behavior.
- Safe child-process bootstrap — unavailable loopback Qdrant reported no-tests code 1 and exited 1
  without a code-0 message.
- `pnpm run type-check` — passed.
- `pnpm run build` — passed; the pre-existing Node `DEP0169` warning remains tracked by
  `mc2-p2908.1`.
- Canonical process verification — passed; receipt:
  `.codex/stages/mc2-3sz3d/acceptance-receipt.json`.
- Beads issue `mc2-3sz3d` — closed with product commit `f2eab74db`.

## Delivery / Cleanup

The accepted change is committed on local `develop`. No child worktree or branch existed to clean.
No merge, push, deploy, live integration suite, Qdrant mutation, reindex, migration, paid call,
secrets, or access change was performed.

## Next action

Stop at `mc2-q1ggs` and obtain the owner decision required by §8 before implementation continues.
