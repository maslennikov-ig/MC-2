---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-1uzub
stage_id: mc2-1uzub
agent_type: improvement_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: role_default
model_reasoning_rationale: review role uses high reasoning by runtime policy
repo: /home/me/code/mc2
branch: codex/career-playbook-course-preview-bridge
base_branch: develop
base_commit: 3543fb533564e5666f3df6001c7184b93fa4f3de
worktree: /home/me/code/mc2
write_zone:
  - read-only current diff
success_criteria:
  - high-value improvements identified with evidence
  - top 3 recommended next improvements reported
selected_docs:
  - AGENTS.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
selected_skills:
  - code-review
selected_agents:
  - improvement_reviewer
catalog_candidates:
  - none
parallel_group: review-improvements
depends_on_streams:
  - none
parallel_decision: parallel
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: read-only reviewer agent closed; no branch or worktree cleanup required
risk_level: medium
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: course bridge flow and architecture updated after accepted findings
verification:
  - git diff --check: passed by reviewer and parent process verification
changed_files:
  - none-read-only-review
explicit_defers:
  - none
---

# Summary

Improvement reviewer reported four findings:

1. Make preview tolerant to optional business-context source listing failures.
2. Do not upload warning-only business-context evidence.
3. Respect `viewerPermissions.canCreateCourse` in the private viewer.
4. Localize course size/style option labels.

The orchestrator accepted and fixed the first three. The fourth was rejected for
this pass as UI polish outside the material review-and-fix scope.

# Scope / Routing

Scope was the current uncommitted Career Playbook Role Guide -> course bridge
diff, with emphasis on UX/API, maintainability, reliability, docs usefulness,
tests, and observability. The stream was read-only and ran in parallel with the
correctness review.

# Verification

Reviewer verification was read-only static review. Parent verification after fixes:

- `pnpm exec vitest run --config vitest.config.unit.ts tests/unit/server/routers/career-playbook-course-bridge.service.test.ts tests/unit/server/routers/career-playbook.router.test.ts`: passed
- `pnpm exec vitest run tests/unit/components/career-playbook/create-course-from-playbook-dialog.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx tests/unit/components/career-playbook/library-page-client.test.tsx`: passed
- `pnpm --filter @megacampus/course-gen-platform type-check`: passed
- `pnpm --filter @megacampus/web type-check`: passed
- `pnpm build`: passed
- `scripts/orchestration/run_process_verification.sh`: passed

# Delivery / Cleanup

No child code was merged; the reviewer was read-only. Findings were manually
integrated by the orchestrator in the parent workspace. The reviewer agent was
closed after acceptance.

# Risks / Follow-ups

Top 3 recommended next improvements after this pass:

1. Localize course size/style option labels in the bridge dialog.
2. Consider a structured loader result for business-context evidence instead of sentinel warning strings.
3. Add browser-level coverage for the full private viewer -> preview -> generation redirect flow when an authenticated staging fixture is available.
