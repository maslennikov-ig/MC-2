/**
 * Metadata Enricher for RAG Chunks
 *
 * Enriches text chunks with comprehensive metadata from DoclingDocument JSON,
 * including page numbers, images, tables, and document structure information.
 *
 * This module links chunks to their source locations in the original PDF/document
 * by mapping markdown content positions back to DoclingDocument structure.
 *
 * @module shared/embeddings/metadata-enricher
 */

import type { TextChunk } from './markdown-chunker';
import type { DoclingDocument } from '../../stages/stage2-document-processing/docling/types';

/**
 * Enriched chunk with comprehensive metadata for Qdrant payload
 */
export interface EnrichedChunk extends TextChunk {
  /** Document metadata */
  document_id: string;
  document_name: string;
  document_version: string | null;
  version_hash: string | null;

  /** Source location (for PDFs) */
  page_number: number | null;
  page_range: [number, number] | null; // [start_page, end_page]

  /** Content metadata */
  has_code: boolean;
  has_formulas: boolean;
  has_tables: boolean;
  has_images: boolean;

  /** Multi-tenancy filtering */
  organization_id: string;
  course_id: string;

  /** Timestamps */
  indexed_at: string; // ISO 8601
  last_updated: string; // ISO 8601

  /** Image references in this chunk */
  image_refs: ImageReference[];

  /** Table references in this chunk */
  table_refs: TableReference[];
}

/**
 * Image reference in chunk
 */
export interface ImageReference {
  /** Image ID from DoclingDocument */
  image_id: string;
  /** Image caption/alt text */
  caption: string | null;
  /** Image position in document */
  page_number: number | null;
  /** Image storage path (Supabase) */
  storage_path: string | null;
}

/**
 * Table reference in chunk
 */
export interface TableReference {
  /** Table ID from DoclingDocument */
  table_id: string;
  /** Table caption */
  caption: string | null;
  /** Table position in document */
  page_number: number | null;
  /** Number of rows */
  row_count: number;
  /** Number of columns */
  col_count: number;
}

/**
 * Metadata enrichment options
 */
export interface EnrichmentOptions {
  /** Document ID (from file_catalog) */
  document_id: string;
  /** Document name */
  document_name: string;
  /** Document version */
  document_version?: string;
  /** Version hash */
  version_hash?: string;
  /** Organization ID (multi-tenancy) */
  organization_id: string;
  /** Course ID (multi-tenancy) */
  course_id: string;
  /** DoclingDocument JSON (optional, for enhanced metadata) */
  docling_json?: DoclingDocument;
}

/**
 * Detects if chunk contains code blocks
 *
 * @param content - Chunk content
 * @returns True if chunk contains code
 */
function detectCode(content: string): boolean {
  // Detect Markdown code blocks (```), inline code (`), or programming keywords
  const codeBlockPattern = /```[\s\S]*?```|`[^`]+`/;
  const keywordPattern = /\b(function|class|const|let|var|def|import|export|return)\b/;

  return codeBlockPattern.test(content) || keywordPattern.test(content);
}

/**
 * Detects if chunk contains mathematical formulas
 *
 * @param content - Chunk content
 * @returns True if chunk contains formulas
 */
function detectFormulas(content: string): boolean {
  // Detect LaTeX math ($...$, $$...$$), or math symbols
  const latexPattern = /\$\$[\s\S]*?\$\$|\$[^$]+\$/;
  const mathSymbols = /[∑∏∫∂∇√∞±≤≥≠≈∈∉⊂⊃∪∩∀∃∄]/;

  return latexPattern.test(content) || mathSymbols.test(content);
}

/**
 * Detects if chunk contains table markdown
 *
 * @param content - Chunk content
 * @returns True if chunk contains tables
 */
function detectTables(content: string): boolean {
  // Detect Markdown tables (| ... | ... |)
  const tablePattern = /\|[\s\S]*?\|[\s\S]*?\|/;
  return tablePattern.test(content);
}

/**
 * Detects if chunk contains image references
 *
 * @param content - Chunk content
 * @returns True if chunk contains images
 */
function detectImages(content: string): boolean {
  // Detect Markdown images (![alt](url))
  const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/;
  return imagePattern.test(content);
}

/**
 * Extracts image references from chunk content
 *
 * Parses Markdown image syntax and attempts to link to DoclingDocument images
 *
 * @param content - Chunk content
 * @param docling_json - DoclingDocument JSON (optional)
 * @returns Array of image references
 */
function extractImageReferences(
  content: string,
  docling_json?: DoclingDocument
): ImageReference[] {
  const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const references: ImageReference[] = [];

  let match;
  while ((match = imagePattern.exec(content)) !== null) {
    const caption = match[1] || null;
    const imagePath = match[2];

    // Try to find matching image in DoclingDocument
    let imageId = imagePath; // Default to path as ID
    let pageNumber: number | null = null;
    let storagePath: string | null = null;

    if (docling_json && docling_json.pictures) {
      // Search for image in DoclingDocument pictures array
      // Match by ID or data reference
      const foundImage = docling_json.pictures.find(pic => {
        // Try matching by ID in path
        return pic.id === imagePath || imagePath.includes(pic.id);
      });

      if (foundImage) {
        imageId = foundImage.id;
        pageNumber = foundImage.page_no;
        // Use the data field as storage path if it's a reference
        storagePath = foundImage.data ?? null;
      }
    }

    references.push({
      image_id: imageId,
      caption,
      page_number: pageNumber,
      storage_path: storagePath,
    });
  }

  return references;
}

/**
 * Extracts table references from chunk content
 *
 * Parses Markdown table syntax and attempts to link to DoclingDocument tables
 *
 * @param content - Chunk content
 * @param docling_json - DoclingDocument JSON (optional)
 * @returns Array of table references
 */
function extractTableReferences(
  content: string,
  docling_json?: DoclingDocument
): TableReference[] {
  const references: TableReference[] = [];

  // Simple markdown table detection
  const tableBlocks = content.split('\n\n').filter(block => {
    const lines = block.split('\n').filter(line => line.includes('|'));
    return lines.length >= 2; // At least header + separator
  });

  tableBlocks.forEach((tableBlock, index) => {
    const lines = tableBlock.split('\n').filter(line => line.includes('|'));
    const rowCount = lines.length - 1; // Exclude separator row
    const colCount = (lines[0]?.split('|').length || 0) - 2; // Exclude leading/trailing |

    // Try to find matching table in DoclingDocument
    let tableId = `table_${index}`;
    let caption: string | null = null;
    let pageNumber: number | null = null;

    if (docling_json && docling_json.tables && docling_json.tables[index]) {
      // Search for table in DoclingDocument tables array
      const foundTable = docling_json.tables[index];

      tableId = foundTable.id;
      caption = foundTable.caption ?? null;
      pageNumber = foundTable.page_no;
    }

    references.push({
      table_id: tableId,
      caption,
      page_number: pageNumber,
      row_count: Math.max(rowCount, 0),
      col_count: Math.max(colCount, 0),
    });
  });

  return references;
}

/**
 * Determines page number range for chunk
 *
 * Attempts to map chunk content to source page numbers using DoclingDocument
 *
 * @param chunk - Text chunk
 * @param docling_json - DoclingDocument JSON
 * @returns Page range [start, end] or null
 */
function determinePageRange(
  chunk: TextChunk,
  docling_json?: DoclingDocument
): [number, number] | null {
  if (!docling_json) return null;

  // Strategy: Find page numbers from images/tables in this chunk
  const imageRefs = extractImageReferences(chunk.content, docling_json);
  const tableRefs = extractTableReferences(chunk.content, docling_json);

  const pageNumbers: number[] = [];

  // Collect page numbers from image references
  imageRefs.forEach(img => {
    if (img.page_number !== null) pageNumbers.push(img.page_number);
  });

  // Collect page numbers from table references
  tableRefs.forEach(tbl => {
    if (tbl.page_number !== null) pageNumbers.push(tbl.page_number);
  });

  if (pageNumbers.length === 0) return null;

  const minPage = Math.min(...pageNumbers);
  const maxPage = Math.max(...pageNumbers);

  return [minPage, maxPage];
}

/**
 * Enriches a single text chunk with comprehensive metadata
 *
 * @param chunk - Text chunk to enrich
 * @param options - Enrichment options
 * @returns Enriched chunk with metadata
 */
export function enrichChunk(
  chunk: TextChunk,
  options: EnrichmentOptions
): EnrichedChunk {
  const now = new Date().toISOString();

  // Detect content features
  const has_code = detectCode(chunk.content);
  const has_formulas = detectFormulas(chunk.content);
  const has_tables = detectTables(chunk.content);
  const has_images = detectImages(chunk.content);

  // Extract references
  const image_refs = extractImageReferences(chunk.content, options.docling_json);
  const table_refs = extractTableReferences(chunk.content, options.docling_json);

  // Determine page range
  const page_range = determinePageRange(chunk, options.docling_json);
  const page_number = page_range ? page_range[0] : null;

  return {
    ...chunk,
    // Document metadata
    document_id: options.document_id,
    document_name: options.document_name,
    document_version: options.document_version || null,
    version_hash: options.version_hash || null,

    // Source location
    page_number,
    page_range,

    // Content metadata
    has_code,
    has_formulas,
    has_tables,
    has_images,

    // Multi-tenancy
    organization_id: options.organization_id,
    course_id: options.course_id,

    // Timestamps
    indexed_at: now,
    last_updated: now,

    // References
    image_refs,
    table_refs,
  };
}

/**
 * Enriches multiple chunks with metadata
 *
 * @param chunks - Array of text chunks
 * @param options - Enrichment options
 * @returns Array of enriched chunks
 */
export function enrichChunks(
  chunks: TextChunk[],
  options: EnrichmentOptions
): EnrichedChunk[] {
  return chunks.map(chunk => enrichChunk(chunk, options));
}

/**
 * Converts enriched chunk to Qdrant payload format
 *
 * Prepares chunk metadata for Qdrant upload (excludes vector embedding)
 *
 * @param chunk - Enriched chunk
 * @returns Qdrant payload object
 */
export function toQdrantPayload(chunk: EnrichedChunk): Record<string, unknown> {
  return {
    // Chunk metadata
    chunk_id: chunk.chunk_id,
    parent_chunk_id: chunk.parent_chunk_id,
    sibling_chunk_ids: chunk.sibling_chunk_ids,
    level: chunk.level,
    content: chunk.content,
    token_count: chunk.token_count,
    char_count: chunk.char_count,
    chunk_index: chunk.chunk_index,
    total_chunks: chunk.total_chunks,
    chunk_strategy: chunk.chunk_strategy,
    overlap_tokens: chunk.overlap_tokens,

    // Document hierarchy
    heading_path: chunk.heading_path,
    chapter: chunk.chapter,
    section: chunk.section,

    // Document metadata
    document_id: chunk.document_id,
    document_name: chunk.document_name,
    document_version: chunk.document_version,
    version_hash: chunk.version_hash,

    // Source location
    page_number: chunk.page_number,
    page_range: chunk.page_range,

    // Content metadata
    has_code: chunk.has_code,
    has_formulas: chunk.has_formulas,
    has_tables: chunk.has_tables,
    has_images: chunk.has_images,

    // Multi-tenancy
    organization_id: chunk.organization_id,
    course_id: chunk.course_id,

    // Timestamps
    indexed_at: chunk.indexed_at,
    last_updated: chunk.last_updated,

    // References (serialized as JSON)
    image_refs: chunk.image_refs,
    table_refs: chunk.table_refs,
  };
}

/**
 * Filters chunks by metadata criteria
 *
 * @param chunks - Array of enriched chunks
 * @param filter - Filter criteria
 * @returns Filtered chunks
 */
export function filterChunks(
  chunks: EnrichedChunk[],
  filter: {
    level?: 'parent' | 'child';
    has_code?: boolean;
    has_formulas?: boolean;
    has_tables?: boolean;
    has_images?: boolean;
    min_tokens?: number;
    max_tokens?: number;
    chapter?: string;
    section?: string;
  }
): EnrichedChunk[] {
  return chunks.filter(chunk => {
    if (filter.level && chunk.level !== filter.level) return false;
    if (filter.has_code !== undefined && chunk.has_code !== filter.has_code) return false;
    if (filter.has_formulas !== undefined && chunk.has_formulas !== filter.has_formulas) return false;
    if (filter.has_tables !== undefined && chunk.has_tables !== filter.has_tables) return false;
    if (filter.has_images !== undefined && chunk.has_images !== filter.has_images) return false;
    if (filter.min_tokens && chunk.token_count < filter.min_tokens) return false;
    if (filter.max_tokens && chunk.token_count > filter.max_tokens) return false;
    if (filter.chapter && chunk.chapter !== filter.chapter) return false;
    if (filter.section && chunk.section !== filter.section) return false;
    return true;
  });
}
