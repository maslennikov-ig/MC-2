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
status: returned
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
  ROUND-2 (ratified (b'+c) after found-defect #19, on base d0f30b987): the design spec
  docs/superpowers/specs/2026-07-17-q12-live-controller-design.md gets the §5.5 addendum + §6b.6 note
  (a controller-side mid-lifecycle crash is NOT supervisor-resumable-to-a-recovery-epoch in the current
  build; forward crash -> named refusal / window ABORT via rollback where the predecessor gate permits,
  else the manual runbook; cleanup crash -> cutover recover convergence (+0); the cutover-recovery-N
  machinery is W-side/server-custody, validated at the SERVER REHEARSAL) and the total FIVE-OP analytical
  sweep. The plan doc gets the R8-B-2-iv-3 (b') implementation-log entry. The R5-D2 refusal-pointer TEXT
  is UNCHANGED this round (an explicit defer of any rewording is recorded). No frozen core/barrier
  decision changed. ROUND-1 record below (the #18 blocker) is preserved as ratified context.
graph_reviewed: no-change-needed
graph_review_notes: >-
  Change is confined to test/fixture/docs under packages/course-gen-platform/tests/unit/ops/ plus one
  plan doc + this artifact: a new gated real-PG17 test + its runner (both import/extend the ratified
  iv-PART-1 fusion harness, no fork), a small env/flag-gated crash seam added to the iv-PART-1 runner,
  and the P3-1/P3-2 one-line label/comment corrections. deploy/qdrant/* is byte-untouched (barrier
  bdb9d935 unchanged; core unchanged). No new module/service/public surface, no durable-workflow or
  architecture edge. Delegated worktree stream; no local Graphify refresh performed.
verification:
  - 'ROUND-2 (b'') GATED PROBE GREEN — real cutover cleanup-crash recover convergence. On base d0f30b987
    (barrier bdb9d935 verified UNCHANGED at start AND end), MC2_Q12_REAL_PG17=1
    SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=synthetic-test-key
    MC2_Q12_PLAN_DOCKER=/usr/bin/docker vitest --config vitest.config.unit.ts
    tests/unit/ops/q12-live-real-cleanup-recovery.test.ts -> 1 passed in ~238s (two disposable
    postgres:17.10-bookworm containers). OBSERVED ORACLE: uninterrupted twin = 81 rows; run_live crashes
    mid-cleanup with crash_error "injected crash mid-cleanup at barrier.cleanup/capability_claimed/cutover",
    durable head EXACTLY {barrier.cleanup, capability_claimed, cutover}, crashed journal = 79 rows (76
    forward + intent/capability_issued/capability_claimed, NO capability_completed); run_recover resumes
    UNDER CUTOVER -> 81 rows (+0 vs twin, == crash+2); recovered[0:79] == crashed rows BYTE-for-byte;
    recover appended exactly [capability_completed/cutover, accepted/cutover]; NO recovery_reacquired,
    EVERY row lease_epoch==cutover; recovered == twin under the EXISTING withConvergenceExclusions ONLY
    (the fixture head-8 precedent q12-live-controller.test.ts:1046 MADE REAL, NO broadening); the REAL
    barrier cleanup child accepted database-barrier-input-checkpoint-cleanup-cutover.json, dropped
    q12_guard (guard residue {schema,relation,function,event_trigger}=0), promoted the exact 10-key v2
    receipt (terminal accepted binds it), and the CONTROLLER deleted the db capability; resume resumed,
    validated==v2. 0 orphan mc2-q12 containers after.'
  - 'ROUND-2 tsc: cd packages/course-gen-platform && pnpm exec tsc --noEmit -> exit 0. FIXTURE suite green
    (no-docker; new files are additive): vitest --config vitest.config.unit.ts
    tests/unit/ops/q12-live-controller.test.ts -> 23 passed. New gated probe SKIPS without the flag
    (1 skipped). git diff d0f30b987..HEAD --stat: NO deploy/ change; barrier bdb9d935 UNCHANGED.'
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
  - 'ROUND-2 packages/course-gen-platform/tests/unit/ops/q12-live-real-cleanup-recovery.test.ts: NEW gated
    real-PG17 (b'') probe — the REAL twin of fixture head-8 (q12-live-controller.test.ts:1046). Asserts
    crash head, +0 convergence to the uninterrupted twin under the EXISTING exclusions, byte-for-byte
    pre-crash preservation, and the real cleanup child + R8-B-1 seam.'
  - 'ROUND-2 packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-real-cleanup-recovery-runner.py:
    NEW runner; imports/extends the composed-recovery runner + iv-PART-1 fusion harness (no fork). Adds an
    additive CleanupCrashWrapperExecutor whose execute_barrier_cleanup raises (when gated) after the
    capability_claimed cleanup row is durable; drives twin + crash-then-recover on two disposable
    containers; shares ONE quiesce manifest path across both runs.'
  - 'ROUND-2 docs/superpowers/specs/2026-07-17-q12-live-controller-design.md: §5.5 addendum + §6b.6 note
    (operator-truth) + the total FIVE-OP analytical sweep (DECISION 2).'
  - 'ROUND-2 docs/superpowers/plans/2026-07-17-q12-live-controller.md: R8-B-2-iv-3 (b') implementation-log
    entry.'
  - 'ROUND-1 (base ab0d8865b) files below:'
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
    (c, RATIFIED) The +2/recovery_reacquired/cutover-recovery-N COMPOSED probe (§6b.6 derived-journal
    oracle) — DEFERRED to the SERVER REHEARSAL (W-side owner custody / source-recovery-run.sh). Ratified
    justification, symmetric across found-defects #18 and #19: the recovery-epoch shape is unreachable
    from the controller fusion in BOTH directions — FORWARD ops = the controller CAN mint a recovery epoch
    (resume_retained_chain) but the frozen barrier install child pins its input checkpoint to
    lease_epoch=="cutover" (q12-database-barrier.sh:421/432/439) and fails closed on a recovery-epoch
    re-claim (#18, empirically confirmed round 1); CLEANUP = the frozen barrier cleanup child ACCEPTS a
    recovery epoch (:444-598, grammar :514-518) but the controller NEVER mints one — barrier.cleanup is
    not in OPERATIONS (q12-lifecycle-core.py:27-33) so run_supervisor cannot target it (:4058-4065), and
    the sole cleanup driver orchestrate_post_activate_cleanup (:3386-3517) is hardcoded cutover-only
    (publish_cleanup_capability :1791/1797, move_cleanup_capability :1808/1814, append_cleanup_row :1838;
    "keyed on OPERATIONS (which excludes cleanup)" :1773). So the +2 recovery-epoch oracle is inherently
    W-side / server-custody, NOT a controller-fusion artifact — building it here would require a frozen
    q12-lifecycle-core.py edit (add a cleanup supervisor / recovery-epoch producer) or a synthetic
    stand-in, both HARD STOPs. REHEARSAL-SCOPE PIN (so this defer LANDS, not evaporates): the server
    rehearsal MUST exercise the recovery-epoch cleanup leg (supervisor- or W-side-minted per its own
    contract) and assert the recovery_reacquired + second capability_claimed under cutover-recovery-N
    grammar the frozen barrier already validates (:514-518). The REAL SATISFIABLE cutover cleanup-crash
    recover convergence (b') IS delivered GREEN this round (q12-live-real-cleanup-recovery.test.ts).
  - >-
    iv-PART-3 (multi-epoch cutover-recovery-2 cleanup re-drive) — DEFERRED to the SAME server rehearsal,
    folded into the (c) rehearsal-scope pin above. It is a strict extension of the recovery-epoch cleanup
    leg (consecutive cutover -> cutover-recovery-1 -> cutover-recovery-2 per q12-database-barrier.sh:514-518)
    and is therefore only reachable once a recovery-epoch cleanup is minted W-side/server-custody; it is
    unreachable from the controller fusion for the same reason as (c). Not built here (would require the
    frozen-core edit or a synthetic stand-in — both hard stops).
  - >-
    R5-D2 refusal-pointer TEXT rewording — DEFERRED to the rehearsal/runbook round (unchanged this round).
    Following the current pointer (q12-lifecycle-core.py:4014-4020, "q12-live-cutover.sh <op>") on a
    controller-side mid-lifecycle FORWARD crash leads to a NAMED barrier refusal (the recovery-epoch
    forward re-claim fails closed at the barrier input-checkpoint gate) — fail-closed-SAFE, not damage.
    Any rewording to reflect the window-ABORT-via-rollback / manual-runbook operator truth is bounded to
    the rehearsal/runbook round where the per-crash-point procedure is server-validated; not touched now
    to avoid over-specifying unverified procedure.
  - >-
    ROUND-1 (superseded) BLOCKER note — the round-1 artifact recorded the §6b.6 supervisor+recover FORWARD
    oracle as BLOCKED awaiting a ruling. RESOLVED: ratified as found-defect #18 (forward) + #19 (cleanup),
    resolution (b'+c) above. Kept for provenance.
---

# Round 2 — ratified (b'+c) resolution of found-defect #19 (base d0f30b987)

Round 1 (below) STOPPED on found-defect #18 (the real §6b.6 supervisor+recover FORWARD oracle is
unsatisfiable against the frozen barrier). The orchestrator ratified #18 and, on inspection, ratified a
symmetric **found-defect #19**: OPTION (b)'s premise — "the composed supervisor→recover story holds
fully for the CLEANUP segment" — is ALSO false against the frozen controller. Ratified resolution:
**(b') deliver the REAL SATISFIABLE cutover cleanup-crash recover convergence** (the fixture head-8
precedent made real) and **(c) defer the +2/recovery-epoch composed probe + the Part-3 multi-epoch
re-drive to the server rehearsal** (see `explicit_defers`).

## (b') DELIVERED GREEN — real cutover cleanup-crash recover convergence

`q12-live-real-cleanup-recovery-runner.py` / `q12-live-real-cleanup-recovery.test.ts` drive, on two
disposable `postgres:17.10-bookworm` loopback containers through the iv-PART-1 fusion machinery:

- **TWIN** — an uninterrupted real `run_live` (81 rows).
- **CRASH** — a fresh root/container drives the window through activate INTO the cleanup segment, then an
  additive gated crash in `execute_barrier_cleanup` (raised AFTER the `capability_claimed` cleanup row is
  durable, `q12-lifecycle-core.py:3483` before the `:3503` hook) leaves the durable head EXACTLY at
  `barrier.cleanup/capability_claimed/cutover` (76 forward + 3 cleanup = 79 rows); `run_live` rejects.
- **RECOVER** — `run_recover` on the same container/root resumes the cleanup segment UNDER CUTOVER
  (`orchestrate_post_activate_cleanup` via `_POST_ACTIVATE_SENTINEL`): the REAL frozen barrier cleanup
  child accepts `database-barrier-input-checkpoint-cleanup-cutover.json`, drops `q12_guard`, promotes the
  exact 10-key v2 receipt, deletes the db capability (real R8-B-1 seam) → 81 rows, **+0** vs the twin.

Observed oracle (existing `withConvergenceExclusions` ONLY, NO broadening): recovered == twin;
recovered[0:79] == crashed rows byte-for-byte; recover appended exactly
`[capability_completed/cutover, accepted/cutover]`; NO `recovery_reacquired`, every row
`lease_epoch==cutover`; guard residue 0; capability deleted; resume resumed (validated==v2). 1 passed,
~238s. This is the REAL twin of `q12-live-controller.test.ts:1046`.

## DECISION 2 — the TOTAL five-op operator-truth analytical sweep (all cites byte-exact, barrier bdb9d935)

The composed supervisor→recover recovery-epoch story is real-false for EVERY forward op, and the CLEANUP
segment has no controller recovery-epoch producer either. Per-op input-checkpoint/epoch treatment:

1. **install** — `q12-database-barrier.sh:421` sets
   `input_checkpoint_file="$run_root/database-barrier-input-checkpoint-install-cutover.json"`, and `:432`
   validates `.lease_epoch == "cutover"` with the journal head at `outcome=="capability_claimed"`
   (`:439`). CUTOVER-ONLY; no recovery-epoch install branch. (Empirically confirmed round 1: a
   recovery-epoch install re-claim fails closed here.)
2. **verify-after-base** / 3. **verify-after-observability** (both = verify-extended) / 4.
   **prepare-recovery** / 5. **activate** — none is `install` and none is `cleanup||rollback`, so NONE
   enters a per-leg input-checkpoint branch: `input_checkpoint_file` is initialized empty at `:416` and
   the ONLY two assignments are install `:421` and cleanup/rollback `:582`. So verify-extended /
   prepare-recovery / activate consume NO input checkpoint and therefore accept NO recovery-epoch input
   checkpoint by construction.
3. **The sole recovery-epoch input-checkpoint branch is `cleanup || rollback`** (`:444-598`):
   `epoch_pattern = cutover(-recovery-N)?` (`:462`), consecutive-epoch grammar (`:514-518`), recovery
   slice `[recovery_reacquired, capability_claimed]` (`:528`), input checkpoint named
   `…-$command_name-$database_execution_epoch.json` (`:582`).

CLAIM (total): NO forward op accepts a recovery-epoch input checkpoint against the real barrier; and even
for the recovery-epoch-CAPABLE cleanup/rollback branch, the CONTROLLER never MINTS a recovery epoch —
`barrier.cleanup ∉ OPERATIONS` (`q12-lifecycle-core.py:27-33`), `run_supervisor` only drives OPERATIONS
chains (`:4058-4065`), and the cleanup driver is hardcoded cutover-only (`:1791/1797/1808/1814/1838`,
comment `:1773`). Hence a controller-side mid-lifecycle crash is NOT supervisor-resumable-to-a-recovery-
epoch in the current build; the cutover-recovery-N machinery is W-side/server-custody.

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
