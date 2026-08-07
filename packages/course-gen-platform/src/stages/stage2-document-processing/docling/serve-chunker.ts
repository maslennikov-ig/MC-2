/**
 * Typed internal transport for Docling Serve native chunking.
 *
 * `/mcp` stays the conversion boundary. This adapter is the only place that
 * talks to Docling Serve directly, it is internal-network only, and it never
 * re-converts a source: it posts the EXACT DoclingDocument JSON that the
 * accepted MCP bundle produced, with `from_formats: ['json_docling']`. Chunks
 * therefore reference the same document by construction instead of by a second
 * conversion that could disagree with the accepted artifact.
 *
 * Contract resolved from the running Serve 1.29.0 OpenAPI document
 * (`/openapi.json`, 2026-08-05): `POST /v1/chunk/{hierarchical|hybrid}/source`
 * with `sources[].kind=file`, `convert_options`, `chunking_options`, answering
 * `ChunkDocumentResponse { chunks: ChunkedDocumentResultItem[], documents,
 * processing_time }`.
 *
 * @module stages/stage2-document-processing/docling/serve-chunker
 */

import { logger } from '../../../shared/logger/index.js';
import { DoclingError, DoclingErrorCode } from './types.js';

/** Chunking strategies the pipeline can be configured to use. */
export type DoclingChunkingStrategy = 'legacy_markdown' | 'docling_hierarchical' | 'docling_hybrid';

/** Native chunkers Docling Serve exposes. */
export type NativeChunkerKind = 'hierarchical' | 'hybrid';

/**
 * The tokenizer Docling Serve uses to size hybrid chunks.
 *
 * Baked into the Serve image (`models--sentence-transformers--all-MiniLM-L6-v2`),
 * so hybrid chunking needs no runtime model download. Naming it here keeps it
 * part of the chunking profile identity instead of an implicit server default.
 */
export const DOCLING_HYBRID_TOKENIZER = 'sentence-transformers/all-MiniLM-L6-v2';

/** One native chunk exactly as Docling Serve reports it. */
export interface NativeDoclingChunk {
  chunkIndex: number;
  /** Contextualized text: headings and captions prepended by the serializer. */
  text: string;
  /** Text without the contextual prefix, when the caller asked for it. */
  rawText: string | null;
  /** Token count in the chunker's own tokenizer, when it is token aware. */
  numTokens: number | null;
  headings: string[];
  captions: string[];
  /** Docling self_refs this chunk was built from. */
  docItems: string[];
  pageNumbers: number[];
}

export interface NativeChunkingResult {
  chunks: NativeDoclingChunk[];
  processingTimeMs: number;
  /** Behaviour-affecting identity of this chunking run. */
  profile: NativeChunkingProfile;
}

/** Every input that changes native chunk boundaries. */
export interface NativeChunkingProfile {
  chunker: NativeChunkerKind;
  tokenizer: string | null;
  maxTokens: number | null;
  mergePeers: boolean | null;
  useMarkdownTables: boolean;
  serveVersion: string | null;
}

export interface NativeChunkingOptions {
  /** Hybrid only: token budget per chunk in the Serve tokenizer. */
  maxTokens?: number;
  /** Hybrid only: merge undersized successive chunks that share headings. */
  mergePeers?: boolean;
  /** Serialize tables as Markdown instead of triplets. */
  useMarkdownTables?: boolean;
  /** Ask Serve for the uncontextualized text as well. */
  includeRawText?: boolean;
}

export interface DoclingServeChunkerConfig {
  /** Internal Serve base URL, e.g. `http://docling-serve:5001`. */
  baseUrl: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 600_000;

interface ServeChunkItem {
  filename?: unknown;
  chunk_index?: unknown;
  text?: unknown;
  raw_text?: unknown;
  num_tokens?: unknown;
  headings?: unknown;
  captions?: unknown;
  doc_items?: unknown;
  page_numbers?: unknown;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function asNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
    : [];
}

/**
 * Maps the native strategy names used in configuration onto Serve chunkers.
 */
export function toNativeChunkerKind(strategy: DoclingChunkingStrategy): NativeChunkerKind | null {
  if (strategy === 'docling_hierarchical') return 'hierarchical';
  if (strategy === 'docling_hybrid') return 'hybrid';
  return null;
}

export class DoclingServeChunker {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: DoclingServeChunkerConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/u, '');
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Chunks an already converted DoclingDocument JSON.
   *
   * @param doclingJson - The raw JSON bytes of the accepted conversion.
   * @param filename - Name reported to Serve; must end in `.json`.
   */
  async chunkDoclingJson(
    doclingJson: Buffer | string,
    filename: string,
    kind: NativeChunkerKind,
    options: NativeChunkingOptions = {}
  ): Promise<NativeChunkingResult> {
    const payload = Buffer.isBuffer(doclingJson) ? doclingJson : Buffer.from(doclingJson, 'utf8');
    const chunkingOptions: Record<string, unknown> = {
      chunker: kind,
      use_markdown_tables: options.useMarkdownTables ?? true,
      include_raw_text: options.includeRawText ?? true,
    };
    if (kind === 'hybrid') {
      chunkingOptions.tokenizer = DOCLING_HYBRID_TOKENIZER;
      if (options.maxTokens !== undefined) chunkingOptions.max_tokens = options.maxTokens;
      chunkingOptions.merge_peers = options.mergePeers ?? true;
    }

    const body = {
      sources: [
        {
          kind: 'file',
          filename: filename.endsWith('.json') ? filename : `${filename}.json`,
          base64_string: payload.toString('base64'),
        },
      ],
      include_converted_doc: false,
      convert_options: { from_formats: ['json_docling'], to_formats: ['json'] },
      chunking_options: chunkingOptions,
    };

    const startedAt = Date.now();
    const response = await this.post(`/v1/chunk/${kind}/source`, body);
    const rawChunks = Array.isArray((response as { chunks?: unknown }).chunks)
      ? ((response as { chunks: unknown[] }).chunks as ServeChunkItem[])
      : null;

    if (!rawChunks) {
      throw new DoclingError(
        DoclingErrorCode.PROCESSING_ERROR,
        `Docling Serve ${kind} chunking returned no chunks array`
      );
    }

    const chunks: NativeDoclingChunk[] = rawChunks.map((item, index) => ({
      chunkIndex: typeof item.chunk_index === 'number' ? item.chunk_index : index,
      text: typeof item.text === 'string' ? item.text : '',
      rawText: typeof item.raw_text === 'string' ? item.raw_text : null,
      numTokens: typeof item.num_tokens === 'number' ? item.num_tokens : null,
      headings: asStringArray(item.headings),
      captions: asStringArray(item.captions),
      docItems: asStringArray(item.doc_items),
      pageNumbers: asNumberArray(item.page_numbers),
    }));

    const profile: NativeChunkingProfile = {
      chunker: kind,
      tokenizer: kind === 'hybrid' ? DOCLING_HYBRID_TOKENIZER : null,
      maxTokens: kind === 'hybrid' ? (options.maxTokens ?? null) : null,
      mergePeers: kind === 'hybrid' ? (options.mergePeers ?? true) : null,
      useMarkdownTables: options.useMarkdownTables ?? true,
      serveVersion: await this.serveVersion(),
    };

    logger.debug(
      { chunker: kind, chunks: chunks.length, durationMs: Date.now() - startedAt },
      'Docling Serve native chunking completed'
    );

    return { chunks, processingTimeMs: Date.now() - startedAt, profile };
  }

  private cachedVersion: string | null | undefined;

  /** Serve version, cached; part of the chunking profile identity. */
  async serveVersion(): Promise<string | null> {
    if (this.cachedVersion !== undefined) return this.cachedVersion;
    try {
      const response = await this.request('GET', '/version');
      const version = (response as { version?: unknown }).version;
      this.cachedVersion = typeof version === 'string' ? version : null;
    } catch {
      this.cachedVersion = null;
    }
    return this.cachedVersion;
  }

  private async post(pathname: string, body: unknown): Promise<unknown> {
    return this.request('POST', pathname, body);
  }

  private async request(method: string, pathname: string, body?: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${pathname}`, {
        method,
        signal: controller.signal,
        ...(body === undefined
          ? {}
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 1000);
        throw new DoclingError(
          DoclingErrorCode.PROCESSING_ERROR,
          `Docling Serve ${method} ${pathname} failed with ${response.status}: ${detail}`
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof DoclingError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new DoclingError(
          DoclingErrorCode.TIMEOUT,
          `Docling Serve ${method} ${pathname} timed out after ${this.timeoutMs}ms`,
          error
        );
      }
      throw new DoclingError(
        DoclingErrorCode.NETWORK_ERROR,
        `Docling Serve ${method} ${pathname} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createDoclingServeChunker(): DoclingServeChunker {
  return new DoclingServeChunker({
    baseUrl: process.env.DOCLING_SERVE_URL || 'http://docling-serve:5001',
    timeoutMs: Number.parseInt(process.env.DOCLING_SERVE_TIMEOUT || '600000', 10),
  });
}
