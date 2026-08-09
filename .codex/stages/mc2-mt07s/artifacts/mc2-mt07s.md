---
schema_version: orchestration-artifact/v3
artifact_type: root-stream
stage_manifest: .codex/stages/mc2-mt07s/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: foundation
immediate_consumer: Stage 6 generation and self-review model routing
public_facade: Stage 6 phase-based model configuration boundary
bounded_acceptance: preserve non-ru/en language codes across phase-based routing without a live quality claim
non_goals:
  - evaluating multilingual model output quality
  - changing configured model ids
  - changing database model configuration
  - running a paid generation
evidence:
  - none
task_id: mc2-mt07s
epic_id: n/a
stage_id: mc2-mt07s
session_id: mc2-mt07s
milestone: stage6-raw-language-phase-routing
milestone_status: accepted
agent_type: root
subagent_model: n/a
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: restatement and coupled production paths require one evidence-backed root decision
repo: mc2
branch: develop
base_branch: develop
base_commit: 02bb9a670
worktree: /home/me/code/mc2
write_zone:
  - packages/course-gen-platform/src/stages/stage6-lesson-content
  - packages/course-gen-platform/tests/unit/stages/stage6-lesson-content
  - packages/course-gen-platform/tests/integration/stage6/handler.test.ts
  - packages/course-gen-platform/tests/e2e/stage2-6-full-pipeline.test.ts
  - .beads/interactions.jsonl
  - .codex/goals/mc2-mt07s
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-mt07s
success_criteria:
  - original issue is restated to current phase-based routing truth
  - no Stage 6 model path normalizes arbitrary languages to English
  - main generation and self-review preserve de in model configuration calls
  - legacy language-keyed primary fallback state is absent
  - focused checks, type-check, and build pass
selected_docs:
  - specs/026-post-triage-priorities/spec.md
  - packages/course-gen-platform/src/shared/llm/model-config-service.ts
  - packages/course-gen-platform/src/stages/stage6-lesson-content/services/job-processor.ts
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
cleanup_notes: no child worktree or delegated branch was created; build, test, and graph outputs are ignored
risk_level: medium
risk_tags:
  - api
  - user-flow
affected_surfaces:
  - backend
  - user-flow
invariants:
  - state-transition
  - test-matrix
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: tracker restatement and tests capture the internal routing contract; no public quality matrix is claimed
verification:
  - red fallback-shape test before implementation: failed as expected, 1 of 2 tests
  - red self-review language test before implementation: failed as expected, de was received as en
  - final focused backend unit tests: passed, 36 tests across 3 files
  - focused ESLint and Prettier: passed with 10 pre-existing warnings in legacy integration and e2e files
  - normalization and dead-helper search: passed with no matches in Stage 6 model routing
  - pnpm type-check: passed
  - pnpm build: passed with the pre-existing DEP0169 warning
  - graphify update and cluster-only: passed, 61430 nodes and 7310 communities
changed_files:
  - packages/course-gen-platform/src/stages/stage6-lesson-content/services/model-service.ts
  - packages/course-gen-platform/src/stages/stage6-lesson-content/config/index.ts
  - packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-llm.ts
  - packages/course-gen-platform/tests/unit/stages/stage6-lesson-content/services/model-routing-language.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage6-lesson-content/services/job-processor.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage6-lesson-content/nodes/self-reviewer-llm-model-used.test.ts
  - packages/course-gen-platform/tests/integration/stage6/handler.test.ts
  - packages/course-gen-platform/tests/e2e/stage2-6-full-pipeline.test.ts
  - .beads/interactions.jsonl
  - .codex/goals/mc2-mt07s/scope-criterion-snapshot.json
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-mt07s
explicit_defers:
  - mc2-v6fqp - live multilingual model-quality evaluation requires a separately approved paid run
---

# Summary

The issue is restated from a broad ru/en-only model-routing risk to the narrower current truth.
Live Stage 6 routing was already phase/tier based, but one self-review path still rewrote arbitrary
languages to English and an uncalled helper preserved the old behavior. Both are now removed.

# Scope / Routing

The main generation quality ladder and the semantic self-review now pass the source language code
unchanged to `getModelForPhase`. Hardcoded primary selection remains owned by canonical phase
defaults, not a language-keyed emergency map.

# Verification

Two red tests proved the old fallback shape and the self-review `de` to `en` rewrite. The final
36-test backend slice covers raw-language propagation in the shared phase helper, main job
processor, and self-reviewer. Lint, formatting, type-check, build, and graph refresh pass.

# Delivery / Cleanup

Accepted in the primary `develop` worktree. No delegated branch or child worktree exists.

# Risks / Follow-ups / Explicit Defers

This change proves routing metadata, not output quality. Measuring language-tier quality requires
live model calls and an approved spend, so it is explicitly outside this stage.
