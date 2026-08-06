/**
 * Chunking strategy selection and native chunking execution.
 *
 * The selected strategy is configuration, never a hardcoded switch: setting
 * `DOCLING_CHUNK_STRATEGY=legacy_markdown` restores the exact production
 * behaviour, payload shape included. That is the rollback contract for the
 * structure-aware pipeline, and it needs no data migration because the new
 * payload fields are additive and optional.
 *
 * @module shared/embeddings/chunking-strategy
 */

import fs from 'node:fs/promises';

import { buildDoclingProvenanceIndex } from '../../stages/stage2-document-processing/docling/provenance.js';
import {
  createDoclingServeChunker,
  toNativeChunkerKind,
  type DoclingChunkingStrategy,
  type DoclingServeChunker,
} from '../../stages/stage2-document-processing/docling/serve-chunker.js';
import { logger } from '../logger/index.js';
import { chunkMarkdown, DEFAULT_CHUNKING_CONFIG, type ChunkingConfig } from './markdown-chunker.js';
import { adaptNativeChunks, type NativeChunkingAdaptation } from './native-chunk-adapter.js';

const STRATEGIES: readonly DoclingChunkingStrategy[] = [
  'legacy_markdown',
  'docling_hierarchical',
  'docling_hybrid',
];

/** Strategy that stays in force until the A/B evidence says otherwise. */
export const DEFAULT_CHUNKING_STRATEGY: DoclingChunkingStrategy = 'legacy_markdown';

/**
 * Resolves the configured strategy, falling back to the current production
 * default on an unknown value rather than failing a document over a typo.
 */
export function resolveChunkingStrategy(
  value: string | undefined = process.env.DOCLING_CHUNK_STRATEGY
): DoclingChunkingStrategy {
  const candidate = (value ?? '').trim() as DoclingChunkingStrategy;
  if (STRATEGIES.includes(candidate)) return candidate;
  if (value && value.trim().length > 0) {
    logger.warn(
      { requested: value, using: DEFAULT_CHUNKING_STRATEGY },
      'Unknown DOCLING_CHUNK_STRATEGY; keeping the current default'
    );
  }
  return DEFAULT_CHUNKING_STRATEGY;
}

/**
 * Exact models behind each advanced enrichment capability.
 *
 * Named here rather than left implicit because they are part of the artifact's
 * identity: swapping a model changes what the document says, and an identity
 * that ignored the swap would serve the old answer forever. Read off the
 * pinned advanced image, not from documentation.
 */
export const ENRICHMENT_MODELS: Readonly<Record<string, string>> = {
  code: 'docling-project/CodeFormulaV2',
  formula: 'docling-project/CodeFormulaV2',
  picture_classification: 'docling-project/DocumentFigureClassifier-v2.5',
  chart: 'ibm-granite/granite-vision-4.1-4b',
  picture_description: 'HuggingFaceTB/SmolVLM-256M-Instruct',
};

/** Enrichment that actually ran and was merged into the accepted document. */
export interface AppliedEnrichment {
  capabilities: readonly string[];
}

/**
 * Conversion profile identity that participates in chunk ids and cache keys.
 *
 * PDF heading inference changes the produced structure, so it cannot share an
 * identity with a conversion that ran without it. Advanced enrichment is the
 * same problem one level up: an enriched document carries a code language, a
 * formula and chart series the baseline one does not, so reusing a baseline
 * chunk id for it would let a cached baseline artifact answer a request for the
 * enriched one — the exact failure the MCP cache key had in Stage A, where it
 * hashed only the source and returned the previous profile's document.
 *
 * The model names, not just the capability names, are part of the identity.
 */
export function resolveConversionProfile(
  env: NodeJS.ProcessEnv = process.env,
  enrichment?: AppliedEnrichment
): string {
  const headingInference = env.DOCLING_MCP_PDF_HEADING_HIERARCHY === 'true';
  const base = headingInference ? 'baseline+pdf-heading-hierarchy' : 'baseline';

  const capabilities = [...(enrichment?.capabilities ?? [])].sort();
  if (capabilities.length === 0) return base;

  const models = [...new Set(capabilities.map(name => ENRICHMENT_MODELS[name] ?? name))].sort();
  return `${base}+enrich[${capabilities.join(',')}]@${models.join(',')}`;
}

export interface NativeChunkingInput {
  /** Docling MCP document key; the source digest for chunk identity. */
  documentKey: string;
  /** Path of the accepted raw DoclingDocument JSON. */
  rawJsonPath: string;
}

export interface StrategyChunkingResult extends NativeChunkingAdaptation {
  strategy: DoclingChunkingStrategy;
}

/**
 * Runs native Docling chunking for an already accepted conversion.
 *
 * @throws when the strategy is not a native one, or the chunks and the accepted
 *   document disagree.
 */
export async function chunkWithNativeStrategy(
  strategy: DoclingChunkingStrategy,
  input: NativeChunkingInput,
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG,
  chunker: DoclingServeChunker = createDoclingServeChunker()
): Promise<StrategyChunkingResult> {
  const kind = toNativeChunkerKind(strategy);
  if (!kind) {
    throw new Error(`chunkWithNativeStrategy called with non-native strategy: ${strategy}`);
  }

  const rawBytes = await fs.readFile(input.rawJsonPath);
  const rawDocument: unknown = JSON.parse(rawBytes.toString('utf8'));
  const provenanceIndex = buildDoclingProvenanceIndex(rawDocument);

  const native = await chunker.chunkDoclingJson(rawBytes, `${input.documentKey}.json`, kind, {
    // Hybrid sizes chunks in its own tokenizer; ask for the same budget the
    // child contract uses so the adapter rarely has to re-split.
    ...(kind === 'hybrid' ? { maxTokens: config.child_chunk_size, mergePeers: true } : {}),
    useMarkdownTables: true,
    includeRawText: true,
  });

  const adaptation = await adaptNativeChunks(native.chunks, provenanceIndex, {
    identity: {
      sourceDigest: input.documentKey,
      conversionProfile: resolveConversionProfile(),
      chunkingProfile: native.profile,
    },
    strategy: strategy === 'docling_hybrid' ? 'docling_hybrid' : 'docling_hierarchical',
    config,
  });

  return { ...adaptation, strategy };
}

/**
 * Chunks a document with the configured strategy.
 *
 * Native strategies need the accepted Docling JSON. When it is missing — the
 * plain-text and fallback extraction paths never produce one — the legacy
 * Markdown chunker runs and the reason is recorded, because silently producing
 * unstructured chunks under a structure-aware label would be worse.
 */
export async function chunkWithStrategy(
  markdown: string,
  options: {
    strategy?: DoclingChunkingStrategy;
    source?: NativeChunkingInput;
    config?: ChunkingConfig;
    chunker?: DoclingServeChunker;
  } = {}
): Promise<StrategyChunkingResult> {
  const config = options.config ?? DEFAULT_CHUNKING_CONFIG;
  const requested = options.strategy ?? resolveChunkingStrategy();

  if (requested !== 'legacy_markdown' && !options.source) {
    logger.warn(
      { requested },
      'Native Docling chunking requires an accepted Docling conversion; using legacy_markdown'
    );
  }

  if (requested === 'legacy_markdown' || !options.source) {
    const legacy = await chunkMarkdown(markdown, config);
    return {
      ...legacy,
      strategy: 'legacy_markdown',
      chunkingProfileId: `legacy_markdown;parent=${config.parent_chunk_size};child=${config.child_chunk_size};overlap=${config.child_chunk_overlap}`,
      coverage: {
        childChunksWithRefs: 0,
        childChunksWithLocation: 0,
        totalChildChunks: legacy.child_chunks.length,
        refCoverage: 0,
        locationCoverage: 0,
        locationEligible: false,
        unresolvedRefs: [],
      },
    };
  }

  return chunkWithNativeStrategy(requested, options.source, config, options.chunker);
}
