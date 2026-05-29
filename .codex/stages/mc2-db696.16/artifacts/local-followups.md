---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-db696.16
stage_id: mc2-db696.16
agent_type: local-orchestrator
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: local execution; current request did not re-authorize spawned subagents and the write zones share verification
repo: mc2
branch: codex/career-playbook-open-followups
base_branch: origin/develop
base_commit: a92ffb704cc854b0b04a7ff78421f53a96e5d3e8
worktree: /home/me/code/mc2
write_zone:
  - packages/course-gen-platform/src/server/routers/career-playbook
  - packages/course-gen-platform/tests/unit/server/routers
  - .github/workflows/ci-cd.yml
  - docs/career-playbook
  - .codex
success_criteria:
  - Career Playbook bridge synthetic documents explicitly reserve and release storage quota with tests
  - Master Integration Tests Qdrant failure is traced and a CI environment fix is prepared
  - Live staging mutation smoke remains gated unless all external inputs are present
selected_docs:
  - AGENTS.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - docs/career-playbook/architecture.md
  - GitHub Actions service containers documentation
selected_skills:
  - orchestrator-stage
  - task-router
  - superpowers:test-driven-development
  - superpowers:systematic-debugging
  - superpowers:verification-before-completion
  - orchestration-closeout
selected_agents:
  - none - current request did not explicitly authorize spawned visible subagents
catalog_candidates:
  - none - installed skills covered routing and execution
parallel_group: career-playbook-open-followups
depends_on_streams:
  - none
parallel_decision: local
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: no separate worker branch or worktree was created; existing product-ia-course-landing worktree was not touched
risk_level: medium
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: docs/career-playbook/architecture.md and .codex/project-index.md now document bridge storage/quota ownership
verification:
  - BULLMQ_QUEUE_NAME=career-playbook-smoke-20260529 pnpm --dir packages/course-gen-platform smoke:career-playbook:preflight --target staging --json: passed read-only
  - BULLMQ_QUEUE_NAME=career-playbook-smoke-20260529 pnpm --dir packages/course-gen-platform smoke:career-playbook:live --target staging --json: blocked as expected in non-mutating plan mode
  - gh run/job logs for master Integration Tests 26302972590, 26327011300, 26327410635, 26441929337: same Qdrant getCollections Not Found root cause
  - python3 YAML parse for .github/workflows/ci-cd.yml: passed
  - pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/server/routers/career-playbook-course-bridge.service.test.ts: passed
  - pnpm --filter @megacampus/course-gen-platform type-check: passed
  - pnpm --filter @megacampus/course-gen-platform lint: passed with existing warnings
  - git diff --check: passed
changed_files:
  - .github/workflows/ci-cd.yml
  - packages/course-gen-platform/src/server/routers/career-playbook/course-bridge.service.ts
  - packages/course-gen-platform/src/server/routers/career-playbook/course-bridge-storage.ts
  - packages/course-gen-platform/tests/unit/server/routers/career-playbook-course-bridge.service.test.ts
  - docs/career-playbook/architecture.md
  - .codex/project-index.md
explicit_defers:
  - mc2-db696.11.5 remains gated on disposable staging token/user/org, tRPC URL, cleanup scope, cost budget, and explicit mutation confirmation
  - mc2-db696.11.6 remains blocked by mc2-db696.11.5
  - mc2-db696.18 needs PR/develop/master CI evidence after this branch is delivered
---

# Summary

Implemented the actionable local follow-ups in one branch. The Career Playbook course bridge now keeps direct synthetic markdown writes but wraps them in explicit storage quota accounting. Master Integration Tests now use a local Qdrant service container in the integration job instead of the misbehaving Qdrant secrets path.

# Scope / Routing

Local execution was chosen because the code changes share backend verification and current spawned-subagent authorization was not present in the latest request. Graphify is not configured in this repo. GitHub Actions service-container behavior was checked against official GitHub documentation.

# Verification

Focused Career Playbook bridge tests were run RED and GREEN. Backend type-check, backend lint, YAML parse, `git diff --check`, live-smoke read-only preflight, and non-mutating live plan checks were run locally.

# Delivery / Cleanup

No extra worktree was created. The existing separate Product IA worktree was not touched.

# Risks / Follow-ups / Explicit Defers

The Qdrant CI fix cannot be proven by local Docker in this WSL environment because Docker is unavailable here. It should be proven by PR/develop/master CI after branch delivery. Live staging mutation smoke and the 10-concurrent load test remain gated by external disposable staging fixtures and explicit mutation/cost approval.
