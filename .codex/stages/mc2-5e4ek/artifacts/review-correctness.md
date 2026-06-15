---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-5e4ek
stage_id: mc2-5e4ek
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Review stream for cross-module backend correctness and regression risk.
repo: mc2
branch: codex/single-source-course-generation-flow
base_branch: develop
base_commit: 96f82eb63cd82223237742e6002e4651d7dd34bb
worktree: /home/me/code/mc2
write_zone:
  - read-only review of course generation branch
success_criteria:
  - Identify correctness regressions in Stage 4/5 guardrails and bridge profile routing.
selected_docs:
  - graphify-out/GRAPH_REPORT.md
  - official OpenAI prompt guidance
selected_skills:
  - code-review
  - systematic-debugging
selected_agents:
  - correctness_reviewer
catalog_candidates:
  - none - installed reviewer was sufficient
parallel_group: S-review-correctness
depends_on_streams:
  - none
parallel_decision: parallel
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Read-only stream; no child worktree or branch remained.
risk_level: high
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: Stage 4/5 docs and DB reference updated during orchestrator fix pass.
verification:
  - pnpm --filter @megacampus/course-gen-platform test -- targeted Stage 5/router tests: passed
  - pnpm type-check: passed
  - pnpm build: passed
changed_files:
  - packages/course-gen-platform/src/server/routers/generation/_shared/helpers.ts
  - packages/course-gen-platform/src/server/routers/generation/lifecycle/generate.router.ts
  - packages/course-gen-platform/tests/unit/server/routers/generation/lifecycle/generate.router.test.ts
  - packages/course-gen-platform/tests/unit/server/routers/generation/build-stage5-job-input.test.ts
explicit_defers:
  - none
---

# Summary

Correctness review found one accepted blocking issue: Stage 5 job input construction did not preserve `course_size` and bridge `settings` on direct generate/restart/full-regenerate paths, so Career Playbook bridge validation could fall back to `general_auto`.

# Scope / Routing

Accepted fix: preserve `frontend_parameters.course_size` and `frontend_parameters.settings` in Stage 5 job input builders. Added regression coverage for both lifecycle `generate` and shared `buildStage5JobInput`.

Rejected as must-fix: validating raw LLM metadata before reconciliation. The runtime intentionally reconciles duration and senior-role difficulty before persisted validation; this is better tracked as eval/observability, not a release blocker.

# Verification

- Targeted backend tests passed: 6 files, 10 tests.
- `pnpm type-check` passed.
- `pnpm build` passed.

# Delivery / Cleanup

Read-only review accepted by orchestrator; fixes were implemented locally in the main worktree. No child branch cleanup was needed.

# Risks / Follow-ups

No correctness defers remain from this stream.
