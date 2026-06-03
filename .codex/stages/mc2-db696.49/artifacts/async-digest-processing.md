---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-db696.49
stage_id: mc2-db696.49
agent_type: orchestrator-local
subagent_model: n/a
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: Local orchestrator owned the cross-package async processing, digest, and prompt integration after delegated streams returned.
repo: mc2
branch: codex/career-playbook-business-context
base_branch: codex/career-playbook-business-context
base_commit: c342e8f5
worktree: /home/me/code/mc2-worktrees/career-playbook-business-context
write_zone:
  - packages/shared-types/src/bullmq-jobs.ts
  - packages/shared-types/src/career-playbook.ts
  - packages/shared-types/tests/career-playbook.test.ts
  - packages/course-gen-platform/src/orchestrator/handlers/career-playbook-handler.ts
  - packages/course-gen-platform/src/stages/stage-career-playbook/source-processing.ts
  - packages/course-gen-platform/src/stages/stage-career-playbook/nodes/business-context.ts
  - packages/course-gen-platform/src/server/routers/career-playbook/service.ts
  - packages/course-gen-platform/tests/unit/orchestrator/handlers/career-playbook-handler.test.ts
  - packages/course-gen-platform/tests/unit/server/routers/career-playbook-sources.router.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage-career-playbook/business-context.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage-career-playbook/source-processing.test.ts
success_criteria:
  - Career Playbook source uploads enqueue a source-processing operation without fake courses.
  - Business Context digest refresh handles text-only, file-only, and mixed inputs.
  - Follow-up generation blocks while selected sources are uploaded or processing.
  - Prompt tests prove business digest/source excerpts remain separate from web research.
selected_docs:
  - No external dependency documentation lookup needed; implementation reused existing repo Docling, processed-document, summarization, and BullMQ primitives.
selected_skills:
  - orchestrator-stage
  - task-router
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
selected_agents:
  - none - local cross-package integration stream after delegated backend/frontend/storage slices returned.
catalog_candidates:
  - none - installed repo skills and existing primitives were sufficient.
parallel_group: Stream A
depends_on_streams:
  - Stream B source lifecycle API
  - Stream C frontend status/polling UI
parallel_decision: local
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Local orchestrator work is integrated in the active stage branch; no separate child branch or worktree cleanup applies.
risk_level: high
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: Updated Career Playbook architecture docs, README readiness note, and project index for PROCESS_SOURCE, source statuses, list/remove lifecycle, and cascade FK migration.
verification:
  - 'npm exec --yes pnpm@8.15.0 -- --filter @megacampus/shared-types exec vitest run tests/career-playbook.test.ts': passed, 17/17 tests
  - 'SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-service-key npm exec --yes pnpm@8.15.0 -- exec vitest run --config vitest.config.unit.ts tests/unit/orchestrator/handlers/career-playbook-handler.test.ts': passed, 8/8 tests
  - 'SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-service-key npm exec --yes pnpm@8.15.0 -- exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage-career-playbook/source-processing.test.ts tests/unit/stages/stage-career-playbook/business-context.test.ts': passed, 5/5 tests
  - 'SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-service-key npm exec --yes pnpm@8.15.0 -- exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage-career-playbook/followup-questions.test.ts tests/unit/stages/stage-career-playbook/spec-builder.test.ts': passed, 11/11 tests
  - 'pnpm type-check': passed
changed_files:
  - packages/shared-types/src/bullmq-jobs.ts
  - packages/shared-types/src/career-playbook.ts
  - packages/shared-types/tests/career-playbook.test.ts
  - packages/course-gen-platform/src/orchestrator/handlers/career-playbook-handler.ts
  - packages/course-gen-platform/src/stages/stage-career-playbook/source-processing.ts
  - packages/course-gen-platform/src/stages/stage-career-playbook/nodes/business-context.ts
  - packages/course-gen-platform/src/server/routers/career-playbook/service.ts
  - packages/course-gen-platform/tests/unit/orchestrator/handlers/career-playbook-handler.test.ts
  - packages/course-gen-platform/tests/unit/server/routers/career-playbook-sources.router.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage-career-playbook/business-context.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage-career-playbook/source-processing.test.ts
  - .codex/stages/mc2-db696.49/artifacts/async-digest-processing.md
explicit_defers:
  - none
---

# Summary

Implemented the cross-package async Business Context processing stream locally after the delegated slices returned.

`PROCESS_SOURCE` is now part of the Career Playbook BullMQ contract and is handled by the Career Playbook worker. `source-processing.ts` reuses Docling conversion, processed-document storage, and summarization for Career Playbook source files without creating fake draft courses. Business Context digest refresh now combines text-only, file-only, and mixed inputs, tracks missing signals, and blocks follow-up requests while selected sources are still uploaded or processing.

# Scope / Routing

This stream owned shared job/source schemas, worker dispatch, source processing, digest refresh, and follow-up/spec prompt integration. Backend lifecycle API, frontend upload/status UI, and qdrant reference-count ownership were accepted through separate artifacts in the same stage.

No external dependency documentation lookup was needed; the work used existing repo-local processing primitives and contracts. Graphify was used for orientation from `graphify-out/GRAPH_REPORT.md` and the focused Career Playbook business-context query.

# Verification

Focused shared-types, backend handler, source-processing, business-context, follow-up, and spec-builder tests passed. `pnpm type-check` passed after the handler dispatch was narrowed by `jobData.operation`.

# Delivery / Cleanup

Accepted locally in the active stage worktree. No delegated branch cleanup applies to this stream.

# Risks / Follow-ups / Explicit Defers

No remaining follow-up is required for this stream. Universal mode remains supported and does not require files or company context.
