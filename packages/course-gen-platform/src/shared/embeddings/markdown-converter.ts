/**
 * Markdown Conversion Pipeline
 *
 * Converts DoclingDocument JSON to clean Markdown format for RAG chunking.
 * Preserves document structure (headings, tables, images, formulas) while
 * providing a simplified text format for hierarchical chunking.
 *
 * Architecture:
 * - Input: DoclingDocument JSON from Docling MCP
 * - Output: Clean Markdown text + metadata enrichment
 * - Integration: Feeds into T075 hierarchical chunking pipeline
 *
 * @module shared/embeddings/markdown-converter
 */

import {
  DoclingDocument,
  DoclingText,
  DoclingPicture,
  DoclingTable,
} from '../../stages/stage2-document-processing/docling/types.js';
import { getDoclingClient } from '../../stages/stage2-document-processing/docling/client.js';
import { logger } from '../logger/index.js';

/**
 * Result of markdown conversion with metadata enrichment
 */
export interface ConversionResult {
  /** Clean Markdown text for chunking */
  markdown: string;

  /** Full DoclingDocument JSON for metadata enrichment */
  json: DoclingDocument;

  /** Extracted images with captions and OCR text */
  images: ImageMetadata[];

  /** Document structure (heading hierarchy) */
  structure: DocumentStructure;

  /** Conversion metadata */
  metadata: ConversionMetadata;
}

/**
 * Image metadata extracted from DoclingDocument
 */
export interface ImageMetadata {
  /** Unique identifier */
  id: string;

  /** Page number where image appears */
  page_no: number;

  /** Bounding box coordinates [x, y, width, height] */
  bbox: [number, number, number, number];

  /** Image caption (if extracted) */
  caption?: string;

  /** OCR text from image (if OCR was enabled) */
  ocr_text?: string;

  /** Image format (png, jpeg, etc.) */
  format?: string;

  /** Base64 encoded image data (optional) */
  data?: string;

  /** Image classification (Figure, Photo, Diagram, etc.) */
  classification?: string;
}

/**
 * Document structure with heading hierarchy
 */
export interface DocumentStructure {
  /** Document title (H1) */
  title?: string;

  /** Hierarchical sections (H2, H3, etc.) */
  sections: DocumentSection[];

  /** Total heading count by level */
  heading_counts: {
    h1: number;
    h2: number;
    h3: number;
    h4: number;
    h5: number;
    h6: number;
  };

  /** Total depth of heading hierarchy */
  max_depth: number;
}

/**
 * Hierarchical document section
 */
export interface DocumentSection {
  /** Section heading text */
  heading: string;

  /** Heading level (1-6) */
  level: number;

  /** Page number where section starts */
  page_no: number;

  /** Nested subsections */
  subsections: DocumentSection[];

  /** Character offset in markdown text */
  offset: number;
}

/**
 * Metadata about the conversion process
 */
export interface ConversionMetadata {
  /** Processing time in milliseconds */
  processing_time_ms: number;

  /** Total pages processed */
  pages_processed: number;

  /** Total text elements */
  text_elements: number;

  /** Total images extracted */
  images_extracted: number;

  /** Total tables extracted */
  tables_extracted: number;

  /** Markdown length in characters */
  markdown_length: number;

  /** Conversion timestamp */
  timestamp: string;
}

/**
 * Options for markdown conversion
 */
export interface MarkdownConversionOptions {
  /** Include images as markdown references (default: true) */
  include_images?: boolean;

  /** Include tables as markdown tables (default: true) */
  include_tables?: boolean;

  /** Include formulas (default: true) */
  include_formulas?: boolean;

  /** Include OCR text from images (default: true) */
  include_ocr?: boolean;

  /** Maximum heading level to preserve (default: 6) */
  max_heading_level?: number;

  /** Include page numbers as comments (default: false) */
  include_page_markers?: boolean;
}

/**
 * Default conversion options
 */
const DEFAULT_OPTIONS: Required<MarkdownConversionOptions> = {
  include_images: true,
  include_tables: true,
  include_formulas: true,
  include_ocr: true,
  max_heading_level: 6,
  include_page_markers: false,
};

/**
 * Convert a document file to Markdown format
 *
 * This is the main entry point for the conversion pipeline.
 * It uses Docling MCP to convert the file to both DoclingDocument JSON
 * and Markdown, then enriches the result with metadata.
 *
 * @param filePath - Absolute path to the document file
 * @param options - Conversion options
 * @returns Complete conversion result with markdown and metadata
 */
export async function convertDocumentToMarkdown(
  filePath: string,
  options?: MarkdownConversionOptions
): Promise<ConversionResult> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  logger.info({ filePath, options: opts }, 'Starting markdown conversion');

  try {
    const client = getDoclingClient();

    // Get full DoclingDocument JSON (T074.5: Implemented via save_docling_document tool)
    const doclingDoc = await client.getDoclingDocumentJSON(filePath);

    // Get Markdown from Docling MCP server
    const rawMarkdown = await client.convertToMarkdown(filePath);

    logger.info({
      markdown_length: rawMarkdown.length,
      texts_count: doclingDoc.texts?.length || 0,
      pictures_count: doclingDoc.pictures?.length || 0,
      tables_count: doclingDoc.tables?.length || 0,
      pages_count: Object.keys(doclingDoc.pages || {}).length,
    }, 'Document converted by Docling with full metadata');

    // Extract images metadata
    const images = extractImageMetadata(doclingDoc, opts);

    // Extract document structure (heading hierarchy)
    const structure = extractDocumentStructure(doclingDoc, rawMarkdown);

    // Enhance markdown with OCR text if available
    let enhancedMarkdown = rawMarkdown;
    if (opts.include_ocr && images.some(img => img.ocr_text)) {
      enhancedMarkdown = embedOCRTextInMarkdown(rawMarkdown, images);
    }

    // Add page markers if requested
    if (opts.include_page_markers) {
      enhancedMarkdown = addPageMarkers(enhancedMarkdown, doclingDoc);
    }

    const processingTime = Date.now() - startTime;

    const result: ConversionResult = {
      markdown: enhancedMarkdown,
      json: doclingDoc,
      images,
      structure,
      metadata: {
        processing_time_ms: processingTime,
        pages_processed: Object.keys(doclingDoc.pages || {}).length,
        text_elements: doclingDoc.texts?.length || 0,
        images_extracted: images.length,
        tables_extracted: doclingDoc.tables?.length || 0,
        markdown_length: enhancedMarkdown.length,
        timestamp: new Date().toISOString(),
      },
    };

    logger.info({
      processing_time_ms: processingTime,
      markdown_length: enhancedMarkdown.length,
      images: images.length,
      sections: structure.sections.length,
    }, 'Markdown conversion completed');

    return result;
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error), filePath }, 'Markdown conversion failed');
    throw new MarkdownConversionError(
      'Failed to convert document to markdown',
      error
    );
  }
}

/**
 * Convert DoclingDocument JSON to Markdown
 *
 * This is an alternative approach that converts from DoclingDocument JSON
 * instead of calling Docling's native Markdown export. Useful when you
 * already have the JSON and want custom Markdown formatting.
 *
 * @param document - DoclingDocument JSON
 * @param options - Conversion options
 * @returns Markdown text
 */
export function convertDoclingDocumentToMarkdown(
  document: DoclingDocument,
  options?: MarkdownConversionOptions
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lines: string[] = [];

  // Add document title if available
  if (document.metadata.title) {
    lines.push(`# ${document.metadata.title}`, '');
  }

  // Sort texts by page number and order
  const sortedTexts = [...document.texts].sort((a, b) => {
    if (a.page_no !== b.page_no) {
      return a.page_no - b.page_no;
    }
    return (a.order ?? 0) - (b.order ?? 0);
  });

  let currentPage = 0;

  for (const text of sortedTexts) {
    // Add page marker if requested
    if (opts.include_page_markers && text.page_no !== currentPage) {
      currentPage = text.page_no;
      lines.push('', `<!-- Page ${currentPage} -->`, '');
    }

    // Convert text element to markdown based on type
    const markdown = convertTextElementToMarkdown(text, opts);
    if (markdown) {
      lines.push(markdown);
    }
  }

  // Add tables
  if (opts.include_tables && document.tables.length > 0) {
    for (const table of document.tables) {
      const tableMarkdown = convertTableToMarkdown(table);
      lines.push('', tableMarkdown, '');
    }
  }

  // Add image references
  if (opts.include_images && document.pictures.length > 0) {
    for (const picture of document.pictures) {
      const imageMarkdown = convertImageToMarkdown(picture);
      lines.push('', imageMarkdown, '');
    }
  }

  return lines.join('\n');
}

/**
 * Extract image metadata from DoclingDocument
 */
function extractImageMetadata(
  document: DoclingDocument,
  options: Required<MarkdownConversionOptions>
): ImageMetadata[] {
  return document.pictures.map(picture => ({
    id: picture.id,
    page_no: picture.page_no,
    bbox: picture.bbox,
    caption: picture.caption,
    ocr_text: options.include_ocr ? picture.ocr_text : undefined,
    format: picture.format,
    data: picture.data,
    classification: undefined, // Docling doesn't provide this by default
  }));
}

/**
 * Extract document structure (heading hierarchy) from markdown
 *
 * This function parses the markdown text to build a hierarchical
 * structure of sections based on heading levels.
 */
function extractDocumentStructure(
  document: DoclingDocument,
  markdown: string
): DocumentStructure {
  const lines = markdown.split('\n');
  const sections: DocumentSection[] = [];
  const heading_counts = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
  let max_depth = 0;
  let offset = 0;
  let title: string | undefined;

  const sectionStack: DocumentSection[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      const level = headingMatch[1].length;
      const heading = headingMatch[2];

      // Track heading counts
      heading_counts[`h${level}` as keyof typeof heading_counts]++;
      max_depth = Math.max(max_depth, level);

      // First H1 is the document title
      if (level === 1 && !title) {
        title = heading;
      }

      // Find page number for this heading (approximate from texts)
      const page_no = findPageNumberForHeading(document, heading);

      const section: DocumentSection = {
        heading,
        level,
        page_no,
        subsections: [],
        offset,
      };

      // Build hierarchy
      while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1].level >= level) {
        sectionStack.pop();
      }

      if (sectionStack.length === 0) {
        sections.push(section);
      } else {
        sectionStack[sectionStack.length - 1].subsections.push(section);
      }

      sectionStack.push(section);
    }

    offset += line.length + 1; // +1 for newline
  }

  return {
    title,
    sections,
    heading_counts,
    max_depth,
  };
}

/**
 * Find the page number where a heading appears
 */
function findPageNumberForHeading(document: DoclingDocument, heading: string): number {
  // Look for text elements that match or contain the heading
  const matchingText = document.texts.find(text =>
    text.text.toLowerCase().includes(heading.toLowerCase()) &&
    (text.type === 'heading' || text.type === 'title')
  );

  return matchingText?.page_no ?? 1;
}

/**
 * Embed OCR text from images into markdown
 */
function embedOCRTextInMarkdown(markdown: string, images: ImageMetadata[]): string {
  let enhanced = markdown;

  for (const image of images) {
    if (image.ocr_text && image.ocr_text.trim()) {
      // Find image reference in markdown
      const imageRef = image.caption
        ? `![${image.caption}]`
        : `![Image ${image.id}]`;

      // Add OCR text as a blockquote after image
      const ocrBlock = `\n\n> **OCR Text from Image:**\n> ${image.ocr_text.replace(/\n/g, '\n> ')}\n`;

      enhanced = enhanced.replace(imageRef, imageRef + ocrBlock);
    }
  }

  return enhanced;
}

/**
 * Add page number markers to markdown
 */
function addPageMarkers(markdown: string, document: DoclingDocument): string {
  const lines = markdown.split('\n');
  const result: string[] = [];
  let currentPage = 0;

  // Build a map of line content to page numbers
  const lineToPage = new Map<string, number>();
  for (const text of document.texts) {
    lineToPage.set(text.text.trim(), text.page_no);
  }

  for (const line of lines) {
    const page = lineToPage.get(line.trim());
    if (page && page !== currentPage) {
      currentPage = page;
      result.push('', `<!-- Page ${currentPage} -->`, '');
    }
    result.push(line);
  }

  return result.join('\n');
}

/**
 * Convert a text element to markdown
 */
function convertTextElementToMarkdown(
  text: DoclingText,
  options: Required<MarkdownConversionOptions>
): string {
  const content = text.text.trim();

  if (!content) {
    return '';
  }

  switch (text.type) {
    case 'heading':
    case 'title': {
      // Determine heading level from font size or order
      const level = Math.min(
        determineHeadingLevel(text),
        options.max_heading_level
      );
      return `${'#'.repeat(level)} ${content}`;
    }

    case 'paragraph':
      return `${content}\n`;

    case 'list-item':
      return `- ${content}`;

    case 'code':
      return `\`\`\`\n${content}\n\`\`\``;

    case 'formula':
      if (options.include_formulas) {
        // Inline or block formula
        return content.includes('\n') ? `$$\n${content}\n$$` : `$${content}$`;
      }
      return '';

    default:
      return content;
  }
}

/**
 * Determine heading level from text element properties
 */
function determineHeadingLevel(text: DoclingText): number {
  // Use font size if available
  if (text.font?.size) {
    const size = text.font.size;
    if (size >= 24) return 1;
    if (size >= 20) return 2;
    if (size >= 16) return 3;
    if (size >= 14) return 4;
    return 5;
  }

  // Default to H2
  return 2;
}

/**
 * Convert a table to markdown table format
 */
function convertTableToMarkdown(table: DoclingTable): string {
  const lines: string[] = [];

  // Add caption if available
  if (table.caption) {
    lines.push(`**Table: ${table.caption}**\n`);
  }

  // Convert table cells to markdown
  const cells = table.cells;

  if (cells.length === 0) {
    return '';
  }

  // Header row
  const headerRow = cells[0].map(cell => cell.text || '').join(' | ');
  lines.push(`| ${headerRow} |`);

  // Separator row
  const separator = cells[0].map(() => '---').join(' | ');
  lines.push(`| ${separator} |`);

  // Data rows
  for (let i = 1; i < cells.length; i++) {
    const row = cells[i].map(cell => cell.text || '').join(' | ');
    lines.push(`| ${row} |`);
  }

  return lines.join('\n');
}

/**
 * Convert an image to markdown image reference
 */
function convertImageToMarkdown(picture: DoclingPicture): string {
  const alt = picture.caption || `Image on page ${picture.page_no}`;
  const path = picture.data ? `data:image/${picture.format || 'png'};base64,${picture.data}` : `image_${picture.id}.${picture.format || 'png'}`;

  let markdown = `![${alt}](${path})`;

  // Add OCR text if available
  if (picture.ocr_text && picture.ocr_text.trim()) {
    markdown += `\n\n> **OCR Text:** ${picture.ocr_text}`;
  }

  return markdown;
}

/**
 * Custom error class for markdown conversion
 */
export class MarkdownConversionError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'MarkdownConversionError';
  }
}
