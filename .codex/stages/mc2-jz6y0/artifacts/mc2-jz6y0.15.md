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
status: merged
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: Integrated as 449e7ab1 for the blocking Q5 pinned runtime rerun; dedicated worktree/branch remain until 9/9 acceptance.
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
changed_files:
  - packages/course-gen-platform/src/shared/qdrant/collection-schema.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/collection-schema.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.15.md
explicit_defers:
  - mc2-jz6y0.6 must rerun the exact pinned Qdrant 1.18.2 Formula test after integration and prove 9/9; current runtime evidence remains 8/9 with HTTP 400 for the missing document_weight numeric index.
  - Orchestrator acceptance, Beads closure and safe worktree cleanup remain pending on Q5 pinned runtime 9/9.
---

# Summary

Added the canonical `document_weight` payload index as `float`, matching fractional weights in `[0.5, 1.0]` and the pinned Qdrant 1.18.2 strict-mode numeric requirement. No Formula request, search behavior, ingestion behavior, collection-manager production code, Q5 test, or runtime configuration changed.

# Scope / Routing

The single production edit is in `PAYLOAD_INDEXES`, which collection bootstrap and exact drift verification already consume. The exact array test proves deterministic ordering, one `document_weight` entry, and the `float` type. Q7's collection-manager write zone was not touched.

Official indexing documentation and pinned client types both support `float`; the Q5 server error proves strict Formula access requires a numeric index. The original design's no-index assumption is therefore superseded by pinned runtime evidence rather than by a broader architecture change.

# Verification

TDD RED failed only on the absent `{ field_name: 'document_weight', field_schema: 'float' }` entry. GREEN passed the focused schema suite, then the affected Q1/Q3/Q4 suite passed 45 tests. Package type-check, targeted strict lint/format checks, and the diff whitespace gate also passed.

These checks do not prove pinned runtime success. The exact Q5 Formula scenario must be rerun after integration.

# Delivery / Cleanup

The reviewed branch commit `d9e01ac002ab110c4e1308c6c2bf1c8fa3101a46` is integrated as `449e7ab1` so Q5 can rerun its unchanged pinned Formula gate. Unit/type acceptance is green, but this correction is not yet accepted or closed: the dedicated worktree remains until Q5 proves 9/9 and the remote evidence branch is retained.

# Risks / Follow-ups / Explicit Defers

Q5 remains the blocking runtime acceptance owner. Its prior run is still RED at 8/9 with the exact strict-mode HTTP 400 requiring a `document_weight` index of type `float` or `integer`; no claim of Q5 runtime GREEN is made here. After integration, Q5 must rerun unchanged against pinned Qdrant 1.18.2 and reach 9/9 before this Bead can close.

The orchestrator must independently review the diff, decide acceptance, refresh the shared Graphify graph after accepted integration, and perform safe cleanup. Q10 remains the durable documentation owner after runtime truth is established.
