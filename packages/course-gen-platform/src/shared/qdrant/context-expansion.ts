/**
 * Rebuilds the passage around a retrieved chunk (spec 027).
 *
 * `docs/RAG-CHUNKING-STRATEGY.md` has always specified the shape: search the
 * small grain for precision, hand the model the large one for context. Only the
 * search half was ever built, so callers received a ~290 token fragment where
 * the design promised ~900 tokens of surrounding text.
 *
 * The large grain is not stored anywhere and does not need to be. A parent is
 * exactly the concatenation of its children — measured 2026-08-13 over six
 * production conversions, 57 of 57 parents were fully reconstructible from
 * their own children, word coverage 1.0000. So the passage is rebuilt from
 * siblings that are already in the index: no parent points, no parent store, no
 * schema migration, and no extra embedding cost.
 *
 * Expansion is an enhancement, never a dependency. Every failure path returns
 * the caller what it already retrieved.
 *
 * @module shared/qdrant/context-expansion
 */

import { qdrantClient } from './client';
import { COLLECTION_CONFIG } from './create-collection';
import { extractPayload } from './search-helpers';
import { generatePointId } from './upload-helpers';
import { logger } from '../logger/index';
import type { SearchResult } from './search-types';

/** How far back to look for a repeated boundary between two adjacent chunks. */
const MAX_OVERLAP_CHARS = 400;

export interface ExpansionOptions {
  /** Collection to read siblings from. */
  collectionName?: string;
  /**
   * Ceiling on what expansion is allowed to *add*.
   *
   * When a passage would carry the running total past it, the matched chunk is
   * returned as retrieved. Expansion never drops a result to stay under the
   * number: the caller retrieved those chunks and truncating them belongs to
   * the formatter, which counts its own markup and is the last thing before the
   * prompt. Doing it in two places with two different accountings would be
   * worse than doing it once. So the returned set can still exceed this value —
   * it just will not exceed it *because of expansion*.
   */
  maxTokens?: number;
}

/**
 * Removes the part of `next` that `accumulated` already ends with.
 *
 * Legacy chunking overlaps adjacent children by `child_chunk_overlap`, so a
 * plain join would repeat that text in the prompt. Native chunks do not
 * overlap, in which case this finds nothing and the join is plain.
 */
export function stitch(pieces: readonly string[]): string {
  let out = '';
  for (const piece of pieces) {
    const next = piece.trim();
    if (next.length === 0) continue;
    if (out.length === 0) {
      out = next;
      continue;
    }
    const window = Math.min(out.length, next.length, MAX_OVERLAP_CHARS);
    let overlap = 0;
    for (let length = window; length > 0; length--) {
      if (out.endsWith(next.slice(0, length))) {
        overlap = length;
        break;
      }
    }
    out += `\n\n${next.slice(overlap).trimStart()}`;
  }
  return out;
}

/** Identity of the passage a result belongs to. */
function passageKey(result: SearchResult): string {
  return `${result.document_id}::${result.parent_chunk_id ?? result.chunk_id}`;
}

interface SiblingChunk {
  chunk_id: string;
  chunk_index: number;
  content: string;
  token_count: number;
}

/**
 * Fetches the siblings of a passage by deterministic point id.
 *
 * Point ids are a pure function of document and chunk id, so this is a direct
 * lookup rather than a filtered scan over the collection.
 */
async function fetchSiblings(
  documentId: string,
  chunkIds: readonly string[],
  collectionName: string
): Promise<SiblingChunk[]> {
  const ids = chunkIds.map(chunkId => generatePointId(documentId, chunkId));
  const records = await qdrantClient.retrieve(collectionName, {
    ids,
    with_payload: true,
    with_vector: false,
  });

  return records.map(record => {
    const payload = extractPayload(record);
    return {
      chunk_id: payload.chunk_id,
      // An unordered sibling sorts last rather than silently jumping to the
      // front and rewriting the passage.
      chunk_index: payload.chunk_index ?? Number.MAX_SAFE_INTEGER,
      content: payload.content,
      token_count: payload.token_count,
    };
  });
}

/**
 * Expands search results into their surrounding passages.
 *
 * Results that belong to the same passage collapse into one, so a passage never
 * occupies two of the caller's slots.
 *
 * @param results - Search results, best first
 * @param options - Collection and token budget
 * @returns One result per passage, expanded where the budget allowed
 */
export async function expandToSiblingContext(
  results: SearchResult[],
  options: ExpansionOptions = {}
): Promise<SearchResult[]> {
  if (results.length === 0) return results;

  const collectionName = options.collectionName ?? COLLECTION_CONFIG.name;
  const budget = options.maxTokens ?? Number.POSITIVE_INFINITY;

  // Best score wins the passage, and relevance order is preserved.
  const passages = new Map<string, SearchResult>();
  for (const result of results) {
    const key = passageKey(result);
    const existing = passages.get(key);
    if (!existing || result.score > existing.score) passages.set(key, result);
  }

  const expanded: SearchResult[] = [];
  let spent = 0;

  for (const result of passages.values()) {
    const siblingIds = result.sibling_chunk_ids ?? [];
    if (siblingIds.length === 0) {
      // Nothing to stitch: a lone chunk is already its own passage. This is the
      // case for every point indexed before spec 027.
      spent += result.token_count;
      expanded.push(result);
      continue;
    }

    const wanted = [...new Set([result.chunk_id, ...siblingIds])];
    let siblings: SiblingChunk[];
    try {
      siblings = await fetchSiblings(result.document_id, wanted, collectionName);
    } catch (error) {
      logger.warn(
        {
          documentId: result.document_id,
          chunkId: result.chunk_id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Sibling fetch failed; returning the retrieved chunk unexpanded'
      );
      spent += result.token_count;
      expanded.push(result);
      continue;
    }

    const ordered = siblings.sort((left, right) => left.chunk_index - right.chunk_index);
    const passageTokens = ordered.reduce((total, sibling) => total + sibling.token_count, 0);

    // Budget is a ceiling: when the passage does not fit, the caller still gets
    // the chunk that actually matched.
    if (spent + passageTokens > budget) {
      spent += result.token_count;
      expanded.push(result);
      continue;
    }

    const content = stitch(ordered.map(sibling => sibling.content));
    spent += passageTokens;
    expanded.push({ ...result, content, token_count: passageTokens });
  }

  logger.debug(
    {
      retrieved: results.length,
      passages: expanded.length,
      tokens: spent,
      budget: Number.isFinite(budget) ? budget : null,
    },
    'Expanded search results to surrounding passages'
  );

  return expanded;
}
