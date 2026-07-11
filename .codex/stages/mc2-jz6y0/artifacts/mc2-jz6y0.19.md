---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.19
stage_id: mc2-jz6y0
agent_type: search_data_worker
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Deterministic full-corpus processing, resumable LLM checkpoints, tenant-filtered retrieval verification, and atomic database progress require high data-integrity reasoning.
repo: /home/me/code/mc2
branch: codex/document-evidence-e2
base_branch: codex/self-hosted-qdrant-platform
base_commit: 06c90b131d70fcce051cd77de5922222f50b1859
worktree: /home/me/code/mc2/.worktrees/document-evidence-e2
write_zone:
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/
  - packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-2-scope.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/phases/stage4-budget-allocator.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/orchestrator.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-helpers.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-phase-helpers.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/handler-helpers.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/utils/validators.ts
  - packages/course-gen-platform/supabase/migrations/20260711120000_document_evidence.sql
  - packages/course-gen-platform/supabase/migrations/rollback/20260711120000_document_evidence_rollback.sql
  - packages/course-gen-platform/tests/integration/document-evidence-rls.test.ts
  - packages/course-gen-platform/tests/unit/stage4-prepare-document-infos.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/
  - packages/shared-types/src/analysis-result.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.19.md
success_criteria:
  - Every enumerated source receives exactly one durable assessed, degraded, or failed evidence card with no silent truncation.
  - Oversized and 1,000-document corpora use deterministic bounded batches, structured hierarchical map/reduce, durable checkpoints, and exact resume.
  - Accepted cards are verified only through tenant/course/document-filtered Qdrant retrieval and retain application-owned provenance.
  - Full-ledger items, checkpoint state, and absolute metrics commit atomically and safely under tenant, terminal, immutable, and rollback constraints.
  - Stage 4 production wiring runs after Phase 1 and before Phase 0.5 without changing disabled, shadow, or no-document semantics.
selected_docs:
  - docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md
  - Task E2 in docs/superpowers/plans/2026-07-11-advisory-document-evidence-rag.md
  - .codex/stages/mc2-jz6y0/artifacts/authoritative-docs.md
  - Qdrant v1.18.2 first-party release and OpenAPI
  - Qdrant JavaScript client v1.18.0 first-party release metadata
selected_skills:
  - /mnt/c/Users/masle/.codex/superpowers/skills/test-driven-development/SKILL.md
  - /mnt/c/Users/masle/.codex/superpowers/skills/systematic-debugging/SKILL.md
  - /mnt/c/Users/masle/.codex/superpowers/skills/verification-before-completion/SKILL.md
  - /home/me/code/mc2/.agents/skills/senior-architect/SKILL.md
  - /home/me/code/mc2/.agents/skills/format-commit-message/SKILL.md
selected_agents:
  - search_data_worker
  - senior_architect reviewer
catalog_candidates:
  - none - installed skills, approved designs, E1 contracts, and repository-local patterns covered E2
parallel_group: E2-preflight
depends_on_streams:
  - mc2-jz6y0.18
  - mc2-jz6y0.8
parallel_decision: isolated worker stream after E1 and Q7 integration; implementation was sequential because allocator, persistence, live wiring, and resume semantics share one checkpoint contract
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: Disposable PostgreSQL is removed after final worker verification; dedicated worktree and branch remain for independent review and integration.
risk_level: high
docs_impact: behavior-and-migration
docs_reviewed: no-change-needed
docs_review_notes: The approved evidence design and E2 execution plan already describe the durable behavior and rollout boundary; this worker changed no operator-facing activation procedure, and the parent docs_reviewer owns cross-epic stable-doc review.
graph_reviewed: used
graph_review_notes: Read graphify-out/GRAPH_REPORT.md and ran `graphify query "Stage 4 document evidence preflight budget allocator Qdrant verification" --limit 10`; the graph was useful only for orientation and was stale for E2. Refresh is deferred to the parent after integration because the shared graph is not safely owned by this isolated worker.
verification:
  - Allocator RED failed 1 missing-module suite; GREEN passed 11/11 initial cases and 13/13 after the legacy oversized-CORE and reserve bridge was added.
  - Preflight adversarial GREEN passed 24/24, including structured full-source map/reduce, port-owned retries, UUIDv8 provenance, durable verification resume without replay, claim-scoped refs, actual-token reduction progress, semantic-only fingerprints, truthful executed mode/tokens, runtime schema fail-closed, exact Stage 3 hash reuse, bounded oversized summaries, foreign-ref rejection, and a deterministic 1,000-source exact-ledger resume.
  - Focused Stage 4 suite passed 114/114 across budget, preflight, durable downstream hierarchy, real Phase 2/3/4 callers, live wiring, repository, authoritative source enumeration, document preparation, and validators.
  - Shared document-evidence contracts passed 11/11.
  - Migration static gate passed 8 with the applied case skipped; applied PostgreSQL 15.18 gate passed 9/9.
  - Both shared-types and course-gen-platform type-checks passed.
  - scripts/orchestration/run_process_verification.sh passed, including git diff --check.
changed_files:
  - packages/shared-types/src/analysis-result.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/budget.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/card-generator.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/downstream-context.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/downstream-hierarchy.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/downstream-reducer.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/preflight.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/repository.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/phases/stage4-budget-allocator.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-2-scope.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/handler-helpers.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/utils/validators.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/orchestrator.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-helpers.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-phase-helpers.ts
  - packages/course-gen-platform/supabase/migrations/20260711120000_document_evidence.sql
  - packages/course-gen-platform/supabase/migrations/rollback/20260711120000_document_evidence_rollback.sql
  - packages/course-gen-platform/tests/integration/document-evidence-rls.test.ts
  - packages/course-gen-platform/tests/unit/stage4-prepare-document-infos.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/document-source-enumeration.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/budget.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/downstream-context.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/downstream-phase-callers.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/live-wiring.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/preflight.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/repository.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/utils/validators.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.19.md
explicit_defers:
  - E3 owns conflict detection and automatic/manual decision workflow; this stream emits candidate conflicts only as an empty bounded placeholder.
  - E4-E7 own UI, Stage 5 enrichment, Stage 6 decision-aware retrieval, and the final joined activation contract.
  - Graphify refresh and stable cross-epic documentation review occur after parent integration, when ownership is safe.
---

# Summary

E2 adds the production Stage 4 evidence preflight after Phase 1 and before the existing Phase 0.5 boundary. It enumerates document metadata with keyset pagination and a second exact snapshot, retains sources with missing content, loads full text in course-scoped batches of at most 200 IDs, and computes an input fingerprint over classification, source hashes, priority, authority, quality, and explicit summary artifact versions.

The progressive allocator keeps every source in the ledger while bounding accepted context to `min(model context, 700000) - prompt reserve - output reserve`. Structured extraction maps deterministic source units, reduces summaries hierarchically, preserves claims and source references in application code, and accepts only allowlisted unit IDs from model output. Stable claim IDs include schema version, document ID, source hash, normalized statement, and sorted references; the UUID uses the version-8 nibble. Unknown fields, foreign references, unavailable content, and Qdrant outages fail closed or produce explicit degraded/failed outcomes rather than disappearing documents.

Checkpoint callbacks atomically persist the complete ledger, structured map/reduce checkpoint, cursor, and absolute generation metrics through `commit_document_evidence_batch`. Same-key/same-hash retries reuse the stored checkpoint without changing metrics; a changed hash, tenant mismatch, terminal run, scope mismatch, direct mutation, or metric regression is rejected. Internal item and metric helpers are not executable by authenticated callers. The applied rollback removes the checkpoint table and both public/internal functions and restores the prior automatic-answer semantics.

# TDD and review evidence

- Initial RED: the new allocator and preflight modules did not exist; repository list/finalize and live wiring assertions failed as expected.
- First GREEN: deterministic allocation, complete card ledger, Stage 4 placement, and source enumeration passed focused tests.
- Architecture review rejected excerpt-based hierarchy, caller-owned retries, weak claim IDs, non-atomic progress, inferred summary versions, and foreign provenance.
- Review RED/GREEN: added structured unit map/reduce, port-owned retries, runtime Zod validation, application-owned provenance, UUIDv8 IDs, durable checkpoints, atomic full-ledger commits, exact Stage 3 summary hashes, bounded content loading, classification-aware fingerprints, and fatal checkpoint errors.
- Database attack-surface review removed authenticated execution of standalone item/metric writers and retained `commit_document_evidence_batch` as the only E2 batch-progress write path.
- Legacy allocator RED/GREEN proves an oversized CORE document is not injected as full text before preflight and that the system-prompt reserve is enforced by validation.
- Final independent review P1/P2 RED exposed eight defects: replayed verification could diverge from durable cards; combined queries contaminated claim provenance; singleton reduction rejected real token progress; runtime Phase 1 metadata invalidated reuse; `vector_status` hid authoritative sources; legacy all-summary validation aborted before preflight; empty content was rejected before durable coverage; and regenerated hierarchy reported planned rather than executed audit values.
- Final review GREEN closes all eight: committed verification keys restore the stored ledger without a second Qdrant call; each material claim gets its own bounded tenant/course/document-grouped query and refs; reduction compares actual token progress; fingerprints use a minimal semantic classification projection; source enumeration ignores Qdrant state; enabled evidence mode owns legacy overflow and missing-content outcomes while disabled mode stays strict; and generated cards record executed hierarchy plus actual summary tokens.
- Re-review found that merely suppressing legacy overflow still passed every summary into Phase 2/3/4. The final P1 cycle now builds one explicitly synthetic/advisory representation from every accepted card exactly once, reduces only through the validated structured port, atomically checkpoints each reduction and the immutable complete digest, and restores it without replay. Exact source IDs/statuses, coverage, claims, constraints, limitations and material refs remain in durable checkpoint metadata; the prompt receives only count, accepted run ID, provenance handle and the bounded digest. Active overflow sends the same representation to Phase 2/3/4 at `min(effective budget, 24000)` tokens; shadow, disabled, no-document and small-fit paths retain their prior document inputs.
- Final reviewer P1 found that a single valid card with a short summary but large aggregate claim/constraint/limitation arrays could still exceed `maxBatchTokens` before cross-document reduction. The closure adds stable document/material/part IDs, lossless code-point partitioning, a deterministic per-card hierarchy before the cross-document hierarchy, and durable chunk/reduction checkpoints bound to schema, model, language and token targets. Every actual RU/EN model request is measured over the exact JSON, the shared production system prompt and a transport reserve; foreign unit IDs remain rejected. Crash/resume reuses committed per-card work with zero duplicate calls and returns a byte-equal representation, while `sourceMaterials` preserves the original claim IDs, refs and arrays outside the compressed digest.

# Verification

- `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-key pnpm exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage4-analysis/evidence/budget.test.ts tests/unit/stages/stage4-analysis/evidence/preflight.test.ts tests/unit/stages/stage4-analysis/evidence/downstream-context.test.ts tests/unit/stages/stage4-analysis/evidence/downstream-phase-callers.test.ts tests/unit/stages/stage4-analysis/evidence/live-wiring.test.ts tests/unit/stages/stage4-analysis/evidence/repository.test.ts tests/unit/stages/stage4-analysis/document-source-enumeration.test.ts tests/unit/stage4-prepare-document-infos.test.ts tests/unit/stages/stage4-analysis/utils/validators.test.ts` -> 114/114.
- `pnpm --filter @megacampus/shared-types exec vitest run tests/document-evidence.test.ts` -> 11/11.
- `pnpm exec vitest run --config ../../vitest.shared.ts --root . tests/integration/document-evidence-rls.test.ts` -> 8 passed, 1 applied test skipped.
- `DOCUMENT_EVIDENCE_DATABASE_URL=postgresql://postgres:[redacted]@127.0.0.1:15434/document_evidence_test pnpm exec vitest run --config ../../vitest.shared.ts --root . tests/integration/document-evidence-rls.test.ts` -> 9/9 on PostgreSQL 15.18.
- `pnpm --filter @megacampus/shared-types type-check` -> passed.
- `pnpm --filter @megacampus/course-gen-platform type-check` -> passed.
- `scripts/orchestration/run_process_verification.sh` -> passed.

# Consulted versions and sources

- Qdrant server 1.18.2: https://github.com/qdrant/qdrant/releases/tag/v1.18.2
- Qdrant v1.18.2 OpenAPI: https://raw.githubusercontent.com/qdrant/qdrant/v1.18.2/docs/redoc/v1.18.x/openapi.json
- `@qdrant/js-client-rest` 1.18.0: https://github.com/qdrant/qdrant-js/releases/tag/v1.18.0
- Applied migration database: PostgreSQL 15.18 in disposable `postgres:15-alpine` on loopback.
- Verification runtime: Node.js 24.16.0 and pnpm 8.15.0.

# Risks / Follow-ups

The evidence preflight remains guarded by its existing disabled/shadow/active configuration. Disabled and no-document paths are behavior-compatible; shadow persists evidence context without modifying Phase 0.5 answers or the accepted semantic analysis snapshot. Database rollback is covered by the applied test and restores the E1-era schema behavior. No Q12, cloud, staging, deployment, live reindex, service, secret, or remote runtime mutation was performed.

The disposable PostgreSQL container is removed after the final verification pass. Independent correctness review, integration rerun, Graphify refresh, docs-review aggregation, and worktree cleanup remain parent-stage responsibilities. E3 must fill candidate conflicts and decisions; downstream E4-E7 must consume the accepted snapshot without weakening the complete-coverage and isolation contracts established here.
