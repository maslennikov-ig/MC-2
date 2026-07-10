---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.5
stage_id: mc2-jz6y0
agent_type: backend_developer
subagent_model: gpt-5.6
reasoning_effort: high
model_reasoning_rationale: Nested Query API ranking, grouping diversity and fallback/cache semantics require exact request-shape and failure-path reasoning.
repo: /home/me/code/mc2
branch: codex/qdrant-q4-hybrid-formula
base_branch: codex/self-hosted-qdrant-platform
base_commit: ed18f17c32e4cdf722fd15cbbc448e81a039c900
worktree: /home/me/code/mc2/.worktrees/qdrant-q4-hybrid-formula
write_zone:
  - packages/course-gen-platform/src/shared/qdrant/search-operations.ts
  - packages/course-gen-platform/src/shared/qdrant/search-helpers.ts
  - packages/course-gen-platform/src/shared/qdrant/search-types.ts
  - packages/course-gen-platform/src/shared/qdrant/search.ts
  - packages/course-gen-platform/src/shared/qdrant/index.ts
  - packages/course-gen-platform/src/stages/stage5-generation/utils/qdrant-search.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/search-operations.test.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/search.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage5-generation/qdrant-search.test.ts
  - packages/course-gen-platform/tests/integration/stage5-6-rag-pipeline.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.5.md
success_criteria:
  - Native multilingual BM25 and dense prefetches are fused by Qdrant RRF with threshold only on the dense prefetch.
  - Optional Formula Query applies the approved multiplicative priority expression with a missing-weight default and no unsupported clamp.
  - Optional document grouping uses queryGroups and capped round-robin flattening while production callers remain disabled pending Q5 relevance proof.
  - Cache identity covers ranking/grouping/alias options and hybrid dense fallback is observable without client-side score mutation.
selected_docs:
  - docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md
  - docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md
  - .codex/stages/mc2-jz6y0/artifacts/authoritative-docs.md
  - https://qdrant.tech/documentation/search/hybrid-queries/
  - https://qdrant.tech/documentation/concepts/search/#grouping-api
  - Qdrant v1.18.2 OpenAPI and @qdrant/js-client-rest 1.18.0 local generated types
selected_skills:
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
  - superpowers:using-git-worktrees
  - senior-architect
  - code-review
selected_agents:
  - backend/search worker launch unavailable after repeated API 401; root orchestrator executed the isolated TDD stream
  - correctness_reviewer pending after commit
catalog_candidates:
  - none - installed skills and assigned personas cover the stream
parallel_group: S4-hybrid-formula
depends_on_streams:
  - mc2-jz6y0.2
  - mc2-jz6y0.4
parallel_decision: parallel with Q2 because collection-manager and search write zones do not overlap
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: Dedicated worktree remains until independent review and orchestrator acceptance.
risk_level: high
docs_impact: api-contract
docs_reviewed: no-change-needed
docs_review_notes: The approved design already defines native RRF, Formula, grouping and fallback behavior; Q10 owns durable operator/module documentation after pinned integration proves runtime truth.
graph_reviewed: used
graph_review_notes: Root read GRAPH_REPORT.md and used the required focused Qdrant upload/search query before this stage; graph refresh remains stage closeout after accepted durable changes.
verification:
  - validated Q4 worker prompt and dedicated worktree created from ed18f17c; three visible worker attempts failed before repo access with API 401, so the documented unavailable fallback was used locally
  - focused Q4 unit RED: 11 failed and 1 passed across search-operations.test.ts and search.test.ts on missing builders, Formula, grouping, cache identity, fallback outcome and server-score preservation
  - focused Q4 unit GREEN: passed, 12 tests across 2 files
  - Stage 5 fallback metadata propagation RED: failed because the tool result omitted fallback_used
  - combined Q4/Stage 5/6 focused GREEN: passed, 32 tests across 6 files
  - pnpm --filter @megacampus/course-gen-platform type-check: passed after the initial unused-import failure was corrected
  - final targeted typed ESLint for every changed TypeScript file: passed with zero errors and zero warnings
  - client-side RRF and priority score-mutation scan: passed, zero references after legacy removal
  - final focused Q4 and Stage 5/6 unit suite: passed, 32 tests across 6 files
  - final pnpm --filter @megacampus/course-gen-platform type-check: passed
  - final targeted Prettier check, git diff --check and artifact validation: passed
  - default integration-config attempt for stage5-6-rag-pipeline.test.ts: blocked in global setup by absent local QDRANT_URL/QDRANT_API_KEY and no server; this is the explicit Q5 pinned integration gate, not a Q4 unit failure
changed_files:
  - packages/course-gen-platform/src/shared/qdrant/search-operations.ts
  - packages/course-gen-platform/src/shared/qdrant/search-helpers.ts
  - packages/course-gen-platform/src/shared/qdrant/search-types.ts
  - packages/course-gen-platform/src/shared/qdrant/search.ts
  - packages/course-gen-platform/src/shared/qdrant/index.ts
  - packages/course-gen-platform/src/stages/stage5-generation/utils/qdrant-search.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/search-operations.test.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/search.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage5-generation/qdrant-search.test.ts
  - packages/course-gen-platform/tests/integration/stage5-6-rag-pipeline.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.5.md
explicit_defers:
  - Q5 owns pinned Qdrant 1.18.2 RU/EN/Formula/grouping integration and the production grouping activation decision.
  - Independent correctness review, commit/push evidence and cleanup remain pending before acceptance.
---

# Summary

Q4 now builds native BM25 and dense candidates as pure typed prefetches, fuses them with the Qdrant 1.18.2 RRF query, and optionally nests that RRF stage under the approved server-side Formula Query. Dense-only priority ranking also executes as a Formula Query. Missing `document_weight` defaults to `0.5`; Q3 ingestion validation is the finite `[0.5, 1.0]` guarantee because the pinned Formula grammar has no clamp/min/max.

Document grouping uses `queryGroups()` on `document_id`, preserves configured group size, and flattens groups round-robin up to the caller's total limit. The option remains disabled in all production Stage 5/6 retrieval callers until Q5's pinned RU/EN fixture proves relevance and diversity.

# Scope / Routing

The validated visible Q4 worker was launched twice and an already-authenticated visible worker was retried once; every new subagent turn failed before repo access with the same API `401 Missing authentication`. Per the explicit unavailable exception, root executed the TDD work locally in the already isolated branch/worktree. This is recorded rather than presented as delegated success. A separate correctness review remains mandatory before acceptance.

Only the search runtime, its direct Stage 5 metadata adapter, focused fixtures and this artifact changed. Q2 collection-manager files, ingestion, Compose/ops, package versions, stage summary and handoff were not touched.

# Verification

RED proved the old implementation still used `{ fusion: 'rrf' }`, lacked Formula/grouping/builders/fallback metadata, mutated priority scores client-side and omitted ranking/grouping fields from cache identity. GREEN covers exact native prefetch placement, RRF nesting, Formula arithmetic/defaults, dense Formula, grouped request shape, round-robin limit, fallback outcome, cache uniqueness/non-mutation and server-score preservation. Direct Stage 5/6 regressions pass while production grouping remains off.

The legacy client-side RRF function/helper and client-side priority mapping/sort were removed because they have no production callers and conflict with the native-only contract. The attempted generic integration configuration stopped before test collection because its global setup requires a live Qdrant and secrets; Q5 provides the pinned local service and blocking runtime fixture.

# Delivery / Cleanup

Returned in the dedicated Q4 worktree for final fresh gates, commit/push and independent correctness review. It is not accepted or integrated yet.

# Risks / Follow-ups / Explicit Defers

Unit/client-type evidence cannot prove Qdrant runtime ranking. Q5 must execute the exact nested request against pinned Qdrant `1.18.2`, verify RU/EN relevance, priority ordering, grouping diversity and strict behavior, then explicitly enable or defer production grouping without weakening the fixture.
