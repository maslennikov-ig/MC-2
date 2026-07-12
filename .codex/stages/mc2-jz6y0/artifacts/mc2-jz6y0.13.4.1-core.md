---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.4.1
stage_id: mc2-jz6y0
agent_type: root_fallback_after_two_unresponsive_subagents
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: crash durability, path containment, no-replace publication, and rollback safety are high-risk recovery contracts
repo: mc2
branch: codex/q12-source-recovery-core
base_branch: codex/self-hosted-qdrant-platform
base_commit: b553292f
worktree: /home/me/code/mc2/.worktrees/q12-source-recovery-core
write_zone:
  - packages/course-gen-platform/tools/qdrant/source-recovery-manifest.ts
  - packages/course-gen-platform/tools/qdrant/source-recovery-filesystem.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-manifest.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-filesystem.test.ts
  - this artifact
success_criteria:
  - immutable deterministic owner-only manifest and separately bound progress journal
  - crash-durable file and parent-directory fsync ordering
  - contained non-symlink streamed exact-byte source verification
  - atomic no-replace publication and restart reconciliation
  - hash-guarded rollback forbidden at or after reindex_started
selected_docs:
  - docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md
  - docs/superpowers/plans/2026-07-12-q12-source-recovery.md
selected_skills:
  - orchestrator-stage
  - superpowers:subagent-driven-development
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
selected_agents:
  - source_recovery_core
  - source_recovery_core_impl
catalog_candidates:
  - none - installed orchestration, TDD, and review assets cover the stream
parallel_group: q12-source-recovery-core-gate
depends_on_streams:
  - mc2-jz6y0.13.4-read-only-audit
parallel_decision: sequential
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: implementation worktree and dependency symlinks remain until independent review and integration
risk_level: high
docs_impact: durable-recovery-contract
docs_reviewed: no-change-needed
docs_review_notes: implementation follows the already approved design and plan; final operator documentation is owned by the integration stream
graph_reviewed: blocked
graph_review_notes: parent integration owns the safe local Graphify refresh after accepted merges
verification:
  - manifest TDD RED: passed with expected missing-module failure
  - filesystem TDD RED: passed with expected missing-module failure
  - focused manifest and filesystem GREEN: passed 10/10
  - focused recovery regression including snapshot and reindex plan: passed 40/40
  - package type-check: passed
  - focused Prettier and git diff check: passed
  - independent review cf51722c: NEEDS_WORK with 0 P0, 4 P1, and 3 P2
  - correction RED: passed with 13 reproduced contract failures
  - correction GREEN and recovery regression: passed 47/47
  - corrected package type-check and focused Prettier: passed
changed_files:
  - packages/course-gen-platform/tools/qdrant/source-recovery-manifest.ts
  - packages/course-gen-platform/tools/qdrant/source-recovery-filesystem.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-manifest.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-filesystem.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-core.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-core-review.md
explicit_defers:
  - planner, database CAS, reindex binding, Stage 4 evidence, and operator wiring remain in dependent plan tasks
  - operator runtime must prove stable exclusively owned upload directory components across the host-locked recovery window
---

# Summary

The source-recovery core now validates and deterministically serializes an
immutable manifest, binds a separate progress journal to its run ID and
SHA-256, and rejects count, identity, and state-transition drift. The
filesystem engine streams exact source bytes into an owner-only temporary
inode, verifies size and SHA-256, applies mode 0644, publishes with an atomic
no-replace hard link, and fsyncs the target and parent directory before the
caller may persist progress.

Two visible implementation subagents were launched in the dedicated worktree,
but neither produced a RED test or filesystem change before interruption. The
orchestrator completed the same strict write zone locally to avoid stalling the
approved dependency gate. Independent correctness review remains mandatory
before acceptance.

# Verification

The first manifest run failed because the module did not exist; after the
minimal implementation, six manifest tests passed. The first filesystem run
failed for the same expected reason; after implementation, four filesystem
tests passed. Together they prove deterministic sorting, duplicate-target and
aggregate rejection, revision and phase CAS, exact fsync ordering, containment,
symlink rejection, streamed identity checks, no replacement, restart
reconciliation, and guarded rollback even when the development source is later
absent.

The final focused run passed 40/40 tests: 10 new recovery tests, 14 existing
snapshot tests, and 16 existing reindex-plan tests. The complete package
type-check passed, including required shared-package builds. Focused Prettier
and whitespace checks passed.

# Risks / Follow-ups

- File revision CAS depends on the approved host-level flock for single-writer
  operation; the later operator workflow must hold that lock across the run.
- UID/GID 1001 enforcement belongs to the executor runtime contract, not this
  pure filesystem module, and remains a blocking dependent test.
- The manifest carries sensitive IDs, paths, and hashes; later CLI and Compose
  work must keep it mode 0600 and out of tracked artifacts and logs.
- Independent review must resolve every P0/P1 finding before this stream is
  accepted or merged.

# Correction after independent review

Review commit `9796c3d1` reproduced four P1 contract gaps and three P2
hardening gaps against implementation commit `cf51722c`. The correction adds
the approved generation timestamp, pinned operator digest, audit version, and
canonical development/production roots to the immutable manifest. Filesystem
operations now compare their runtime roots with that reviewed binding and
reject equal or nested roots.

Every disposition now records exact prior `file_catalog` status/error values;
Career Playbook entries additionally bind source ID, playbook ID, user ID,
prior status, and prior error. Duplicate catalog/source identities are
rejected. The journal records immutable disposition kinds and a dedicated
`career_playbook_source_applied` checkpoint before the catalog CAS.

Whole-journal validation now requires canonical initial keys/states, coherent
copy/disposition completion before each forward phase, and fully published and
verified entries before `reindex_started`. Copy states freeze at that boundary.
The immutable manifest uses a no-replace hard link rather than a check followed
by overwriting rename, and the state directory is required to be a real,
current-UID-owned mode-0700 directory.

Copy temporary names are deterministically bound to run ID and entry ID.
Restart reuses or removes only an exact expected temporary, rejects mismatches,
and fsyncs cleanup. Rollback revalidates target device/inode immediately before
unlink. The remaining unavoidable path-operation race is delegated only to the
already-required operator proof of stable, exclusively owned directory
components while writers are stopped and the host-level lock is held.

Correction RED reproduced 13 failures. The corrected suite passed 47/47 across
12 manifest, 5 filesystem, 14 snapshot, and 16 reindex-plan tests. Full package
type-check and focused formatting/whitespace checks passed. A second independent
review is still required before acceptance.
