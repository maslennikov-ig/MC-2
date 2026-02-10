/**
 * Unit tests for Phase 0.5 Clarifying Questions
 *
 * Tests coverage:
 * - analyzeSufficiency: sufficient/insufficient verdicts, JSON parse failure, Zod validation, CRITICAL-002, HIGH-003
 * - storeQuestions: insert with iteration_round, empty array, Supabase error
 * - Category validation: 8 valid categories, reject invalid
 *
 * @module phase-05-clarifying.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  analyzeSufficiency,
  storeQuestions,
  ClarifyingQuestionSchema,
} from '@/stages/stage4-analysis/phases/phase-0.5-clarifying';
import type { Phase05Input } from '@/stages/stage4-analysis/phases/phase-0.5-clarifying';

// ============================================================================
// MOCKS
// ============================================================================

// Mock LLM service - match pattern from phase-1-classifier.test.ts
vi.mock('@/shared/llm/langchain-models', async importOriginal => {
  const actual = await importOriginal<typeof import('@/shared/llm/langchain-models')>();
  return {
    ...actual,
    getModelForPhase: vi.fn().mockResolvedValue({
      model: 'openai/gpt-oss-20b',
      invoke: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          is_sufficient: true,
          confidence: 0.85,
          gaps: [],
          follow_up_questions: [],
        }),
      }),
    }),
    getTextContent: vi.fn((content: any) => {
      if (typeof content === 'string') return content;
      return JSON.stringify(content);
    }),
  };
});

// Mock Supabase admin client
vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  }),
}));

// Mock trace logger
vi.mock('@/shared/trace-logger', () => ({
  logTrace: vi.fn().mockResolvedValue(undefined),
}));

// Mock JSON repair (default: pass-through to JSON.parse)
vi.mock('@/shared/utils/json-repair', () => ({
  safeJSONParse: vi.fn((input: string) => JSON.parse(input)),
}));

// Mock logger to suppress output
vi.mock('@/shared/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

// ============================================================================
// TEST DATA
// ============================================================================

const mockPhase05Input: Phase05Input = {
  course_id: '550e8400-e29b-41d4-a716-446655440000',
  budgetAllocation: null,
  courseContext: {
    title: 'Test Course',
    description: 'Test description',
    target_audience: 'intermediate',
  },
  language: 'en',
};

const mockAnsweredQuestions = [
  {
    question: 'What is the target audience?',
    answer: 'Intermediate developers',
    category: 'audience',
  },
  {
    question: 'What are the expected outcomes?',
    answer: 'Build production-ready applications',
    category: 'expected_outcomes',
  },
];

// ============================================================================
// TESTS
// ============================================================================

describe('Phase 0.5 Clarifying - analyzeSufficiency', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Restore default mock implementations (parse failure tests override safeJSONParse)
    const { safeJSONParse } = await import('@/shared/utils/json-repair');
    vi.mocked(safeJSONParse).mockImplementation((input: string) => JSON.parse(input));
  });

  describe('sufficient verdict', () => {
    it('returns is_sufficient: true when LLM says sufficient', async () => {
      const { getModelForPhase } = await import('@/shared/llm/langchain-models');
      const mockModel = {
        model: 'openai/gpt-oss-20b',
        invoke: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            is_sufficient: true,
            confidence: 0.9,
            gaps: [],
          }),
        }),
      };
      vi.mocked(getModelForPhase).mockResolvedValue(mockModel as any);

      const result = await analyzeSufficiency(mockPhase05Input, mockAnsweredQuestions, 1);

      expect(result.is_sufficient).toBe(true);
      expect(result.confidence).toBe(0.9);
      expect(result.gaps).toEqual([]);
    });

    it('returns no follow_up_questions when sufficient', async () => {
      const { getModelForPhase } = await import('@/shared/llm/langchain-models');
      const mockModel = {
        model: 'openai/gpt-oss-20b',
        invoke: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            is_sufficient: true,
            confidence: 0.85,
            gaps: [],
            // follow_up_questions omitted (optional field)
          }),
        }),
      };
      vi.mocked(getModelForPhase).mockResolvedValue(mockModel as any);

      const result = await analyzeSufficiency(mockPhase05Input, mockAnsweredQuestions, 1);

      // When sufficient, follow_up_questions should be undefined or empty
      expect(
        result.follow_up_questions === undefined || result.follow_up_questions?.length === 0
      ).toBe(true);
    });
  });

  describe('insufficient verdict', () => {
    it('returns is_sufficient: false with follow_up_questions when gaps exist', async () => {
      const { getModelForPhase } = await import('@/shared/llm/langchain-models');
      const mockModel = {
        model: 'openai/gpt-oss-20b',
        invoke: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            is_sufficient: false,
            confidence: 0.4,
            gaps: ['Missing business goals', 'Missing constraints'],
            follow_up_questions: [
              {
                question_text: 'What are the business goals?',
                question_type: 'open',
                question_priority: 'critical',
                question_category: 'business_goals',
                suggested_answers: [
                  { text: 'Increase revenue', rationale: 'Common goal', is_recommended: true },
                  { text: 'Reduce costs', rationale: 'Alternative goal', is_recommended: false },
                ],
              },
            ],
          }),
        }),
      };
      vi.mocked(getModelForPhase).mockResolvedValue(mockModel as any);

      const result = await analyzeSufficiency(mockPhase05Input, mockAnsweredQuestions, 1);

      expect(result.is_sufficient).toBe(false);
      expect(result.confidence).toBe(0.4);
      expect(result.follow_up_questions).toBeDefined();
      expect(result.follow_up_questions?.length).toBe(1);
    });

    it('includes gaps array from LLM response', async () => {
      const { getModelForPhase } = await import('@/shared/llm/langchain-models');
      const mockModel = {
        model: 'openai/gpt-oss-20b',
        invoke: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            is_sufficient: false,
            confidence: 0.5,
            gaps: ['Missing business goals', 'Missing constraints', 'Unclear time limits'],
          }),
        }),
      };
      vi.mocked(getModelForPhase).mockResolvedValue(mockModel as any);

      const result = await analyzeSufficiency(mockPhase05Input, mockAnsweredQuestions, 1);

      expect(result.gaps).toHaveLength(3);
      expect(result.gaps).toContain('Missing business goals');
      expect(result.gaps).toContain('Missing constraints');
      expect(result.gaps).toContain('Unclear time limits');
    });
  });

  describe('JSON parse failure graceful degradation', () => {
    it('defaults to sufficient with confidence 0.3 on parse failure', async () => {
      const { getModelForPhase } = await import('@/shared/llm/langchain-models');
      const { safeJSONParse } = await import('@/shared/utils/json-repair');
      const mockModel = {
        model: 'openai/gpt-oss-20b',
        invoke: vi.fn().mockResolvedValue({
          content: 'not valid JSON at all',
        }),
      };
      vi.mocked(getModelForPhase).mockResolvedValue(mockModel as any);
      vi.mocked(safeJSONParse).mockImplementation(() => {
        throw new Error('JSON parse failed');
      });

      const result = await analyzeSufficiency(mockPhase05Input, mockAnsweredQuestions, 1);

      expect(result.is_sufficient).toBe(true);
      expect(result.confidence).toBe(0.3);
      expect(result.gaps).toContain('Parse failure - proceeding by default');
    });

    it('calls logTrace with sufficiency_parse_failure_round_N step', async () => {
      const { getModelForPhase } = await import('@/shared/llm/langchain-models');
      const { safeJSONParse } = await import('@/shared/utils/json-repair');
      const { logTrace } = await import('@/shared/trace-logger');
      const mockModel = {
        model: 'openai/gpt-oss-20b',
        invoke: vi.fn().mockResolvedValue({
          content: 'malformed JSON',
        }),
      };
      vi.mocked(getModelForPhase).mockResolvedValue(mockModel as any);
      vi.mocked(safeJSONParse).mockImplementation(() => {
        throw new Error('Parse error');
      });

      await analyzeSufficiency(mockPhase05Input, mockAnsweredQuestions, 2);

      expect(logTrace).toHaveBeenCalledWith(
        expect.objectContaining({
          stepName: 'sufficiency_parse_failure_round_2',
          errorData: expect.objectContaining({
            error: 'Parse error',
          }),
        })
      );
    });
  });

  describe('Zod validation failure', () => {
    it('defaults to sufficient on schema mismatch', async () => {
      const { getModelForPhase } = await import('@/shared/llm/langchain-models');
      const invalidJSON = JSON.stringify({
        // Missing required fields: is_sufficient, confidence, gaps
        invalid_field: 'value',
      });
      const mockModel = {
        model: 'openai/gpt-oss-20b',
        invoke: vi.fn().mockResolvedValue({
          content: invalidJSON,
        }),
      };
      vi.mocked(getModelForPhase).mockResolvedValue(mockModel as any);

      const result = await analyzeSufficiency(mockPhase05Input, mockAnsweredQuestions, 1);

      expect(result.is_sufficient).toBe(true);
      expect(result.confidence).toBe(0.3);
      expect(result.gaps).toContain('Validation failure - proceeding by default');
    });
  });

  describe('CRITICAL-002: confidence threshold', () => {
    it('overrides to sufficient when confidence >= 0.6 even if LLM says not sufficient', async () => {
      const { getModelForPhase } = await import('@/shared/llm/langchain-models');
      const responseJSON = JSON.stringify({
        is_sufficient: false,
        confidence: 0.7, // High confidence despite saying "not sufficient"
        gaps: ['Minor gap'],
        follow_up_questions: [
          {
            question_text: 'What are the time constraints?',
            question_type: 'open',
            question_priority: 'nice_to_have',
            question_category: 'constraints',
            suggested_answers: [
              { text: '1 week', rationale: 'Common timeframe', is_recommended: true },
              { text: '2 weeks', rationale: 'Alternative', is_recommended: false },
            ],
          },
        ],
      });
      const mockModel = {
        model: 'openai/gpt-oss-20b',
        invoke: vi.fn().mockResolvedValue({
          content: responseJSON,
        }),
      };
      vi.mocked(getModelForPhase).mockResolvedValue(mockModel as any);

      const result = await analyzeSufficiency(mockPhase05Input, mockAnsweredQuestions, 1);

      // CRITICAL-002: Override to sufficient when confidence >= 0.6
      expect(result.is_sufficient).toBe(true);
      expect(result.confidence).toBe(0.7);
      expect(result.follow_up_questions).toBeUndefined();
    });

    it('preserves not-sufficient when confidence < 0.6', async () => {
      const { getModelForPhase } = await import('@/shared/llm/langchain-models');
      const responseJSON = JSON.stringify({
        is_sufficient: false,
        confidence: 0.5, // Below threshold
        gaps: ['Critical gap'],
        follow_up_questions: [
          {
            question_text: 'What are the business goals?',
            question_type: 'open',
            question_priority: 'critical',
            question_category: 'business_goals',
            suggested_answers: [
              { text: 'Increase revenue', rationale: 'Common goal', is_recommended: true },
              { text: 'Reduce costs', rationale: 'Alternative', is_recommended: false },
            ],
          },
        ],
      });
      const mockModel = {
        model: 'openai/gpt-oss-20b',
        invoke: vi.fn().mockResolvedValue({
          content: responseJSON,
        }),
      };
      vi.mocked(getModelForPhase).mockResolvedValue(mockModel as any);

      const result = await analyzeSufficiency(mockPhase05Input, mockAnsweredQuestions, 1);

      expect(result.is_sufficient).toBe(false);
      expect(result.confidence).toBe(0.5);
      expect(result.follow_up_questions).toBeDefined();
    });
  });

  describe('HIGH-003: follow-up truncation', () => {
    it('truncates to max 20 in round 1', async () => {
      const { getModelForPhase } = await import('@/shared/llm/langchain-models');
      // Generate 25 follow-up questions (exceeds max 20)
      const followUpQuestions = Array.from({ length: 25 }, (_, i) => ({
        question_text: `Follow-up question ${i + 1}`,
        question_type: 'open' as const,
        question_priority: (i < 5 ? 'critical' : i < 15 ? 'important' : 'nice_to_have') as any,
        question_category: 'audience' as const,
        suggested_answers: [
          { text: 'Answer 1', rationale: 'Rationale for answer 1', is_recommended: true },
          { text: 'Answer 2', rationale: 'Rationale for answer 2', is_recommended: false },
        ],
      }));

      const responseJSON = JSON.stringify({
        is_sufficient: false,
        confidence: 0.4,
        gaps: ['Many gaps'],
        follow_up_questions: followUpQuestions,
      });
      const mockModel = {
        model: 'openai/gpt-oss-20b',
        invoke: vi.fn().mockResolvedValue({
          content: responseJSON,
        }),
      };
      vi.mocked(getModelForPhase).mockResolvedValue(mockModel as any);

      const result = await analyzeSufficiency(mockPhase05Input, mockAnsweredQuestions, 1);

      expect(result.follow_up_questions).toBeDefined();
      expect(result.follow_up_questions?.length).toBe(20); // Truncated to max
    });

    it('truncates to max 10 in round 2', async () => {
      const { getModelForPhase } = await import('@/shared/llm/langchain-models');
      // Generate 15 follow-up questions (exceeds max 10 for round 2)
      const followUpQuestions = Array.from({ length: 15 }, (_, i) => ({
        question_text: `Follow-up question ${i + 1}`,
        question_type: 'open' as const,
        question_priority: (i < 3 ? 'critical' : i < 8 ? 'important' : 'nice_to_have') as any,
        question_category: 'audience' as const,
        suggested_answers: [
          { text: 'Answer 1', rationale: 'Rationale text', is_recommended: true },
          { text: 'Answer 2', rationale: 'Rationale text', is_recommended: false },
        ],
      }));

      const responseJSON = JSON.stringify({
        is_sufficient: false,
        confidence: 0.4,
        gaps: ['Some gaps'],
        follow_up_questions: followUpQuestions,
      });
      const mockModel = {
        model: 'openai/gpt-oss-20b',
        invoke: vi.fn().mockResolvedValue({
          content: responseJSON,
        }),
      };
      vi.mocked(getModelForPhase).mockResolvedValue(mockModel as any);

      const result = await analyzeSufficiency(mockPhase05Input, mockAnsweredQuestions, 2);

      expect(result.follow_up_questions).toBeDefined();
      expect(result.follow_up_questions?.length).toBe(10); // Truncated to max for round 2
    });

    it('sorts by priority (critical first) when truncating', async () => {
      const { getModelForPhase } = await import('@/shared/llm/langchain-models');
      // Mix of priorities: critical, important, nice_to_have
      const followUpQuestions = [
        ...Array.from({ length: 5 }, (_, i) => ({
          question_text: `Nice to have ${i}`,
          question_type: 'open' as const,
          question_priority: 'nice_to_have' as const,
          question_category: 'audience' as const,
          suggested_answers: [
            { text: 'Answer', rationale: 'Rationale text', is_recommended: true },
            { text: 'Answer 2', rationale: 'Rationale text', is_recommended: false },
          ],
        })),
        ...Array.from({ length: 10 }, (_, i) => ({
          question_text: `Important ${i}`,
          question_type: 'open' as const,
          question_priority: 'important' as const,
          question_category: 'audience' as const,
          suggested_answers: [
            { text: 'Answer', rationale: 'Rationale text', is_recommended: true },
            { text: 'Answer 2', rationale: 'Rationale text', is_recommended: false },
          ],
        })),
        ...Array.from({ length: 10 }, (_, i) => ({
          question_text: `Critical ${i}`,
          question_type: 'open' as const,
          question_priority: 'critical' as const,
          question_category: 'audience' as const,
          suggested_answers: [
            { text: 'Answer', rationale: 'Rationale text', is_recommended: true },
            { text: 'Answer 2', rationale: 'Rationale text', is_recommended: false },
          ],
        })),
      ];

      const responseJSON = JSON.stringify({
        is_sufficient: false,
        confidence: 0.4,
        gaps: ['Many gaps'],
        follow_up_questions: followUpQuestions,
      });
      const mockModel = {
        model: 'openai/gpt-oss-20b',
        invoke: vi.fn().mockResolvedValue({
          content: responseJSON,
        }),
      };
      vi.mocked(getModelForPhase).mockResolvedValue(mockModel as any);

      const result = await analyzeSufficiency(mockPhase05Input, mockAnsweredQuestions, 1);

      expect(result.follow_up_questions).toBeDefined();
      expect(result.follow_up_questions?.length).toBe(20);
      // First 10 should be critical
      expect(
        result.follow_up_questions?.slice(0, 10).every(q => q.question_priority === 'critical')
      ).toBe(true);
      // Next 10 should be important
      expect(
        result.follow_up_questions?.slice(10, 20).every(q => q.question_priority === 'important')
      ).toBe(true);
    });
  });

  describe('trace logging', () => {
    it('calls logTrace with sufficiency_analysis_round_N on success', async () => {
      const { getModelForPhase } = await import('@/shared/llm/langchain-models');
      const { logTrace } = await import('@/shared/trace-logger');
      const mockModel = {
        model: 'openai/gpt-oss-20b',
        invoke: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            is_sufficient: true,
            confidence: 0.9,
            gaps: [],
          }),
        }),
      };
      vi.mocked(getModelForPhase).mockResolvedValue(mockModel as any);

      await analyzeSufficiency(mockPhase05Input, mockAnsweredQuestions, 1);

      expect(logTrace).toHaveBeenCalledWith(
        expect.objectContaining({
          courseId: mockPhase05Input.course_id,
          stage: 'stage_4',
          phase: 'stage_4_clarifying',
          stepName: 'sufficiency_analysis_round_1',
        })
      );
    });
  });
});

describe('Phase 0.5 Clarifying - storeQuestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts questions with correct iteration_round and order_index', async () => {
    const { getSupabaseAdmin } = await import('@/shared/supabase/admin');
    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: mockFrom } as any);

    const questions = [
      {
        question_text: 'What is the target audience?',
        question_type: 'open' as const,
        question_priority: 'critical' as const,
        question_category: 'audience' as const,
        suggested_answers: [
          { text: 'Beginners', rationale: 'Starting level', is_recommended: true },
          { text: 'Intermediate', rationale: 'Mid-level', is_recommended: false },
        ],
      },
      {
        question_text: 'What are the business goals?',
        question_type: 'open' as const,
        question_priority: 'important' as const,
        question_category: 'business_goals' as const,
        suggested_answers: [
          { text: 'Increase revenue', rationale: 'Common goal', is_recommended: true },
          { text: 'Reduce costs', rationale: 'Alternative', is_recommended: false },
        ],
      },
    ];

    await storeQuestions('550e8400-e29b-41d4-a716-446655440000', questions, 2);

    expect(mockFrom).toHaveBeenCalledWith('clarifying_questions');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          course_id: '550e8400-e29b-41d4-a716-446655440000',
          iteration_round: 2,
          order_index: 0,
          status: 'pending',
        }),
        expect.objectContaining({
          course_id: '550e8400-e29b-41d4-a716-446655440000',
          iteration_round: 2,
          order_index: 1,
          status: 'pending',
        }),
      ])
    );
  });

  it('handles empty array without error', async () => {
    const { getSupabaseAdmin } = await import('@/shared/supabase/admin');
    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: mockFrom } as any);

    await expect(
      storeQuestions('550e8400-e29b-41d4-a716-446655440000', [], 1)
    ).resolves.not.toThrow();

    expect(mockInsert).toHaveBeenCalledWith([]);
  });

  it('throws on Supabase insert error', async () => {
    const { getSupabaseAdmin } = await import('@/shared/supabase/admin');
    const mockInsert = vi.fn().mockResolvedValue({
      error: { message: 'Database connection failed', code: 'CONNECTION_ERROR' },
    });
    const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: mockFrom } as any);

    const questions = [
      {
        question_text: 'Test question',
        question_type: 'open' as const,
        question_priority: 'critical' as const,
        question_category: 'audience' as const,
        suggested_answers: [
          { text: 'Answer', rationale: 'Rationale text', is_recommended: true },
          { text: 'Answer 2', rationale: 'Rationale text', is_recommended: false },
        ],
      },
    ];

    await expect(
      storeQuestions('550e8400-e29b-41d4-a716-446655440000', questions, 1)
    ).rejects.toThrow('Failed to store clarifying questions: Database connection failed');
  });
});

describe('Phase 0.5 Clarifying - category validation', () => {
  it('ClarifyingQuestionSchema accepts all 8 valid categories', () => {
    const validCategories = [
      'company_context',
      'audience',
      'expected_outcomes',
      'content_structure',
      'focus_priorities',
      'business_goals',
      'practical_application',
      'constraints',
    ];

    validCategories.forEach(category => {
      const question = {
        question_text: `Test question for ${category}`,
        question_type: 'open' as const,
        question_priority: 'important' as const,
        question_category: category,
        suggested_answers: [
          { text: 'Answer 1', rationale: 'Rationale 1', is_recommended: true },
          { text: 'Answer 2', rationale: 'Rationale 2', is_recommended: false },
        ],
      };

      const result = ClarifyingQuestionSchema.safeParse(question);
      expect(result.success).toBe(true);
    });
  });

  it('rejects invalid/old categories', () => {
    const invalidCategories = [
      'invalid_category',
      'old_category',
      'technical_requirements', // Not in the enum
      'business_context', // Similar but not exact
    ];

    invalidCategories.forEach(category => {
      const question = {
        question_text: 'Test question with invalid category',
        question_type: 'open' as const,
        question_priority: 'important' as const,
        question_category: category,
        suggested_answers: [
          { text: 'Answer 1', rationale: 'Rationale 1', is_recommended: true },
          { text: 'Answer 2', rationale: 'Rationale 2', is_recommended: false },
        ],
      };

      const result = ClarifyingQuestionSchema.safeParse(question);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue => issue.path.includes('question_category'))).toBe(
          true
        );
      }
    });
  });
});
