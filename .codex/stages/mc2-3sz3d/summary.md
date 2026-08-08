# Stage `mc2-3sz3d` — backend Vitest exit integrity

Active stage id: `mc2-3sz3d`
Status: in progress.

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

## Reviews

Documentation: docs-resolve - installed Vitest 4.1.8 runtime and types were inspected because
`globalSetup` and `passWithNoTests` are versioned external behavior.

docs-reviewed: updated - the test-only Qdrant opt-out will be documented in the package env
example.

project-index: reviewed-no-change - no stable product entrypoint or ownership boundary changes.

graph-reviewed: used - focused local Graphify query confirmed global setup ownership of worker,
Redis, and Qdrant bootstrap; refresh waits for accepted changes.

## Next action

Add failing config/setup/teardown tests, implement the minimal exit and opt-out changes, then run
the bounded acceptance set.
