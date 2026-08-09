import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClarifyingQuestionsInterrupt } from '@/shared/errors';

const mocks = vi.hoisted(() => ({
  getClarifyingConfig: vi.fn(),
  getPendingQuestions: vi.fn(),
  getAnsweredQuestions: vi.fn(),
  runPhase05Clarifying: vi.fn(),
  autoAnswerAllQuestions: vi.fn(),
}));

vi.mock('@/stages/stage4-analysis/phases/phase-0.5-clarifying', () => ({
  getClarifyingConfig: mocks.getClarifyingConfig,
  getPendingQuestions: mocks.getPendingQuestions,
  getAnsweredQuestions: mocks.getAnsweredQuestions,
  runPhase05Clarifying: mocks.runPhase05Clarifying,
  autoAnswerAllQuestions: mocks.autoAnswerAllQuestions,
  extractAnswerString: vi.fn(() => ''),
}));

import { runClarifyingPhase } from '@/stages/stage4-analysis/orchestrator-phase-helpers';
import type { AnalysisContext } from '@/stages/stage4-analysis/orchestrator-helpers';

function context() {
  const updates: Array<Record<string, unknown>> = [];
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(async () => ({ data: { generation_progress: { percentage: 27 } } })),
      })),
    })),
    update: vi.fn((value: Record<string, unknown>) => {
      updates.push(value);
      return { eq: vi.fn(async () => ({ error: null })) };
    }),
  }));
  return {
    updates,
    value: {
      courseId: '20000000-0000-4000-8000-000000000001',
      organizationId: '30000000-0000-4000-8000-000000000001',
      input: { topic: 'Policy', language: 'en' },
      supabase: { from },
      phase1Output: { course_category: { primary: 'policy' } },
      resolvedDocumentSummaries: [],
      documentEvidenceDecisions: {
        pauseRequired: true,
        requiredQuestionIds: ['80000000-0000-4000-8000-000000000001'],
        currentDecisionIds: [],
        unresolvedInformationalConflictIds: [],
      },
      orchestrationLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
    } as unknown as AnalysisContext,
  };
}

describe('document evidence Phase 0.5 boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAnsweredQuestions.mockResolvedValue([]);
  });

  it.each([
    { enabled: false, skipped: false },
    { enabled: true, skipped: true },
  ])(
    'persists clarifying status before interrupt when ordinary questions are $enabled/$skipped',
    async config => {
      mocks.getClarifyingConfig.mockResolvedValue({ ...config, isAutomatic: false });
      mocks.getPendingQuestions.mockResolvedValue([
        {
          id: '80000000-0000-4000-8000-000000000001',
          question_priority: 'important',
          question_category: 'document_conflicts',
        },
      ]);
      const testContext = context();
      await expect(runClarifyingPhase(testContext.value)).rejects.toBeInstanceOf(
        ClarifyingQuestionsInterrupt
      );
      expect(testContext.updates).toHaveLength(1);
      expect(testContext.updates[0]).toMatchObject({
        generation_status: 'stage_4_clarifying',
        generation_progress: expect.objectContaining({ percentage: 27 }),
      });
      expect(
        String((testContext.updates[0].generation_progress as Record<string, unknown>).message)
      ).toMatch(/answer|ответ/iu);
    }
  );

  it('keeps disabled no-conflict/no-document behavior unchanged', async () => {
    mocks.getClarifyingConfig.mockResolvedValue({
      enabled: false,
      skipped: false,
      isAutomatic: false,
    });
    const testContext = context();
    testContext.value.documentEvidenceDecisions = undefined;
    await expect(runClarifyingPhase(testContext.value)).resolves.toBeUndefined();
    expect(testContext.updates).toEqual([]);
    expect(mocks.getPendingQuestions).not.toHaveBeenCalled();
  });
});
