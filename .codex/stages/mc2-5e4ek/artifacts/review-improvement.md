---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-5e4ek
stage_id: mc2-5e4ek
agent_type: improvement_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Review stream for maintainability, UX contract, and over/under-built behavior.
repo: mc2
branch: codex/single-source-course-generation-flow
base_branch: develop
base_commit: 96f82eb63cd82223237742e6002e4651d7dd34bb
worktree: /home/me/code/mc2
write_zone:
  - read-only review of course generation branch
success_criteria:
  - Identify maintainability and UX risks after structure quality implementation.
selected_docs:
  - graphify-out/GRAPH_REPORT.md
selected_skills:
  - code-review
selected_agents:
  - improvement_reviewer
catalog_candidates:
  - none - installed reviewer was sufficient
parallel_group: S-review-improvement
depends_on_streams:
  - none
parallel_decision: parallel
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Read-only stream; no child worktree or branch remained.
risk_level: medium
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: Structure quality spec now documents post-edit metadata recomputation.
verification:
  - pnpm --filter @megacampus/course-gen-platform test -- targeted Stage 5/router tests: passed
  - pnpm --filter @megacampus/web exec eslint Stage 5 UI files: passed
  - pnpm type-check: passed
changed_files:
  - packages/course-gen-platform/src/server/routers/generation/editing/structural-quality-metadata.ts
  - packages/course-gen-platform/src/server/routers/generation/editing/chat-apply-helpers.ts
  - packages/course-gen-platform/src/server/routers/generation/editing/element-crud-helpers.ts
  - packages/course-gen-platform/src/server/routers/generation/editing/field-update.router.ts
  - packages/course-gen-platform/src/server/routers/generation/editing/regeneration.router.ts
explicit_defers:
  - mc2-5e4ek.2 - centralize Stage 5 structural quality UI state contract and add behavioral UI tests
  - mc2-pmrmf.1.1 - add read-only model config health check for deprecated provider model IDs
---

# Summary

Improvement review found the most important real risk: Stage 5 manual edits and element mutations could leave `generation_metadata.quality_scores.structure` stale, blocking users even after they fixed the structure.

# Scope / Routing

Accepted and fixed: added `buildStage5StructuralQualityMetadataUpdate` and wired it into field updates, regeneration, chat structural proposals, and element add/delete.

Deferred: centralizing frontend/backend UI quality interpretation and adding a model-config deprecation health check are valuable but not required for this correctness fix.

# Verification

- New helper regression test confirms stale critical blockers clear after a valid Stage 5 structure is saved.
- Targeted backend tests passed: 6 files, 10 tests.
- Frontend eslint for touched Stage 5 files passed.
- `pnpm type-check` passed.

# Delivery / Cleanup

Read-only review accepted by orchestrator; fixes were implemented locally in the main worktree. No child branch cleanup was needed.

# Risks / Follow-ups

- `mc2-5e4ek.2`
- `mc2-pmrmf.1.1`
