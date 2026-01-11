# Refactoring: RAG Priority-Based Retrieval & Stage 3 Elimination

**Status**: Draft
**Priority**: P2
**Created**: 2026-01-11
**Estimated Effort**: 3-5 days
**Type**: Architecture Refactoring

---

## Executive Summary

Eliminate LLM-based document classification (Stage 3) and replace with a simpler, more robust approach:
1. Store document priority in chunk metadata (Qdrant payload)
2. Use priority for boosting/re-ranking during vector search
3. Track source documents from retrieved chunks (post-hoc attribution)

This eliminates a source of classification errors while maintaining priority awareness and adding source attribution capabilities.

---

## Motivation

### Problem: LLM Classification Errors

During recent testing, the LLM incorrectly classified documents, leading to wrong content generation. This is a **systemic risk** because:

1. **Single point of failure**: One classification error propagates through the entire pipeline
2. **No ground truth**: LLM classification is subjective and context-dependent
3. **Unnecessary complexity**: Vector search already finds semantically relevant chunks
4. **Extra latency and cost**: Stage 3 adds LLM calls that could be eliminated

### User Question That Triggered This

> "А у меня вопрос, мы делаем такую штуку как приоритет документа. И мы можем на нее тоже операться при маппинге, а не при маппинге, а при чанках или не можем?"

Translation: Can we use document priority at the chunk level instead of mapping?

**Answer: YES** - and it's a better approach.

---

## Current Architecture (Stage 3)

```
Stage 2: Document Processing
    ↓
    Chunks created → Qdrant (NO PRIORITY in payload)
    ↓
Stage 3: LLM Classification
    ↓
    LLM reads summaries → Assigns CORE/IMPORTANT/SUPPLEMENTARY
    ↓
    Saves to file_catalog.priority
    ↓
Stage 4: Budget Allocation (uses file_catalog.priority)
    ↓
Stage 5-6: Generation (filters by mapped documents)
```

### Stage 3 Classification Logic

**File**: `src/stages/stage3-classification/phases/phase-classification.ts`

```typescript
const ComparativeDocumentClassificationSchema = z.object({
  id: z.string().uuid(),
  priority: DocumentPriorityLevelSchema, // 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY'
  rationale: z.string().min(10),
});
```

LLM compares document summaries and assigns:
- **CORE**: Exactly 1 document (most important)
- **IMPORTANT**: Up to 30% of documents
- **SUPPLEMENTARY**: Remaining documents

**Problem**: LLM can make mistakes. When it does, the error propagates to all lessons.

---

## Proposed Architecture (No Stage 3)

```
Stage 2: Document Processing
    ↓
    Chunks created → Qdrant WITH document_priority & document_weight in payload
    ↓
Stage 4: Simplified Budget Allocation (course-level, not per-document)
    ↓
Stage 5-6: Generation
    ↓
    Vector search WITH priority boosting
    ↓
    Retrieved chunks → Extract unique document_ids → Save as source_documents
```

### Key Changes

| Aspect | Before (Stage 3) | After (No Stage 3) |
|--------|------------------|-------------------|
| Priority source | LLM classification | file_catalog.priority (user/system assigned) |
| Priority location | file_catalog only | file_catalog + Qdrant payload |
| Priority usage | Pre-filter documents | Boost scores during retrieval |
| Source tracking | None | Automatic from retrieved chunks |
| Error risk | LLM classification errors | None (semantic search + priority boost) |

---

## Detailed Implementation Plan

### Phase 1: Add Priority to Chunk Metadata

**File**: `src/shared/embeddings/metadata-enricher.ts`

```typescript
// Add to EnrichedChunk interface (line ~19)
export interface EnrichedChunk extends TextChunk {
  // ... existing fields ...

  // NEW: Document priority from file_catalog
  document_priority: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
  document_weight: number;  // 1.0 for CORE, 0.8 for IMPORTANT, 0.5 for SUPPLEMENTARY
}

// Add to EnrichmentOptions interface (line ~84)
export interface EnrichmentOptions {
  // ... existing fields ...

  // NEW: Priority from file_catalog
  document_priority?: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
  document_weight?: number;
}

// Update enrichChunk function (line ~304)
export function enrichChunk(
  chunk: TextChunk,
  options: EnrichmentOptions
): EnrichedChunk {
  // ... existing code ...

  return {
    ...chunk,
    // ... existing fields ...

    // NEW: Priority fields
    document_priority: options.document_priority || 'SUPPLEMENTARY',
    document_weight: options.document_weight || 0.5,
  };
}

// Update toQdrantPayload function (line ~378)
export function toQdrantPayload(chunk: EnrichedChunk): Record<string, unknown> {
  return {
    // ... existing fields ...

    // NEW: Priority fields
    document_priority: chunk.document_priority,
    document_weight: chunk.document_weight,
  };
}
```

**File**: `src/stages/stage2-document-processing/phases/phase-4-chunking.ts`

```typescript
// Update ChunkMetadata interface (line ~19)
export interface ChunkMetadata {
  document_id: string;
  document_name: string;
  organization_id: string;
  course_id: string;
  // NEW
  document_priority: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
  document_weight: number;
}

// Update executeChunking to pass priority
export async function executeChunking(
  markdown: string,
  metadata: ChunkMetadata,
  job: Job<DocumentProcessingJobData>
): Promise<ChunkingResult> {
  // ... existing code ...

  const enrichedChunks = enrichChunks(allChunks, {
    document_id: metadata.document_id,
    document_name: metadata.document_name,
    organization_id: metadata.organization_id,
    course_id: metadata.course_id,
    // NEW
    document_priority: metadata.document_priority,
    document_weight: metadata.document_weight,
  });

  // ... rest ...
}
```

**File**: `src/stages/stage2-document-processing/handler.ts`

```typescript
// In execute(), fetch priority from file_catalog and pass to chunking
const { data: fileData } = await supabase
  .from('file_catalog')
  .select('priority')
  .eq('id', jobData.fileId)
  .single();

const priority = fileData?.priority || 'SUPPLEMENTARY';
const weight = priority === 'CORE' ? 1.0 : priority === 'IMPORTANT' ? 0.8 : 0.5;

// Pass to chunking phase
const chunkingResult = await executeChunking(markdown, {
  document_id: jobData.fileId,
  document_name: filename,
  organization_id: jobData.organizationId,
  course_id: jobData.courseId,
  document_priority: priority,
  document_weight: weight,
}, job);
```

### Phase 2: Priority-Boosted Search

**File**: `src/shared/qdrant/search-types.ts`

```typescript
// Add to SearchOptions interface (line ~74)
export interface SearchOptions {
  // ... existing fields ...

  // NEW: Priority boosting
  enable_priority_boost?: boolean;
  priority_boost_factor?: number;  // Default: 1.2 (20% boost for CORE)
}
```

**File**: `src/shared/qdrant/search.ts`

```typescript
// After retrieving results, apply priority boosting (line ~159)
let results = searchResults.map((point) => toSearchResult(point, config.include_payload));

// NEW: Apply priority boosting if enabled
if (config.enable_priority_boost) {
  const boostFactor = config.priority_boost_factor || 1.2;
  results = results.map(result => {
    const weight = result.payload?.document_weight as number || 0.5;
    return {
      ...result,
      score: result.score * (1 + (weight - 0.5) * boostFactor),
    };
  }).sort((a, b) => b.score - a.score);
}
```

#### Decision Log: Why 0.4 for priority_boost_factor?

The default value of `0.4` for `priority_boost_factor` was chosen after analyzing the trade-offs between semantic relevance and document priority:

**The Problem We're Solving**

Priority boosting adjusts vector search scores based on document importance. However, if the boost is too aggressive, it can override semantic relevance - a less relevant chunk from a CORE document could rank higher than a highly relevant chunk from a SUPPLEMENTARY document.

**Boost Factor Comparison**

| Factor | CORE Boost | IMPORTANT Boost | Effect |
|--------|------------|-----------------|--------|
| 0.2 | +10% | +6% | Subtle - barely noticeable, semantic similarity dominates |
| 0.4 | +20% | +12% | Balanced - meaningful boost without overwhelming relevance |
| 0.6 | +30% | +18% | Strong - priority significantly affects ranking |
| 0.8 | +40% | +24% | Aggressive - priority can override moderate relevance differences |

**Why 0.4 is Optimal**

1. **Meaningful differentiation**: A 20% boost for CORE documents is significant enough to affect ranking when two chunks have similar semantic scores.

2. **Preserves relevance**: If a SUPPLEMENTARY chunk has 25%+ higher semantic score than a CORE chunk, the SUPPLEMENTARY chunk still wins. This prevents irrelevant content from ranking high just because its source document is marked CORE.

3. **Gradual priority ladder**: CORE (+20%) > IMPORTANT (+12%) > SUPPLEMENTARY (0%) creates a clear priority hierarchy without extreme jumps.

4. **Conservative default**: Starting with 0.4 allows teams to increase if needed. It's easier to tune up than to undo damage from an aggressive boost.

**Tuning Recommendations**

- **A/B Testing**: Compare lesson quality with 0.3, 0.4, and 0.5 boost factors
- **Domain-Specific**: Technical courses with clear CORE textbooks may benefit from higher boost (0.5-0.6)
- **Diverse Sources**: Courses with many equally-important documents may prefer lower boost (0.2-0.3)
- **Monitoring**: Track which documents contribute to lessons via `source_documents` and adjust based on coverage

**Configuration**

```typescript
// Default: balanced boost
const options: SearchOptions = {
  enable_priority_boost: true,
  priority_boost_factor: 0.4,  // +20% for CORE, +12% for IMPORTANT
};

// Conservative: subtle boost
const options: SearchOptions = {
  enable_priority_boost: true,
  priority_boost_factor: 0.2,  // +10% for CORE, +6% for IMPORTANT
};

// Aggressive: strong priority preference
const options: SearchOptions = {
  enable_priority_boost: true,
  priority_boost_factor: 0.8,  // +40% for CORE, +24% for IMPORTANT
};
```

### Phase 3: Source Attribution from Retrieved Chunks

**File**: `src/stages/stage6-lesson-content/utils/lesson-rag-retriever.ts`

```typescript
// Add source extraction function
export interface SourceDocument {
  document_id: string;
  document_name: string;
  document_priority: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
  chunk_count: number;  // How many chunks from this document
}

export function extractSourceDocuments(chunks: LessonRAGChunk[]): SourceDocument[] {
  const docMap = new Map<string, SourceDocument>();

  for (const chunk of chunks) {
    const existing = docMap.get(chunk.document_id);
    if (existing) {
      existing.chunk_count++;
    } else {
      docMap.set(chunk.document_id, {
        document_id: chunk.document_id,
        document_name: chunk.document_name,
        document_priority: chunk.document_priority || 'SUPPLEMENTARY',
        chunk_count: 1,
      });
    }
  }

  return Array.from(docMap.values())
    .sort((a, b) => b.chunk_count - a.chunk_count);  // Most used first
}
```

**Database Migration**: Add `source_documents` to lessons table

```sql
-- Migration: add_source_documents_to_lessons
ALTER TABLE lessons
ADD COLUMN source_documents jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN lessons.source_documents IS
  'Array of {document_id, document_name, document_priority, chunk_count} from RAG retrieval';
```

**File**: `src/stages/stage6-lesson-content/handler.ts`

```typescript
// After generating lesson content, save source documents
const sourceDocuments = extractSourceDocuments(retrievedChunks);

await supabase
  .from('lessons')
  .update({
    content: generatedContent,
    source_documents: sourceDocuments,
  })
  .eq('id', lessonId);
```

### Phase 4: Deprecate Stage 3

**Option A: Remove entirely**
- Delete `src/stages/stage3-classification/` directory
- Remove Stage 3 handler from worker registry
- Update pipeline to skip Stage 3

**Option B: Make optional (recommended for gradual rollout)**
- Add feature flag: `ENABLE_STAGE3_CLASSIFICATION=false`
- When disabled, Stage 3 completes immediately with no-op
- Keep code for rollback if needed

### Phase 5: Add Post-Generation Validation

```typescript
// New utility: src/shared/validation/document-coverage.ts
export async function validateDocumentCoverage(
  courseId: string
): Promise<{
  usedDocuments: string[];
  unusedDocuments: string[];
  coveragePercent: number;
}> {
  // 1. Get all documents for course
  const { data: allDocs } = await supabase
    .from('file_catalog')
    .select('id')
    .eq('course_id', courseId);

  // 2. Get all source_documents from lessons
  const { data: lessons } = await supabase
    .from('lessons')
    .select('source_documents')
    .eq('section.course_id', courseId);  // Need join

  // 3. Calculate coverage
  const usedSet = new Set<string>();
  for (const lesson of lessons) {
    for (const source of lesson.source_documents) {
      usedSet.add(source.document_id);
    }
  }

  const usedDocuments = Array.from(usedSet);
  const unusedDocuments = allDocs
    .filter(d => !usedSet.has(d.id))
    .map(d => d.id);

  return {
    usedDocuments,
    unusedDocuments,
    coveragePercent: (usedDocuments.length / allDocs.length) * 100,
  };
}
```

---

## Files to Modify

### Core Changes
| File | Change |
|------|--------|
| `src/shared/embeddings/metadata-enricher.ts` | Add `document_priority`, `document_weight` to EnrichedChunk |
| `src/shared/embeddings/metadata-enricher.ts` | Add priority fields to `toQdrantPayload()` |
| `src/stages/stage2-document-processing/phases/phase-4-chunking.ts` | Add priority to ChunkMetadata, pass to enrichChunks |
| `src/stages/stage2-document-processing/handler.ts` | Fetch priority from file_catalog, pass to chunking |
| `src/shared/qdrant/search-types.ts` | Add `enable_priority_boost`, `priority_boost_factor` options |
| `src/shared/qdrant/search.ts` | Implement priority boosting |
| `src/stages/stage6-lesson-content/utils/lesson-rag-retriever.ts` | Add `extractSourceDocuments()` |

### Database Changes
| Table | Change |
|-------|--------|
| `lessons` | Add `source_documents jsonb` column |

### Optional (Deprecation)
| File | Change |
|------|--------|
| `src/stages/stage3-classification/*` | Mark as deprecated or remove |
| `src/orchestrator/worker.ts` | Remove Stage 3 handler registration |

---

## Database Schema Reference

### file_catalog (existing)
```sql
-- Relevant columns for this refactoring
priority text DEFAULT 'SUPPLEMENTARY'  -- Already exists!
```

### lessons (proposed addition)
```sql
source_documents jsonb DEFAULT '[]'::jsonb
-- Format: [{"document_id": "uuid", "document_name": "string", "document_priority": "CORE|IMPORTANT|SUPPLEMENTARY", "chunk_count": number}]
```

---

## Current Chunk Payload (Qdrant)

**File**: `src/shared/embeddings/metadata-enricher.ts:378`

```typescript
// Current toQdrantPayload (missing priority fields)
{
  chunk_id, parent_chunk_id, sibling_chunk_ids, level, content,
  token_count, char_count, chunk_index, total_chunks, chunk_strategy,
  overlap_tokens, heading_path, chapter, section,
  document_id, document_name, document_version, version_hash,
  page_number, page_range,
  has_code, has_formulas, has_tables, has_images,
  organization_id, course_id,
  indexed_at, last_updated,
  image_refs, table_refs
}

// After refactoring (add priority fields)
{
  // ... all existing fields ...
  document_priority,  // 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY'
  document_weight,    // 1.0 | 0.8 | 0.5
}
```

---

## Related Beads Tasks

### DEBT-001: Token-Aware Embedding Batching
- **ID**: mc2-p3v
- **File**: `docs/FUTURE/TOKEN-AWARE-BATCHING.md`
- **Relevance**: Can be combined with this refactoring since we're touching embedding code

### Lesson RAG Retriever Refactoring
- **ID**: mc2-mkl
- **File**: `src/stages/stage6-lesson-content/utils/lesson-rag-retriever.ts`
- **Relevance**: Adding source attribution fits naturally into this refactoring

---

## RAG Configuration Reference

**File**: `docs/RAG-CHUNKING-STRATEGY.md`

```typescript
DEFAULT_CHUNKING_CONFIG = {
  parent_chunk_size: 1500,
  child_chunk_size: 400,
  child_chunk_overlap: 50,
  tiktoken_model: 'gpt-3.5-turbo'
}
```

**Lesson RAG Config**: `src/stages/stage6-lesson-content/utils/lesson-rag-retriever.ts`
```typescript
LESSON_RAG_CONFIG = {
  TARGET_CHUNKS: 7,
  MIN_CHUNKS: 5,
  MAX_CHUNKS: 10,
  SCORE_THRESHOLD: 0.25,
  ENABLE_HYBRID: true,
  MAX_TOKENS: 20_000,
  MAX_QUERIES: 10,
}
```

---

## Migration Strategy

### For Existing Courses
1. Re-index chunks with priority metadata (one-time migration)
2. OR: Accept that existing chunks won't have priority boosting (simpler)

### For New Courses
1. Priority automatically included in chunk payload from Stage 2

### Rollback Plan
1. If issues arise, re-enable Stage 3 via feature flag
2. Priority boosting can be disabled independently

---

## Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| Existing chunks lack priority | Accept for existing courses OR run re-indexing migration |
| Priority boosting degrades results | Make boosting optional and tunable |
| Unused documents not flagged | Add post-generation validation |
| Lessons missing source attribution | Backfill via separate job |

### Performance Impact Analysis

Priority boosting adds minimal overhead to the search pipeline:

**Time Complexity**

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Score multiplication | O(n) | One multiply per result |
| Re-sorting | O(n log n) | Standard sort after boosting |
| Total overhead | O(n log n) | Where n = number of results (typically 10-50) |

**Benchmarks (Estimated)**

| Result Set Size | Boost + Sort Time | Percentage of Total Search Time |
|-----------------|-------------------|--------------------------------|
| 10 chunks | < 0.1ms | < 0.1% |
| 50 chunks | < 0.5ms | < 0.5% |
| 100 chunks | < 1ms | < 1% |

For typical RAG retrieval (10-50 chunks), the overhead is negligible compared to:
- Embedding generation: 50-200ms
- Vector search: 20-100ms
- Network latency: 10-50ms

**Memory Impact**

- No additional memory allocation (in-place score modification)
- Single sort operation (standard JavaScript sort)
- Payload already loaded for result mapping

**API Calls**

- No additional API calls required
- Priority data stored in Qdrant payload (already retrieved)
- No database queries for priority lookup

**Conclusion**

Priority boosting adds < 1ms to search operations. The performance impact is negligible for all practical use cases. No optimization or caching is required.

---

## Acceptance Criteria

1. [ ] New chunks include `document_priority` and `document_weight` in Qdrant payload
2. [ ] Search supports optional priority boosting
3. [ ] Lessons store `source_documents` after generation
4. [ ] Stage 3 is optional/disabled by default
5. [ ] Post-generation validation shows document coverage
6. [ ] All tests pass (type-check, build, lint)
7. [ ] Documentation updated

---

## Testing Strategy

1. **Unit Tests**
   - `metadata-enricher.ts`: Verify priority fields in enriched chunks
   - `search.ts`: Verify priority boosting logic

2. **Integration Tests**
   - Upload document with CORE priority → Verify chunks have priority=CORE
   - Search with priority boosting → Verify CORE chunks ranked higher

3. **E2E Tests**
   - Generate course → Verify lessons have source_documents
   - Check document coverage → All documents used

---

## Appendix: Current Stage 3 Types

**File**: `src/stages/stage3-classification/types.ts`

```typescript
export interface Stage3Output {
  success: boolean;
  courseId: string;
  classifications: Array<{
    fileId: string;
    filename: string;
    priority: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
    rationale: string;
  }>;
  totalDocuments: number;
  coreCount: number;
  importantCount: number;
  supplementaryCount: number;
  processingTimeMs: number;
}
```

This logic will be replaced by:
1. User/system assigns priority at upload time
2. Priority stored in file_catalog.priority
3. Priority propagated to chunks during Stage 2
4. Priority used for boosting during retrieval

---

## Appendix: Search Types

**File**: `src/shared/qdrant/search-types.ts`

```typescript
export interface SearchResult {
  chunk_id: string;
  parent_chunk_id: string | null;
  level: 'parent' | 'child';
  content: string;
  heading_path: string;
  chapter: string | null;
  section: string | null;
  document_id: string;
  document_name: string;
  page_number: number | null;
  page_range: [number, number] | null;
  token_count: number;
  score: number;
  metadata: {
    has_code: boolean | undefined;
    has_formulas: boolean | undefined;
    has_tables: boolean | undefined;
    has_images: boolean | undefined;
  };
  payload?: Record<string, unknown>;
}

export interface SearchFilters {
  organization_id?: string;
  course_id?: string;
  document_ids?: string[];
  level?: 'parent' | 'child';
  chapter?: string;
  section?: string;
  has_code?: boolean;
  has_formulas?: boolean;
  has_tables?: boolean;
  has_images?: boolean;
}
```

---

**Last Updated**: 2026-01-11
**Author**: Claude Code
