---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-6g1rr
stage_id: mc2-db696.83
agent_type: worker
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: Critical generation resilience bug found during live smoke; required local source tracing and regression coverage.
repo: /home/me/code/mc2
branch: codex/career-playbook-live-smoke-fixes
base_branch: develop
base_commit: b359ad92c7bc16c381df726160ebf1368459613b
worktree: /home/me/code/mc2
write_zone:
  - packages/course-gen-platform/src/stages/stage-career-playbook/nodes/group-generator.ts
  - packages/course-gen-platform/tests/unit/stages/stage-career-playbook/group-generator.test.ts
  - .codex/stages/mc2-db696.83/artifacts/mc2-6g1rr.md
success_criteria:
  - Missing model group blocks do not crash Career Playbook generation.
  - Required blocks are persisted with safe fallback content when extraction is partial.
  - The user sees structured quality issues for fallback blocks.
  - Existing strict splitter behavior remains available for callers that need hard validation.
selected_docs:
  - AGENTS.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - graphify-out/GRAPH_REPORT.md
selected_skills:
  - systematic-debugging
  - test-driven-development
  - verification-before-completion
selected_agents:
  - local Codex orchestrator/worker
catalog_candidates:
  - none
parallel_group: S4
depends_on_streams:
  - none
parallel_decision: local
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: No child worktree or child branch was created. Live-smoke generated playbooks were removed after verification.
risk_level: medium
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: Internal generation resilience behavior; user-facing quality issue display is already covered by existing viewer contract work.
verification:
  - pnpm --filter @megacampus/course-gen-platform test -- tests/unit/career-playbook-library-service.test.ts tests/unit/server/routers/career-playbook.router.test.ts tests/unit/shared/embeddings/generate.test.ts tests/unit/smoke/career-playbook-live-smoke.test.ts tests/unit/stages/stage-career-playbook/group-generator.test.ts tests/unit/stages/stage-career-playbook/final-assembler.test.ts: passed
  - pnpm type-check: passed
  - pnpm build: passed
  - live Career Playbook mutation smoke: passed
changed_files:
  - packages/course-gen-platform/src/stages/stage-career-playbook/nodes/group-generator.ts
  - packages/course-gen-platform/tests/unit/stages/stage-career-playbook/group-generator.test.ts
  - .codex/stages/mc2-db696.83/artifacts/mc2-6g1rr.md
explicit_defers:
  - none
---

# Summary

Fixed a live generation hard failure where the model returned partial group markdown without every required block header.

The strict `splitCareerPlaybookGroupMarkdown` contract still throws for direct hard-validation callers. The graph node now uses a partial splitter and fills missing required blocks with safe fallback markdown plus critical `CareerPlaybookQualityIssue` entries. This lets the job complete with visible quality remediation information instead of crashing and losing the playbook.

# Scope / Routing

The stream stayed in the Career Playbook group generator node and its unit tests. It does not change final block schema or public routes.

# Verification

- Group-generator unit coverage verifies fallback content and critical quality issue emission when a group block is missing.
- Combined targeted backend test run passed: 6 files / 88 tests.
- `pnpm type-check` passed.
- `pnpm build` passed.
- Live mutation smoke generated all 27 required blocks and passed deterministic checks.

# Delivery / Cleanup

Accepted by the orchestrator and manually integrated in the feature branch. Smoke-created playbooks were deleted after verification.

# Risks / Follow-ups / Explicit Defers

No explicit defer for this stream.
