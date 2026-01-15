import type { RAGChunk } from '@megacampus/shared-types/lesson-content';
import { LESSON_RAG_CONFIG } from './constants';

/**
 * Escape XML special characters
 *
 * @param text - Text to escape
 * @returns Escaped text safe for XML
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Estimate token count from text
 *
 * Uses conservative ratio of 2.5 characters per token.
 * Works well for both Russian (longer words) and English (shorter words).
 *
 * @param text - Text to estimate
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  return Math.floor(text.length / 2.5);
}

/**
 * Format a single chunk as XML
 *
 * @param chunk - RAG chunk to format
 * @returns XML string for the chunk
 */
function formatSingleChunk(chunk: RAGChunk): string {
  const escapedContent = escapeXml(chunk.content);
  const escapedHeading = escapeXml(chunk.page_or_section || '');
  const escapedDocument = escapeXml(chunk.document_name);

  return `  <chunk document="${escapedDocument}" heading="${escapedHeading}" score="${chunk.relevance_score.toFixed(2)}">
${escapedContent}
  </chunk>`;
}

/**
 * Format chunks for prompt injection
 *
 * Creates a structured XML format for injection into generation prompts.
 * Truncates content if total exceeds maxTokens budget.
 *
 * @param chunks - RAG chunks to format
 * @param lessonId - Lesson identifier for XML attribute
 * @param maxTokens - Maximum token budget (default: 20000)
 * @returns Formatted XML string
 *
 * @example
 * ```typescript
 * const context = formatLessonChunksForPrompt(chunks, '1.1', 20000);
 * // Returns:
 * // <rag_context lesson_id="1.1" chunks="7">
 * //   <chunk document="file.pdf" heading="Chapter 1" score="0.85">
 * //     Content here...
 * //   </chunk>
 * //   ...
 * // </rag_context>
 * ```
 */
export function formatLessonChunksForPrompt(
  chunks: RAGChunk[],
  lessonId: string,
  maxTokens: number = LESSON_RAG_CONFIG.MAX_TOKENS
): string {
  if (!chunks || chunks.length === 0) {
    return `<rag_context lesson_id="${escapeXml(lessonId)}">
  <!-- No RAG chunks available -->
</rag_context>`;
  }

  const xmlParts: string[] = [];
  let currentTokens = 0;
  let truncated = false;

  // Reserve tokens for XML wrapper
  const wrapperOverhead = 100;
  const availableTokens = maxTokens - wrapperOverhead;

  for (const chunk of chunks) {
    const chunkXml = formatSingleChunk(chunk);
    const chunkTokens = estimateTokens(chunkXml);

    if (currentTokens + chunkTokens > availableTokens) {
      truncated = true;
      break;
    }

    xmlParts.push(chunkXml);
    currentTokens += chunkTokens;
  }

  const content = xmlParts.join('\n');
  const truncationNote = truncated
    ? `\n  <!-- Truncated: ${chunks.length - xmlParts.length} additional chunks omitted due to token budget -->`
    : '';

  return `<rag_context lesson_id="${escapeXml(lessonId)}" chunks="${xmlParts.length}" total_available="${chunks.length}">${truncationNote}\n${content}\n</rag_context>`;
}
