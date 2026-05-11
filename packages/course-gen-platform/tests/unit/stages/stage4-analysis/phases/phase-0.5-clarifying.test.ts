import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as clarifyingPhase from '@/stages/stage4-analysis/phases/phase-0.5-clarifying';
import { getModelForPhase, getTextContent } from '@/shared/llm/langchain-models';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { safeJSONParse } from '@megacampus/shared-utils';
import { logTrace } from '@/shared/trace-logger';

// ---- MOCKS ----
vi.mock('@/shared/llm/langchain-models', () => ({
  getModelForPhase: vi.fn(),
  getTextContent: vi.fn(),
}));

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock('@/shared/trace-logger', () => ({ logTrace: vi.fn() }));
vi.mock('@/shared/logger', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => mockLogger),
  };
  return { default: mockLogger };
});

vi.mock('@megacampus/shared-utils', async importOriginal => {
  const actual = await importOriginal<typeof import('@megacampus/shared-utils')>();
  return {
    ...actual,
    safeJSONParse: vi.fn(),
  };
});

const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  single: vi.fn().mockReturnThis(),
  rpc: vi.fn(),
};

const mockModel = {
  invoke: vi.fn(),
  model: 'test-model',
};

const baseInput = {
  course_id: '123e4567-e89b-12d3-a456-426614174000',
  budgetAllocation: {
    documents: [],
    breakdown: {
      core: { count: 1, tokens: 100 },
      important: { count: 0, fullTextCount: 0, summaryCount: 0 },
      supplementary: { count: 0 },
    },
    totalTokens: 100,
    modelSelection: { maxContext: 260000, tier: 'standard' },
  },
  courseContext: { title: 'Test Course', target_audience: 'devs' },
  language: 'en',
  document_summaries: [{ file_name: 'doc.txt', processed_content: 'content' }],
  phase1_output: {
    course_category: { primary: 'Tech', confidence: 0.9 },
    topic_analysis: {
      complexity: 'Medium',
      information_completeness: 60,
      key_concepts: ['A'],
      missing_elements: ['B'],
    },
  },
};

const validOutput = {
  questions: [
    {
      question_text: 'What is your main goal?',
      question_type: 'open',
      question_priority: 'critical',
      question_category: 'expected_outcomes',
      suggested_answers: [
        { text: 'Learn fast', rationale: 'Because it saves time', is_recommended: true },
        { text: 'Learn deep', rationale: 'Because it builds expertise', is_recommended: false },
      ],
    },
    {
      question_text: 'What is your audience size?',
      question_type: 'single_choice',
      question_priority: 'important',
      question_category: 'audience',
      suggested_answers: [
        { text: '1-10 users', rationale: 'Small group' },
        { text: '10-100 users', rationale: 'Medium group' },
      ],
    },
    {
      question_text: 'What formats do you prefer?',
      question_type: 'multi_choice',
      question_priority: 'nice_to_have',
      question_category: 'content_structure',
      suggested_answers: [
        { text: 'Video format', rationale: 'Visual' },
        { text: 'Audio format', rationale: 'Auditory' },
        { text: 'Text format', rationale: 'Reading' },
      ],
    },
  ],
};

describe('Phase 0.5: Clarifying Questions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getSupabaseAdmin as any).mockReturnValue(mockSupabase);
    (getModelForPhase as any).mockResolvedValue(mockModel);
    (getTextContent as any).mockReturnValue('{"questions":[]}');
    (safeJSONParse as any).mockReturnValue(validOutput);
    mockModel.invoke.mockResolvedValue({ content: '{"questions":[]}' });
    mockSupabase.insert.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('runPhase05Clarifying', () => {
    it('throws if input is invalid', async () => {
      await expect(
        clarifyingPhase.runPhase05Clarifying({ ...baseInput, language: '' } as any)
      ).rejects.toThrow('Invalid Phase 0.5 input');
    });

    it('generates, parses, validates, and stores questions successfully', async () => {
      mockModel.invoke.mockResolvedValueOnce({ content: 'response' });
      const result = await clarifyingPhase.runPhase05Clarifying(baseInput as any);

      expect(result).toHaveProperty('questions');
      expect(result.questions).toHaveLength(3);
      expect(mockModel.invoke).toHaveBeenCalled();
      expect(safeJSONParse).toHaveBeenCalled();

      // Store questions called
      expect(mockSupabase.insert).toHaveBeenCalledTimes(1);
    });

    it('handles LLM timeout using abort signal', async () => {
      vi.useFakeTimers();

      mockModel.invoke.mockImplementationOnce(async (messages: any, { signal }: any) => {
        return new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('AbortError')));
          // never resolves
        });
      });

      const promise = clarifyingPhase.runPhase05Clarifying(baseInput as any);
      promise.catch(() => {}); // Prevent unhandled rejection warning
      await vi.advanceTimersByTimeAsync(clarifyingPhase.LLM_CLARIFYING_TIMEOUT_MS + 100);

      await expect(promise).rejects.toThrow('AbortError');
    });

    it('handles JSON parsing / validation failures', async () => {
      (safeJSONParse as any).mockImplementationOnce(() => {
        throw new Error('Parse err');
      });
      await expect(clarifyingPhase.runPhase05Clarifying(baseInput as any)).rejects.toThrow(
        'JSON parsing failed: Parse err'
      );

      // Schema validation fail (too few questions)
      (safeJSONParse as any).mockReturnValueOnce({ questions: [] });
      await expect(clarifyingPhase.runPhase05Clarifying(baseInput as any)).rejects.toThrow(
        'Validation failed'
      );
    });

    it('logs offending short suggested-answer metadata before throwing on validation failure', async () => {
      (safeJSONParse as any).mockReturnValueOnce({
        questions: [
          {
            ...validOutput.questions[0],
            suggested_answers: [
              { text: 'No', rationale: 'Too short answer text', is_recommended: true },
              validOutput.questions[0].suggested_answers[1],
            ],
          },
          validOutput.questions[1],
          validOutput.questions[2],
        ],
      });

      await expect(clarifyingPhase.runPhase05Clarifying(baseInput as any)).rejects.toThrow(
        'Validation failed'
      );

      expect(logTrace).toHaveBeenCalledWith(
        expect.objectContaining({
          stepName: 'validation_failure',
          errorData: expect.objectContaining({
            offendingValue: expect.objectContaining({
              path: 'questions[0].suggested_answers[0].text',
              index: 0,
              length: 2,
              snippet: 'No',
            }),
          }),
        })
      );
    });

    it('filters out malformed questions robustly', async () => {
      (safeJSONParse as any).mockReturnValueOnce({
        questions: [
          ...validOutput.questions,
          { question_text: 'Bad suggestions count', suggested_answers: [{ text: 'One' }] }, // Filtered out
          null, // Filtered out
          { suggested_answers: [] }, // Filtered out
        ],
      });
      const result = await clarifyingPhase.runPhase05Clarifying(baseInput as any);
      expect(result.questions).toHaveLength(3); // The bad ones were stripped, leaving the valid 3
    });
  });

  describe('Database Query Helpers', () => {
    it('getPendingQuestions', async () => {
      mockSupabase.order.mockResolvedValueOnce({ data: [{ id: 1 }], error: null });
      const q = await clarifyingPhase.getPendingQuestions('c-1');
      expect(q).toHaveLength(1);
      expect(mockSupabase.from).toHaveBeenCalledWith('clarifying_questions');
      expect(mockSupabase.eq).toHaveBeenCalledWith('status', 'pending');
    });

    it('getAnsweredQuestions', async () => {
      mockSupabase.order.mockResolvedValueOnce({ data: [{ id: 2 }], error: null });
      const q = await clarifyingPhase.getAnsweredQuestions('c-1');
      expect(q).toHaveLength(1);
      expect(mockSupabase.eq).toHaveBeenCalledWith('status', 'answered');
    });

    it('getClarifyingConfig', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          settings: { clarifying_questions_enabled: true, clarifying_questions_skipped: false },
          generation_mode: 'automatic',
        },
        error: null,
      });
      const cfg = await clarifyingPhase.getClarifyingConfig('c-1');
      expect(cfg.enabled).toBe(true);
      expect(cfg.skipped).toBe(false);
      expect(cfg.isAutomatic).toBe(true);

      // Error fallback
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: new Error('Db') });
      const cfgErr = await clarifyingPhase.getClarifyingConfig('c-1');
      expect(cfgErr.enabled).toBe(false);
    });

    it('autoAnswerAllQuestions', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: { success: true, updated_count: 5, fallback_count: 0, total_pending: 0 },
        error: null,
      });
      const count = await clarifyingPhase.autoAnswerAllQuestions('c-1');
      expect(count).toBe(5);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('auto_answer_questions_atomic', {
        p_course_id: 'c-1',
      });

      // Error handling
      mockSupabase.rpc.mockResolvedValueOnce({ error: { message: 'db error', code: '500' } });
      await expect(clarifyingPhase.autoAnswerAllQuestions('c-1')).rejects.toThrow(
        'Failed to auto-answer questions'
      );
    });
  });

  describe('analyzeSufficiency', () => {
    it('returns valid sufficiency verdict and truncates followups', async () => {
      const mockResult = {
        is_sufficient: false,
        confidence: 0.8,
        gaps: ['gap1'],
        follow_up_questions: Array(15).fill({
          question_text: 'Valid long question text',
          suggested_answers: [
            { text: 'answer A1', rationale: 'Why A1' },
            { text: 'answer B2', rationale: 'Why B2' },
          ],
          question_priority: 'critical',
          question_type: 'open',
          question_category: 'audience',
        }),
      };
      (safeJSONParse as any).mockReturnValueOnce(mockResult);

      const res = await clarifyingPhase.analyzeSufficiency(baseInput as any, [], 2);

      // Override to sufficient because confidence >= 0.6
      expect(res.is_sufficient).toBe(true);
      expect(res.follow_up_questions).toBeUndefined();

      // Test truncation on round 2 max 10
      (safeJSONParse as any).mockReturnValueOnce({
        ...mockResult,
        confidence: 0.4, // Won't override
      });
      const res2 = await clarifyingPhase.analyzeSufficiency(baseInput as any, [], 2);
      expect(res2.is_sufficient).toBe(false);
      expect(res2.follow_up_questions).toHaveLength(10); // Truncated from 15

      // Test truncation on round 1 max 20
      (safeJSONParse as any).mockReturnValueOnce({
        ...mockResult,
        confidence: 0.4,
        follow_up_questions: Array(25).fill({
          question_text: 'Valid long question text',
          suggested_answers: [
            { text: 'answer A1', rationale: 'Why A1' },
            { text: 'answer B2', rationale: 'Why B2' },
          ],
          question_priority: 'critical',
          question_type: 'open',
          question_category: 'audience',
        }),
      });
      const res3 = await clarifyingPhase.analyzeSufficiency(baseInput as any, [], 1);
      expect(res3.follow_up_questions).toHaveLength(20); // Truncated from 25
    });

    it('falls back to default true if parse errors', async () => {
      (safeJSONParse as any).mockImplementationOnce(() => {
        throw new Error('parse error');
      });
      const res = await clarifyingPhase.analyzeSufficiency(
        baseInput as any,
        [{ question: 'q', answer: 'a', category: 'c' }],
        1
      );
      expect(res.is_sufficient).toBe(true);
      expect(res.confidence).toBe(0.3);
      expect(res.gaps[0]).toContain('Parse failure');
    });
  });

  describe('extractAnswerString', () => {
    it('handles different formats', () => {
      expect(clarifyingPhase.extractAnswerString('basic string')).toBe('basic string');
      expect(clarifyingPhase.extractAnswerString({ value: 'val' })).toBe('val');
      expect(clarifyingPhase.extractAnswerString({ values: ['val1', 'val2'] })).toBe('val1, val2');
      expect(clarifyingPhase.extractAnswerString(null)).toBe('');
    });
  });
});
