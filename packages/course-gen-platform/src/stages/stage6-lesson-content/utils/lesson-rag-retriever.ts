/**
 * Lesson-level RAG Retrieval Service
 * Retrieves 5-10 focused chunks per lesson for Stage 6 content generation
 *
 * @module stages/stage6-lesson-content/utils/lesson-rag-retriever
 * @deprecated Use modules in ../rag/ instead. This file is kept for backward compatibility.
 */

// Re-export constants
export { LESSON_RAG_CONFIG, RERANKER_CONFIG, TECHNICAL_SHORT_TERMS } from '../rag/constants';

// Re-export types
export type {
  LessonRAGChunk, // Was internal but exported now
  SourceDocument,
  LessonRAGResult,
  LessonRAGParams,
  SectionContextPreRetrievalResult,
} from '../rag/types';

// Re-export retrieval functions
export { retrieveLessonContext, retrieveMultipleLessons } from '../rag/retriever';

// Re-export caching functions
export { preRetrieveSectionContexts, getCachedSectionContext } from '../rag/caching';

// Re-export formatters
export { formatLessonChunksForPrompt, escapeXml, estimateTokens } from '../rag/formatters';

// Re-export helpers
export {
  buildLessonQueries,
  generateCacheKey,
  createEmptyResult,
  extractSourceDocuments,
} from '../rag/helpers';

// Re-export coverage logic
export { calculateLessonCoverage, termMatchesInContent } from '../rag/coverage';

// Re-export reranking logic
export { rerankChunks } from '../rag/reranking';
