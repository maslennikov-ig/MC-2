# E2E Testing Tasks: Stage 2-6 Full Pipeline

**Purpose**: Comprehensive E2E testing for all implemented stages (2-6) including new features from spec 010

**Base Reference**: T053 from spec 008 (`tests/e2e/t053-synergy-sales-course.test.ts`)

**Current E2E Tests**:
- `t053-synergy-sales-course.test.ts` - Stage 5 generation (4 scenarios)
- `t055-full-pipeline.test.ts` - Stage 2-4 pipeline
- `stage3-real-documents.test.ts` - Stage 3 only

**Gap**: ~~Stage 6 (LangGraph lesson content generation) NOT tested~~ **RESOLVED** ✅

---

## Test Coverage Matrix

| Stage | Current Coverage | New Tests Needed |
|-------|-----------------|------------------|
| Stage 2 | t055 (partial) | Document classification, priority |
| Stage 3 | t055, stage3-real | Budget allocation, adaptive summarization |
| Stage 4 | t055 (partial) | RAG planning (Phase 6), GenerationGuidance |
| Stage 5 | t053 | V2 LessonSpec, Semantic Scaffolding |
| Stage 6 | NONE | Full LangGraph pipeline, Judge, parallel workers |

---

## Phase 1: Test Infrastructure Setup

- [X] E2E-001 [EXECUTOR: integration-tester] Create Stage 6 test fixtures in packages/course-gen-platform/tests/fixtures/stage6/
  - Mock LessonSpecificationV2 objects
  - Sample RAGChunks
  - Expected LessonContent outputs
  → Artifacts: [lesson-spec-fixtures.ts](../../packages/course-gen-platform/tests/fixtures/stage6/lesson-spec-fixtures.ts), [rag-chunk-fixtures.ts](../../packages/course-gen-platform/tests/fixtures/stage6/rag-chunk-fixtures.ts), [expected-outputs.ts](../../packages/course-gen-platform/tests/fixtures/stage6/expected-outputs.ts), [index.ts](../../packages/course-gen-platform/tests/fixtures/stage6/index.ts)

- [X] E2E-002 [EXECUTOR: integration-tester] Add Stage 6 test helpers to tests/fixtures/index.ts
  - createTestLessonSpec()
  - createTestRAGChunks()
  - mockStage6Job()
  → Artifacts: [fixtures/index.ts](../../packages/course-gen-platform/tests/fixtures/index.ts)

---

## Phase 2: Stage 6 Unit Integration Tests

- [X] E2E-003 [EXECUTOR: integration-tester] Create LangGraph nodes integration test at tests/integration/stage6/nodes.test.ts
  - Test planner node: lessonSpec → outline
  - Test expander node: outline → expanded sections
  - Test assembler node: sections → assembled content
  - Test smoother node: assembled → smoothed content
  → Artifacts: [nodes.test.ts](../../packages/course-gen-platform/tests/integration/stage6/nodes.test.ts) (17 test cases)

- [X] E2E-004 [EXECUTOR: integration-tester] Create Judge system integration test at tests/integration/stage6/judge.test.ts
  - Test cascade evaluator (heuristic → single → CLEV)
  - Test entropy detector
  - Test refinement loop (max 2 iterations)
  - Test decision engine (accept/fix/regenerate/escalate)
  → Artifacts: [judge.test.ts](../../packages/course-gen-platform/tests/integration/stage6/judge.test.ts) (37 test cases)

- [X] E2E-005 [EXECUTOR: integration-tester] Create BullMQ handler integration test at tests/integration/stage6/handler.test.ts
  - Test job processing
  - Test model fallback retry
  - Test partial success handling
  - Test progress streaming
  → Artifacts: [handler.test.ts](../../packages/course-gen-platform/tests/integration/stage6/handler.test.ts) (26 test cases)

---

## Phase 3: Full Pipeline E2E Test

- [X] E2E-006 [EXECUTOR: integration-tester] Create full Stage 2-6 pipeline E2E test at tests/e2e/stage2-6-full-pipeline.test.ts

  **Test Scenarios**:

  ### Scenario 1: Document Upload → Lesson Content (Happy Path)
  - Upload 2-3 test documents
  - Run Stage 2 (classification)
  - Run Stage 3 (summarization with budget allocation)
  - Run Stage 4 (analysis with RAG planning)
  - Run Stage 5 (V2 LessonSpec generation)
  - Run Stage 6 (LangGraph lesson content)
  - Validate final output quality

  ### Scenario 2: Stage 6 Parallel Processing
  - Generate course with 10+ lessons
  - Verify parallel BullMQ job execution
  - Check 30 worker concurrency
  - Measure total processing time

  ### Scenario 3: Stage 6 Judge Quality Gate
  - Generate lesson with intentionally borderline content
  - Verify Judge evaluation triggers
  - Test refinement loop execution
  - Validate final quality score >= 0.75

  ### Scenario 4: Error Recovery & Partial Success
  - Simulate model failure on 1 lesson
  - Verify fallback to backup model
  - Confirm other lessons complete successfully
  - Check partial success handling

  → Artifacts: [stage2-6-full-pipeline.test.ts](../../packages/course-gen-platform/tests/e2e/stage2-6-full-pipeline.test.ts) (5 scenarios)

---

## Phase 4: tRPC API E2E Tests

- [X] E2E-007 [EXECUTOR: integration-tester] Create Stage 6 tRPC procedures E2E test at tests/e2e/stage6-api.test.ts
  - Test `stage6.startStage6` - enqueue all lessons
  - Test `stage6.getProgress` - monitor generation
  - Test `stage6.retryLesson` - retry failed lessons
  - Test `stage6.getLessonContent` - retrieve content
  - Test `stage6.cancelStage6` - cancel pending jobs
  → Artifacts: [stage6-api.test.ts](../../packages/course-gen-platform/tests/e2e/stage6-api.test.ts) (33 test cases)

- [X] E2E-008 [EXECUTOR: integration-tester] Create locks tRPC procedures E2E test at tests/e2e/locks-api.test.ts
  - Test `locks.isLocked` - check lock status
  - Test `locks.getLock` - get lock details
  - Test `locks.getAllLocks` - list all locks
  - Test concurrent generation prevention
  → Artifacts: [locks-api.test.ts](../../packages/course-gen-platform/tests/e2e/locks-api.test.ts) (27 test cases)

- [X] E2E-009 [EXECUTOR: integration-tester] Create metrics tRPC procedures E2E test at tests/e2e/metrics-api.test.ts
  - Test `metrics.getCourseMetrics`
  - Test `metrics.getAggregatedMetrics`
  - Test `metrics.getStagePerformance`
  - Test `metrics.getCourseCost`
  → Artifacts: [metrics-api.test.ts](../../packages/course-gen-platform/tests/e2e/metrics-api.test.ts) (22 test cases)

---

## Phase 5: Performance & Load Tests

- [X] E2E-010 [EXECUTOR: integration-tester] Create Stage 6 performance test at tests/e2e/stage6-performance.test.ts
  - Measure single lesson generation time (target: < 60s)
  - Measure 10-lesson course generation (target: < 300s with parallelism)
  - Track token usage and cost per lesson
  - Validate quality scores under load
  → Artifacts: [stage6-performance.test.ts](../../packages/course-gen-platform/tests/e2e/stage6-performance.test.ts) (14 test cases)

---

## Test Documents

**Existing** (from docs/test/):
- `Письмо Минфина России от 31.01.2025 № 24 -01-06-8697.pdf` (636KB)
- `Постановление Правительства РФ от 23.12.2024 N 1875.txt` (281KB)
- `Презентация и обучение.txt` (71KB)

**Existing** (from docs/test/synergy/):
- `1 ТЗ на курс по продажам.docx` (24KB)
- `Модуль 1_Продажа_билетов_на_крупные_массовые_образовательные_мероприятия.pdf` (58KB)
- `Регламент работы в AMO CRM Megacampus.pdf` (120KB)
- `Регулярный_Менеджмент_Отдела_Продаж_docx.pdf` (80KB)

---

## Success Criteria

| Metric | Target | Source |
|--------|--------|--------|
| Stage 6 single lesson time | < 60s | Performance requirement |
| Stage 6 10-lesson course time | < 300s | With 30 worker parallelism |
| Quality score | >= 0.75 | Judge threshold |
| Token budget compliance | 95%+ batches < 120K | SC-005 |
| Min lessons per course | >= 10 | SC-006 (FR-015) |
| Cost per lesson | $0.01-0.05 | Cost optimization |

---

## Prerequisites

```bash
# Required services
docker compose up -d  # Redis, Qdrant

# Environment
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
OPENROUTER_API_KEY=...
JINA_API_KEY=...
QDRANT_URL=...

# Run tests
pnpm --filter course-gen-platform test tests/e2e/stage2-6-full-pipeline.test.ts
```

---

## Execution Order

1. **E2E-001, E2E-002** [PARALLEL] - Test infrastructure
2. **E2E-003, E2E-004, E2E-005** [PARALLEL] - Integration tests
3. **E2E-006** [SEQUENTIAL] - Full pipeline (depends on 1-5)
4. **E2E-007, E2E-008, E2E-009** [PARALLEL] - API tests (depends on 1-2)
5. **E2E-010** [SEQUENTIAL] - Performance (depends on 6)

---

## Subagent Assignments

| Task | Subagent | Reason |
|------|----------|--------|
| E2E-001 to E2E-010 | integration-tester | Specialized for integration/E2E tests |

---

## Summary

| Metric | Value |
|--------|-------|
| Total Tasks | 10 |
| Completed Tasks | 10 ✅ |
| Test Files Created | 8 |
| Fixtures Created | 4 |
| Total Test Cases | 176+ |

### Test Files Created

| File | Test Cases | Description |
|------|------------|-------------|
| `tests/fixtures/stage6/lesson-spec-fixtures.ts` | - | 5 LessonSpecificationV2 fixtures |
| `tests/fixtures/stage6/rag-chunk-fixtures.ts` | - | 22 RAG chunk fixtures |
| `tests/fixtures/stage6/expected-outputs.ts` | - | Expected LessonContent outputs |
| `tests/fixtures/stage6/index.ts` | - | Helper functions |
| `tests/integration/stage6/nodes.test.ts` | 17 | LangGraph nodes |
| `tests/integration/stage6/judge.test.ts` | 37 | Judge system |
| `tests/integration/stage6/handler.test.ts` | 26 | BullMQ handler |
| `tests/e2e/stage2-6-full-pipeline.test.ts` | 5 | Full pipeline E2E |
| `tests/e2e/stage6-api.test.ts` | 33 | Stage 6 tRPC API |
| `tests/e2e/locks-api.test.ts` | 27 | Locks API |
| `tests/e2e/metrics-api.test.ts` | 22 | Metrics API |
| `tests/e2e/stage6-performance.test.ts` | 14 | Performance tests |
