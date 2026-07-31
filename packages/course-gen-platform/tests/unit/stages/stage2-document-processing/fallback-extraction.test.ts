import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// On 2026-07-31 megacampus-docling-mcp-internal restarted seven times under a concurrency-4
// reindex. 60 documents failed conversion; the 28 PDFs among them were rescued by the fallback
// below, and 32 DOCX files got "No fallback extraction available" and became PERMANENT failures
// (mc2-q3ju4, mc2-lkkcv). DOCX is the repo's most common upload format and it was the one format
// with no fallback at all, so a transient outage in one container was destroying user data.
//
// These cases run against a real .docx fixture through the real extractor: the point is that the
// bytes of an OOXML package become text, which a mock of the library could not prove.
const { mockLogger, mockLogTrace, mockGetSupabaseAdmin } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  mockLogTrace: vi.fn().mockResolvedValue(undefined),
  mockGetSupabaseAdmin: vi.fn(),
}));

vi.mock('@/shared/logger/index.js', () => ({ logger: mockLogger, default: mockLogger }));
vi.mock('@/shared/trace-logger', () => ({ logTrace: mockLogTrace }));
vi.mock('@/shared/supabase/admin', () => ({ getSupabaseAdmin: mockGetSupabaseAdmin }));

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const FIXTURE = resolve(import.meta.dirname, 'fixtures/docling-fallback-sample.docx');

async function loadFallback() {
  return import('@/stages/stage2-document-processing/orchestrator-fallback-helpers');
}

describe('attemptFallbackExtraction for DOCX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({ single: async () => ({ data: { course_id: 'course-1' } }) }),
        }),
      }),
    });
  });

  it('extracts a real .docx instead of reporting no fallback available', async () => {
    const { attemptFallbackExtraction } = await loadFallback();

    const result = await attemptFallbackExtraction(
      'file-1',
      FIXTURE,
      DOCX_MIME,
      'Failed to convert document to markdown'
    );

    expect(result).not.toBeNull();
    expect(result?.markdown).toContain('Загрузка данных');
    expect(result?.markdown).toContain('Первый абзац');
    expect(mockLogger.warn).not.toHaveBeenCalledWith(
      expect.anything(),
      'No fallback extraction available'
    );
  });

  it('keeps the headings that carry the document structure', async () => {
    const { attemptFallbackExtraction } = await loadFallback();

    const result = await attemptFallbackExtraction('file-2', FIXTURE, DOCX_MIME, 'boom');

    // Chunking downstream reads headings out of the markdown. extractRawText would have flattened
    // the whole document into one unsegmented blob.
    expect(result?.markdown).toContain('# Загрузка данных');
  });

  it('does not leave markdown escapes in the prose it hands to the embedder', async () => {
    const { attemptFallbackExtraction } = await loadFallback();

    const result = await attemptFallbackExtraction('file-3', FIXTURE, DOCX_MIME, 'boom');

    // mammoth escapes markdown punctuation, so every sentence would end in `\.` and every embedded
    // chunk would carry that noise.
    expect(result?.markdown).not.toMatch(/\\[.\-+#!]/u);
    expect(result?.markdown).toContain('порог фолбэка.');
  });

  it('records the fallback it used, so a rescued document is distinguishable from a clean one', async () => {
    const { attemptFallbackExtraction } = await loadFallback();

    await attemptFallbackExtraction('file-4', FIXTURE, DOCX_MIME, 'boom');

    expect(mockLogTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        stepName: 'fallback_extraction_success',
        inputData: expect.objectContaining({ fallbackMethod: 'mammoth' }),
      })
    );
  });

  it('still reports no fallback for a format that genuinely has none', async () => {
    const { attemptFallbackExtraction } = await loadFallback();

    const result = await attemptFallbackExtraction('file-5', FIXTURE, 'image/png', 'boom');

    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.anything(),
      'No fallback extraction available'
    );
  });
});
