# Implementation Plan: Stage 4-6 Course Generation Pipeline

**Branch**: `010-stages-456-pipeline` | **Date**: 2025-11-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature spec from `/specs/010-stages-456-pipeline/spec.md`

**Note**: Template filled by `/speckit.plan` command.

## Summary

Implement three-stage course generation pipeline (Stage 4 Analysis → Stage 5 Generation → Stage 6 Lesson Content) with Document Prioritization, RAG Planning, Semantic Scaffolding (V2 schema), and parallel lesson content generation using Hybrid Map-Reduce-Refine architecture via LangGraph.

**Key Technical Decisions** (from research):
- **Stage 6 Architecture**: Hybrid Map-Reduce-Refine via LangGraph (NOT Skeleton-of-Thought — 40% coherence degradation)
- **Parallelization**: BullMQ workers (30 concurrent) + LangGraph state machine
- **Models**: Language-aware routing (RU: Qwen3-235B, EN: DeepSeek Terminus, Fallback: Kimi K2)
- **Schema**: LessonSpecification V2 (Semantic Scaffolding) — no V1 backward compatibility needed

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**:
- LangGraph + LangChain (v1.0.0) for Stage 6 orchestration
- BullMQ (v5.1.0) for parallel job processing
- Qdrant JS Client (v1.9.0) for RAG retrieval
- OpenAI SDK (v6.7.0) via OpenRouter for LLM access
- Supabase JS (v2.39.0) for database operations
- Zod (v3.22.4) for schema validation
- Pino (v9.6.0) for structured logging

**Storage**:
- PostgreSQL (Supabase) for course data, job tracking
- Qdrant for vector embeddings (RAG)
- Redis (ioredis v5.8.2) for BullMQ job queues

**Testing**: Vitest (v4.0.12) — unit, contract, integration tests

**Target Platform**: Node.js 20+ server (Linux), Supabase cloud

**Project Type**: Monorepo — `packages/course-gen-platform/` (backend), `packages/shared-types/` (types)

**Performance Goals**:
- Lesson generation: <2 minutes per lesson (55s target, 65s buffer)
- Section-level RAG: 20-30 chunks per section
- Lesson-level RAG: 5-10 chunks per lesson
- Parallel execution: 10-30 lessons simultaneously

**Constraints**:
- Cost: $0.20-$0.50 per course (all stages)
- Quality threshold: 0.75 minimum
- Minimum 10 lessons per course
- XSS sanitization mandatory

**Scale/Scope**:
- 95%+ end-to-end success rate target
- Production-grade resilience (8/10 score)
- Language-aware routing (RU/EN)

## Constitution Check

*GATE: Must pass before Phase 0. Re-check after Phase 1.*

### Pre-Phase 0 Check ✅ ALL GATES PASSED

### I. Context-First Development ✅ PASS
- Existing stages (1-5) reviewed and understood
- Research documents analyzed (Stage 6 Strategy, Model Selection)
- Architecture document fully integrated into spec
- Codebase patterns identified (orchestrator.ts, phases/, handlers)

### II. Agent-Based Orchestration ✅ PASS
- Stage 6 implements LangGraph state machine for orchestration
- BullMQ workers handle parallel lesson generation
- Clear separation: Planner → Expanders → Assembler → Smoother

### III. Test-Driven Development ⚠️ CONDITIONAL
- Tests required per spec (FR-* have testable acceptance criteria)
- Will implement tests alongside code per atomic task principle

### IV. Atomic Task Execution ✅ PASS
- Tasks will be generated in Phase 2 (`/speckit.tasks`)
- Each task independently completable and committable
- `/push patch` after each task completion

### V. User Story Independence ✅ PASS
- 6 user stories defined with P1-P3 priorities
- Foundation phase (Document Prioritization) completes before user stories
- Each story has independent acceptance tests

### VI. Quality Gates ✅ PASS (NON-NEGOTIABLE)
- Type-check required before commit
- Build verification required
- No hardcoded credentials (use environment variables)
- XSS sanitization (DOMPurify already in dependencies)

### VII. Progressive Specification ✅ PASS
- Phase 0 (Spec): ✅ Complete (`spec.md` with 38 FRs, 10 SCs)
- Phase 1 (Plan): ✅ Complete (this document)
- Phase 2 (Tasks): Pending (`/speckit.tasks`)
- Phase 3 (Implementation): Pending

### Post-Phase 1 Re-Check ✅ ALL GATES PASSED

| Principle | Pre-Phase 0 | Post-Phase 1 | Notes |
|-----------|-------------|--------------|-------|
| I. Context-First | ✅ | ✅ | Full codebase analysis done |
| II. Agent Orchestration | ✅ | ✅ | LangGraph + BullMQ designed |
| III. TDD | ⚠️ Conditional | ⚠️ Conditional | Tests alongside implementation |
| IV. Atomic Tasks | ✅ | ✅ | Ready for `/speckit.tasks` |
| V. User Story Independence | ✅ | ✅ | 6 stories, P1-P3 prioritized |
| VI. Quality Gates | ✅ | ✅ | Type-check, build, XSS sanitization |
| VII. Progressive Spec | ✅ | ✅ | Phase 1 complete |

**Conclusion**: Design phase complete. Ready for Phase 2 (task generation).

## Project Structure

### Documentation (this feature)

```text
specs/010-stages-456-pipeline/
├── plan.md          # This file
├── research.md      # Phase 0 output (minimal — research already completed)
├── data-model.md    # Phase 1 output
├── quickstart.md    # Phase 1 output
├── contracts/       # Phase 1 output (tRPC procedure definitions)
└── tasks.md         # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/course-gen-platform/
├── src/
│   ├── stages/
│   │   ├── stage1-document-upload/     # Existing
│   │   ├── stage2-document-processing/ # Enhancement: Document Prioritization
│   │   │   ├── orchestrator.ts
│   │   │   ├── handler.ts
│   │   │   └── phases/
│   │   │       └── phase-classification.ts  # NEW
│   │   ├── stage3-summarization/       # Enhancement: Budget Allocation
│   │   │   ├── orchestrator.ts
│   │   │   └── phases/
│   │   │       └── budget-allocator.ts      # NEW
│   │   ├── stage4-analysis/            # Enhancement: Phase 6 RAG Planning
│   │   │   ├── orchestrator.ts
│   │   │   ├── handler.ts
│   │   │   └── phases/
│   │   │       ├── phase-1-classifier.ts
│   │   │       ├── phase-2-scope.ts
│   │   │       ├── phase-3-expert.ts
│   │   │       ├── phase-4-synthesis.ts
│   │   │       ├── phase-5-assembly.ts
│   │   │       └── phase-6-rag-planning.ts  # EXISTS (enhance)
│   │   ├── stage5-generation/          # Enhancement: V2 Schema + RAG
│   │   │   ├── orchestrator.ts
│   │   │   ├── handler.ts
│   │   │   ├── phases/
│   │   │   ├── utils/
│   │   │   │   ├── section-batch-generator.ts  # Enhance: V2 output
│   │   │   │   ├── semantic-scaffolding.ts     # NEW
│   │   │   │   └── qdrant-search.ts            # EXISTS
│   │   │   └── validators/
│   │   └── stage6-lesson-content/      # NEW STAGE
│   │       ├── orchestrator.ts         # LangGraph state machine
│   │       ├── handler.ts              # BullMQ job handler
│   │       ├── README.md
│   │       ├── nodes/
│   │       │   ├── planner.ts          # Outline generation
│   │       │   ├── expander.ts         # Parallel section expansion
│   │       │   ├── assembler.ts        # Content assembly
│   │       │   └── smoother.ts         # Transition refinement
│   │       ├── utils/
│   │       │   ├── prompt-templates.ts
│   │       │   ├── parameter-selector.ts
│   │       │   ├── markdown-parser.ts
│   │       │   └── citation-builder.ts
│   │       └── validators/
│   │           ├── content-validator.ts
│   │           └── xss-sanitizer.ts
│   ├── shared/
│   │   ├── llm/
│   │   │   ├── openrouter-client.ts    # EXISTS
│   │   │   └── llm-parameters.ts       # NEW: Dynamic temperature config
│   │   ├── qdrant/
│   │   │   └── qdrant-client.ts        # EXISTS
│   │   └── logging/
│   │       └── pino-logger.ts          # EXISTS
│   └── orchestrator/
│       └── worker.ts                   # EXISTS (enhance for Stage 6 jobs)

packages/shared-types/
├── src/
│   ├── analysis-result.ts              # Enhance: document_relevance_mapping
│   ├── generation-result.ts            # Enhance: V2 LessonSpecification
│   ├── lesson-content.ts               # NEW: Stage 6 output types
│   ├── lesson-specification-v2.ts      # NEW: Semantic Scaffolding schema
│   ├── document-prioritization.ts      # NEW: Classification types
│   └── bullmq-jobs.ts                  # Enhance: Stage 6 job types

tests/
├── unit/
│   ├── stages/
│   │   ├── stage2/                     # NEW tests
│   │   ├── stage3/                     # NEW tests
│   │   ├── stage4/                     # Enhance tests
│   │   ├── stage5/                     # Enhance tests
│   │   └── stage6/                     # NEW tests
│   └── shared/
├── contract/
│   └── schemas/                        # Zod schema contract tests
└── integration/
    └── stage-pipeline/                 # E2E pipeline tests
```

**Structure Decision**: Monorepo with unified stage pattern. Stage 6 follows existing stage structure with LangGraph orchestration instead of simple sequential phases.

## Implementation Priorities (from Architecture Spec)

Based on `docs/architecture/STAGE4-STAGE5-STAGE6-FINAL-ARCHITECTURE.md`:

### Priority 0: Stage 5 → Stage 6 Interface Refactoring (BLOCKING)

**Duration**: 2-3 days

**Tasks**:
1. Update `LessonSpecification` schema in `packages/shared-types/src/generation-result.ts`
   - Replace `hook: string` with `hook_strategy` + `hook_topic`
   - Replace `word_count: number` with `depth: enum`
   - Add `content_archetype` field
   - Add `rag_context_id` (replace `rag_query`)
   - Structured `rubric_criteria`
2. Update Stage 5 Phase 3 (generate_sections) to produce V2 schema
3. Update all TypeScript interfaces and Zod schemas

> **Note**: V1→V2 transformation utility removed — no legacy courses exist (see spec.md clarifications).

**Deliverables**:
- `packages/shared-types/src/lesson-specification-v2.ts`

### Priority 1: Document Prioritization (Stage 2+3) - FOUNDATION

**Duration**: 3-4 days

**Tasks**:
1. Implement LLM-based document classification
2. Implement budget allocation logic
3. Integrate into document processing pipeline
4. Update vectorization to use originals (not summaries)
5. Test with diverse document sets

### Priority 2: Analyze Phase 6 (RAG Planning)

**Duration**: 1-2 days

**Tasks**:
1. Implement Phase 6 in analysis orchestrator
2. Create document-to-section mapping logic
3. Generate search queries from section objectives
4. Mark confidence levels (high/medium)
5. Update AnalysisResult schema

### Priority 3: Generation RAG Integration + Semantic Scaffolding

**Duration**: 3-4 days

**Tasks**:
1. Implement section-level RAG retrieval
2. Update Phase 3 to generate V2 LessonSpecification
   - Implement `hook_strategy` detection
   - Implement `depth` calculation
   - Add `content_archetype` inference
3. Execute RAG queries during Phase 3, store results
   - Create `rag_context_cache` in database
   - Link via `rag_context_id`

### Priority 4: Stage 6 Prompt Template + Dynamic Temperature

**Duration**: 2-3 days

**Tasks**:
1. Create Context-First XML prompt template
2. Implement dynamic temperature selection (content_archetype → params)
3. Markdown output parser (not JSON)
4. INSUFFICIENT_CONTEXT refusal logic

### Priority 5: LLM Parameters Implementation

**Duration**: 2 days

**Tasks**:
1. Integrate research results into parameter selector
2. Update all stages (2, 3, 4, 5, 6) with optimal parameters
3. LLM Judge with 3x voting

### Priority 6: Additional Optimization (DEFERRED)

**Duration**: 3-4 days (deferred to Phase 2 optimization)

**Tasks**: (Only if quality issues emerge with current Hybrid Map-Reduce-Refine approach)
1. Fine-tune Planner → Expander → Assembler → Smoother parameters
2. A/B test alternative parallel strategies
3. Additional smoothing passes if needed

> **Note**: Skeleton-of-Thought explicitly rejected (40% coherence degradation). Current architecture uses Hybrid Map-Reduce-Refine via LangGraph.

---

## Gradual Rollout Plan

**Week 1**: Document Prioritization (Stage 2+3)
- Deploy to TRIAL tier
- Monitor classification accuracy
- Validate cost savings

**Week 2**: Analyze Phase 6 (RAG Planning)
- Deploy to TRIAL + FREE tiers
- Monitor RAG plan quality
- A/B test: with RAG plan vs without

**Week 3**: Generation RAG Integration
- Deploy to all tiers
- Monitor retrieval quality
- Track success rates

**Week 4+**: Stage 6 Implementation
- Parallel development
- Internal testing
- Gradual rollout

---

## Complexity Tracking

> No Constitution violations requiring justification. All principles pass.

| Violation | Why Needed | Simpler Alternative Rejected |
|-----------|------------|------------------------------|
| N/A | — | — |
