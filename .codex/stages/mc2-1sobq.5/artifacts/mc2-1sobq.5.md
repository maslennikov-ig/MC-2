---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-1sobq.5/stage-manifest.json
stream_owner: root-owner
orchestration_level: integration
scope_kind: product_slice
immediate_consumer: Stage 2 chunking of every newly ingested document in production
public_facade: new documents are chunked by Docling's hybrid chunker; existing points are untouched
bounded_acceptance: runtime resolution proved in the running worker, conversion-to-chunking smoke on a new document, rollback rehearsed on real images, type-check and build
non_goals:
  - reindexing or otherwise touching existing documents
  - schema migration, secret or access change, force-push
  - exposing Docling Serve outside the internal network
evidence:
  - none
task_id: mc2-1sobq.5
epic_id: mc2-1sobq
stage_id: mc2-1sobq.5
session_id: docling-intelligence
milestone: docling_hybrid live in production and proven at runtime
milestone_status: accepted
agent_type: custom
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: a rollout stage whose value is in refusing to claim more than was measured, owned locally by the root
repo: mc-2
branch: develop
base_branch: develop
base_commit: fe0661dd0
worktree: /home/me/code/mc2
write_zone:
  - packages/course-gen-platform/src/stages/stage2-document-processing/docling/serve-chunker.ts
  - packages/course-gen-platform/tests/unit/stages/stage2-document-processing/docling
  - .codex/handoff.md
  - .codex/stages/mc2-1sobq.5
success_criteria:
  - every child stage's acceptance evidence is linked
  - type-check, build and the relevant gates are green
  - images, models and config are digest-pinned
  - the rollback flags and images are verified rather than assumed
  - a new control document passes a live smoke after deploy authority
  - existing documents are not reindexed
selected_docs:
  - Docling Serve 1.29.0 GET /version response read off the running production service
  - MCP SDK streamable_http_client arity difference between 1.x and 3.x
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
cleanup_notes: both production probes and every file they created were removed from the host and verified gone
risk_level: medium
risk_tags:
  - production
  - rollback
affected_surfaces:
  - backend
  - infra
invariants:
  - rollback
  - no-reindex
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: handoff records the runtime proof, the serve-version defect and the rehearsed rollback; the stale "flip is NOT done" section was replaced
verification:
  - pnpm type-check: passed
  - pnpm build: passed
  - vitest chunking and docling scope: 229 passed across 22 files
  - vitest ops suite: 1259 passed, 107 host-gated skips
  - run_process_verification.sh: OK
  - production runtime probe: resolveChunkingStrategy returns docling_hybrid, no fallback
  - production smoke on a NEW document: converted via MCP (fromCache false), applied_strategy docling_hybrid, refCoverage 1.0, provenance_containers in payload
  - rollback rehearsal on real images: MCP 1.x healthy, all three required tools present
changed_files:
  - packages/course-gen-platform/src/stages/stage2-document-processing/docling/serve-chunker.ts
  - packages/course-gen-platform/tests/unit/stages/stage2-document-processing/docling/serve-chunker-version.test.ts
  - .codex/handoff.md
  - .codex/stages/mc2-1sobq.5/summary.md
explicit_defers:
  - the embedding and Qdrant-write half of the pipeline was NOT exercised; it is a paid call and a production data mutation, neither authorized here
---

# Summary

`DOCLING_CHUNK_STRATEGY=docling_hybrid` is live in production and proven at
runtime, and the images serving it were rebuilt from the accepted tree — the
digests they replaced predated Stage A, so this rollout delivered Stages A–D as
well as the flip.

# Measured

Two read-only probes inside the running `megacampus-worker`, neither writing
anything: the compiled `resolveChunkingStrategy` returns `docling_hybrid` and
does not fall back; and a brand new synthetic document, converted through the
production MCP facade (`fromCache: false`, 3.8s) and chunked by the env-resolved
strategy, came back `applied_strategy: docling_hybrid` with `refCoverage: 1.0`
and `provenance_containers` in the payload projection.

That last one is what makes Stage C true in production rather than in tests:
`containers` carries the sheet, slide and chapter boundaries that exist only in
the native document.

# Verification

- Gates green; see the frontmatter for the exact sets.
- The probes found a live defect no test could: `serveVersion()` read a
  `version` key that Serve does not have, so every chunking profile id ended
  `serve=unknown` and an upgrade could never have been identifiable. Fixed in
  `1befdb5ac` with a test built from the bytes production actually returns.

# Risks / Follow-ups

- **The embedding and Qdrant-write half was not exercised.** Proving it needs a
  paid Jina call and a real point written to the production collection. Stated
  rather than glossed: the claim here covers conversion and chunking only.
- The collection is mixed by design from now on. Uniformity would need a
  reindex — a separate decision with its own authorization.
- The first re-processing of any document after this deploy re-embeds it,
  because the embedding cache key includes the chunking profile.
