---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.22
stage_id: mc2-jz6y0
agent_type: search_data_worker
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Live cross-stage retrieval, conflict decisions, tenant isolation, fail-open policy, and non-destructive merge validation require high correctness reasoning.
repo: /home/me/code/mc2
branch: codex/document-evidence-e5
base_branch: codex/self-hosted-qdrant-platform
base_commit: d1d185c5585bdbe40bddc8c5e0e583b891a8c4c9
worktree: /home/me/code/mc2/.worktrees/document-evidence-e5
write_zone:
  - packages/shared-types/src/generation-result.ts
  - packages/shared-types/tests/stage5-document-evidence-enrichment.test.ts
  - packages/course-gen-platform/src/stages/stage5-generation/
  - packages/course-gen-platform/tests/unit/stages/stage5-generation/advisory-enrichment*.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.22.md
success_criteria:
  - Live Stage 5 generates and validates its baseline before any document influence.
  - No-document and no-relevant paths retain byte-identical course structures.
  - Accepted decisions exclude rejected conflict sides and stale or cross-tenant evidence.
  - Qdrant retrieval is tenant/course filtered, hybrid, grouped by document with group size two, and deterministically bounded.
  - Enrichment can only append bounded advisory key topics; required baseline structure and size rules are revalidated with one retry.
  - Durable output records exact status, accepted run/decisions, bounded refs/queries, counts and deterministic provenance without content bodies.
selected_docs:
  - docs/superpowers/specs/2026-07-11-advisory-document-evidence-rag-design.md
  - Task E5 in docs/superpowers/plans/2026-07-11-advisory-document-evidence-rag.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.18.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.19.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.20.md
selected_skills:
  - /mnt/c/Users/masle/.codex/superpowers/skills/test-driven-development/SKILL.md
  - /mnt/c/Users/masle/.codex/superpowers/skills/systematic-debugging/SKILL.md
  - /home/me/code/mc2/.agents/skills/senior-architect/SKILL.md
  - /mnt/c/Users/masle/.codex/superpowers/skills/verification-before-completion/SKILL.md
selected_agents:
  - search_data_worker
  - correctness_reviewer
catalog_candidates:
  - none - installed skills, approved evidence contracts, and accepted Qdrant retrieval helpers covered E5
parallel_group: E4-E5-E6
depends_on_streams:
  - mc2-jz6y0.18
  - mc2-jz6y0.20
  - accepted Q5/Q7 retrieval
parallel_decision: parallel isolated E5 worker beside disjoint E4 UI and E6 lesson-retrieval streams
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: Dedicated worktree remains for parent correctness review and integration; dependency symlinks used for verification were removed.
risk_level: high
docs_impact: behavior-and-api-contract
docs_reviewed: no-change-needed
docs_review_notes: The approved evidence design and E5 execution task already document baseline-first advisory behavior, statuses, grouping, fallback and rollback. E7 owns the joined durable Stage 4/5/6/operator documentation update after all live callers integrate.
graph_reviewed: used
graph_review_notes: Read the shared GRAPH_REPORT and ran a focused Stage 5 live-caller query before broad reads. The graph is stale at commit 1233be56 and returned no useful Stage 5 path; repository evidence established handler -> orchestrator -> structural gate -> evidence pass. Refresh remains parent closeout work after integration.
verification:
  - Shared Stage 5 enrichment plus canonical document evidence contracts: 20/20 passed.
  - Focused Stage 5 enrichment/live/persistence/handler plus both Qdrant query suites: 52/52 passed after independent re-review remediation.
  - Full Stage 5 unit directory plus Qdrant search operations: 532/532 passed (520 Stage 5 and 12 shared Qdrant search-operation tests).
  - pnpm type-check: passed across all workspace packages.
  - pnpm build with local non-secret test Supabase environment values: passed across all workspace packages.
  - scripts/orchestration/run_process_verification.sh: passed.
changed_files:
  - packages/shared-types/src/generation-result.ts
  - packages/shared-types/tests/stage5-document-evidence-enrichment.test.ts
  - packages/course-gen-platform/src/stages/stage5-generation/evidence/advisory-enrichment.ts
  - packages/course-gen-platform/src/stages/stage5-generation/evidence/persistence.ts
  - packages/course-gen-platform/src/stages/stage5-generation/evidence/production.ts
  - packages/course-gen-platform/src/stages/stage5-generation/evidence/types.ts
  - packages/course-gen-platform/src/stages/stage5-generation/handler.ts
  - packages/course-gen-platform/src/stages/stage5-generation/orchestrator.ts
  - packages/course-gen-platform/tests/unit/stages/stage5-generation/advisory-enrichment-live.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage5-generation/advisory-enrichment-handler.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage5-generation/advisory-enrichment-persistence.test.ts
  - packages/course-gen-platform/tests/unit/stages/stage5-generation/advisory-enrichment.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.22.md
explicit_defers:
  - Independent correctness review, parent integration rerun, Graphify refresh and joined E7 docs review remain parent-stage responsibilities.
  - E6 owns decision-aware lesson retrieval from this canonical Stage 5 audit record.
  - Q12, cloud recovery, deployment, live reindex, service/secret mutation and every staging/production action were not performed.
---

# Summary

Stage 5 now keeps the existing generated structure as an immutable baseline and runs a second, live advisory pass only after the normal graph and structural gate complete. The production BullMQ handler constructs the evidence service; `GenerationOrchestrator.execute()` is covered by a real caller spy proving the pass receives the completed baseline and accepted Stage 4 snapshot. Courses without documents return the exact baseline and persist `not_applicable`; an empty relevant set returns the exact baseline with `no_relevant_evidence`.

The evidence pass reloads the accepted run, complete card ledger, conflicts and current append-only decisions. It rejects stale decision or coverage snapshots and cross-course/organization rows before retrieval. Conflict recommendations and manual alternatives are interpreted through the canonical selected value; rejected claims, statements, source refs and document-only sides cannot enter the query set or patch material. Degraded/failed cards require a current `continue_limited` or `remove_document` decision before Stage 5 can proceed.

Each accepted section makes one live hybrid Qdrant query with exact organization/course filters, `group_by_document: true`, `group_size: 2`, full payload verification and a result limit of eight. A 1,000-document corpus is deterministically ranked by priority, authority, relevance, quality and ID, then bounded to 64 document filters per section. Returned refs must match tenant, course, accepted document, chunk and source version hash. Only claims whose source refs exactly intersect returned accepted `document_id + chunk_id + version_hash` tuples can become advisory topics; a document-only ref remains provenance but cannot authorize an arbitrary returned chunk, and unreferenced card terminology or constraints cannot leak into a section. Source/claim bodies never enter logs, traces or the durable Stage 5 record.

The deterministic production patch can only append at most two chunk-grounded claim topics to the first lesson in a section and never exceed ten key topics. A generic patch contract still receives the same non-destructive checks: course metadata, section/lesson order, titles, objectives, durations and required topic prefixes cannot change. Zod and the existing live structural size gate run on every candidate; the pass retries once with explicit violation codes, then returns the baseline with honest `degraded` or `failed_open_with_decision` status. Per-section Qdrant fallback is counted durably and forces `degraded` with or without hits.

# TDD / Routing Evidence

- Initial shared RED: the unknown metadata field was stripped and non-canonical arrays passed; GREEN added the optional canonical schema.
- Initial Stage 5 RED: the evidence module did not exist; GREEN covered no-doc/no-relevant byte equivalence, RU/EN, decision filtering, grouped query shape, patch retry, size limits, fallback status, stale/cross-tenant rejection and log privacy.
- Live RED: `GenerationOrchestrator.execute()` ignored the injected enricher; GREEN wired the post-baseline production caller and persisted the audit record.
- Persistence RED: no compact snapshot updater existed; GREEN updates only `analysis_result.document_evidence.enrichment_status` when accepted run and decision sets match. A post-push self-review then found a concurrent-decision overwrite race; the final CAS plan makes the course update conditional on the exact original `analysis_result` snapshot and fails rather than erasing a newer decision.
- Hardening RED: manual canonical values, stale coverage, unresolved degraded cards and 1,000-document query bounds failed; GREEN added exact checks and deterministic top-64 ranking.
- Independent-review RED/GREEN: a multi-claim selected side, an unrelated first claim, fallback hit/no-hit, success/error privacy sentinels, production handler reachability and a zero-row PostgREST CAS exposed the remaining gaps. GREEN now resolves conflict sides through claim identity, grounds additions to returned chunks, records fallback sections, fails open without logging error bodies, emits only aggregate completion trace fields, and proves that stale `analysis_result` prevents the atomic structure/metadata/evidence update and every downstream write.
- Independent re-review RED/GREEN: a document-level claim ref plus an unrelated returned chunk incorrectly produced `applied`; exact tuple matching now rejects it as `no_relevant_evidence` while retaining the unchanged baseline and empty section evidence.
- Focused Graphify was consulted first but was stale and unhelpful; repository reads were then limited to the actual Stage 5 handler/orchestrator/validation chain.

# Consulted Versions and Sources

- Qdrant server `1.18.2`: https://github.com/qdrant/qdrant/releases/tag/v1.18.2
- Qdrant `1.18.2` OpenAPI used by the accepted shared query implementation: https://raw.githubusercontent.com/qdrant/qdrant/v1.18.2/docs/redoc/v1.18.x/openapi.json
- `@qdrant/js-client-rest` `1.18.0`, already accepted by Q5/Q7 and recorded in E2: https://github.com/qdrant/qdrant-js/releases/tag/v1.18.0

# Verification

Fresh final commands and exact totals are recorded in frontmatter. The initial root build attempts exposed only isolated-worktree dependency links and then missing non-secret web build variables; after restoring ignored dependency links and supplying local test values, the repository build passed. No external service was contacted by those values.

# Delivery / Cleanup

The branch is ready for independent correctness review. Parent orchestration must inspect the diff, run a fresh review, integrate only after approval, rerun focused gates on the integration branch, then update this artifact to accepted/merged and clean the dedicated worktree/branch.

# Risks / Follow-ups / Explicit Defers

The advisory pass is deliberately conservative: it adds only lesson key topics, while richer examples or organization-specific prose remain future patcher behavior behind the same invariant checks. This is not silent debt: the approved design says those additions are optional (`may`), and E6 consumes the persisted refs/queries for lesson content. Full cross-stage observability and durable operator docs belong to E7 after E4/E5/E6 converge. No remote or live mutation occurred.
