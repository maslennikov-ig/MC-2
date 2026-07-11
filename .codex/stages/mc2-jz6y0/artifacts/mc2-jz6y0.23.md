---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.23
stage_id: mc2-jz6y0
agent_type: senior_architect
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Decision-aware retrieval crosses append-only audit state, live Stage 6 orchestration, tenant isolation, cache correctness, Qdrant failure semantics, and bounded prompt provenance.
repo: /home/me/code/mc2
branch: codex/document-evidence-e6
base_branch: codex/self-hosted-qdrant-platform
base_commit: d1d185c5585bdbe40bddc8c5e0e583b891a8c4c9
worktree: /home/me/code/mc2/.worktrees/document-evidence-e6
write_zone:
  - packages/course-gen-platform/src/stages/stage6-lesson-content/rag/
  - packages/course-gen-platform/src/stages/stage6-lesson-content/services/job-processor.ts
  - packages/course-gen-platform/tests/unit/stages/stage6/rag/
  - packages/course-gen-platform/tests/unit/stages/stage6-lesson-content/services/
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.23.md
success_criteria:
  - The production-reachable Stage 6 retriever consumes the current accepted evidence run, current decision IDs, selected conflict side, and exact source versions.
  - Every live Qdrant query is tenant/course filtered and document-grouped with group size 2 while preserving native hybrid retrieval and Formula priority weighting.
  - Rejected conflict sides, removed degraded documents, stale refs, stale cache identities, and cross-scope Qdrant results cannot reach lesson generation.
  - No-document courses remain optional and behavior-compatible; required evidence outages retain the existing retryable failure contract.
  - Lesson chunks carry bounded structured evidence provenance without raw decision history or answer bodies in logs.
selected_docs:
  - docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md
  - Task E6 in docs/superpowers/plans/2026-07-11-advisory-document-evidence-rag.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.18.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.20.md
selected_skills:
  - /mnt/c/Users/masle/.codex/superpowers/skills/test-driven-development/SKILL.md
  - /mnt/c/Users/masle/.codex/superpowers/skills/systematic-debugging/SKILL.md
  - /mnt/c/Users/masle/.codex/superpowers/skills/verification-before-completion/SKILL.md
  - /home/me/code/mc2/.agents/skills/senior-architect/SKILL.md
selected_agents:
  - senior_architect
  - correctness_reviewer
catalog_candidates:
  - none - installed skills, approved E1/E3 contracts, and the production Stage 6 path covered this stream
parallel_group: E4-E5-E6
depends_on_streams:
  - mc2-jz6y0.18
  - mc2-jz6y0.20
parallel_decision: E6 ran in its isolated worktree alongside independent E4 and E5; loader, decision projection, live caller, and retriever changes were sequential because they share one cache and failure contract.
status: accepted
delivery_method: merge
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Integrated as merge 1e681027 after independent approval and a fresh integration rerun. The dedicated worktree, generated dependency links, disposable PostgreSQL containers, and local worker branch were removed; the pushed remote evidence branch remains as audit evidence.
risk_level: high
docs_impact: behavior-and-migration
docs_reviewed: no-change-needed
docs_review_notes: The approved evidence design and E6 plan already describe decision-aware targeted Stage 6 retrieval, grouping, provenance, no-document behavior, and rollback boundaries. Stable cross-epic operator/product documentation remains E7/parent-owned after integration.
graph_reviewed: updated
graph_review_notes: Read graphify-out/GRAPH_REPORT.md and ran a focused Graphify query before broad source reads. After safe integration, the parent ran local-only `graphify update .` and `graphify cluster-only . --no-viz`; the report is built from merge `1e681027` with 50,053 nodes, 74,224 edges and 3,154 communities, zero model/API tokens and no Git hooks.
verification:
  - TDD RED/GREEN proved durable side handles from conflict ID plus sorted claim IDs, exact system/manual option persistence, legacy fail-closed behavior, accepted-side selection, degraded remove/continue behavior, stable decision/ref cache identity, stale and foreign ref rejection, and bounded provenance.
  - Shared document-evidence contracts passed 14/14; the full Stage 4 analysis unit directory passed 267/267 after deleting three tests for the removed dead writer; E3 static plus durable-side static migrations passed 14/14.
  - Disposable PostgreSQL 15.18 passed the original E3 applied matrix 26/26 and the forward/rollback/idempotent durable-side matrix 8/8.
  - Focused Stage 6/Qdrant unit matrix passed 76/76 across evidence context/loader, exact live/cache chunk scope, two-tier failure semantics, job processor fail-closed wiring, and native search operation preservation.
  - Full Stage 6 unit gate passed 957/957 across 63 files.
  - packages/course-gen-platform type-check passed.
  - packages/course-gen-platform build passed.
  - Root pnpm build passed with synthetic build-only Supabase environment values; no remote service was contacted or changed.
  - scripts/orchestration/run_process_verification.sh passed with artifact validation and git diff --check.
changed_files:
  - packages/shared-types/src/document-evidence.ts
  - packages/shared-types/tests/document-evidence.test.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/conflict-detector.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/decision-service.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/repository.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/side-handle.ts
  - packages/course-gen-platform/src/stages/stage6-lesson-content/rag/evidence-context.ts
  - packages/course-gen-platform/src/stages/stage6-lesson-content/rag/evidence-loader.ts
  - packages/course-gen-platform/src/stages/stage6-lesson-content/rag/helpers.ts
  - packages/course-gen-platform/src/stages/stage6-lesson-content/rag/retriever.ts
  - packages/course-gen-platform/src/stages/stage6-lesson-content/rag/types.ts
  - packages/course-gen-platform/src/stages/stage6-lesson-content/services/job-processor.ts
  - packages/course-gen-platform/tests/unit/stages/stage6/rag/evidence-context.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage6/rag/evidence-loader.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage6/rag/lesson-rag-retriever.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage6/rag/two-tier-retrieval.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage6-lesson-content/services/completed-course-regeneration.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage6-lesson-content/services/job-processor.test.ts
  - packages/course-gen-platform/supabase/migrations/20260711140000_document_conflict_side_identity.sql
  - packages/course-gen-platform/supabase/migrations/rollback/20260711140000_document_conflict_side_identity_rollback.sql
  - packages/course-gen-platform/tests/integration/document-conflict-side-identity.test.ts
  - packages/course-gen-platform/tests/integration/document-conflict-side-identity-applied.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/conflict-detector.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/decision-service.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/side-handle.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.23.md
explicit_defers:
  - E7 observability/join coverage, stable docs review, and the parent Graphify refresh remain parent-stage responsibilities.
  - Q12, deployment, live reindex, service/secret changes, cloud recovery, and every staging/production mutation remain blocked without explicit current-task authorization and were not performed.
---

# Summary

E6 makes the production Stage 6 lesson retriever consume current database truth rather than queued evidence snapshots. The loader resolves the course organization, validates ownership, loads the exact accepted evidence run, source manifest, cards, conflicts, and current append-only decision chain, then builds a deterministic projection. Material conflict sides are excluded by default and only the persisted selected option is restored; `remove_document` excludes a degraded source, `continue_limited` retains it, and non-terminal or stale states fail closed. The cache identity hashes the accepted run, sorted current decision IDs, and sorted accepted source refs including version hashes.

Conflict-side identity is now text-independent for every new decision. E3 derives `side:v1:<sha256>` from the conflict UUID and sorted unique claim IDs, persists it on immutable conflict sides and question options/metadata, and the database stores the exact selected handle for system, suggested, and modified answers. Custom answers deliberately store `NULL`; Stage 6 rejects them as unprojectable instead of guessing from answer text. A separate reversible migration backfills only exact durable legacy option tokens when conflict roles are unambiguous, never uses `selected_resolution` text, leaves ambiguous rows null, refuses lossy rollback once side-aware decisions exist, and preserves append-only triggers outside its bounded migration window.

The migration also upgrades pre-existing pending/unanswered conflict questions in one atomic question-row update. It rewrites metadata sides plus recommendation/alternative option values only when the persisted conflict exposes one complete role/index projection and the legacy payload contains the exact expected bounded side count; stable question IDs then reuse the exact new payload. Missing conflict scope, incomplete projections, and ambiguous legacy questions keep their old values, receive an explicit `blocked_ambiguous` migration marker, and fail with SQLSTATE `23514` instead of becoming silently unanswerable. Rollback refuses a versioned handle anywhere in a conflict-question row, including pending metadata and custom `user_answer`, without assuming any JSON field is an array. The unused repository `appendDecision` surface and its unit tests were removed so all production decision writes remain behind the audited gate/user RPCs.

The live job processor passes that projection and resolved organization to `retrieveLessonContext()`. Both retrieval tiers now require organization/course scope, intersect the lesson's primary documents with the accepted allowlist, enable real document grouping with size 2, and validate returned payload organization, course, document, version and exact accepted chunk/source-ref scope before prompt conversion. Rejected refs win when selected and rejected conflict sides share one document. A source ref without `chunk_id` is explicitly document-level for the accepted version; page/heading remain provenance locators, while a chunk-scoped ref never broadens. Native hybrid BM25/RRF and Formula priority boosting remain in the shared search path. Any incomplete query plan for a required-document course returns the existing retryable `qdrant_service_unavailable` contract instead of reranking partial evidence. Courses without documents still return the existing optional empty result before organization enforcement.

Accepted decision/ref identity participates in query planning through the exact document allowlist and cache key. Raw decision answers are deliberately not added as free-text Qdrant queries because the shared search layer logs query previews; this prevents answer bodies from entering ordinary logs. Lesson chunks instead carry bounded structured provenance: accepted run ID, at most eight document/global-relevant decision IDs and eight exact/document-level refs, plus total, overflow and SHA-256 handles. Unrelated decisions and same-document unknown/rejected chunks are never projected.

# TDD and self-review chronology

- Initial RED failed because the accepted evidence projection and loader did not exist.
- First GREEN added exact run/decision/ref validation, selected-side projection, degraded decisions, tenant-scoped live retrieval, grouping, payload validation, provenance, and decision/ref-aware caching.
- Live-caller RED proved the production job processor did not load evidence; GREEN inserted the loader before the optional retriever catch so scope/audit failures cannot be silently swallowed.
- Failure-semantics RED proved a failed Tier 1 query could be masked by later partial results; GREEN exhausts the bounded plan and raises the existing retryable required-RAG error before reranking.
- Isolation/cache RED proved an empty accepted intersection could broaden to all course documents and a stale cached document could be served; GREEN returns empty for the exact empty intersection and rejects cache entries outside the current allowlist.
- Final pre-review self-review found two untested edges. RED showed a user-modified display answer lost its selected conflict side and a neighboring Qdrant chunk received empty provenance. GREEN resolves the persisted recommendation/alternative value before matching the accepted side and propagates only exact or explicit document-level refs.
- The full Stage 6 suite initially exposed seven failures in an existing completed-course regeneration fixture because it did not mock the new loader. The production code was unchanged; the fixture received the same no-evidence loader result used by other job-processor tests, after which all 947 tests passed.
- Independent review then required five fail-closed corrections. RED proved selected/rejected chunks in one document were conflated in both live and cached retrieval, scope errors could fall through the generic optional catch, long/custom resolutions could silently project no side, degraded cards could lack a terminal decision, and every chunk received the complete decision-ID set.
- Remediation GREEN validates exact accepted/rejected source refs after tenant/course/version checks and before prompt/cache conversion; makes ref/version/tenant scope errors fail the course from both loader and retriever; maps persisted recommendation/alternative values through the immutable conflict/claim projection with unique truncation-safe matching; rejects unprojectable custom text visibly; requires one terminal `continue_limited|remove_document` decision for every degraded/failed card; and caps provenance with relevant totals/overflow/hash handles.
- Final P1 review rejected all display/prefix inference. RED covered equal first-600-character displays, alternative/manual and recommendation/system paths, text-only legacy rows, ambiguous legacy conflicts, and migration rollback/reapply. GREEN introduced one shared versioned side handle across E3 question generation, persisted decisions, and E6 projection; new non-custom decisions require an exact handle, custom remains null/fail-closed, and the legacy migration backfills only encoded exact option identity.
- Final migration re-review found that pending E3 questions retained old option values, rollback ignored side-aware question payloads, and the repository still exposed a dead legacy writer. RED reproduced pending stable-payload collisions, missing-scope/incomplete/ambiguous silent blocking, pending-only/custom-only rollback loss (including non-array legacy JSON), and the writer surface. GREEN atomically migrates complete pending payloads, marks and rejects every unavailable projection explicitly, scans the whole question row before rollback, and removes `appendDecision` plus its three obsolete unit tests.

# Verification

- Shared contract command in `packages/shared-types`: `pnpm exec vitest run tests/document-evidence.test.ts` -> 14/14.
- Full Stage 4 analysis unit directory across side handle, detector, decision service, repository, preflight, boundary/live wiring, downstream callers, phases and validators -> 267/267 in 19 files; the repository count is three lower because tests for the removed dead writer were deleted.
- Focused Stage 6 command: `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=[test] pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage6/rag/evidence-context.test.ts tests/unit/stages/stage6/rag/evidence-loader.test.ts tests/unit/stages/stage6/rag/lesson-rag-retriever.test.ts tests/unit/stages/stage6/rag/two-tier-retrieval.test.ts tests/unit/stages/stage6-lesson-content/services/job-processor.test.ts tests/unit/shared/qdrant/search-operations.test.ts` -> 76/76.
- Full Stage 6 command: `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=[test] pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage6 tests/unit/stages/stage6-lesson-content/services/job-processor.test.ts` -> 957/957 in 63 files.
- Static migrations -> 14/14. On disposable PostgreSQL 15.18, original E3 applied tests -> 26/26 and durable-side forward/rollback/idempotency tests -> 8/8. The latter includes stable rematerialization, common-600 ambiguity, missing conflict scope, incomplete bounded side projection, pending-only rollback, custom-null rollback, arbitrary metadata/user-answer handles, clean rollback and reapply. Image `postgres:15.18-alpine`, digest `sha256:3d0f7584ed7d04e27fa050d6683a74746608faf21f202be78460d679cc56461f`.
- `pnpm --filter @megacampus/course-gen-platform type-check` -> passed.
- `pnpm --filter @megacampus/course-gen-platform build` -> passed.
- `SUPABASE_SERVICE_ROLE_KEY=[synthetic] NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=[synthetic] pnpm build` -> passed. The first two attempts diagnosed only missing worktree web dependencies and required build-time env; no product failure was hidden.
- `scripts/orchestration/run_process_verification.sh --artifact .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.23.md` -> passed.
- Consulted pinned/current first-party shapes already recorded by the accepted Qdrant stream: Qdrant server 1.18.2 release `https://github.com/qdrant/qdrant/releases/tag/v1.18.2`, Qdrant 1.18 OpenAPI `https://raw.githubusercontent.com/qdrant/qdrant/v1.18.2/docs/redoc/v1.18.x/openapi.json`, and JS client 1.18.0 release `https://github.com/qdrant/qdrant-js/releases/tag/v1.18.0`.

# Risks / Follow-ups

Custom conflict answers intentionally carry no durable side handle. `Stage6EvidenceScopeError` therefore fails the Stage 6 course visibly rather than silently discarding or injecting either side. System, suggested, and modified answers use only the exact persisted handle; neither display text nor prefixes participate in runtime projection or legacy-decision backfill.

An ambiguous pre-side-identity pending question is intentionally blocked rather than guessed. Its metadata records `side_identity_migration=blocked_ambiguous`; answering returns SQLSTATE `23514`. Resolving such a legacy ambiguity requires an explicit product/operator decision before rematerialization. No Q12 or live mutation is part of this path.

This stream does not alter shared Qdrant request shapes, native BM25/RRF/Formula behavior, evidence persistence, Stage 4, Stage 5, or web conflict UI. It performs no Q12 or other remote mutation. Parent integration must rerun joined Stage 4/5/6 isolation/recovery coverage and E7 observability before Q10/Q11 can close.
