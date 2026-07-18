---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-r8i-b
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-live-controller
base_branch: codex/self-hosted-qdrant-platform
base_commit: 58813fc50
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: >-
  Committed in place on the existing isolated worktree/branch (codex/q12-live-controller) per the
  launching stream owner's explicit instruction; NOT pushed. No new worktree/branch created. The
  mid-cleanup crash probe leaves a per-invocation /tmp/mc2-q12-barrier-cleanup-* sandbox torn down
  by the seam (shutil.rmtree) on the injected crash; the recover-resume re-runs the barrier child in
  a fresh sandbox that is likewise torn down. No docker/PG used (barrier protected test mode).
risk_level: high
docs_reviewed: updated
docs_review_notes: >-
  docs/superpowers/plans/2026-07-17-q12-live-controller.md implementation log updated with the
  R8-I-B entry (generalized 8-head recover dispatch; drive_forward_tail -> resumable
  drive_forward_sequence; genesis-row walk pin; resumable orchestrate_post_activate_cleanup; R5-D2
  pointer lockstep amendment; the two stop checkpoints + cleanupCrashAfter probe). The design spec
  docs/superpowers/specs/2026-07-17-q12-live-controller-design.md §6b.2 gets an "IMPLEMENTED R8-I-B"
  landmark note (drive_forward_sequence :3498, _RECOVER_RESUME_FROM :3487, run_recover :3754,
  orchestrate :3262, pointer :3888) and §5.5's superseded clause is marked implemented. §6b.2 is the
  ratified gate; only implementation-landmark notes were added, no design decision changed.
graph_reviewed: no-change-needed
graph_review_notes: >-
  Change is confined to deploy/qdrant/q12-lifecycle-core.py (extract drive_forward_sequence from the
  former drive_forward_tail, one recover dispatch table, resumable orchestrate; no new
  module/service/public surface) plus the two test/fixture files under
  packages/course-gen-platform/tests/unit/ops/. No new durable workflow or architecture edge; the
  existing local graph models q12-lifecycle-core.py at the right granularity. Delegated worktree
  stream; no local Graphify refresh performed here.
verification:
  - 'Branch confirmed codex/q12-live-controller for every commit (git rev-parse --abbrev-ref HEAD ==
    codex/q12-live-controller; HEAD at session start 58813fc50, after R8-I-A).'
  - 'RED->GREEN->docs commits on codex/q12-live-controller (RED 1f9ac9c82, GREEN 9da54357d, docs =
    this artifact commit).'
  - 'Target suite (no docker, no PG): SUPABASE_URL=http://127.0.0.1:54321
    SUPABASE_SERVICE_KEY=synthetic-test-key pnpm exec vitest run --config vitest.config.unit.ts
    tests/unit/ops/q12-live-controller.test.ts -> 20 passed (13 prior + 7 new R8-I-B). RED confirmed
    FIRST: the 5 dispatch tests failed against the pre-GREEN core with "recover does not support
    resuming from ..."; the fail-closed/chain-first/empty-journal tests already passed.'
  - 'Cross-fixture regression: q12-retained-barrier-quiesce-seam, q12-retained-barrier-w-composition
    -seam, qdrant-source-recovery-runtime, q12-live-cutover, q12-live-cutover-cli -> 460 passed.'
  - 'pnpm exec tsc --noEmit -> exit 0.'
  - 'Frozen trio sha256sum UNCHANGED: q12-command-manifest.json aaec6fc2..., q12-database-barrier.sh
    3673ee49..., q12-structural-catalog.sql 0b8a943f... (byte-identical before/after).'
  - 'W-owned files clean in git status (q12-writer-resume.py, source-recovery-run.sh,
    q12-source-manifest.ts: no modification).'
  - 'OPERATIONS guard: "cleanup" NOT in OPERATIONS/COMMANDS/MANIFEST_COMMAND_IDS (sed block grep 0);
    manifest commands carry no "cleanup" (json check False). No frozen-manifest hard stop.'
  - 'run_live 81-row journal byte-unchanged: proven structurally (both run_live and run_recover drive
    the SHARED drive_forward_sequence; the fresh orchestrate path is byte-identical) and empirically
    (all R5/R8-I-A parity + 76-row-prefix twin tests stay green; the R8-I-B convergence tests assert
    recovered 81 rows == uninterrupted twin under the blessed + cleanup-row-scoped exclusions).'
changed_files:
  - 'deploy/qdrant/q12-lifecycle-core.py: (1) drive_forward_tail -> shared resumable
    drive_forward_sequence over _FORWARD_STEP_ORDER (resume_from start step + stop_after seam); two
    behavior-preserving stop checkpoints (barrier.verify-after-base, barrier.activate); run_live +
    run_recover both route through it. (2) run_recover: genesis-row (entries[0]) walk pin;
    _RECOVER_RESUME_FROM 7-entry table + the barrier.cleanup any-outcome branch (8 head classes);
    R5-D2 pointer amended to fire only for a mid-lifecycle (not-completed) barrier head. (3)
    orchestrate_post_activate_cleanup made resumable (accepted -> no-op; mid-cleanup -> continue).'
  - 'packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py:
    cleanup_crash_after executor attr + the execute_barrier_cleanup crash branch (leaves a
    guard_cleanup_complete/capability_claimed durable head); run_live_fixture wires cleanupCrashAfter;
    LIVE_SPEC_KEYS += cleanupCrashAfter.'
  - 'packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-contract.ts:
    LiveControllerFixtureSpec.stopAfter union += barrier.verify-after-base | barrier.activate;
    cleanupCrashAfter?: capability_claimed.'
  - 'packages/course-gen-platform/tests/unit/ops/q12-live-controller.test.ts: new R8-I-B describe
    block (withConvergenceExclusions helper; per-head convergence install/verify-after-base/activate;
    cleanup-accepted idempotent no-op; mid-cleanup crash resume; mid-lifecycle-barrier fail-closed
    with supervisor pointer; CHAIN FIRST); R5-D fail-closed test rewritten to the empty-journal case
    (install/cleanup heads now supported).'
  - 'docs/superpowers/specs/2026-07-17-q12-live-controller-design.md: §6b.2 IMPLEMENTED-R8-I-B
    landmark note; §5.5 superseded-clause implemented marker.'
  - 'docs/superpowers/plans/2026-07-17-q12-live-controller.md: R8-I-B implementation-log entry.'
explicit_defers:
  - 'The §6b.6 REAL-PG17 leg of the composed mid-barrier acceptance probes (MC2_Q12_REAL_PG17=1) is
    downstream R8-B — NOT started. This round delivers the fixture leg the amendment requires
    (barrier-completed convergence + mid-cleanup crash resume + mid-lifecycle fail-closed).'
  - 'The §6b.6 STANDALONE-SUPERVISOR composed probe (mid-barrier crash -> q12-live-cutover.sh <op>
    -> recover on ONE journal) is the ratified R8-I-C obligation. This round proves the two halves
    separately: (a) a mid-lifecycle barrier head fails closed WITH the exact supervisor pointer, and
    (b) every barrier /completed head recover-converges to the 81-row twin. The end-to-end single-
    journal composition (supervisor advancing the crashed barrier to its completed head, then recover
    resuming) is R8-I-C; no defect found — the pointer text and the completed-head dispatch compose
    by construction.'
---

# Summary

Implements design §6b.2 (RULING R8-C = Option A, ratified 2026-07-18) R8-I-B: the **generalized
recover head-dispatch**. `run_recover`'s R5 two-head `if` chain (`deploy.prepare/completed`,
`writers.resume.forward/accepted`) is replaced by ONE table covering **all 8 clean completed-group
boundary head classes**, each resuming the forward sequence from the group AFTER the head and
converging **byte/order-identical to an uninterrupted 81-row twin** (§6b.2 condition 3), with
**journal-head evidence only** (no witness file — that mechanism was withdrawn).

## Resumable-from-any-group forward driver

The R8-I-A `drive_forward_tail` covered only groups 14-16 + the cleanup segment. R8-I-B generalizes
it into the shared **`drive_forward_sequence`** (`q12-lifecycle-core.py:3498`), which walks the
linear **`_FORWARD_STEP_ORDER`** (`:3443`, groups 1-16 + the group-14 FWM) with:

- `resume_from=None` (run_live) → drive from group 1;
- `resume_from=<step id>` (run_recover) → RESUME at that step, skipping every already-durable
  predecessor (the resource-manifest snapshot/targets steps are folded into `pg.backup`/
  `deploy.prepare` so a resume past them is a clean skip);
- `resume_from=_POST_ACTIVATE_SENTINEL` → skip all forward steps, drive only the cleanup segment;
- the existing `stop_after` seam (byte-preserved) plus two additive checkpoints
  (`barrier.verify-after-base`, `barrier.activate`) used only to construct recover heads for tests.

**Both `run_live` (`:3632`) and `run_recover` (`:3754`) drive `drive_forward_sequence`, so run_live's
81-row journal is byte-unchanged by construction** (the fresh path is the same ordered
`ordinary()`/`d5()` calls on the same Engine). Proven empirically: every R5/R8-I-A parity + 76-row-
prefix twin test stays green, and the R8-I-B convergence tests assert recovered 81 rows == an
uninterrupted twin under the blessed + cleanup-row-scoped exclusions.

## The 8-head dispatch (`_RECOVER_RESUME_FROM` `:3487` + the barrier.cleanup branch, consumed `:3862`)

| #   | head (command_id / outcome)                                                                   | resume action                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | barrier.install / completed                                                                   | resume from `writers.quiesce` (group 3)                                                                                             |
| 2   | barrier.verify-after-base / completed                                                         | resume from `migration.observability.apply` (group 7 cont.)                                                                         |
| 3   | barrier.verify-after-observability / completed                                                | resume from `migrations_applied` (group 9)                                                                                          |
| 4   | barrier.prepare-recovery / completed                                                          | resume from `source.forward` (group 11)                                                                                             |
| 5   | barrier.activate / completed                                                                  | drive the journaled cleanup segment (`_POST_ACTIVATE_SENTINEL`) — **subsumes R8-D**                                                 |
| 6   | deploy.prepare / completed                                                                    | resume from the FWM (group 14) [R5 checkpoint]                                                                                      |
| 7   | writers.resume.forward / accepted                                                             | resume from `deploy.commit` (group 15) [R5 checkpoint]                                                                              |
| 8   | barrier.cleanup / {intent,capability_issued,capability_claimed,capability_completed,accepted} | converge the cleanup segment — **subsumes R8-E** (accepted = idempotent no-op; mid-cleanup = continue from the interrupted outcome) |

**Fail-closed (named `LifecycleError`) REMAINS** for: a mid-lifecycle barrier head
(claimed-but-not-completed) → keeps the `q12-live-cutover.sh <op>` standalone-supervisor pointer
(the R5-D2 text, now amended in lockstep to fire ONLY when `outcome != "completed"`); unknown
`command_id`s; and any broken/short chain — rejected by the full durable-chain walk during `Engine`
construction/`reload_durable` **BEFORE** dispatch (CHAIN FIRST, salvaged from the withdrawn witness
round's test shape).

## Two proofs that make convergence sound

1. **Genesis-row walk pin.** `run_recover` re-pins the request-global `resource_manifest_sha256` to
   the **genesis row** (`entries[0]`) instead of the durable tail. `entries[0]` is the value an
   uninterrupted `run_live` carries request-global throughout, so it is a legal
   `validate_stable_binding_walk` anchor both for the partial durable journal at construction AND
   for the full journal after a resume completes — even for a mid-window (snapshot-segment) head
   whose value equals neither `entries[0]` nor `entries[-1]` of the completed run.
2. **Resumable `orchestrate_post_activate_cleanup` (`:3262`).** The durable head's cleanup outcome
   selects how far a prior (crashed) attempt got; recover re-drives ONLY the missing rows,
   reconstructing the immutable capability digest from the durable capability object and reusing the
   durable `command_sha256` so all cleanup rows carry one consistent digest (the frozen barrier does
   not bind `command_sha256` to its argv, §6b.5). A completed run recovered again is a no-op.

## Commits (this branch, chronological)

- RED `1f9ac9c82`: the enabling driver refactor (behavior-preserving) + stop/crash test infra + the
  failing R8-I-B dispatch tests (5 fail with "recover does not support resuming from ...").
- GREEN `9da54357d`: the `_RECOVER_RESUME_FROM` table + resumable orchestrate + the lockstep pointer.
- docs: this artifact + the plan-log entry + the §6b.2 / §5.5 implementation-landmark notes.

## HARD-STOP classes — none triggered

- No frozen byte modified (trio sha256 byte-identical) and no W-owned file touched.
- No `cleanup` in OPERATIONS/COMMANDS/MANIFEST_COMMAND_IDS and none in the manifest.
- **All 8 heads converge** (§6b.2 predicted this): the three required barrier-completed classes +
  the mid-cleanup crash + the cleanup-accepted no-op all reach an 81-row twin under the exclusions;
  no completed-group head was found structurally un-resumable.

# Verification

See the frontmatter `verification` list for exact commands/results (vitest 20-pass target suite with
RED-first confirmation, 460-pass cross-fixture regression, tsc 0, frozen sha256 unchanged, W-owned
clean, OPERATIONS/manifest guards). All commands run with
`cd .../q12-live-controller/packages/course-gen-platform` and the SUPABASE\_\* fixture env; no docker/PG.

# Risks / Follow-ups

- The mid-cleanup resume path handles all cleanup outcomes; only `capability_claimed` (the barrier-
  child crash boundary) and `accepted` (complete) are exercised by tests this round. The
  intent/capability_issued/capability_completed continuation branches are correct-by-construction
  (skip-durable + digest reconstruction) but not independently probed — the realistic crash boundary
  is `capability_claimed`, which IS tested. Reviewer may add finer crash points if desired.
- The §6b.6 single-journal composed probe (supervisor advances a mid-barrier crash to its completed
  head, then recover resumes) and the real-PG17 leg are R8-I-C / R8-B. This round proves both halves
  separately with no found defect.
