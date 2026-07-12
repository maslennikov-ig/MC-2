---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.4.1.1
stage_id: mc2-jz6y0
agent_type: correctness_reviewer_qa
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: crash ordering and rollback inode identity protect authoritative source bytes
repo: mc2
branch: codex/q12-source-recovery-crash-matrix
base_branch: codex/self-hosted-qdrant-platform
base_commit: f4a1d0ae
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-crash-matrix
write_zone:
  - packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-crash-matrix.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.1.md
success_criteria:
  - inject before/after every copy publication and journal durability boundary
  - prove all 42 copy and rollback state transitions are restart-safe
  - prove exact deterministic temp reconciliation and fail-closed mismatches
  - prove same-byte replacement inode and changed or untracked targets are never deleted
  - retain the existing 123 recovery and reindex regressions
selected_docs:
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-core-final-review.md
  - accepted workflow and reindex stream/review artifacts
  - https://nodejs.org/docs/v24.16.0/api/fs.html
selected_skills:
  - superpowers:test-driven-development
  - systematic-debugging
  - test-pass
  - superpowers:verification-before-completion
selected_agents:
  - correctness_reviewer/QA
catalog_candidates:
  - none - installed QA and verification assets cover the bounded stream
parallel_group: q12-source-recovery-local-corrections
depends_on_streams:
  - mc2-jz6y0.13.4.1-core
  - mc2-jz6y0.13.4.1-workflow
parallel_decision: sequential - one fault harness owns the shared filesystem and journal state model
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: branch/worktree remain for orchestrator review; temporary dependency links are removed before commit
risk_level: high
docs_impact: tests-only
docs_reviewed: no-change-needed
docs_review_notes: tests exercise the already approved recovery contract and change no operator or public behavior
graph_reviewed: used
graph_review_notes: read the shared graph report and ran a focused source-recovery query; the graph is stale and orientation-only, so tests-only work requires no refresh
verification:
  - baseline recovery/reindex before change: passed 123/123
  - inode mutation RED: failed as expected when stale inode metadata made the guard ineffective
  - focused crash matrix GREEN: passed 296/296
  - combined crash plus existing recovery/reindex: passed 419/419
  - course-gen-platform type-check: passed
  - focused Prettier and git diff check: passed
changed_files:
  - packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-crash-matrix.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.1.md
explicit_defers:
  - mc2-jz6y0.13.4.1.3 owns the exact host-flock, stopped-writer, UID1001, same-device capability-mount, and runtime cleanup assertions handed off below
---

# Summary

The bounded P2 is closed by a test-only fault harness over the real Node
filesystem API. No production recovery source changed and no production defect
was reproduced. The matrix injects exceptions before and after the durable
operations, preserves realistic crash residue for the deterministic copy temp,
then restarts through the public recovery functions.

The final test file contains 296 cases: 20 real-filesystem publication,
rollback, and inode cases; 20 initial/replacement journal persistence cases;
and 256 workflow cases spanning the copying marker, all 42
`planned -> published` transitions, copied terminal persistence, and all 42
`published -> rollback_planned -> rolled_back` transitions.

# Scope / Routing

The stream remained test-only. Vitest wraps `node:fs/promises` at the lowest
boundary while delegating every operation to the real implementation and real
temporary directories. Assertions inspect actual bytes, directory entries,
mode, and inode rather than mock call counts. The workflow layer uses the
accepted injected dependency interface to model durable journal state and
physical target state independently.

Node 24.16 authoritative documentation confirms that `FileHandle.sync()`
requests device flush, `link()` creates a hard link, `lstat()` observes the
link itself, and `Stats.dev` plus `Stats.ino` represent device/inode identity.
No dependency lookup or new package was needed.

# Verification

## RED and GREEN

- The first direct runner command failed before test discovery because the
  isolated worktree had no package-local `node_modules`. The first `pnpm exec`
  attempt likewise failed with `EACCES`. Temporary links to the repository's
  existing installed dependencies corrected only the runner environment.
- The first package type-check stopped in `shared-logger` because its own
  dependency link was absent and `pino` could not resolve. Temporary shared
  package links allowed the unchanged canonical command to pass.
- A test-only mutation made the final `lstat()` return stale pre-replacement
  inode metadata. The same-byte replacement test failed exactly because
  rollback resolved and deleted the replacement instead of rejecting. With the
  mutation disabled, the focused matrix passed 296/296.
- The fresh combined command passed 419/419: all 296 new cases plus the existing
  123 manifest/filesystem/database/workflow/reindex tests.

## Covered ordering

- Copy: before/after temp write, both temp fsync calls, hard link, target fsync,
  first parent fsync, temp unlink, and second parent fsync.
- Journal: before/after initial temp write/fsync/link/parent fsync/temp
  unlink/second parent fsync, and replacement temp write/fsync/rename/parent
  fsync.
- Workflow: before/after copying, every published state, copied terminal,
  every rollback_planned state, target unlink, and every rolled_back state.
- Reconciliation: exact run/entry temp is rejected while still planned and is
  reusable only after durable copying; mismatched temp fails closed; exact
  target after link never triggers another publication; retries produce no
  duplicate publish or delete.
- Rollback: changed bytes, wrong journal state, and a same-byte replacement
  inode all remain present. The mutation RED proves the inode assertion is
  behaviorally meaningful.

# Delivery / Cleanup

This stream is returned, not accepted. It changes one test file plus this
artifact. It launches no database, Redis, Qdrant, container, server, port, or
remote mutation. Every test fixture uses a uniquely named local temporary root
and removes it in `finally`. Dependency links are local-only setup and are
removed before commit; branch/worktree cleanup remains orchestrator-owned after
review.

# Risks / Follow-ups / Explicit Defers

Runtime-only proof remains exactly bounded to `mc2-jz6y0.13.4.1.3`. Its tests
must acquire `/run/megacampus-qdrant-source-recovery/source-recovery.lock`
before any one-shot container and hold the same host flock across
plan/review/execute/disposition/verify. The wrapper must refuse while any
`megacampus-api`, blue/green API, worker, stage6 worker, or stage7 worker is
running and restore the exact pre-window writer state. Rendered/runtime probes
must require real non-symlink UID/GID `1001:1001` mode-0700 state/progress and
capability directories, mode-0600 files, a narrow capability bind outside both
upload roots with the same `st_dev` as every target directory, read-only planner
upload roots, and an empty capability directory after cleanup. This exact
contract was sent to the visible runtime worker; no runtime file was edited
here.
