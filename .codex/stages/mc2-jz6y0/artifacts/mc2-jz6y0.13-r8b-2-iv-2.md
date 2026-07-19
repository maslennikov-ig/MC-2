---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-r8b-2-iv-2
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-live-controller
base_branch: codex/self-hosted-qdrant-platform-plan
base_commit: ab0d8865b
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: blocked
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: >-
  Committed in place on the existing isolated worktree/branch (codex/q12-live-controller); NOT pushed.
  The gated crash+refusal probe stood up ONE disposable postgres:17.10-bookworm container
  (mc2-q12-cr-src-*) plus a /tmp/mc2-q12-d5-root-* controller run root and a /tmp/mc2-q12-barrier-*
  trust root, all torn down in the runner's finally (verified 0 mc2-q12 containers after the run). The
  empirical feasibility probes (scratch, /tmp only) likewise tore down their containers. Barrier
  claims run in bwrap --unshare-net (private isolated loopback), so the host's 5432 is never touched.
  Gated probe SKIPS without MC2_Q12_REAL_PG17=1. No persistent state, no shared/production DB, no
  Qdrant Cloud, no prod.
risk_level: high
docs_reviewed: updated
docs_review_notes: >-
  docs/superpowers/plans/2026-07-17-q12-live-controller.md gets the R8-B-2-iv-2 implementation-log
  entry (feasible crash+refusal leg delivered GREEN; the supervisor+recover derived-oracle tail BLOCKED
  by the frozen barrier install-cutover-only grammar, empirically confirmed) plus the P3-1 label
  correction (12-key -> 11-key on the barrier baseline). No design decision changed; the blocker is a
  reported design gap awaiting orchestrator ruling (barrier re-ratification vs re-scope).
graph_reviewed: no-change-needed
graph_review_notes: >-
  Change is confined to test/fixture/docs under packages/course-gen-platform/tests/unit/ops/ plus one
  plan doc + this artifact: a new gated real-PG17 test + its runner (both import/extend the ratified
  iv-PART-1 fusion harness, no fork), a small env/flag-gated crash seam added to the iv-PART-1 runner,
  and the P3-1/P3-2 one-line label/comment corrections. deploy/qdrant/* is byte-untouched (barrier
  bdb9d935 unchanged; core unchanged). No new module/service/public surface, no durable-workflow or
  architecture edge. Delegated worktree stream; no local Graphify refresh performed.
verification:
  - 'Branch codex/q12-live-controller for every commit; HEAD at session start ab0d8865b (== base_commit).
    sha256 deploy/qdrant/q12-database-barrier.sh == bdb9d935e3c09fb01503ba9d016f36a9cf94db5539dfcdc73c1692eb442925ce
    verified at session start AND end (barrier UNCHANGED). git diff --stat shows NO deploy/ change.'
  - 'CATALOG DETERMINISM CONFIRMED (prereq for any twin/composed two-container oracle): a scratch probe
    built the fw expected catalog on TWO fresh postgres:17.10 containers -> catalog_sha256, baseline
    structural, after-observability structural, AND all 76 guarded_relations OIDs are byte-IDENTICAL
    across containers (initdb+SEED_SQL is deterministic). So a shared/derived catalog is viable; this
    is NOT the blocker.'
  - 'FEASIBLE LEG DELIVERED GREEN (gated real-PG17, MC2_Q12_REAL_PG17=1 SUPABASE_URL=http://127.0.0.1:54321
    SUPABASE_SERVICE_KEY=synthetic-test-key MC2_Q12_PLAN_DOCKER=/usr/bin/docker): 1 passed in ~112s
    against the disposable postgres:17.10-bookworm. PHASE CRASH: run_live with a scoped mid-barrier.install
    crash AT capability_claimed rejects (crash_error "injected delegated restart at claim-row"), leaving
    the durable head EXACTLY at {command_id barrier.install, outcome capability_claimed, lease_epoch
    cutover} and NO barrier.install/completed row (the REAL install barrier never executed). PHASE
    REFUSAL: a SEPARATE lease session reacquires the released canonical FD-9 lease and run_recover FAILS
    CLOSED with "recover does not support resuming from ... command=barrier.install outcome=
    capability_claimed ... q12-live-cutover.sh install"; the durable journal is BYTE-for-byte unchanged
    (journal_after_refusal_sha256 == journal_after_crash_sha256). This is the REAL twin of the fixture
    proof q12-live-controller.test.ts:1102-1145.'
  - 'BLOCKER EMPIRICALLY CONFIRMED (the supervisor+recover derived-oracle tail is INFEASIBLE against the
    frozen barrier): a scratch two-phase probe drove run_live crash-at-install then run_supervisor
    (chains={install}, fresh lease session). run_supervisor CORRECTLY appended the recovery-shape rows
    recovery_reacquired/cutover-recovery-1 + capability_claimed/cutover-recovery-1 (matching the derived
    oracle exactly), THEN delegate_claim -> the REAL frozen barrier install child FAILED CLOSED with
    "q12 database barrier: database barrier child input checkpoint is invalid". Root cause is the FROZEN
    barrier grammar: q12-database-barrier.sh:420-433 pins the install input checkpoint file to
    -install-cutover.json and requires .lease_epoch == "cutover" with NO recovery-epoch install branch;
    only cleanup/rollback carry the recovery-epoch grammar (:444-598). A recovery-epoch install re-claim
    can never present a valid input checkpoint (the head is cutover-recovery-1). So barrier.install can
    never reach completed/cutover-recovery-1 with the real barrier -> the derived-journal oracle
    (composed == twin + recovery insertion, +2) is UNSATISFIABLE for install without editing the frozen
    barrier (HARD STOP: re-ratification). Faking the recovery claim with a synthetic executor is the
    other HARD STOP (no fake green). STOPPED and reported per contract; did NOT edit the barrier or fake.'
  - 'pnpm exec tsc --noEmit -> exit 0.'
  - 'FIXTURE suites stay GREEN (no-docker; crash seam is additive + env/flag-gated so the default path is
    byte-identical): SUPABASE_URL/KEY pnpm exec vitest run tests/unit/ops/q12-live-controller.test.ts
    tests/unit/ops/q12-production-executor-cleanup.test.ts
    tests/unit/ops/q12-write-install-baseline-strict-accept.test.ts -> 30 passed (incl. the 3 SYNTHETIC
    R8-I-C composed probes for install/verify-after-base/activate, which the fixture proves via the
    --claim-noio synthetic executor -- never the real barrier under a recovery epoch). Gated probes SKIP
    without the flag.'
  - '0 mc2-q12 docker containers after every run (docker ps -a | grep mc2-q12 -> none).'
changed_files:
  - 'packages/course-gen-platform/tests/unit/ops/q12-live-real-composed-recovery.test.ts: NEW gated
    real-PG17 crash+refusal probe (the feasible §6b.6 leg; the real twin of q12-live-controller.test.ts:
    1102-1145).'
  - 'packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-real-composed-recovery-runner.py: NEW
    runner; imports (does NOT fork) the iv-PART-1 fusion harness and drives crash-at-install +
    run_recover fail-closed refusal on ONE disposable container.'
  - 'packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-real-full-window-runner.py: additive
    env/flag-gated crash seam (RealBarrierWrapperExecutor.crash_operation -> MC2_Q12_FW_CRASH_AT_CLAIM;
    RealClaimExecutor.after_journal_fsync raises AT capability_claimed; handle_real_claim surfaces the
    restartRequired boundary). Default None/absent => iv-PART-1 behaviour byte-identical.'
  - 'packages/course-gen-platform/tests/unit/ops/q12-write-install-baseline-strict-accept.test.ts: P3-1
    label fix (barrier baseline 12-key -> 11-key).'
  - 'packages/course-gen-platform/tests/unit/ops/fixtures/q12-write-install-baseline-strict-accept-runner.py:
    P3-1 label fix (barrier baseline 12-key -> 11-key).'
  - 'packages/course-gen-platform/tests/unit/ops/q12-live-real-full-window.test.ts: P3-2 softening of the
    cleanup-segment "byte-deterministic" comment to what the test asserts inline (spot-check; the full
    byte-convergence is owned by the composer-twin unit).'
  - 'docs/superpowers/plans/2026-07-17-q12-live-controller.md: R8-B-2-iv-2 implementation-log entry +
    P3-1 label fix (12-key -> 11-key on the barrier baseline).'
  - '.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r8b-2-iv-2.md: this artifact.'
explicit_defers:
  - >-
    §6b.6 supervisor+recover DERIVED-JOURNAL ORACLE tail (Part 2 sub-items iv/v/vi) — BLOCKED, not
    deferred by choice. The REAL two-process supervisor recovery of a FORWARD barrier op is infeasible
    against the frozen barrier bdb9d935: install is cutover-only (q12-database-barrier.sh:420-433), so a
    recovery-epoch install re-claim fails closed at the barrier and can never reach
    barrier.install/completed/cutover-recovery-1. Needs an orchestrator ruling: (a) re-ratify the frozen
    barrier to add recovery-epoch install grammar (mirroring the cleanup/rollback branch), OR (b) re-scope
    the REAL §6b.6 probe to a barrier op that the frozen barrier DOES resume under a recovery epoch. NOTE:
    cleanup/rollback DO carry the recovery-epoch grammar, but they are NOT in OPERATIONS and are NOT
    driven by run_supervisor (the two-process recovery_reacquired path is forward-op-only), so a cleanup
    crash is a run_recover-resumes-the-cleanup-segment convergence (already proven synthetically at
    q12-live-controller.test.ts:1046), NOT the supervisor two-process shape Part 2 specifies.
    verify-after-base / prepare-recovery / activate lack install's hardcoded cutover pin (no epoch-pinned
    input checkpoint), so they MIGHT accept a recovery-epoch re-claim — UNVERIFIED (would need an
    authorized, more expensive full-window-to-that-leg empirical drive). Not pursued speculatively.
  - >-
    iv-PART-3 (multi-epoch cutover-recovery-2 cleanup re-drive) — DEFERRED. It depends on Part 2's real
    recover machinery reaching a completed recovery epoch, which is blocked above; a cutover-recovery-2
    cleanup re-drive is not cheaply reachable until the Part-2 barrier-grammar ruling lands. Justification:
    building it now would either require the same frozen-barrier edit (re-ratification) or a synthetic
    stand-in (fake green) — both hard stops. Deferred to the server custody rehearsal, gated on the Part-2
    ruling.
---

# Summary

R8-B-2-iv-2 (Parts 2-3 of R8-B-2-iv). Objective: make the R8-I-C §6b.6 composed mid-barrier recovery
probe REAL on the ratified DUAL-BIND fusion harness, closing R8-B. **R8-B does NOT close this round:
the central deliverable — the supervisor+recover DERIVED-JOURNAL ORACLE — is BLOCKED by the frozen
barrier's grammar, empirically confirmed. I STOPPED and report the design gap rather than editing the
frozen barrier (re-ratification) or faking the recovery claim (both hard stops).** Three outcomes:

**1. FEASIBLE §6b.6 LEG DELIVERED GREEN — the REAL crash + fail-closed refusal.** On ONE disposable
`postgres:17.10-bookworm` container through the iv-PART-1 fusion machinery (imported, not forked):
`run_live` crashes mid-`barrier.install` AT `capability_claimed` (a genuine two-process claim boundary
via a new env/flag-gated crash seam — `RealBarrierWrapperExecutor.crash_operation` ->
`MC2_Q12_FW_CRASH_AT_CLAIM` -> `RealClaimExecutor.after_journal_fsync` raises after the claim row is
durable, before the real barrier runs), leaving the durable head EXACTLY at
`barrier.install/capability_claimed/cutover` with the REAL install barrier NEVER executed. Then a
SEPARATE lease session reacquires the released canonical FD-9 lease and `run_recover` FAILS CLOSED with
the EXACT `q12-live-cutover.sh install` standalone-supervisor pointer and leaves the durable journal
BYTE-for-byte unchanged. This is the REAL twin of `q12-live-controller.test.ts:1102-1145` (Part 2's
explicit "ALSO assert" sub-item). Gated GREEN in ~112s; SKIPS without `MC2_Q12_REAL_PG17=1`.

**2. BLOCKER — the supervisor+recover derived-journal oracle is INFEASIBLE against the frozen barrier
(empirically confirmed).** A scratch two-phase probe drove `run_live` crash-at-install then
`run_supervisor` (chains={install}, fresh lease session). The CORE recovery state machine is CORRECT —
`run_supervisor`/`resume_retained_chain` appended `recovery_reacquired/cutover-recovery-1` + a second
`capability_claimed/cutover-recovery-1` (exactly the derived-oracle recovery insertion). But then
`delegate_claim` -> the REAL frozen barrier `install` child FAILED CLOSED:
`q12 database barrier: database barrier child input checkpoint is invalid`. Root cause is the FROZEN
barrier grammar: `q12-database-barrier.sh:420-433` pins the install input checkpoint to
`-install-cutover.json` requiring `.lease_epoch == "cutover"`, with NO recovery-epoch install branch
(only cleanup/rollback carry it at `:444-598`). A recovery-epoch install re-claim can never present a
valid input checkpoint (its journal head is `cutover-recovery-1`), so `barrier.install` can never reach
`completed/cutover-recovery-1` with the real barrier. The derived-journal oracle (composed == twin +
recovery insertion, +2 rows converging to `barrier.install/completed/cutover-recovery-1`) is therefore
UNSATISFIABLE for install with the real barrier. Completing it needs EITHER a frozen-barrier edit
(re-ratification — HARD STOP) OR a synthetic stand-in for the recovery claim (fake green — HARD STOP).
Per the task contract I STOPPED and report this BEFORE any reconciliation; I did NOT edit the barrier
and did NOT fake the claim. NOTE: catalog determinism across two fresh containers was independently
confirmed (catalog_sha256 + all 76 guarded_relations OIDs identical), so the twin/composed
two-container oracle plumbing is viable — the OID/catalog axis is NOT the blocker; the frozen-barrier
install-epoch grammar is.

**3. P3-1 / P3-2 corrections (in the docs commit).** P3-1: the barrier baseline
(`q12-database-barrier.sh:2027-2037`) has ELEVEN top-level keys (schema_version, run_id, state,
source_baseline_sha256, baseline_sha256, predecessor_checkpoint_sha256, predecessor_journal_entry_hash,
resource_manifest_sha256, expected_post_migration_catalog_sha256, database_capability_sha256, baseline)
but was labelled "12-key" in the strict-accept unit comment (`test:92`), its runner docstring
(`runner:83`), and the plan log (`:982`) — corrected to "11-key" in all three live sites (the unrelated
19-key journal / 12-key checkpoint / 12-key capability labels are CORRECT and untouched). P3-2: the
full-window real test's cleanup-segment comment (`:170-171`) claimed "byte-deterministic under the
convergence exclusions" but the test only spot-checks `lease_epoch=='cutover'` + a defined
`quiesce_manifest_sha256` inline — softened to say so and to attribute the full byte-convergence to the
composer-twin unit.

# Verification

See the `verification:` frontmatter list. Highlights: barrier `bdb9d935…` UNCHANGED and NO deploy/
change (`git diff --stat`); catalog determinism confirmed across two fresh containers; the feasible
crash+refusal probe GREEN (~112s, exact crash head + exact fail-closed pointer + journal byte-unchanged);
the BLOCKER empirically confirmed (supervisor emits the correct recovery-shape rows, then the real
frozen barrier install child rejects a recovery-epoch claim at `:433`); `tsc` 0; fixture suites 30
passed (crash seam additive/gated); 0 orphan containers.

# Risks / Follow-ups

- **BLOCKER (needs an orchestrator ruling) — the REAL §6b.6 supervisor+recover oracle.** The frozen
  barrier `install` command is cutover-only; a real two-process recovery-epoch install re-claim cannot
  complete. Options: (a) re-ratify the frozen barrier to add a recovery-epoch install branch mirroring
  cleanup/rollback (`:444-598`); (b) re-scope the REAL §6b.6 probe to an op the frozen barrier resumes
  under a recovery epoch. `verify-after-base`/`prepare-recovery`/`activate` lack install's hardcoded
  cutover pin and MIGHT accept a recovery-epoch re-claim, but that is UNVERIFIED and needs an authorized,
  more expensive drive (the crash must land at that later leg, i.e. most of the window runs first). Not
  pursued speculatively. `cleanup`/`rollback` carry the recovery-epoch grammar but are NOT supervisor-
  driven forward ops, so they do not produce the Part-2 two-process shape.
- **iv-PART-3 (multi-epoch cleanup re-drive) — DEFERRED**, gated on the Part-2 ruling (see
  `explicit_defers`). A cutover-recovery-2 cleanup re-drive is not cheaply reachable until a completed
  recovery epoch exists in the real harness.
- **Crash seam (harness-only, gated).** The new `crash_operation`/`MC2_Q12_FW_CRASH_AT_CLAIM` seam in the
  iv-PART-1 runner is additive and gated; with it unset the iv-PART-1 full-window path is byte-identical
  (fixture suites 30 passed, no deploy/core change).
