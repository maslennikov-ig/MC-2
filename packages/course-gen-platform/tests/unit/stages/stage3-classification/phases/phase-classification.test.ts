import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executeDocumentClassificationComparative,
  executeDocumentClassification,
  getStoredClassification,
  getCourseClassifications,
} from '@/stages/stage3-classification/phases/phase-classification';
import { cache } from '@/shared/cache/redis';
import { createOpenRouterModel } from '@/shared/llm/langchain-models';
import { createModelConfigService } from '@/shared/llm/model-config-service';
import { createPromptService } from '@/shared/prompts/prompt-service';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import {
  getCachedFileProcessedContent,
  getCachedFileMarkdown,
} from '@/shared/cache/file-content-cache';
import {
  planTournamentClassification,
  executeTournamentClassification,
} from '@/stages/stage3-classification/utils/tournament-classification';

const {
  mockSupabase,
  mockModelInvoke,
  mockStructuredModelInvoke,
  mockGetModelForPhase,
  mockRenderPrompt,
  mockRedisGet,
  mockRedisSet,
  mockPlanTournament,
  mockExecuteTournament,
  mockGetCachedProcessed,
  mockGetCachedMarkdown,
} = vi.hoisted(() => ({
  mockSupabase: { from: vi.fn() },
  mockModelInvoke: vi.fn(),
  mockStructuredModelInvoke: vi.fn(),
  mockGetModelForPhase: vi.fn(),
  mockRenderPrompt: vi.fn(),
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
  mockPlanTournament: vi.fn(),
  mockExecuteTournament: vi.fn(),
  mockGetCachedProcessed: vi.fn(),
  mockGetCachedMarkdown: vi.fn(),
}));

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => mockSupabase),
}));

vi.mock('@/shared/logger/index.js', () => {
  const loggerMock = { info: vi.fn(), warn: vi.fn(), error: console.error, debug: vi.fn() };
  return {
    __esModule: true,
    logger: loggerMock,
    default: loggerMock,
  };
});

vi.mock('@/shared/llm/langchain-models', () => ({
  createOpenRouterModel: vi.fn(() => ({
    invoke: mockModelInvoke,
    withStructuredOutput: vi.fn(() => ({
      invoke: mockStructuredModelInvoke,
    })),
  })),
}));

vi.mock('@/shared/llm/model-config-service', () => ({
  createModelConfigService: vi.fn(() => ({
    getModelForPhase: mockGetModelForPhase,
  })),
}));

vi.mock('@/shared/prompts/prompt-service', () => ({
  createPromptService: vi.fn(() => ({
    renderPrompt: mockRenderPrompt,
  })),
}));

vi.mock('@/shared/cache/redis', () => ({
  cache: {
    get: mockRedisGet,
    set: mockRedisSet,
  },
}));

vi.mock('@/shared/llm/token-estimator', () => ({
  tokenEstimator: {
    estimateTokens: vi.fn(() => 100),
  },
}));

vi.mock('@/stages/stage3-classification/utils/tournament-classification', () => ({
  planTournamentClassification: vi.fn((...args) => mockPlanTournament(...args)),
  executeTournamentClassification: vi.fn((...args) => mockExecuteTournament(...args)),
}));

vi.mock('@/shared/cache/file-content-cache', () => ({
  getCachedFileProcessedContent: vi.fn((...args) => mockGetCachedProcessed(...args)),
  getCachedFileMarkdown: vi.fn((...args) => mockGetCachedMarkdown(...args)),
}));

describe('phase-classification', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetModelForPhase.mockResolvedValue({
      modelId: 'test-model',
      temperature: 0.1,
      maxTokens: 1000,
    });

    mockRenderPrompt.mockResolvedValue('System prompt');
  });

  const setupSupabaseMocks = (
    files: any[],
    courseData: any = { title: 'T', course_description: 'D' }
  ) => {
    const fromMock = vi.fn((table: string) => {
      const builder: any = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
      };

      if (table === 'file_catalog') {
        const _idMock = vi.fn();
        builder.select = vi.fn(cols => {
          if (cols.includes('mime_type')) {
            builder.in = vi.fn(() => Promise.resolve({ data: files, error: null }));
            return builder;
          } else if (cols.includes('processed_content')) {
            builder.in = vi.fn(() => Promise.resolve({ data: [], error: null }));
            return builder;
          } else if (cols.includes('summary_metadata')) {
            builder.eq = vi.fn(() => {
              return {
                single: vi.fn(() => Promise.resolve({ data: files[0], error: null })),
                not: vi.fn(() => Promise.resolve({ data: files, error: null })),
              };
            });
            return builder;
          }
          return builder;
        });

        builder.update = vi.fn(() => {
          return {
            eq: vi.fn(() => Promise.resolve({ error: null })),
          };
        });
      } else if (table === 'courses') {
        builder.select = vi.fn(() => {
          return {
            eq: vi.fn(() => {
              return {
                single: vi.fn(() => Promise.resolve({ data: courseData, error: null })),
              };
            }),
          };
        });
      }
      return builder;
    });

    mockSupabase.from.mockImplementation(fromMock);
  };

  describe('executeDocumentClassificationComparative', () => {
    it('returns empty array if no files', async () => {
      const res = await executeDocumentClassificationComparative('course1', [], 'org1');
      expect(res).toEqual([]);
    });

    it('returns empty array if metadata missing', async () => {
      setupSupabaseMocks([]);
      const res = await executeDocumentClassificationComparative('course1', ['file1'], 'org1');
      expect(res).toEqual([]);
    });

    it('returns cached results if available', async () => {
      setupSupabaseMocks([{ id: 'file1', filename: 'test.pdf', file_size: 1000 }]);
      const mockDate = new Date();
      mockRedisGet.mockResolvedValueOnce([
        {
          file_id: 'file1',
          priority: 'HIGH',
          importance_score: 0.95,
          order: 1,
          classification_rationale: 'Cache',
          classified_at: mockDate.toISOString(),
        },
      ]);
      const res = await executeDocumentClassificationComparative('course1', ['file1'], 'org1');
      expect(res.length).toBe(1);
      expect(res[0].classification_rationale).toBe('Cache');
      // Should also store the cached copy inside Supabase
      expect(mockSupabase.from).toHaveBeenCalledWith('file_catalog');
    });

    it('executes simple comparative classification if within budget', async () => {
      setupSupabaseMocks([
        {
          id: 'file1',
          filename: 'test.pdf',
          file_size: 1000,
          summary_metadata: { summary_tokens: 100 },
        },
      ]);
      mockRedisGet.mockResolvedValueOnce(null);

      mockStructuredModelInvoke.mockResolvedValueOnce({
        classifications: [{ id: 'file1', priority: 'CORE', rationale: 'core rationale 123' }],
      });

      const res = await executeDocumentClassificationComparative('course1', ['file1'], 'org1');
      expect(res.length).toBe(1);
      expect(res[0].priority).toBe('HIGH');
      expect(res[0].importance_score).toBe(0.95);
      expect(res[0].priority_level).toBe('CORE');
      expect(mockStructuredModelInvoke).toHaveBeenCalled();
    });

    it('executes tournament comparative classification if budget exceeded', async () => {
      setupSupabaseMocks([
        {
          id: 'file1',
          filename: 'test.pdf',
          file_size: 1000,
          summary_metadata: { summary_tokens: 110_000 },
        },
      ]);
      mockRedisGet.mockResolvedValueOnce(null);

      mockExecuteTournament.mockResolvedValueOnce({
        classifications: [{ id: 'file1', priority: 'IMPORTANT', rationale: 'important rationale' }],
      });

      const res = await executeDocumentClassificationComparative('course1', ['file1'], 'org1');
      expect(res.length).toBe(1);
      expect(res[0].priority).toBe('HIGH');
      expect(res[0].importance_score).toBe(0.75);
      expect(res[0].priority_level).toBe('IMPORTANT');
      expect(mockPlanTournament).toHaveBeenCalled();
    });

    it('falls back to independent classification on error', async () => {
      setupSupabaseMocks([
        {
          id: 'file1',
          filename: 'test.pdf',
          file_size: 1000,
          summary_metadata: { summary_tokens: 100 },
        },
      ]);
      mockRedisGet.mockResolvedValueOnce(null);

      // Trigger error in comparative
      mockStructuredModelInvoke.mockRejectedValueOnce(new Error('LLM Failure'));

      // Fallback independent classification
      mockModelInvoke.mockResolvedValueOnce({
        content: JSON.stringify({
          importance_score: 0.6,
          classification_rationale: 'fallback logic',
        }),
      });

      const res = await executeDocumentClassificationComparative('course1', ['file1'], 'org1');
      expect(res.length).toBe(1);
      expect(res[0].priority).toBe('LOW'); // 0.6 is < 0.7
      expect(res[0].importance_score).toBe(0.6);
    });

    it('auto-fixes validation constraints on classifications (e.g. promoting to CORE)', async () => {
      setupSupabaseMocks([
        {
          id: 'f1',
          filename: 'test1.pdf',
          file_size: 1000,
          summary_metadata: { summary_tokens: 10 },
        },
        {
          id: 'f2',
          filename: 'test2.pdf',
          file_size: 1000,
          summary_metadata: { summary_tokens: 10 },
        },
      ]);
      mockRedisGet.mockResolvedValue(null);

      mockStructuredModelInvoke.mockResolvedValueOnce({
        classifications: [
          { id: 'f1', priority: 'IMPORTANT', rationale: 'reason 1' },
          { id: 'f2', priority: 'SUPPLEMENTARY', rationale: 'reason 2' },
        ],
      });

      const res = await executeDocumentClassificationComparative('course1', ['f1', 'f2'], 'org1');
      expect(res[0].priority_level).toBe('CORE'); // Auto-promoted
      expect(res[1].priority_level).toBe('SUPPLEMENTARY');
    });

    it('auto-fixes validation to demote excess IMPORTANT', async () => {
      setupSupabaseMocks([
        {
          id: 'f1',
          filename: 'test1.pdf',
          file_size: 1000,
          summary_metadata: { summary_tokens: 10 },
        },
        {
          id: 'f2',
          filename: 'test2.pdf',
          file_size: 1000,
          summary_metadata: { summary_tokens: 10 },
        },
        {
          id: 'f3',
          filename: 'test3.pdf',
          file_size: 1000,
          summary_metadata: { summary_tokens: 10 },
        },
      ]);
      mockRedisGet.mockResolvedValue(null);

      mockStructuredModelInvoke.mockResolvedValueOnce({
        classifications: [
          { id: 'f1', priority: 'CORE', rationale: 'reason' },
          { id: 'f2', priority: 'IMPORTANT', rationale: 'reason' }, // allowed: maxMath.ceil(3*0.3) = 1
          { id: 'f3', priority: 'IMPORTANT', rationale: 'reason' }, // excess
        ],
      });

      const res = await executeDocumentClassificationComparative(
        'course1',
        ['f1', 'f2', 'f3'],
        'org1'
      );
      expect(res[0].priority_level).toBe('CORE');
      expect(res[1].priority_level).toBe('SUPPLEMENTARY'); // Demoted!
      expect(res[2].priority_level).toBe('IMPORTANT');
    });
  });

  describe('executeDocumentClassification', () => {
    it('returns empty array if no files', async () => {
      const res = await executeDocumentClassification('course1', [], 'org1');
      expect(res).toEqual([]);
    });

    it('handles LLM error per file by defaulting to LOW priority', async () => {
      setupSupabaseMocks([{ id: 'file1', filename: 'test.pdf', file_size: 1000 }]);
      mockModelInvoke.mockRejectedValueOnce(new Error('LLM crash'));

      const res = await executeDocumentClassification('course1', ['file1'], 'org1');
      expect(res.length).toBe(1);
      expect(res[0].importance_score).toBe(0.3); // default
      expect(res[0].priority).toBe('LOW');
    });

    it('returns valid DocumentPriority list', async () => {
      setupSupabaseMocks([
        { id: 'f1', filename: 'f1', file_size: 100 },
        { id: 'f2', filename: 'f2', file_size: 100 },
      ]);
      mockModelInvoke
        .mockResolvedValueOnce({
          content: JSON.stringify({
            importance_score: 0.9,
            classification_rationale: 'this is a valid long rationale 1',
          }),
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({
            importance_score: 0.5,
            classification_rationale: 'this is a valid long rationale 2',
          }),
        });

      const res = await executeDocumentClassification('course1', ['f1', 'f2'], 'org1');
      expect(res.length).toBe(2);
      expect(res[0].file_id).toBe('f1');
      expect(res[0].priority).toBe('HIGH');
      expect(res[1].file_id).toBe('f2');
      expect(res[1].priority).toBe('LOW');
      expect(mockSupabase.from).toHaveBeenCalledWith('file_catalog'); // store
    });

    it('handles markdown strings wrapping JSON output', async () => {
      setupSupabaseMocks([{ id: 'file1', filename: 'test.pdf', file_size: 1000 }]);
      mockModelInvoke.mockResolvedValueOnce({
        content:
          '```json\n{"importance_score": 0.8, "classification_rationale": "this is a valid rationale"}\n```',
      });

      const res = await executeDocumentClassification('course1', ['file1'], 'org1');
      expect(res[0].importance_score).toBe(0.8);
    });
  });

  describe('Utility Exports', () => {
    it('getStoredClassification returns null if no data', async () => {
      mockSupabase.from.mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ error: new Error('Empty') }),
      }));
      const res = await getStoredClassification('f1');
      expect(res).toBeNull();
    });

    it('getStoredClassification returns priority data', async () => {
      mockSupabase.from.mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'f1',
            summary_metadata: {
              classification: {
                priority: 'HIGH',
                importance_score: 0.9,
                order: 1,
                classification_rationale: 'Reason',
                classified_at: '2025-01-01T00:00:00Z',
              },
            },
          },
        }),
      }));
      const res = await getStoredClassification('f1');
      expect(res?.file_id).toBe('f1');
      expect(res?.priority).toBe('HIGH');
    });

    it('getCourseClassifications returns array', async () => {
      mockSupabase.from.mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'f1',
              summary_metadata: {
                classification: {
                  priority: 'HIGH',
                  importance_score: 0.9,
                  order: 1,
                  classification_rationale: 'Reason',
                  classified_at: '2025-01-01T00:00:00Z',
                },
              },
            },
          ],
        }),
      }));
      const res = await getCourseClassifications('c1');
      expect(res.length).toBe(1);
    });
  });
});
