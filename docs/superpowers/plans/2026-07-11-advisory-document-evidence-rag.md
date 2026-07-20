# Advisory Document Evidence and RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to execute isolated tasks and `superpowers:test-driven-development` for every behavior change. Track each checkbox in the owning Beads child.

**Goal:** Account for every optional uploaded document, resolve material contradictions before generation, and use accepted evidence to enrich course structure and lesson retrieval without allowing low-quality documents to replace the baseline curriculum.

**Architecture:** Add a durable Stage 4 evidence preflight after Phase 1 and before Phase 0.5. It builds a complete per-document ledger, reduces large corpora hierarchically, detects conflicts, and records manual or automatic decisions. Stage 5 first creates the normal baseline structure and then performs bounded advisory enrichment; Stage 6 consumes the same decisions and source references through tenant-filtered Qdrant retrieval.

**Tech Stack:** TypeScript, Zod, PostgreSQL/Supabase RLS, BullMQ Stage 4/5/6 workers, Qdrant `1.18.2`, native multilingual BM25/RRF/Formula Query, Vitest, React/Next.js, next-intl, Playwright.

## Global Constraints

- This plan extends, and does not replace, `2026-07-10-self-hosted-qdrant-platform.md`.
- Documents are optional. The zero-document path must preserve current behavior and outputs.
- Every source document ID present at preflight start must have exactly one durable `assessed`, `degraded`, or `failed` evidence item.
- Documents advise the structure; they cannot silently remove baseline curriculum requirements.
- Critical and important document conflicts form a distinct required-answer block in manual mode.
- Automatic mode selects the recommended answer and appends a decision with `resolved_by: system` and `answer_source: system`.
- Evidence decisions are append-only. A later user override supersedes rather than edits history.
- Cross-package contracts are imported only from `@megacampus/shared-types`.
- Prompts, logs, metrics, Beads artifacts, and orchestration artifacts must not contain document bodies, claims, answers, or credentials.
- Qdrant queries always filter both `organization_id` and `course_id`.
- The feature rolls out behind `DOCUMENT_EVIDENCE_ENABLED`, first in shadow mode.
- Do not weaken RU/EN relevance, isolation, strict-mode, resume, or large-corpus tests.
- Task Q12, deploys, live reindex, secrets, and staging/prod mutation remain authorization-gated.

## Dependency and Parallel Schedule

| Task | Stream                              | Depends on             | Can run in parallel with        |
| ---- | ----------------------------------- | ---------------------- | ------------------------------- |
| E1   | contracts and persistence           | accepted Q1-Q5         | Q6 decision/research, Q7 repair |
| E2   | allocator and evidence preflight    | E1, accepted Q7        | Q6/Q8 infrastructure            |
| E3   | conflicts and decisions             | E1, E2                 | Q8/Q9 after their dependencies  |
| E4   | conflict UI                         | E3                     | E5 and E6                       |
| E5   | Stage 5 enrichment                  | E1, E3, accepted Q5/Q7 | E4 and E6                       |
| E6   | Stage 6 decision-aware retrieval    | E1, E3, accepted Q5/Q7 | E4 and E5                       |
| E7   | integration, docs, rollout evidence | E4, E5, E6, Q8, Q9     | none; shared acceptance gate    |

Each write-heavy stream uses a dedicated `codex/` branch/worktree and strict write zone. E4 must use the repository's Lazyweb UI workflow before implementation. Every stream receives independent correctness review before integration.

---

### Task E1: Canonical Evidence Contracts, Persistence, and Isolation

**Files:**

- Create: `packages/shared-types/src/document-evidence.ts`
- Modify: `packages/shared-types/src/clarifying-questions.ts`
- Modify: `packages/shared-types/src/analysis-schemas.ts`
- Modify: `packages/shared-types/src/index.ts`
- Create: `packages/shared-types/src/__tests__/document-evidence.test.ts`
- Create: `packages/course-gen-platform/supabase/migrations/20260711120000_document_evidence.sql`
- Create: `packages/course-gen-platform/supabase/migrations/rollback/20260711120000_document_evidence_rollback.sql`
- Create: `packages/course-gen-platform/tests/integration/document-evidence-rls.test.ts`
- Create: `packages/course-gen-platform/src/stages/stage4-analysis/evidence/repository.ts`
- Create: `packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/repository.test.ts`

**Interfaces:** Export the Zod schemas and inferred types from the approved design: source refs, claims, cards, conflicts, decisions, run summary, coverage status, authority scope, and processing mode. Extend the canonical clarifying category with `document_conflicts`, `AnswerSource` with `system`, and `AnalysisResultSchema` with a compact optional `document_evidence` snapshot.

- [ ] **Step 1: Write failing contract tests.** Pin valid cards, independent authority/quality, rejected duplicate source IDs, stable conflict shape, append-only decision references, `document_conflicts`, and `system` answer source.
- [ ] **Step 2: Run RED.**

  ```bash
  pnpm --filter @megacampus/shared-types test -- document-evidence
  pnpm --filter @megacampus/shared-types type-check
  ```

  Expected: FAIL because the new contracts and union members do not exist.

- [ ] **Step 3: Implement canonical Zod contracts and exports.** Keep full evidence out of `AnalysisResultSchema`; store only accepted run ID, totals, current decision IDs, enrichment status, and unresolved informational IDs.
- [ ] **Step 4: Write the migration and rollback.** Create tenant-scoped `document_evidence_runs`, `document_evidence_items`, immutable `document_evidence_conflicts`, and append-only `document_evidence_decisions`; add uniqueness, foreign keys, timestamps, status checks, and RLS based on course organization ownership. Prevent UPDATE/DELETE of decision rows through policy/trigger rules used elsewhere in this repository.
- [ ] **Step 5: Write RED repository/RLS tests.** Prove idempotent run reuse, exact `(run_id, document_id)` uniqueness, cross-tenant denial, service access, immutable conflict rows, append-only decisions, and latest-decision-chain resolution.
- [ ] **Step 6: Implement the repository.** Use typed inputs/outputs, transactions for run/item counts, conflict fingerprint upserts, and append-only decision insertion. Never log stored JSON bodies.
- [ ] **Step 7: Run GREEN.**

  ```bash
  pnpm --filter @megacampus/shared-types test -- document-evidence
  pnpm --filter @megacampus/shared-types type-check
  pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage4-analysis/evidence/repository.test.ts
  pnpm --filter @megacampus/course-gen-platform test:integration -- document-evidence-rls
  ```

- [ ] **Step 8: Commit and publish the branch.** Use `feat(evidence): add durable document evidence contracts`.

---

### Task E2: Large-Corpus Allocator and Stage 4 Evidence Preflight

**Files:**

- Modify: `packages/course-gen-platform/src/stages/stage4-analysis/phases/stage4-budget-allocator.ts`
- Modify: `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator.ts`
- Modify: `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-helpers.ts`
- Modify: `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-phase-helpers.ts`
- Create: `packages/course-gen-platform/src/stages/stage4-analysis/evidence/budget.ts`
- Create: `packages/course-gen-platform/src/stages/stage4-analysis/evidence/card-generator.ts`
- Create: `packages/course-gen-platform/src/stages/stage4-analysis/evidence/preflight.ts`
- Create: `packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/budget.test.ts`
- Create: `packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/preflight.test.ts`

**Interfaces:** `runDocumentEvidencePreflight()` consumes the Phase 1 classification plus recoverable document metadata/summaries and produces an accepted run ID, complete coverage totals, validated cards, and candidate conflicts. `allocateEvidenceBudget()` returns deterministic batches and modes under the effective budget.

- [ ] **Step 1: Write allocator RED tests.** Cover zero docs, one small doc, oversized `CORE`, mixed priorities, missing full text/summary, invalid token metadata, reserve subtraction, and a deterministic 1,000-document fixture. Assert `allocated + promptReserve + outputReserve <= min(modelContext, 700000)`.
- [ ] **Step 2: Run RED.**

  ```bash
  pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage4-analysis/evidence/budget.test.ts
  ```

- [ ] **Step 3: Implement progressive allocation.** Small `CORE` may be full; oversized `CORE` becomes hierarchical summary plus selected passages; important docs use validated summaries and retrieval; supplementary docs always retain evidence-card coverage. No caller may independently truncate the allocated result.
- [ ] **Step 4: Write preflight RED tests.** Prove complete set equality, deterministic batch/reduce convergence, checkpoint/resume without duplicates, changed fingerprint invalidation, bounded retries, explicit degraded/failed items, and zero-document no-op.
- [ ] **Step 5: Implement card generation and preflight.** Reuse valid Stage 3 summaries when their version hash matches; otherwise generate versioned cards in token-bounded map/reduce batches. Query Qdrant only for targeted source verification, with organization/course filters and grouping.
- [ ] **Step 6: Wire the preflight after Phase 1 and before Phase 0.5.** Guard with `DOCUMENT_EVIDENCE_ENABLED`; shadow mode persists evidence but cannot alter downstream answers. Preserve exact current output for zero documents and disabled flag.
- [ ] **Step 7: Run GREEN and package type-check.**

  ```bash
  pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage4-analysis/evidence/budget.test.ts tests/unit/stages/stage4-analysis/evidence/preflight.test.ts
  pnpm --filter @megacampus/course-gen-platform type-check
  ```

- [ ] **Step 8: Commit and publish.** Use `feat(stage4): add complete document evidence preflight`.

---

### Task E3: Conflict Detection, Required Questions, and Automatic Decisions

**Files:**

- Create: `packages/course-gen-platform/src/stages/stage4-analysis/evidence/conflict-detector.ts`
- Create: `packages/course-gen-platform/src/stages/stage4-analysis/evidence/decision-service.ts`
- Modify: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying/prompts.ts`
- Modify: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying/types.ts`
- Modify: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying/utils.ts`
- Modify: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts`
- Modify: `packages/course-gen-platform/src/server/routers/clarifying-helpers.ts`
- Modify: `packages/course-gen-platform/src/server/routers/clarifying-approval-helpers.ts`
- Modify: `packages/course-gen-platform/src/server/routers/clarifying.router.ts`
- Create: `packages/course-gen-platform/supabase/migrations/20260711130000_document_conflict_auto_answers.sql`
- Create: `packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/conflict-detector.test.ts`
- Create: `packages/course-gen-platform/tests/unit/stages/stage4-analysis/evidence/decision-service.test.ts`

**Interfaces:** Candidate conflicts reduce to stable fingerprints and validated sides/source refs. Critical and important conflicts create required questions. Informational conflicts persist without blocking. Automatic answers and evidence decisions are committed atomically.

- [ ] **Step 1: Write RED conflict tests.** Include RU/EN, stable fingerprints across retry/order changes, authority-vs-quality independence, precise source refs, duplicate suppression, informational non-blocking behavior, and no false conflict for compatible wording.
- [ ] **Step 2: Implement bounded claim comparison and reduction.** Store model/version and fingerprints; perform targeted Qdrant verification for material claims; escape and bound UI excerpts.
- [ ] **Step 3: Write RED decision tests.** Manual mode must pause while required conflict questions are pending. Automatic mode must choose the recommendation and atomically persist question answer plus `resolved_by: system`, `answer_source: system`, selected value/index, rationale, run/conflict IDs, and timestamp. Resume must not duplicate decisions.
- [ ] **Step 4: Extend Phase 0.5 and the automatic-answer RPC.** Keep ordinary questions and conflict questions in one durable workflow but distinct categories. A later user override appends a superseding decision.
- [ ] **Step 5: Implement degraded-document choices.** Manual: retry, continue limited, remove document. Automatic: bounded retry then persist recommended `continue limited` system decision.
- [ ] **Step 6: Run GREEN.**

  ```bash
  pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage4-analysis/evidence/conflict-detector.test.ts tests/unit/stages/stage4-analysis/evidence/decision-service.test.ts tests/unit/stages/stage4-analysis/phase-0.5-clarifying.test.ts
  pnpm --filter @megacampus/course-gen-platform type-check
  ```

- [ ] **Step 7: Commit and publish.** Use `feat(stage4): resolve document conflicts explicitly`.

---

### Task E4: Separate Document-Conflict Block in the Clarifying UI

**Files:**

- Modify: `packages/web/components/generation-graph/panels/clarifying/ClarifyingPanel.tsx`
- Modify: `packages/web/components/generation-graph/panels/clarifying/QuestionCard.tsx`
- Modify: `packages/web/components/generation-graph/panels/clarifying/types.ts`
- Modify: `packages/web/components/generation-graph/panels/clarifying/wizard/WizardSidebar.tsx`
- Modify: `packages/web/components/generation-graph/panels/clarifying/wizard/WizardProgress.tsx`
- Modify: `packages/web/messages/en/generation.json`
- Modify: `packages/web/messages/ru/generation.json`
- Create/modify: adjacent clarifying panel component tests and Playwright coverage discovered by `rg`.

- [ ] **Step 1: Run the required Lazyweb UI workflow.** Capture the current clarifying screen, run one quick search for a desktop conflict-resolution pattern, generate/open the report, and record only the chosen evidence in the task artifact. Do not leak source text to an external service; use synthetic fixture content.
- [ ] **Step 2: Write RED component tests.** Assert a distinct `Document conflicts` / `Противоречия в документах` block, required badge, source names/page or section references, impact, recommendation/rationale, alternatives, accessible radio semantics, keyboard navigation, and blocking submission while a required conflict is unanswered.
- [ ] **Step 3: Implement the block without changing the backend pause boundary.** Ordinary questions stay separate. Informational differences are visibly non-blocking when shown. Automatic answers display as system decisions and are not presented as user selections.
- [ ] **Step 4: Add RU/EN messages and responsive states.** Escape excerpts, truncate visually with an accessible expansion control, and preserve mobile/wizard progress behavior.
- [ ] **Step 5: Run focused tests, type-check, and browser verification.**

  ```bash
  pnpm --filter @megacampus/web test -- clarifying
  pnpm --filter @megacampus/web type-check
  ```

  Use the Playwright skill for manual-mode required blocking, automatic system-decision display, RU/EN, keyboard, and mobile viewport evidence.

- [ ] **Step 6: Commit and publish.** Use `feat(web): surface required document conflicts`.

---

### Task E5: Live Stage 5 Advisory Enrichment and Document Grouping

**Files:**

- Create: `packages/course-gen-platform/src/stages/stage5-generation/evidence/advisory-enrichment.ts`
- Create: `packages/course-gen-platform/src/stages/stage5-generation/evidence/types.ts`
- Modify: `packages/course-gen-platform/src/stages/stage5-generation/phases/generation-phases.ts`
- Modify: `packages/course-gen-platform/src/stages/stage5-generation/generate-sections.ts`
- Modify: `packages/course-gen-platform/src/stages/stage5-generation/phase3-v2-spec-generator.ts`
- Modify only if reused: `packages/course-gen-platform/src/stages/stage5-generation/utils/qdrant-search.ts`
- Create: `packages/course-gen-platform/tests/unit/stages/stage5-generation/advisory-enrichment.test.ts`

**Interfaces:** The live Stage 5 path first validates its normal baseline, then calls `enrichBaselineWithDocumentEvidence()`. The result includes `not_applicable | applied | no_relevant_evidence | degraded | failed_open_with_decision`, accepted decision IDs, bounded evidence refs, and search queries.

- [ ] **Step 1: Write RED tests.** Prove no-document and no-relevant-evidence baselines are byte-equivalent, accepted evidence may add terminology/examples/constraints, enrichment cannot remove required baseline topics, decision conflicts are honored, size rules are revalidated, and Qdrant outage follows the persisted decision rather than silently pretending success.
- [ ] **Step 2: Implement the two-pass workflow.** Do not make dormant helpers the integration point. Retrieve per accepted section only after baseline validation; filter tenant/course; set `group_by_document: true`, `group_size: 2`; attach bounded provenance.
- [ ] **Step 3: Add deterministic merge validation.** Reject destructive patches and retry once with explicit violations; then record `degraded` or `failed_open_with_decision` according to the accepted decision.
- [ ] **Step 4: Run focused Stage 5 and pinned retrieval tests.**

  ```bash
  pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage5-generation/advisory-enrichment.test.ts tests/unit/stages/stage5-generation/qdrant-search.test.ts tests/unit/shared/qdrant/search-operations.test.ts
  pnpm --filter @megacampus/course-gen-platform type-check
  ```

- [ ] **Step 5: Commit and publish.** Use `feat(stage5): enrich baseline with advisory evidence`.

---

### Task E6: Decision-Aware Stage 6 Retrieval

**Files:**

- Modify: `packages/course-gen-platform/src/stages/stage6-lesson-content/rag/retriever.ts`
- Modify: `packages/course-gen-platform/src/stages/stage6-lesson-content/rag/caching.ts`
- Modify: `packages/course-gen-platform/src/stages/stage6-lesson-content/services/job-processor.ts`
- Modify: `packages/course-gen-platform/tests/unit/stages/stage6/rag/lesson-rag-retriever.test.ts`
- Modify: `packages/course-gen-platform/tests/unit/stages/stage6/rag/two-tier-retrieval.test.ts`

- [ ] **Step 1: Write RED tests.** Assert accepted decisions and evidence refs enter query planning/cache identity; rejected conflict sides are not injected; queries filter tenant/course and group by document with size 2; no-document path remains optional; required-evidence outage follows the existing retry/error policy; cross-tenant refs are rejected.
- [ ] **Step 2: Implement decision-aware retrieval in the production-reachable retriever.** Do not count exported-but-unused caching/helpers as live integration. Preserve Formula priority and native BM25/RRF.
- [ ] **Step 3: Propagate bounded evidence provenance into lesson generation.** Keep source refs structured; do not put raw decision history or unrelated cards into prompts.
- [ ] **Step 4: Run focused and pinned tests.**

  ```bash
  pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage6/rag/lesson-rag-retriever.test.ts tests/unit/stages/stage6/rag/two-tier-retrieval.test.ts tests/unit/shared/qdrant/search-operations.test.ts
  pnpm --filter @megacampus/course-gen-platform type-check
  ```

- [ ] **Step 5: Commit and publish.** Use `feat(stage6): honor document evidence decisions`.

---

### Task E7: Cross-Stage Acceptance, Observability, Documentation, and Rollout

**Files:**

- Modify: Q9 metrics/alerts/dashboard files from the parent plan.
- Modify: Stage 4/5/6 durable documentation discovered through `.codex/project-index.md`.
- Modify: `.codex/project-index.md`
- Create/update: `.codex/stages/mc2-jz6y0/artifacts/document-evidence-acceptance.md`
- Update: `.codex/stages/mc2-jz6y0/summary.md`
- Update: `.codex/handoff.md`

- [ ] **Step 1: Add privacy-safe metrics and alerts.** Cover run status, coverage below 100%, mode counts, tokens/cost/duration, conflict severity, user/system decisions, repeated degraded automatic decisions, stale critical conflicts, Stage 5 enrichment outcomes, and Stage 5/6 fallback rates. No document or answer content in labels/logs.
- [ ] **Step 2: Add integration scenarios.** Test zero documents, small relevant docs, irrelevant docs, oversized `CORE`, 1,000 documents, mid-run resume, RU/EN conflict rendering, manual pause, automatic system decision, Stage 5 Qdrant unavailable, and Stage 6 cross-tenant isolation.
- [ ] **Step 3: Run the full evidence gate.**

  ```bash
  pnpm --filter @megacampus/shared-types test
  pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage4-analysis tests/unit/stages/stage5-generation tests/unit/stages/stage6 tests/unit/shared/qdrant
  pnpm --filter @megacampus/web test -- clarifying
  ```

- [ ] **Step 4: Run the pinned Qdrant `1.18.2` integration and database isolation tests.** Record exact commands, versions, totals, fixture counts, collection state, and cleanup in the artifact. Do not weaken failed relevance or isolation expectations.
- [ ] **Step 5: Run repository release-confidence gates.**

  ```bash
  pnpm type-check
  pnpm build
  scripts/orchestration/run_process_verification.sh
  ```

- [ ] **Step 6: Complete docs and graph review.** Document optional documents, trust/precedence, full coverage, conflict decisions, large-corpus operations, rollout flags, degraded recovery, live Stage 5/6 entrypoints, and rollback. Run `graphify update .` and `graphify cluster-only . --no-viz` when worktree ownership is safe.
- [ ] **Step 7: Review rollout evidence.** Shadow mode precedes conflict activation; manual mode precedes automatic system decisions; Stage 5 enrichment uses a bounded cohort. Record accepted thresholds for coverage, cost, latency, false conflicts, degradation, and enrichment quality. Rollback disables the flags but retains audit rows.
- [ ] **Step 8: Run canonical stage closeout, commit, and push.** E7 must be accepted before parent Q10/Q11 close. Stop and ask before Q12 remote actions.

---

## Completion Definition

The expansion is complete only when E1-E7 are reviewed, integrated, committed, and pushed; all source documents receive a durable outcome; manual conflicts stop at the existing questions boundary; automatic choices are auditable system decisions; Stage 5 enrichment is live and non-destructive; Stage 6 honors the same decisions; no-document and large-corpus gates pass; and parent Q11 acceptance includes this evidence. Staging remains untouched until explicit current-task authorization.
