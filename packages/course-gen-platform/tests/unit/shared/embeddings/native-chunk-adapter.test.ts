import { describe, expect, it } from 'vitest';

import {
  buildDoclingProvenanceIndex,
  aggregateProvenance,
} from '../../../../src/stages/stage2-document-processing/docling/provenance.js';
import type { NativeDoclingChunk } from '../../../../src/stages/stage2-document-processing/docling/serve-chunker.js';
import {
  adaptNativeChunks,
  DoclingChunkConsistencyError,
  type ChunkIdentity,
} from '../../../../src/shared/embeddings/native-chunk-adapter.js';
import { DEFAULT_CHUNKING_CONFIG } from '../../../../src/shared/embeddings/markdown-chunker.js';

const RAW_DOCUMENT = {
  schema_name: 'DoclingDocument',
  version: '1.7.0',
  name: 'fixture',
  pages: {
    '1': { page_no: 1, size: { width: 612, height: 792 } },
    '2': { page_no: 2, size: { width: 612, height: 792 } },
  },
  texts: [
    {
      self_ref: '#/texts/0',
      label: 'section_header',
      text: 'Глава 1',
      prov: [
        {
          page_no: 1,
          bbox: { l: 10, t: 700, r: 300, b: 680, coord_origin: 'BOTTOMLEFT' },
        },
      ],
    },
    {
      self_ref: '#/texts/1',
      label: 'text',
      text: 'Первый абзац главы.',
      prov: [{ page_no: 1, bbox: { l: 10, t: 660, r: 500, b: 600, coord_origin: 'BOTTOMLEFT' } }],
    },
    {
      self_ref: '#/texts/2',
      label: 'text',
      text: 'Второй абзац главы на следующей странице.',
      prov: [{ page_no: 2, bbox: { l: 10, t: 700, r: 500, b: 640, coord_origin: 'BOTTOMLEFT' } }],
    },
  ],
  tables: [
    {
      self_ref: '#/tables/0',
      label: 'table',
      prov: [{ page_no: 2, bbox: { l: 20, t: 500, r: 480, b: 300, coord_origin: 'BOTTOMLEFT' } }],
      data: { table_cells: [] },
    },
  ],
  pictures: [],
  groups: [{ self_ref: '#/groups/0', label: 'list' }],
};

const IDENTITY: ChunkIdentity = {
  sourceDigest: 'digest-abc',
  conversionProfile: 'baseline',
  chunkingProfile: {
    chunker: 'hierarchical',
    tokenizer: null,
    maxTokens: null,
    mergePeers: null,
    useMarkdownTables: true,
    serveVersion: '1.29.0',
  },
};

function nativeChunk(overrides: Partial<NativeDoclingChunk>): NativeDoclingChunk {
  return {
    chunkIndex: 0,
    text: 'текст',
    rawText: null,
    numTokens: null,
    headings: [],
    captions: [],
    docItems: [],
    pageNumbers: [],
    ...overrides,
  };
}

const CHUNKS: NativeDoclingChunk[] = [
  nativeChunk({
    chunkIndex: 0,
    text: 'Глава 1\nПервый абзац главы.',
    rawText: 'Первый абзац главы.',
    headings: ['Глава 1'],
    docItems: ['#/texts/1'],
    pageNumbers: [1],
    numTokens: 12,
  }),
  nativeChunk({
    chunkIndex: 1,
    text: 'Глава 1\nВторой абзац главы на следующей странице.',
    rawText: 'Второй абзац главы на следующей странице.',
    headings: ['Глава 1'],
    docItems: ['#/texts/2'],
    pageNumbers: [2],
    numTokens: 15,
  }),
  nativeChunk({
    chunkIndex: 2,
    text: 'Глава 1 > Таблица\nМетрика = Значение',
    rawText: 'Метрика = Значение',
    headings: ['Глава 1', 'Таблица'],
    docItems: ['#/tables/0'],
    pageNumbers: [2],
    numTokens: 9,
  }),
];

describe('buildDoclingProvenanceIndex', () => {
  it('indexes every referenceable collection including groups', () => {
    const index = buildDoclingProvenanceIndex(RAW_DOCUMENT);
    expect([...index.refs.keys()].sort()).toEqual([
      '#/groups/0',
      '#/tables/0',
      '#/texts/0',
      '#/texts/1',
      '#/texts/2',
    ]);
  });

  it('keeps the coordinate origin and page geometry with each bbox', () => {
    const index = buildDoclingProvenanceIndex(RAW_DOCUMENT);
    const [bbox] = index.refs.get('#/texts/1')!.bboxes;
    expect(bbox).toMatchObject({
      left: 10,
      top: 660,
      right: 500,
      bottom: 600,
      coordOrigin: 'BOTTOMLEFT',
      pageNumber: 1,
      pageWidth: 612,
      pageHeight: 792,
    });
  });

  it('reports refs that do not exist instead of dropping them', () => {
    const index = buildDoclingProvenanceIndex(RAW_DOCUMENT);
    const aggregated = aggregateProvenance(['#/texts/1', '#/texts/99'], index);
    expect(aggregated.unresolvedRefs).toEqual(['#/texts/99']);
    expect(aggregated.pageNumbers).toEqual([1]);
  });
});

describe('adaptNativeChunks', () => {
  it('preserves the parent/child, sibling and heading contract', async () => {
    const index = buildDoclingProvenanceIndex(RAW_DOCUMENT);
    const result = await adaptNativeChunks(CHUNKS, index, {
      identity: IDENTITY,
      strategy: 'docling_hierarchical',
    });

    expect(result.parent_chunks.length).toBeGreaterThan(0);
    expect(result.child_chunks.length).toBe(3);

    for (const child of result.child_chunks) {
      expect(child.level).toBe('child');
      expect(child.parent_chunk_id).not.toBeNull();
      expect(result.parent_chunks.some(parent => parent.chunk_id === child.parent_chunk_id)).toBe(
        true
      );
      expect(child.sibling_chunk_ids).not.toContain(child.chunk_id);
      expect(child.chunk_strategy).toBe('docling_hierarchical');
    }

    // The heading path the legacy Markdown splitter used to lose entirely.
    expect(result.child_chunks[0].heading_path).toBe('Глава 1');
    expect(result.child_chunks[2].heading_path).toBe('Глава 1 > Таблица');
    expect(result.child_chunks[2].section).toBe('Таблица');
  });

  it('starts a new parent when the heading path changes', async () => {
    const index = buildDoclingProvenanceIndex(RAW_DOCUMENT);
    const result = await adaptNativeChunks(CHUNKS, index, {
      identity: IDENTITY,
      strategy: 'docling_hierarchical',
    });
    expect(result.parent_chunks.map(parent => parent.heading_path)).toEqual([
      'Глава 1',
      'Глава 1 > Таблица',
    ]);
  });

  it('carries page numbers and bounding boxes into every child chunk', async () => {
    const index = buildDoclingProvenanceIndex(RAW_DOCUMENT);
    const result = await adaptNativeChunks(CHUNKS, index, {
      identity: IDENTITY,
      strategy: 'docling_hierarchical',
    });

    expect(result.coverage.refCoverage).toBe(1);
    expect(result.coverage.locationCoverage).toBe(1);
    expect(result.coverage.locationEligible).toBe(true);
    expect(result.child_chunks[1].provenance?.page_numbers).toEqual([2]);
    expect(result.child_chunks[1].provenance?.self_refs).toEqual(['#/texts/2']);
    expect(result.child_chunks[2].provenance?.labels).toEqual(['table']);
  });

  it('produces identical ids for identical identity and different ids otherwise', async () => {
    const index = buildDoclingProvenanceIndex(RAW_DOCUMENT);
    const first = await adaptNativeChunks(CHUNKS, index, {
      identity: IDENTITY,
      strategy: 'docling_hierarchical',
    });
    const second = await adaptNativeChunks(CHUNKS, index, {
      identity: IDENTITY,
      strategy: 'docling_hierarchical',
    });
    expect(second.child_chunks.map(chunk => chunk.chunk_id)).toEqual(
      first.child_chunks.map(chunk => chunk.chunk_id)
    );

    const otherProfile = await adaptNativeChunks(CHUNKS, index, {
      identity: { ...IDENTITY, conversionProfile: 'baseline+heading-inference' },
      strategy: 'docling_hierarchical',
    });
    expect(otherProfile.child_chunks[0].chunk_id).not.toBe(first.child_chunks[0].chunk_id);
  });

  it('refuses chunks whose refs do not resolve against the document', async () => {
    const index = buildDoclingProvenanceIndex(RAW_DOCUMENT);
    const rogue = [nativeChunk({ text: 'из другого документа', docItems: ['#/texts/999'] })];

    await expect(
      adaptNativeChunks(rogue, index, { identity: IDENTITY, strategy: 'docling_hierarchical' })
    ).rejects.toBeInstanceOf(DoclingChunkConsistencyError);
  });

  it('splits a native chunk that exceeds the child token budget', async () => {
    const index = buildDoclingProvenanceIndex(RAW_DOCUMENT);
    const long = 'Очень длинный абзац с содержимым. '.repeat(400);
    const result = await adaptNativeChunks(
      [nativeChunk({ text: long, headings: ['Глава 1'], docItems: ['#/texts/1'] })],
      index,
      { identity: IDENTITY, strategy: 'docling_hierarchical' }
    );

    expect(result.child_chunks.length).toBeGreaterThan(1);
    for (const child of result.child_chunks) {
      expect(child.token_count).toBeLessThanOrEqual(DEFAULT_CHUNKING_CONFIG.child_chunk_size * 1.5);
      expect(child.provenance?.self_refs).toEqual(['#/texts/1']);
    }
  });

  it('never builds a parent larger than the parent budget', async () => {
    // One native chunk far longer than a parent window: the embedding batcher
    // rejects any chunk over the Jina limit, so a single huge section must not
    // become a single huge parent.
    const index = buildDoclingProvenanceIndex(RAW_DOCUMENT);
    const long = 'Длинный абзац регламента с содержимым. '.repeat(1200);
    const result = await adaptNativeChunks(
      [nativeChunk({ text: long, headings: ['Глава 1'], docItems: ['#/texts/1'] })],
      index,
      { identity: IDENTITY, strategy: 'docling_hierarchical' }
    );

    expect(result.parent_chunks.length).toBeGreaterThan(1);
    for (const parent of result.parent_chunks) {
      expect(parent.token_count).toBeLessThanOrEqual(
        DEFAULT_CHUNKING_CONFIG.parent_chunk_size + DEFAULT_CHUNKING_CONFIG.child_chunk_size
      );
    }
    for (const child of result.child_chunks) {
      expect(result.parent_chunks.some(parent => parent.chunk_id === child.parent_chunk_id)).toBe(
        true
      );
    }
  });

  it('marks location coverage ineligible for a page-less document', async () => {
    const pagelessIndex = buildDoclingProvenanceIndex({
      pages: {},
      texts: [{ self_ref: '#/texts/1', label: 'text', text: 'без страниц' }],
    });
    const result = await adaptNativeChunks(
      [nativeChunk({ text: 'без страниц', docItems: ['#/texts/1'] })],
      pagelessIndex,
      { identity: IDENTITY, strategy: 'docling_hierarchical' }
    );

    expect(result.coverage.locationEligible).toBe(false);
    expect(result.coverage.refCoverage).toBe(1);
  });
});
