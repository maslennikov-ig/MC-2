# RAG Coverage Tagging Research Report

**Task**: mc2-87nt
**Date**: 2026-02-16
**Status**: Complete

## Executive Summary

Research into RAG coverage tagging across Stages 4-6 of the course generation pipeline revealed:

1. The system correctly generates all sections from model knowledge regardless of document coverage
2. `document_relevance_mapping` is always `{}` and should be deprecated (not revived)
3. A **critical bug** was found: fallback `primary_documents: ['default']` silently blocks Stage 6 RAG retrieval
4. Stage 6 does not need document-vs-model provenance tracking

### Data from Production (2026-02-16)

| Metric | Value |
|--------|-------|
| Courses with indexed documents | 63 |
| Courses with non-empty `document_relevance_mapping` | **0** |
| Lessons with `source_documents` (RAG worked) | 257 / 1045 (24.6%) |

The 24.6% success rate confirms RAG partially works via `buildLessonQueries()` (objectives + key_points), but is limited by the `['default']` filter bug.

---

## Research Questions & Answers

### Q1: How does the system behave with weak document coverage?

**Answer**: The system ALWAYS generates all sections from model knowledge. Documents only augment the generation prompt -- they never constrain what sections are generated.

**Evidence**:
- Stage 5 prompt builder (`prompt-builder.ts:90-263`) constructs section generation from `sections_breakdown`, not document content
- RAG content is injected as optional context: "REFERENCE MATERIAL (extract specific details if relevant)"
- Tool-calling RAG (`prompt-builder.ts:216`) gives LLM search autonomy but doesn't constrain structure
- `checkCourseHasIndexedDocuments()` (`document-availability.ts:49`) provides binary gate -- if no docs, RAG skipped entirely, generation continues

**Conclusion**: Weak document coverage is handled correctly by design. A course with 30% document coverage generates 100% of sections; the 30% gets RAG augmentation, the rest uses model knowledge.

### Q2: `document_relevance_mapping` -- revive vs remove?

**Answer**: **DEPRECATE**. Fix the fallback queries instead.

**Evidence**:
- Field marked `@deprecated` in `analysis-result.ts:97-119`
- Phase 6 RAG Planning was explicitly removed (mc2-u9fb)
- 0 courses in production have non-empty mapping
- Fallback code generates sentinel bugs (`primary_documents: ['default']`)
- Programmatic filling via Qdrant per-section would add latency without clear quality gain
- Stage 6 already has working alternative: `buildLessonQueries()` combines `search_queries + learning_objectives + key_points`

**Recommendation**:
1. Make `document_relevance_mapping` optional in `AnalysisResult` type
2. Fix `buildRAGContext` fallbacks to use section-specific topics
3. Remove `primary_documents` sentinel values (use `[]` instead)

### Q3: Stage 5 RAG optimization

**Answer**: Stage 5 does NOT perform any RAG retrieval. The RAG infrastructure exists but is dead code.

**Evidence**:
- `enrichBatchContext()` in `qdrant-search.ts` -- exported but never imported anywhere
- `retrieveSectionContext()` in `section-rag-retriever.ts` -- never called (only types imported by Stage 6)
- Stage 5 uses tool-calling mode (`prompt-builder.ts:216`) where LLM autonomously queries Qdrant

**Conclusion**: No optimization needed for Stage 5 RAG because it doesn't happen via those functions. The real optimization is fixing Stage 6's silently broken RAG and removing the dead code.

### Q4: Stage 6 RAG impact

**Answer**: No changes needed. Stage 6 does not need document-vs-model provenance tracking.

**Evidence**:
- `retrieveLessonContext()` (`retriever.ts:25`) returns `RAGChunk[]` without origin tagging
- Self-reviewer and CLEV voter use RAG context for quality checking but don't distinguish source
- `source_documents` attribution (`helpers.ts:79-104`) tracks which documents contributed -- this is metadata for traceability, not generation logic
- The lesson generator treats RAG context as supplementary reference regardless of origin

---

## Critical Bug: `primary_documents: ['default']`

### Root Cause

When `document_relevance_mapping` is empty (always), two `buildRAGContext` functions create fallback specs:

```
v2-converter.ts:61         -> primary_documents: ['default']
phase3-v2-spec-generator.ts:471 -> primary_documents: ['default-course-document']
```

### Impact Chain

```
document_relevance_mapping = {}           (phase-5-assembly.ts:250)
    |
buildRAGContext() creates fallback
    |
primary_documents: ['default']            (v2-converter.ts:61)
    |
Stage 6 retriever.ts:127
    filteringByDocs = ['default'].length > 0 = true
    |
Qdrant filter: { document_ids: ['default'] }
    |
'default' is not a UUID -> 0 results -> RAG silently returns nothing
```

### Fix

Change `['default']` to `[]` (empty array). The retriever already handles this correctly:
- `[].length > 0` = `false` -> no document filter -> searches ALL course documents

Also improve search_queries fallback from generic `['course content']` to `[section.area, ...section.key_topics]`.

---

## Decision Table

| Question | Decision | Reasoning |
|----------|----------|-----------|
| Revive `document_relevance_mapping`? | **DEPRECATE** | Dead field generating sentinel bugs. Stage 6 has alternative query paths. |
| Fill programmatically via Qdrant? | **NO** | Adds latency without clear quality gain. Fix fallback queries instead. |
| Skip RAG for irrelevant sections? | **NOT NOW** | Stage 5 doesn't do RAG retrieval. Stage 6 has `checkCourseHasIndexedDocuments` gate. |
| Stage 6 source tracking? | **NO CHANGE** | Current design is sound. Source attribution exists for traceability. |

---

## Follow-up Tasks

| # | ID | Type | Priority | Title | Status |
|---|-----|------|----------|-------|--------|
| 1 | mc2-g5bc | bug | P1 | Fix `primary_documents: ['default']` sentinel blocking RAG | Created |
| 2 | mc2-cwzb | chore | P3 | Remove dead code: `enrichBatchContext` | Created |
| 3 | mc2-ztv5 | chore | P3 | Make `document_relevance_mapping` optional in `AnalysisResult` | Created |

---

## Key Files Reference

| File | Role |
|------|------|
| `stages/stage5-generation/utils/section-batch/v2-converter.ts:55-78` | `buildRAGContext` with `['default']` fallback |
| `stages/stage5-generation/phases/phase3-v2-spec-generator.ts:451-484` | `buildRAGContext` with `['default-course-document']` fallback |
| `stages/stage6-lesson-content/rag/retriever.ts:126-155` | `filteringByDocs` logic affected by sentinel |
| `stages/stage5-generation/utils/qdrant-search.ts:147-297` | Dead `enrichBatchContext` |
| `shared-types/src/analysis-result.ts:97-119` | `document_relevance_mapping` type definition |
| `stages/stage4-analysis/phases/phase-5-assembly.ts:250` | Always sets `{}` |
| `shared/rag/document-availability.ts:49` | `checkCourseHasIndexedDocuments` gate |
