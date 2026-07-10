---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.4
stage_id: mc2-jz6y0
agent_type: backend_developer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Multilingual native retrieval and payload-weight validation require exact persistence and failure-path reasoning.
repo: /home/me/code/mc2
branch: codex/qdrant-q3-native-ingestion
base_branch: codex/self-hosted-qdrant-platform
base_commit: cb6b2562487db71b1b08dfe2d0a8e2a64f24edee
worktree: /home/me/code/mc2/.worktrees/qdrant-q3-native-ingestion
write_zone:
  - eslint.config.mjs
  - packages/course-gen-platform/src/shared/embeddings/bm25.ts
  - packages/course-gen-platform/src/shared/qdrant/upload-helpers.ts
  - packages/course-gen-platform/src/shared/qdrant/upload-types.ts
  - packages/course-gen-platform/src/shared/qdrant/upload.ts
  - packages/course-gen-platform/src/shared/qdrant/search-operations.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/upload-helpers.test.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/search-operations.test.ts
  - packages/course-gen-platform/experiments/features/test-hybrid-search.ts
  - packages/course-gen-platform/tools/db/reindex-course-with-sparse.ts
  - packages/course-gen-platform/tsconfig.eslint.json
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.4.md
success_criteria:
  - Complete compacted enriched payloads persist priority metadata and native BM25 documents without process-local corpus state.
  - Present document_weight values are finite numbers in the inclusive range 0.5 to 1.0 or are rejected before upsert.
  - Upload, Stage 2, lifecycle and native-query regressions pass with no custom BM25 runtime references.
selected_docs:
  - docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md
  - docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md
  - .superpowers/sdd/task-3-brief.md
  - .codex/stages/mc2-jz6y0/artifacts/authoritative-docs.md
  - https://qdrant.tech/documentation/search/text-search/full-text-search/
  - https://qdrant.tech/documentation/manage-data/indexing/#idf-modifier
selected_skills:
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
  - superpowers:executing-plans
  - superpowers:using-git-worktrees
  - senior-architect
selected_agents:
  - backend_developer
catalog_candidates:
  - none - installed skills and the assigned backend persona covered the bounded task
parallel_group: q3-ingestion
depends_on_streams:
  - mc2-jz6y0.2
parallel_decision: parallel
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: Branch is pushed for orchestrator review; acceptance, integration and safe worktree cleanup remain pending.
risk_level: high
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: The approved design already documents native BM25 ingestion and complete priority payloads; durable operator/module documentation remains the tracked Q10 scope.
graph_reviewed: used
graph_review_notes: Read the shared GRAPH_REPORT and ran a focused Qdrant upload/search query. The graph is absent from this isolated worktree, so refresh remains stage-closeout work after integration.
verification:
  - pnpm --filter @megacampus/course-gen-platform type-check (baseline): passed
  - SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage2-document-processing/phase-6-qdrant-upload.test.ts tests/unit/shared/qdrant/lifecycle.test.ts tests/unit/shared/qdrant/lifecycle-refcount.test.ts (baseline): passed, 7 tests
  - SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant/upload-helpers.test.ts (RED): failed as expected on numeric sparse vectors and unvalidated weights
  - SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant/search-operations.test.ts (RED): failed as expected on custom numeric sparse requests
  - legacy experiment static gate (RED): failed as expected on BM25Scorer and process-local corpus-statistics claims
  - SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant/upload-helpers.test.ts tests/unit/shared/qdrant/search-operations.test.ts (GREEN): passed, 10 tests
  - legacy experiment static gate (GREEN): passed; createBm25Document contract present and custom scorer/corpus claims absent
  - NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @megacampus/course-gen-platform exec eslint experiments/features/test-hybrid-search.ts --max-warnings=1000 (RED): failed because no typed ESLint project included tracked experiments
  - targeted ESLint after project inclusion (RED): failed on require-await and no-floating-promises in the newly covered experiment
  - NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @megacampus/course-gen-platform exec eslint experiments/features/test-hybrid-search.ts --max-warnings=1000 (GREEN): passed after the synchronous contract check and explicit top-level void launch
  - NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @megacampus/course-gen-platform exec eslint tools/verify/verify-structure.ts --max-warnings=1000 (RED): failed because no typed ESLint project included tracked tools
  - NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @megacampus/course-gen-platform exec eslint experiments/features/test-hybrid-search.ts tools/verify/verify-structure.ts --max-warnings=1000 (GREEN): passed after experiments and tools were included in the typed relaxed profile
  - targeted ESLint for tools/db/reindex-course-with-sparse.ts (RED): failed on the newly enforced no-floating-promises rule at the top-level main call
  - NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @megacampus/course-gen-platform exec eslint experiments/features/test-hybrid-search.ts tools/db/reindex-course-with-sparse.ts tools/verify/verify-structure.ts --max-warnings=1000 (GREEN): passed with zero errors and two pre-existing unused-variable warnings in the reindex tool
  - SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant/upload-helpers.test.ts tests/unit/shared/qdrant/search-operations.test.ts tests/unit/stages/stage2-document-processing/phase-6-qdrant-upload.test.ts tests/unit/shared/qdrant/lifecycle.test.ts tests/unit/shared/qdrant/lifecycle-refcount.test.ts: passed, 17 tests
  - pnpm --filter @megacampus/course-gen-platform type-check: passed
  - rg custom BM25 runtime references under packages/course-gen-platform/src: passed, zero matches
  - targeted Prettier check for all changed TypeScript files: passed
  - git diff --check: passed
  - python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.4.md: passed
changed_files:
  - eslint.config.mjs
  - packages/course-gen-platform/experiments/features/test-hybrid-search.ts
  - packages/course-gen-platform/src/shared/embeddings/bm25.ts
  - packages/course-gen-platform/src/shared/qdrant/search-operations.ts
  - packages/course-gen-platform/src/shared/qdrant/upload-helpers.ts
  - packages/course-gen-platform/src/shared/qdrant/upload-types.ts
  - packages/course-gen-platform/src/shared/qdrant/upload.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/search-operations.test.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/upload-helpers.test.ts
  - packages/course-gen-platform/tools/db/reindex-course-with-sparse.ts
  - packages/course-gen-platform/tsconfig.eslint.json
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.4.md
explicit_defers:
  - mc2-jz6y0.5 owns Formula Query, grouping, cache correctness and removal of client-side score mutation.
  - mc2-jz6y0.6 owns pinned-server RU/EN native BM25 integration coverage; no live Qdrant experiment was run in Q3.
---

# Summary

Q3 now writes the complete `toQdrantPayload()` result after removing only top-level null/undefined values, validates every present `document_weight` before storage, and sends the shared Qdrant-native BM25 `Document` at ingestion and in the two existing sparse query paths. The custom process-local scorer, corpus accumulator and runtime module are removed.

# Scope / Routing

The implementation stayed within the assigned backend write zone. The original Task 3 file map omitted that deleting `bm25.ts` also required removing two imports from `search-operations.ts`; the parent explicitly clarified that the narrow native-document request conversion and a minimal regression test belong to Q3 while Formula/grouping/cache remain Q4. During review, the parent also extended the write zone to the actively referenced hybrid-search experiment so removal of `bm25.ts` would not strand a broken operator command. That cleanup now validates the production native document contract and no longer claims process-local corpus statistics. When the normal pre-commit hook proved tracked experiments and tools were absent from every typed ESLint project, the parent authorized the minimal `tsconfig.eslint.json` includes and relaxed ESLint file patterns; the hook is not bypassed.

# Verification

Strict RED→GREEN evidence is recorded in frontmatter. The invalid-weight table covers `NaN`, both infinities, below-minimum, above-maximum and nonnumeric runtime input. The final focused suite covers conversion, native query shapes, Stage 2 failure handling and lifecycle behavior. The pinned Qdrant client accepts `Document` values without the previous unsafe upsert cast.

# Delivery / Cleanup

Returned for orchestrator review on `codex/qdrant-q3-native-ingestion`. Acceptance and cleanup are intentionally pending; this artifact must be updated by the orchestrator after content review and integration.

# Risks / Follow-ups / Explicit Defers

No Q3 implementation debt is hidden. Formula ranking, grouping, cache keys and score-mutation removal remain Q4 by explicit scope boundary. Runtime multilingual ranking against Qdrant 1.18.2 remains the blocking Q5 integration proof. The legacy live experiment was not executed because live-service mutation was forbidden.
