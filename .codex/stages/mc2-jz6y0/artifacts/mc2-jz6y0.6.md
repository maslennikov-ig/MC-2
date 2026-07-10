---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.6
stage_id: mc2-jz6y0
agent_type: integration_test_engineer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Pinned multilingual retrieval, strict-mode Formula ranking, grouping diversity, isolation, snapshots, CI blocking behavior, and failure cleanup require runtime correctness reasoning.
repo: /home/me/code/mc2
branch: codex/qdrant-q5-pinned-integration
base_branch: codex/self-hosted-qdrant-platform
base_commit: 5e9ca7589abd1130e5be0448a0a822031e067121
worktree: /home/me/code/mc2/.worktrees/qdrant-q5-pinned-integration
write_zone:
  - .github/workflows/ci-cd.yml
  - packages/course-gen-platform/tests/integration/qdrant.test.ts
  - packages/course-gen-platform/tests/integration/ci-qdrant-smoke.test.ts
  - packages/course-gen-platform/tests/unit/ci/qdrant-workflow.test.ts
  - packages/course-gen-platform/tests/unit/vitest-config.test.ts
  - packages/course-gen-platform/vitest.config.ts
  - packages/course-gen-platform/vitest.config.integration-ci.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.6.md
success_criteria:
  - Configured Qdrant suites execute and configured-but-unreachable Qdrant fails instead of silently skipping.
  - Pinned Qdrant 1.18.2 proves physical and alias bootstrap, full priority payload, RU/EN native BM25, dense plus sparse RRF, causal RRF to Formula ordering, max-two grouping diversity, isolation, strict rejection, snapshots, and cleanup.
  - Every CI Qdrant service uses qdrant/qdrant:v1.18.2 with local test URL/key and the integration gate is blocking.
  - Intended CI and broad suites pass against an isolated local pinned container and leave no fixture collections, aliases, snapshots, or containers.
selected_docs:
  - docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md
  - docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md Task 5
  - .codex/stages/mc2-jz6y0/artifacts/authoritative-docs.md
  - https://raw.githubusercontent.com/qdrant/qdrant/v1.18.2/docs/redoc/v1.18.x/openapi.json
  - https://qdrant.tech/documentation/search/text-search/full-text-search/
  - https://qdrant.tech/documentation/search/hybrid-queries/
  - https://qdrant.tech/documentation/concepts/search/#grouping-api
  - https://qdrant.tech/documentation/operations/administration/#strict-mode
  - https://qdrant.tech/documentation/snapshots/
  - local @qdrant/js-client-rest 1.18.0 generated types
selected_skills:
  - superpowers:test-driven-development
  - superpowers:verification-before-completion
  - superpowers:using-git-worktrees
  - superpowers:systematic-debugging
  - senior-architect
  - senior-devops
selected_agents:
  - integration_test_engineer/search correctness worker
  - separate correctness reviewer follows; this artifact is returned evidence, not acceptance
catalog_candidates:
  - none - installed assets and the assigned persona cover the stream
parallel_group: Q5-pinned-integration
depends_on_streams:
  - mc2-jz6y0.3
  - mc2-jz6y0.4
  - mc2-jz6y0.5
  - mc2-jz6y0.15
parallel_decision: parallel with Q7 because the assigned write zones are disjoint
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: Every Q5 Docker container and fixture resource was removed; the dedicated branch/worktree remains intentionally available for independent review and integration.
risk_level: high
docs_impact: ci-contract
docs_reviewed: no-change-needed
docs_review_notes: The workflow is the executable CI contract; Q10 owns durable self-hosted Qdrant/operator documentation and should mention this blocking pinned gate wherever CI topology is documented.
graph_reviewed: blocked
graph_review_notes: Read the shared GRAPH_REPORT.md and used a focused Qdrant query; refresh is unsafe from this isolated worktree because graphify-out exists only in the concurrent primary checkout, so the stage orchestrator owns the closeout refresh.
verification:
  - RED static scan found mutable async skip decisions, two qdrant latest images, contract Cloud Qdrant secrets, and integration continue-on-error.
  - Initial pinned CI baseline passed only 1 Qdrant smoke assertion; the broad default-config command stopped in unrelated BullMQ global setup before discovery because the processor build prerequisite was absent.
  - First expanded pinned fixture passed 8 of 9 tests and exposed strict-mode HTTP 400 requiring a numeric document_weight index; no production code was changed in Q5.
  - Integrated reviewed dependency correction 5e9ca758 and reran the same Formula assertion; the HTTP 400 was eliminated.
  - Causal Formula fixture stability: three fresh qdrant/qdrant:v1.18.2 containers each passed 9 of 9 tests, proving opposing dense/BM25 source ranks, equal unboosted RRF scores, CORE x1.2 Formula score, unchanged SUPPLEMENTARY score, and cleanup 3 of 3.
  - Independent correctness review returned FIX: the integration job was outside the blocking CI-success/deploy DAG, the exact broad command still invoked unrelated global setup, broad upload used one batch, and persisted payload checks were partial.
  - Review-fix RED evidence: workflow/argv unit suite initially failed 12 of 14 assertions; broad Qdrant ran 5 of 6 tests with batch_count 1 instead of the required 2.
  - Review-fix GREEN evidence: 17 of 17 workflow/argv tests pass, including normal setup retention and rejection of option values or extra selectors as the exact test selection.
  - Workflow YAML/static scan: 16 jobs parse, dependency graph is acyclic, integration needs setup, CI-success needs integration, deploy and deploy-dev need CI-success, two services are pinned to qdrant/qdrant:v1.18.2, and no integration continue-on-error is present.
  - QDRANT_URL=http://127.0.0.1:16333 QDRANT_API_KEY=test-qdrant-key pnpm --filter @megacampus/course-gen-platform test:integration:ci: passed 19 of 19 tests across 3 files; pre/post collection lists empty and container removed.
  - Exact plan command with only pinned Qdrant and all Supabase/Redis variables unset: passed 6 of 6 tests with setup 0ms and no BullMQ/Redis global-setup markers; pre/post collection lists empty, proving no default collection was created, and the container was removed.
  - Configured unreachable exact suite: exited 1 from beforeAll getCollections in about 10 seconds with zero global-setup markers rather than reporting a successful skipped suite.
  - Broad production-adapter coverage now proves a two-batch upload, exact compacted persisted payload, and an exact zero-write result for an empty upload.
  - pnpm --filter @megacampus/course-gen-platform type-check: passed.
  - pnpm type-check: passed across all workspace projects.
  - pnpm build: course-gen-platform and shared packages passed; the aggregate stopped only when web Next.js env validation found missing SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, and NEXT_PUBLIC_SUPABASE_ANON_KEY in the local shell.
  - Targeted ESLint and Prettier checks: passed.
  - Workflow static pins/local-env/blocking scans, YAML parse, and git diff --check: passed.
  - Post-fix pre-commit self-review of the seven-file review-fix diff: no new correctness, security, cleanup, or CI-DAG findings; independent orchestration re-review is still required for acceptance.
changed_files:
  - .github/workflows/ci-cd.yml
  - packages/course-gen-platform/tests/integration/ci-qdrant-smoke.test.ts
  - packages/course-gen-platform/tests/integration/qdrant.test.ts
  - packages/course-gen-platform/tests/unit/ci/qdrant-workflow.test.ts
  - packages/course-gen-platform/tests/unit/vitest-config.test.ts
  - packages/course-gen-platform/vitest.config.ts
  - packages/course-gen-platform/vitest.config.integration-ci.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.6.md
explicit_defers:
  - Q10 owns durable operator/developer documentation; mention the local pinned blocking CI gate if its final CI topology section enumerates service gates.
  - Production Stage 5/6 group_by_document activation is outside the Q5 test/workflow write zone; the orchestrator must route the already-recorded Q4 defer now that the pinned grouping/diversity gate passes.
---

# Summary

Q5 replaces the one-operation smoke and mutable async skip pattern with a deterministic, blocking Qdrant 1.18.2 runtime contract. The fixture creates a unique physical collection and alias through the production manager, uploads twelve RU/EN chunks through the production adapter, and verifies complete payloads, multilingual native BM25, native dense plus sparse RRF, causal RRF then Formula ranking, document grouping/diversity, tenant/course isolation, strict-mode rejection, snapshots, and complete cleanup. The independent review FIX also makes this gate a prerequisite of CI-success and both deploy paths for develop/master pushes and pull requests.

Pinned execution first found a genuine strict-mode production defect: Formula access to `document_weight` returned HTTP 400 because no numeric payload index existed. Q5 stopped without touching production code. The separately reviewed Q15 correction added the canonical float index and was integrated as `5e9ca758`; Q5 then proved the corrected runtime in three consecutive 9/9 fresh-container runs.

# Scope / Routing

Only the assigned integration tests, CI workflow, isolated integration config, review-authorized narrow default-config predicate and tests, and this artifact changed. Production collection/upload/search modules, Compose/deploy/reindex/backup/monitoring files, stage summary, and handoff were not edited. Q5 ran in parallel with Q7 on disjoint write zones.

The default broad Vitest configuration retains its setup file and BullMQ global setup for normal/full runs. An exported, unit-tested argv predicate disables both only for an explicit one-file selection of `tests/integration/qdrant.test.ts`, accepting normalized `./`, repository-relative, and absolute package paths while rejecting directories, additional test selections, and option values. The exact plan command therefore needs only pinned Qdrant; it does not start Redis, Supabase, a processor, or a default collection.

# Verification

The final intended CI command executed 19 tests: 9 native Qdrant correctness tests, 6 broad Qdrant adapter tests, and 4 existing schema integration tests. The explicit broad selection executed all 6 scenarios rather than an all-skipped suite. A configured closed port failed in `beforeAll`, proving that configuration makes availability blocking.

Every passing runtime used `qdrant/qdrant:v1.18.2` with image ID `sha256:75eab8c4ba42096724fdcfde8b4de0b5713d529dde32f285a1f86fdcb2c9e50c`, `test-qdrant-key`, and loopback port 16333 because unrelated `helixa-qdrant-1` owns 6333. The unrelated container was never stopped or modified. Post-suite `/collections` responses were empty and each Q5 container was removed.

# Delivery / Cleanup

This branch is returned and pushed for independent correctness review. It is not accepted, merged, or cleaned. All temporary Qdrant containers, snapshots, aliases, physical collections, and test points were cleaned; the dedicated branch/worktree remains for reviewer evidence as required.

# Risks / Follow-ups / Explicit Defers

The fixture deliberately keeps production grouping activation outside its write zone. Its causal Formula proof does not rely on favorable ID ordering: dense and BM25 sources rank the controlled documents in opposite orders, unboosted RRF scores are asserted equal, and only the server Formula multiplier changes the final CORE-vs-SUPPLEMENTARY scores. Q10 remains responsible for durable documentation alignment.
