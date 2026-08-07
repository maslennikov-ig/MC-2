/**
 * TypeScript type definitions for Docling MCP Server
 * Based on Docling v2.25 and DoclingDocument schema v2.0
 */

/**
 * DoclingDocument - Main output format from Docling conversion
 * Schema version 2.0
 */
export interface DoclingDocument {
  /** Schema version of the DoclingDocument format */
  schema_version: string;

  /** Name of the document (typically filename without extension) */
  name: string;

  /** Array of pages in the document */
  pages: DoclingPage[];

  /** Array of text elements extracted from the document */
  texts: DoclingText[];

  /** Array of images/pictures extracted from the document */
  pictures: DoclingPicture[];

  /** Array of tables extracted from the document */
  tables: DoclingTable[];

  /** Document-level metadata */
  metadata: DoclingMetadata;
}

/**
 * Represents a single page in the document
 */
export interface DoclingPage {
  /** Page number (1-indexed) */
  page_no: number;

  /** Physical dimensions of the page */
  size: {
    width: number;
    height: number;
  };

  /** Cells (content blocks) on this page */
  cells: DoclingCell[];
}

/**
 * A cell represents a content block on a page
 */
export interface DoclingCell {
  /** Bounding box coordinates (x, y, width, height) */
  bbox: [number, number, number, number];

  /** Cell type (e.g., 'text', 'title', 'table', 'figure') */
  type: string;

  /** Text content of the cell (if applicable) */
  text?: string;

  /** Reference to text ID (if linked to texts array) */
  text_id?: string;

  /** Reference to table ID (if this cell contains a table) */
  table_id?: string;

  /** Reference to picture ID (if this cell contains an image) */
  picture_id?: string;

  /** Confidence score (0-1) */
  confidence?: number;
}

/**
 * Text element with content and metadata
 */
export interface DoclingText {
  /** Unique identifier for this text element */
  id: string;

  /** Text content */
  text: string;

  /** Text type (e.g., 'paragraph', 'heading', 'list-item') */
  type: string;

  /** Bounding box coordinates */
  bbox?: [number, number, number, number];

  /** Page number where this text appears */
  page_no: number;

  /** Font information (if available) */
  font?: {
    name?: string;
    size?: number;
    weight?: string;
    style?: string;
  };

  /** Reading order index */
  order?: number;

  /** Explicit heading level supplied by Docling for section headers */
  level?: number;

  /**
   * Programming language Docling assigned to a code block.
   *
   * Only ever set on items whose `type` is `code`. It is a top-level Docling
   * field rather than enrichment metadata, so it can be present without the
   * advanced pass — the enrichment model makes it accurate, not existent.
   */
  code_language?: string;
}

/**
 * Image/picture element
 */
export interface DoclingPicture {
  /** Unique identifier for this picture */
  id: string;

  /** Bounding box coordinates */
  bbox: [number, number, number, number];

  /** Page number where this picture appears */
  page_no: number;

  /** Image data (base64 encoded) or reference */
  data?: string;

  /** Image format (e.g., 'png', 'jpeg') */
  format?: string;

  /** Caption or alt text (if extracted) */
  caption?: string;

  /** OCR text from image (if OCR was applied) */
  ocr_text?: string;

  /** Normalized advanced enrichment metadata, when any is present. */
  enrichment?: DoclingPictureEnrichment;
}

/**
 * What a model (or the source file) said ABOUT a picture, normalized.
 *
 * Docling carries this under `meta` with version-specific shapes; downstream
 * TypeScript must never see those. Every field is optional because each one
 * comes from a different source: `classification` and `chart` can arrive from
 * the source file itself with no model at all — a PPTX embeds its chart series
 * as XML — while `description` only ever comes from a vision model.
 */
export interface DoclingPictureEnrichment {
  /** Highest-confidence class, e.g. `bar_chart`. */
  classification?: {
    class_name: string;
    confidence?: number;
    /** Model or backend that produced it; absent when the file declared it. */
    created_by?: string;
  };

  /** Grounded natural-language description produced by a vision model. */
  description?: {
    text: string;
    confidence?: number;
    created_by?: string;
  };

  /** Code recovered from a picture OF code (not from a code text block). */
  code?: {
    text: string;
    language?: string;
    confidence?: number;
    created_by?: string;
  };

  /**
   * Chart series recovered either from the source file or by a vision model.
   * `rows` is row-major with the header row first when the source has one.
   */
  chart?: {
    title?: string;
    rows: string[][];
    confidence?: number;
    created_by?: string;
  };
}

/**
 * Table structure with cells
 */
export interface DoclingTable {
  /** Unique identifier for this table */
  id: string;

  /** Bounding box coordinates */
  bbox: [number, number, number, number];

  /** Page number where this table appears */
  page_no: number;

  /** Number of rows */
  num_rows: number;

  /** Number of columns */
  num_cols: number;

  /** Table cells data */
  cells: DoclingTableCell[][];

  /** Table caption (if extracted) */
  caption?: string;
}

/**
 * Individual cell within a table
 */
export interface DoclingTableCell {
  /** Cell text content */
  text: string;

  /** Row span (for merged cells) */
  rowspan?: number;

  /** Column span (for merged cells) */
  colspan?: number;

  /** Is this a header cell? */
  is_header?: boolean;

  /** Bounding box coordinates within the table */
  bbox?: [number, number, number, number];
}

/**
 * Document-level metadata
 */
export interface DoclingMetadata {
  /** Total number of pages */
  page_count: number;

  /** Document language (ISO 639-1 code) */
  language?: string;

  /** Document title (if extracted from metadata) */
  title?: string;

  /** Author(s) (if extracted from metadata) */
  authors?: string[];

  /** Creation date (ISO 8601 format) */
  creation_date?: string;

  /** Modification date (ISO 8601 format) */
  modification_date?: string;

  /** File format (e.g., 'pdf', 'docx') */
  format?: string;

  /** File size in bytes */
  file_size?: number;

  /** Processing information */
  processing?: {
    /** Docling version used for processing */
    docling_version?: string;

    /** Processing timestamp (ISO 8601) */
    timestamp?: string;

    /** Processing duration in seconds */
    duration?: number;

    /** Models used (layout, OCR, etc.) */
    models?: {
      layout?: string;
      ocr?: string;
      [key: string]: string | undefined;
    };
  };
}

/**
 * MCP Tool Call Request for document conversion
 */
export interface ConvertDocumentRequest {
  /** Path to the document file (must be accessible to MCP server) */
  file_path: string;

  /** Desired output format */
  output_format: 'docling_document' | 'markdown' | 'json' | 'html';

  /** Optional: Enable OCR for images and scanned PDFs */
  enable_ocr?: boolean;

  /** Optional: Extract images from document */
  extract_images?: boolean;

  /** Optional: Extract tables with detailed structure */
  extract_tables?: boolean;

  /** Optional: Force re-processing (ignore cache) */
  force_refresh?: boolean;
}

/**
 * MCP Tool Call Response for document conversion
 */
export interface ConvertDocumentResponse {
  /** Success status */
  success: boolean;

  /** Converted document (if output_format is 'docling_document') */
  document?: DoclingDocument;

  /** Converted content as string (for markdown, json, html formats) */
  content?: string;

  /** Error message (if success is false) */
  error?: string;

  /** Processing metadata */
  metadata?: {
    /** Processing time in milliseconds */
    processing_time_ms: number;

    /** Whether result was served from cache */
    from_cache: boolean;

    /** Number of pages processed */
    pages_processed: number;
  };
}

/**
 * Docling MCP Client Configuration
 */
export interface DoclingClientConfig {
  /** MCP server URL (e.g., 'http://docling-mcp:8000/mcp') */
  serverUrl: string;

  /** Request timeout in milliseconds (default: 1200000 = 20 minutes for large file processing) */
  timeout?: number;

  /** Maximum bundle retries after a lost connection/session (default: 1) */
  maxRetries?: number;

  /** Retry delay in milliseconds (default: 1000) */
  retryDelay?: number;

  /** Enable debug logging (default: false) */
  debug?: boolean;

  /** Shared directory containing JSON/Markdown files saved by Docling MCP */
  cachePath?: string;
}

export interface DoclingConversionBundle {
  markdown: string;
  document: DoclingDocument;
  documentKey: string;
  fromCache: boolean;
  processingTimeMs: number;
  /**
   * Absolute path of the raw DoclingDocument JSON that produced `document`.
   *
   * Native chunking re-reads these exact bytes instead of re-converting the
   * source, so chunks and the accepted document are the same document.
   */
  rawJsonPath: string;
}

/**
 * Error types from Docling MCP server
 */
export enum DoclingErrorCode {
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
  PROCESSING_ERROR = 'PROCESSING_ERROR',
  TIMEOUT = 'TIMEOUT',
  OCR_ERROR = 'OCR_ERROR',
  CORRUPTED_FILE = 'CORRUPTED_FILE',
  OUT_OF_MEMORY = 'OUT_OF_MEMORY',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Custom error class for Docling operations
 */
export class DoclingError extends Error {
  constructor(
    public code: DoclingErrorCode,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'DoclingError';
  }
}

/**
 * Extensions this client will hand to Docling.
 *
 * Deliberately NARROWER than what the pinned Docling stack can parse. Serve
 * 1.29.0 also accepts `audio`, `video`, `email`, `boxnote` and `ebcdic`, and
 * those are explicit non-goals: the image carries no ffmpeg, and an unbounded
 * format surface is a security question, not a feature. Anything absent here is
 * refused before a byte is sent, so widening the platform's format contract is
 * a decision made in this list rather than a side effect of upgrading Docling.
 */
export const SUPPORTED_FORMATS = [
  'pdf',
  'docx',
  'pptx',
  'xlsx',
  'html',
  'md',
  'markdown',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'xml',
  'jats',
  // Premium format families (Stage C). Each is converted by its own Docling
  // backend in the pinned image; none needs a model the baseline lacks.
  'csv',
  'odt',
  'ods',
  'odp',
  'epub',
  'tex',
] as const;

export type SupportedFormat = (typeof SUPPORTED_FORMATS)[number];

/**
 * Helper function to check if a file format is supported
 */
export function isSupportedFormat(format: string): format is SupportedFormat {
  return SUPPORTED_FORMATS.includes(format.toLowerCase() as SupportedFormat);
}

/**
 * Helper function to get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  // If there's only one part (no dots) or the last part is empty, return empty string
  if (parts.length === 1 || parts[parts.length - 1] === '') {
    return '';
  }
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Markdown export options
 */
export interface MarkdownExportOptions {
  /** Include images as base64 data URLs (default: false) */
  includeImages?: boolean;

  /** Include table of contents (default: false) */
  includeToc?: boolean;

  /** Heading level for document title (default: 1) */
  titleLevel?: number;

  /** Export tables as markdown tables (default: true) */
  exportTables?: boolean;
}
