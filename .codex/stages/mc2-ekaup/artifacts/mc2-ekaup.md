---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-ekaup/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: career-playbook-viewer
public_facade: careerPlaybook.library.edit-and-regenerateBlock
bounded_acceptance: durable owner-only block edit and regeneration from viewer through persisted reload
non_goals:
  - reindex, schema migrations, secrets, access changes, deploy, or live paid regeneration
  - other Tier 1 tasks from specs/026-post-triage-priorities/spec.md
evidence:
  - none
task_id: mc2-ekaup
epic_id: mc2-p2908
stage_id: mc2-ekaup
session_id: mc2-ekaup
milestone: cohesive-vertical-slice
milestone_status: accepted
agent_type: custom
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: cross-module persistence and rollback boundary owned by one root executor
repo: mc2
branch: develop
base_branch: develop
base_commit: f225267fa
worktree: /home/me/code/mc2
write_zone:
  - packages/web Career Playbook viewer transport
  - packages/course-gen-platform Career Playbook library and worker persistence
  - focused Career Playbook tests and architecture docs
success_criteria:
  - unavailable edits do not mutate viewer state or claim a save
  - owner edits persist generated_blocks and final_markdown across reload
  - owner regeneration persists terminal block state and final_markdown with queue rollback
  - focused tests, type-check, and build pass without live paid calls
selected_docs:
  - specs/026-post-triage-priorities/spec.md
  - docs/career-playbook/architecture.md
selected_skills:
  - orchestrator-stage
  - superpowers-test-driven-development
  - superpowers-verification-before-completion
  - graphify-project
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: n/a
depends_on_streams:
  - none
parallel_decision: sequential
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: root owner used the primary develop worktree; no child worktree or branch exists to clean
risk_level: medium
risk_tags:
  - authorization
  - atomicity
  - state-transition
  - rollback
  - ui
  - user-flow
  - api
affected_surfaces:
  - data
  - api
  - backend
  - ui
  - user-flow
invariants:
  - tenancy
  - state-transition
  - rollback
  - test-matrix
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: docs/career-playbook/architecture.md now documents durable block actions and failure behavior
verification:
  - focused backend vitest via vitest.config.unit.ts: passed, 72 tests in canonical closeout
  - focused web vitest: passed, 24 tests in canonical closeout
  - red-green queue rollback and viewer supersession regressions: passed
  - pnpm run type-check: passed
  - pnpm run build: passed with tracked DEP0169 warning mc2-p2908.1
  - scripts/orchestration/run_process_verification.sh --stage mc2-ekaup: passed
changed_files:
  - docs/career-playbook/architecture.md
  - packages/course-gen-platform/src/orchestrator/handlers/career-playbook-handler.ts
  - packages/course-gen-platform/src/server/routers/career-playbook/_shared.ts
  - packages/course-gen-platform/src/server/routers/career-playbook/library-service.ts
  - packages/course-gen-platform/src/server/routers/career-playbook/library.router.ts
  - packages/course-gen-platform/src/stages/stage-career-playbook/nodes/final-assembler.ts
  - packages/course-gen-platform/tests/unit/orchestrator/handlers/career-playbook-handler.test.ts
  - packages/course-gen-platform/tests/unit/server/routers/career-playbook.router.test.ts
  - packages/web/app/[locale]/career-playbook/[id]/page-client.tsx
  - packages/web/messages/en/career-playbook.json
  - packages/web/messages/ru/career-playbook.json
  - packages/web/stores/use-career-playbook-store.ts
  - packages/web/tests/e2e/career-playbook/viewer-editor.spec.ts
  - packages/web/tests/unit/career-playbook-store-viewer.test.ts
  - packages/web/tests/unit/components/career-playbook/viewer-page-client.test.tsx
explicit_defers:
  - mc2-p2908.1 - Node DEP0169 url.parse build warning is tracked outside this Career Playbook slice
---

# Summary

The accepted implementation is committed in two product commits. The first removes the false local-save
success path. The second wires owner-only edit and regeneration through the backend, persists
`generated_blocks` with consistent `final_markdown`, polls the stored result, and compensates a
queue-preparation failure.

# Verification

Focused backend and web tests passed after their regression cases first failed against the old
behavior. Canonical stage acceptance passed all selected tests, `pnpm run type-check`,
`pnpm run build`, and process verification.

# Delivery / Cleanup

Root-owned changes are accepted on local `develop`; no remote delivery or deploy was requested. There is no
child worktree or branch to clean.

# Risks / Follow-ups

The authenticated E2E scenario was updated to verify edit persistence after reload but was not run,
because it requires a live mutable fixture. Regeneration was verified with mocked LLM and queue
boundaries only; no paid provider call was made. The successful production build emitted the
pre-existing Node `DEP0169 url.parse()` warning; `mc2-p2908.1` tracks call-site attribution and
remediation outside this slice.
