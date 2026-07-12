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
  - packages/course-gen-platform/tools/qdrant/source-recovery-manifest.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-manifest.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-crash-matrix.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.1.md
success_criteria:
  - inject before/after every copy publication and journal durability boundary
  - prove all 42 copy and rollback state transitions are restart-safe
  - prove exact deterministic temp reconciliation and fail-closed mismatches
  - prove an exact reused journal temporary is fsynced before initial or replacement publication
  - model real process death and securely reconcile deterministic journal residue
  - cover rollback parent-directory fsync through the public workflow restart
  - prove same-byte replacement inode and changed or untracked targets are never deleted
  - retain the existing 123 recovery and reindex regressions
selected_docs:
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-core-final-review.md
  - accepted workflow and reindex stream/review artifacts
  - https://nodejs.org/docs/v24.16.0/api/fs.html
selected_skills:
  - superpowers:receiving-code-review
  - superpowers:test-driven-development
  - systematic-debugging
  - test-pass
  - superpowers:verification-before-completion
  - senior-architect
selected_agents:
  - correctness_reviewer/QA
catalog_candidates:
  - none - installed QA and verification assets cover the bounded stream
parallel_group: q12-source-recovery-local-corrections
depends_on_streams:
  - mc2-jz6y0.13.4.1-core
  - mc2-jz6y0.13.4.1-workflow
parallel_decision: sequential - one fault harness owns the shared filesystem and journal state model
resolves_review: 8a6a3b15
review_lineage:
  - 122f3207
  - 8a6a3b15
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: branch/worktree remain for orchestrator review; temporary dependency links are removed before commit
risk_level: high
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: deterministic crash reconciliation implements the already approved source-recovery durability contract; no operator-facing command or public contract changed
graph_reviewed: blocked
graph_review_notes: the original task explicitly limited Graphify to orientation/no refresh; parent integration owns the safe graph refresh after accepted correction
verification:
  - baseline recovery/reindex before change: passed 123/123
  - inode mutation RED: failed as expected when stale inode metadata made the guard ineffective
  - correction CM1 RED: 24/302 failed on real journal residue/restart/tamper before deterministic reconciliation
  - correction focused crash plus manifest GREEN: passed 318/318
  - correction CMR1 RED: 4/4 reused-temp ordering cases failed because retry skipped the temp fsync
  - correction CMR1 focused GREEN: passed 4/4
  - focused crash matrix GREEN: passed 306/306
  - correction focused crash plus manifest GREEN: passed 322/322
  - combined crash plus recovery/reindex GREEN: passed 430/430
  - course-gen-platform type-check: passed
  - focused Prettier and git diff check: passed
changed_files:
  - packages/course-gen-platform/tools/qdrant/source-recovery-manifest.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-manifest.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-crash-matrix.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1.1.md
explicit_defers:
  - mc2-jz6y0.13.4.1.3 owns the exact host-flock, stopped-writer, UID1001, same-device capability-mount, and runtime cleanup assertions handed off below
---

# Summary

The bounded P2 and subsequent P1 are closed by a real-process-death fault model
over the Node filesystem API plus narrow recovery-manifest corrections. Review `122f3207`
showed that random PID/UUID journal temporaries could not be safely reconciled
after process death. Progress-journal persistence now uses a content-SHA-bound
same-directory temporary and securely validates any restart residue before
reuse or cleanup. Rereview `8a6a3b15` showed that an exact pre-existing
temporary was published without a retry-time file durability barrier. Every
exact reuse now performs a protected descriptor fsync before link or rename.

The final test file contains 306 cases: 22 real-filesystem publication,
rollback, parent-fsync, and inode cases; 28 initial/replacement journal
persistence and tamper cases;
and 256 workflow cases spanning the copying marker, all 42
`planned -> published` transitions, copied terminal persistence, and all 42
`published -> rollback_planned -> rolled_back` transitions.

# Scope / Routing

The correction remains inside the explicitly expanded manifest/test ownership.
Vitest wraps `node:fs/promises` at the lowest
boundary while delegating every operation to the real implementation and real
temporary directories. Assertions inspect actual bytes, directory entries,
mode, and inode rather than mock call counts. The workflow layer uses the
accepted injected dependency interface to model durable journal state and
physical target state independently.

The deterministic journal temporary is derived from the exact serialized next
revision. Restart accepts only a regular non-symlink mode-0600 current-UID file
whose descriptor device/inode and complete bytes remain exact under
`O_NOFOLLOW`. Mismatch, insecure mode, wrong owner, symlink, or identity drift
fails closed without wildcard deletion. An exact already-committed replay
fsyncs the target and parent, removes only its exact temporary, fsyncs the
parent again, and still returns the original revision mismatch so CAS semantics
remain unchanged.

Before any uncommitted exact temporary is reused, it is reopened with
`O_NOFOLLOW`; mode, current UID, device, inode, and complete content are
revalidated on that descriptor; the descriptor is synced and closed; and the
path identity is checked again before `link()` or `rename()`. A directory fsync
is retained only for directory-entry durability and is not treated as a
substitute for this file barrier.

Node 24.16 authoritative documentation confirms that `FileHandle.sync()`
requests device flush, `link()` creates a hard link, `lstat()` observes the
link itself, and `Stats.dev` plus `Stats.ino` represent device/inode identity.
No dependency lookup or new package was needed.

# Verification

## RED and GREEN

- A test-only mutation made the final `lstat()` return stale pre-replacement
  inode metadata. The same-byte replacement test failed exactly because
  rollback resolved and deleted the replacement instead of rejecting. With the
  mutation disabled, the corrected focused matrix passed 302/302.
- CM1 RED left real journal temporaries after simulated death; 24 cases failed
  because the random path was ignored, residue remained, tampering was accepted,
  or committed replay could not reconcile. After the deterministic secure
  correction, crash plus manifest passed 318/318.
- CMR1 RED then failed four initial/replacement retry cases after crashes just
  after the write or just before the original temp fsync: publication occurred
  with no retry-time `FileHandle.sync()` event. The narrow protected reopen and
  fsync made all four pass before link/rename.
- The fresh combined command passed 430/430 across crash, manifest, filesystem,
  database, workflow, reindex plan, and reindex command tests.

## Covered ordering

- Copy: before/after temp write, both temp fsync calls, hard link, target fsync,
  first parent fsync, temp unlink, and second parent fsync.
- Journal: before/after initial temp write/fsync/link/parent fsync/temp
  unlink/second parent fsync, and replacement temp write/fsync/rename/parent
  fsync. Exact retry residue from after-write and before-fsync crashes is
  descriptor-fsynced before both initial hard-link and replacement rename.
- Workflow: before/after copying, every published state, copied terminal,
  every rollback_planned state, target unlink, and every rolled_back state.
- Reconciliation: exact run/entry temp is rejected while still planned and is
  reusable only after durable copying; mismatched temp fails closed; exact
  target after link never triggers another publication; retries produce no
  duplicate publish or delete.
- Rollback: changed bytes, wrong journal state, and a same-byte replacement
  inode all remain present. The mutation RED proves the inode assertion is
  behaviorally meaningful.
- Rollback parent durability: before/after the post-unlink directory fsync,
  restart sees durable `rollback_planned`, reconciles the absent target through
  the public workflow, persists `rolled_back`, performs one physical unlink,
  and leaves no bound temp.

# Delivery / Cleanup

This corrected stream is returned, not accepted. It changes the manifest
persistence core, two focused tests, and this artifact. It launches no database,
Redis, Qdrant, container, server, port, or
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
