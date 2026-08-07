import { describe, expect, it } from 'vitest';

import { buildDoclingProvenanceIndex } from '../../../../src/stages/stage2-document-processing/docling/provenance.js';
import type { NativeDoclingChunk } from '../../../../src/stages/stage2-document-processing/docling/serve-chunker.js';
import { adaptNativeChunks } from '../../../../src/shared/embeddings/native-chunk-adapter.js';
import {
  enrichChunks,
  toQdrantPayload,
} from '../../../../src/shared/embeddings/metadata-enricher.js';
import { chunkMarkdown, getAllChunks } from '../../../../src/shared/embeddings/markdown-chunker.js';
import { isQdrantChunkPayload } from '../../../../src/shared/qdrant/types.js';

const RAW_DOCUMENT = {
  pages: { '1': { page_no: 1, size: { width: 595, height: 842 } } },
  texts: [
    {
      self_ref: '#/texts/0',
      label: 'section_header',
      text: 'Раздел',
      prov: [{ page_no: 1, bbox: { l: 10, t: 800, r: 300, b: 780, coord_origin: 'BOTTOMLEFT' } }],
    },
    {
      self_ref: '#/texts/1',
      label: 'text',
      text: 'Тело раздела с достаточным объёмом текста для чанка.',
      prov: [{ page_no: 1, bbox: { l: 10, t: 770, r: 500, b: 700, coord_origin: 'BOTTOMLEFT' } }],
    },
  ],
  tables: [],
  pictures: [],
};

const ENRICHMENT = {
  document_id: 'doc-1',
  document_name: 'fixture.pdf',
  organization_id: 'org-1',
  course_id: 'course-1',
  document_priority: 'CORE' as const,
  document_weight: 1,
};

const NATIVE: NativeDoclingChunk[] = [
  {
    chunkIndex: 0,
    text: 'Раздел\nТело раздела с достаточным объёмом текста для чанка.',
    rawText: 'Тело раздела с достаточным объёмом текста для чанка.',
    numTokens: 17,
    headings: ['Раздел'],
    captions: [],
    docItems: ['#/texts/1'],
    pageNumbers: [1],
  },
];

describe('native chunk Qdrant payload', () => {
  it('adds provenance without changing the fields old readers require', async () => {
    const index = buildDoclingProvenanceIndex(RAW_DOCUMENT);
    const adaptation = await adaptNativeChunks(NATIVE, index, {
      identity: {
        sourceDigest: 'digest',
        conversionProfile: 'baseline',
        chunkingProfile: {
          chunker: 'hybrid',
          tokenizer: 'sentence-transformers/all-MiniLM-L6-v2',
          maxTokens: 400,
          mergePeers: true,
          useMarkdownTables: true,
          serveVersion: '1.29.0',
        },
      },
      strategy: 'docling_hybrid',
    });

    const enriched = enrichChunks(getAllChunks(adaptation), ENRICHMENT);
    const payloads = enriched.map(toQdrantPayload);

    for (const payload of payloads) {
      expect(isQdrantChunkPayload(payload)).toBe(true);
      expect(payload.chunk_strategy).toBe('docling_hybrid');
      expect(payload.source_refs).toEqual(['#/texts/1']);
      expect(payload.provenance_page_numbers).toEqual([1]);
      expect(payload.page_number).toBe(1);
      expect(payload.page_range).toEqual([1, 1]);
    }

    const [bbox] = payloads[0].provenance_bboxes as Array<Record<string, unknown>>;
    expect(bbox).toMatchObject({ coordOrigin: 'BOTTOMLEFT', pageWidth: 595, pageHeight: 842 });
  });

  it('leaves the legacy payload shape untouched when the strategy is off', async () => {
    const legacy = await chunkMarkdown(
      ['# Раздел', '', 'Тело раздела с достаточным объёмом текста для чанка. '.repeat(40)].join(
        '\n'
      )
    );
    const payloads = enrichChunks(getAllChunks(legacy), ENRICHMENT).map(toQdrantPayload);

    expect(payloads.length).toBeGreaterThan(0);
    for (const payload of payloads) {
      expect(isQdrantChunkPayload(payload)).toBe(true);
      expect(payload.chunk_strategy).toBe('hierarchical_markdown');
      // The new keys must be absent, not null: an old reader sees exactly what
      // it saw before, and no existing point needs rewriting.
      expect('source_refs' in payload).toBe(false);
      expect('provenance_bboxes' in payload).toBe(false);
    }
  });

  it('keeps a payload written before provenance existed readable', () => {
    const oldPayload = {
      chunk_id: 'child_0_abc',
      parent_chunk_id: 'parent_0_abc',
      level: 'child',
      content: 'старый чанк',
      heading_path: 'Root',
      document_id: 'doc-0',
      document_name: 'old.pdf',
      token_count: 42,
    };
    expect(isQdrantChunkPayload(oldPayload)).toBe(true);
  });
});
