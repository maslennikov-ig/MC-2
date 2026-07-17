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
  - 'Round-8 drill-generation preflight RED->GREEN: 0791805e -> 53b6fcce. Closes the whole generation preflight the server pre-C1 rehearsal fail-closed on (generation basename is invalid). Real-PG17 q12-migration-plan.test.ts: 45 passed — the end-to-end drill-seam test now drives production _produce_generation output through a fake drill that MIRRORS the real drill preflight (basename ERE + validate_generation Python block, both extracted verbatim from the drill bytes), sweeping the full set: generation-<UTCstamp>Z-<uuid> basename, 4-file layout, 0600 modes, checksums schema/generation/files/sha256/size, source-manifest schema. No-docker adds 5 round-8 cases (contract + item-4 run-dir cleanup). Drill suite supabase-restore-drill.test.ts: 46 passed UNMODIFIED. tsc exit 0. Frozen bytes aaec6fc2… / 134255ce… intact.'
  - 'Round-8 broad no-docker ops set (tests/unit/ops/): 876 passed | 59 skipped, 1 pre-existing failure in qdrant-observability-contract.test.ts (Q9 observability: .env.production.example lacks QDRANT_METRICS_GID) — outside the round-8 change surface (round-8 touched only q12-lifecycle-core.py + q12-migration-plan.test.ts + the plan runner fixture; the observability test and its ops/qdrant inputs are untouched).'
  - 'Round-7 hardening RED->GREEN: 4e752470 -> c6ac3a8d (P2-1 seam lockdown, P2-2 handle write/read binding, P3 a-d). Snapshot coordinator: b32ce5ed -> e92ec529. Drill-seam consumption: 0e2cae74 -> a8f355f2. §3 role bootstrap: dc0d9cc6 -> 6a0825fa. Persist seam: 28e75d8c -> 93f01595. Live orchestration: ee04d555 -> 2b6b16ad. Builder: a46c6173 -> 28ec3448.'
  - 'Round-7 real-PG17: 40 passed (all gated tests, drill positive still ends clean through the enhanced teardown + label sweep). No-docker suites: 79 passed | 7 skipped (adds 12 P2-1 seam-lockdown cases + 2 P2-2 handle-binding cases). tsc exit 0.'
  - 'Real-PG17 (MC2_Q12_REAL_PG17=1): 26 passed clean (first try) — incl. the drill-consumption positive that binds source capture + pg_dump to one exported snapshot via the coordinator, and the malformed-snapshot negative that hard-stops before the drill is invoked.'
  - 'Unit + drill (no docker): q12-migration-plan.test.ts + supabase-restore-drill.test.ts = 65 passed | 7 skipped.'
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

Round-8 closes the whole drill generation preflight (`0791805e` -> `53b6fcce`), after
the server pre-C1 rehearsal fail-closed at the real drill with `generation basename is
invalid` (teardown was clean, so the safety contract held — this is the mock-reality
drift class the rehearsal is designed to catch).

- Root cause + fix: `_produce_generation` named the dir `generation-<16hex>`, but the
  drill requires `^generation-[0-9]{8}T[0-9]{6}Z-[0-9a-f-]{36}$`
  (`restore-supabase-drill.sh` parse_arguments). `_generation_dirname` now builds
  `generation-<UTCstamp>Z-<run uuid>`; the stamp is bound once per run in `capture()`
  (deterministic per run, not per retry).
- Second latent mismatch (would have failed the very next check): the drill's
  `validate_generation` requires `checksums.json` carry `generation == basename`;
  `_write_checksums` omitted it. Now recorded.
- Full-set sweep instead of one field: the fake drill now MIRRORS the real drill's
  preflight — the basename ERE and the `validate_generation` Python block are extracted
  verbatim from the drill bytes (the P2-2 real-bytes technique) and run against the
  plan's actual generation before any resource is created. The real-PG17 end-to-end
  drill test therefore enforces the identical set the server drill does: 4-file layout,
  0600 modes, `checksums` schema/generation/files/sha256/size, `source-manifest` schema.
  A future drill preflight change now fails CI, not the live window. (The one real-drill
  check not mirrorable in CI — `pg_restore --list` TOC + pgTLE offline scan — needs the
  pinned Supabase image; the fake drill still does its own `pg_restore` into
  `restore_test`, and the real leg stays validated by the server pre-C1 run.)
- item-4 (leftover run dir): a failed pre-emission `run_plan` now removes ONLY a run dir
  it created; a caller-provided/pre-existing dir is preserved. The rehearsal's leftover
  `/opt/megacampus/backups/q12/49eca245-…` was an empty run dir left after teardown
  reclaimed capability/secrets; a failed pre-emission run now cleans the dir it made.

Round-7 is the final review-hardening pass (`4e752470` -> `c6ac3a8d`): 2 P2 + 4 P3.

- P2-1 production seam lockdown: `assert_production_seam_lockdown` makes a production
  plan run (run root under `/opt/megacampus/backups/q12`) reject any set
  `MC2_Q12_PLAN_...` test-seam environment variable by name, which also pins the
  drill restore mode and the pinned image (those diverge from the default only when
  their seam is set). Test seams stay usable with an explicit `/tmp/mc2-q12-plan-...`
  run root, which the seam-driven CI suites use.
- P2-2 anti mock-drift: a docker-free test drives the REAL `write_persist_handle`
  from `restore-supabase-drill.sh` and asserts the REAL `_read_handle` accepts its
  exact bytes and rejects a dropped field, so a future drill handle-field change
  fails CI instead of the live window.
- P3a: a bounded `select()` timeout on the snapshot-coordinator readline (a stalled
  source psql fails closed instead of blocking). P3b: teardown reclaims the synthetic
  capability file and the plan-created secrets dir. P3c: `teardown()` is declared in
  the `PlanExecutor` Protocol. P3d: teardown does a second-pass docker sweep by both
  the plan isolate label and the drill restore label for the run id, so a
  malformed-handle-after-persist path cannot leak a resource whose name never
  reached us.
- Notes: ownership checks on the binary-override seams were intentionally skipped —
  subsumed by P2-1 rejecting those seams in production. The §3 helper's documented
  divergence from `generate-role-bootstrap.ts` (the capture projection drops the
  PostgreSQL built-in roles and edges rather than doing the TS `pg_participants`
  cross-check) is recorded in `q12-migration-plan-roles.py` with rationale.

Round-6 fixed a real production-path defect and added snapshot coordination
(`b32ce5ed` -> `e92ec529`): `_produce_source_manifest` called
`q12-source-manifest.ts capture` with no `--snapshot`, which the CLI hard-rejects
(q12-source-manifest.ts:1440-1441). Rather than only add a flag, the generation
production now mirrors the reviewed backup coordinator (backup-supabase.sh:853-883):
`_open_snapshot_coordinator` opens ONE `REPEATABLE READ READ ONLY` session on the
source (host psql over the libpq service in production, `docker exec` for CI),
exports and fail-closed validates a `pg_export_snapshot()` id
(`^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[0-9]+$`), and keeps it open until the source
capture, dump, and manifest all read that instant. The source
structural/guarded/cron/frontier capture (`q12-migration-plan-capture.py` gained a
validated `--snapshot` -> `SET TRANSACTION SNAPSHOT`), `pg_dump --snapshot=`, and
the manifest `capture --snapshot` all bind to the exported snapshot; a dead
coordinator or malformed id hard-stops before any restore, and teardown closes the
session (COMMIT + `\q`). Cluster roles are not MVCC-snapshotted, so — like the
reviewed backup (backup-supabase.sh:589-614) — `roles.sql` is exported before and
after the snapshot-bound work and must be byte-identical after removing only the
PG17 `\restrict`/`\unrestrict` nonce pair; role drift during the window hard-stops.

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
