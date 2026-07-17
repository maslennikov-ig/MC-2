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
  Disposable postgres:17.10-bookworm resources from the real-PG17 suites are
  reclaimed on each run (executor teardown + fake-drill/test cleanup); post-run
  docker filters show zero leftovers.
risk_level: medium
verification:
  - 'Drill-seam consumption RED->GREEN: 0e2cae74 -> a8f355f2. §3 role bootstrap: dc0d9cc6 -> 6a0825fa. Persist seam: 28e75d8c -> 93f01595. Live orchestration: ee04d555 -> 2b6b16ad. Builder: a46c6173 -> 28ec3448.'
  - 'Unit + drill (no docker): q12-migration-plan.test.ts + supabase-restore-drill.test.ts = 65 passed | 6 skipped.'
  - 'Real-PG17 (MC2_Q12_REAL_PG17=1): 25 passed — capture, direct-mode end-to-end, drill-seam consumption (fake drill: correct drill argv + persist-handle env, restore_test dbname routing, migrate/capture through the handle, teardown of container/network/volume + handle + generation), malformed-handle fail-closed with zero leaked resource, plus equality-mismatch and teardown-override negatives.'
  - '44 existing drill tests pass UNMODIFIED (default byte-identical); pnpm type-check / tsc --noEmit exit 0; python3 compile OK; drill bash -n OK.'
  - 'Frozen bytes unchanged: q12-command-manifest.json aaec6fc2…, q12-database-barrier.sh 134255ce…; q12-live-cutover.test.ts and all existing tests untouched; frozen pg.restore argv untouched.'
changed_files:
  - deploy/qdrant/q12-lifecycle-core.py
  - deploy/qdrant/q12-live-cutover.sh
  - deploy/qdrant/q12-migration-plan-capture.py
  - deploy/qdrant/q12-migration-plan-roles.py
  - deploy/postgres/restore-supabase-drill.sh
  - packages/course-gen-platform/tests/unit/ops/q12-migration-plan.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-migration-plan-runner.py
  - packages/course-gen-platform/tests/unit/ops/supabase-restore-drill.test.ts
explicit_defers:
  - "Supabase-image-only leg (real drill restore of the real source on the pinned image + real migration CLIs) is CI-unreproducible: the drill checks the pinned image digest / Supabase role bootstrap / extension versions, and the CLIs' security manifests are pinned to the isolated restore of generation-20260716T105950Z (document-evidence-approved.ts:1250-1356). Validated by the owner's server-side pre-C1 `q12-live-cutover.sh plan` run (read-only on the source, fail-closed everywhere, so a defect blocks the window rather than corrupting anything). Loopback needs no --confirm/--allow-remote (document-evidence-approved.ts:648 returns early for 127.0.0.1/localhost/::1 before the remote gate). If prod schema drifted since that generation the manifests fail closed — a correct product-truth outcome, not to be relaxed."
---

# Summary

Wired production `LivePlanExecutor` to restore through the reviewed
`restore-supabase-drill.sh` via its persist seam instead of the direct
`pg_dump | pg_restore` path (now a test-only seam, `MC2_Q12_PLAN_RESTORE_MODE=direct`).
Round-5 RED->GREEN: `0e2cae74` -> `a8f355f2`.

- `_produce_generation`: a diagnostic backup generation (NOT the accepted
  recoverable backup) — `database.dump` and `roles.sql` streamed read-only,
  `source-manifest.json` via the reviewed `q12-source-manifest.ts` in production
  (placeholder under a CI source container), `checksums.json` computed.
- `_restore_via_drill`: invoke the drill with a synthetic run capability and
  `MC2_Q12_RESTORE_PERSIST_HANDLE`, then parse and fail-closed validate the
  owner-only 0400 handle (schema_version / run_id / host / int port / restore_test).
- `_read_handle` + dbname routing: migrate and capture run against the handle's
  `restore_test` connection; the capture helper gained a validated `--dbname`
  (`q12-migration-plan-capture.py`) so it never silently reads `postgres` when the
  drill restored into `restore_test`. Source `guarded_relations`/`cron_jobs`/
  `baseline`/`frontier` still come from the SOURCE capture (live OIDs the barrier
  re-matches); the isolate contributes only checkpoint structural shas and relation
  deltas.
- `teardown` reclaims the drill's container/network/volume PLUS the persist handle
  and the diagnostic generation; a teardown failure overrides success.

Load-bearing justification for reusing the drill's `restore_test` (team-lead item 3):
`q12-structural-catalog.sql` has no database-name field in `database_row`
(lines 33-88 build owner/encoding/locale/acl/settings/comment/… but never
`datname`; `current_database()` appears only in the WHERE at line 88) and excludes
the three drill overrides from the settings hash (`default_transaction_read_only`,
`cron.database_name`, `cron.launch_active_jobs` at line 69), so the source
`postgres` and the isolated `restore_test` yield the same structural sha — the
pre-migration equality proof holds against the drill restore. The one real
database-property difference the real drill replicates is the db comment; the CI
fake drill replicates it too.

# Verification

- Drill-consumption RED (`0e2cae74`, impl absent): both fake-drill tests failed
  (no drill invocation). GREEN (`a8f355f2`) they pass.
- Real-PG17 (`MC2_Q12_REAL_PG17=1`): `25 passed`. The fake-drill test restores into
  `restore_test`, publishes a 0400 handle, and asserts LivePlanExecutor passed the
  drill `--run-id`/`--generation`/`--q12-db-capability-file` argv + the
  `MC2_Q12_RESTORE_PERSIST_HANDLE` env, migrated/captured `restore_test` through the
  handle, emitted a barrier-valid catalog (76 guarded, observability delta =
  `document_evidence_observability_totals`), and tore down container+network+volume
  - handle + generation (zero leftovers). The malformed-handle case fails closed
    with no leaked resource. Direct-mode end-to-end, equality-mismatch, and
    teardown-override still hold; the §3 role bootstrap still gates the restore.
- Unit + drill (no docker): `65 passed | 6 skipped`; 44 existing drill tests
  unmodified; `tsc` exit 0; frozen bytes re-verified; `q12-live-cutover.test.ts`
  untouched.
- P3 (team-lead item 4): the migration CLIs run in loopback mode with only
  `SUPABASE_DB_URL` — `validateDocumentEvidenceApprovedMigrationTarget`
  (document-evidence-approved.ts:634) returns at :648 for 127.0.0.1/localhost/::1
  BEFORE the `--allow-remote`/`--confirm`/sslmode gate; `apply` applies all three
  base files and observability `apply-all` applies both. Loopback accepts the
  `restore_test` dbname (the URL path segment is the database).

# Risks / Follow-ups

- The Supabase-image-only leg (real drill + real source + real CLIs, and the real
  `q12-source-manifest.ts` generation) is server-validated per decision B; CI proves
  the whole consumption mechanics with a fake drill on vanilla PG17. This boundary
  is intentional and fail-closed (the pre-C1 run is read-only on the source), so a
  defect blocks the window rather than corrupting anything — see `explicit_defers`.
- The gated real-PG17 suite's container-readiness race is fixed: EVERY `pg_isready`
  wait in the file (the round-2 capture test at :387, both `beforeAll` sources at
  :652/:1053, and the fake-drill script at :1123) is now marker-gated on
  "PostgreSQL init process complete; ready for start up." — the temp init server
  stops before that line prints, so a post-marker `pg_isready` reflects only the
  final server and setup can never land in the restart window. Re-verified stable
  across four consecutive `MC2_Q12_REAL_PG17=1` runs (25 passed each). The suite is
  skipped without the flag, so the default path is deterministic and docker-free.
- The drill persist seam (round 3) and the direct restore + §3 bootstrap (round 4)
  remain: the seam is the reuse point this stream consumes; the direct path stays as
  the CI seam and is not reachable in production.
