import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: () => ({ rpc: mocks.rpc }),
}));

vi.mock('@/shared/logger/index.js', () => ({
  logger: { error: mocks.loggerError },
}));

import { persistDocumentEvidenceAnswersAtomic } from '@/server/routers/clarifying-helpers';

const answer = {
  questionId: '80000000-0000-4000-8000-000000000001',
  subjectKey: 'sha256:subject-a',
  answer: 'Continue',
  answerSource: 'suggested' as const,
  selectedSuggestionIndex: 0,
};

describe('document evidence answer RPC adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps SQLSTATE 40001 to a retryable TRPC conflict', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '40001' } });
    await expect(
      persistDocumentEvidenceAnswersAtomic({
        courseId: '20000000-0000-4000-8000-000000000001',
        actorUserId: '50000000-0000-4000-8000-000000000001',
        answers: [answer],
        requestId: 'request-1',
      })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('binds idempotency identity to course, subject and authenticated actor', async () => {
    mocks.rpc.mockResolvedValue({
      data: { answered_question_ids: [answer.questionId] },
      error: null,
    });
    const base = {
      courseId: '20000000-0000-4000-8000-000000000001',
      answers: [answer],
      requestId: 'request-2',
    };
    await persistDocumentEvidenceAnswersAtomic({
      ...base,
      actorUserId: '50000000-0000-4000-8000-000000000001',
    });
    await persistDocumentEvidenceAnswersAtomic({
      ...base,
      actorUserId: '50000000-0000-4000-8000-000000000002',
    });
    await persistDocumentEvidenceAnswersAtomic({
      ...base,
      actorUserId: '50000000-0000-4000-8000-000000000001',
      answers: [{ ...answer, subjectKey: 'sha256:subject-b' }],
    });
    const keys = mocks.rpc.mock.calls.map(([, args]) => args.p_answers[0].idempotency_key);
    expect(new Set(keys).size).toBe(3);
  });
});
