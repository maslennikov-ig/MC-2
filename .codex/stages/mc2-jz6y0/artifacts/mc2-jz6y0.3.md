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
  - packages/course-gen-platform/src/shared/qdrant/lifecycle.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/lifecycle-course-cleanup.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.3.md
success_criteria:
  - Fresh creation uses the required collection, index, verification, and alias order.
  - Existing correct state is idempotent; legacy and wrong-target alias conflicts are refused.
  - Dense, sparse, payload-index, and strict-mode drift is reported without mutation.
  - Legacy deletion requires the explicit gate and occurs only after the replacement verifies.
  - Bootstrap and verify CLIs are import-safe and expose the required flags and package scripts.
  - Course cleanup resolves the stable alias and preserves the isolated course filter.
  - Unexpected schema members, alias-update refusal, and incompatible/unavailable server versions block successful bootstrap.
selected_docs:
  - docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md
  - docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md
  - .superpowers/sdd/task-2-brief.md
  - .superpowers/sdd/task-2-review.md
  - .codex/stages/mc2-jz6y0/artifacts/authoritative-docs.md
  - pinned @qdrant/js-client-rest 1.18.0 generated client and OpenAPI types
selected_skills:
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
  - senior-architect
  - code-review
  - superpowers:receiving-code-review
  - superpowers:systematic-debugging
selected_agents:
  - backend_developer
catalog_candidates:
  - none - assigned skills and backend persona cover the bounded Q2 stream
parallel_group: S2-collection-manager-Q2
depends_on_streams:
  - mc2-jz6y0.2
parallel_decision: parallel
status: merged
delivery_method: merge
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Dedicated local worktree and local branch were removed after integration; the pushed remote evidence branch is retained.
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
  - SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant/lifecycle-course-cleanup.test.ts (review RED): failed with false cleanup success and approximateCount 0 when only the physical target was listed
  - SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant/collection-manager.test.ts (exact-schema RED): failed four tests because unexpected dense, sparse, payload-index, and active strict fields produced ok true
  - SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant/collection-manager.test.ts (alias-result RED): failed because updateCollectionAliases false still produced ok true
  - SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant/collection-manager.test.ts (compatibility RED): failed fresh-order, incompatible-version, and unavailable-version tests because versionInfo was not awaited
  - SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/shared/qdrant/create-collection.test.ts tests/unit/shared/qdrant/collection-manager.test.ts tests/unit/shared/qdrant/lifecycle-course-cleanup.test.ts tests/unit/shared/qdrant/lifecycle-refcount.test.ts: passed, 26 tests
  - NODE_OPTIONS=--max-old-space-size=8192 pnpm exec eslint packages/course-gen-platform/src/shared/qdrant/collection-manager.ts packages/course-gen-platform/src/shared/qdrant/lifecycle.ts packages/course-gen-platform/tests/unit/shared/qdrant/collection-manager.test.ts packages/course-gen-platform/tests/unit/shared/qdrant/lifecycle-course-cleanup.test.ts: passed with zero errors and zero warnings
  - TMPDIR=/tmp pnpm --filter @megacampus/course-gen-platform qdrant:bootstrap -- --help: passed, exit 0 with all required flags
  - TMPDIR=/tmp QDRANT_URL=http://127.0.0.1:1 QDRANT_API_KEY=ci-placeholder pnpm --filter @megacampus/course-gen-platform qdrant:verify -- --physical course_embeddings_v1 --alias course_embeddings: failed safely with exit 1 against a deliberately unavailable loopback port; no live service was contacted
  - git diff --check: passed
  - python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.3.md: passed
  - independent correctness re-review of 7c3702d3: passed with no Critical/Important/Minor findings; Spec Compliance PASS and Task Quality PASS
  - integrated combined Q2-Q4 suite at fb919ea6: passed, 75 tests across 12 files
  - integrated package type-check at fb919ea6: passed
  - integrated qdrant:bootstrap and qdrant:verify help/import safety at fb919ea6: passed
  - integrated legacy BM25/client-ranking scan at fb919ea6: passed, zero matches
changed_files:
  - packages/course-gen-platform/src/shared/qdrant/collection-manager.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/collection-manager.test.ts
  - packages/course-gen-platform/src/shared/qdrant/create-collection.ts
  - packages/course-gen-platform/src/shared/qdrant/index.ts
  - packages/course-gen-platform/tools/qdrant/verify-collection.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/create-collection.test.ts
  - packages/course-gen-platform/package.json
  - packages/course-gen-platform/src/shared/qdrant/lifecycle.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/lifecycle-course-cleanup.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.3.md
explicit_defers:
  - none
---

# Summary

Implemented the idempotent physical-collection bootstrap and read-only verifier around the Q1 schema contract. Fresh bootstrap now awaits the exact pinned server/client compatibility gate, creates the versioned collection, waits for every payload index, verifies the complete and exact schema, and creates the stable alias atomically. Existing drift, wrong-target aliases, legacy name conflicts, incompatible versions, and false alias-update results cannot report success. Course cleanup resolves the stable alias before counting and deleting vectors with the isolated `course_id` filter.

# Scope / Routing

Work stayed inside the Q2 brief, the review-authorized lifecycle expansion, directly affected tests, and the required artifact. The pinned client types established the response paths for `versionInfo`, collection parameters, strict mode, payload index metadata, and aliases. No catalog asset, live Qdrant endpoint, secret, staging resource, Q3+ file, or unrelated refactor was used.

The existing `COLLECTION_CONFIG` and `createCourseEmbeddingsCollection` exports remain as compatibility views because current Qdrant callers still import them and those callers are outside the Q2 write zone. Both are now derived from Q1 and delegate to the manager, so they do not define a second schema contract. After merging accepted Q3 commit `ed18f17c`, the experiment and reindex tool were checked explicitly: both consume only `COLLECTION_CONFIG.name`, which remains the Q1 stable alias, so native BM25 upload/delete/search behavior is compatible.

# Verification

The RED/GREEN evidence is recorded in frontmatter. The final focused suite covers exact fresh ordering, idempotency, wrong alias refusal, legacy refusal and gated cleanup, four schema-drift families with zero mutations, verify-only missing resources, full resolved-path import safety, required CLI flags, and unknown-option refusal.

The review-fix suite additionally covers alias-aware production course cleanup, four explicit unexpected-schema zero-mutation paths, a false alias-update response, and incompatible/unavailable pinned-version gates before mutation.

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

Exact review-fix diff, excluding this artifact:

```text
packages/course-gen-platform/src/shared/qdrant/collection-manager.ts         +103  -1
packages/course-gen-platform/src/shared/qdrant/lifecycle.ts                    +3 -12
packages/course-gen-platform/tests/unit/shared/qdrant/collection-manager.test.ts +125 -1
packages/course-gen-platform/tests/unit/shared/qdrant/lifecycle-course-cleanup.test.ts +68 -0
```

Self-review verdict: PASS after the original cleanup-order correction and all four independent-review findings. The stable alias is resolved for lifecycle deletion, schema sets and active strict restrictions are exact, false alias updates fail, and awaited pinned compatibility precedes mutations. No remaining issue or improvement was deferred, so no review Bead was created.

# Delivery / Cleanup

Accepted after review-fix commit `7c3702d3`, independent clean re-review and fresh orchestrator verification. Integrated as merge commit `fb919ea6`; the dedicated local worktree/branch were cleaned and the remote evidence branch is retained.

# Risks / Follow-ups / Explicit Defers

No hidden defer. Q2 uses mocked unit coverage plus pinned client response types; live Qdrant integration remains the already planned Q5 stream and was not executed here. That planned downstream integration is a dependency boundary, not unfinished Q2 work.
