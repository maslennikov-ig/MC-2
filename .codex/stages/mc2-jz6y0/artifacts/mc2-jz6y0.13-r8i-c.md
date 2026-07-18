---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-r8i-c
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-live-controller
base_branch: codex/self-hosted-qdrant-platform
base_commit: c8f1ad3d9
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: >-
  Committed in place on the existing isolated worktree/branch (codex/q12-live-controller) per the
  launching stream owner's explicit instruction; NOT pushed. No new worktree/branch created. The
  composed probe crashes run_live mid-barrier via a scoped claim-row fault (leaves a durable
  barrier.<op>/capability_claimed head on a per-invocation /tmp fixture root); the standalone
  supervisor + recover reacquire the released canonical lease on the SAME root and drive the barrier
  child in fresh bwrap sandboxes torn down by the seam. No docker/PG used (barrier protected test
  mode). afterEach rmSync clears every /tmp fixture root.
risk_level: high
docs_reviewed: updated
docs_review_notes: >-
  docs/superpowers/specs/2026-07-17-q12-live-controller-design.md §6b.6: the acceptance-oracle wording
  is REPLACED with the ratified DERIVED-JOURNAL oracle (uninterrupted twin + the recovery-shape
  insertion; full-row-byte equality under the existing exclusions with lease_epoch asserted exactly;
  explicit +2 row-count arithmetic; non-circularity by construction) and a PROMINENT pre-merge
  reviewer flag records BOTH found defect #11 (uninterrupted-equality unsatisfiable — two-process
  lease reacquisition, q12-lifecycle-core.py:3922 + the pinned q12-live-cutover.test.ts:94-132) and
  #12 (in-process recoveryReissues=1 equality unsatisfiable — retained_chain:2258-2298 single-claim-
  under-recovery-epoch vs the append-only pre-crash cutover claim), with an IMPLEMENTED-R8-I-C
  landmark note. docs/superpowers/plans/2026-07-17-q12-live-controller.md gets the R8-I-C
  implementation-log entry. Only the ratified oracle-spec text changed; no design decision on the
  composition itself (it matches the pinned two-process contract).
graph_reviewed: no-change-needed
graph_review_notes: >-
  Change is confined to test/fixture/docs: the R8-I-C describe block + derived-journal helper in
  packages/course-gen-platform/tests/unit/ops/q12-live-controller.test.ts, the barrierClaimCrash crash
  seam + the run_supervisor_controller_fixture entrypoint in
  packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py, the
  materializeSupervisor / SupervisorControllerFixtureSpec / barrierClaimCrash additions in
  q12-retained-barrier-contract.ts, and the two design/plan docs. deploy/qdrant/q12-lifecycle-core.py
  is byte-untouched (no new module/service/public surface, no durable-workflow or architecture edge).
  Delegated worktree stream; no local Graphify refresh performed here.
verification:
  - 'Branch confirmed codex/q12-live-controller for every commit (git rev-parse --abbrev-ref HEAD ==
    codex/q12-live-controller; HEAD at session start c8f1ad3d9).'
  - 'RED->GREEN->docs commits on codex/q12-live-controller (RED ef68d9059, GREEN 7b1587bb7, docs =
    this artifact commit).'
  - 'Target suite (no docker, no PG): SUPABASE_URL=http://127.0.0.1:54321
    SUPABASE_SERVICE_KEY=synthetic-test-key pnpm exec vitest run --config vitest.config.unit.ts
    tests/unit/ops/q12-live-controller.test.ts -> 23 passed (20 prior + 3 new R8-I-C probes). RED
    confirmed FIRST: the 3 probes failed at the supervisor step ("request missing fields:
    [chains, completed, mode]") before the supervisorController entrypoint was wired; the crash +
    fail-closed legs already ran clean.'
  - 'Cross-fixture regression: q12-retained-barrier-quiesce-seam, q12-retained-barrier-w-composition
    -seam, qdrant-source-recovery-runtime, q12-live-cutover, q12-live-cutover-cli -> 460 passed.'
  - 'pnpm exec tsc --noEmit -> exit 0.'
  - 'Frozen trio sha256sum UNCHANGED: q12-command-manifest.json aaec6fc2..., q12-database-barrier.sh
    3673ee49..., q12-structural-catalog.sql 0b8a943f... (byte-identical before/after).'
  - 'W-owned files clean in git status (q12-writer-resume.py, source-recovery-run.sh,
    q12-source-manifest.ts: no modification).'
  - 'OPERATIONS guard: "cleanup" NOT in the OPERATIONS tuple and NOT in the manifest commands
    (python check both False). No frozen-manifest hard stop; no cleanup in OPERATIONS.'
  - 'deploy/qdrant/q12-lifecycle-core.py BYTE-UNCHANGED (git diff HEAD empty): no run_live /
    run_joined_composer / retained_chain / run_recover-dispatch / cleanup-grammar body change. The
    composition was driven as-is; all 3 classes converged (composed == derived + the +2 arithmetic),
    so NO HARD STOP triggered.'
changed_files:
  - 'packages/course-gen-platform/tests/unit/ops/q12-live-controller.test.ts: new R8-I-C describe
    block (deriveComposedRecoveryExpected helper + proveComposedRecovery + the 3 probes
    install/verify-after-base/activate); imports materializeSupervisor + RetainedBarrierOperation.'
  - 'packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py: (1)
    barrierClaimCrash crash seam in run_live_fixture (scoped frontier_claim_command /
    frontier_claim_fault="claim-row") + LIVE_SPEC_KEYS; (2) run_supervisor_controller_fixture (the
    same-root standalone-supervisor entrypoint, resource/quiesce pinned from the durable head) +
    SUPERVISOR_SPEC_KEYS + main() dispatch.'
  - 'packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-contract.ts:
    LiveControllerFixtureSpec.barrierClaimCrash; SupervisorControllerFixtureSpec; materializeSupervisor
    helper.'
  - 'docs/superpowers/specs/2026-07-17-q12-live-controller-design.md: §6b.6 acceptance-oracle wording
    replaced with the derived-journal oracle + the pre-merge reviewer flag recording found defects
    #11 and #12 + the IMPLEMENTED-R8-I-C landmark note.'
  - 'docs/superpowers/plans/2026-07-17-q12-live-controller.md: R8-I-C implementation-log entry.'
explicit_defers:
  - 'The §6b.6 REAL-PG17 leg of the composed mid-barrier acceptance probes (MC2_Q12_REAL_PG17=1) is
    downstream R8-B — NOT started. This round delivers the fixture leg the amendment requires (the
    composed two-process crash -> standalone-supervisor -> recover convergence on one journal).'
  - 'Finer crash boundaries than capability_claimed for the composed probe (e.g. a crash at the
    barrier issuance row) are not exercised; capability_claimed is the ratified claimed-but-not-
    completed boundary §6b.6 specifies and the realistic two-process reacquisition point.'
---

# Summary

Implements design §6b.6 (ratified R8-C composed-recovery obligation) R8-I-C: the **composed
mid-barrier recovery ACCEPTANCE PROBES**. Each of the three barrier head classes (**install** group
2, **verify-after-base** group 7, **activate** group 16 → the journaled post-activate cleanup segment)
is proven on ONE durable journal that the §5.5 procedure composes end-to-end:

1. `run_live` (fixture executors) uninterrupted → the **independent 81-row twin** oracle;
2. on a fresh root, `run_live` crashes MID-`barrier.<op>` **AT `capability_claimed`** (a two-process
   lease-reacquisition boundary);
3. `recover` **FAILS CLOSED** on the claimed-but-not-completed head with the exact
   `q12-live-cutover.sh <op>` pointer AND leaves the durable journal byte-unchanged (condition 7);
4. the **standalone supervisor** (`q12-live-cutover.sh <op>` → `run_supervisor` /
   `resume_retained_chain`, a SEPARATE process reacquiring the released lease) completes the barrier to
   `barrier.<op>/completed` under `cutover-recovery-1`, **append-only** (the pre-crash rows survive
   byte-for-byte);
5. `recover` resumes the shared `drive_forward_sequence` from the group after the now-completed barrier
   to the **full composed journal** (through activate + the cleanup segment).

## The DERIVED-JOURNAL oracle (the SOLE primary oracle — condition 4)

The composed journal is asserted equal to a **derived expected journal constructed IN THE TEST** from
the INDEPENDENT twin + the ratified recovery-shape **constants** (never by running the composed
procedure): keep the three pre-crash rows byte-as-is (`intent`/cutover, `capability_issued`/cutover,
`capability_claimed`/cutover); INSERT `recovery_reacquired`/`cutover-recovery-1` + a SECOND
`capability_claimed`/`cutover-recovery-1` immediately after the pre-crash claim; step the barrier's
`completed` row's `lease_epoch` to `cutover-recovery-1`; everything else byte/order-identical.
Equality is **full row bytes** under the EXISTING field-level exclusions only (`withConvergenceExclusions`
= the blessed set + FWM/cleanup row scoping); `lease_epoch` is NOT excluded (asserted exactly). Plus
the **explicit +2 row-count arithmetic** (composed 83 == uninterrupted 81 + 2 per resumed barrier) and
the two INSERTED rows asserted as full row shapes (phase/outcome/command_id/command_sha256/epoch/
accepted-object fields).

## Why the oracle spec was corrected (two found defects, both recorded in §6b.6)

- **Found defect #11 — uninterrupted-equality unsatisfiable.** The probe is a **two-process lease
  reacquisition** (`q12-lifecycle-core.py:3922` sets `lease_reacquired = new_session and
bool(engine.journal)`; the contract is pinned by `q12-live-cutover.test.ts:94-132`), so the resumed
  barrier completes under `cutover-recovery-1` with EXTRA rows and can never equal an uninterrupted
  twin.
- **Found defect #12 — in-process-reissue-equality unsatisfiable.** An in-process `recoveryReissues=1`
  twin (`retained_chain:2258-2298`) emits a single claim under the recovery epoch and never preserves
  the pre-crash `capability_claimed/cutover` row, while the two-process crash-at-claimed preserves it
  append-only — so they differ by one row.

The COMPOSITION is CORRECT (it matches the pinned two-process contract); only the oracle spec was
corrected. The crash seam is the scoped `barrierClaimCrash` (`frontier_claim_command` /
`frontier_claim_fault="claim-row"`, faulting ONLY the target barrier's delegated claim); the
standalone-supervisor step is the `supervisorController` fixture entrypoint
(`run_supervisor_controller_fixture`, resource/quiesce pinned from the durable head). No
`run_live`/`run_joined_composer`/`retained_chain`/recover-dispatch/cleanup-grammar body change;
`deploy/qdrant/q12-lifecycle-core.py` is byte-untouched.

## Commits (this branch, chronological)

- RED `ef68d9059`: the 3 composed probes + fail-closed legs + the derived-journal helper + the
  `barrierClaimCrash` crash seam (probes fail at the supervisor step — entrypoint not yet wired).
- GREEN `7b1587bb7`: the `run_supervisor_controller_fixture` same-root standalone-supervisor entrypoint
  (probes converge: composed == derived + the +2 arithmetic).
- docs: this artifact + the §6b.6 oracle amendment (recording #11 + #12) + the plan-log entry.

## HARD-STOP classes — none triggered

- All 3 classes compose (composed == derived, +2); no genuine implementation divergence.
- No frozen byte modified (trio sha256 byte-identical) and no W-owned file touched.
- No `run_live`/`run_joined_composer`/`retained_chain`/recover-dispatch/cleanup-grammar body change
  needed (core byte-untouched); no `cleanup` in OPERATIONS/manifest.

# Verification

See the frontmatter `verification` list for exact commands/results (vitest 23-pass target suite with
RED-first confirmation, 460-pass cross-fixture regression, tsc 0, frozen sha256 unchanged, W-owned
clean, OPERATIONS/manifest guards, core byte-unchanged). All commands run with
`cd .../q12-live-controller/packages/course-gen-platform` and the SUPABASE\_\* fixture env; no docker/PG.

# Risks / Follow-ups

- The §6b.6 real-PG17 leg (`MC2_Q12_REAL_PG17=1`) is downstream R8-B; this round delivers the fixture
  leg only.
- Only the `capability_claimed` crash boundary is probed for the composed path (the ratified claimed-
  but-not-completed boundary and the realistic two-process reacquisition point). Finer crash points
  (e.g. the issuance row) are correct-by-construction but not independently exercised; a reviewer may
  add them.
