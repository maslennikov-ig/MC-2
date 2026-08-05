import { beforeEach, describe, expect, it, vi } from 'vitest';

const convertDocumentBundle = vi.hoisted(() => vi.fn());

vi.mock('@/stages/stage2-document-processing/docling/client.js', () => ({
  getDoclingClient: () => ({ convertDocumentBundle }),
}));

vi.mock('@/shared/logger/index.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { convertDocumentToMarkdown } from '@/shared/embeddings/markdown-converter';

describe('convertDocumentToMarkdown bundle adoption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    convertDocumentBundle.mockResolvedValue({
      markdown: '# Title\n\nBody',
      documentKey: 'doc-1',
      fromCache: true,
      processingTimeMs: 42,
      document: {
        schema_version: '1.9.0',
        name: 'fixture',
        pages: [{ page_no: 1, size: { width: 100, height: 200 }, cells: [] }],
        texts: [{ id: '#/texts/0', text: 'Title', type: 'section_header', page_no: 1, level: 1 }],
        pictures: [],
        tables: [],
        metadata: { page_count: 1 },
      },
    });
  });

  it('uses a single MCP bundle so Markdown and JSON share one document key', async () => {
    const result = await convertDocumentToMarkdown('/app/uploads/fixture.pdf');

    expect(convertDocumentBundle).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      markdown: '# Title\n\nBody',
      json: { name: 'fixture' },
      metadata: {
        pages_processed: 1,
        text_elements: 1,
        processing_time_ms: expect.any(Number),
      },
    });
  });
});
