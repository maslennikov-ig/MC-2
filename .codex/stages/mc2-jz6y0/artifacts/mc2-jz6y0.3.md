---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.3
stage_id: mc2-jz6y0
agent_type: backend_developer
subagent_model: gpt-5.6
reasoning_effort: high
model_reasoning_rationale: Alias conflicts, destructive legacy cleanup, and exact schema-drift checks require high-confidence ordering and failure-path reasoning.
repo: /home/me/code/mc2
branch: codex/qdrant-q2-collection-manager
base_branch: codex/self-hosted-qdrant-platform
base_commit: cb6b2562487db71b1b08dfe2d0a8e2a64f24edee
worktree: /home/me/code/mc2/.worktrees/qdrant-q2-collection-manager
write_zone:
  - packages/course-gen-platform/src/shared/qdrant/collection-manager.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/collection-manager.test.ts
  - packages/course-gen-platform/src/shared/qdrant/create-collection.ts
  - packages/course-gen-platform/src/shared/qdrant/index.ts
  - packages/course-gen-platform/tools/qdrant/verify-collection.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/create-collection.test.ts
  - packages/course-gen-platform/package.json
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.3.md
success_criteria:
  - Fresh creation uses the required collection, index, verification, and alias order.
  - Existing correct state is idempotent; legacy and wrong-target alias conflicts are refused.
  - Dense, sparse, payload-index, and strict-mode drift is reported without mutation.
  - Legacy deletion requires the explicit gate and occurs only after the replacement verifies.
  - Bootstrap and verify CLIs are import-safe and expose the required flags and package scripts.
selected_docs:
  - docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md
  - docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md
  - .superpowers/sdd/task-2-brief.md
  - .codex/stages/mc2-jz6y0/artifacts/authoritative-docs.md
  - pinned @qdrant/js-client-rest 1.18.0 generated client and OpenAPI types
selected_skills:
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
  - senior-architect
  - code-review
selected_agents:
  - backend_developer
catalog_candidates:
  - none - assigned skills and backend persona cover the bounded Q2 stream
parallel_group: S2-collection-manager-Q2
depends_on_streams:
  - mc2-jz6y0.2
parallel_decision: parallel
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: awaiting orchestrator acceptance
risk_level: medium
docs_impact: api-contract
docs_reviewed: no-change-needed
docs_review_notes: The approved design already specifies the physical/alias lifecycle and drift policy; Q10 owns operator documentation, while both new CLIs provide built-in help.
graph_reviewed: blocked
graph_review_notes: graphify-out/GRAPH_REPORT.md is absent from this isolated Q2 worktree; architecture was bounded by the approved design, Q1 contract, and pinned client types, and graph refresh belongs to stage closeout.
verification:
  - SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant/collection-manager.test.ts (initial RED): failed as expected because collection-manager.ts was missing
  - SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant/collection-manager.test.ts (initial GREEN): passed, 10 tests
  - SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant/create-collection.test.ts (CLI parser RED): failed as expected because parseCollectionCliArgs was absent
  - SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant/create-collection.test.ts (pnpm separator RED): failed as expected on unknown option --
  - SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant/collection-manager.test.ts (safe cleanup-order RED): failed as expected because legacy deletion preceded replacement verification
  - SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant/create-collection.test.ts tests/unit/shared/qdrant/collection-manager.test.ts: passed, 14 tests
  - pnpm --filter @megacampus/course-gen-platform type-check: passed
  - pnpm --filter @megacampus/course-gen-platform lint: passed with the existing 95-warning budget and zero errors
  - git merge --no-edit origin/codex/self-hosted-qdrant-platform: passed as a clean fast-forward to ed18f17c, bringing the accepted Q3 typed tools/experiments ESLint coverage
  - NODE_OPTIONS=--max-old-space-size=8192 pnpm exec eslint <Q2 TypeScript files> packages/course-gen-platform/experiments/features/test-hybrid-search.ts packages/course-gen-platform/tools/db/reindex-course-with-sparse.ts: passed with zero errors; 27 warnings are confined to the accepted Q3 callers
  - NODE_OPTIONS=--max-old-space-size=8192 git commit: passed the repository lint-staged hook without bypass; ESLint and Prettier completed for all eight staged files
  - TMPDIR=/tmp pnpm --filter @megacampus/course-gen-platform qdrant:bootstrap -- --help: passed, exit 0 with all required flags
  - TMPDIR=/tmp QDRANT_URL=http://127.0.0.1:1 QDRANT_API_KEY=ci-placeholder pnpm --filter @megacampus/course-gen-platform qdrant:verify -- --physical course_embeddings_v1 --alias course_embeddings: failed safely with exit 1 against a deliberately unavailable loopback port; no live service was contacted
  - git diff --check: passed
  - python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.3.md: passed
changed_files:
  - packages/course-gen-platform/src/shared/qdrant/collection-manager.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/collection-manager.test.ts
  - packages/course-gen-platform/src/shared/qdrant/create-collection.ts
  - packages/course-gen-platform/src/shared/qdrant/index.ts
  - packages/course-gen-platform/tools/qdrant/verify-collection.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/create-collection.test.ts
  - packages/course-gen-platform/package.json
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.3.md
explicit_defers:
  - none
---

# Summary

Implemented the idempotent physical-collection bootstrap and read-only verifier around the Q1 schema contract. Fresh bootstrap creates the versioned collection, waits for every payload index, verifies the complete schema, and creates the stable alias atomically. Existing drift, wrong-target aliases, and legacy name conflicts are returned as explicit mismatches without mutation. The explicit legacy-drop path logs the exact name and point count and deletes only after the replacement collection has passed read-back verification.

# Scope / Routing

Work stayed inside the Q2 brief and its required artifact. The pinned client types established the response paths for collection parameters, strict mode, payload index metadata, and aliases. No catalog asset, live Qdrant endpoint, secret, staging resource, Q3+ file, or unrelated refactor was used.

The existing `COLLECTION_CONFIG` and `createCourseEmbeddingsCollection` exports remain as compatibility views because current Qdrant callers still import them and those callers are outside the Q2 write zone. Both are now derived from Q1 and delegate to the manager, so they do not define a second schema contract. After merging accepted Q3 commit `ed18f17c`, the experiment and reindex tool were checked explicitly: both consume only `COLLECTION_CONFIG.name`, which remains the Q1 stable alias, so native BM25 upload/delete/search behavior is compatible.

# Verification

The RED/GREEN evidence is recorded in frontmatter. The final focused suite covers exact fresh ordering, idempotency, wrong alias refusal, legacy refusal and gated cleanup, four schema-drift families with zero mutations, verify-only missing resources, full resolved-path import safety, required CLI flags, and unknown-option refusal.

Exact committed implementation diff, excluding this artifact:

```text
packages/course-gen-platform/package.json                                      +2   -0
packages/course-gen-platform/src/shared/qdrant/collection-manager.ts         +315  -0
packages/course-gen-platform/src/shared/qdrant/create-collection.ts          +130  -308
packages/course-gen-platform/src/shared/qdrant/index.ts                        +7   -4
packages/course-gen-platform/tests/unit/shared/qdrant/collection-manager.test.ts +260 -0
packages/course-gen-platform/tests/unit/shared/qdrant/create-collection.test.ts   +29 -0
packages/course-gen-platform/tools/qdrant/verify-collection.ts                +32  -0
```

Self-review verdict: PASS after one findings-first correction. The initial allow-drop order could remove legacy data before the replacement had verified; the final code and regression assertion require replacement verification first. No remaining issue or improvement was deferred, so no review Bead was created.

# Delivery / Cleanup

The branch is returned for orchestrator review and is not yet accepted. Commit and push evidence are reported with the completion event. Workspace cleanup remains pending until the orchestrator accepts or rejects the stream.

# Risks / Follow-ups / Explicit Defers

No hidden defer. Q2 uses mocked unit coverage plus pinned client response types; live Qdrant integration remains the already planned Q5 stream and was not executed here. That planned downstream integration is a dependency boundary, not unfinished Q2 work.
