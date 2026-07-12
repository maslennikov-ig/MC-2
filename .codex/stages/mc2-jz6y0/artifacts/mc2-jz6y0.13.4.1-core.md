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
changed_files:
  - packages/course-gen-platform/tools/qdrant/source-recovery-manifest.ts
  - packages/course-gen-platform/tools/qdrant/source-recovery-filesystem.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-manifest.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-filesystem.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.4.1-core.md
explicit_defers:
  - planner, database CAS, reindex binding, Stage 4 evidence, and operator wiring remain in dependent plan tasks
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
