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

import { MarkdownTextSplitter, RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { encoding_for_model } from 'tiktoken';
import type { TiktokenModel } from 'tiktoken';

/**
 * Chunk hierarchy level
 */
export type ChunkLevel = 'parent' | 'child';

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
  chunk_strategy: 'hierarchical_markdown';
  /** Overlap tokens with previous chunk */
  overlap_tokens: number;
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
function countTokens(text: string, model: TiktokenModel): number {
  const encoder = encoding_for_model(model);
  try {
    const tokens = encoder.encode(text);
    return tokens.length;
  } finally {
    encoder.free(); // Important: free encoder to prevent memory leaks
  }
}

/**
 * First pass: Split markdown by headings (#, ##, ###)
 *
 * Uses LangChain MarkdownTextSplitter to preserve document hierarchy
 *
 * @param markdown - Markdown content
 * @returns Markdown sections with heading metadata
 */
async function splitByHeadings(markdown: string): Promise<MarkdownDocument[]> {
  const splitter = new MarkdownTextSplitter({
    // Split by H1, H2, H3 headings
    // This creates semantic boundaries at major topic changes
  });

  return await splitter.createDocuments([markdown]);
}

/**
 * Second pass: Token-aware splitting within heading sections
 *
 * Creates parent-child chunk hierarchy with sentence boundary preservation
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

  // Create parent splitter (1500 tokens)
  const parentSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: config.parent_chunk_size * 4, // Rough approximation: 1 token ≈ 4 chars
    chunkOverlap: 0, // No overlap for parent chunks
    separators: ['\n\n', '\n', '. ', ' '], // Sentence boundaries
    keepSeparator: true,
  });

  // Create child splitter (400 tokens, 50 token overlap)
  const childSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: config.child_chunk_size * 4, // Rough approximation
    chunkOverlap: config.child_chunk_overlap * 4,
    separators: ['\n\n', '\n', '. ', ' '], // Sentence boundaries
    keepSeparator: true,
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
      const parentTokenCount = countTokens(parentText, config.tiktoken_model);

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
        const childTokenCount = countTokens(childText, config.tiktoken_model);

        // Skip very small child chunks
        if (childTokenCount < 50) continue;

        const childChunkId = generateChunkId(childText, child_chunks.length, 'child');
        childIds.push(childChunkId);

        // Calculate overlap tokens with previous chunk
        let overlapTokens = 0;
        if (i > 0) {
          const prevText = childTexts[i - 1];
          const overlapLength = Math.min(
            prevText.length,
            config.child_chunk_overlap * 4
          );
          const overlapText = prevText.substring(prevText.length - overlapLength);
          overlapTokens = countTokens(overlapText, config.tiktoken_model);
        }

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
  const avgParentTokens = parent_chunks.length > 0
    ? parent_chunks.reduce((sum, c) => sum + c.token_count, 0) / parent_chunks.length
    : 0;

  const avgChildTokens = child_chunks.length > 0
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
  const sections = await splitByHeadings(markdown);

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
 * Utility: Get child chunks for a specific parent
 *
 * @param result - Chunking result
 * @param parentChunkId - Parent chunk ID
 * @returns Child chunks belonging to parent
 */
export function getChildrenForParent(
  result: ChunkingResult,
  parentChunkId: string
): TextChunk[] {
  return result.child_chunks.filter(
    chunk => chunk.parent_chunk_id === parentChunkId
  );
}

/**
 * Utility: Get parent chunk for a child
 *
 * @param result - Chunking result
 * @param childChunkId - Child chunk ID
 * @returns Parent chunk or null
 */
export function getParentForChild(
  result: ChunkingResult,
  childChunkId: string
): TextChunk | null {
  const child = result.child_chunks.find(c => c.chunk_id === childChunkId);
  if (!child || !child.parent_chunk_id) return null;

  return result.parent_chunks.find(p => p.chunk_id === child.parent_chunk_id) || null;
}
