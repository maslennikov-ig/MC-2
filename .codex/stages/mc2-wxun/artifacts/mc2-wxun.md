---
schema_version: orchestration-artifact/v3
artifact_type: root-stream
stage_manifest: .codex/stages/mc2-wxun/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: Stage 6 two-tier lesson retrieval
public_facade: RAG_SHADOW_RETRIEVAL_RATE and tier1_shadow trace
bounded_acceptance: make exit score and false-positive measurement possible without enabling a live experiment
non_goals:
  - enabling a non-zero production cohort
  - collecting production data or calculating percentiles
  - changing TIER1_SCORE_THRESHOLD
  - feeding shadow chunks into generation
evidence:
  - red-to-green-shadow-integration-regression
task_id: mc2-wxun
epic_id: n/a
stage_id: mc2-wxun
session_id: mc2-wxun
milestone: tier1-shadow-retrieval-observability
milestone_status: accepted
agent_type: root
subagent_model: n/a
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: score calibration and false-positive observation share one Stage 6 query, trace, safety, and acceptance boundary
repo: mc2
branch: develop
base_branch: develop
base_commit: 339cc6e00
worktree: /home/me/code/mc2
write_zone:
  - packages/course-gen-platform/.env.example
  - packages/course-gen-platform/src/stages/stage6-lesson-content/README.md
  - packages/course-gen-platform/src/stages/stage6-lesson-content/rag/retriever.ts
  - packages/course-gen-platform/src/stages/stage6-lesson-content/rag/shadow-retrieval.ts
  - packages/course-gen-platform/tests/unit/stages/stage6/rag/two-tier-retrieval.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage6/rag/shadow-retrieval.test.ts
  - .beads/interactions.jsonl
  - .codex/goals/mc2-wxun
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-wxun
success_criteria:
  - absent and invalid rates run no shadow queries
  - a stable selected exit records raw dense and exact hybrid observations without content
  - every shadow query preserves tenant and accepted-evidence scope
  - shadow work and failures never change the active empty result
  - focused checks, type-check, and build pass
selected_docs:
  - specs/026-post-triage-priorities/spec.md
  - docs/plans/dapper-jumping-plum.md
  - packages/course-gen-platform/src/stages/stage6-lesson-content/README.md
selected_skills:
  - orchestrator-stage
  - task-router
  - technical-premortem
  - superpowers:systematic-debugging
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: n/a
depends_on_streams:
  - none
parallel_decision: local-root-owner
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: no child worktree, live cohort, paid call, temporary service, or production query was created
risk_level: medium
risk_tags:
  - retrieval
  - observability
  - tenant-isolation
affected_surfaces:
  - backend
  - operations
invariants:
  - tenant-isolation
  - state-transition
  - test-matrix
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: the backend environment example and Stage 6 README define the disabled-default operator and trace contracts
verification:
  - red focused regression: failed because the enabled test cohort made two active queries instead of six total and emitted no tier1_shadow trace
  - complete Stage 6 RAG unit set: passed, 5 files and 56 tests
  - focused Prettier: passed for supported files; .env.example has no configured Prettier parser and passed git diff --check
  - focused ESLint: passed with 7 pre-existing warnings and no errors
  - pnpm type-check: passed
  - pnpm build: passed with the pre-existing DEP0169 warning
  - graphify update and cluster-only: passed, 61489 nodes and 7333 communities
changed_files:
  - packages/course-gen-platform/.env.example
  - packages/course-gen-platform/src/stages/stage6-lesson-content/README.md
  - packages/course-gen-platform/src/stages/stage6-lesson-content/rag/retriever.ts
  - packages/course-gen-platform/src/stages/stage6-lesson-content/rag/shadow-retrieval.ts
  - packages/course-gen-platform/tests/unit/stages/stage6/rag/two-tier-retrieval.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage6/rag/shadow-retrieval.test.ts
  - .beads/interactions.jsonl
  - .codex/goals/mc2-wxun/scope-criterion-snapshot.json
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-wxun
explicit_defers:
  - mc2-wxun - live cohort and production false-positive measurement require separate authorization and capacity observation
  - mc2-vjbb - percentile analysis, staging validation, and threshold decision require complete production data
---

# Summary

Tier 1 exits can now be measured without moving the Qdrant threshold or changing active retrieval.
A zero-default stable cohort emits one content-free trace with the raw dense score relevant to the
gate and the exact hybrid result count from the queries the exit saved.

# Verification

The regression first proved the shadow path was absent. The final suite covers fail-closed rate
parsing, stable selection, exact dense/hybrid modes, tenant and accepted-evidence filters,
content-free traces, completeness classification, and non-influential failures.

# Delivery / Cleanup

Accepted in the primary `develop` worktree. The production rate remains zero and no live query was
executed.

# Risks / Follow-ups / Explicit Defers

`mc2-wxun` and `mc2-vjbb` remain blocked at their live experiment boundary. Only complete shadow
runs may enter false-positive or percentile analysis; any threshold change remains an owner
decision after the staging window.
