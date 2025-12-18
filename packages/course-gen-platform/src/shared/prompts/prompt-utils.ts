/**
 * Shared Prompt Utilities
 * @module shared/prompts/prompt-utils
 *
 * Reusable utilities for prompt generation and RAG context formatting.
 * Extracted from Stage 6 lesson content generation to eliminate duplication.
 *
 * Functions:
 * - escapeXml: Escape XML special characters for safe prompt injection
 * - estimateTokens: Estimate token count from text
 * - formatRAGContextXML: Format RAG chunks as XML with token budget management
 * - filterChunksForSection: Filter RAG chunks by section ID
 */

import type { RAGChunk } from '@megacampus/shared-types/lesson-content';
import { logger } from '@/shared/logger';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default characters per token estimate (conservative for mixed Russian/English)
 */
export const DEFAULT_CHARS_PER_TOKEN = 2.5;

/**
 * Default token limits for RAG context injection
 * Matches production DB value and qdrant-search.ts TOKEN_BUDGET.RAG_MAX_TOKENS
 * @see services/global-settings-service.ts DEFAULT_GLOBAL_SETTINGS.ragTokenBudget
 */
export const DEFAULT_RAG_MAX_TOKENS = 40_000;

// ============================================================================
// XML ESCAPING
// ============================================================================

/**
 * Escape XML special characters in text
 *
 * Converts XML special characters to their entity equivalents to prevent
 * XML parsing errors and injection attacks in prompts.
 *
 * @param text - Text to escape
 * @returns XML-safe text with escaped characters
 *
 * @example
 * ```typescript
 * const safe = escapeXml('Use <tag> & "quotes"');
 * // Returns: 'Use &lt;tag&gt; &amp; &quot;quotes&quot;'
 * ```
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// TOKEN ESTIMATION
// ============================================================================

/**
 * Estimate token count from text length
 *
 * Uses a conservative character-to-token ratio to estimate token usage.
 * This is an approximation - actual token counts may vary by model and tokenizer.
 *
 * @param text - Text to estimate token count for
 * @param charsPerToken - Characters per token ratio (default: 2.5)
 * @returns Estimated token count (rounded up)
 *
 * @example
 * ```typescript
 * const tokens = estimateTokens('Hello world!');
 * // Returns: 5 (12 chars / 2.5 = 4.8, rounded to 5)
 * ```
 */
export function estimateTokens(
  text: string,
  charsPerToken: number = DEFAULT_CHARS_PER_TOKEN
): number {
  return Math.ceil(text.length / charsPerToken);
}

// ============================================================================
// RAG CONTEXT FORMATTING
// ============================================================================

/**
 * Format RAG chunks as XML for prompt injection
 *
 * Creates structured XML context from RAG chunks with token budget management.
 * Chunks are sorted by relevance score and truncated if total exceeds maxTokens budget.
 *
 * Output format:
 * ```xml
 * <rag_context chunks="3" total_available="5">
 *   <chunk document="file.pdf" section="Chapter 1" score="0.85">
 *     Content here...
 *   </chunk>
 *   ...
 *   <!-- Truncated: 2 additional chunks omitted due to token budget -->
 * </rag_context>
 * ```
 *
 * @param chunks - RAG chunks to format
 * @param maxTokens - Maximum token budget (default: 20000)
 * @returns Formatted XML string ready for prompt injection
 *
 * @example
 * ```typescript
 * const ragXml = formatRAGContextXML(chunks, 15000);
 * // Returns XML string with chunks sorted by relevance, truncated to budget
 * ```
 */
export function formatRAGContextXML(
  chunks: RAGChunk[],
  maxTokens: number = DEFAULT_RAG_MAX_TOKENS
): string {
  if (!chunks || chunks.length === 0) {
    logger.debug({ maxTokens }, 'formatRAGContextXML: No chunks provided');
    return '<rag_context chunks="0">\n  <!-- No RAG context available -->\n</rag_context>';
  }

  const xmlParts: string[] = [];
  let currentTokens = 0;
  let truncated = false;

  // Reserve tokens for XML wrapper overhead
  const wrapperOverhead = 100;
  const availableTokens = maxTokens - wrapperOverhead;

  // Sort by relevance score (highest first)
  const sortedChunks = [...chunks].sort(
    (a, b) => b.relevance_score - a.relevance_score
  );

  for (const chunk of sortedChunks) {
    const escapedContent = escapeXml(chunk.content);
    const escapedDocument = escapeXml(chunk.document_name);
    const escapedSection = escapeXml(chunk.page_or_section || '');

    const chunkXml = `  <chunk document="${escapedDocument}" section="${escapedSection}" score="${chunk.relevance_score.toFixed(2)}">
${escapedContent}
  </chunk>`;

    const chunkTokens = estimateTokens(chunkXml);

    if (currentTokens + chunkTokens > availableTokens) {
      truncated = true;
      break;
    }

    xmlParts.push(chunkXml);
    currentTokens += chunkTokens;
  }

  const truncationNote = truncated
    ? `\n  <!-- Truncated: ${chunks.length - xmlParts.length} additional chunks omitted due to token budget -->`
    : '';

  logger.debug(
    {
      totalChunks: chunks.length,
      includedChunks: xmlParts.length,
      estimatedTokens: currentTokens,
      truncated,
    },
    'formatRAGContextXML: Formatted RAG context'
  );

  return `<rag_context chunks="${xmlParts.length}" total_available="${chunks.length}">${truncationNote}
${xmlParts.join('\n')}
</rag_context>`;
}

// ============================================================================
// RAG CHUNK FILTERING
// ============================================================================

/**
 * Filter RAG chunks by section's RAG context ID
 *
 * Filters chunks that match the section's RAG context ID, either directly
 * via metadata or by chunk_id inclusion. If no direct matches found,
 * falls back to returning top chunks by relevance score.
 *
 * @param ragChunks - All RAG chunks for the lesson
 * @param sectionRagId - Section's RAG context ID (can be null)
 * @returns Filtered chunks relevant to this section (up to 5 matches or 3 fallback)
 *
 * @example
 * ```typescript
 * const sectionChunks = filterChunksForSection(allChunks, 'section-123');
 * // Returns chunks matching section-123, or top 3 by relevance if no matches
 * ```
 */
export function filterChunksForSection(
  ragChunks: RAGChunk[],
  sectionRagId: string | null
): RAGChunk[] {
  // Handle null/empty section ID - return top chunks by relevance
  if (!sectionRagId) {
    return ragChunks
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, 3);
  }

  // Filter chunks that match the section's RAG context
  const matchingChunks = ragChunks.filter(
    (chunk) =>
      chunk.metadata?.rag_context_id === sectionRagId ||
      chunk.chunk_id.includes(sectionRagId)
  );

  if (matchingChunks.length > 0) {
    return matchingChunks
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, 5);
  }

  // Fallback: return top chunks by relevance
  return ragChunks
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, 3);
}
