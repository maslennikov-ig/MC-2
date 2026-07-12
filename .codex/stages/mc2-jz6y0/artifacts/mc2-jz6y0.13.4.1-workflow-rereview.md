---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0.13.4.1-workflow-rereview
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: reviewed recovery publication can mutate authoritative source bytes, so exact identity, filesystem durability, and crash-state ordering require high-rigor independent review
repo: mc2
branch: codex/q12-source-recovery-workflow-rereview
base_branch: codex/q12-source-recovery-workflow
base_commit: f4a23c593acccff2fad50f62a1a99427c93f9a77
reviewed_commit: 5d1245812b93fd92b18ed65d32b2dc7a8c5dd7c9
reviewed_range: f4a23c593acccff2fad50f62a1a99427c93f9a77..5d1245812b93fd92b18ed65d32b2dc7a8c5dd7c9
resolves_review: b54ba667
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-workflow-rereview
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-workflow-rereview.md
success_criteria:
  - independently disposition all three P1 findings from review b54ba667
  - verify exact journal-to-manifest identities and immutable disposition kinds
  - verify protected state uses lstat, O_NOFOLLOW, inode/device, current UID, mode-0700 parents, and mode-0600 files
  - verify all-42 plan preflight, fresh/resume execution preflight, crash-residue ownership, and zero new publication on remaining-source drift
  - determine whether the capability-directory interface is fail-closed and realistically wireable by Task 5 without writable planner upload roots
selected_docs:
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-workflow.md
  - sibling review artifact mc2-jz6y0.13.4.1-workflow-review.md at b54ba667
selected_skills:
  - orchestrator-stage
  - code-review
  - superpowers:verification-before-completion
selected_agents:
  - correctness_reviewer
catalog_candidates:
  - none - installed review and verification skills plus approved local contracts cover the bounded correction
parallel_group: q12-source-recovery-workflow-correction-gate
depends_on_streams:
  - mc2-jz6y0.13.4.1-workflow-correction
parallel_decision: sequential - identity, filesystem, and workflow-order evidence jointly determine one correction verdict; repo spawn authorization was not present
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: temporary dependency symlinks are removed before commit; review branch/worktree cleanup waits for root acceptance
risk_level: high
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: read-only correction review; approved design and plan remain the controlling durable contract, while Task 5 owns runtime/Compose documentation
graph_reviewed: blocked
graph_review_notes: graphify-out/GRAPH_REPORT.md is absent from this isolated worktree; this artifact-only review does not justify external extraction or a graph refresh
verification:
  - exact correction diff and history f4a23c59..5d124581: reviewed line by line
  - focused source-recovery tests: passed 41/41
  - course-gen-platform type-check: passed
  - git diff check: passed
  - artifact schema validation: passed
  - process verification: passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-workflow-rereview.md
explicit_defers:
  - Task 5 must mount a separate current-UID mode-0700 capability directory read-write from the same host filesystem as every production target directory, while keeping both planner upload roots read-only; rendered/runtime tests must prove this exact contract
  - the accepted host-level writer pause and flock remain mandatory to close source drift between execution preflight and each per-entry rehash; no live recovery is authorized by this review
---

# Summary

## Findings-first verdict

**PASS for correction `5d124581`; P0: 0, P1: 0, P2: 0, P3: 0.** No
findings remain in the bounded correction. All three P1 findings from immutable
review `b54ba667` are resolved, so the workflow correction is eligible for root
orchestrator acceptance and dependency-ordered integration.

| Prior finding | Disposition | Evidence |
| ------------- | ----------- | -------- |
| Q12-WR1: journal identities/kinds not manifest-bound | Fixed | `validateRecoveryProgressJournalBinding()` derives the canonical journal from the normalized manifest, requires exact copy/disposition key sets and exact disposition kind values, and is called on load and persistence (`source-recovery-manifest.ts:512-539`, `source-recovery.ts:258-274,321-358`). |
| Q12-WR2: protected state follows symlinks/foreign ownership | Fixed | Protected reads require a real current-UID mode-0700 parent and a real current-UID mode-0600 file, then open with `O_NOFOLLOW` and compare device/inode before descriptor reads (`source-recovery.ts:275-318`). Journal CAS repeats the same boundary (`source-recovery-manifest.ts:645-689`). |
| Q12-WR3: no all-copy plan preflight | Fixed | Exact 42-copy/125-row truth is enforced before `preflightCopies`; all sources are rehashed, every target and deterministic temp must be absent, and capability proof completes before immutable `writePlan` (`source-recovery.ts:233-258,465-486`; `source-recovery-filesystem.ts:401-416`). |

# Corrected invariant evidence

- Plan validates all 42 source size/hash identities and target absence before
  any manifest or journal publication. A late invalid second source or exact
  pre-existing second target leaves the first target absent in the real
  filesystem regression.
- Fresh and resumed execute call the all-entry execution preflight before the
  durable `planned -> copying` transition and before any copy inspection or
  publication (`source-recovery.ts:520-541`). The preflight verifies every
  remaining source and all target/temp states before the loop.
- An exact target or deterministic run/entry temporary is rejected while the
  journal is still `planned`. Once `copying` is durably recorded, an exact
  target or exact run-bound temporary may be reconciled as crash residue; a
  mismatch always stops (`source-recovery-filesystem.ts:419-469,516-548`).
- Publication still rehashes each source immediately before copying and uses a
  deterministic same-directory temporary plus atomic no-replace hard link,
  file fsync, parent fsync, temp unlink, and second parent fsync. Task 5's
  stopped-writer/flock boundary remains required between the all-entry
  preflight and these per-entry rehashes.

# Capability-directory contract

The caller-supplied capability directory is fail-closed and realistically
wireable by Task 5 without making either planner upload root writable.

- It must be absolute, real/non-symlink, current-UID-owned, mode `0700`, outside
  and non-parent of both upload roots, and have the same `st_dev` as every
  target directory (`source-recovery-filesystem.ts:195-232`).
- The probe creates only random mode-`0600` files in that directory, proves
  hard-link no-replace through `EEXIST`, fsyncs the linked file and directory,
  removes both names, fsyncs cleanup, and best-effort cleans failure residue
  (`source-recovery-filesystem.ts:235-285`).
- Task 5 can satisfy this with a dedicated sibling host directory on the same
  filesystem as `data/uploads`, bind-mounted read-write only at a narrow
  capability path. Development and production upload mounts remain read-only
  in the planner. If a bind mount reports another device, has wrong ownership
  or mode, overlaps an upload root, or lacks link/fsync semantics, plan fails
  before writing reviewed state.

This is an explicit runtime integration requirement, not a current workflow
finding. Task 5 tests should parse rendered Compose and run a container-level
probe proving same device, empty cleanup, exact UID/mode, no broad writable
parent, and read-only planner upload mounts.

# Verification

1. Reviewed approved spec, plan, original review, correction artifact, exact
   history, and every changed implementation/test line in
   `f4a23c59..5d124581`.
2. `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder node node_modules/vitest/vitest.mjs run --config vitest.config.unit.ts tests/unit/tools/qdrant/source-recovery-manifest.test.ts tests/unit/tools/qdrant/source-recovery-filesystem.test.ts tests/unit/tools/qdrant/source-recovery-database.test.ts tests/unit/tools/qdrant/source-recovery.test.ts` passed four files and 41/41 tests.
3. `pnpm --filter @megacampus/course-gen-platform type-check` passed, including
   shared package builds and backend `tsc --noEmit`.
4. Final artifact validation, process verification, whitespace validation, and
   clean-worktree evidence are recorded after this artifact is finalized.

# Delivery / Cleanup

Only this independent re-review artifact changes on the review branch. No
implementation, tests, approved docs, Beads state, database, upload source,
Qdrant instance, service, secret, staging, or production environment was
mutated. Root orchestrator acceptance and branch/worktree cleanup remain
pending.

# Risks / Follow-ups / Explicit Defers

- Task 5 owns the narrow same-filesystem capability bind, immutable operator
  image wiring, UID `1001:1001`, planner RO roots, executor network isolation,
  and host writer-pause/flock proof. Failure to supply that mount blocks plan
  safely; it must not be worked around with a writable planner upload root.
- This PASS authorizes no remote execution. The complete integration review,
  synthetic 42-target acceptance, current source recount, and staging gates in
  Tasks 5/6 remain mandatory.
