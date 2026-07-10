---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.15
stage_id: mc2-jz6y0
agent_type: backend_developer
subagent_model: gpt-5.6
reasoning_effort: high
model_reasoning_rationale: Pinned Qdrant strict-mode schema correctness affects deterministic bootstrap, drift verification, and server-side Formula ranking safety.
repo: /home/me/code/mc2
branch: codex/qdrant-formula-index-fix
base_branch: codex/self-hosted-qdrant-platform
base_commit: ea2f15816828fc72b69e203cf27ef6a3f68317bf
worktree: /home/me/code/mc2/.worktrees/qdrant-formula-index-fix
write_zone:
  - packages/course-gen-platform/src/shared/qdrant/collection-schema.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/collection-schema.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.15.md
success_criteria:
  - Canonical PAYLOAD_INDEXES contains exactly one document_weight float index suitable for fractional weights.
  - Bootstrap and exact drift verification continue to consume the single canonical schema definition.
  - Q1 schema/manager, Q3 upload validation, and Q4 Formula request unit gates pass without runtime behavior changes.
  - Pinned Qdrant 1.18.2 Q5 runtime 9/9 remains a post-integration acceptance gate.
selected_docs:
  - docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md
  - docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md
  - .codex/stages/mc2-jz6y0/artifacts/authoritative-docs.md
  - https://qdrant.tech/documentation/manage-data/indexing/
  - https://qdrant.tech/documentation/operations/administration/#strict-mode
  - https://qdrant.tech/documentation/search/hybrid-queries/
  - Qdrant v1.18.2 OpenAPI and @qdrant/js-client-rest 1.18.0 generated types
selected_skills:
  - superpowers:test-driven-development
  - superpowers:systematic-debugging
  - superpowers:verification-before-completion
  - senior-architect
selected_agents:
  - backend/Qdrant schema correctness worker
  - separate correctness reviewer follows
catalog_candidates:
  - none - installed assets and assigned personas cover the correction
parallel_group: S5-formula-index-blocker
depends_on_streams:
  - mc2-jz6y0.2
  - mc2-jz6y0.4
  - mc2-jz6y0.5
parallel_decision: sequential correction because Q5 runtime is blocked on the canonical schema; Q7 has a non-overlapping write zone
status: accepted
delivery_method: merge
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Integrated as 449e7ab1; the dedicated clean local worktree and branch were removed after Q5 runtime acceptance, while the pushed evidence branch is retained.
risk_level: high
docs_impact: api-contract
docs_reviewed: no-change-needed
docs_review_notes: This worker is restricted to schema/test/artifact; the historical design assumption is superseded by pinned runtime evidence, while Q10 owns durable operator documentation after Q5 acceptance.
graph_reviewed: used
graph_review_notes: Read the shared GRAPH_REPORT.md and ran a focused document_weight/Qdrant schema query; refresh is deferred to the orchestrator after accepted integration because the graph is shared outside this isolated worktree and concurrent streams are active.
verification:
  - focused schema RED: failed exactly 1 of 4 tests because document_weight float was absent from PAYLOAD_INDEXES
  - focused schema GREEN: passed 4 of 4 tests
  - affected Q1/Q3/Q4 unit suite: passed 45 of 45 tests across collection-schema, collection-manager, upload-helpers, and search-operations
  - pnpm --filter @megacampus/course-gen-platform type-check: passed
  - targeted ESLint with max warnings 0: passed
  - targeted Prettier check: passed
  - git diff --check: passed
  - scripts/orchestration/validate_artifact.py: passed
  - independent correctness review of d9e01ac0: passed with no Critical/Important/Minor findings; Spec Compliance PASS and Task Quality PASS/MERGE
  - integrated affected Q1/Q3/Q4 suite at 449e7ab1: passed, 45 tests across 4 files
  - integrated package type-check at 449e7ab1: passed
  - Q5 causal Formula fixture after integration: passed 9 of 9 against qdrant/qdrant:v1.18.2 in three consecutive fresh-container runs; each cleanup passed
  - root acceptance rerun of the full pinned integration gate: passed 19 of 19, with zero collections before and after and the local verification container removed
changed_files:
  - packages/course-gen-platform/src/shared/qdrant/collection-schema.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/collection-schema.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.15.md
explicit_defers:
  - none
---

# Summary

Added the canonical `document_weight` payload index as `float`, matching fractional weights in `[0.5, 1.0]` and the pinned Qdrant 1.18.2 strict-mode numeric requirement. No Formula request, search behavior, ingestion behavior, collection-manager production code, Q5 test, or runtime configuration changed.

# Scope / Routing

The single production edit is in `PAYLOAD_INDEXES`, which collection bootstrap and exact drift verification already consume. The exact array test proves deterministic ordering, one `document_weight` entry, and the `float` type. Q7's collection-manager write zone was not touched.

Official indexing documentation and pinned client types both support `float`; the Q5 server error proves strict Formula access requires a numeric index. The original design's no-index assumption is therefore superseded by pinned runtime evidence rather than by a broader architecture change.

# Verification

TDD RED failed only on the absent `{ field_name: 'document_weight', field_schema: 'float' }` entry. GREEN passed the focused schema suite, then the affected Q1/Q3/Q4 suite passed 45 tests. Package type-check, targeted strict lint/format checks, and the diff whitespace gate also passed.

Q5 subsequently proved the unchanged Formula scenario 9/9 in three consecutive fresh Qdrant 1.18.2 containers. The root acceptance rerun also passed the complete 19-test pinned gate with clean pre/post collection state.

# Delivery / Cleanup

The reviewed branch commit `d9e01ac002ab110c4e1308c6c2bf1c8fa3101a46` is integrated as `449e7ab1` and accepted after the unchanged pinned Formula gate passed. The dedicated local worktree/branch were cleaned; the remote evidence branch is retained.

# Risks / Follow-ups / Explicit Defers

The blocking strict-mode defect is resolved and runtime-proven. Shared Graphify refresh remains owned by stage closeout after all concurrent code streams finish; Q10 remains the durable documentation owner.
