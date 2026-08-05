/**
 * Adapts native Docling chunks onto the existing parent/child chunk contract.
 *
 * The downstream consumers — embeddings, Qdrant payload, parent expansion,
 * sibling navigation, priority boosting and late chunking — are unchanged. What
 * changes is where the boundaries come from: Docling's own document structure
 * instead of a Markdown text splitter that had already lost the headings.
 *
 * Two properties this module is responsible for:
 *
 * 1. **Deterministic identity.** A chunk id is a function of source digest,
 *    conversion profile, chunking profile and the normalized source refs, so
 *    the same document processed with the same configuration produces the same
 *    ids without depending on text hashing luck.
 * 2. **Fail-closed provenance.** A native chunk whose refs do not resolve
 *    against the document it claims to come from is a consistency failure. It
 *    is reported and must stop the upload rather than degrade into an unrelated
 *    chunk with missing metadata.
 *
 * @module shared/embeddings/native-chunk-adapter
 */

import { createHash } from 'node:crypto';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

import {
  aggregateProvenance,
  type DoclingProvenanceIndex,
} from '../../stages/stage2-document-processing/docling/provenance.js';
import type {
  NativeChunkingProfile,
  NativeDoclingChunk,
} from '../../stages/stage2-document-processing/docling/serve-chunker.js';
import {
  createTokenCounter,
  DEFAULT_CHUNKING_CONFIG,
  type ChunkLevel,
  type ChunkStrategyName,
  type ChunkingConfig,
  type ChunkingResult,
  type TextChunk,
} from './markdown-chunker.js';

/** Identity of everything that can change the produced chunks. */
export interface ChunkIdentity {
  /** Docling document key for the source; stable per source content. */
  sourceDigest: string;
  /** Conversion profile identity, e.g. `baseline+heading-inference`. */
  conversionProfile: string;
  /** Native chunking profile as reported by the Serve adapter. */
  chunkingProfile: NativeChunkingProfile;
}

export interface NativeAdaptationOptions {
  identity: ChunkIdentity;
  strategy: Extract<ChunkStrategyName, 'docling_hierarchical' | 'docling_hybrid'>;
  config?: ChunkingConfig;
}

/** Provenance coverage measured over the produced child chunks. */
export interface ProvenanceCoverage {
  /** Child chunks carrying at least one resolved Docling ref. */
  childChunksWithRefs: number;
  /** Child chunks carrying at least one page number or bounding box. */
  childChunksWithLocation: number;
  totalChildChunks: number;
  refCoverage: number;
  locationCoverage: number;
  /**
   * True when the source document carries any positional provenance at all.
   * DOCX and other page-less formats legitimately have none, so location
   * coverage is only an acceptance signal for documents where it is eligible.
   */
  locationEligible: boolean;
  /** Refs that did not resolve against the document. Must be empty. */
  unresolvedRefs: string[];
}

export interface NativeChunkingAdaptation extends ChunkingResult {
  coverage: ProvenanceCoverage;
  chunkingProfileId: string;
}

/** Error raised when native chunks disagree with the document they came from. */
export class DoclingChunkConsistencyError extends Error {
  constructor(
    readonly unresolvedRefs: string[],
    readonly sourceDigest: string
  ) {
    super(
      `Native Docling chunks reference ${unresolvedRefs.length} element(s) that do not exist in ` +
        `the accepted document ${sourceDigest}: ${unresolvedRefs.slice(0, 10).join(', ')}. ` +
        'Refusing to upload chunks whose provenance cannot be resolved.'
    );
    this.name = 'DoclingChunkConsistencyError';
  }
}

/**
 * Stable string identity for a native chunking profile.
 */
export function chunkingProfileId(
  strategy: ChunkStrategyName,
  profile: NativeChunkingProfile,
  config: ChunkingConfig
): string {
  return [
    strategy,
    profile.chunker,
    `serve=${profile.serveVersion ?? 'unknown'}`,
    `tok=${profile.tokenizer ?? 'none'}`,
    `max=${profile.maxTokens ?? 'auto'}`,
    `merge=${profile.mergePeers ?? 'n/a'}`,
    `mdtables=${profile.useMarkdownTables}`,
    `parent=${config.parent_chunk_size}`,
    `child=${config.child_chunk_size}`,
    `overlap=${config.child_chunk_overlap}`,
  ].join(';');
}

function deterministicChunkId(
  identity: ChunkIdentity,
  chunkingProfile: string,
  level: ChunkLevel,
  index: number,
  selfRefs: readonly string[],
  subIndex: number
): string {
  const digest = createHash('sha256')
    .update(
      [
        identity.sourceDigest,
        identity.conversionProfile,
        chunkingProfile,
        level,
        selfRefs.join(','),
        String(subIndex),
      ].join('|'),
      'utf8'
    )
    .digest('hex')
    .slice(0, 16);
  return `${level}_${index}_${digest}`;
}

function headingPathOf(chunk: NativeDoclingChunk): string {
  const headings = chunk.headings.filter(heading => heading.trim().length > 0);
  return headings.length > 0 ? headings.join(' > ') : 'Root';
}

/** One child-sized piece of a native chunk. */
interface ChildUnit {
  member: NativeDoclingChunk;
  /** Contextualized text, used as the embedded child content. */
  text: string;
  /** Plain text without the contextual prefix, used to build parent content. */
  parentText: string;
  subIndex: number;
  tokenCount: number;
}

interface ParentGroup {
  units: ChildUnit[];
  headingPath: string;
  headings: string[];
  tokenCount: number;
}

/**
 * Groups child units into parent-sized groups.
 *
 * A group breaks on a heading-path change or when the parent token budget would
 * be exceeded, so a parent never mixes two sections and never grows past the
 * configured context window. Grouping units rather than whole native chunks is
 * what keeps a single very long section from producing one oversized parent that
 * the embedding batcher would later reject.
 */
function groupIntoParents(units: ChildUnit[], config: ChunkingConfig): ParentGroup[] {
  const groups: ParentGroup[] = [];
  let current: ParentGroup | null = null;

  for (const unit of units) {
    const headingPath = headingPathOf(unit.member);
    const mustBreak =
      current === null ||
      current.headingPath !== headingPath ||
      current.tokenCount + unit.tokenCount > config.parent_chunk_size;

    if (mustBreak) {
      current = {
        units: [],
        headingPath,
        headings: unit.member.headings.filter(heading => heading.trim().length > 0),
        tokenCount: 0,
      };
      groups.push(current);
    }

    current!.units.push(unit);
    current!.tokenCount += unit.tokenCount;
  }

  return groups;
}

/**
 * Builds parent/child chunks from native Docling chunks.
 *
 * @throws {DoclingChunkConsistencyError} when any native ref cannot be resolved.
 */
export async function adaptNativeChunks(
  nativeChunks: NativeDoclingChunk[],
  provenanceIndex: DoclingProvenanceIndex,
  options: NativeAdaptationOptions
): Promise<NativeChunkingAdaptation> {
  const config = options.config ?? DEFAULT_CHUNKING_CONFIG;
  const counter = createTokenCounter(config.tiktoken_model);
  try {
    return await buildAdaptation(nativeChunks, provenanceIndex, options, config, counter.count);
  } finally {
    counter.free();
  }
}

async function buildAdaptation(
  nativeChunks: NativeDoclingChunk[],
  provenanceIndex: DoclingProvenanceIndex,
  options: NativeAdaptationOptions,
  config: ChunkingConfig,
  tokensOf: (text: string) => number
): Promise<NativeChunkingAdaptation> {
  const profileId = chunkingProfileId(options.strategy, options.identity.chunkingProfile, config);

  const usable = nativeChunks.filter(chunk => (chunk.text ?? '').trim().length > 0);
  if (usable.length === 0) {
    throw new Error('Native Docling chunking produced no non-empty chunks');
  }

  // Fail closed before anything is built: refs that do not resolve mean the
  // chunks and the accepted document are not the same document.
  const unresolvedRefs = [
    ...new Set(
      usable.flatMap(chunk => aggregateProvenance(chunk.docItems, provenanceIndex).unresolvedRefs)
    ),
  ];
  if (unresolvedRefs.length > 0) {
    throw new DoclingChunkConsistencyError(unresolvedRefs, options.identity.sourceDigest);
  }

  // Token-aware, not character-aware. The legacy chunker approximated one token
  // as four characters, which overshoots by roughly 2x on Cyrillic text and
  // produced 800-token "400 token" children on Russian documents.
  const childSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: config.child_chunk_size,
    chunkOverlap: config.child_chunk_overlap,
    separators: ['\n\n', '\n', '. ', ' '],
    keepSeparator: true,
    lengthFunction: tokensOf,
  });

  // Split first, group second: a native chunk longer than the parent budget
  // becomes several child units and therefore several parents.
  const units: ChildUnit[] = [];
  for (const member of usable) {
    const memberTokens = tokensOf(member.text);
    if (memberTokens <= config.child_chunk_size) {
      units.push({
        member,
        text: member.text,
        parentText: member.rawText ?? member.text,
        subIndex: 0,
        tokenCount: memberTokens,
      });
      continue;
    }

    const pieces = await childSplitter.splitText(member.text);
    pieces.forEach((piece, subIndex) => {
      const text = piece.trim();
      if (text.length === 0) return;
      units.push({ member, text, parentText: text, subIndex, tokenCount: tokensOf(text) });
    });
  }

  const parent_chunks: TextChunk[] = [];
  const child_chunks: TextChunk[] = [];
  let totalTokens = 0;

  const groups = groupIntoParents(units, config);

  for (const [parentIndex, group] of groups.entries()) {
    const parentRefs = [...new Set(group.units.flatMap(unit => unit.member.docItems))];
    const parentProvenance = aggregateProvenance(parentRefs, provenanceIndex);
    const parentContent = group.units
      .map(unit => unit.parentText)
      .join('\n\n')
      .trim();
    const parentTokens = tokensOf(parentContent);
    const parentChunkId = deterministicChunkId(
      options.identity,
      profileId,
      'parent',
      parentIndex,
      parentRefs,
      0
    );

    parent_chunks.push({
      chunk_id: parentChunkId,
      parent_chunk_id: null,
      sibling_chunk_ids: [],
      level: 'parent',
      content: parentContent,
      token_count: parentTokens,
      char_count: parentContent.length,
      chunk_index: parentIndex,
      total_chunks: 0,
      heading_path: group.headingPath,
      chapter: group.headings[0] ?? null,
      section: group.headings[1] ?? null,
      chunk_strategy: options.strategy,
      overlap_tokens: 0,
      provenance: {
        self_refs: parentProvenance.selfRefs,
        page_numbers: parentProvenance.pageNumbers,
        bboxes: parentProvenance.bboxes,
        labels: parentProvenance.labels,
        native_token_count: [...new Set(group.units.map(unit => unit.member))].reduce(
          (total, member) => total + (member.numTokens ?? 0),
          0
        ),
      },
    });
    totalTokens += parentTokens;

    const childIds: string[] = [];

    for (const [childIndexInParent, unit] of group.units.entries()) {
      const memberProvenance = aggregateProvenance(unit.member.docItems, provenanceIndex);
      const childChunkId = deterministicChunkId(
        options.identity,
        profileId,
        'child',
        child_chunks.length,
        unit.member.docItems,
        unit.subIndex
      );
      childIds.push(childChunkId);

      child_chunks.push({
        chunk_id: childChunkId,
        parent_chunk_id: parentChunkId,
        sibling_chunk_ids: [],
        level: 'child',
        content: unit.text,
        token_count: unit.tokenCount,
        char_count: unit.text.length,
        chunk_index: childIndexInParent,
        total_chunks: 0,
        heading_path: headingPathOf(unit.member),
        chapter: unit.member.headings[0] ?? null,
        section: unit.member.headings[1] ?? null,
        chunk_strategy: options.strategy,
        overlap_tokens: unit.subIndex > 0 ? config.child_chunk_overlap : 0,
        provenance: {
          self_refs: memberProvenance.selfRefs,
          page_numbers: memberProvenance.pageNumbers,
          bboxes: memberProvenance.bboxes,
          labels: memberProvenance.labels,
          native_token_count: unit.member.numTokens,
        },
      });
    }

    for (const child of child_chunks) {
      if (child.parent_chunk_id !== parentChunkId) continue;
      child.sibling_chunk_ids = childIds.filter(id => id !== child.chunk_id);
      child.total_chunks = childIds.length;
    }
  }

  for (const parent of parent_chunks) {
    parent.total_chunks = parent_chunks.length;
  }

  const locationEligible = [...provenanceIndex.refs.values()].some(
    entry => entry.pageNumbers.length > 0 || entry.bboxes.length > 0
  );
  const childChunksWithRefs = child_chunks.filter(
    chunk => (chunk.provenance?.self_refs.length ?? 0) > 0
  ).length;
  const childChunksWithLocation = child_chunks.filter(
    chunk =>
      (chunk.provenance?.page_numbers.length ?? 0) > 0 || (chunk.provenance?.bboxes.length ?? 0) > 0
  ).length;

  const avgParentTokens =
    parent_chunks.length > 0
      ? parent_chunks.reduce((sum, chunk) => sum + chunk.token_count, 0) / parent_chunks.length
      : 0;
  const avgChildTokens =
    child_chunks.length > 0
      ? child_chunks.reduce((sum, chunk) => sum + chunk.token_count, 0) / child_chunks.length
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
    chunkingProfileId: profileId,
    coverage: {
      childChunksWithRefs,
      childChunksWithLocation,
      totalChildChunks: child_chunks.length,
      refCoverage: child_chunks.length > 0 ? childChunksWithRefs / child_chunks.length : 0,
      locationCoverage: child_chunks.length > 0 ? childChunksWithLocation / child_chunks.length : 0,
      locationEligible,
      unresolvedRefs: [],
    },
  };
}
