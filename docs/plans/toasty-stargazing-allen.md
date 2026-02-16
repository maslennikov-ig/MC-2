# Plan: Fix Module Duplication in Course Generation (JAM-6506)

## Context

Course JAM-6506 ("Как стать счастливым") has 10 modules where Module 2 ("Хронотипы и биоритмы") and Module 7 ("Нейро-лидерство: управление биоритмами") are nearly identical. Modules 4 and 9 also overlap (both about "поток"/flow).

Investigation revealed **5 root causes** spanning Stage 4 and Stage 5.

## Root Causes Found

### 1. Stage 4 Phase 2 gets NO document content

`buildDocumentsContext()` (phase-2-scope.ts:190) outputs only `"Available Documents: N documents"` — the count, not content. Phase 2 generates `sections_breakdown` purely from Phase 1 key_concepts + model knowledge. This was never broken — it was like this since the initial commit.

### 2. Budget Allocator is disconnected from phases

`stage4-budget-allocator.ts` calculates CORE/IMPORTANT/SUPPLEMENTARY priorities and full_text/summary modes, but:

- No phase reads the allocator's per-document decisions
- `fetchDocumentSummaries` (handler-helpers.ts:323) only loads `processed_content`, never `markdown_content`
- Budget Allocator only drives model tier selection (standard vs extended)

### 3. Three unlinked model selection systems

- `STAGE4_MODELS` (model-selector.ts:664): `qwen/qwen3-235b-a22b-2507` — used only by Budget Allocator
- `getModelForPhase` (phases): reads from DB → bunker → hardcoded
- `model-config-db.ts:461`: `xiaomi/mimo-v2-flash` for all Stage 4 phases
- Result: Budget Allocator selects Qwen3, phases use Xiaomi MiMo

### 4. ~~Stage 5 blind parallel generation~~ PARTIALLY FIXED

~~`SECTIONS_PER_BATCH = 1`, `p-limit(4)`. Each section generated independently. No cross-section context of what was actually generated.~~
**Fix**: Post-generation overlap retry loop detects and regenerates overlapping sections with concrete feedback about other sections' lesson titles. Parallel generation retained for speed, overlap caught after. See mc2-43fe above.

### 5. ~~Stage 5 overlap detection is non-blocking~~ FIXED

~~`detectOverlap()` (orchestrator-helpers.ts:280) logs WARNING but never fails generation. Threshold 0.85 too high. `logDuplicateKeyTopics()` in phase-2-scope.ts:457 is dead code (never called).~~
**Fix**: Overlap retry loop added (STEP 4.5 in orchestrator). Threshold lowered to 0.75. `logDuplicateKeyTopics` removed. See mc2-43fe above.

## Beads Tasks Created

| ID           | Task                                                                              | Priority |
| ------------ | --------------------------------------------------------------------------------- | -------- |
| **mc2-1fsg** | Stage 4: Budget Allocator + document loading + model unification + prompt caching | P1       |
| **mc2-far0** | Stage 4 Phase 2: Semantic overlap detection + blocking regeneration               | P1       |
| **mc2-43fe** | Stage 5: Anti-duplication — single-call or batched-with-context                   | P1       |
| **mc2-87nt** | Research: RAG coverage — documents vs model knowledge                             | P2       |

## Completion Status (updated 2026-02-15)

### DONE: mc2-far0 — Phase 2 Semantic Overlap Detection

- `detectSectionBreakdownOverlap()` added to `phase-2-scope-helpers.ts` — delegates to unified `QualityValidator.detectOverlapFromTexts()`
- `buildOverlapFeedback()` generates actionable LLM prompt for retry
- Phase 2 in `phase-2-scope.ts` wraps generation in retry loop (max 2 retries with feedback)
- `OVERLAP_THRESHOLDS.stage4 = 0.80` (0.75 for Russian after -0.05 adjustment)
- `logDuplicateKeyTopics()` removed as dead code (replaced by semantic detection)
- Batch embeddings via `generateEmbeddings()` (1 API call per detection)

### DONE: mc2-43fe — Stage 5 Anti-Duplication

- **Approach chosen: D — Post-generation overlap retry with targeted regeneration** (not single-call)
- `retryOverlappingSections()` in `orchestrator.ts` — runs after quality gate (STEP 4.5)
- `buildSectionOverlapFeedback()` in `orchestrator-helpers.ts` — builds per-section feedback with concrete lesson titles from overlapping sections
- `regenerateSingleSection()` in `generation-phases.ts` — calls `SectionBatchGenerator.generateBatch()` with `overlapFeedback` parameter
- `overlapFeedback` threaded through: `generation-phases.ts` → `section-batch-generator.ts` → `generator-core.ts` → `prompt-builder.ts`
- `OVERLAP_THRESHOLDS.stage5 = 0.75` (0.70 for Russian)
- **Non-blocking**: max 2 retries, then proceeds with warning (never fails pipeline)
- Sequential regeneration (later sections benefit from earlier regenerations)
- `detectOverlap()` exported from `orchestrator-helpers.ts` for reuse
- Root cause #5 fixed: overlap detection is now actionable (retry loop), threshold lowered from 0.85

### DONE: Tests (23 tests total)

- `tests/unit/shared/validation/overlap-detection.test.ts` — 18 unit tests (core method, Stage 4 wrapper, Stage 4 feedback, Stage 5 feedback)
- `tests/unit/stages/overlap-retry-flow.test.ts` — 5 end-to-end flow tests (Stage 4 full cycle, Stage 5 full cycle via GenerationPhases, max retries exhausted, similarity percentage, cross-stage consistency)

### TODO: mc2-1fsg — Stage 4 Budget Allocator & Documents (root causes #1, #2, #3)

### TODO: mc2-87nt — RAG Coverage Research (P2)

## Execution Order

### Task 1: mc2-1fsg — Stage 4 Budget Allocator & Documents

**A. Model unification**

- RU standard: `xiaomi/mimo-v2-flash` (262K)
- RU extended: `google/gemini-3-flash-preview` (1M)
- EN all: `x-ai/grok-4.1-fast`
- Read from `llm_model_config` DB table, remove hardcoded `STAGE4_MODELS`
- Check if Admin UI exists for llm_model_config (currently: NO UI, SQL only)

**B. Wire Budget Allocator to phases**

- `fetchDocumentSummaries` → also load `markdown_content` for CORE documents
- Pass allocator decisions to each phase
- Phases use full_text for CORE, summary for SUPPLEMENTARY

**C. Document budget per phase**
| Phase | Current | Target |
|---|---|---|
| 0.5 Clarifying | 4K total | Budget Allocator decision (need to discuss) |
| 1 Classification | 25K total | Budget Allocator decision |
| 2 Scope | **0 (count only)** | **Budget Allocator decision (CRITICAL fix)** |
| 3 Expert | 25K total | Budget Allocator decision |
| 4 Synthesis | 25K total | Budget Allocator decision |

**D. Verify Phase 0.5** — are clarifying questions smart about document gaps?

**E. OpenRouter prompt caching** — research if cache hint is safe when provider doesn't support it

**F. Update docs** — llm-model-config.md

**Files:**

- `stages/stage4-analysis/phases/stage4-budget-allocator.ts`
- `stages/stage4-analysis/handler-helpers.ts:321` (fetchDocumentSummaries)
- `stages/stage4-analysis/orchestrator-phase-helpers.ts` (phase data mapping)
- `stages/stage4-analysis/phases/phase-2-scope.ts:190` (buildDocumentsContext)
- `stages/stage4-analysis/phases/phase-0.5-clarifying.ts:305` (buildCondensedContext)
- `shared/llm/model-selector.ts:664` (STAGE4_MODELS — remove)
- `shared/llm/model-config-db.ts:461` (hardcoded defaults)

---

### Task 2: mc2-far0 — Phase 2 Semantic Overlap Detection

After Phase 2 generates sections_breakdown:

1. Concatenate per section: `area + key_topics + learning_objectives`
2. Generate Jina-v3 embeddings (batch)
3. Pairwise cosine similarity
4. If overlap > threshold → regenerate with merge instructions (max 2 retries)
5. Wire up or replace `logDuplicateKeyTopics()`

**Reuse:** `QualityValidator.cosineSimilarity()`, `generateEmbedding()`, `concatenateSectionFields()`

**Files:**

- `stages/stage4-analysis/phases/phase-2-scope-helpers.ts` (add detectSectionBreakdownOverlap)
- `stages/stage4-analysis/phases/phase-2-scope.ts` (wrap in retry loop)
- `shared/validation/quality-validator.ts` (reuse embeddings)

---

### Task 3: mc2-43fe — Stage 5 Anti-Duplication

**Phase 1: Tests first**

- Integration test with JAM-6506 real data (overlap detection)
- Single-call generation experiment (10 sections in one call)
- Measure: tokens, parse success, overlap scores, quality degradation

**Phase 2: Implement chosen approach**
Options (decide after tests):

- A: Single-call (like Stage 6 fix)
- B: Batched-with-context (3 sections at a time, with summary of previous)
- C: Sequential with accumulation

**Phase 3: Make overlap detection blocking**

- Lower threshold from 0.85 to ~0.75-0.80
- `detectOverlap()` → fail generation if overlap detected

**Token budget (single-call):**

- Input: ~5K prompt + ~15K RAG + ~2K specs = ~22K
- Output: ~15K (10 sections × ~1,500 tokens)
- Total: ~37K — fits in 128K

**Files:**

- `stages/stage5-generation/phases/generation-phases.ts`
- `stages/stage5-generation/utils/section-batch/prompt-builder.ts`
- `stages/stage5-generation/utils/section-batch/constants.ts`
- `stages/stage5-generation/orchestrator-helpers.ts`
- `shared/validation/quality-validator.ts`

---

### Task 4: mc2-87nt — RAG Coverage Research (P2)

Research questions:

1. How do courses form when document coverage is weak?
2. Can `document_relevance_mapping` be filled via Qdrant similarity (not LLM)?
3. Should Stage 5 skip RAG for sections without document coverage?
4. Does Stage 6 need to know document vs model knowledge source?

---

## Verification

```bash
# Type-check
pnpm type-check

# Build
pnpm build

# Existing tests
pnpm --filter course-gen-platform test

# Integration tests (new)
pnpm --filter course-gen-platform test tests/integration/section-overlap-detection.test.ts
pnpm --filter course-gen-platform test tests/integration/single-call-generation.test.ts
```

### Success criteria

- JAM-6506 sections 2 & 7 detected as overlapping by Phase 2 detection
- Phase 2 receives actual document content (not just count)
- Budget Allocator decisions enforced in all phases
- Single model selection system (DB-driven)
- Stage 5 single-call or batched generation produces non-overlapping sections
- Stage 5 overlap detection is blocking (fails on detected overlap)
- Type-check, build, and existing tests pass
