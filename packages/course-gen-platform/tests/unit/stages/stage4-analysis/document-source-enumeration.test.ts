/* eslint-disable @typescript-eslint/require-await -- async query-builder mocks mirror Supabase */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  getCachedFileProcessedContentBatch: vi.fn(),
  getCachedFileMarkdownBatch: vi.fn(),
}));

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

vi.mock('@/shared/cache/file-content-cache', () => ({
  getCachedFileProcessedContentBatch: mocks.getCachedFileProcessedContentBatch,
  getCachedFileMarkdownBatch: mocks.getCachedFileMarkdownBatch,
}));

import {
  fetchDocumentSummaries,
  resolveDocumentContent,
} from '@/stages/stage4-analysis/handler-helpers';

const documentId = (value: number) =>
  `40000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

describe('Stage 4 document source enumeration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('enumerates processed and missing-content sources regardless of Qdrant vector status', async () => {
    const rows = ['indexed', 'pending', 'failed'].map((vectorStatus, index) => ({
      id: documentId(index + 1),
      original_name: `${vectorStatus}.pdf`,
      filename: `${vectorStatus}.pdf`,
      hash: `sha256:${vectorStatus}`,
      summary_metadata: {},
      priority: index === 0 ? 'CORE' : 'SUPPLEMENTARY',
      vector_status: vectorStatus,
    }));
    const filters: Array<[string, string]> = [];
    const from = vi.fn(() => {
      let selected = '';
      const builder = {
        select(columns: string) {
          selected = columns;
          return builder;
        },
        eq(column: string, value: string) {
          filters.push([column, value]);
          return builder;
        },
        order() {
          return builder;
        },
        gt() {
          return builder;
        },
        async range() {
          return { data: rows, error: null, count: rows.length };
        },
        async in(_column: string, ids: string[]) {
          expect(selected).toContain('processed_content');
          return {
            data: ids
              .filter(id => id !== documentId(3))
              .map(id => ({ id, processed_content: `Summary ${id}` })),
            error: null,
          };
        },
      };
      return builder;
    });
    mocks.getSupabaseAdmin.mockReturnValue({ from });
    mocks.getCachedFileProcessedContentBatch.mockResolvedValue(new Map());

    const result = await fetchDocumentSummaries('20000000-0000-4000-8000-000000000001');

    expect(result.map(item => item.document_id)).toEqual(rows.map(row => row.id));
    expect(new Set(result.map(item => item.document_id)).size).toBe(3);
    expect(filters.some(([column]) => column === 'vector_status')).toBe(false);
    expect(result.at(-1)?.processed_content).toBe('');
  });

  it('propagates version hashes and deterministically pages beyond the Supabase 1,000 row default', async () => {
    const rows = Array.from({ length: 1_205 }, (_, index) => ({
      id: documentId(index + 1),
      original_name: `Document ${index + 1}.pdf`,
      filename: `document-${index + 1}.pdf`,
      hash: `sha256:${index + 1}`,
      summary_metadata: {
        original_tokens: 1_000,
        summary_tokens: 100,
        compression_ratio: 0.1,
        quality_score: 0.8,
      },
      priority: index === 0 ? 'CORE' : 'SUPPLEMENTARY',
    }));
    const ranges: Array<[number, number]> = [];
    const selects: string[] = [];
    const from = vi.fn(() => {
      let afterId: string | undefined;
      const builder = {
        select(columns: string) {
          selects.push(columns);
          return builder;
        },
        eq() {
          return builder;
        },
        not() {
          return builder;
        },
        order() {
          return builder;
        },
        gt(_column: string, value: string) {
          afterId = value;
          return builder;
        },
        async range(fromIndex: number, toIndex: number) {
          ranges.push([fromIndex, toIndex]);
          const start = afterId ? rows.findIndex(row => row.id === afterId) + 1 : fromIndex;
          return {
            data: rows.slice(start, start + toIndex - fromIndex + 1),
            error: null,
            count: rows.length,
          };
        },
      };
      return builder;
    });
    mocks.getSupabaseAdmin.mockReturnValue({ from });
    mocks.getCachedFileProcessedContentBatch.mockResolvedValue(
      new Map(rows.map(row => [row.id, `Summary for ${row.id}`]))
    );

    const result = await fetchDocumentSummaries('20000000-0000-4000-8000-000000000001');

    expect(result).toHaveLength(1_205);
    expect(result.map(item => item.document_id)).toEqual(rows.map(row => row.id));
    expect(result[0].source_version_hash).toBe('sha256:1');
    expect(result.at(-1)?.source_version_hash).toBe('sha256:1205');
    expect(ranges).toEqual([
      [0, 999],
      [0, 999],
      [0, 999],
      [0, 999],
    ]);
    expect(selects.every(columns => columns.includes('hash'))).toBe(true);
    expect(mocks.getCachedFileProcessedContentBatch).toHaveBeenCalledWith(
      '20000000-0000-4000-8000-000000000001',
      rows.map(row => row.id)
    );
  });

  it('fails closed when exact count and paged source set drift', async () => {
    const row = {
      id: documentId(1),
      original_name: 'Document.pdf',
      filename: 'document.pdf',
      hash: 'sha256:1',
      summary_metadata: {},
      priority: 'CORE',
    };
    const from = vi.fn(() => {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        order() {
          return builder;
        },
        gt() {
          return builder;
        },
        async range() {
          return { data: [row], error: null, count: 2 };
        },
      };
      return builder;
    });
    mocks.getSupabaseAdmin.mockReturnValue({ from });

    await expect(fetchDocumentSummaries('20000000-0000-4000-8000-000000000001')).rejects.toThrow(
      /exact count\/set\/order/i
    );
    expect(mocks.getCachedFileProcessedContentBatch).not.toHaveBeenCalled();
  });

  it('rejects an equal-count source substitution between keyset verification scans', async () => {
    const original = [
      {
        id: documentId(1),
        original_name: 'A.pdf',
        filename: 'a.pdf',
        hash: 'sha256:a',
        summary_metadata: {},
        priority: 'CORE',
      },
      {
        id: documentId(2),
        original_name: 'B.pdf',
        filename: 'b.pdf',
        hash: 'sha256:b',
        summary_metadata: {},
        priority: 'SUPPLEMENTARY',
      },
    ];
    const substituted = [original[0], { ...original[1], id: documentId(3), hash: 'sha256:c' }];
    let scan = 0;
    const from = vi.fn(() => {
      const rows = scan++ === 0 ? original : substituted;
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        order() {
          return builder;
        },
        gt() {
          return builder;
        },
        async range() {
          return { data: rows, error: null, count: 2 };
        },
      };
      return builder;
    });
    mocks.getSupabaseAdmin.mockReturnValue({ from });

    await expect(fetchDocumentSummaries('20000000-0000-4000-8000-000000000001')).rejects.toThrow(
      /changed during keyset pagination/i
    );
  });

  it('bounds all 1,205 cache-miss fallback queries without excluding sources', async () => {
    const rows = Array.from({ length: 1_205 }, (_, index) => ({
      id: documentId(index + 1),
      original_name: `Document ${index + 1}.pdf`,
      filename: `document-${index + 1}.pdf`,
      hash: `sha256:${index + 1}`,
      summary_metadata: {},
      priority: index === 0 ? 'CORE' : 'SUPPLEMENTARY',
    }));
    const contentBatches: string[][] = [];
    const contentCourseFilters: string[] = [];
    const from = vi.fn(() => {
      let selected = '';
      let afterId: string | undefined;
      const builder = {
        select(columns: string) {
          selected = columns;
          return builder;
        },
        eq(column: string, value: string) {
          if (selected.includes('processed_content') && column === 'course_id') {
            contentCourseFilters.push(value);
          }
          return builder;
        },
        order() {
          return builder;
        },
        gt(_column: string, value: string) {
          afterId = value;
          return builder;
        },
        async range(fromIndex: number, toIndex: number) {
          const start = afterId ? rows.findIndex(row => row.id === afterId) + 1 : fromIndex;
          return {
            data: rows.slice(start, start + toIndex - fromIndex + 1),
            error: null,
            count: rows.length,
          };
        },
        async in(_column: string, ids: string[]) {
          expect(selected).toContain('processed_content');
          contentBatches.push(ids);
          return {
            data: ids.map(id => ({ id, processed_content: `Recovered ${id}` })),
            error: null,
          };
        },
      };
      return builder;
    });
    mocks.getSupabaseAdmin.mockReturnValue({ from });
    mocks.getCachedFileProcessedContentBatch.mockResolvedValue(new Map());

    const result = await fetchDocumentSummaries('20000000-0000-4000-8000-000000000001');

    expect(result).toHaveLength(1_205);
    expect(contentBatches).toHaveLength(7);
    expect(contentBatches.every(batch => batch.length > 0 && batch.length <= 200)).toBe(true);
    expect(contentBatches.flat()).toEqual(rows.map(row => row.id));
    expect(contentCourseFilters).toEqual(
      Array.from({ length: 7 }, () => '20000000-0000-4000-8000-000000000001')
    );
    expect(result.every(item => item.processed_content.startsWith('Recovered '))).toBe(true);
  });

  it('bounds and tenant-filters full-text fallback batches', async () => {
    const summaries = Array.from({ length: 1_205 }, (_, index) => ({
      document_id: documentId(index + 1),
      file_name: `Document ${index + 1}.pdf`,
      source_version_hash: `sha256:${index + 1}`,
      processed_content: `Summary ${index + 1}`,
      processing_method: 'balanced' as const,
      summary_metadata: {
        original_tokens: 1_000,
        summary_tokens: 100,
        compression_ratio: 0.1,
        quality_score: 0.8,
      },
      stage3_priority: index === 0 ? ('CORE' as const) : ('SUPPLEMENTARY' as const),
      stage3_importance_score: 0.5,
    }));
    const batches: string[][] = [];
    const courseFilters: string[] = [];
    mocks.getCachedFileMarkdownBatch.mockResolvedValue(new Map());
    const from = vi.fn(() => {
      let ids: string[] = [];
      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: string) {
          if (column === 'course_id') courseFilters.push(value);
          return builder;
        },
        in(_column: string, values: string[]) {
          ids = values;
          batches.push(values);
          return builder;
        },
        async not() {
          return {
            data: ids.map(id => ({ id, markdown_content: `Full ${id}` })),
            error: null,
          };
        },
      };
      return builder;
    });
    mocks.getSupabaseAdmin.mockReturnValue({ from });
    const allocation = {
      modelSelection: {
        modelId: 'test',
        fallbackModelId: 'test',
        tier: 'extended' as const,
        maxContext: 1_000_000,
        cacheReadEnabled: false,
      },
      documents: summaries.map(summary => ({
        file_id: summary.document_id,
        mode: 'full_text' as const,
        tokens: 1_000,
        priority: summary.stage3_priority,
      })),
      totalTokens: summaries.length * 1_000,
      breakdown: {
        core: { count: 1, tokens: 1_000, mode: 'full_text' as const },
        important: { count: 0, fullTextCount: 0, summaryCount: 0, tokens: 0 },
        supplementary: { count: 1_204, tokens: 1_204_000, mode: 'summary' as const },
      },
    };

    const result = await resolveDocumentContent(
      allocation,
      summaries,
      '20000000-0000-4000-8000-000000000001'
    );

    expect(batches).toHaveLength(7);
    expect(batches.every(batch => batch.length <= 200)).toBe(true);
    expect(courseFilters).toEqual(
      Array.from({ length: 7 }, () => '20000000-0000-4000-8000-000000000001')
    );
    expect(result.every(item => item.processed_content.startsWith('Full '))).toBe(true);
  });
});
