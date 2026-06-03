---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-si7jz
stage_id: mc2-db696.49
agent_type: worker
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: reference-count deletion semantics can create storage leaks or data loss
repo: mc2
branch: codex/career-playbook-business-context
base_branch: codex/career-playbook-business-context
base_commit: c342e8f5
worktree: /home/me/code/mc2-worktrees/career-playbook-business-context
write_zone:
  - packages/course-gen-platform/src/shared/qdrant/lifecycle-helpers.ts
  - packages/course-gen-platform/src/shared/qdrant/lifecycle.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/
  - packages/course-gen-platform/src/shared/qdrant/LIFECYCLE-README.md
  - .codex/stages/mc2-db696.49/artifacts/refcount-audit.md
success_criteria:
  - Identify remaining manual increment_file_reference_count/decrement_file_reference_count calls in qdrant lifecycle code
  - Remove manual refcount RPC ownership after DB trigger migration
  - Prove insert/delete file_catalog row paths do not invoke manual refcount RPCs
selected_docs:
  - packages/course-gen-platform/supabase/migrations/20251218_add_reference_count_triggers.sql
  - packages/course-gen-platform/supabase/migrations/20251015_add_content_deduplication.sql
  - packages/course-gen-platform/src/shared/qdrant/LIFECYCLE-README.md
selected_skills:
  - superpowers:test-driven-development
  - orchestrator-stage
selected_agents:
  - built-in worker
catalog_candidates:
  - none
parallel_group: Stream D
depends_on_streams:
  - none
parallel_decision: local
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Accepted stream is integrated in the active stage branch; no separate child branch or worktree cleanup remains.
risk_level: high
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: Updated qdrant lifecycle README to describe trigger-owned reference counts and original-with-active-references delete guard.
verification:
  - rg increment_file_reference_count/decrement_file_reference_count in shared qdrant production code: passed
  - focused lifecycle-refcount vitest: passed
  - existing qdrant lifecycle vitest import smoke: passed
  - git diff --check: passed
  - pnpm type-check: blocked
changed_files:
  - packages/course-gen-platform/src/shared/qdrant/lifecycle-helpers.ts
  - packages/course-gen-platform/src/shared/qdrant/lifecycle.ts
  - packages/course-gen-platform/src/shared/qdrant/LIFECYCLE-README.md
  - packages/course-gen-platform/tests/unit/shared/qdrant/lifecycle-refcount.test.ts
  - .codex/stages/mc2-db696.49/artifacts/refcount-audit.md
explicit_defers:
  - none
---

# Summary

Audited shared qdrant lifecycle reference-count ownership after the 20251218 trigger migration.
The remaining production manual RPC owners were `incrementReferenceCount()` and
`decrementReferenceCount()` in `lifecycle-helpers.ts`, reached by
`processDeduplicatedUpload()` and `handleFileDelete()`.

Removed those manual `increment_file_reference_count` / `decrement_file_reference_count`
calls. Deduplicated upload now relies on the reference-row INSERT trigger and deletes the
inserted reference row on downstream deduplication failure so the DELETE trigger rolls back
the count. `handleFileDelete()` deletes the `file_catalog` row first and then reads the
original row's persisted `reference_count` after the DELETE trigger runs.

Deleting an original row with active references is blocked before Qdrant or DB mutation.
The existing FK uses `ON DELETE CASCADE`, so allowing that path would delete reference rows
without a defined promotion/tombstone policy.

# Scope / Routing

Documentation was repo-local only: qdrant lifecycle README and the reference-count trigger
migration. Graphify was used for orientation from the refreshed report and focused query
provided in the task context. No external dependency docs or catalog assets were needed.

# Verification

- RED: `lifecycle-refcount.test.ts` initially failed on manual increment RPC, manual decrement
  count behavior, missing rollback delete, and original-with-active-references delete.
- GREEN: `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=dummy SUPABASE_ANON_KEY=dummy npm exec --yes pnpm@8.15.0 -- --filter @megacampus/course-gen-platform exec vitest --config vitest.config.unit.ts run tests/unit/shared/qdrant/lifecycle-refcount.test.ts` passed, 4 tests.
- Existing qdrant smoke: same command for `tests/unit/shared/qdrant/lifecycle.test.ts` passed with 0 Vitest tests.
- `rg -n "increment_file_reference_count|decrement_file_reference_count|incrementReferenceCount|decrementReferenceCount" packages/course-gen-platform/src/shared/qdrant packages/course-gen-platform/tests/unit/shared/qdrant` found production references removed; remaining matches are negative assertions in tests.
- `git diff --check` passed.
- `pnpm type-check` blocked on pre-existing/out-of-scope Career Playbook error at `packages/course-gen-platform/src/orchestrator/handlers/career-playbook-handler.ts:63`.

# Delivery / Cleanup

Returned for orchestrator review. No cleanup performed because this is the active spawned
worker worktree with unrelated sibling-stream changes present.

# Risks / Follow-ups

No remaining follow-up is required for this stage. The orchestrator accepted the guard that
blocks original-file deletion while references exist because it avoids unsafe cascade data loss
without needing promotion/tombstone semantics in this change.
