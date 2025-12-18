# Embeddings & Document Processing Module

**Task**: T074.3 - Implement Markdown conversion pipeline for document processing
**User Story**: US5 (RAG Infrastructure)
**Status**: ✅ COMPLETED

## Overview

This module provides the complete document processing pipeline for the RAG (Retrieval-Augmented Generation) system. It converts various document formats (PDF, DOCX, PPTX, HTML) to unified Markdown format using Docling MCP, extracts structured metadata, processes images with OCR, and prepares documents for hierarchical chunking.

## Architecture

```
Document File (PDF/DOCX/PPTX/HTML)
        ↓
Docling MCP Server (T074.1.2)
        ↓
DoclingDocument JSON + Markdown
        ↓
Markdown Converter (T074.3) ← YOU ARE HERE
        ↓
Hierarchical Chunking (T075)
        ↓
Jina Embeddings (T074.4)
        ↓
Qdrant Vector Store (T073.1)
```

## Components

### 1. Markdown Converter (`markdown-converter.ts`)

Converts DoclingDocument JSON to clean Markdown format for chunking.

**Features**:
- Unified format for all document types (PDF, DOCX, PPTX → same Markdown)
- Preserves document structure (H1-H6 headings, tables, images, formulas)
- Human-readable and debuggable
- LangChain `MarkdownHeaderTextSplitter` ready
- Zero additional cost (Docling native export)

**Key Functions**:
```typescript
// Main entry point - converts document file to Markdown + metadata
convertDocumentToMarkdown(filePath: string, options?: MarkdownConversionOptions): Promise<ConversionResult>

// Alternative - convert from existing DoclingDocument JSON
convertDoclingDocumentToMarkdown(document: DoclingDocument, options?: MarkdownConversionOptions): string
```

**Output**:
```typescript
interface ConversionResult {
  markdown: string;              // Clean Markdown text for T075
  json: DoclingDocument;         // Full JSON for metadata enrichment
  images: ImageMetadata[];       // Extracted images with captions
  structure: DocumentStructure;  // Heading hierarchy
  metadata: ConversionMetadata;  // Processing stats
}
```

**Supported Elements**:
- ✅ Headings (H1-H6) with automatic level detection
- ✅ Paragraphs and text blocks
- ✅ Lists (bulleted)
- ✅ Tables (Markdown table syntax)
- ✅ Images with captions and alt text
- ✅ Formulas (LaTeX: `$...$` inline, `$$...$$` block)
- ✅ Code blocks (triple backticks)
- ✅ OCR text from images (embedded as blockquotes)

### 2. Structure Extractor (`structure-extractor.ts`)

Extracts hierarchical structure from Markdown for intelligent chunking.

**Features**:
- Section boundary detection with character offsets
- Hierarchical section paths (e.g., "Chapter 1 > Section 1.1 > Subsection 1.1.1")
- Parent-child section relationships
- Section-based chunking support
- Document statistics and analysis

**Key Functions**:
```typescript
// Extract all section boundaries from markdown
extractSectionBoundaries(markdown: string, structure?: DocumentStructure): SectionBoundary[]

// Find the most specific section containing an offset
getMostSpecificSection(boundaries: SectionBoundary[], offset: number): SectionBoundary | undefined

// Enrich chunk with section context for RAG
enrichChunkWithContext(chunk: string, offset: number, boundaries: SectionBoundary[]): ChunkMetadata

// Split document by sections
splitBySections(markdown: string, maxLevel: number = 3): Array<{boundary, content}>

// Calculate section statistics
calculateSectionStatistics(boundaries: SectionBoundary[]): {...}

// Build table of contents
buildTableOfContents(boundaries: SectionBoundary[], maxLevel: number = 3): string
```

**Use Cases**:
- T075 hierarchical chunking (section-aware splitting)
- RAG retrieval (include section context in chunks)
- Document navigation (table of contents)
- Quality analysis (section length distribution)

### 3. Image Processor (`image-processor.ts`)

Handles image extraction, OCR text processing, and image metadata management.

**Features (Basic - FREE)**:
- Extract images from DoclingDocument
- Process OCR text from images (Docling built-in)
- Generate image references for chunks
- Link images to document sections
- Quality filtering (size, OCR length, confidence)

**Features (Premium - T074.5 - DEFERRED)**:
- ⏸️ Generate semantic image descriptions using Vision API
- ⏸️ Advanced image classification
- ⏸️ Image-to-text retrieval enhancement

**Key Functions**:
```typescript
// Process all images from a document
processImages(document: DoclingDocument, options?: ImageProcessingOptions): Promise<ImageProcessingResult>

// Extract image references from markdown
extractImageReferences(markdown: string): Array<{alt, url, offset, length}>

// Link images to sections
linkImagesToSections(images: ProcessedImage[], sections: Array<{heading, page_no}>): Map<string, ProcessedImage[]>

// Generate image summaries for chunks
generateImageSummary(images: ProcessedImage[]): string

// Filter images by quality
filterImagesByQuality(images: ProcessedImage[], criteria: {...}): ProcessedImage[]
```

### 4. Document Processing Job Handler (`handlers/document-processing.ts`)

BullMQ job handler that orchestrates the complete document processing pipeline.

**Pipeline Steps**:
1. Convert document to Markdown + JSON using Docling MCP (10% progress)
2. Process images with OCR text extraction (30% progress)
3. Extract document structure (sections, headings) (50% progress)
4. Store results in `file_catalog` table (80% progress)
5. Update `vector_status` to 'ready' (95% progress)

**Job Data**:
```typescript
interface DocumentProcessingJobData {
  fileId: string;           // File ID in file_catalog
  filePath: string;         // Absolute path to document
  enableOcr?: boolean;      // Enable OCR (default: true)
  extractImages?: boolean;  // Extract images (default: true)
  extractTables?: boolean;  // Extract tables (default: true)
}
```

**Database Updates**:
- `parsed_content` (JSONB): Full DoclingDocument JSON with metadata
- `markdown_content` (TEXT): Converted Markdown for chunking
- `vector_status`: Updated to 'ready' for T075 chunking

**Error Handling**:
- Automatic retries with exponential backoff
- Cancellation support (checks periodically)
- Updates `vector_status` to 'failed' on error
- Structured logging with job context

## Database Schema

### Migration: `20251014_add_document_processing_columns.sql`

```sql
-- Add columns to file_catalog
ALTER TABLE file_catalog
ADD COLUMN parsed_content JSONB,        -- DoclingDocument JSON
ADD COLUMN markdown_content TEXT;       -- Converted Markdown

-- Indexes for performance
CREATE INDEX idx_file_catalog_parsed_content_metadata
ON file_catalog USING GIN ((parsed_content -> 'metadata'));

CREATE INDEX idx_file_catalog_markdown_content_search
ON file_catalog USING GIN (to_tsvector('english', markdown_content));

-- View for processing status
CREATE VIEW file_catalog_processing_status AS
SELECT id, filename, vector_status,
       CASE
         WHEN parsed_content IS NULL THEN 'not_processed'
         WHEN markdown_content IS NULL THEN 'json_only'
         ELSE 'fully_processed'
       END AS processing_status,
       (parsed_content -> 'metadata' ->> 'page_count')::INTEGER AS page_count,
       jsonb_array_length(parsed_content -> 'texts') AS text_elements,
       jsonb_array_length(parsed_content -> 'pictures') AS image_count,
       jsonb_array_length(parsed_content -> 'tables') AS table_count,
       length(markdown_content) AS markdown_length
FROM file_catalog;

-- Function to update processing data
CREATE FUNCTION update_file_catalog_processing(
  p_file_id UUID,
  p_parsed_content JSONB,
  p_markdown_content TEXT
) RETURNS void AS $$
BEGIN
  UPDATE file_catalog
  SET parsed_content = p_parsed_content,
      markdown_content = p_markdown_content,
      updated_at = NOW()
  WHERE id = p_file_id;
END;
$$ LANGUAGE plpgsql;
```

## Usage Examples

### Basic Document Processing

```typescript
import { convertDocumentToMarkdown } from '@/shared/embeddings';

// Convert document to markdown
const result = await convertDocumentToMarkdown('/path/to/document.pdf', {
  include_images: true,
  include_tables: true,
  include_ocr: true,
  include_formulas: true,
});

console.log('Markdown length:', result.markdown.length);
console.log('Pages:', result.metadata.pages_processed);
console.log('Images:', result.images.length);
console.log('Tables:', result.metadata.tables_extracted);
console.log('Sections:', result.structure.sections.length);
```

### Structure Extraction

```typescript
import { extractSectionBoundaries, calculateSectionStatistics } from '@/shared/embeddings';

// Extract section boundaries
const boundaries = extractSectionBoundaries(markdown, structure);

// Calculate statistics
const stats = calculateSectionStatistics(boundaries);
console.log('Total sections:', stats.total_sections);
console.log('Max depth:', stats.total_depth);
console.log('Average section length:', stats.avg_section_length);

// Find section at specific offset
const section = getMostSpecificSection(boundaries, 1234);
console.log('Section:', section?.heading);
console.log('Section path:', section?.path.join(' > '));
```

### Image Processing

```typescript
import { processImages, generateImageSummary } from '@/shared/embeddings';

// Process images from document
const imageResult = await processImages(doclingDocument, {
  include_ocr: true,
  min_ocr_length: 10,
  extract_data: false, // Don't store base64 in DB
});

console.log('Total images:', imageResult.total);
console.log('Images with OCR:', imageResult.with_ocr);

// Generate summary for chunk metadata
const summary = generateImageSummary(imageResult.images);
console.log(summary);
// Output: "[2 image(s) in this section]
//          - Caption: "Figure 1", OCR: "Image text..."
//          - Caption: "Figure 2""
```

### Queue Job

```typescript
import { addJob } from '@/orchestrator/queue';
import { JobType } from '@megacampus/shared-types';

// Add document processing job to queue
const job = await addJob(JobType.DOCUMENT_PROCESSING, {
  jobType: JobType.DOCUMENT_PROCESSING,
  organizationId: 'org-123',
  courseId: 'course-456',
  userId: 'user-789',
  fileId: 'file-abc',
  filePath: '/storage/documents/sample.pdf',
  enableOcr: true,
  extractImages: true,
  extractTables: true,
  createdAt: new Date().toISOString(),
});

console.log('Job ID:', job.id);
```

## Testing

### Run Tests

```bash
# Run all embeddings tests
npm test -- embeddings

# Run specific test suite
npm test -- markdown-converter.test.ts
npm test -- structure-extractor.test.ts
```

### Test Coverage

- ✅ Markdown conversion with all element types
- ✅ Structure extraction and section boundaries
- ✅ Image processing and OCR text handling
- ✅ Table conversion to markdown format
- ✅ Formula preservation (LaTeX)
- ✅ Heading hierarchy and paths
- ✅ Section-based splitting
- ✅ Chunk metadata enrichment
- ✅ Edge cases (empty documents, whitespace, special characters)
- ✅ Multi-page complex documents

## Integration with RAG Pipeline

### Workflow

```
1. User uploads document → Stored in Supabase Storage
2. File record created → file_catalog with vector_status='pending'
3. DOCUMENT_PROCESSING job queued → BullMQ
4. Worker processes document → Docling MCP + Markdown Converter
5. Results stored → file_catalog (parsed_content, markdown_content)
6. Status updated → vector_status='ready'
7. CHUNKING job queued (T075) → Hierarchical chunking
8. EMBEDDING job queued (T074.4) → Jina embeddings
9. Vectors stored → Qdrant (T073.1)
10. Status updated → vector_status='completed'
```

### Data Flow

```
file_catalog
  ├── id (UUID)
  ├── filename (TEXT)
  ├── storage_path (TEXT)
  ├── parsed_content (JSONB)        ← Stored by T074.3
  │   ├── schema_version
  │   ├── texts[] (with types, fonts, coordinates)
  │   ├── pictures[] (with OCR, captions)
  │   ├── tables[] (structured data)
  │   ├── pages[]
  │   └── metadata (page_count, format, processing)
  ├── markdown_content (TEXT)       ← Stored by T074.3
  │   └── Clean Markdown for chunking
  └── vector_status                 ← Updated by T074.3
      └── 'ready' (triggers T075)
```

### Dependencies

- **T074.1.2** (Docling MCP Server) - ✅ COMPLETED - Provides document conversion
- **T074.3** (Markdown Converter) - ✅ COMPLETED - **THIS TASK**
- **T075** (Hierarchical Chunking) - ⏸️ PENDING - Consumes markdown_content
- **T074.4** (Jina Embeddings) - ✅ COMPLETED - Generates embeddings for chunks
- **T073.1** (Qdrant Setup) - ✅ COMPLETED - Stores vector embeddings

## Advantages of Markdown Format

1. **Unified Format**: All document types (PDF, DOCX, PPTX, HTML) → same Markdown
2. **Structure Preservation**: Natural heading-based boundaries for hierarchical chunking
3. **Human-Readable**: Can show preview to users, easy debugging
4. **LangChain Ready**: Works seamlessly with `MarkdownHeaderTextSplitter`
5. **Metadata Rich**: Combine Markdown text + JSON metadata for comprehensive chunks
6. **Zero Cost**: Docling native export (no additional API calls)
7. **Simplicity**: Easier to process than complex XML/HTML structures

## Hybrid Approach (Markdown + JSON)

The system stores **both** formats for best of both worlds:

### Markdown Content (TEXT)
- Used for chunking (clean, structured)
- Natural boundaries (headings)
- Human-readable
- LangChain compatible

### Parsed Content (JSONB)
- Enriches chunks with metadata
- Page numbers and coordinates
- Image and table references
- Font and style information
- Comprehensive structure

### Example Chunk Metadata
```typescript
{
  text: "Section 1.1 content...",        // From markdown_content
  heading: "Subsection 1.1",              // From structure extraction
  heading_path: ["Chapter 1", "Section 1", "Subsection 1.1"],
  page_no: 5,                             // From parsed_content
  images: [                               // From parsed_content.pictures
    { id: "img-1", caption: "Figure 1", ocr_text: "..." }
  ],
  coordinates: { x: 100, y: 200, w: 400, h: 100 },  // From parsed_content
}
```

## NOT Included (Out of Scope)

- ❌ Clickable source links (removed from spec)
- ❌ Razdel integration (removed, Jina-v3 multilingual sufficient)

## Deferred to PREMIUM Tier (T074.5 - Optional)

- ⏸️ Vision API for semantic image descriptions (Jina/OpenRouter/GPT-4o)
- ⏸️ Advanced table structure analysis
- ⏸️ Image classification and tagging

## Performance Considerations

- **Docling Processing**: ~1-5 seconds per page (depends on complexity)
- **Markdown Conversion**: <100ms (fast, native export)
- **Image Processing**: ~50ms per image (OCR text extraction)
- **Structure Extraction**: <50ms (regex parsing)
- **Database Storage**: <100ms (JSONB insert)

**Total**: ~1-5 seconds per page + overhead

## Error Handling

All functions throw descriptive errors:

```typescript
try {
  const result = await convertDocumentToMarkdown(filePath);
} catch (error) {
  if (error instanceof MarkdownConversionError) {
    console.error('Conversion failed:', error.message, error.cause);
  } else if (error instanceof DoclingError) {
    console.error('Docling error:', error.code, error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

**Common Error Codes**:
- `FILE_NOT_FOUND`: Document file doesn't exist
- `UNSUPPORTED_FORMAT`: File format not supported
- `PROCESSING_ERROR`: Docling processing failed
- `TIMEOUT`: Processing exceeded timeout
- `OCR_ERROR`: OCR processing failed
- `CORRUPTED_FILE`: File is corrupted or invalid

## Monitoring and Metrics

The document processing handler tracks:
- Processing time per document
- Success/failure rates
- Images extracted
- Tables extracted
- Section count
- Markdown length

Access metrics via:
```typescript
import { metricsStore } from '@/orchestrator/metrics';

const metrics = metricsStore.getJobMetrics(JobType.DOCUMENT_PROCESSING);
console.log('Total processed:', metrics.total);
console.log('Success rate:', metrics.successRate);
console.log('Avg duration:', metrics.avgDuration);
```

## Future Enhancements (Post-MVP)

1. **Semantic Image Descriptions** (T074.5)
   - Vision API integration (Jina/OpenRouter/GPT-4o)
   - Image classification and tagging
   - Enhanced RAG retrieval with image context

2. **Advanced Table Analysis**
   - Header detection
   - Cell relationship mapping
   - Semantic table understanding

3. **Multi-Language Support**
   - Language detection per section
   - Language-specific OCR models
   - Multilingual embeddings

4. **Incremental Processing**
   - Process only changed pages
   - Delta updates to vectors
   - Faster re-processing

## References

- **Docling Documentation**: https://github.com/DS4SD/docling
- **LangChain Text Splitters**: https://python.langchain.com/docs/modules/data_connection/document_transformers/
- **Task Specification**: `/specs/001-stage-0-foundation/tasks.md#T074.3`
- **Architecture**: `/specs/001-stage-0-foundation/architecture.md`

## Support

For issues or questions about document processing:
1. Check the test suite for usage examples
2. Review Docling MCP logs for conversion errors
3. Check BullMQ dashboard for job failures
4. Consult the architecture documentation

---

**Implementation Date**: 2025-10-14
**Implemented By**: infrastructure-specialist agent
**Status**: ✅ PRODUCTION READY
