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
  - 'Builder RED->GREEN: a46c6173 -> 28ec3448. Live orchestration RED->GREEN: ee04d555 -> 2b6b16ad.'
  - 'Capture-seam hardening (reviewer P3): 864da98f. Drill persist seam RED->GREEN: 28e75d8c -> 93f01595.'
  - 'Unit + drill (no docker): q12-migration-plan.test.ts + supabase-restore-drill.test.ts = 60 passed | 4 skipped.'
  - 'Real-PG17 (MC2_Q12_REAL_PG17=1): 14 passed — capture helper + full live LivePlanExecutor end-to-end (direct restore path) incl. equality-mismatch fail-closed and teardown-overrides-success.'
  - 'Drill: 44 existing tests pass UNMODIFIED (default byte-identical) + 2 new persist-seam tests (handoff keeps resources; failure before handoff still cleans up).'
  - 'pnpm type-check / tsc --noEmit exit 0; python3 compile OK; drill bash -n OK.'
  - 'Frozen bytes unchanged: q12-command-manifest.json aaec6fc2…, q12-database-barrier.sh 134255ce…; q12-live-cutover.test.ts and all existing tests untouched; frozen pg.restore argv untouched.'
changed_files:
  - deploy/qdrant/q12-lifecycle-core.py
  - deploy/qdrant/q12-live-cutover.sh
  - deploy/qdrant/q12-migration-plan-capture.py
  - deploy/postgres/restore-supabase-drill.sh
  - packages/course-gen-platform/tests/unit/ops/q12-migration-plan.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-migration-plan-runner.py
  - packages/course-gen-platform/tests/unit/ops/supabase-restore-drill.test.ts
explicit_defers:
  - "Production restore reuse of restore-supabase-drill.sh via the new persist seam is the sequenced next integration (bounded, tracked here): LivePlanExecutor's production restore must consume MC2_Q12_RESTORE_PERSIST_HANDLE (produce a diagnostic generation with the reviewed tools -> call the drill -> read the handle -> migrate/capture restore_test through the handle -> own teardown), because a plain pg_restore into the pinned image fails on source app-role-owned objects (the image lacks admin/instructor/student/superadmin/pgtle_admin) and --no-owner would break the structural-equality proof. The seam that unblocks this is delivered and tested; the consumption is Supabase-image-only and CI-unreproducible, so it is validated by the owner's server-side pre-C1 plan run (decision B), not in CI."
  - "Real-CLI migration leg: CI-unreproducible by cryptographic binding (document-evidence-approved.ts:1250-1356 security manifests pinned to the real restore); validated by the owner's server-side pre-C1 q12-live-cutover.sh plan run (read-only on the source). If prod schema drifted since generation-20260716T105950Z the manifests fail closed — a correct product-truth outcome, not to be relaxed."
---

# Summary

Q12 `plan` mode is delivered with a fully CI-proven builder and live-orchestration
pipeline, plus the reviewer P3 hardening and decision A(i)'s opt-in persist seam on
`restore-supabase-drill.sh`. Round-3 commits on `codex/q12-plan-builder`:

- `864da98f` harden: fail-closed capture-seam inputs (`--container` regex,
  `MC2_Q12_PLAN_PSQL`/`MC2_Q12_PLAN_DOCKER` absolute non-symlink regular file) +
  an explicit boolean-as-integer negative (oid/jobid = true) pinning the
  `isinstance(bool)` guards.
- `28e75d8c` -> `93f01595` (RED -> GREEN): opt-in `MC2_Q12_RESTORE_PERSIST_HANDLE`
  seam on `restore-supabase-drill.sh`. On a fully successful Q12 restore the drill
  publishes an owner-only 0400 handle (container/network/volume/loopback port +
  restore_test connection) and hands the live resources to the caller instead of
  tearing them down, so plan mode can reuse the drill's reviewed role bootstrap
  rather than forking it. `PERSIST_ENGAGED` flips to 1 only on that exact success
  path; every failure keeps it 0 so `on_exit` still fully cleans up (no silent
  leak). Default (env unset) is byte-identical — the 44 existing drill tests pass
  unmodified and the frozen `pg.restore` argv is untouched.

Key enabling finding: the frozen `q12-structural-catalog.sql` has no database-name
field and excludes the three drill overrides (`default_transaction_read_only`,
`cron.database_name`, `cron.launch_active_jobs`) from its hash, so the source
`postgres` and the drill's isolated `restore_test` produce the same structural SHA
— the plan equality proof holds against the drill restore, making A(i) sound.

Reviewer P2 (guarded/delta split) is already implemented and enforced: the builder
sources `guarded_relations`/`cron_jobs`/`baseline`/`frontier` from the SOURCE
capture (live OIDs) and each `migrations[].relations` from the post-migration
ISOLATE delta; `validate_expected_catalog()` and the frozen barrier both require
global identity disjointness.

# Verification

- Round-3 unit (no docker): `q12-migration-plan.test.ts` + `supabase-restore-drill.test.ts`
  = `60 passed | 4 skipped`. New: two capture-seam rejections, the boolean-as-int
  negative, and the two persist-seam fake-docker tests (handoff keeps all three
  resources alive; persist-requested-but-failed still cleans up to zero).
- Drill regression: the 44 pre-existing drill tests pass UNMODIFIED (default path
  byte-identical); `bash -n` clean.
- Real-PG17 (`MC2_Q12_REAL_PG17=1`): `14 passed` — capture helper + the full live
  `LivePlanExecutor` end-to-end via the direct restore path (source snapshot ->
  isolated restore -> structural-equality proof -> the real five migration files
  applied -> barrier-valid catalog), plus equality-mismatch fail-closed and
  teardown-overrides-success; zero leftover containers.
- `tsc --noEmit` exit 0; frozen bytes (`q12-command-manifest.json`,
  `q12-database-barrier.sh`) re-verified; `q12-live-cutover.test.ts` untouched.

# Risks / Follow-ups

- Production restore does not yet consume the persist seam. Today `LivePlanExecutor`
  restores via the direct `pg_dump | pg_restore` path, which is correct and
  CI-proven on vanilla PG17 but insufficient for a real Supabase source (app-role
  ownership). The seam delivered this round unblocks the reviewed-drill restore;
  wiring `LivePlanExecutor` to consume it is the bounded next stream (see
  `explicit_defers`), Supabase-only / server-validated per decision B. I recommend
  it be the immediate follow-on before the owner's pre-C1 rehearsal.
- The drill persist handle carries the disposable restore_test connection password
  (owner-only 0400, loopback-only throwaway); it is never a source credential.
- Real-CLI leg and the drill-consumption leg are both server-validated (decision
  B), not CI-reproducible; the artifact records exactly what CI proves vs. what the
  pre-C1 server run proves so there is no silent gap.
