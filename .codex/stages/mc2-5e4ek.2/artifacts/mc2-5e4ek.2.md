---
schema_version: orchestration-artifact/v3
artifact_type: root-stream
stage_manifest: .codex/stages/mc2-5e4ek.2/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: foundation
immediate_consumer: Stage 5 web UI and backend approval guard
public_facade: @megacampus/shared-types Stage 5 structural quality state
bounded_acceptance: one critical-warning-pass derivation used by every approval and display consumer
non_goals:
  - changing structural-quality validation rules
  - changing Stage 5 visual design or translations
  - changing persisted database schema
evidence:
  - none
task_id: mc2-5e4ek.2
epic_id: mc2-5e4ek
stage_id: mc2-5e4ek.2
session_id: mc2-5e4ek.2
milestone: shared-stage5-structural-quality-state
milestone_status: accepted
agent_type: root
subagent_model: n/a
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: the helper and all consumers require one coordinated root-owned change
repo: mc2
branch: develop
base_branch: develop
base_commit: f52719137
worktree: /home/me/code/mc2
write_zone:
  - packages/shared-types/src/stage5-structural-quality.ts
  - packages/shared-types/src/index.ts
  - packages/web/components/generation-graph/controls/ApprovalControls.tsx
  - packages/web/components/generation-graph/panels/stage5/Stage5OutputTab.tsx
  - packages/web/components/generation-graph/panels/stage5/types.ts
  - packages/course-gen-platform/src/server/routers/generation/status-helpers.ts
  - packages/web/tests/unit/components/generation-graph/stage5-structural-quality.test.ts
  - .beads/interactions.jsonl
  - .codex/goals/mc2-5e4ek.2
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-5e4ek.2
success_criteria:
  - one runtime helper normalizes structural quality metadata
  - all three consumers use the shared status
  - non-empty critical issues always win over a stale false flag
  - frontend tests cover critical, warning, and pass
  - focused checks, type-check, and build pass
selected_docs:
  - specs/026-post-triage-priorities/spec.md
  - packages/course-gen-platform/src/stages/stage5-generation/validators/structural-quality-validator.ts
  - packages/web/components/generation-graph/controls/ApprovalControls.tsx
  - packages/web/components/generation-graph/panels/stage5/Stage5OutputTab.tsx
selected_skills:
  - orchestrator-stage
  - task-router
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
cleanup_notes: no child worktree or delegated branch was created; build and graph outputs are ignored
risk_level: medium
risk_tags:
  - data
  - ui
affected_surfaces:
  - backend
  - ui
  - user-flow
invariants:
  - state-transition
  - test-matrix
docs_impact: structural
docs_reviewed: no-change-needed
docs_review_notes: the internal helper documents normalization and no external or operator contract changed
verification:
  - red frontend behavioral test without shared helper: failed as expected, 3 tests
  - final frontend behavioral test: passed, 3 tests
  - focused ESLint: passed with two pre-existing Stage5OutputTab size and complexity warnings
  - pnpm type-check: passed
  - pnpm build: passed with the pre-existing DEP0169 warning
  - graphify update and cluster-only: passed, 61406 nodes and 7311 communities
changed_files:
  - packages/shared-types/src/stage5-structural-quality.ts
  - packages/shared-types/src/index.ts
  - packages/web/components/generation-graph/controls/ApprovalControls.tsx
  - packages/web/components/generation-graph/panels/stage5/Stage5OutputTab.tsx
  - packages/web/components/generation-graph/panels/stage5/types.ts
  - packages/course-gen-platform/src/server/routers/generation/status-helpers.ts
  - packages/web/tests/unit/components/generation-graph/stage5-structural-quality.test.ts
  - .beads/interactions.jsonl
  - .codex/goals/mc2-5e4ek.2/scope-criterion-snapshot.json
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-5e4ek.2
explicit_defers:
  - none
---

# Summary

A shared runtime helper now validates and normalizes Stage 5 structural quality metadata into
`critical`, `warning`, or `pass`. Both web consumers and the backend approval guard use that exact
state instead of maintaining independent casts and branching rules.

# Scope / Routing

The validator that produces structural issues is unchanged. The helper accepts persisted unknown
data, normalizes display-safe issues and metrics, and treats either a true critical flag or a
non-empty critical list as blocking.

# Verification

The initial frontend test failed because no shared export existed. After integration, its critical,
warning, and pass cases all pass. Focused lint has no errors; the only warnings are the existing
size and complexity warnings on Stage5OutputTab. Cross-package type-check and build pass.

# Delivery / Cleanup

Accepted in the primary `develop` worktree. No delegated branch or child worktree exists.

# Risks / Follow-ups / Explicit Defers

Malformed issue entries are omitted from display, but any non-empty raw critical list still blocks
approval. This preserves the previous fail-safe behavior while preventing consumer drift.
