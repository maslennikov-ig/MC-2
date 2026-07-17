---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-plan-builder
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-plan-builder
base_branch: codex/self-hosted-qdrant-platform
base_commit: c1d0ca611fb5106d2a6752e3a755817948be92fd
worktree: /home/me/code/mc2/.worktrees/q12-plan-builder
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: >-
  Isolated worktree /home/me/code/mc2/.worktrees/q12-plan-builder and branch
  codex/q12-plan-builder left in place for orchestrator integration; no push.
  Disposable postgres:17.10-bookworm containers from the real-PG17 proof are
  removed on each test exit (docker rm -f in a finally block).
risk_level: medium
verification:
  - 'RED (impl absent): plan suite 10 failed | 1 skipped (runner errors: run_plan/plan subcommand missing).'
  - 'GREEN unit: tests/unit/ops/q12-migration-plan.test.ts 10 passed | 1 skipped (SUPABASE_URL/KEY synthetic).'
  - 'GREEN real-PG17 (MC2_Q12_REAL_PG17=1): 11 passed — real structural capture builds a barrier-valid catalog.'
  - 'Emitted catalog passes the frozen q12-database-barrier.sh expected-catalog jq filter (extracted from the frozen script bytes) and self-binds expected_catalog_sha256 = sha256(file bytes).'
  - 'Regression: q12-command-manifest + q12-retained-barrier-w-composition-seam + q12-live-cutover = 289 passed.'
  - 'pnpm type-check / tsc --noEmit exit 0.'
  - 'Frozen bytes unchanged: q12-command-manifest.json aaec6fc2… and q12-database-barrier.sh 134255ce… sha256 verified after all edits.'
changed_files:
  - deploy/qdrant/q12-lifecycle-core.py
  - deploy/qdrant/q12-live-cutover.sh
  - deploy/qdrant/q12-migration-plan-capture.py
  - packages/course-gen-platform/tests/unit/ops/q12-migration-plan.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-migration-plan-runner.py
explicit_defers:
  - 'Production LivePlanExecutor.capture() live-window restore leg (fresh source snapshot -> pinned isolated Supabase image restore -> in-isolate migration of the five release-SHA files): the read-only SQL projection it reuses is implemented and real-PG17-proven, but the isolated-restore-of-real-source orchestration is unexercisable in CI (no source/archive access) and currently raises a clear fail-closed LifecycleError. Needs a follow-up bead + owner-window wiring against restore-supabase-drill.sh before the live `plan` run.'
---

# Summary

Implemented the non-mutating Q12 `plan` mode that builds the frozen
`expected-post-migration-catalog.json` the C1 live window is blocked on, exactly
per the accepted corrections design (§2, lines ~395–414). No implementation of
this builder existed anywhere in the repo before this stream (every prior hit for
`expected-post-migration-catalog` was a consumer/validator).

Two RED→GREEN commits on `codex/q12-plan-builder`:

- `a46c6173` (RED): plan-builder unit suite + fake-`PlanExecutor` runner fixture
  - gated real-PG17 capture proof, failing because the `plan` subcommand does not
    yet exist.
- `28ec3448` (GREEN): the `plan` mode and the read-only capture helper.

What the change adds:

- `deploy/qdrant/q12-lifecycle-core.py`: a new `plan` argparse subcommand
  (`--run-id`, `--release-sha`, `--db-url-file`, `--ca-file`, optional
  `--generation`/`--run-root`), `run_plan()`, an injectable `PlanExecutor`
  protocol, deterministic `assemble_expected_catalog()`, a fail-closed
  `validate_expected_catalog()` that mirrors the frozen barrier + source-manifest
  contract, owner-only `0400` immutable emission at
  `/opt/megacampus/backups/q12/<run-id>/expected-post-migration-catalog.json`
  (via the existing `immutable_publish`), and a production `LivePlanExecutor`.
- `deploy/qdrant/q12-migration-plan-capture.py`: a read-only helper that runs the
  frozen `q12-structural-catalog.sql` projection (structural SHA-256) plus the
  guarded-relations / reduced-cron / public-relation projections in one
  `REPEATABLE READ READ ONLY` transaction, via a host-`psql` (TLS) or
  `docker exec` seam. It never prints secrets and issues no writes.
- `deploy/qdrant/q12-live-cutover.sh`: minimal, honest routing — a `plan` or
  `--plan` first token selects the new mode; everything else stays `supervisor`.
  The source contains no `joined`/`profile` tokens and still rejects
  `--fixture`/`--joined`, so the two existing wrapper tests keep passing.

The catalog builder is the sole authority for the artifact shape: it derives
`expected_post_migration_catalog_sha256` from `migrations["20260711151000"].catalog_sha256`,
freezes `baseline_structural_sha256`, `migration_frontier=20260704150249`, the
76 `guarded_relations`, the 8 reduced `cron_jobs`, and the two migration guard
checkpoints (base `20260711140000`, observability `20260711151000`) with their
sorted new relations and file hashes, then validates and emits.

# Verification

- RED proof (implementation stashed/removed): `q12-migration-plan.test.ts`
  reported `10 failed | 1 skipped` — the runner errored because `run_plan` and
  the `plan` subcommand were absent.
- GREEN unit run (`SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=synthetic-test-key
pnpm vitest run --config vitest.config.unit.ts tests/unit/ops/q12-migration-plan.test.ts`):
  `Test Files 1 passed`, `Tests 10 passed | 1 skipped`. Positive case asserts the
  emitted file is mode `0400`, its bytes satisfy the **frozen barrier jq filter
  extracted from `q12-database-barrier.sh`**, `expected_catalog_sha256` equals
  `sha256(file bytes)` (self-binding), migration relations are canonically sorted,
  `inventory_counts` is exact, and a second identical run re-publishes byte-equal.
  Seven negative cases (drop a guarded relation, rename a storage table, guard
  `auth.schema_migrations`, unexpected migration key, guarded/migration identity
  collision, broken frontier, non-`postgres` cron username) fail closed and emit
  no catalog.
- GREEN real-PG17 run (`MC2_Q12_REAL_PG17=1 … tests/unit/ops/q12-migration-plan.test.ts`):
  `Tests 11 passed`. It stands up a disposable `postgres:17.10-bookworm`, builds a
  Supabase-shaped source (47 public + 22 auth + 5 named storage + `cron.job` +
  `net.http_request_queue` = 76 guarded, plus `realtime.messages`,
  `cron.job_run_details`, `net.http_response` decoys the schema/name filter must
  drop), captures via the real helper (asserting exactly 76 guarded + 8 cron +
  frontier `20260704150249`), applies the base + observability packets, diffs the
  new relations, and proves the assembled catalog passes the frozen barrier
  filter with `baseline_structural_sha256`/`expected_post_migration_catalog_sha256`
  bound to the real captured structural hashes.
- Regression (`pnpm vitest run … q12-command-manifest.test.ts
q12-retained-barrier-w-composition-seam.test.ts q12-live-cutover.test.ts`):
  `Tests 289 passed`. `pnpm type-check` / `tsc --noEmit`: exit 0.
- Frozen bytes: `q12-command-manifest.json` sha256
  `aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841` and
  `q12-database-barrier.sh` sha256
  `134255cecfb4361d5e9f1922d98f889ab7d3e01898b197dee096ab720039ed68` re-verified
  unchanged after all edits; `q12-live-cutover.test.ts` and no existing test were
  modified or weakened.
- Consumer acceptance: the emitted catalog passes consumer (a)
  `q12-database-barrier.sh` (the frozen jq schema/inventory gate, driven with the
  script's own filter bytes) and its sha binding. Consumer (b)
  `q12-source-manifest.ts` `validateExpectedCatalog` shape constraints are a strict
  subset of that barrier gate (identical top-level keys, inventory, guarded/cron
  shapes, migration keys `20260711140000`/`20260711151000`, relation shape/sort,
  global identity uniqueness, and `migrations["20260711151000"].catalog_sha256 ==
expected_post_migration_catalog_sha256`) and are additionally re-enforced,
  fail-closed, inside `validate_expected_catalog()`. Consumer (c) `buildExpectedCatalog`
  in `q12-database-barrier.test.ts` (keys/shape) matches the emitted shape exactly.

# Risks / Follow-ups

- Production live-window restore leg is an explicit, disclosed defer (see
  `explicit_defers`). `LivePlanExecutor.capture()` currently raises a clear
  fail-closed `LifecycleError` rather than silently pretending to restore; the
  read-only capture projection it will reuse (`q12-migration-plan-capture.py`) is
  implemented and real-PG17-proven. The remaining work — fresh source snapshot,
  isolated pinned-image restore following `restore-supabase-drill.sh`, in-isolate
  application of the five release-SHA migration files, structural-equality proof,
  and blocking teardown — is not reproducible in CI without owner-only source and
  archive access, so it must be wired and exercised inside the owner-approved live
  window. Recommend a follow-up bead under `mc2-jz6y0.13`.
- The vanilla `postgres:17.10` image runs `postgres` as a superuser, so the
  auth/storage `has_table_privilege(..., 'TRIGGER')` exclusion (which drops
  `auth.schema_migrations`/`storage.migrations` in real Supabase where `postgres`
  is not a superuser) cannot be exercised there; the structural SQL also reads the
  superuser-only `pg_subscription.subconninfo`, so demoting `postgres` would break
  capture. The real-PG17 proof therefore exercises the schema/name-based exclusion
  with decoys, and the TRIGGER-privilege exclusion is covered by the synthetic
  unit evidence + the negative case that rejects guarding `auth.schema_migrations`.
  The guarded projection SQL mirrors the already-reviewed `q12-source-manifest.ts`
  authoritative-relation query.
- `migration_file_sha256` per guard checkpoint is the SHA-256 of that checkpoint's
  keyed migration file (`20260711140000`, `20260711151000`), matching the frozen
  two-key `migrations` map the consumers require; the intermediate base-packet
  files (`120000`/`130000`/`150000`) are integrity-pinned by the migration CLIs
  themselves and are reflected in the per-checkpoint structural `catalog_sha256`.
