/**
 * Stage 5 RAG Integration - Qdrant Search Utilities
 *
 * Provides OPTIONAL RAG (Retrieval-Augmented Generation) integration for lesson generation.
 * Implements two modes:
 * 1. Legacy RAG: enrichBatchContext() - pre-retrieves context before generation
 * 2. Tool-calling RAG: createSearchDocumentsTool() - LLM autonomously queries during generation
 *
 * Token Budget Compliance (RT-003):
 * - RAG_MAX_TOKENS = 40,000 (maximum RAG context per batch)
 * - Dynamic adjustment based on available token budget
 * - Graceful degradation if Qdrant unavailable
 *
 * Integration Points:
 * - Uses existing searchChunks() from src/shared/qdrant/search.ts
 * - Integrates with document_relevance_mapping from Phase 6 RAG Planning
 * - Respects TOKEN_BUDGET constants for input limits
 *
 * @module services/stage5/qdrant-search
 * @see specs/008-generation-generation-json/research-decisions/rt-002-rag-decision.md
 * @see specs/008-generation-generation-json/research-decisions/rt-003-token-budget.md
 * @see specs/008-generation-generation-json/tasks/t022-qdrant-search-integration.md
 */

import { searchChunks } from '@/shared/qdrant/search';
import type { SearchOptions, SearchResult } from '@/shared/qdrant/search-types';
import type { AnalysisResult } from '@megacampus/shared-types/analysis-result';
import { logger } from '@/shared/logger';
import { getRagTokenBudget } from '../../../services/global-settings-service';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Token budget constants (RT-003)
 * Note: RAG_MAX_TOKENS is now fetched dynamically from database via getRagTokenBudget()
 */
const TOKEN_BUDGET = {
  RAG_MAX_TOKENS: 40_000,          // Fallback maximum RAG context per batch (if DB fetch fails)
  INPUT_BUDGET_MAX: 90_000,        // Maximum input tokens
  GEMINI_TRIGGER_INPUT: 108_000,   // Trigger Gemini fallback
  TOTAL_BUDGET: 120_000,           // Total (input + output)
} as const;

/**
 * Default retrieval limits for RAG
 */
const RAG_DEFAULTS = {
  CHUNK_LIMIT: 5,                  // Default number of chunks to retrieve
  SCORE_THRESHOLD: 0.7,            // Minimum similarity score
  ENABLE_HYBRID: true,             // Use hybrid search (dense + sparse)
} as const;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Section batch input (subset of GenerationJobInput)
 */
export interface SectionBatchInput {
  sections: Array<{
    section_id?: string;
    area: string;
    key_topics: string[];
    learning_objectives: string[];
  }>;
}

/**
 * Tool definition for LLM function calling
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      default?: any;
    }>;
    required?: string[];
  };
  handler: (params: any) => Promise<any>;
}

// ============================================================================
// TOKEN ESTIMATION
// ============================================================================

/**
 * Estimates token count from text (rough approximation for Russian/English)
 *
 * Uses conservative ratio of 2.5 characters per token, which works well for
 * Russian (longer words) and English (shorter words).
 *
 * Uses Math.floor instead of Math.ceil to ensure truncated text never exceeds token budget
 *
 * @param text - Text to estimate
 * @returns Estimated token count (conservative estimate)
 */
function estimateTokens(text: string): number {
  return Math.floor(text.length / 2.5);
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Enriches batch context with RAG-retrieved content (Legacy RAG mode)
 *
 * This function pre-retrieves relevant document content before generation begins.
 * Used when RAG is enabled but tool-calling is not preferred.
 *
 * Token Budget Compliance:
 * - Maximum 40K tokens from RAG context (TOKEN_BUDGET.RAG_MAX_TOKENS)
 * - Prioritizes highest-ranked Qdrant chunks if truncation needed
 * - Returns empty string if RAG not applicable or fails (graceful degradation)
 *
 * RAG Applicability Checks:
 * 1. Has document_summaries in analysisResult, OR
 * 2. needs_research === true in analysis_result, OR
 * 3. Title-only scenario (analysisResult === null)
 * If NONE → returns empty string
 *
 * @param batchInput - Section batch input data
 * @param courseId - Course UUID
 * @param analysisResult - Optional analysis result with document summaries
 * @returns Formatted RAG context string (max 40K tokens) or empty string
 *
 * @example
 * ```typescript
 * const ragContext = await enrichBatchContext(
 *   { sections: [{ area: "Neural Networks", key_topics: ["backprop", "gradients"] }] },
 *   "course-uuid-123",
 *   analysisResult
 * );
 * // Returns: "REFERENCE MATERIAL...\n\nDETAILED CHUNKS:..."
 * ```
 */
export async function enrichBatchContext(
  batchInput: SectionBatchInput,
  courseId: string,
  analysisResult?: AnalysisResult | null
): Promise<string> {
  try {
    // Check if RAG applicable
    const hasDocuments = analysisResult?.document_relevance_mapping &&
      Object.keys(analysisResult.document_relevance_mapping).length > 0;

    const needsResearch = analysisResult?.research_flags &&
      analysisResult.research_flags.length > 0;

    const isTitleOnly = analysisResult === null || analysisResult === undefined;

    if (!hasDocuments && !needsResearch && !isTitleOnly) {
      logger.debug({
        courseId,
        hasDocuments: !!hasDocuments,
        needsResearch: !!needsResearch,
        isTitleOnly,
      }, '[RAG] Not applicable - skipping context enrichment');
      return '';
    }

    // Step 1: Extract document summaries (lightweight context)
    let documentSummariesText = '';
    const documentIds = new Set<string>();

    if (analysisResult?.document_relevance_mapping) {
      // Build document summaries from relevance mapping
      const docMap = analysisResult.document_relevance_mapping;

      // Collect all referenced document IDs across sections
      for (const sectionId of Object.keys(docMap)) {
        const sectionMapping = docMap[sectionId];
        if (sectionMapping?.primary_documents) {
          sectionMapping.primary_documents.forEach(docId => documentIds.add(docId));
        }
      }

      // Format document summaries text
      if (documentIds.size > 0) {
        documentSummariesText = 'AVAILABLE DOCUMENTS:\n';
        documentIds.forEach(docId => {
          documentSummariesText += `- Document ID: ${docId}\n`;
        });
        documentSummariesText += '\n';
      }
    }

    // Step 2: Query Qdrant for detailed chunks
    const queryTerms = batchInput.sections.flatMap(s => s.key_topics).join(' ');

    if (!queryTerms.trim()) {
      logger.warn({ courseId }, '[RAG] No key topics found in batch input - skipping Qdrant query');
      return documentSummariesText || '';
    }

    const searchOptions: SearchOptions = {
      limit: RAG_DEFAULTS.CHUNK_LIMIT,
      score_threshold: RAG_DEFAULTS.SCORE_THRESHOLD,
      enable_hybrid: RAG_DEFAULTS.ENABLE_HYBRID,
      filters: {
        course_id: courseId,
      },
    };

    logger.debug({
      courseId,
      queryPreview: queryTerms.substring(0, 100),
      chunkLimit: RAG_DEFAULTS.CHUNK_LIMIT,
    }, '[RAG] Querying Qdrant for detailed chunks');

    const searchResponse = await searchChunks(queryTerms, searchOptions);

    if (searchResponse.results.length === 0) {
      logger.info({
        courseId,
        queryTerms: queryTerms.substring(0, 100),
      }, '[RAG] No chunks retrieved from Qdrant - returning document summaries only');
      return documentSummariesText || '';
    }

    // Step 3: Format Qdrant chunks
    const qdrantChunksText = searchResponse.results
      .map((chunk: SearchResult, index: number) => {
        return `[Chunk ${index + 1}] (Score: ${chunk.score.toFixed(2)})
Document: ${chunk.document_name}
Heading: ${chunk.heading_path}
Content:
${chunk.content}
`;
      })
      .join('\n---\n\n');

    // Step 4: Token budget compliance (fetch from database)
    const ragMaxTokens = await getRagTokenBudget();
    const combinedText = documentSummariesText + '\nDETAILED CHUNKS:\n' + qdrantChunksText;
    const estimatedTokens = estimateTokens(combinedText);

    let finalText = combinedText;
    let truncated = false;

    if (estimatedTokens > ragMaxTokens) {
      // Truncate to fit within budget (prioritize highest-ranked chunks)
      const maxChars = ragMaxTokens * 2.5;
      finalText = combinedText.substring(0, Math.floor(maxChars));
      truncated = true;
    }

    logger.info({
      courseId,
      documentsCount: documentIds.size,
      chunksRetrieved: searchResponse.results.length,
      ragTokens: estimatedTokens,
      cappedTo: truncated ? ragMaxTokens : estimatedTokens,
      truncated,
      ragMaxTokensSource: 'database',
    }, '[RAG] Context enrichment complete');

    // Step 5: Format output
    const formattedOutput = `REFERENCE MATERIAL (extract specific details if relevant):
${finalText}`;

    return formattedOutput;

  } catch (error) {
    // Graceful degradation - RAG is optional enhancement
    logger.error({
      err: error instanceof Error ? error.message : String(error),
      courseId,
    }, '[RAG] Context enrichment failed - continuing without RAG');
    return '';
  }
}

/**
 * Creates tool definition for LLM-driven autonomous RAG
 *
 * This function creates a tool that allows the LLM to autonomously query documents
 * during generation. The LLM decides when it needs specific details not provided
 * in the analysis result.
 *
 * Tool Usage Pattern:
 * 1. LLM generates lessons using analysis_result context
 * 2. If LLM needs exact formulas, code examples, or citations → calls search_documents
 * 3. Qdrant retrieves relevant chunks scoped to course_id
 * 4. LLM incorporates retrieved content into lesson generation
 *
 * Cost Impact (RT-002):
 * - Autonomous usage: 2-5 queries per course → +5-12% cost
 * - Generic courses: LLM rarely queries → minimal overhead
 * - Specialized courses: LLM queries more → better accuracy
 *
 * @param courseId - Course UUID for filtering
 * @returns Tool definition compatible with LangChain ChatOpenAI
 *
 * @example
 * ```typescript
 * const tool = createSearchDocumentsTool("course-uuid-123");
 * const model = new ChatOpenAI({ tools: [tool] });
 * // LLM can now call search_documents when it needs specific details
 * ```
 */
export function createSearchDocumentsTool(courseId: string): ToolDefinition {
  return {
    name: 'search_documents',
    description: `Search source documents for exact formulas, legal text, code examples, or citations. Use SPARINGLY - only when you need specific details NOT provided in analysis_result.

**Use this tool when you need**:
1. Exact formulas, algorithms, or technical specifications
2. Specific code examples or implementation patterns
3. Legal text, standards, or compliance requirements (exact wording)
4. Citations, references, or academic sources

**Do NOT use this tool for**:
- Generic educational concepts (use your internal knowledge)
- Creative elaboration (design exercises, create explanations)
- Information already provided in analysis_result
- Pedagogical reasoning (lesson breakdown, sequencing)`,

    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language query describing what you need to find in the documents',
        },
        limit: {
          type: 'number',
          description: 'Number of chunks to retrieve (default: 3, max: 10)',
          default: 3,
        },
        filter: {
          type: 'object',
          description: 'Optional filters (e.g., section_id to scope search to specific section)',
        },
      },
      required: ['query'],
    },

    handler: async (params: {
      query: string;
      limit?: number;
      filter?: Record<string, any>;
    }) => {
      try {
        const limit = Math.min(params.limit || 3, 10); // Cap at 10 chunks

        const searchOptions: SearchOptions = {
          limit,
          score_threshold: RAG_DEFAULTS.SCORE_THRESHOLD,
          enable_hybrid: RAG_DEFAULTS.ENABLE_HYBRID,
          filters: {
            course_id: courseId,
            ...params.filter,
          },
        };

        logger.info({
          courseId,
          query: params.query.substring(0, 100),
          limit,
          filters: params.filter,
        }, '[RAG Tool] LLM called search_documents');

        const response = await searchChunks(params.query, searchOptions);

        // Format results for LLM consumption
        const formattedChunks = response.results.map((r: SearchResult) => ({
          content: r.content,
          document: r.document_name,
          heading: r.heading_path,
          score: r.score,
        }));

        logger.debug({
          courseId,
          chunksRetrieved: formattedChunks.length,
          totalResults: response.metadata.total_results,
          searchType: response.metadata.search_type,
        }, '[RAG Tool] Search completed successfully');

        return {
          chunks: formattedChunks,
          metadata: {
            total_results: response.metadata.total_results,
            search_type: response.metadata.search_type,
          },
        };
      } catch (error) {
        // Return error message to LLM (graceful degradation)
        logger.error({
          err: error instanceof Error ? error.message : String(error),
          courseId,
          query: params.query.substring(0, 100),
        }, '[RAG Tool] Search failed');

        return {
          error: 'Search unavailable - please continue with available context',
          chunks: [],
          metadata: {
            total_results: 0,
            search_type: 'error',
          },
        };
      }
    },
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { TOKEN_BUDGET, RAG_DEFAULTS };
