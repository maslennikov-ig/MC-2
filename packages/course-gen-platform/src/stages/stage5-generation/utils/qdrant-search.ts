/**
 * Stage 5 RAG Integration - Qdrant Search Utilities
 *
 * Provides OPTIONAL RAG (Retrieval-Augmented Generation) integration for lesson generation.
 * Uses tool-calling RAG: createSearchDocumentsTool() - LLM autonomously queries during generation.
 *
 * Integration Points:
 * - Uses existing searchChunks() from src/shared/qdrant/search.ts
 * - Integrates with vector search and priority boosting for document retrieval
 * - Graceful degradation if Qdrant unavailable
 *
 * @module services/stage5/qdrant-search
 * @see specs/008-generation-generation-json/research-decisions/rt-002-rag-decision.md
 * @see specs/008-generation-generation-json/tasks/t022-qdrant-search-integration.md
 */

import { searchChunks } from '@/shared/qdrant/search';
import type { SearchOptions, SearchResult } from '@/shared/qdrant/search-types';
import { logger } from '@/shared/logger';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default retrieval limits for RAG
 */
const RAG_DEFAULTS = {
  CHUNK_LIMIT: 5, // Default number of chunks to retrieve
  SCORE_THRESHOLD: 0.7, // Minimum similarity score
  ENABLE_HYBRID: true, // ENABLED: sparse vectors uploaded + native Query API with server-side RRF
} as const;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Tool definition for LLM function calling
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<
      string,
      {
        type: string;
        description: string;
        default?: unknown;
      }
    >;
    required?: string[];
  };
  handler: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

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

    handler: async (params: Record<string, unknown>) => {
      const {
        query,
        limit: rawLimit,
        filter,
      } = params as {
        query: string;
        limit?: number;
        filter?: Record<string, unknown>;
      };
      try {
        const limit = Math.min(rawLimit || 3, 10); // Cap at 10 chunks

        const searchOptions: SearchOptions = {
          limit,
          score_threshold: RAG_DEFAULTS.SCORE_THRESHOLD,
          enable_hybrid: RAG_DEFAULTS.ENABLE_HYBRID,
          filters: {
            course_id: courseId,
            ...filter,
          },
        };

        logger.info(
          {
            courseId,
            query: query.substring(0, 100),
            limit,
            filters: filter,
          },
          '[RAG Tool] LLM called search_documents'
        );

        const response = await searchChunks(query, searchOptions);

        // Format results for LLM consumption
        const formattedChunks = response.results.map((r: SearchResult) => ({
          content: r.content,
          document: r.document_name,
          heading: r.heading_path,
          score: r.score,
        }));

        logger.debug(
          {
            courseId,
            chunksRetrieved: formattedChunks.length,
            totalResults: response.metadata.total_results,
            searchType: response.metadata.search_type,
          },
          '[RAG Tool] Search completed successfully'
        );

        return {
          chunks: formattedChunks,
          metadata: {
            total_results: response.metadata.total_results,
            search_type: response.metadata.search_type,
          },
        };
      } catch (error) {
        // Return error message to LLM (graceful degradation)
        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            courseId,
            query: query.substring(0, 100),
          },
          '[RAG Tool] Search failed'
        );

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

export { RAG_DEFAULTS };
