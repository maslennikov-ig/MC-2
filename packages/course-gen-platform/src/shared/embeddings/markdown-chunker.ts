/**
 * Markdown-based Hierarchical Chunking for RAG
 *
 * Implements STANDARD tier chunking strategy (T075) with:
 * - Parent-child chunk hierarchy (1500 tokens parent, 400 tokens child)
 * - Token-aware splitting using tiktoken (NOT character-based)
 * - Sentence boundary preservation via LangChain RecursiveCharacterTextSplitter
 * - Markdown header-based semantic boundaries
 *
 * @module shared/embeddings/markdown-chunker
 */

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { encoding_for_model } from 'tiktoken';
import type { TiktokenModel } from 'tiktoken';
import type {
  DoclingBoundingBox,
  DoclingContainer,
} from '../../stages/stage2-document-processing/docling/provenance.js';

/**
 * Chunk hierarchy level
 */
export type ChunkLevel = 'parent' | 'child';

/**
 * Chunking strategy that produced a chunk.
 *
 * `hierarchical_markdown` is the legacy Markdown splitter and stays the value
 * every existing Qdrant point carries. The Docling values are produced by the
 * native Serve chunkers.
 */
export type ChunkStrategyName = 'hierarchical_markdown' | 'docling_hierarchical' | 'docling_hybrid';

/**
 * Source provenance carried by a chunk built from native Docling structure.
 *
 * Optional throughout: legacy Markdown chunks have none, and old Qdrant points
 * predate the field entirely.
 */
export interface ChunkProvenance {
  /** Docling self_refs this chunk was built from, e.g. `#/texts/12`. */
  self_refs: string[];
  /** Source pages the chunk spans. Empty for page-less formats such as DOCX. */
  page_numbers: number[];
  /** Bounding boxes with their coordinate origin and page geometry. */
  bboxes: DoclingBoundingBox[];
  /** Docling element labels behind this chunk, e.g. `text`, `table`. */
  labels: string[];
  /** Token count reported by the native chunker's own tokenizer, if any. */
  native_token_count: number | null;
  /**
   * Structural containers this chunk sits in — worksheet, slide, chapter —
   * outermost first. Optional, and empty for formats that declare none.
   */
  containers?: DoclingContainer[];
}

/**
 * Individual text chunk with metadata
 */
export interface TextChunk {
  /** Unique chunk identifier (stable across re-chunking) */
  chunk_id: string;
  /** Parent chunk ID (null for parent chunks) */
  parent_chunk_id: string | null;
  /** Sibling chunk IDs (other children of same parent) */
  sibling_chunk_ids: string[];
  /** Hierarchy level */
  level: ChunkLevel;
  /** Chunk content (Markdown text) */
  content: string;
  /** Token count (actual, not estimated) */
  token_count: number;
  /** Character count */
  char_count: number;
  /** Zero-based chunk index within parent/document */
  chunk_index: number;
  /** Total chunks at this level */
  total_chunks: number;
  /** Heading hierarchy path (e.g., "Chapter 1 > Section 1.2 > Neural Networks") */
  heading_path: string;
  /** Document section (H1 heading) */
  chapter: string | null;
  /** Subsection (H2 heading) */
  section: string | null;
  /** Chunking strategy used */
  chunk_strategy: ChunkStrategyName;
  /** Overlap tokens with previous chunk */
  overlap_tokens: number;
  /** Native Docling provenance, present only for Docling chunking strategies */
  provenance?: ChunkProvenance;
}

/**
 * Chunking configuration
 */
export interface ChunkingConfig {
  /** Parent chunk size in tokens (default: 1500) */
  parent_chunk_size: number;
  /** Child chunk size in tokens (default: 400) */
  child_chunk_size: number;
  /** Overlap between child chunks in tokens (default: 50) */
  child_chunk_overlap: number;
  /** Tiktoken model for token counting (default: 'gpt-3.5-turbo') */
  tiktoken_model: TiktokenModel;
}

/**
 * Default chunking configuration
 */
export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  parent_chunk_size: 1500,
  child_chunk_size: 400,
  child_chunk_overlap: 50,
  tiktoken_model: 'gpt-3.5-turbo', // Uses cl100k_base encoding
};

/**
 * Hierarchical chunking result
 */
export interface ChunkingResult {
  /** Parent chunks (large context windows for LLM) */
  parent_chunks: TextChunk[];
  /** Child chunks (indexed in Qdrant for precision retrieval) */
  child_chunks: TextChunk[];
  /** Total tokens processed */
  total_tokens: number;
  /** Chunking metadata */
  metadata: {
    parent_count: number;
    child_count: number;
    avg_parent_tokens: number;
    avg_child_tokens: number;
    config: ChunkingConfig;
  };
}

/**
 * Markdown heading metadata extracted by MarkdownTextSplitter
 */
interface MarkdownDocument {
  pageContent: string;
  metadata: {
    'Header 1'?: string;
    'Header 2'?: string;
    'Header 3'?: string;
    [key: string]: unknown;
  };
}

/**
 * Generates stable chunk ID from content hash
 *
 * @param content - Chunk content
 * @param index - Chunk index
 * @param level - Chunk level
 * @returns Stable chunk ID
 */
function generateChunkId(content: string, index: number, level: ChunkLevel): string {
  // Simple hash function for stable IDs (can be replaced with crypto.createHash)
  const hashCode = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  };

  const contentHash = hashCode(content.substring(0, 200)); // Hash first 200 chars
  return `${level}_${index}_${contentHash}`;
}

/**
 * Builds heading path from metadata
 *
 * @param metadata - Markdown metadata
 * @returns Heading breadcrumb (e.g., "Ch1 > Section 1.2 > Neural Networks")
 */
function buildHeadingPath(metadata: MarkdownDocument['metadata']): string {
  const parts: string[] = [];

  if (metadata['Header 1']) parts.push(metadata['Header 1']);
  if (metadata['Header 2']) parts.push(metadata['Header 2']);
  if (metadata['Header 3']) parts.push(metadata['Header 3']);

  return parts.join(' > ') || 'Root';
}

/**
 * Counts tokens using tiktoken
 *
 * @param text - Text to count
 * @param model - Tiktoken model
 * @returns Token count
 */
export function countTokens(text: string, model: TiktokenModel): number {
  const encoder = encoding_for_model(model);
  try {
    const tokens = encoder.encode(text);
    return tokens.length;
  } finally {
    encoder.free(); // Important: free encoder to prevent memory leaks
  }
}

/**
 * Reusable token counter.
 *
 * `countTokens` allocates and frees a tiktoken encoder per call, which is fine
 * for a handful of measurements and far too slow when a splitter measures every
 * candidate boundary. Callers must `free()` when done.
 */
export function createTokenCounter(model: TiktokenModel): {
  count: (text: string) => number;
  free: () => void;
} {
  const encoder = encoding_for_model(model);
  return {
    count: (text: string) => encoder.encode(text).length,
    free: () => encoder.free(),
  };
}

/**
 * Returns the text `next` repeats from the end of `previous`.
 *
 * The search is bounded by the configured overlap so it stays cheap: an overlap
 * larger than that is not something the splitter can produce.
 */
function sharedBoundary(previous: string, next: string, config: ChunkingConfig): string {
  // Four characters per token is a deliberate over-estimate here. It only sets
  // how far back to look, and looking too far is free while looking too little
  // would under-report a real overlap.
  const window = Math.min(previous.length, next.length, config.child_chunk_overlap * 4);
  for (let length = window; length > 0; length--) {
    if (previous.endsWith(next.slice(0, length))) return next.slice(0, length);
  }
  return '';
}

/** Matches an ATX heading line and captures its level and text. */
const HEADING_LINE = /^(#{1,3})\s+(.+?)\s*#*\s*$/;

/** Matches a fenced code block delimiter, so `#` inside code is not a heading. */
const CODE_FENCE = /^\s*(```|~~~)/;

/**
 * First pass: split Markdown at H1/H2/H3 boundaries.
 *
 * This used to be `new MarkdownTextSplitter({})`, which despite the name and
 * the comment above it never split on headings and never produced heading
 * metadata: it is a recursive character splitter whose only Markdown knowledge
 * is its separator list. With no options it also took LangChain's default
 * 1000-character window, and that default is what silently shaped the whole
 * pipeline — see `tokenAwareSplit` for the duplication it caused and
 * `buildHeadingPath` for the metadata that never arrived. Measured on
 * production 2026-08-13: all 6856 points carried `heading_path: 'Root'` and a
 * null chapter and section.
 *
 * Sections are returned whole. Sizing belongs to the token-aware second pass,
 * which is the only place that knows the parent and child budgets.
 *
 * @param markdown - Markdown content
 * @returns Markdown sections carrying the headings in scope
 */
function splitByHeadings(markdown: string): MarkdownDocument[] {
  const sections: MarkdownDocument[] = [];
  const headings: [string?, string?, string?] = [undefined, undefined, undefined];
  let lines: string[] = [];
  let inFence = false;

  const flush = (): void => {
    const pageContent = lines.join('\n').trim();
    lines = [];
    if (pageContent.length === 0) return;
    sections.push({
      pageContent,
      metadata: {
        ...(headings[0] ? { 'Header 1': headings[0] } : {}),
        ...(headings[1] ? { 'Header 2': headings[1] } : {}),
        ...(headings[2] ? { 'Header 3': headings[2] } : {}),
      },
    });
  };

  for (const line of markdown.split('\n')) {
    if (CODE_FENCE.test(line)) inFence = !inFence;

    const heading = inFence ? null : HEADING_LINE.exec(line);
    if (!heading) {
      lines.push(line);
      continue;
    }

    // The heading opens a new section, so everything gathered so far belongs to
    // the previous one and is emitted under the headings that were in scope.
    flush();

    const level = heading[1].length;
    headings[level - 1] = heading[2];
    // A deeper heading only narrows the path; anything below the new level is
    // out of scope and must not leak into the next section's metadata.
    for (let deeper = level; deeper < headings.length; deeper++) headings[deeper] = undefined;

    lines.push(line);
  }
  flush();

  return sections;
}

/**
 * Second pass: Token-aware splitting within heading sections
 *
 * Creates parent-child chunk hierarchy with sentence boundary preservation.
 *
 * Both splitters measure in tokens. They used to measure in characters via a
 * `tokens * 4` approximation, which is the second half of the duplication this
 * module caused: Russian text runs about 2.33 characters per token, so a
 * "400 token" child window was really a 1600-character window, while the first
 * pass never emitted a section longer than its own 1000-character default. A
 * parent therefore always fit inside one child, and `splitText` returned it
 * unchanged — one child per parent, carrying the parent's exact text. Measured
 * on production 2026-08-13 over 25 documents: 508 of 508 parents degenerate,
 * zero children with siblings.
 *
 * @param sections - Markdown sections from first pass
 * @param config - Chunking configuration
 * @returns Parent and child chunks
 */
async function tokenAwareSplit(
  sections: MarkdownDocument[],
  config: ChunkingConfig
): Promise<ChunkingResult> {
  const parent_chunks: TextChunk[] = [];
  const child_chunks: TextChunk[] = [];
  const counter = createTokenCounter(config.tiktoken_model);

  try {
    return await buildHierarchy(sections, config, parent_chunks, child_chunks, counter.count);
  } finally {
    counter.free();
  }
}

async function buildHierarchy(
  sections: MarkdownDocument[],
  config: ChunkingConfig,
  parent_chunks: TextChunk[],
  child_chunks: TextChunk[],
  tokensOf: (text: string) => number
): Promise<ChunkingResult> {
  // Create parent splitter (1500 tokens)
  const parentSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: config.parent_chunk_size,
    chunkOverlap: 0, // No overlap for parent chunks
    separators: ['\n\n', '\n', '. ', ' '], // Sentence boundaries
    keepSeparator: true,
    lengthFunction: tokensOf,
  });

  // Create child splitter (400 tokens, 50 token overlap)
  const childSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: config.child_chunk_size,
    chunkOverlap: config.child_chunk_overlap,
    separators: ['\n\n', '\n', '. ', ' '], // Sentence boundaries
    keepSeparator: true,
    lengthFunction: tokensOf,
  });

  let parentIndex = 0;
  let totalTokens = 0;

  // Process each markdown section
  for (const section of sections) {
    const sectionContent = section.pageContent;

    // Split into parent chunks
    const parentTexts = await parentSplitter.splitText(sectionContent);

    for (const parentText of parentTexts) {
      // Count actual tokens (not character-based estimate)
      const parentTokenCount = tokensOf(parentText);

      // Skip chunks that are too small (less than 100 tokens)
      if (parentTokenCount < 100) continue;

      const parentChunkId = generateChunkId(parentText, parentIndex, 'parent');
      const headingPath = buildHeadingPath(section.metadata);

      // Create parent chunk
      const parentChunk: TextChunk = {
        chunk_id: parentChunkId,
        parent_chunk_id: null,
        sibling_chunk_ids: [],
        level: 'parent',
        content: parentText,
        token_count: parentTokenCount,
        char_count: parentText.length,
        chunk_index: parentIndex,
        total_chunks: 0, // Will be updated later
        heading_path: headingPath,
        chapter: section.metadata['Header 1'] || null,
        section: section.metadata['Header 2'] || null,
        chunk_strategy: 'hierarchical_markdown',
        overlap_tokens: 0,
      };

      parent_chunks.push(parentChunk);
      totalTokens += parentTokenCount;

      // Split parent into child chunks
      const childTexts = await childSplitter.splitText(parentText);
      const childIds: string[] = [];

      for (let i = 0; i < childTexts.length; i++) {
        const childText = childTexts[i];
        const childTokenCount = tokensOf(childText);

        // Skip very small child chunks
        if (childTokenCount < 50) continue;

        const childChunkId = generateChunkId(childText, child_chunks.length, 'child');
        childIds.push(childChunkId);

        // Measure the overlap that is actually there, rather than assuming the
        // configured one: the splitter carries whole separator-delimited pieces
        // across a boundary, so the real overlap is usually smaller and is zero
        // whenever a chunk starts on a clean paragraph break.
        const overlapTokens =
          i > 0 ? tokensOf(sharedBoundary(childTexts[i - 1], childText, config)) : 0;

        // Create child chunk
        const childChunk: TextChunk = {
          chunk_id: childChunkId,
          parent_chunk_id: parentChunkId,
          sibling_chunk_ids: [], // Will be populated later
          level: 'child',
          content: childText,
          token_count: childTokenCount,
          char_count: childText.length,
          chunk_index: i,
          total_chunks: childTexts.length,
          heading_path: headingPath,
          chapter: section.metadata['Header 1'] || null,
          section: section.metadata['Header 2'] || null,
          chunk_strategy: 'hierarchical_markdown',
          overlap_tokens: overlapTokens,
        };

        child_chunks.push(childChunk);
      }

      // Populate sibling IDs for child chunks
      for (const childChunk of child_chunks) {
        if (childChunk.parent_chunk_id === parentChunkId) {
          childChunk.sibling_chunk_ids = childIds.filter(id => id !== childChunk.chunk_id);
        }
      }

      parentIndex++;
    }
  }

  // Update total_chunks for parent chunks
  for (const chunk of parent_chunks) {
    chunk.total_chunks = parent_chunks.length;
  }

  // Calculate averages
  const avgParentTokens =
    parent_chunks.length > 0
      ? parent_chunks.reduce((sum, c) => sum + c.token_count, 0) / parent_chunks.length
      : 0;

  const avgChildTokens =
    child_chunks.length > 0
      ? child_chunks.reduce((sum, c) => sum + c.token_count, 0) / child_chunks.length
      : 0;

  return {
    parent_chunks,
    child_chunks,
    total_tokens: totalTokens,
    metadata: {
      parent_count: parent_chunks.length,
      child_count: child_chunks.length,
      avg_parent_tokens: Math.round(avgParentTokens),
      avg_child_tokens: Math.round(avgChildTokens),
      config,
    },
  };
}

/**
 * Main hierarchical chunking function
 *
 * Implements two-pass chunking:
 * 1. First pass: Split by Markdown headings (#, ##, ###) for semantic boundaries
 * 2. Second pass: Token-aware splitting within sections (parent-child hierarchy)
 *
 * @param markdown - Markdown content to chunk
 * @param config - Chunking configuration (optional)
 * @returns Parent and child chunks with metadata
 *
 * @example
 * ```typescript
 * const result = await chunkMarkdown(markdownContent);
 * console.log(`Created ${result.metadata.parent_count} parent chunks`);
 * console.log(`Created ${result.metadata.child_count} child chunks`);
 *
 * // Parent chunks are returned to LLM for context
 * // Child chunks are indexed in Qdrant for precision retrieval
 * ```
 */
export async function chunkMarkdown(
  markdown: string,
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG
): Promise<ChunkingResult> {
  // Validate input
  if (!markdown || markdown.trim().length === 0) {
    throw new Error('Markdown content cannot be empty');
  }

  // First pass: Split by headings
  const sections = splitByHeadings(markdown);

  if (sections.length === 0) {
    throw new Error('No sections found in markdown content');
  }

  // Second pass: Token-aware splitting
  const result = await tokenAwareSplit(sections, config);

  return result;
}

/**
 * Utility: Get all chunks (parent + child) sorted by index
 *
 * @param result - Chunking result
 * @returns All chunks sorted by chunk_index
 */
export function getAllChunks(result: ChunkingResult): TextChunk[] {
  return [...result.parent_chunks, ...result.child_chunks].sort(
    (a, b) => a.chunk_index - b.chunk_index
  );
}

/**
 * Selects the chunks worth embedding and storing in the vector index.
 *
 * Only the child grain is indexed. That is the design this pipeline was built
 * to: search the small grain for precision, then hand the model the larger
 * surrounding passage for context — `docs/RAG-CHUNKING-STRATEGY.md`, which
 * separates `uploadChunksToQdrant(child_chunks)` from
 * `storeParentChunks(parent_chunks)`. The second call was never written, so
 * parents went into the same collection as their children and the system paid
 * to search a grain it never meant to search.
 *
 * Indexing parents costs a great deal for nothing. Measured over six Docling
 * conversions on 2026-08-13: parents were 26.2% of points and **91.2% extra
 * embedding tokens**, and they carry no text of their own — 57 of 57 parents
 * were fully reconstructible from their own children. The surrounding passage
 * is therefore rebuilt from siblings that are already indexed, which is cheaper
 * than the parent store the original design asked for.
 *
 * A parent with no children is the exception and is kept: it is the only
 * carrier of its text, and dropping it would lose content outright.
 *
 * Parents stay in the chunking result. They are the grouping that defines
 * sibling sets and aggregates provenance; they simply never become points.
 *
 * @see selectIndexableChunks tests and `expandToSiblingContext` in shared/qdrant
 */
export function selectIndexableChunks(result: ChunkingResult): TextChunk[] {
  const childCountByParent = new Map<string, number>();
  for (const child of result.child_chunks) {
    if (!child.parent_chunk_id) continue;
    childCountByParent.set(
      child.parent_chunk_id,
      (childCountByParent.get(child.parent_chunk_id) ?? 0) + 1
    );
  }

  const childlessParents = result.parent_chunks.filter(
    parent => (childCountByParent.get(parent.chunk_id) ?? 0) === 0
  );

  return [...childlessParents, ...result.child_chunks].sort(
    (a, b) => a.chunk_index - b.chunk_index
  );
}

/**
 * Utility: Get child chunks for a specific parent
 *
 * @param result - Chunking result
 * @param parentChunkId - Parent chunk ID
 * @returns Child chunks belonging to parent
 */
export function getChildrenForParent(result: ChunkingResult, parentChunkId: string): TextChunk[] {
  return result.child_chunks.filter(chunk => chunk.parent_chunk_id === parentChunkId);
}

/**
 * Utility: Get parent chunk for a child
 *
 * @param result - Chunking result
 * @param childChunkId - Child chunk ID
 * @returns Parent chunk or null
 */
export function getParentForChild(result: ChunkingResult, childChunkId: string): TextChunk | null {
  const child = result.child_chunks.find(c => c.chunk_id === childChunkId);
  if (!child || !child.parent_chunk_id) return null;

  return result.parent_chunks.find(p => p.chunk_id === child.parent_chunk_id) || null;
}
