/**
 * Hierarchical Chunking with Adaptive Compression Strategy
 * @module orchestrator/strategies/hierarchical-chunking
 *
 * Production-validated strategy ported from n8n workflow:
 * - 5% overlap between chunks for context preservation
 * - Adaptive compression levels: DETAILED → BALANCED → AGGRESSIVE
 * - Recursive iteration (max 5) until target tokens reached
 * - Quality: 0.75-0.82 semantic fidelity validated
 *
 * Algorithm:
 * 1. Split text into 115K token chunks with 5% overlap
 * 2. Summarize each chunk in parallel with compression-level-specific prompts
 * 3. Combine chunk summaries
 * 4. If combined > target tokens, recursively chunk and summarize again
 * 5. Increase compression level each iteration: DETAILED → BALANCED → AGGRESSIVE
 * 6. Stop when target reached or max iterations exceeded
 */

import { llmClient } from '../llm/client';
import { tokenEstimator } from '../llm/token-estimator';
import logger from '../logger';

/**
 * Compression level determines summarization prompt aggressiveness
 */
export type CompressionLevel = 'DETAILED' | 'BALANCED' | 'AGGRESSIVE';

/**
 * Options for hierarchical chunking strategy
 */
export interface HierarchicalChunkingOptions {
  /** Target final output size in tokens (default: 200000) */
  targetTokens?: number;
  /** Maximum recursive iterations (default: 5) */
  maxIterations?: number;
  /** Chunk size in tokens (default: 115000) */
  chunkSize?: number;
  /** Overlap percentage between chunks (default: 5) */
  overlapPercent?: number;
  /** LLM model to use (default: 'openai/gpt-oss-20b') */
  model?: string;
  /** Temperature for LLM generation (default: 0.7) */
  temperature?: number;
  /** Max output tokens per chunk (default: 10000) */
  maxTokensPerChunk?: number;
}

/**
 * Result from hierarchical chunking summarization
 */
export interface HierarchicalChunkingResult {
  /** Final summary text */
  summary: string;
  /** Number of iterations performed */
  iterations: number;
  /** Total input tokens consumed across all LLM calls */
  totalInputTokens: number;
  /** Total output tokens generated across all LLM calls */
  totalOutputTokens: number;
  /** Metadata about processing */
  metadata: {
    /** Compression levels used in each iteration */
    compression_levels_used: CompressionLevel[];
    /** Number of chunks processed (sum across all iterations) */
    total_chunks_processed: number;
    /** Final token count of summary */
    final_token_count: number;
    /** Whether target was reached or max iterations hit */
    target_reached: boolean;
  };
}

/**
 * Internal chunk summary result
 */
interface ChunkSummary {
  summary: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * System prompts for each compression level
 *
 * Based on production-validated n8n workflow prompts
 */
const COMPRESSION_PROMPTS: Record<CompressionLevel, string> = {
  DETAILED: `You are a highly skilled document summarizer. Create a comprehensive summary that:
1. Preserves all key information, concepts, and insights
2. Maintains the logical structure and flow of ideas
3. Includes important technical details, examples, and explanations
4. Uses clear, professional language
5. Focuses on essential content while removing redundancy

Create a detailed summary that captures the full depth of the content.`,

  BALANCED: `You are a skilled document summarizer. Create a concise summary that:
1. Focuses on the main ideas and key points
2. Maintains logical flow and structure
3. Includes important context and supporting details
4. Uses clear, professional language
5. Balances comprehensiveness with brevity

Create a balanced summary that covers core content without excessive detail.`,

  AGGRESSIVE: `You are an expert document summarizer. Create a very brief summary that:
1. Captures only the most critical information
2. Focuses on essential facts and conclusions
3. Removes all non-essential details and examples
4. Uses clear, concise language
5. Maximizes information density

Create an ultra-concise summary with maximum compression.`,
};

/**
 * Hierarchical Chunking with Adaptive Compression
 *
 * Recursively chunks and summarizes large documents using adaptive compression.
 *
 * @param text - Input text to summarize
 * @param language - Language code for token estimation (e.g., 'rus', 'eng')
 * @param topic - Document topic for context-aware summarization
 * @param options - Configuration options
 * @returns Summary result with metadata
 *
 * @example
 * ```typescript
 * const result = await hierarchicalChunking(
 *   extractedText,
 *   'rus',
 *   'Educational materials on chemistry',
 *   { targetTokens: 200000, maxIterations: 5 }
 * );
 * console.log(`Summary: ${result.summary.slice(0, 200)}...`);
 * console.log(`Iterations: ${result.iterations}`);
 * console.log(`Total cost: ${result.totalInputTokens + result.totalOutputTokens} tokens`);
 * ```
 */
export async function hierarchicalChunking(
  text: string,
  language: string,
  topic: string,
  options: HierarchicalChunkingOptions = {}
): Promise<HierarchicalChunkingResult> {
  const {
    targetTokens = 200000,
    maxIterations = 5,
    chunkSize = 115000,
    overlapPercent = 5,
    model = 'openai/gpt-oss-20b',
    temperature = 0.7,
    maxTokensPerChunk = 10000,
  } = options;

  logger.info({
    textLength: text.length,
    language,
    topic,
    targetTokens,
    maxIterations,
    chunkSize,
    overlapPercent,
    model,
  }, 'Starting hierarchical chunking summarization');

  let currentText = text;
  let iteration = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalChunksProcessed = 0;
  const compressionLevelsUsed: CompressionLevel[] = [];

  // Recursive iteration loop
  while (iteration < maxIterations) {
    iteration++;

    // Estimate current token count
    const currentTokens = tokenEstimator.estimateTokens(currentText, language);

    logger.info({
      iteration,
      currentTokens,
      targetTokens,
      compressionLevel: getCompressionLevel(iteration),
    }, 'Hierarchical chunking iteration');

    // Stop condition: target reached
    if (currentTokens <= targetTokens) {
      logger.info({
        iteration,
        finalTokens: currentTokens,
        targetTokens,
      }, 'Target tokens reached, stopping iteration');

      return {
        summary: currentText,
        iterations: iteration - 1, // Don't count the final check iteration
        totalInputTokens,
        totalOutputTokens,
        metadata: {
          compression_levels_used: compressionLevelsUsed,
          total_chunks_processed: totalChunksProcessed,
          final_token_count: currentTokens,
          target_reached: true,
        },
      };
    }

    // Determine compression level based on iteration
    const compressionLevel = getCompressionLevel(iteration);
    compressionLevelsUsed.push(compressionLevel);

    logger.info({
      iteration,
      compressionLevel,
      currentTokens,
    }, 'Chunking and summarizing with compression level');

    // Split into chunks with overlap
    const chunks = createChunks(currentText, {
      chunkSize,
      overlapPercent,
      language,
    });

    totalChunksProcessed += chunks.length;

    logger.info({
      iteration,
      chunkCount: chunks.length,
      compressionLevel,
    }, 'Created chunks for parallel summarization');

    // Summarize each chunk in parallel
    const chunkSummaries = await Promise.all(
      chunks.map((chunk, index) =>
        summarizeChunk(
          chunk,
          model,
          compressionLevel,
          topic,
          temperature,
          maxTokensPerChunk,
          index,
          chunks.length
        )
      )
    );

    // Track tokens
    chunkSummaries.forEach(result => {
      totalInputTokens += result.inputTokens;
      totalOutputTokens += result.outputTokens;
    });

    logger.info({
      iteration,
      chunksSummarized: chunkSummaries.length,
      totalInputTokens,
      totalOutputTokens,
    }, 'Chunk summaries generated');

    // Combine summaries with separator
    currentText = chunkSummaries.map(r => r.summary).join('\n\n---\n\n');
  }

  // Max iterations reached
  const finalTokens = tokenEstimator.estimateTokens(currentText, language);

  logger.warn({
    maxIterations,
    finalTokens,
    targetTokens,
    compressionLevelsUsed,
  }, 'Max iterations reached, target not achieved');

  return {
    summary: currentText,
    iterations: maxIterations,
    totalInputTokens,
    totalOutputTokens,
    metadata: {
      compression_levels_used: compressionLevelsUsed,
      total_chunks_processed: totalChunksProcessed,
      final_token_count: finalTokens,
      target_reached: false,
    },
  };
}

/**
 * Determine compression level based on iteration number
 *
 * Adaptive compression: starts DETAILED, escalates to AGGRESSIVE
 *
 * @param iteration - Current iteration number (1-based)
 * @returns Compression level to use
 */
function getCompressionLevel(iteration: number): CompressionLevel {
  if (iteration === 1) {
    return 'DETAILED';
  } else if (iteration <= 3) {
    return 'BALANCED';
  } else {
    return 'AGGRESSIVE';
  }
}

/**
 * Split text into overlapping chunks
 *
 * Chunks are created with specified token size and overlap percentage.
 * Overlap ensures context preservation between chunks.
 *
 * Algorithm:
 * 1. Calculate chunk size and overlap in characters (using language ratio)
 * 2. Slide window across text with overlap step
 * 3. Handle edge case: last chunk may be smaller
 *
 * @param text - Text to chunk
 * @param options - Chunking configuration
 * @returns Array of text chunks
 *
 * @example
 * ```typescript
 * const chunks = createChunks(longText, {
 *   chunkSize: 115000,      // 115K tokens per chunk
 *   overlapPercent: 5,      // 5% overlap (5,750 tokens)
 *   language: 'rus'
 * });
 * // For Russian (3.2 chars/token):
 * // Chunk size ≈ 368,000 characters
 * // Overlap ≈ 18,400 characters
 * ```
 */
function createChunks(
  text: string,
  options: {
    chunkSize: number;
    overlapPercent: number;
    language: string;
  }
): string[] {
  const { chunkSize, overlapPercent, language } = options;

  // Get language-specific character-to-token ratio
  const ratio = tokenEstimator.getLanguageRatio(language);

  // Calculate chunk size in characters
  const chunkCharSize = Math.ceil(chunkSize * ratio);

  // ADAPTIVE OVERLAP: Scale down for small documents
  // - If document < chunk size: use minimal overlap (1%)
  // - If document < 2x chunk size: use half the configured overlap
  // - Otherwise: use full configured overlap
  let effectiveOverlapPercent = overlapPercent;
  if (text.length < chunkCharSize) {
    effectiveOverlapPercent = 1; // Minimal for small docs
  } else if (text.length < chunkCharSize * 2) {
    effectiveOverlapPercent = Math.max(1, overlapPercent / 2); // Half, min 1%
  }

  const overlapCharSize = Math.ceil((chunkSize * (effectiveOverlapPercent / 100)) * ratio);

  logger.debug({
    originalOverlapPercent: overlapPercent,
    effectiveOverlapPercent,
    textLength: text.length,
    chunkCharSize,
    overlapCharSize,
    reason: text.length < chunkCharSize ? 'small_document' :
            text.length < chunkCharSize * 2 ? 'medium_document' : 'large_document',
  }, 'Adaptive overlap calculated');

  const chunks: string[] = [];
  let start = 0;

  // Slide window with overlap
  while (start < text.length) {
    const end = Math.min(start + chunkCharSize, text.length);
    const chunk = text.slice(start, end);

    // Skip empty chunks
    if (chunk.trim().length > 0) {
      chunks.push(chunk);
    }

    // Move start position (subtract overlap for next chunk)
    const previousStart = start;
    start = end - overlapCharSize;

    // Prevent infinite loop:
    // 1. If overlap >= chunk size (start >= end - 1)
    // 2. If we're not advancing (start <= previousStart) - happens when
    //    text is smaller than one chunk and overlap > remaining text
    if (start >= end - 1 || start <= previousStart) {
      start = end;
    }
  }

  logger.debug({
    textLength: text.length,
    chunkCount: chunks.length,
    avgChunkSize: chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length,
  }, 'Chunks created');

  return chunks;
}

/**
 * Summarize a single chunk using LLM
 *
 * @param chunk - Text chunk to summarize
 * @param model - LLM model to use
 * @param compressionLevel - Compression level for prompt
 * @param topic - Document topic for context
 * @param temperature - LLM temperature
 * @param maxTokens - Max output tokens
 * @param chunkIndex - Index of this chunk (for logging)
 * @param totalChunks - Total number of chunks (for logging)
 * @returns Chunk summary with token counts
 */
async function summarizeChunk(
  chunk: string,
  model: string,
  compressionLevel: CompressionLevel,
  topic: string,
  temperature: number,
  maxTokens: number,
  chunkIndex: number,
  totalChunks: number
): Promise<ChunkSummary> {
  const systemPrompt = COMPRESSION_PROMPTS[compressionLevel];

  const userPrompt = `Document topic: ${topic}

This is chunk ${chunkIndex + 1} of ${totalChunks}.

Please summarize the following text:

${chunk}`;

  logger.debug({
    chunkIndex,
    totalChunks,
    chunkLength: chunk.length,
    compressionLevel,
    model,
  }, 'Summarizing chunk');

  try {
    const response = await llmClient.generateCompletion(userPrompt, {
      model,
      temperature,
      maxTokens,
      systemPrompt,
    });

    logger.debug({
      chunkIndex,
      totalChunks,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      compressionLevel,
    }, 'Chunk summarized successfully');

    return {
      summary: response.content,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    };
  } catch (error) {
    logger.error({
      chunkIndex,
      totalChunks,
      compressionLevel,
      error: error instanceof Error ? error.message : String(error),
    }, 'Failed to summarize chunk');

    throw new Error(
      `Failed to summarize chunk ${chunkIndex + 1}/${totalChunks}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
