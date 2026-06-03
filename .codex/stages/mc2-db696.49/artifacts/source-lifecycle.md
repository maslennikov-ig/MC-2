---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-db696.50
stage_id: mc2-db696.49
agent_type: db_migration_specialist
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: DB/storage lifecycle, FK behavior, quota cleanup, and access control are high-risk.
repo: mc2
branch: codex/career-playbook-business-context
base_branch: codex/career-playbook-business-context
base_commit: c342e8f5
worktree: /home/me/code/mc2-worktrees/career-playbook-business-context
write_zone:
  - packages/course-gen-platform/src/server/routers/career-playbook/sources.service.ts
  - packages/course-gen-platform/src/server/routers/career-playbook/sources.router.ts
  - packages/course-gen-platform/src/server/routers/career-playbook/_shared.ts
  - packages/course-gen-platform/tests/unit/server/routers/career-playbook.router.test.ts
  - packages/course-gen-platform/supabase/migrations/20260603123000_cascade_career_playbook_source_file_catalog.sql
  - .codex/stages/mc2-db696.49/artifacts/source-lifecycle.md
success_criteria:
  - listSources returns active source records for accessible playbooks.
  - removeSource enforces owner/superadmin access and cleans file_catalog/local file/quota when safe.
  - File catalog delete errors do not release quota or delete local files.
  - Course upload fake-course regression remains covered.
selected_docs:
  - Supabase Storage upload/remove docs checked by orchestrator.
  - Supabase RLS docs checked by orchestrator.
selected_skills:
  - superpowers:test-driven-development
  - orchestrator-stage
selected_agents:
  - built-in db_migration_specialist
catalog_candidates:
  - none
parallel_group: Stream B
depends_on_streams:
  - none
parallel_decision: local
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Accepted stream is integrated in the active stage branch; no separate child branch or worktree cleanup remains.
risk_level: high
docs_impact: migration
docs_reviewed: no-change-needed
docs_review_notes: Backend API behavior and migration are covered by artifact; no durable user docs were in this write zone.
graph_reviewed: updated
graph_review_notes: 'graphify update . && graphify cluster-only . --no-viz rebuilt 56884 nodes / 78828 edges.'
verification:
  - 'SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-service-key SUPABASE_ANON_KEY=test-anon-key NODE_ENV=test npm exec --yes pnpm@8.15.0 -- exec vitest run --config vitest.config.unit.ts tests/unit/server/routers/career-playbook.router.test.ts tests/unit/server/routers/career-playbook-sources.router.test.ts': passed, 50/50 tests
  - 'SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=dummy SUPABASE_ANON_KEY=dummy npm exec --yes pnpm@8.15.0 -- --filter @megacampus/course-gen-platform type-check': failed, blocked by sibling Stream A type union error in src/orchestrator/handlers/career-playbook-handler.ts
  - 'git diff --check -- <write-zone files>': passed
  - 'python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-db696.49/artifacts/source-lifecycle.md': passed
  - 'graphify update . && graphify cluster-only . --no-viz': passed, rebuilt 56884 nodes / 78828 edges
changed_files:
  - packages/course-gen-platform/src/server/routers/career-playbook/_shared.ts
  - packages/course-gen-platform/src/server/routers/career-playbook/sources.router.ts
  - packages/course-gen-platform/src/server/routers/career-playbook/sources.service.ts
  - packages/course-gen-platform/tests/unit/server/routers/career-playbook.router.test.ts
  - packages/course-gen-platform/tests/unit/server/routers/career-playbook-sources.router.test.ts
  - packages/course-gen-platform/supabase/migrations/20260603123000_cascade_career_playbook_source_file_catalog.sql
  - .codex/stages/mc2-db696.49/artifacts/source-lifecycle.md
explicit_defers:
  - none
---

# Summary

Implemented the Career Playbook source lifecycle backend slice. `careerPlaybook.sources.listSources` lists non-removed persisted sources after playbook owner/superadmin access checks. `careerPlaybook.sources.removeSource` loads the source and file metadata, deletes safe `file_catalog` rows, relies on FK cascade for the source row, releases quota, and removes local files only for non-deduplicated single-reference files.

# Scope / Routing

The implementation stayed inside the assigned backend router/service/test/migration write zone. No frontend UI, process-source digest logic, or qdrant helper audit was implemented. The migration changes only delete behavior for the existing `career_playbook_sources.file_catalog_id` FK from `RESTRICT` to `CASCADE`; it does not loosen RLS.

# Verification

RED was verified with the package-relative vitest command: the new lifecycle tests failed because `listSources` and `removeSource` were not wired. GREEN was verified after implementation: the router and source-lifecycle router tests passed with 50 tests.

Package type-check was attempted and blocked by a sibling Stream A compile error unrelated to this write zone: `src/orchestrator/handlers/career-playbook-handler.ts(63,33)` receives a union including a source-processing payload where the handler expects the generation payload fields `instruction`, `blockId`, `roleProfileSpec`, and `originalBlock`.

# Delivery / Cleanup

Returned for orchestrator review. This worker did not close the Beads task or clean up the isolated worktree.

# Risks / Follow-ups

Rollback for the migration is to drop and recreate `career_playbook_sources_file_catalog_id_fkey` with `ON DELETE RESTRICT`. For shared original files with `reference_count > 1`, `removeSource` deletes only the source row and releases quota, leaving the original `file_catalog` row and physical file in place to avoid cascading other deduplicated references.

No remaining follow-up is required for this stage. The sibling type-check blocker was fixed by
the orchestrator and `pnpm type-check` passed.
