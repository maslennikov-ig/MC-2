# mc2-87nt: RAG Coverage Tagging Research

## Context

Stage 4 analysis previously had Phase 6 (RAG Planning) which mapped documents to sections via LLM. This was removed (mc2-u9fb) as unreliable and replaced by vector search with priority boosting (mc2-zac). However, the removal left behind dead code, broken fallbacks, and a `document_relevance_mapping` field that is always `{}`. The research task asks 4 questions about how RAG currently works and what to improve.

## Critical Bug Found

**`primary_documents: ['default']` silently breaks Stage 6 RAG retrieval for ALL courses.**

When `document_relevance_mapping` is empty (always), two `buildRAGContext` functions create fallback specs:

- `v2-converter.ts:61` → `primary_documents: ['default']`
- `phase3-v2-spec-generator.ts:471` → `primary_documents: ['default-course-document']`

In Stage 6 retriever (`retriever.ts:127`):

```
filteringByDocs = primaryDocIds && primaryDocIds.length > 0  // ['default'].length > 0 = true
```

This passes `{ document_ids: ['default'] }` to Qdrant → matches 0 documents → RAG returns nothing.

**Fix**: Change to `[]` (empty array). The retriever already handles this correctly: `[] && [].length > 0` = `false` → no filter → searches ALL course documents.

## Research Answers

### Q1: System behavior with weak document coverage

**Answer**: The system ALWAYS generates all sections from model knowledge. Documents only augment the generation prompt — they never constrain or limit what sections are generated.

**Evidence**:

- Stage 5 prompt builder (`prompt-builder.ts:90-263`) constructs section generation from `sections_breakdown`, not document content
- RAG content is injected as optional context: "REFERENCE MATERIAL (extract specific details if relevant)"
- Tool-calling RAG (`prompt-builder.ts:216`) gives LLM search autonomy but doesn't constrain structure
- Stage 6 retriever returns empty gracefully → generation continues without RAG

### Q2: `document_relevance_mapping` — revive vs remove

**Answer**: **REMOVE** (deprecate). Fix the fallback queries instead.

**Evidence**:

- Field marked `@deprecated` in `analysis-result.ts:97-119`
- Always `{}` for new courses (`phase-5-assembly.ts:250`)
- Fallback code generates sentinel bugs (`['default']`)
- Programmatic filling via Qdrant per-section would be expensive and unnecessary
- Stage 6 already has alternative: `buildLessonQueries()` combines `search_queries + learning_objectives + key_points` which provides good queries without document-to-section mapping

### Q3: Stage 5 RAG optimization

**Answer**: Stage 5 does NOT perform any RAG retrieval. The infrastructure exists but is dead code.

**Evidence**:

- `enrichBatchContext()` — defined in `qdrant-search.ts`, never imported anywhere
- `retrieveSectionContext()` — defined in `section-rag-retriever.ts`, never called (only types imported)
- Stage 5 uses tool-calling mode (`prompt-builder.ts:216`) where LLM autonomously queries Qdrant — this is the correct optimization

### Q4: Stage 6 RAG impact

**Answer**: No changes needed. Stage 6 does not need document-vs-model provenance tracking.

**Evidence**:

- `retrieveLessonContext()` returns chunks without origin tagging
- Self-reviewer and CLEV voter use RAG context for quality but don't distinguish source
- `source_documents` attribution exists as metadata for traceability, not generation logic

## Deliverable

Write research report: `docs/reports/rag-coverage-tagging-research-mc2-87nt.md`

### Report structure:

1. Executive Summary (findings + critical bug)
2. Answers to 4 research questions (with code evidence)
3. Decision table
4. Follow-up tasks

### Verify findings with Supabase queries:

1. Count courses with indexed documents
2. Check if any courses have non-empty `document_relevance_mapping`
3. Check what `rag_context.primary_documents` values are stored in lesson specs
4. Check if `source_documents` is ever populated (indicates RAG worked)

## Follow-up Tasks to Create in Beads

| #   | Type  | Priority | Title                                                                      |
| --- | ----- | -------- | -------------------------------------------------------------------------- |
| 1   | bug   | P1       | Fix `primary_documents: ['default']` sentinel blocking RAG in Stage 6      |
| 2   | task  | P2       | Improve buildRAGContext fallback search_queries to use section topics      |
| 3   | chore | P3       | Remove dead code: enrichBatchContext, unused section-rag-retriever exports |
| 4   | chore | P3       | Make `document_relevance_mapping` optional in AnalysisResult type          |

## Critical Files

| File                                                                  | What to check/verify                                 |
| --------------------------------------------------------------------- | ---------------------------------------------------- |
| `stages/stage5-generation/utils/section-batch/v2-converter.ts:55-78`  | `buildRAGContext` fallback with `['default']`        |
| `stages/stage5-generation/phases/phase3-v2-spec-generator.ts:451-484` | `buildRAGContext` with `['default-course-document']` |
| `stages/stage6-lesson-content/rag/retriever.ts:126-155`               | `filteringByDocs` logic                              |
| `stages/stage5-generation/utils/qdrant-search.ts:147`                 | Dead `enrichBatchContext`                            |
| `shared-types/src/analysis-result.ts:97-119`                          | `document_relevance_mapping` type                    |
| `stages/stage4-analysis/phases/phase-5-assembly.ts:250`               | Always sets `{}`                                     |

## Verification

1. Run Supabase queries to validate real data state
2. Verify `['default']` bug by checking lesson specs in DB
3. Confirm no callers of `enrichBatchContext` and `retrieveSectionContext`
4. Write research report with findings
5. Create follow-up tasks in Beads
6. Close mc2-87nt
