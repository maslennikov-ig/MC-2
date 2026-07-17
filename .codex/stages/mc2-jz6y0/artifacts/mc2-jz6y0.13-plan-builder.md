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
  reclaimed on each run (executor teardown + test finally blocks); post-run docker
  filters show zero leftovers.
risk_level: medium
verification:
  - 'Blocking §3 role bootstrap RED->GREEN: dc0d9cc6 -> 6a0825fa. Builder/live/hardening/drill-seam from prior rounds unchanged.'
  - 'Unit + drill (no docker): q12-migration-plan.test.ts + supabase-restore-drill.test.ts = 65 passed | 4 skipped.'
  - 'Real-PG17 (MC2_Q12_REAL_PG17=1): 23 passed — incl. the live LivePlanExecutor end-to-end where the source owns a table via an allowlisted `admin` role absent from the isolate, so the restore succeeds only because the §3 bootstrap ran, plus equality-mismatch fail-closed and teardown-overrides-success.'
  - 'Role-bootstrap generator negatives (unit, fail closed BEFORE any restore): non-allowlisted source role, disallowed role setting, forbidden elevated attribute, isolate role absent from source.'
  - '44 existing drill tests + all prior suites pass unmodified; pnpm type-check / tsc --noEmit exit 0; python3 compile OK.'
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
  - "Real-CLI migration leg: CI-unreproducible by cryptographic binding (document-evidence-approved.ts:1250-1356 security manifests pinned to the real restore of generation-20260716T105950Z); production applies migrations with the real CLIs in loopback mode (loopback needs no --confirm/--allow-remote: document-evidence-approved.ts:648 returns early for 127.0.0.1/localhost/::1 before the remote gate). Validated by the owner's server-side pre-C1 `q12-live-cutover.sh plan` run (read-only on the source). If prod schema drifted since that generation the manifests fail closed — a correct product-truth outcome, not to be relaxed."
---

# Summary

Closed the blocking completeness defect the team-lead found by direct diff review:
the live restore leg had no §3 allowlisted role bootstrap before `pg_restore`, so a
real Supabase source that owns/grants via app roles absent from the pinned image
would abort the isolated restore (or drift ACLs and fail the equality proof). CI
masked it because the vanilla source only had `postgres`. Round-4 RED->GREEN:
`dc0d9cc6` -> `6a0825fa`.

- `deploy/qdrant/q12-migration-plan-roles.py` (new): a pure §3 bootstrap generator
  mirroring the reviewed `generate-role-bootstrap.ts` semantics with the frozen
  missing-role / privilege / role-setting allowlists. It creates ONLY roles that
  are in the source, absent from the isolate, and on the §3 missing-role allowlist
  — password-free — replays membership edges under the exact grantor (superuser
  grants first) with admin/inherit/set options, applies ONLY §3-allowlisted cluster
  role settings, and hard-stops before any restore on a non-allowlisted missing
  role, a forbidden elevated attribute, a disallowed setting, or an isolate role
  absent from the source. It never executes raw pg_dumpall output.
- `q12-migration-plan-capture.py`: read-only role-plane projection (pg_roles /
  pg_auth_members / cluster pg_db_role_setting), a `--roles-only` mode for the fresh
  isolate, and COPY-text decoding so quoted/comma/backslash values round-trip.
- `LivePlanExecutor`: diffs the source role plane against the isolate, generates and
  applies the bootstrap with `psql -X --set ON_ERROR_STOP=on` BEFORE `pg_restore`.
  P2: `pg_dump` now streams straight to a file descriptor and `pg_restore` reads the
  open archive, so peak memory is not ~2x the database size on the server.

With this, the direct restore path is correct for a real Supabase source (it
creates the app roles), and the pre-migration structural-equality proof remains the
fail-closed safety net for any residual restore infidelity. The A(i) drill persist
seam from round 3 remains a delivered, tested capability if a future stream wants
the drill's fuller restore, but the team-lead directed the §3 bootstrap into the
live leg directly (mirror, not drill consumption), which this delivers and proves
on vanilla PG17.

# Verification

- Role-bootstrap RED (`dc0d9cc6`, impl absent): the five generator unit tests
  failed; GREEN (`6a0825fa`) they pass.
- Unit + drill (no docker): `65 passed | 4 skipped`. The generator suite proves the
  positive render (CREATE ROLE password-free, SET ROLE/GRANT/RESET replay, ALTER
  ROLE SET for an allowed setting) and four fail-closed negatives.
- Real-PG17 (`MC2_Q12_REAL_PG17=1`): `23 passed`. The live-orchestration source now
  has an allowlisted `admin` role owning `realtime.messages` and an allowed
  `postgres` search_path setting; the isolated `pg_restore` succeeds only because
  the §3 bootstrap created `admin` first, and the emitted catalog still passes the
  frozen barrier filter with the equality proof intact. Negatives
  (`MC2_Q12_PLAN_FAULT=equality|teardown`) still hold.
- Regression: 44 existing drill tests + all prior suites pass unmodified; `tsc`
  exit 0; frozen bytes re-verified; `q12-live-cutover.test.ts` untouched.
- P3 confirmation: the production migration CLIs run in loopback mode with only
  `SUPABASE_DB_URL` — `validateDocumentEvidenceApprovedMigrationTarget`
  (document-evidence-approved.ts:634) returns at :648 for 127.0.0.1/localhost/::1
  BEFORE the `--allow-remote`/`--confirm`/sslmode gate, and `apply` applies all
  three base files (observability `apply-all` applies both). Loopback mode exists as
  assumed — not a stop-and-report.

# Risks / Follow-ups

- The direct restore + §3 bootstrap is less exhaustive than restore-supabase-drill.sh
  (no explicit extension-version / exact-database-property verification), but the
  structural-equality proof fails closed on any resulting infidelity, so the plan
  cannot emit a catalog from an unfaithful restore. The delivered drill persist seam
  remains available if a stream later wants the drill's fuller restore for plan.
- Real-CLI migration leg stays server-validated (decision B); see `explicit_defers`.
- The gated real-PG17 suite is docker-timing sensitive and occasionally needs a
  re-run under load (readiness waits on the image init-complete marker); it is
  skipped without `MC2_Q12_REAL_PG17=1`, so the default deterministic path is
  docker-free and flake-free.
