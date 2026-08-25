/**
 * What a retrieval run has gathered so far, shared by the query passes and by assembly.
 *
 * @module retrieval-collector
 *
 * Deduplication is GLOBAL across tiers: a chunk the Tier 1 gate already found must not be
 * counted twice when the full pass repeats a similar query. `queryFailureCount` is what decides
 * `fallbackUsed`, and — when RAG is REQUIRED — whether an empty result is an answer or an outage.
 */

import type { LessonRAGChunk } from './types';

export interface RetrievalCollector {
  allChunks: LessonRAGChunk[];
  seenChunkIds: Set<string>;
  queriesUsed: string[];
  queryFailureCount: number;
}
