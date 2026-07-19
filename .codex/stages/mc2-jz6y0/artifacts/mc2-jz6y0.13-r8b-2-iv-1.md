---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-r8b-2-iv-1
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-live-controller
base_branch: codex/self-hosted-qdrant-platform-plan
base_commit: 8537c6000
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: blocked
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: >-
  Committed in place on the existing isolated worktree/branch (codex/q12-live-controller) per the
  launching stream's instruction; NOT pushed. The full-window runner stands up ONE disposable
  postgres:17.10-bookworm container (mc2-q12-fw-src-*) plus /tmp/mc2-q12-d5-root-* controller run
  roots and a /tmp/mc2-q12-barrier-* trust root, all torn down in the runner's finally block; no
  persistent state, no shared/production DB, no Qdrant Cloud, no prod. The barrier claims run in
  bwrap --unshare-net (private isolated loopback), so the host's 5432 is never touched. Gated test
  SKIPS without MC2_Q12_REAL_PG17=1, so ordinary CI touches no docker. Leftover docker containers /
  /tmp roots from the iteration were removed (verified 0 mc2-q12 containers).
risk_level: high
docs_reviewed: updated
docs_review_notes: >-
  docs/superpowers/plans/2026-07-17-q12-live-controller.md implementation log gains the R8-B-2-iv-1
  round entry recording FOUND DEFECT #16 (the controller-vs-barrier database-barrier-baseline.json
  collision) and the sanctioned hard stop. No design decision was changed; the resolution is a core
  edit that requires orchestrator/core-owner re-ratification.
graph_reviewed: no-change-needed
graph_review_notes: >-
  Change is confined to two NEW test-harness files under
  packages/course-gen-platform/tests/unit/ops/ (a gated vitest wrapper + its python runner that
  imports/reuses the R4/verify-chain runners and the retained-barrier runner). No source module, no
  public surface, no durable-workflow edge, and NO change to deploy/qdrant/q12-lifecycle-core.py, the
  frozen barrier/manifest/catalog, or any W-owned file. Read-only audit of the existing lineage; no
  local Graphify refresh performed.
verification:
  - 'Branch confirmed codex/q12-live-controller for every commit (git rev-parse --abbrev-ref HEAD ==
    codex/q12-live-controller; HEAD at session start 8537c600035f31be4e74863fee5b3b9e069c8d03).'
  - 'FOUND DEFECT #16 reproduced on real PostgreSQL 17.10: run_live drives the real barrier install
    to a maintenance_guarded receipt (captured on disk:
    /tmp/mc2-q12-d5-root-*/database-barrier-receipt.json state=maintenance_guarded), the barrier
    writes /tmp/mc2-q12-d5-root-*/database-barrier-baseline.json mode=400 uid=1000 gid=1000 with the
    FULL megacampus.q12.database-barrier-baseline/v1 schema (nested .baseline with
    baseline_structural_catalog_sha256/cron_jobs_sha256/database_default_sha256/
    guarded_relations_sha256/pg_net_queue_count, q12-database-barrier.sh:2037). run_live then raises
    LifecycleError "unsafe file identity: <run-root>/database-barrier-baseline.json" from
    Engine.write_install_baseline (q12-lifecycle-core.py:2413 -> :2648-2660) ->
    immutable_publish (:604) -> validate_regular_file (:558-565): the controller tries to publish its
    OWN database-barrier-baseline.json (mode 0600, minimal predecessor-hash schema) to the SAME path
    the barrier already published 0400, so the mode/identity check fails. Full Python traceback
    captured through run_live -> drive_forward_sequence -> d5("install") -> retained_chain:2413.'
  - 'Everything UP TO the defect works for real: the ratified DUAL-BIND is exercised (the single
    physical controller run-root dir is bound inside the claim bwrap to BOTH
    /opt/megacampus/backups/q12/<run-id> and <trust-root>/backups/q12/<run-id>; the barrier reads the
    run-root inputs and writes the receipt/baseline through the /tmp trust view; #15 dual_bind_same_
    inode observed true from inside the claim). run_claim passes its uid-1000 / lease-FD-9 / capability
    /opt-custody checks; the barrier install transitions the real DB to maintenance_guarded (cron off,
    read-only on, q12_guard installed). The install per-leg input checkpoint published by
    RealClaimExecutor (copy of phase-checkpoint.json) is accepted by the barrier. Transport: bwrap
    --unshare-net auto-ups the private loopback while keeping uid 1000 (verified), with the
    q12-pooler-identity-proxy running IN the private netns and bridging to the container via the
    docker-exec unix socket -- an isolated adaptation of the blueprint step-3 transport, forced
    because the host already binds 0.0.0.0:5432 (helixa-postgres-1); the DUAL-BIND and all acceptance
    semantics are unchanged.'
  - 'GREEN is unreachable without a q12-lifecycle-core.py edit (rename/skip/reconcile the controller
    write_install_baseline artifact vs the barrier baseline) = re-ratification. Per the stream
    contract ("REAL-DB or real-controller divergence from the fixture contract = FOUND DEFECT: STOP +
    report BEFORE reconciliation" and "If a core edit seems unavoidable = STOP + report"), no GREEN
    commit was produced and NO workaround (no harness delete/chmod of either baseline, no core edit)
    was applied. Precedent: R4 Sub-round C ("SANCTIONED HARD STOP, not a pass; RED-only").'
  - 'No core / frozen / W-owned / deploy change. sha256 q12-database-barrier.sh
    bdb9d935e3c09fb01503ba9d016f36a9cf94db5539dfcdc73c1692eb442925ce (UNCHANGED); git status shows
    only the two NEW write-zone test files; NO change under deploy/, no q12-lifecycle-core.py /
    q12-writer-resume.py / source-recovery-run.sh / q12-source-manifest.ts edit.'
  - 'pnpm exec tsc --noEmit -> exit 0. The gated test (tests/unit/ops/q12-live-real-full-window.test.ts)
    SKIPS without MC2_Q12_REAL_PG17=1.'
changed_files:
  - packages/course-gen-platform/tests/unit/ops/q12-live-real-full-window.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-real-full-window-runner.py
  - docs/superpowers/plans/2026-07-17-q12-live-controller.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r8b-2-iv-1.md
explicit_defers:
  - >-
    R8-B-2-iv-1 GREEN (the 81-row full-window run_live parity + cleanup + seam + resume) is BLOCKED
    on found-defect #16. The full-window harness is built and reaches the exact defect boundary; it
    resumes to GREEN once #16 is ratified and fixed. Tracked here + in the plan implementation log;
    recommend a Beads issue for the core fix.
---

# Summary

R8-B-2-iv-1 builds the full-window real `run_live` probe with the ratified DUAL-BIND fusion
(found-defect #15 supersession) and drives it against a disposable `postgres:17.10-bookworm`
container. The harness (`q12-live-real-full-window-runner.py` + the gated
`q12-live-real-full-window.test.ts`) composes: `run_live` on a `/tmp/mc2-q12-d5-root-*` controller
run root; an outer `RealBarrierWrapperExecutor` whose `launch_claim` spawns a bwrap `--real-claim`
subprocess running `CORE.run_claim(args, RealClaimExecutor)`; `RealClaimExecutor` publishing the
per-leg input checkpoint and running the FROZEN barrier FOR REAL against the container; the real
migration `execute_ordinary` seam; and the composer twin (`run_joined_composer`) on a second root
for the 76-row parity oracle. The DUAL-BIND binds the single physical controller run-root dir inside
the claim bwrap to BOTH `/opt/megacampus/backups/q12/<run-id>` (run_claim custody; `/opt` manifest
argv kept verbatim) AND `<trust-root>/backups/q12/<run-id>` (the barrier's test-mode trust root, CA
relaxation only); `RealClaimExecutor` rewrites ONLY the barrier child's argv to the `/tmp` view.

Driving that fusion for real surfaced **FOUND DEFECT #16**: the real barrier install and the
controller's `retained_chain` BOTH claim ownership of `<run-root>/database-barrier-baseline.json`.
The frozen barrier install publishes it 0400 with the full `megacampus.q12.database-barrier-baseline/v1`
schema (`q12-database-barrier.sh:2037`); then `Engine.write_install_baseline`
(`q12-lifecycle-core.py:2413` -> `:2648-2660`) publishes its OWN minimal
(predecessor-hash) baseline 0600 to the same path via `immutable_publish` (`:604`), which fails
`validate_regular_file` (`:558-565`) with `unsafe file identity` (mode 0400 != expected 0600). This
collides in ANY real `run_live` install, including production; it never surfaced before because the
composer / R4 Sub-round B use a FAKE barrier that does not write the file (only the controller does),
and R8-B-2-i/ii/iii drive the barrier DIRECTLY (not through `retained_chain`, so only the barrier
does) -- iv-PART-1 is the first fusion of `run_live`'s custody path with a real barrier, exactly the
never-executed path this pre-window rehearsal exists to close. Everything up to the collision works
for real (dual-bind honest, run_claim custody checks pass, barrier reaches `maintenance_guarded`).

Per the stream contract this is a SANCTIONED HARD STOP (RED-only, not a pass): GREEN requires a
`q12-lifecycle-core.py` edit to reconcile the two baselines (rename the controller artifact, skip it
when the real barrier owns the path, or unify the schema) -- a re-ratification. No GREEN commit and
no workaround were produced.

# Verification

See the `verification:` frontmatter list. Highlights: FOUND DEFECT #16 reproduced with on-disk
evidence (barrier `maintenance_guarded` receipt + 0400 full-schema baseline; controller
`write_install_baseline` fails `unsafe file identity` 0400 vs 0600) with a full Python traceback
through `run_live -> drive_forward_sequence -> d5("install") -> retained_chain:2413`; the DUAL-BIND,
`run_claim` uid-1000/lease/custody checks, per-leg input checkpoint, and the real DB transition all
work up to the collision; barrier `bdb9d935…` and all core/frozen/W-owned/deploy files UNCHANGED;
`tsc --noEmit` 0; the gated test SKIPS without `MC2_Q12_REAL_PG17=1`.

# Risks / Follow-ups

- **FOUND DEFECT #16 (blocking, needs re-ratification + a core edit).** `run_live`'s
  `retained_chain` `write_install_baseline` and the frozen barrier install both write
  `<run-root>/database-barrier-baseline.json` with different mode (0600 vs 0400) and schema
  (controller predecessor-hash minimal vs barrier full structural). The controller write runs AFTER
  the barrier claim, so it always hits the barrier's 0400 file and fails. Resolution options (for the
  core owner): (a) the controller stops writing `database-barrier-baseline.json` for install when the
  executor runs a real barrier (the barrier owns it); (b) rename the controller's artifact to a
  distinct filename; (c) reconcile both into one schema/writer. Any of these is a
  `q12-lifecycle-core.py` change = re-ratification. Recommend a Beads issue.
- **Transport adaptation (non-blocking, documented).** The blueprint step-3 literal "one host-side
  proxy on 127.0.0.1:5432 (host net shared, MINUS --unshare-net)" is unexecutable where the host
  already binds 0.0.0.0:5432 (here `helixa-postgres-1`). The harness uses bwrap WITH `--unshare-net`
  instead: bwrap auto-ups the private loopback while keeping uid 1000 (verified), so `run_claim`'s
  uid-1000 checks still pass AND 127.0.0.1:5432 is isolated from the host; the pooler-identity proxy
  runs inside the private netns and bridges via the docker-exec unix socket. The DUAL-BIND and all
  acceptance semantics are unchanged; only the transport plumbing is isolated. Flag for review in
  case the server rehearsal wants the literal host-proxy form on a host where 5432 is free.
- **Resume path unproven.** iv-PART-1 stops at the install baseline collision, so the downstream
  legs (verify-after-base/-observability, prepare-recovery, activate), the two real migrations, the
  journaled cleanup segment + R8-B-1 seam + resume stub, and the 76-row composer parity are BUILT but
  not yet exercised end-to-end; they resume once #16 is fixed. iv-PART-2 (composed crash -> two-process
  supervisor -> recover) and iv-PART-3 (multi-epoch cleanup re-drive) remain out of this stream.
