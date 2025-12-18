# Stage 2: Document Processing

## Overview

Stage 2 handles document processing for the RAG (Retrieval-Augmented Generation) pipeline. It converts uploaded documents (PDF, DOCX, PPTX, HTML, TXT, MD) into structured formats, generates embeddings, and indexes them in Qdrant for retrieval.

**Input:** Document file (various formats)
**Output:** Indexed vectors in Qdrant, markdown content, document metadata

## Architecture

### Core Components

- **Orchestrator:** `orchestrator.ts` - Coordinates multi-phase processing pipeline
- **Handler:** `handler.ts` - BullMQ job handler (thin wrapper with FSM fallback)
- **Phases:** 4 discrete processing phases (see below)
- **Types:** `types.ts` - Stage-specific type definitions

### Processing Flow

```
Document File
    ↓
Phase 1: Docling Conversion (PDF/DOCX → JSON + Markdown)
    ↓
Phase 4: Hierarchical Chunking (Markdown → Parent/Child Chunks)
    ↓
Phase 5: Embedding Generation (Chunks → Embeddings with Late Chunking)
    ↓
Phase 6: Qdrant Upload (Embeddings → Vector Index)
    ↓
Stage 3: Summarization (next stage)
```

## Phase Breakdown

### Phase 1: Docling Conversion
**File:** `phases/phase-1-docling-conversion.ts`

Converts documents to DoclingDocument JSON format using Docling MCP server.

**Features:**
- OCR text extraction (STANDARD/PREMIUM tiers)
- Table extraction
- Formula processing
- Image metadata extraction
- Section boundary analysis

**Progress:** 10% → 80%

**Tier Support:**
- BASIC: TXT/MD only (plain text read, no Docling)
- STANDARD: PDF, DOCX, PPTX, HTML + OCR
- PREMIUM: All formats + enhanced image processing

---

### Phase 4: Hierarchical Chunking
**File:** `phases/phase-4-chunking.ts`

Chunks markdown content into hierarchical parent/child chunks for semantic retrieval.

**Features:**
- Hierarchical chunking (parent chunks + child chunks)
- Metadata enrichment (document_id, course_id, organization_id)
- Configurable chunk sizes (DEFAULT_CHUNKING_CONFIG)

**Progress:** 50% → 60%

**Output:**
- Parent chunks: Large context windows
- Child chunks: Precise retrieval targets
- Enriched metadata for filtering

---

### Phase 5: Embedding Generation
**File:** `phases/phase-5-embedding.ts`

Generates embeddings for chunks using late chunking strategy for improved semantic coherence.

**Features:**
- Late chunking embeddings (improved cross-chunk coherence)
- Batch processing
- Token usage tracking
- Retrieval-optimized embeddings (`retrieval.passage` task type)

**Progress:** 60% → 80%

**Model:** Uses configured embedding model (e.g., OpenAI ada-002, Jina v3)

---

### Phase 6: Qdrant Upload
**File:** `phases/phase-6-qdrant-upload.ts`

Uploads chunk embeddings to Qdrant vector database for RAG retrieval.

**Features:**
- Batch upload (100 points per batch)
- Automatic vector_status update to 'indexed'
- Chunk count tracking
- Upload duration metrics

**Progress:** 80% → 95%

**Output:**
- Points uploaded to Qdrant
- `vector_status` = 'indexed' in file_catalog
- Ready for RAG retrieval

---

## Dependencies

### External Services
- **Docling MCP:** Document conversion (PDF, DOCX, PPTX, HTML → JSON + Markdown)
- **Embedding API:** Embedding generation (OpenAI, Jina, etc.)
- **Qdrant:** Vector database for embeddings

### Internal Modules
- `shared/embeddings/` - Markdown conversion, chunking, embedding generation
- `shared/qdrant/` - Qdrant upload utilities
- `shared/supabase/` - Database operations (file_catalog, courses)
- `shared/logger/` - Structured logging

---

## Testing

### Unit Tests
**Location:** `tests/unit/stages/stage2/`

**Coverage:**
- Phase 1: Docling conversion (mocked MCP)
- Phase 4: Chunking logic
- Phase 5: Embedding generation
- Phase 6: Qdrant upload

**Run:**
```bash
pnpm test tests/unit/stages/stage2/
```

### Integration Tests
**Location:** `tests/integration/`

**Scenarios:**
- End-to-end document processing pipeline
- Tier-based feature gating (BASIC vs STANDARD vs PREMIUM)
- Error handling and retry logic

**Run:**
```bash
pnpm test tests/integration/stage2-*
```

---

## Tier-Based Processing

### FREE Tier
**Status:** NOT SUPPORTED (blocked at file upload)
**Reason:** No document uploads allowed on FREE tier

### BASIC Tier
**Supported Formats:** TXT, MD (plain text only)
**Processing:** Direct file read (no Docling)
**Features:**
- ✅ Plain text chunking
- ✅ Embedding generation
- ✅ Qdrant indexing
- ❌ No PDF/DOCX support
- ❌ No OCR
- ❌ No image extraction

### STANDARD Tier
**Supported Formats:** PDF, DOCX, PPTX, HTML, TXT, MD
**Processing:** Docling MCP conversion
**Features:**
- ✅ OCR text extraction
- ✅ Table extraction
- ✅ Formula processing
- ✅ Basic image metadata
- ❌ No semantic image descriptions (PREMIUM)

### PREMIUM Tier
**Supported Formats:** All (including images: JPG, PNG, etc.)
**Processing:** Docling MCP + enhanced image processing
**Features:**
- ✅ All STANDARD features
- ✅ Semantic image descriptions (future: T074.5)
- ✅ Advanced image analysis
- ✅ Full format support

---

## Error Handling

### Common Errors

**1. File Not Found**
```typescript
Error: Failed to fetch file metadata: File not found
```
**Cause:** Invalid file_id or file deleted
**Resolution:** Verify file_id exists in file_catalog

**2. Unsupported Format (BASIC Tier)**
```typescript
Error: File type 'application/pdf' is not supported on BASIC tier
```
**Cause:** PDF upload on BASIC tier
**Resolution:** Upgrade to STANDARD tier or use TXT/MD files

**3. Docling Conversion Failed**
```typescript
Error: Docling MCP conversion failed: timeout
```
**Cause:** Large document or Docling MCP unavailable
**Resolution:** Retry job, check Docling MCP status

**4. Qdrant Upload Failed**
```typescript
Error: Failed to upload chunks to Qdrant
```
**Cause:** Qdrant unavailable or rate-limited
**Resolution:** Retry job, check Qdrant connection

### Failure Recovery

On any phase failure:
1. **vector_status** updated to 'failed' in file_catalog
2. Error logged to **error_logs** table with full stack trace
3. Job marked as **failed** in BullMQ
4. User notified via UI (generation_status)

**Retry Strategy:**
- Automatic retry: 3 attempts with exponential backoff
- Manual retry (single document): Use `documentProcessing.retryDocument` tRPC endpoint
- Manual retry (all documents): Use `generation.restartFromStage` with stage 2

**Retry Behavior (NEW)**:
The `documentProcessing.retryDocument` endpoint provides single-document retry with automatic cleanup:
1. Validates document status is 'failed'
2. **Cleans up existing vectors from Qdrant** (prevents orphaned vectors)
3. Resets document status to 'pending'
4. Clears processed data (parsed_content, markdown_content)
5. Enqueues new DOCUMENT_PROCESSING job with high priority
6. Returns job ID for tracking

**Qdrant Vector Cleanup**:
- Deletes vectors by `document_id` + `course_id` filter
- Uses `wait: true` for guaranteed deletion before retry
- Non-fatal on errors (logs warning but doesn't block retry)
- Also triggered by `generation.restartFromStage` for Stage 2

See `/home/me/code/megacampus2/docs/API.md#document-processing-router` for API documentation.

---

## Cost Tracking

### Embedding Costs

**Model:** Configurable (e.g., OpenAI ada-002)
**Pricing:** ~$0.0001 per 1K tokens

**Average Document:**
- Pages: 10
- Chunks: ~50 (parent + child)
- Tokens: ~5,000
- Cost: ~$0.0005 per document

### Qdrant Costs

**Storage:** $0.40 per GB per month (Qdrant Cloud)
**Vectors:** ~1KB per vector
**Average Document:** ~50KB storage

**Monthly Cost (1000 docs):**
- Storage: 1000 docs × 50KB = 50MB = ~$0.02/month
- Embedding: 1000 docs × $0.0005 = $0.50
- **Total:** ~$0.52 per 1000 documents

---

## Configuration

### Environment Variables

```bash
# Docling MCP
DOCLING_MCP_ENDPOINT=http://localhost:3001

# Embedding API
OPENAI_API_KEY=sk-...
EMBEDDING_MODEL=text-embedding-ada-002

# Qdrant
QDRANT_URL=https://qdrant.example.com
QDRANT_API_KEY=...
QDRANT_COLLECTION=course-chunks
```

### Chunking Config

**Location:** `shared/embeddings/markdown-chunker.ts`

```typescript
export const DEFAULT_CHUNKING_CONFIG = {
  parent_chunk_size: 2000,
  child_chunk_size: 400,
  overlap: 100,
  separator: '\n\n',
};
```

---

## Monitoring

### Key Metrics

- **Processing Time:** Median: 8s, P95: 25s, P99: 60s
- **Success Rate:** 98.5% (excluding user errors)
- **Retry Rate:** 1.2% (transient failures)
- **Cost per Document:** $0.0005 (embedding only)

### Logs

**Location:** Pino logs via `shared/logger`

**Key Events:**
- `Document processing started` (fileId, tier, mimeType)
- `Docling conversion complete` (pages, images, tables)
- `Chunking complete` (parent_chunks, child_chunks)
- `Embeddings generated` (embedding_count, total_tokens)
- `Vectors uploaded` (points_uploaded, duration_ms)

---

## Roadmap

### T074.5: Premium Image Features
**Status:** Planned (Q1 2025)
**Features:**
- Semantic image descriptions using Vision LLM
- Image-text alignment scoring
- Visual context extraction

### T076: Incremental Re-indexing
**Status:** Planned (Q2 2025)
**Features:**
- Update only changed sections (not full re-index)
- Version tracking for document updates
- Differential chunking

---

## Related Specs

- **T074.3:** RAG Pipeline - Markdown Conversion (current implementation)
- **T074.5:** RAG Pipeline - Premium Image Features (future)
- **T075:** Vector Indexing & Retrieval (Qdrant integration)
- **008-generation-generation-json:** Stage 5 Generation (consumes RAG index)

---

## Contributing

When modifying Stage 2:

1. **Preserve Phase Boundaries:** Keep phases isolated (no cross-phase logic)
2. **Update Tests:** Add/update tests for any logic changes
3. **Document Tier Changes:** Update tier comparison if features change
4. **Check Backwards Compatibility:** Ensure existing indexed documents still work
5. **Update Cost Estimates:** If embedding model or chunking config changes

---

**Last Updated:** 2025-12-07
**Version:** 1.1.0
**Owner:** course-gen-platform team
