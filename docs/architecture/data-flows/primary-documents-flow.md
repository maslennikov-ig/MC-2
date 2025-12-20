# Primary Documents Data Flow

## Overview

`primary_documents` are document UUIDs from the `file_catalog` table that are relevant to each section of a course. This data is created during Stage 4 (Analysis) and consumed during both Stage 5 (Structure Generation) and Stage 6 (Lesson Content Generation) to filter RAG retrieval to only the most relevant uploaded documents.

The primary purpose is to enable **targeted RAG retrieval** - instead of searching all course documents for every lesson, the system queries only the pre-mapped relevant documents, resulting in:

- **45x cost savings** vs. using an LLM to determine document relevance at generation time
- **Higher relevance** in retrieved chunks
- **Faster retrieval** due to smaller search space

---

## Data Flow Diagram

```
Stage 4 (Analysis)
    |
    +-- Phase 6: RAG Planning Service
    |   |
    |   +-- Input: sections_breakdown, document_summaries
    |   |
    |   +-- LLM maps documents to sections based on topic relevance
    |   |
    |   +-- Output: document_relevance_mapping
    |       |
    |       +-- Structure:
    |           {
    |             [section_id: string]: {
    |               primary_documents: string[],  // file_catalog UUIDs
    |               search_queries: string[],     // RAG queries (3-10)
    |               expected_topics: string[],    // Topics to find (2-8)
    |               confidence: 'high' | 'medium',
    |               note?: string
    |             }
    |           }
    |
    v
courses.analysis_result (JSONB column)
    |
    +-------------------------------------------+
    |                                           |
    v                                           v
Stage 5 (Structure Generation)              Stage 6 (Lesson Content Generation)
    |                                           |
    +-- section-rag-retriever.ts                +-- partialGenerate endpoint
    |   |                                       |   |
    |   +-- Input: SectionRAGPlan               |   +-- Fetches: course_structure,
    |   |   (from DRM directly)                 |   |   language, analysis_result
    |   |                                       |   |
    |   +-- Uses: ragPlan.primary_documents     |   +-- Calls: buildMinimalLessonSpec()
    |   |   for document_ids filter             |
    |   |                                       +-- buildMinimalLessonSpec helper
    |   +-- Retrieves 20-30 chunks              |   |
    |       per section                         |   +-- Reads: analysisResult
    |                                           |   |   .document_relevance_mapping
    v                                           |   |   [sectionNumber]
Section-level RAG chunks                        |   |
(for LessonSpecificationV2 generation)          |   +-- Maps to: lessonSpec
                                                |       .rag_context.primary_documents
                                                |
                                                +-- lesson-rag-retriever.ts
                                                |   |
                                                |   +-- Reads: lessonSpec.rag_context
                                                |   |   .primary_documents
                                                |   |
                                                |   +-- If non-empty:
                                                |   |     +-- filter: document_ids
                                                |   |
                                                |   +-- If empty/undefined:
                                                |         +-- search ALL documents
                                                |
                                                v
                                            Lesson-level RAG chunks
                                            (5-10 chunks per lesson)
```

---

## Key Files

### Stage 4 - Creates Document Relevance Mapping

| File | Purpose |
|------|---------|
| `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-6-rag-planning.ts` | LLM service that generates `document_relevance_mapping` by analyzing sections and documents |

### Stage 5 - Uses DRM for Section-level RAG

| File | Purpose |
|------|---------|
| `packages/course-gen-platform/src/stages/stage5-generation/utils/section-rag-retriever.ts` | Uses `primary_documents` from DRM to filter Qdrant search for section-level retrieval (20-30 chunks) |

### Stage 6 - Extracts and Uses DRM

| File | Purpose |
|------|---------|
| `packages/course-gen-platform/src/server/routers/lesson-content/procedures/partial-generate.ts` | Fetches `analysis_result` from database and passes to helper |
| `packages/course-gen-platform/src/server/routers/lesson-content/helpers.ts` | `buildMinimalLessonSpec()` extracts DRM for section and populates `rag_context.primary_documents` |
| `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/lesson-rag-retriever.ts` | Uses `primary_documents` to filter Qdrant search via `document_ids` filter (5-10 chunks) |

---

## Code Flow Details

### 1. Stage 4 Phase 6 - Creating DRM

The Phase 6 RAG Planning service (`phase-6-rag-planning.ts`) creates the mapping:

```typescript
// Input to Phase 6
interface Phase6Input {
  course_id: string;
  language: string;
  sections_breakdown: SectionBreakdown[];
  document_summaries: Array<{
    document_id: string;
    file_name: string;
    processed_content: string;
    priority?: 'HIGH' | 'LOW';
    token_count?: number;
  }> | null;
}

// Output structure
interface SectionRAGPlan {
  primary_documents: string[];      // file_catalog IDs ranked by relevance
  search_queries: string[];         // 3-10 queries for RAG retrieval
  expected_topics: string[];        // 2-8 topics to find in chunks
  confidence: 'high' | 'medium';    // Based on processing_mode
  note?: string;                    // Guidance for Generation
}
```

The LLM analyzes each section's `key_topics` and `learning_objectives` against the available documents and generates a mapping.

### 2. Storing in Database

The complete `analysis_result` (including `document_relevance_mapping`) is stored in the `courses.analysis_result` JSONB column after Stage 4 completes.

### 3. Stage 5 - Using DRM for Section-level RAG

In `section-rag-retriever.ts`, the `retrieveSectionContext()` function receives the RAG plan directly:

```typescript
// Section RAG retrieval uses DRM plan directly
export async function retrieveSectionContext(params: SectionRAGParams): Promise<SectionRAGResult> {
  const { courseId, sectionId, ragPlan } = params;

  // Execute search with document filtering
  const queryChunks = await executeSearchQuery({
    query,
    courseId,
    primaryDocuments: ragPlan.primary_documents,  // From DRM
    scoreThreshold,
    limit: chunksPerQuery,
  });
}

// The executeSearchQuery helper applies the filter
async function executeSearchQuery(params) {
  const searchOptions: SearchOptions = {
    limit,
    score_threshold: scoreThreshold,
    filters: {
      course_id: courseId,
      // Filter by primary documents if specified
      ...(primaryDocuments && primaryDocuments.length > 0
        ? { document_ids: primaryDocuments }
        : {}),
    },
  };

  const response = await searchChunks(query, searchOptions);
}
```

Stage 5 retrieves 20-30 chunks per section for generating `LessonSpecificationV2` objects.

### 4. Stage 6 - Extracting DRM via partialGenerate

In `partial-generate.ts`, the analysis result is fetched:

```typescript
const { data: course } = await supabase
  .from('courses')
  .select('course_structure, language, analysis_result')
  .eq('id', courseId)
  .single();

// Pass to helper
const spec = buildMinimalLessonSpec(
  lessonId,
  lesson,
  sectionNum,
  requestId,
  course.analysis_result as AnalysisResult | undefined
);
```

### 5. Building Lesson Spec with RAG Context

In `helpers.ts`, `buildMinimalLessonSpec()` extracts the relevant section's DRM:

```typescript
// Get RAG plan from document_relevance_mapping for this section
const ragPlan = analysisResult?.document_relevance_mapping?.[String(sectionNumber)];

// Build the lesson spec with RAG context
return {
  // ... other fields
  rag_context: {
    primary_documents: ragPlan?.primary_documents?.length
      ? ragPlan.primary_documents
      : [],  // Empty array triggers fallback
    search_queries: ragPlan?.search_queries?.length
      ? ragPlan.search_queries
      : (lesson.key_topics || [lesson.lesson_title]),
    expected_chunks: 7,
  },
};
```

### 6. Using primary_documents for Lesson-level RAG Filtering

In `lesson-rag-retriever.ts`, the `retrieveLessonContext()` function uses the primary documents:

```typescript
const primaryDocIds = lessonSpec.rag_context?.primary_documents;

const searchOptions: SearchOptions = {
  limit: candidateCount,
  score_threshold: LESSON_RAG_CONFIG.SCORE_THRESHOLD,
  filters: {
    course_id: courseId,
    // Filter by primary documents if specified (empty array = search all)
    ...(primaryDocIds && primaryDocIds.length > 0 && {
      document_ids: primaryDocIds,
    }),
  },
};

const response = await searchChunks(query, searchOptions);
```

---

## Fallback Behavior

The system gracefully handles missing or incomplete DRM data:

| Condition | Behavior |
|-----------|----------|
| `analysis_result` is undefined | Falls back to searching ALL course documents |
| `document_relevance_mapping` is undefined | Falls back to searching ALL course documents |
| `document_relevance_mapping[sectionNumber]` doesn't exist | Falls back to searching ALL course documents |
| `primary_documents` array is empty (`[]`) | Falls back to searching ALL course documents |
| `search_queries` is empty | Uses `lesson.key_topics` or lesson title as queries |

The fallback is implemented in `helpers.ts`:

```typescript
// Track DRM usage for monitoring data quality
const hasDRM = !!ragPlan;
const primaryDocsCount = ragPlan?.primary_documents?.length ?? 0;
const usedFallback = !hasDRM || primaryDocsCount === 0;

logger.debug({
  requestId,
  lessonId,
  sectionNumber,
  hasDRM,
  primaryDocsCount,
  usedFallback,
}, usedFallback
  ? 'DRM fallback: searching all documents'
  : 'DRM found: filtering by primary_documents');
```

And in `lesson-rag-retriever.ts`:

```typescript
// Filter by primary documents if specified (empty array = search all)
...(primaryDocIds && primaryDocIds.length > 0 && {
  document_ids: primaryDocIds,
}),
```

---

## Type Definitions

### AnalysisResult.document_relevance_mapping

Location: `@megacampus/shared-types/analysis-result`

```typescript
document_relevance_mapping: {
  [section_id: string]: {
    primary_documents: string[];      // file_catalog IDs ranked by relevance
    search_queries: string[];         // Queries for RAG retrieval
    expected_topics: string[];        // Topics to find in chunks
    confidence: 'high' | 'medium';    // Based on processing_mode
    note?: string;                    // Guidance for Generation
    // Legacy fields (deprecated)
    key_search_terms?: string[];
    document_processing_methods?: {
      [document_id: string]: 'full_text' | 'hierarchical';
    };
  };
};
```

### LessonSpecificationV2.rag_context

Location: `@megacampus/shared-types/lesson-specification-v2`

```typescript
export const LessonRAGContextV2Schema = z.object({
  /**
   * Primary document IDs from file_catalog.
   * These documents provide the authoritative source material.
   */
  primary_documents: z.array(z.string().min(1))
    .min(1, 'Must have at least 1 primary document'),

  /**
   * Search queries for vector retrieval.
   * Used to fetch relevant chunks from the knowledge base.
   */
  search_queries: z.array(z.string().min(3))
    .min(1),

  /**
   * Expected number of chunks to retrieve.
   * Typical range: 5-10 chunks per lesson.
   */
  expected_chunks: z.number().int().min(5).max(10),
});
```

---

## Confidence Levels

The `confidence` field in DRM indicates retrieval reliability:

| Level | Meaning | Recommendation |
|-------|---------|----------------|
| `high` | All `primary_documents` are small (<5K tokens) and use `full_text` mode | Trust retrieved content is complete |
| `medium` | At least one `primary_document` is large and uses `summary`/`hierarchical` mode | Verify context is sufficient |

---

## Monitoring and Debugging

The system logs DRM usage for monitoring data quality:

```typescript
logger.debug({
  requestId,
  lessonId,
  sectionNumber,
  hasDRM,
  primaryDocsCount,
  usedFallback,
  searchQueriesCount: ragPlan?.search_queries?.length ?? 0,
}, usedFallback
  ? 'DRM fallback: searching all documents'
  : 'DRM found: filtering by primary_documents');
```

Key metrics to monitor:

- **`usedFallback` rate**: High rate indicates DRM is not being created properly in Stage 4
- **`primaryDocsCount`**: Should typically be 1-5 documents per section
- **`searchQueriesCount`**: Should be 3-10 per section

---

## Related Documentation

- Stage 4 Analysis phases: `packages/course-gen-platform/src/stages/stage4-analysis/`
- Stage 5 Structure generation: `packages/course-gen-platform/src/stages/stage5-generation/`
- Stage 6 Lesson Content generation: `packages/course-gen-platform/src/stages/stage6-lesson-content/`
- Lesson specification types: `packages/shared-types/src/lesson-specification-v2.ts`
- Analysis result types: `packages/shared-types/src/analysis-result.ts`
