---
schema_version: orchestration-artifact/v3
artifact_type: root-stream
stage_manifest: .codex/stages/mc2-stds7/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: Stage 6 targeted refinement loop
public_facade: internal token-budget safety boundary
bounded_acceptance: count only selected capped tasks remaining when the token budget stops execution across batches
non_goals:
  - changing token or task limit values
  - running a live model generation
  - executing deferred tasks in a second iteration
evidence:
  - none
task_id: mc2-stds7
epic_id: n/a
stage_id: mc2-stds7
session_id: mc2-stds7
milestone: targeted-refinement-combined-token-cap-safety
milestone_status: accepted
agent_type: root
subagent_model: n/a
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: a coupled production counter and deterministic regression test share one root acceptance boundary
repo: mc2
branch: develop
base_branch: develop
base_commit: 4dc9a24e7
worktree: /home/me/code/mc2
write_zone:
  - packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/orchestrator.ts
  - packages/course-gen-platform/tests/unit/stages/stage6-lesson-content/judge/targeted-refinement-orchestrator.test.ts
  - .codex/goals/mc2-stds7
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-stds7
success_criteria:
  - eight available tasks are capped to five selected tasks
  - exhaustion after the third selected task executes only three tasks
  - exactly two selected tasks are reported as budget-skipped
  - focused checks, type-check, and build pass
selected_docs:
  - specs/026-post-triage-priorities/spec.md
  - docs/reports/code-review/2026-04/token-safety-review.md
selected_skills:
  - orchestrator-stage
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
cleanup_notes: no child worktree or delegated branch was created; build, test, and graph outputs are ignored
risk_level: medium
risk_tags:
  - state
  - cost
affected_surfaces:
  - backend
invariants:
  - state-transition
  - test-matrix
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: the internal behavior is fully captured by the focused regression test and tracker acceptance
verification:
  - red combined unit test: failed as expected with skippedTasksDueToBudget=-1
  - final focused backend unit test: passed, 3 tests
  - focused Prettier: passed
  - focused ESLint: passed with 2 pre-existing complexity warnings and no errors
  - pnpm type-check: passed
  - pnpm build: passed with the pre-existing DEP0169 warning
  - graphify update and cluster-only: passed, 61441 nodes and 7299 communities
changed_files:
  - packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/orchestrator.ts
  - packages/course-gen-platform/tests/unit/stages/stage6-lesson-content/judge/targeted-refinement-orchestrator.test.ts
  - .codex/goals/mc2-stds7/scope-criterion-snapshot.json
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-stds7
explicit_defers:
  - none
---

# Summary

The missing combined-limit test exposed a real cross-batch counter bug. After three tasks in the
first batch exhausted the token budget, the next batch subtracted the global started count from its
local size and reported `-1` skipped task. Both executor paths now subtract from the five-task
selected set, so the same scenario reports the two selected tasks that did not start.

# Verification

The regression was captured red before the production edit and passes green with both existing
token-safety cases. Formatting, lint, type-check, build, and local graph refresh also pass.

# Delivery / Cleanup

Accepted in the primary `develop` worktree. No delegated branch or child worktree exists.

# Risks / Follow-ups

No in-scope follow-up remains. Limit values and live-generation behavior were intentionally
unchanged.
