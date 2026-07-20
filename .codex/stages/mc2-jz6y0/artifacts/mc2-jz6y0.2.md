---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.2
stage_id: mc2-jz6y0
agent_type: backend_developer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Foundational multilingual search schema and strict-mode values require exact data-contract reasoning.
repo: /home/me/code/mc2
branch: codex/qdrant-q1-schema
base_branch: codex/self-hosted-qdrant-platform
base_commit: 01f2c09049e3e87f503af29035df07d4825fe01b
worktree: /home/me/code/mc2/.worktrees/qdrant-q1-schema
write_zone:
  - packages/course-gen-platform/src/shared/qdrant/config.ts
  - packages/course-gen-platform/src/shared/qdrant/collection-schema.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/collection-schema.test.ts
  - packages/course-gen-platform/package.json
  - pnpm-lock.yaml
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.2.md
success_criteria:
  - Native multilingual BM25 uses collection-side IDF and the approved no-stemming options.
  - Collection schema fixes the dense vector at 768 dimensions and defines all eleven payload indexes and exact strict-mode limits.
  - The Qdrant JavaScript client is pinned exactly to 1.18.0 and focused tests plus package type-check pass.
selected_docs:
  - docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md
  - docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md
  - .superpowers/sdd/task-1-brief.md
  - https://qdrant.tech/documentation/search/text-search/full-text-search/
  - https://qdrant.tech/documentation/manage-data/indexing/
  - https://qdrant.tech/documentation/manage-data/collections/
  - https://qdrant.tech/documentation/ops-configuration/administration/
selected_skills:
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
  - superpowers:executing-plans
  - superpowers:using-git-worktrees
  - senior-architect
selected_agents:
  - backend_developer
catalog_candidates:
  - none - installed skills and the assigned backend persona covered the task
parallel_group: S1-search-correctness-Q1
depends_on_streams:
  - none
parallel_decision: sequential
status: merged
delivery_method: merge
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Integrated as 91ecd115 through a no-ff merge; dedicated worktree and local task branch removed after fresh integrated verification. Remote evidence branch retained.
risk_level: medium
docs_impact: api-contract
docs_reviewed: no-change-needed
docs_review_notes: The approved design already documents the exact schema; operator and module documentation is owned by planned Q10, while Q1 introduces no user-facing workflow.
graph_reviewed: used
graph_review_notes: Read the shared Graphify report; the parent supplied focused Qdrant/Stage 2/5/6 query context. Graph refresh remains stage-closeout work because graphify-out is not present in this isolated write zone.
verification:
  - pnpm --filter @megacampus/course-gen-platform type-check (baseline): passed
  - SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant/collection-schema.test.ts (RED): failed as expected on missing collection-schema module
  - pnpm install --lockfile-only: passed; lockfile self-review retained only the exact client specifier change
  - SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant/collection-schema.test.ts (GREEN): passed, 4 tests
  - pnpm --filter @megacampus/course-gen-platform type-check: passed
  - git diff --check: passed
  - python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.2.md: passed
  - orchestrator rerun focused Vitest after integration: passed, 4 tests
  - orchestrator rerun package type-check after integration: passed
  - independent correctness review: spec compliant, task quality approved, no findings
changed_files:
  - packages/course-gen-platform/src/shared/qdrant/config.ts
  - packages/course-gen-platform/src/shared/qdrant/collection-schema.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/collection-schema.test.ts
  - packages/course-gen-platform/package.json
  - pnpm-lock.yaml
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.2.md
explicit_defers:
  - none
---

# Summary

Added the pure self-hosted Qdrant collection contract: alias and physical-name configuration, one shared native BM25 document factory, the approved 768D dense plus IDF sparse configuration, eleven complete payload indexes, and exact strict-mode protections. The Qdrant JavaScript client is pinned at `1.18.0` in both package metadata and the lockfile.

# Scope / Routing

Work stayed inside the Q1 schema/configuration write zone and the required artifact. The assigned backend persona and architecture guidance kept the modules pure and statically checked against the pinned Qdrant client's `CreateCollection` and `CreateFieldIndex` schemas. The example test imports in the brief used `../../../src`, which resolves to `tests/src`; the test uses the mechanically correct `../../../../src` path.

# Verification

TDD evidence is preserved above: after supplying only the required local Supabase placeholders, RED failed on the missing `collection-schema` module; after the minimal implementation, GREEN passed all four schema tests. The package type-check then passed, and the complete lockfile text diff contains only the exact dependency specifier change.

# Delivery / Cleanup

Commit `91ecd115` was pushed to `origin/codex/qdrant-q1-schema`, independently reviewed, and integrated into `codex/self-hosted-qdrant-platform` with a no-ff merge. Fresh focused tests and package type-check passed on the integrated branch. The dedicated local worktree and local task branch were removed; the remote evidence branch remains available.

# Risks / Follow-ups / Explicit Defers

No implementation defer or residual Q1 concern. Q2 must replace the duplicated legacy constants in `create-collection.ts` with these exports; that dependent task is already tracked as `mc2-jz6y0.3` and was intentionally outside this write zone.
