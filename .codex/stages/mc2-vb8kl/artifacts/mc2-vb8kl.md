---
schema_version: orchestration-artifact/v3
artifact_type: root-stream
stage_manifest: .codex/stages/mc2-vb8kl/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: Stage 2 document-processing worker
public_facade: n/a
bounded_acceptance: isolate course progress from Qdrant reindex jobs without changing ordinary jobs
non_goals:
  - executing a live reindex
  - changing document, embedding, or Qdrant processing
  - changing the producer job-id contract
evidence:
  - red-to-green-origin-regression
task_id: mc2-vb8kl
epic_id: n/a
stage_id: mc2-vb8kl
session_id: mc2-vb8kl
milestone: qdrant-reindex-course-progress-isolation
milestone_status: accepted
agent_type: root
subagent_model: n/a
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: all Stage 2 progress call sites share one job-origin boundary and one root acceptance set
repo: mc2
branch: develop
base_branch: develop
base_commit: c36adc111
worktree: /home/me/code/mc2
write_zone:
  - packages/course-gen-platform/src/stages/stage2-document-processing/orchestrator-job-origin.ts
  - packages/course-gen-platform/src/stages/stage2-document-processing/orchestrator-helpers.ts
  - packages/course-gen-platform/src/stages/stage2-document-processing/orchestrator-phase-helpers.ts
  - packages/course-gen-platform/tests/unit/stages/stage2-document-processing/orchestrator-phase-helpers.test.ts
  - .beads/interactions.jsonl
  - .codex/goals/mc2-vb8kl
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-vb8kl
success_criteria:
  - all eight Stage 2 course-progress writes share one reindex-origin guard
  - Qdrant reindex jobs write no course-level progress
  - ordinary jobs keep the existing progress writes
  - focused checks, type-check, and build pass
selected_docs:
  - specs/026-post-triage-priorities/spec.md
  - packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts
selected_skills:
  - orchestrator-stage
  - task-router
  - superpowers:systematic-debugging
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: n/a
depends_on_streams:
  - none
parallel_decision: local-root-owner
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: no child worktree, delegated branch, live reindex, or temporary service was created
risk_level: medium
risk_tags:
  - state-transition
  - operations
affected_surfaces:
  - backend
  - operations
invariants:
  - state-transition
  - test-matrix
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: the behavior is internal and fully expressed by code and regression coverage
verification:
  - red focused regression: failed with four unguarded course-progress calls
  - complete Stage 2 unit set: passed, 12 files and 122 tests
  - focused Prettier and ESLint: passed
  - pnpm type-check: passed
  - pnpm build: passed with the pre-existing DEP0169 warning
  - graphify update and cluster-only: passed, 61464 nodes and 7310 communities
changed_files:
  - packages/course-gen-platform/src/stages/stage2-document-processing/orchestrator-job-origin.ts
  - packages/course-gen-platform/src/stages/stage2-document-processing/orchestrator-helpers.ts
  - packages/course-gen-platform/src/stages/stage2-document-processing/orchestrator-phase-helpers.ts
  - packages/course-gen-platform/tests/unit/stages/stage2-document-processing/orchestrator-phase-helpers.test.ts
  - .beads/interactions.jsonl
  - .codex/goals/mc2-vb8kl/scope-criterion-snapshot.json
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-vb8kl
explicit_defers:
  - none
---

# Summary

Every Stage 2 course-progress write now passes through one origin guard. Jobs whose ids use the
existing Qdrant reindex prefix skip those course transitions, while ordinary jobs retain them.

# Verification

The regression first observed four unguarded writes across initialization and vector indexing. It
then proved zero writes for the same reindex origin and three preserved writes for an ordinary
vector job. The complete Stage 2 unit set and repository code gates passed.

# Delivery / Cleanup

Accepted in the primary `develop` worktree. No live reindex or delegated workspace was used.

# Risks / Follow-ups / Explicit Defers

None. The guard deliberately relies on the producer's stable internal `qdrant-reindex-` prefix.
