# PREMIUM Tier: Advanced Docling Features

**Task ID**: FUTURE-PREMIUM-001
**Priority**: P2 (Stage 3)
**Tier**: PREMIUM ($149/month)
**Created**: 2025-10-27
**Updated**: 2025-10-28 (post T074.5)
**Estimated Effort**: 1.5-2 weeks (reduced from 2-3 weeks)
**Status**: Backlog (Stage 3) - Partially unblocked by T074.5

---

## 📋 Overview

Implement advanced Docling features for PREMIUM tier to maximize document conversion quality and enable processing of image-rich documents with semantic understanding.

**Context**: Currently (Stage 0), we focus on STANDARD tier with basic Docling MCP integration for text-based documents. PREMIUM enhancements will unlock:
- Image-based PDF processing (scanned documents)
- Semantic image descriptions via Vision API
- Structure-aware chunking with advanced parsing
- Support for 100MB+ files via PDF chunking

---

## 🎯 Goals

### Primary Goals
1. **Enable image processing** for PREMIUM tier (PNG, JPG, GIF support)
2. **Implement Vision API integration** for semantic image descriptions
3. **Add PDF chunking** for large files (>10 MB → 100 MB support)
4. **Implement structure-aware chunking** for complex documents

### Success Metrics
- ✅ Process scanned PDFs with >90% OCR accuracy
- ✅ Support files up to 100 MB (vs 10 MB in STANDARD)
- ✅ Generate semantic descriptions for images (3-5 sentences)
- ✅ Maintain processing time <5 minutes for 100 MB files

---

## 📊 Feature Comparison

| Feature | STANDARD (Current) | PREMIUM (Target) |
|---------|-------------------|------------------|
| **Max File Size** | 10 MB | 100 MB |
| **Image Support** | ❌ No (images ignored) | ✅ Yes (PNG, JPG, GIF) |
| **OCR** | ✅ Tesseract/EasyOCR (free) | ✅ Tesseract/EasyOCR + enhanced |
| **Vision API** | ❌ No | ✅ Yes (semantic descriptions) |
| **PDF Chunking** | ❌ No | ✅ Yes (10 MB chunks) |
| **Processing Time** | 15-120s (10 MB) | 60-300s (100 MB) |
| **Cost per Document** | $0.02-0.05 | $0.40-0.70 |

---

## 🔧 Implementation Tasks

### ✅ COMPLETED (via T074.5): DoclingDocument JSON Retrieval

**What T074.5 delivered** (2025-10-28):
- ✅ Full `DoclingDocument` structure with `pictures[]` array
- ✅ Image metadata: `{ id, page_no, bbox, caption, ocr_text, format, data }`
- ✅ OCR text extraction working
- ✅ Volume mount for direct JSON access

**What's still needed for PREMIUM**:
- ❌ High-resolution image extraction (currently default quality)
- ❌ Supabase Storage integration (images not persisted)
- ❌ Vision API descriptions (only OCR text, no semantic understanding)

**Impact**: Task 1 effort **reduced from 1 week → 2-3 days** (infrastructure ready)

---

### Task 1: Complete Image Processing (2-3 days) - UPDATED

**Subtasks**:
1. Update Docling MCP configuration for PREMIUM tier
2. Enable image extraction in pipeline options
3. Implement image storage in Supabase Storage
4. Update metadata schema for image references

**Code Changes**:
```typescript
// packages/course-gen-platform/src/shared/docling/client.ts

// PREMIUM-specific configuration
export function createPremiumDoclingConfig(): PdfPipelineOptions {
  const options = new PdfPipelineOptions();

  // Enable image processing
  options.generate_picture_images = true;
  options.images_scale = 2.0;  // High quality
  options.extract_images = true;

  // Enable OCR for scanned images
  options.do_ocr = true;
  options.ocr_options = {
    lang: ["en", "ru", "es", "de", "fr"],
    confidence_threshold: 0.7,
  };

  return options;
}
```

**Deliverables**:
- [X] ~~Image metadata in DoclingDocument schema~~ (DONE via T074.5)
- [X] ~~OCR text extraction~~ (DONE via T074.5)
- [ ] High-resolution image extraction (quality settings)
- [ ] Image storage integration (Supabase Storage buckets)
- [ ] PREMIUM-specific Docling configuration
- [ ] Tests for high-res extraction

---

### Task 2: Vision API Integration (1 week) - CURRENT PRIORITY

**Options Analysis**:

| Provider | Cost per Image | Quality | Latency | Integration |
|----------|----------------|---------|---------|-------------|
| **Jina Vision** | $0.001-0.003 | High | 100-300ms | ✅ Easy (same provider) |
| **OpenRouter** | $0.002-0.005 | Very High | 200-500ms | ⚠️  Medium |
| **GPT-4o Vision** | $0.01-0.02 | Excellent | 300-800ms | ⚠️  Medium |

**Recommendation**: Start with **Jina Vision** (same provider as embeddings, simplest integration)

**Subtasks**:
1. Research and select Vision API provider
2. Implement Vision API client wrapper
3. Integrate with Docling pipeline (post-processing)
4. Add image descriptions to chunk metadata
5. Implement caching for image descriptions

**Code Changes**:
```typescript
// packages/course-gen-platform/src/shared/vision/jina-vision-client.ts

export interface ImageDescription {
  image_id: string;
  url: string;
  description: string;  // 3-5 sentences
  confidence: number;
  timestamp: Date;
}

export class JinaVisionClient {
  async describeImage(imageUrl: string): Promise<ImageDescription> {
    // Call Jina Vision API
    // Generate semantic description
    // Return structured result
  }

  async describeBatch(imageUrls: string[]): Promise<ImageDescription[]> {
    // Batch processing for efficiency
  }
}

// Integration with Docling pipeline
export async function enrichDocumentWithVision(
  document: DoclingDocument,
  images: ExtractedImage[]
): Promise<EnrichedDocument> {
  const visionClient = new JinaVisionClient();

  for (const image of images) {
    const description = await visionClient.describeImage(image.url);

    // Add description to nearest text chunk
    // Update metadata with image context
  }

  return enrichedDocument;
}
```

**Deliverables**:
- [ ] Vision API client (Jina/OpenRouter/GPT-4o)
- [ ] Integration with document processing pipeline
- [ ] Image description caching (avoid re-processing)
- [ ] Cost tracking for Vision API calls
- [ ] Tests for vision enrichment

---

### Task 3: PDF Chunking for Large Files (3-4 days)

**Problem**: Docling MCP Server may timeout or crash on files >10 MB

**Solution**: Pre-process large PDFs by splitting into chunks, process separately, merge results

**Subtasks**:
1. Implement PDF chunking utility (pdf-lib)
2. Add pre-processing step before Docling conversion
3. Implement result merging with page continuity
4. Update file size validation (10 MB → 100 MB for PREMIUM)

**Code Changes**:
```typescript
// packages/course-gen-platform/src/shared/pdf/chunker.ts

export interface PDFChunk {
  chunk_id: string;
  page_start: number;
  page_end: number;
  file_path: string;
  size_bytes: number;
}

export async function chunkLargePDF(
  pdfPath: string,
  maxChunkSize: number = 10 * 1024 * 1024  // 10 MB
): Promise<PDFChunk[]> {
  const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath));
  const totalPages = pdfDoc.getPageCount();

  const chunks: PDFChunk[] = [];
  let currentChunk = await PDFDocument.create();
  let currentSize = 0;
  let startPage = 0;

  for (let i = 0; i < totalPages; i++) {
    const [page] = await currentChunk.copyPages(pdfDoc, [i]);
    currentChunk.addPage(page);

    const tempSize = (await currentChunk.save()).length;

    if (tempSize > maxChunkSize) {
      // Save current chunk
      chunks.push(await saveChunk(currentChunk, startPage, i - 1));

      // Start new chunk
      currentChunk = await PDFDocument.create();
      [page] = await currentChunk.copyPages(pdfDoc, [i]);
      currentChunk.addPage(page);
      startPage = i;
    }
  }

  // Save last chunk
  if (currentChunk.getPageCount() > 0) {
    chunks.push(await saveChunk(currentChunk, startPage, totalPages - 1));
  }

  return chunks;
}

// Integration with Docling
export async function processLargePDF(pdfPath: string): Promise<string> {
  const fileSize = fs.statSync(pdfPath).size;

  if (fileSize <= 10 * 1024 * 1024) {
    // Small file - process directly
    return await doclingClient.convertToMarkdown(pdfPath);
  }

  // Large file - chunk and process
  const chunks = await chunkLargePDF(pdfPath);
  const results: string[] = [];

  for (const chunk of chunks) {
    const markdown = await doclingClient.convertToMarkdown(chunk.file_path);
    results.push(markdown);
  }

  // Merge with page continuity markers
  return mergeMarkdownChunks(results, chunks);
}
```

**Deliverables**:
- [ ] PDF chunking utility (pdf-lib based)
- [ ] Pre-processing integration
- [ ] Result merging with continuity
- [ ] Update file size limits (PREMIUM tier)
- [ ] Tests for large file processing

---

### Task 4: Structure-Aware Chunking (1 week)

**Current**: Basic heading-based chunking (#, ##, ###)
**Target**: Advanced structure-aware chunking (sections, tables, figures, code blocks)

**Subtasks**:
1. Implement advanced structure parser
2. Detect special elements (tables, code, formulas)
3. Chunk based on semantic boundaries (not just headings)
4. Preserve context across complex structures

**Code Changes**:
```typescript
// packages/course-gen-platform/src/shared/chunking/structure-aware.ts

export interface StructuralElement {
  type: 'heading' | 'paragraph' | 'table' | 'code' | 'formula' | 'figure';
  level?: number;  // For headings
  content: string;
  metadata: Record<string, unknown>;
}

export class StructureAwareChunker {
  async parseStructure(document: DoclingDocument): Promise<StructuralElement[]> {
    // Parse document into structural elements
    // Identify sections, tables, code blocks
    // Preserve relationships
  }

  async chunkByStructure(
    elements: StructuralElement[]
  ): Promise<HierarchicalChunk[]> {
    // Chunk based on semantic boundaries
    // Keep tables together
    // Don't split code blocks
    // Maintain context across sections
  }
}
```

**Deliverables**:
- [ ] Structure-aware parser
- [ ] Advanced chunking logic
- [ ] Integration with hierarchical chunking
- [ ] Tests for complex document structures

---

## 💰 Cost Analysis

### Infrastructure Costs (PREMIUM Tier)

| Component | Monthly Cost | Notes |
|-----------|--------------|-------|
| Docling MCP (shared) | $0.20 | Amortized over 150+ orgs |
| Vision API | $0.03-0.10/doc | Jina Vision: ~$0.001-0.003/image |
| Storage (images) | $0.50-2.00 | Supabase Storage: $0.021/GB |
| Processing (CPU) | $1-5 | Additional compute for large files |
| **Total per org** | **$1.73-7.30** | Incremental over STANDARD |

### Per-Document Costs

| Operation | STANDARD | PREMIUM | Increase |
|-----------|----------|---------|----------|
| PDF (10 MB, text-only) | $0.02-0.05 | $0.02-0.05 | - |
| PDF (10 MB, with images) | N/A (not supported) | $0.40-0.70 | +$0.35-0.65 |
| PDF (100 MB, with images) | N/A (not supported) | $1.50-3.00 | +$1.45-2.95 |

**Break-even**: PREMIUM tier ($149/month) can process ~200-300 image-rich documents per month before reaching cost limits

---

## 🔗 Dependencies

### Completed (Stage 0)
- ✅ T074.3: Docling MCP Server integration (2025-10-27)
- ✅ T074.5: Full DoclingDocument JSON retrieval (2025-10-28) ⭐ **UNBLOCKS PREMIUM**
  - Provides foundation for image processing
  - `pictures[]` array with OCR text
  - Direct JSON access via volume mount
- ✅ T075: STANDARD RAG with hierarchical chunking

### Required Before Implementation
- ⏸️ STANDARD tier fully validated (Stage 0 completion)
- ⏸️ Pricing tier enforcement implemented (Stage 1)
- ⏸️ Storage quota management (Stage 1)

### Blocked By
- None (can start after Stage 1 completion)

---

## 🧪 Testing Strategy

### Unit Tests
- [ ] PDF chunking utility tests
- [ ] Vision API client tests (mocked)
- [ ] Structure parser tests
- [ ] Image extraction tests

### Integration Tests
- [ ] End-to-end large file processing (100 MB PDF)
- [ ] Image-rich document processing (scanned PDFs)
- [ ] Vision API integration (with real API calls)
- [ ] Cost tracking validation

### Performance Tests
- [ ] Large file processing time (<5 minutes for 100 MB)
- [ ] Vision API latency (<500ms per image)
- [ ] Memory usage (PDF chunking should not exceed 2 GB RAM)
- [ ] Concurrent processing (multiple PREMIUM users)

---

## 📝 Implementation Plan

### Phase 1: Research & Planning (3 days)
- [ ] Evaluate Vision API providers (Jina vs OpenRouter vs GPT-4o)
- [ ] Test PDF chunking strategies (pdf-lib vs alternatives)
- [ ] Design structure-aware chunking algorithm
- [ ] Create detailed cost model

### Phase 2: Core Implementation (2 weeks)
- [ ] Week 1: Image processing + Vision API integration
- [ ] Week 2: PDF chunking + Structure-aware chunking

### Phase 3: Testing & Validation (3-4 days)
- [ ] Unit + integration tests
- [ ] Performance benchmarks
- [ ] Cost tracking validation
- [ ] QA with real-world documents

### Phase 4: Documentation & Rollout (2 days)
- [ ] API documentation updates
- [ ] Pricing tier documentation
- [ ] Migration guide (STANDARD → PREMIUM)
- [ ] Feature announcement

**Total Timeline**: 1.5-2 weeks (updated post T074.5)

**Effort Reduction**:
- Task 1: 1 week → 2-3 days (DoclingDocument structure ready)
- Task 2: 1 week (unchanged - Vision API integration)
- Task 3: 3-4 days (unchanged - PDF chunking)
- Task 4: 1 week (unchanged - structure-aware chunking)

---

## 🚨 Risks & Mitigation

### Risk 1: Vision API Costs Higher Than Expected
**Probability**: Medium
**Impact**: High (affects PREMIUM tier profitability)

**Mitigation**:
- Start with cheapest provider (Jina Vision: $0.001/image)
- Implement aggressive caching (store descriptions permanently)
- Add cost alerts and circuit breakers
- Make Vision API optional (user toggle)

### Risk 2: Large File Processing Timeouts
**Probability**: Medium
**Impact**: High (poor UX for PREMIUM users)

**Mitigation**:
- Implement robust PDF chunking (tested up to 100 MB)
- Add progress tracking for long operations
- Use BullMQ with extended timeouts (10 minutes)
- Implement retry logic with exponential backoff

### Risk 3: OCR Accuracy Lower Than Expected
**Probability**: Low-Medium
**Impact**: Medium (quality issues)

**Mitigation**:
- Use multiple OCR engines (Tesseract + EasyOCR)
- Add confidence thresholds
- Allow manual review/editing of OCR results
- Provide feedback mechanism for improving OCR

---

## ✅ Success Criteria

### Functional Requirements
- [ ] Process image-based PDFs with >90% OCR accuracy
- [ ] Support files up to 100 MB without timeouts
- [ ] Generate semantic image descriptions (3-5 sentences)
- [ ] Maintain structure in complex documents (tables, code)

### Non-Functional Requirements
- [ ] Processing time: <5 minutes for 100 MB files
- [ ] Memory usage: <2 GB RAM during processing
- [ ] Cost per document: <$3.00 for 100 MB files
- [ ] Uptime: 99.9% availability

### Business Requirements
- [ ] PREMIUM tier profitability maintained (>40% margin)
- [ ] Clear differentiation from STANDARD tier
- [ ] Positive user feedback on image/large file support
- [ ] Migration path from STANDARD → PREMIUM

---

## 📚 References

### Documentation
- [Docling Best Practices](../investigations/docling-optimal-strategies.md)
- [PRICING-TIERS.md](../PRICING-TIERS.md)
- [Task 008 Investigation](../investigations/008-docling-pdf-export-investigation.md)

### External Resources
- [Jina Vision API](https://jina.ai/vision)
- [OpenRouter Vision Models](https://openrouter.ai/models?order=newest&vision=true)
- [pdf-lib Documentation](https://pdf-lib.js.org/)
- [Docling GitHub](https://github.com/docling-project/docling)

---

**Created**: 2025-10-27
**Status**: Backlog (Stage 3)
**Assignee**: TBD
**Related Tasks**: T075.4-PREMIUM, T075.8-PREMIUM, T075.XX-CHUNKING
