---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.20
stage_id: mc2-jz6y0
agent_type: search_data_worker
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Conflict provenance, append-only decisions, crash-safe retry lineage, bounded detector capacity, and tenant-scoped verification require high data-integrity reasoning.
repo: /home/me/code/mc2
branch: codex/document-evidence-e3
base_branch: codex/self-hosted-qdrant-platform
base_commit: 8e8b5307778aeaf8cc9580f6152bcaba3f4b2387
worktree: /home/me/code/mc2/.worktrees/document-evidence-e3
write_zone:
  - packages/shared-types/src/document-evidence.ts
  - packages/shared-types/tests/document-evidence.test.ts
  - packages/course-gen-platform/src/server/routers/clarifying-helpers.ts
  - packages/course-gen-platform/src/server/routers/clarifying-schemas.ts
  - packages/course-gen-platform/src/server/routers/clarifying.router.ts
  - packages/course-gen-platform/src/shared/llm/client.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/
  - packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-helpers.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-phase-helpers.ts
  - packages/course-gen-platform/supabase/migrations/20260711130000_document_conflict_auto_answers.sql
  - packages/course-gen-platform/supabase/migrations/rollback/20260711130000_document_conflict_auto_answers_rollback.sql
  - packages/course-gen-platform/tests/integration/document-conflict-auto-decisions*.test.ts
  - packages/course-gen-platform/tests/unit/server/routers/clarifying*.test.ts
  - packages/course-gen-platform/tests/unit/shared/llm/client.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.20.md
success_criteria:
  - Critical and important document conflicts become a distinct required Phase 0.5 question block with bounded, allowlisted provenance.
  - Manual mode stops at the existing Phase 0.5 boundary; automatic mode atomically selects exactly one persisted recommendation with system rationale and provenance.
  - Degraded evidence retries are bounded, full-set, crash-recoverable, idempotent, and counted only after linkage to a distinct accepted run.
  - Detector work accounts for actual model attempts and persists explicit capacity degradation instead of throwing a generic exhaustion error.
  - Material verification is tenant/course/document grouped, deterministic, bounded, and checkpointed with its exact representative plan.
  - Legacy E1 audits upgrade without parallel decision chains; tenant isolation, actor attribution, rollback refusal, and append-only history remain strict.
selected_docs:
  - docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md
  - Task E3 in docs/superpowers/plans/2026-07-11-advisory-document-evidence-rag.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.18.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.19.md
selected_skills:
  - /mnt/c/Users/masle/.codex/superpowers/skills/test-driven-development/SKILL.md
  - /mnt/c/Users/masle/.codex/superpowers/skills/systematic-debugging/SKILL.md
  - /mnt/c/Users/masle/.codex/superpowers/skills/verification-before-completion/SKILL.md
  - /home/me/code/mc2/.agents/skills/senior-architect/SKILL.md
  - /home/me/code/mc2/.agents/skills/format-commit-message/SKILL.md
selected_agents:
  - search_data_worker
  - correctness_reviewer
catalog_candidates:
  - none - installed skills, approved designs, E1/E2 contracts, and repository-local patterns covered E3
parallel_group: E3-conflicts-decisions
depends_on_streams:
  - mc2-jz6y0.18
  - mc2-jz6y0.19
parallel_decision: isolated worker stream after E1 and E2; detector, decisions, retry lineage, and live Stage 4 wiring were sequential because they share one accepted-run audit contract
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: The review-closeout PostgreSQL 15.18 container and worktree dependency symlinks were removed after the final post-review verification pass. Parent owns post-integration branch/worktree cleanup.
risk_level: high
docs_impact: behavior-and-migration
docs_reviewed: no-change-needed
docs_review_notes: The approved document-evidence design and E3 execution plan already define conflict questions, automatic decisions, bounded retries, capacity degradation, and rollout boundaries. Cross-epic stable-document review remains with the parent docs_reviewer after integration.
graph_reviewed: used
graph_review_notes: Read graphify-out/GRAPH_REPORT.md and ran a focused Graphify query before broad source reads. The shared graph is stale for E3; refresh is deferred to the parent after integration because this isolated worker does not safely own graphify-out.
verification:
  - Focused course-gen-platform unit matrix passed 136/136 across detector, decision service, manual boundary, live wiring, repository, preflight, router, LLM client, actor-specific idempotency, and SQLSTATE mapping.
  - Shared document-evidence contracts passed 13/13.
  - Static and applied migration matrix passed 36/36, including 26/26 on disposable PostgreSQL 15.18.
  - packages/course-gen-platform type-check passed after all review remediations.
  - scripts/orchestration/run_process_verification.sh passed, including git diff --check.
changed_files:
  - packages/shared-types/src/document-evidence.ts
  - packages/shared-types/tests/document-evidence.test.ts
  - packages/course-gen-platform/src/server/routers/clarifying-helpers.ts
  - packages/course-gen-platform/src/server/routers/clarifying-schemas.ts
  - packages/course-gen-platform/src/server/routers/clarifying.router.ts
  - packages/course-gen-platform/src/shared/llm/client.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/conflict-detector.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/decision-service.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/preflight.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/evidence/repository.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-helpers.ts
  - packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-phase-helpers.ts
  - packages/course-gen-platform/supabase/migrations/20260711130000_document_conflict_auto_answers.sql
  - packages/course-gen-platform/supabase/migrations/rollback/20260711130000_document_conflict_auto_answers_rollback.sql
  - packages/course-gen-platform/tests/integration/document-conflict-auto-decisions-applied.test.ts
  - packages/course-gen-platform/tests/integration/document-conflict-auto-decisions.test.ts
  - packages/course-gen-platform/tests/unit/server/routers/clarifying-helpers-document-evidence.test.ts
  - packages/course-gen-platform/tests/unit/server/routers/clarifying.router.test.ts
  - packages/course-gen-platform/tests/unit/shared/llm/client.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/conflict-detector.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/clarifying-boundary.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/decision-service.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/live-wiring.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/preflight.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/repository.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.20.md
explicit_defers:
  - Independent correctness review, parent integration rerun, Graphify refresh, and cross-epic docs review remain parent-stage responsibilities.
  - E4-E7 own conflict UI, Stage 5 advisory enrichment, Stage 6 decision-aware retrieval, and the final joined activation contract.
  - Q12, cloud recovery, deployment, live reindex, service/secret mutation, and every staging/production action remain outside this stream and were not performed.
---

# Summary

E3 turns accepted E2 evidence into explicit, durable conflict and degradation decisions without changing courses that have no documents. The detector maps allowlisted persisted claims in deterministic batches, reduces large value sets hierarchically, classifies only persisted clusters, derives stable conflict fingerprints in application code, and persists immutable checkpoints with exact usage. Critical and important conflicts, degraded/failed documents, and detector-capacity issues materialize as the exact unresolved Phase 0.5 subject set; informational conflicts remain visible but non-blocking.

Automatic mode selects the single persisted recommendation atomically and stores `resolved_by=system`, `answer_source=system`, recommendation value/index, rationale, question linkage, payload hash, and snapshot provenance. Manual answers require an authenticated actor, strict source/index shape, expected-current compare-and-swap, actor/course/question/subject-bound idempotency, and append-only supersession. SQLSTATE `40001` maps to a retryable tRPC conflict. Legacy E1 decisions are backfilled to the canonical SHA subject key with explicit `legacy_unknown` actor provenance before the new uniqueness contract is installed.

Retry lineage uses a full deterministic pending set rather than one latest decision. Pending retry decisions are recovered after a crash, passed together into the next immutable E2 fingerprint, and linked to the distinct accepted target run through append-only `document_evidence_retry_applications`. Attempts count only linked executions, exact-set consume rejects partial/stale/duplicate payloads, and replay is idempotent. Degraded retry copy promises only the same bounded configuration for transient failure. Deterministic detector-capacity questions do not offer a no-op retry: their stable choices are `continue_limited` and `abort_adjust_sources`.

Material Qdrant verification samples an exact deterministic representative plan, caps each grouped call at 16 documents and 64 required refs, caps each side at eight batches, retains tenant/course filters, rejects foreign refs, and persists plan hash/counts. Model capacity is charged by actual attempts from each port response; exhausted boundaries persist a `detector_capacity` checkpoint and decision subject rather than escaping through a generic failure.

# TDD and review chronology

- Initial RED established missing conflict detector, decision subject contracts, manual/automatic boundary wiring, migration, rollback, and applied PostgreSQL coverage.
- First GREEN added deterministic conflict mapping/reduction/classification, material verification, exact decision gates, tenant-scoped questions, automatic recommendations, manual supersession, and live Stage 4 wiring.
- Architecture/security review rejected caller-authored provenance, weak decision scope, incomplete unresolved sets, stale snapshots, legacy RPC write paths, MD5 hashes, unsafe rollback restoration, and tenant fallthrough. The next cycle moved provenance and subject identity to accepted DB state, used pgcrypto SHA-256, revoked legacy writers, restored strict tenant guards, and made rollback refuse unmappable E3 audit state.
- Recovery review found single-latest retry loss, counting unexecuted decisions, and final-attempt replay collision. The fix introduced the full pending set, append-only target-run linkage, exact atomic consume, replay-safe idempotency, and crash/resume tests for two documents.
- Capacity/Qdrant review found operation-count planning instead of actual attempt accounting and unbounded material-side verification. The fix charges actual attempts at every boundary, persists capacity checkpoints, and records a deterministic capped verification plan. Large-side coverage proves 129 representative documents/refs in nine grouped calls with at most 16 documents per call.
- Final addenda bound user idempotency to actor/course/question/subject, made cross-user reuse fail closed, canonically upgraded E1 decision chains, revoked direct helper execution, mapped `40001` to conflict, replaced a malformed collision fixture with a valid semantic collision, and corrected RU/EN product wording and detector-capacity choices.
- Independent post-push review found five missed supported-scale boundaries. Count-only conflict map batches could throw before a durable capacity subject; disabled/skipped ordinary clarification could interrupt without persisting `stage_4_clarifying`; manual and informational-only gates could omit the accepted snapshot; the atomic gate capped valid 1,000-source runs at 256 questions; and retry consume capped the exact pending set at 50. RED reproduced every boundary. GREEN uses exact cl100k token-aware map partitioning, durable EN/RU impossible-claim capacity checkpoints, a fail-closed reusable status/progress transition, unconditional empty/full atomic gate refresh, a DB-derived accepted source/material-conflict/capacity-subject limit with a 16 MiB payload envelope, and exact retry linkage up to the 1,000-source target-run limit. Applied tests prove 1,000 questions create no partial rows, a payload above 16 MiB is rejected with zero writes, 51/1,000 pending retries survive restart and link atomically, and the real analyzing→manual pause→guarded approval path succeeds only after decisions.

# Verification

- `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=[test] pnpm exec vitest run --config vitest.config.unit.ts ...` -> 136/136.
- `pnpm exec vitest run tests/document-evidence.test.ts` in shared-types -> 13/13.
- `DOCUMENT_EVIDENCE_DATABASE_URL=postgresql://postgres:[redacted]@127.0.0.1:55433/document_evidence_e3_test pnpm exec vitest run --config ../../vitest.shared.ts --root . tests/integration/document-conflict-auto-decisions.test.ts tests/integration/document-conflict-auto-decisions-applied.test.ts` -> 36/36 (10 static, 26 applied).
- Applied database: PostgreSQL 15.18, image `postgres:15.18-alpine`, digest `sha256:3d0f7584ed7d04e27fa050d6683a74746608faf21f202be78460d679cc56461f`.
- `pnpm type-check` in course-gen-platform -> passed.
- `scripts/orchestration/run_process_verification.sh` -> passed.

# Risks / Follow-ups

Rollback succeeds only when no E3-only decision, checkpoint, or retry-application audit would be lost; otherwise it explicitly refuses. The applied matrix proves clean rollback to E1, E3 reapplication, canonical legacy-decision upgrade, and refusal when unmappable audit state exists. No remote or live mutation occurred.

Residual risk is bounded to parent-owned integration: this branch is based on `8e8b5307778aeaf8cc9580f6152bcaba3f4b2387` and must receive an independent correctness review, conflict-aware integration, and full integration-stage verification. E4-E7 must consume these decisions without weakening complete coverage, isolation, or the existing manual Phase 0.5 stop.
