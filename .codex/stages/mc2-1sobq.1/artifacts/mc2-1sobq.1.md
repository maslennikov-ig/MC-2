---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-1sobq.1/stage-manifest.json
stream_owner: root-owner
orchestration_level: integration
scope_kind: product_slice
immediate_consumer: Stage 2 vector indexing and every current RAG retrieval consumer
public_facade: existing chunk/enriched payload types plus additive provenance fields
bounded_acceptance: controlled Docling corpus in both conversion profiles, focused unit/contract tests, type-check, build, lint
non_goals:
  - enrichment models, new input formats, OCR/VLM evaluation
  - production deploy and any reindex of existing documents
evidence:
  - none
task_id: mc2-1sobq.1
epic_id: mc2-1sobq
stage_id: mc2-1sobq.1
session_id: docling-intelligence
milestone: structure-aware Docling RAG with provenance and an honest A/B
milestone_status: accepted
agent_type: custom
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: cross-module parsing, payload and retrieval change owned locally by the root
repo: mc-2
branch: develop
base_branch: develop
base_commit: 3a708cefe91097716ea233dcd614fbeddc1cd451
worktree: /home/me/code/mc2
write_zone:
  - packages/course-gen-platform/src/shared/embeddings
  - packages/course-gen-platform/src/stages/stage2-document-processing
  - packages/course-gen-platform/scripts/docling-quality-benchmark.ts
  - packages/course-gen-platform/tests/integration/fixtures/docling-quality
  - packages/course-gen-platform/tests/unit/shared/embeddings
  - packages/course-gen-platform/docker/docling-serve
  - packages/course-gen-platform/docker/docling-mcp
  - docker-compose.*.yml
  - docs/DOCLING-MCP-REFERENCE.md
success_criteria:
  - distinct heading levels are asserted honestly and an all-H2 document no longer proves a hierarchy
  - native Hierarchical/Hybrid chunking is A/B tested against legacy_markdown on the same corpus
  - at least 95% of applicable child chunks carry self_refs and page/bbox provenance
  - parent/child, siblings, priority metadata and late chunking keep their contract
  - legacy_markdown rollback restores the current payload and no document is reindexed
selected_docs:
  - Docling Serve 1.29.0 /openapi.json from the running container (2026-08-05)
  - docling_jobkit/convert/manager.py and docling_mcp/docling_cache.py sources in the pinned images
selected_skills:
  - orchestration-bridge:orchestrator-stage
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: n/a
depends_on_streams:
  - none
parallel_decision: local
status: accepted
delivery_method: merge
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: local docling stack and the temporary test Qdrant container remain running for the next stage; no branch or worktree was created
risk_level: medium
risk_tags:
  - public-api
  - data
  - rollback
  - retry
affected_surfaces:
  - backend
  - data
invariants:
  - rollback
  - idempotency
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: docs/DOCLING-MCP-REFERENCE.md gained the chunking strategy contract, the heading-inference flags, both measured upstream gaps and the corrected benchmark instructions
verification:
  - pnpm type-check: passed
  - pnpm build: passed
  - pnpm lint: passed
  - pnpm --filter @megacampus/course-gen-platform exec vitest run tests/unit/shared/embeddings tests/unit/stages/stage2-document-processing tests/unit/shared/cleanup: passed
  - docker compose build docling-serve docling-mcp-internal (runs both test_runtime.py suites): passed
  - tsx scripts/docling-quality-benchmark.ts --conversion-profile baseline: passed
  - tsx scripts/docling-quality-benchmark.ts --conversion-profile pdf-heading-hierarchy: passed
changed_files:
  - packages/course-gen-platform/src/shared/embeddings/heading-hierarchy.ts
  - packages/course-gen-platform/src/shared/embeddings/native-chunk-adapter.ts
  - packages/course-gen-platform/src/shared/embeddings/chunking-strategy.ts
  - packages/course-gen-platform/src/shared/embeddings/retrieval-metrics.ts
  - packages/course-gen-platform/src/shared/embeddings/markdown-chunker.ts
  - packages/course-gen-platform/src/shared/embeddings/metadata-enricher.ts
  - packages/course-gen-platform/src/shared/embeddings/markdown-converter.ts
  - packages/course-gen-platform/src/stages/stage2-document-processing/docling/provenance.ts
  - packages/course-gen-platform/src/stages/stage2-document-processing/docling/serve-chunker.ts
  - packages/course-gen-platform/src/stages/stage2-document-processing/docling/client.ts
  - packages/course-gen-platform/src/stages/stage2-document-processing/docling/types.ts
  - packages/course-gen-platform/src/stages/stage2-document-processing/types.ts
  - packages/course-gen-platform/src/stages/stage2-document-processing/phases/phase-1-docling-conversion.ts
  - packages/course-gen-platform/src/stages/stage2-document-processing/phases/phase-4-chunking.ts
  - packages/course-gen-platform/src/stages/stage2-document-processing/orchestrator-phase-helpers.ts
  - packages/course-gen-platform/scripts/docling-quality-benchmark.ts
  - packages/course-gen-platform/docker/docling-serve/Dockerfile
  - packages/course-gen-platform/docker/docling-serve/runtime.py
  - packages/course-gen-platform/docker/docling-serve/test_runtime.py
  - packages/course-gen-platform/docker/docling-mcp/runtime.py
  - packages/course-gen-platform/docker/docling-mcp/test_runtime.py
  - packages/course-gen-platform/docker/docling-mcp/docker-compose.yml
  - packages/course-gen-platform/tests/integration/fixtures/docling-quality/manifest.json
  - packages/course-gen-platform/tests/integration/fixtures/docling-quality/generate-fixtures.py
  - packages/course-gen-platform/tests/integration/fixtures/docling-quality/hierarchy-multilevel.docx
  - packages/course-gen-platform/tests/integration/fixtures/docling-quality/numbered-sections.pdf
  - packages/course-gen-platform/tests/unit/shared/embeddings/heading-hierarchy.test.ts
  - packages/course-gen-platform/tests/unit/shared/embeddings/native-chunk-adapter.test.ts
  - packages/course-gen-platform/tests/unit/shared/embeddings/native-chunk-payload.test.ts
  - packages/course-gen-platform/tests/unit/shared/embeddings/retrieval-metrics.test.ts
  - docker-compose.infra.yml
  - docker-compose.production.yml
  - docker-compose.app.yml
  - docker-compose.dev.yml
  - docs/DOCLING-MCP-REFERENCE.md
  - specs/024-docling-intelligence/
explicit_defers:
  - mc2-j1axa - dense retrieval A/B, because no JINA_API_KEY exists here and paid calls are unauthorized
  - mc2-ibzcc - remove both runtime wrappers once upstream wires the dropped fields
---

# Summary

Docling's own structure and provenance now survive into chunking, metadata
enrichment and the Qdrant payload behind `DOCLING_CHUNK_STRATEGY`. On the
controlled corpus the native strategies carry a real heading path for 100% of
child chunks against 0% for the legacy Markdown splitter, and resolve 100% of
chunks to Docling `self_ref`s with page and bbox data. `docling_hybrid` is the
selected candidate; production still runs `legacy_markdown` and nothing was
reindexed.

# Scope / Routing

Root-owned, no delegation: one cohesive vertical slice across conversion,
chunking, payload and the quality harness, with a single acceptance boundary and
a feature-flag rollback. The Serve 1.29 chunking contract was resolved once from
the running container's `/openapi.json` rather than from memory, and the two
upstream gaps were confirmed in the installed sources before being named.

# Verification

Tracked evidence copies live in `.codex/stages/mc2-1sobq.1/evidence/`
(`stageA-baseline-*` and `stageA-heading-inference-*`); the full per-strategy
chunk dumps stay under `.tmp/docling-benchmark/`, which is untracked by
repository convention. See `verification:` above. The benchmark ran in both conversion profiles and
passed 7/7 in each; Serve peaked at 3.032 GiB of its 4 GiB limit with zero
restarts. Both Docker images were rebuilt locally and their `test_runtime.py`
suites pass during the build, each asserting the upstream gap red before
asserting the wrapper green.

# Delivery / Cleanup

Accepted by the root owner and committed on `develop` through the repository dev
delivery path. No stage branch or worktree was created, so nothing needs
removing. The local Docling stack and a temporary `qdrant/qdrant:v1.18.2`
container on `127.0.0.1:6343` stay up for the next stage.

# Risks / Follow-ups / Explicit Defers

- The retrieval A/B is lexical only; the dense half of production ranking was
  not exercised. Recorded as such everywhere it is quoted (`mc2-j1axa`).
- `docling_hierarchical` over-fragments slides and regressed one PPTX control
  question. It is not the candidate, stays available as configuration, and the
  regression is printed in the report rather than suppressed.
- Rebuilding the Serve and MCP images changes their digests. The production
  compose still points at the recorded immutable digests, so Stage E owns
  publishing and pinning the new ones.
- `mc2-ibzcc` removes both runtime wrappers after upstream fixes.
