import type { Job } from 'bullmq';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CareerPlaybookJobData } from '@megacampus/shared-types';

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  executeDoclingConversion: vi.fn(),
  storeProcessedDocument: vi.fn(),
  executePhase6Summarization: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

vi.mock('@/shared/logger', () => ({
  default: {
    info: mocks.loggerInfo,
    error: mocks.loggerError,
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/stages/stage2-document-processing/phases/phase-1-docling-conversion', () => ({
  executeDoclingConversion: mocks.executeDoclingConversion,
}));

vi.mock('@/stages/stage2-document-processing/orchestrator-helpers', () => ({
  storeProcessedDocument: mocks.storeProcessedDocument,
}));

vi.mock('@/stages/stage2-document-processing/phases/phase-6-summarization', () => ({
  executePhase6Summarization: mocks.executePhase6Summarization,
}));

import { processCareerPlaybookSource } from '@/stages/stage-career-playbook/source-processing';

const playbookId = '00000000-0000-4000-8000-000000000001';
const sourceId = '00000000-0000-4000-8000-000000000015';
const fileId = '00000000-0000-4000-8000-000000000016';
const organizationId = '00000000-0000-4000-8000-000000000018';

function createSupabaseMock() {
  const updates: Array<{ table: string; payload: Record<string, unknown>; eq: [string, unknown] }> =
    [];

  const supabase = {
    from: vi.fn((table: string) => {
      const builder = {
        update: vi.fn((payload: Record<string, unknown>) => {
          const updateRecord = { table, payload, eq: ['', undefined] as [string, unknown] };
          updates.push(updateRecord);
          return {
            eq: vi.fn((column: string, value: unknown) => {
              updateRecord.eq = [column, value];
              return Promise.resolve({ data: null, error: null });
            }),
          };
        }),
      };
      return builder;
    }),
  };

  return { supabase, updates };
}

function createJob() {
  return {
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<CareerPlaybookJobData>;
}

describe('Career Playbook source processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes an uploaded source and marks it ready without using a fake course record', async () => {
    const { supabase, updates } = createSupabaseMock();
    const job = createJob();
    const processingResult = {
      markdown: 'Product: B2B AI course generator',
      json: { document: 'context' },
      images: [],
      stats: {
        markdown_length: 32,
        pages: 1,
        images: 0,
        tables: 0,
        sections: 1,
        processing_time_ms: 5,
      },
    };

    mocks.getSupabaseAdmin.mockReturnValue(supabase);
    mocks.executeDoclingConversion.mockResolvedValue(processingResult);
    mocks.storeProcessedDocument.mockResolvedValue(undefined);
    mocks.executePhase6Summarization.mockResolvedValue({
      success: true,
      fileId,
      summary: 'B2B AI course generator',
      generatedTitle: 'Product Overview',
      summaryTokens: 10,
      originalTokens: 10,
      language: 'en',
      processingMethod: 'full_text',
      metadata: { iterations: 0, qualityScore: 1, processingTimeMs: 1 },
    });

    const result = await processCareerPlaybookSource({
      playbookId,
      sourceId,
      fileId,
      filePath: '/tmp/context.pdf',
      mimeType: 'application/pdf',
      organizationId,
      language: 'ru',
      job,
    });

    expect(result).toEqual({ sourceId, fileId, status: 'ready' });
    expect(updates).toEqual([
      {
        table: 'career_playbook_sources',
        payload: { status: 'processing', error_message: null, updated_at: expect.any(String) },
        eq: ['id', sourceId],
      },
      {
        table: 'career_playbook_sources',
        payload: { status: 'ready', error_message: null, updated_at: expect.any(String) },
        eq: ['id', sourceId],
      },
    ]);
    expect(mocks.executeDoclingConversion).toHaveBeenCalledWith(
      '/tmp/context.pdf',
      'business',
      expect.objectContaining({ updateProgress: expect.any(Function) })
    );
    expect(mocks.storeProcessedDocument).toHaveBeenCalledWith(fileId, processingResult, playbookId);
    expect(mocks.executePhase6Summarization).toHaveBeenCalledWith(
      playbookId,
      fileId,
      organizationId,
      expect.objectContaining({ onProgress: expect.any(Function) })
    );
  });

  it('processes markdown sources directly without Docling', async () => {
    const { supabase, updates } = createSupabaseMock();
    const job = createJob();
    const tempDir = await mkdtemp(join(tmpdir(), 'career-playbook-source-'));
    const filePath = join(tempDir, 'context.md');
    await writeFile(
      filePath,
      '# Business context\n\nKPI: 80 MQL/month, CVR content to lead 2.5%.',
      'utf8'
    );

    mocks.getSupabaseAdmin.mockReturnValue(supabase);
    mocks.storeProcessedDocument.mockResolvedValue(undefined);
    mocks.executePhase6Summarization.mockResolvedValue({
      success: true,
      fileId,
      summary: '80 MQL/month',
      generatedTitle: 'Business context',
      summaryTokens: 10,
      originalTokens: 10,
      language: 'en',
      processingMethod: 'full_text',
      metadata: { iterations: 0, qualityScore: 1, processingTimeMs: 1 },
    });

    try {
      const result = await processCareerPlaybookSource({
        playbookId,
        sourceId,
        fileId,
        filePath,
        mimeType: 'text/markdown',
        organizationId,
        language: 'ru',
        job,
      });

      expect(result).toEqual({ sourceId, fileId, status: 'ready' });
      expect(mocks.executeDoclingConversion).not.toHaveBeenCalled();
      expect(mocks.storeProcessedDocument).toHaveBeenCalledWith(
        fileId,
        expect.objectContaining({
          markdown: expect.stringContaining('80 MQL/month'),
          stats: expect.objectContaining({
            pages: 1,
            sections: 0,
          }),
        }),
        playbookId
      );
      expect(updates).toEqual([
        {
          table: 'career_playbook_sources',
          payload: { status: 'processing', error_message: null, updated_at: expect.any(String) },
          eq: ['id', sourceId],
        },
        {
          table: 'career_playbook_sources',
          payload: { status: 'ready', error_message: null, updated_at: expect.any(String) },
          eq: ['id', sourceId],
        },
      ]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('marks source and file processing failed when extraction fails', async () => {
    const { supabase, updates } = createSupabaseMock();
    mocks.getSupabaseAdmin.mockReturnValue(supabase);
    mocks.executeDoclingConversion.mockRejectedValue(new Error('Docling unavailable'));

    await expect(
      processCareerPlaybookSource({
        playbookId,
        sourceId,
        fileId,
        filePath: '/tmp/context.pdf',
        mimeType: 'application/pdf',
        organizationId,
        language: 'ru',
        job: createJob(),
      })
    ).rejects.toThrow('Docling unavailable');

    expect(updates).toEqual([
      {
        table: 'career_playbook_sources',
        payload: { status: 'processing', error_message: null, updated_at: expect.any(String) },
        eq: ['id', sourceId],
      },
      {
        table: 'career_playbook_sources',
        payload: {
          status: 'failed',
          error_message: 'Docling unavailable',
          updated_at: expect.any(String),
        },
        eq: ['id', sourceId],
      },
      {
        table: 'file_catalog',
        payload: {
          vector_status: 'failed',
          error_message: 'Docling unavailable',
          updated_at: expect.any(String),
        },
        eq: ['id', fileId],
      },
    ]);
  });
});
