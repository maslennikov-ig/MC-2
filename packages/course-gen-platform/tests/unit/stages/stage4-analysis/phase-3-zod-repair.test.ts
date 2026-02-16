/**
 * Unit tests for Phase 3 Zod validation → UnifiedRegenerator repair path
 *
 * Tests the critical path where:
 * 1. LLM returns valid JSON
 * 2. JSON parses successfully
 * 3. Zod validation fails (e.g., missing pedagogical_strategy field)
 * 4. UnifiedRegenerator is invoked with Zod error context
 * 5. Repair either succeeds or fails with descriptive error
 *
 * Key code path tested: phase-3-expert.ts lines 259-302
 *
 * @module phase-3-zod-repair.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runPhase3Expert } from '@/stages/stage4-analysis/phases/phase-3-expert';
import type { Phase3Input } from '@/stages/stage4-analysis/phases/phase-3-expert';
import type { Phase1Output, Phase2Output } from '@megacampus/shared-types/analysis-result';

// ============================================================================
// MOCKS
// ============================================================================

// Mock getModelForPhase to return a mock model
vi.mock('@/shared/llm/langchain-models', async importOriginal => {
  const actual = await importOriginal<typeof import('@/shared/llm/langchain-models')>();
  return {
    ...actual,
    getModelForPhase: vi.fn().mockResolvedValue({
      model: 'openai/gpt-oss-20b',
      invoke: vi.fn(),
    }),
    getTextContent: vi.fn((content: any) => {
      if (typeof content === 'string') return content;
      return JSON.stringify(content);
    }),
  };
});

// Mock observability utilities
vi.mock('@/stages/stage4-analysis/utils/observability', () => ({
  trackPhaseExecution: vi.fn().mockImplementation(async (_phase, _courseId, _modelId, fn) => {
    const result = await fn();
    return result.result;
  }),
  storeTraceData: vi.fn(),
}));

// Mock research flag detector
vi.mock('@/stages/stage4-analysis/utils/research-flag-detector', () => ({
  detectResearchFlags: vi.fn().mockResolvedValue([]),
}));

// Mock UnifiedRegenerator - critical for testing Zod repair path
// Must use function() syntax (not arrow) because it's called with `new`
const mockRegenerate = vi.fn();
vi.mock('@/shared/regeneration', () => ({
  UnifiedRegenerator: vi.fn().mockImplementation(function () {
    return {
      regenerate: mockRegenerate,
    };
  }),
}));

// Mock JSON repair utilities
vi.mock('@/shared/utils/json-repair', () => ({
  extractJSON: vi.fn((input: string) => input),
}));

// Mock preprocessing utilities
vi.mock('@/shared/validation/preprocessing', () => ({
  preprocessObject: vi.fn((obj: any) => obj),
}));

// Mock prompt service
vi.mock('@/shared/prompts/prompt-service', () => ({
  createPromptService: vi.fn(() => ({
    renderPrompt: vi.fn().mockReturnValue('Mock prompt text'),
  })),
}));

// Mock zod-to-prompt-schema
vi.mock('@/shared/utils/zod-to-prompt-schema', () => ({
  zodToPromptSchema: vi.fn(() => 'mock schema'),
}));

// Mock logger
vi.mock('@/shared/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ============================================================================
// TEST DATA
// ============================================================================

const mockPhase1Output: Phase1Output = {
  course_category: {
    primary: 'professional',
    confidence: 0.9,
    reasoning: 'Technical professional development',
    secondary: null,
  },
  contextual_language: {
    why_matters_context: 'Career advancement in technology sector',
    motivators: 'Increased earning potential and job security in competitive tech market',
    experience_prompt: 'Workplace challenges and professional growth opportunities',
    problem_statement_context: 'Skills gap affecting career progression',
    knowledge_bridge: 'Practical application in professional roles',
    practical_benefit_focus: 'Immediate job applicability',
  },
  topic_analysis: {
    determined_topic: 'TypeScript',
    information_completeness: 80,
    complexity: 'medium',
    reasoning: 'Well-defined technical topic',
    target_audience: 'intermediate',
    missing_elements: null,
    key_concepts: ['typing', 'interfaces', 'generics'],
    domain_keywords: ['typescript', 'javascript', 'static-typing'],
  },
  phase_metadata: {
    duration_ms: 5000,
    model_used: 'openai/gpt-oss-20b',
    tokens: { input: 1000, output: 500, total: 1500 },
    quality_score: 0.0,
    retry_count: 0,
  },
};

const mockPhase2Output: Phase2Output = {
  recommended_structure: {
    total_lessons: 10,
    total_sections: 3,
    estimated_content_hours: 5,
    lesson_duration_minutes: 20,
    pacing_strategy: 'balanced',
    section_breakdown: [
      {
        section_index: 1,
        section_title: 'Introduction to TypeScript',
        lesson_count: 3,
        estimated_hours: 1.5,
      },
      {
        section_index: 2,
        section_title: 'Advanced Types',
        lesson_count: 4,
        estimated_hours: 2,
      },
      {
        section_index: 3,
        section_title: 'Real-world Applications',
        lesson_count: 3,
        estimated_hours: 1.5,
      },
    ],
  },
  phase_metadata: {
    duration_ms: 3000,
    model_used: 'openai/gpt-oss-20b',
    tokens: { input: 800, output: 400, total: 1200 },
    quality_score: 0.0,
    retry_count: 0,
  },
};

const mockPhase3Input: Phase3Input = {
  course_id: '550e8400-e29b-41d4-a716-446655440000',
  language: 'en',
  topic: 'TypeScript Programming',
  document_summaries: [],
  phase1_output: mockPhase1Output,
  phase2_output: mockPhase2Output,
};

// ============================================================================
// TESTS
// ============================================================================

describe('Phase 3 Zod validation → UnifiedRegenerator repair path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Main repair path: valid JSON but missing pedagogical_strategy', () => {
    it('should invoke UnifiedRegenerator when Zod validation fails', async () => {
      const { getModelForPhase } = await import('@/shared/llm/langchain-models');
      const { UnifiedRegenerator } = await import('@/shared/regeneration');

      // LLM returns valid JSON but missing pedagogical_strategy field
      const invalidOutput = JSON.stringify({
        invalid_field: 'some value',
        // pedagogical_strategy missing - Zod will reject this
      });

      const mockModel = {
        model: 'openai/gpt-oss-20b',
        invoke: vi.fn().mockResolvedValue({
          content: invalidOutput,
          response_metadata: {
            usage: { input_tokens: 1000, output_tokens: 500 },
          },
        }),
      };
      vi.mocked(getModelForPhase).mockResolvedValue(mockModel as any);

      // Mock UnifiedRegenerator to return repaired output
      mockRegenerate.mockResolvedValue({
        success: true,
        data: {
          pedagogical_strategy: {
            assessment_approach:
              'Learners demonstrate understanding through coding exercises and projects',
            progression_logic:
              'Start with basic type annotations, gradually introduce advanced concepts like generics and conditional types, culminating in real-world application patterns',
          },
        },
        metadata: {
          layerUsed: 'critique-revise',
          retryCount: 1,
          modelsUsed: ['openai/gpt-oss-20b'],
        },
      });

      const result = await runPhase3Expert(mockPhase3Input);

      // Verify UnifiedRegenerator was called
      expect(UnifiedRegenerator).toHaveBeenCalledWith(
        expect.objectContaining({
          enabledLayers: expect.arrayContaining([
            'auto-repair',
            'critique-revise',
            'partial-regen',
            'model-escalation',
            'emergency',
          ]),
          maxRetries: 3,
          schema: expect.anything(),
          model: mockModel,
          metricsTracking: true,
          stage: 'analyze',
          courseId: mockPhase3Input.course_id,
          phaseId: 'stage_4_expert',
          allowWarningFallback: true,
        })
      );

      // Verify regenerate was called with Zod error context
      expect(mockRegenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          rawOutput: invalidOutput,
          originalPrompt: 'Mock prompt text',
          parseError: expect.stringContaining('Zod validation failed'),
        })
      );

      // Verify successful repair returns valid Phase3Output
      expect(result).toBeDefined();
      expect(result.pedagogical_strategy).toBeDefined();
      expect(result.pedagogical_strategy.assessment_approach).toBeTruthy();
      expect(result.pedagogical_strategy.progression_logic).toBeTruthy();
    });

    it('should pass Zod validation error details to UnifiedRegenerator', async () => {
      const { getModelForPhase } = await import('@/shared/llm/langchain-models');

      // LLM returns valid JSON with pedagogical_strategy but assessment_approach too short
      const invalidOutput = JSON.stringify({
        pedagogical_strategy: {
          assessment_approach: 'Too short', // min(50) - will fail Zod
          progression_logic:
            'Start with basics, progress to advanced topics, finish with real-world applications',
        },
      });

      const mockModel = {
        model: 'openai/gpt-oss-20b',
        invoke: vi.fn().mockResolvedValue({
          content: invalidOutput,
          response_metadata: {
            usage: { input_tokens: 1000, output_tokens: 500 },
          },
        }),
      };
      vi.mocked(getModelForPhase).mockResolvedValue(mockModel as any);

      // Mock UnifiedRegenerator to return repaired output
      mockRegenerate.mockResolvedValue({
        success: true,
        data: {
          pedagogical_strategy: {
            assessment_approach:
              'Learners demonstrate understanding through hands-on coding exercises, quizzes, and project-based assessments',
            progression_logic:
              'Start with basic type annotations, gradually introduce advanced concepts like generics and conditional types, culminating in real-world application patterns',
          },
        },
        metadata: {
          layerUsed: 'auto-repair',
          retryCount: 0,
          modelsUsed: ['openai/gpt-oss-20b'],
        },
      });

      await runPhase3Expert(mockPhase3Input);

      // Verify parseError contains Zod validation details
      expect(mockRegenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          parseError: expect.stringContaining('Zod validation failed'),
        })
      );

      const parseErrorArg = mockRegenerate.mock.calls[0][0].parseError;
      // Should contain structured error information
      expect(parseErrorArg).toBeTruthy();
    });
  });

  describe('Success path: UnifiedRegenerator repairs the output', () => {
    it('should return valid Phase3Output when repair succeeds', async () => {
      const { getModelForPhase } = await import('@/shared/llm/langchain-models');

      // Invalid output missing pedagogical_strategy
      const invalidOutput = JSON.stringify({
        some_field: 'value',
      });

      const mockModel = {
        model: 'openai/gpt-oss-20b',
        invoke: vi.fn().mockResolvedValue({
          content: invalidOutput,
          response_metadata: {
            usage: { input_tokens: 1000, output_tokens: 500 },
          },
        }),
      };
      vi.mocked(getModelForPhase).mockResolvedValue(mockModel as any);

      // Mock successful repair
      mockRegenerate.mockResolvedValue({
        success: true,
        data: {
          pedagogical_strategy: {
            assessment_approach:
              'Students complete coding challenges and build projects to demonstrate mastery',
            progression_logic:
              'Begin with fundamental TypeScript syntax, advance through type system features, and conclude with advanced patterns and real-world integration techniques',
          },
        },
        metadata: {
          layerUsed: 'partial-regen',
          retryCount: 1,
          modelsUsed: ['openai/gpt-oss-20b'],
        },
      });

      const result = await runPhase3Expert(mockPhase3Input);

      expect(result).toBeDefined();
      expect(result.pedagogical_strategy).toBeDefined();
      expect(result.pedagogical_strategy.assessment_approach.length).toBeGreaterThanOrEqual(50);
      expect(result.pedagogical_strategy.progression_logic.length).toBeGreaterThanOrEqual(100);
      expect(result.research_flags).toBeDefined();
      expect(result.phase_metadata).toBeDefined();
      expect(result.phase_metadata.model_used).toBe('openai/gpt-oss-20b');
    });

    it('should validate repaired output against Phase3OutputSchema', async () => {
      const { getModelForPhase } = await import('@/shared/llm/langchain-models');

      const invalidOutput = JSON.stringify({});

      const mockModel = {
        model: 'openai/gpt-oss-20b',
        invoke: vi.fn().mockResolvedValue({
          content: invalidOutput,
          response_metadata: {
            usage: { input_tokens: 1000, output_tokens: 500 },
          },
        }),
      };
      vi.mocked(getModelForPhase).mockResolvedValue(mockModel as any);

      // UnifiedRegenerator returns valid output
      mockRegenerate.mockResolvedValue({
        success: true,
        data: {
          pedagogical_strategy: {
            assessment_approach: 'A'.repeat(60), // Valid: min(50)
            progression_logic: 'B'.repeat(120), // Valid: min(100)
          },
        },
        metadata: {
          layerUsed: 'auto-repair',
          retryCount: 0,
          modelsUsed: ['openai/gpt-oss-20b'],
        },
      });

      const result = await runPhase3Expert(mockPhase3Input);

      // Should pass final Zod validation
      expect(result.pedagogical_strategy.assessment_approach).toBeTruthy();
      expect(result.pedagogical_strategy.progression_logic).toBeTruthy();
    });
  });

  describe('Failure path: UnifiedRegenerator also fails', () => {
    it('should throw descriptive error when UnifiedRegenerator fails', async () => {
      const { getModelForPhase } = await import('@/shared/llm/langchain-models');

      const invalidOutput = JSON.stringify({
        missing_required_field: 'value',
      });

      const mockModel = {
        model: 'openai/gpt-oss-20b',
        invoke: vi.fn().mockResolvedValue({
          content: invalidOutput,
          response_metadata: {
            usage: { input_tokens: 1000, output_tokens: 500 },
          },
        }),
      };
      vi.mocked(getModelForPhase).mockResolvedValue(mockModel as any);

      // UnifiedRegenerator fails to repair
      mockRegenerate.mockResolvedValue({
        success: false,
        error: 'All regeneration layers exhausted: schema validation failed',
        metadata: {
          layerUsed: 'emergency',
          retryCount: 3,
          modelsUsed: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'gemini-2.0-flash-exp'],
        },
      });

      await expect(runPhase3Expert(mockPhase3Input)).rejects.toThrow(
        /Phase 3 validation failed after repair/
      );
      await expect(runPhase3Expert(mockPhase3Input)).rejects.toThrow(
        /All regeneration layers exhausted/
      );
    });

    it('should include error details in thrown error message', async () => {
      const { getModelForPhase } = await import('@/shared/llm/langchain-models');

      const invalidOutput = JSON.stringify({});

      const mockModel = {
        model: 'openai/gpt-oss-20b',
        invoke: vi.fn().mockResolvedValue({
          content: invalidOutput,
          response_metadata: {
            usage: { input_tokens: 1000, output_tokens: 500 },
          },
        }),
      };
      vi.mocked(getModelForPhase).mockResolvedValue(mockModel as any);

      mockRegenerate.mockResolvedValue({
        success: false,
        error: 'Custom repair failure: field pedagogical_strategy unrepairable',
        metadata: {
          layerUsed: 'partial-regen',
          retryCount: 2,
          modelsUsed: ['openai/gpt-oss-20b'],
        },
      });

      await expect(runPhase3Expert(mockPhase3Input)).rejects.toThrow(
        'Phase 3 validation failed after repair: Custom repair failure: field pedagogical_strategy unrepairable'
      );
    });
  });

  describe('Logger integration', () => {
    it('should log warning when routing to UnifiedRegenerator', async () => {
      const { getModelForPhase } = await import('@/shared/llm/langchain-models');
      const { logger } = await import('@/shared/logger');

      const invalidOutput = JSON.stringify({});

      const mockModel = {
        model: 'openai/gpt-oss-20b',
        invoke: vi.fn().mockResolvedValue({
          content: invalidOutput,
          response_metadata: {
            usage: { input_tokens: 1000, output_tokens: 500 },
          },
        }),
      };
      vi.mocked(getModelForPhase).mockResolvedValue(mockModel as any);

      mockRegenerate.mockResolvedValue({
        success: true,
        data: {
          pedagogical_strategy: {
            assessment_approach: 'A'.repeat(60),
            progression_logic: 'B'.repeat(120),
          },
        },
        metadata: {
          layerUsed: 'auto-repair',
          retryCount: 0,
          modelsUsed: ['openai/gpt-oss-20b'],
        },
      });

      await runPhase3Expert(mockPhase3Input);

      // Verify logger.warn was called with Zod validation failure context
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'phase-3-expert',
          errors: expect.anything(),
        }),
        'Zod validation failed, routing through UnifiedRegenerator'
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle valid output on first attempt (no repair needed)', async () => {
      const { getModelForPhase } = await import('@/shared/llm/langchain-models');
      const { UnifiedRegenerator } = await import('@/shared/regeneration');

      // Valid output from the start
      const validOutput = JSON.stringify({
        pedagogical_strategy: {
          assessment_approach:
            'Learners demonstrate mastery through practical coding exercises and projects',
          progression_logic:
            'Start with TypeScript fundamentals, introduce intermediate type system concepts, advance to generics and advanced patterns, culminate with real-world application integration',
        },
      });

      const mockModel = {
        model: 'openai/gpt-oss-20b',
        invoke: vi.fn().mockResolvedValue({
          content: validOutput,
          response_metadata: {
            usage: { input_tokens: 1000, output_tokens: 500 },
          },
        }),
      };
      vi.mocked(getModelForPhase).mockResolvedValue(mockModel as any);

      const result = await runPhase3Expert(mockPhase3Input);

      // UnifiedRegenerator should NOT be called when output is valid
      expect(UnifiedRegenerator).not.toHaveBeenCalled();
      expect(mockRegenerate).not.toHaveBeenCalled();

      expect(result).toBeDefined();
      expect(result.pedagogical_strategy).toBeDefined();
    });

    it('should handle UnifiedRegenerator returning data that still fails Zod', async () => {
      const { getModelForPhase } = await import('@/shared/llm/langchain-models');

      const invalidOutput = JSON.stringify({});

      const mockModel = {
        model: 'openai/gpt-oss-20b',
        invoke: vi.fn().mockResolvedValue({
          content: invalidOutput,
          response_metadata: {
            usage: { input_tokens: 1000, output_tokens: 500 },
          },
        }),
      };
      vi.mocked(getModelForPhase).mockResolvedValue(mockModel as any);

      // UnifiedRegenerator returns success but data still invalid for Zod
      mockRegenerate.mockResolvedValue({
        success: true,
        data: {
          pedagogical_strategy: {
            assessment_approach: 'Too short', // Fails min(50)
            progression_logic: 'Also too short', // Fails min(100)
          },
        },
        metadata: {
          layerUsed: 'auto-repair',
          retryCount: 0,
          modelsUsed: ['openai/gpt-oss-20b'],
        },
      });

      // Should throw because repaired data still fails Zod validation
      await expect(runPhase3Expert(mockPhase3Input)).rejects.toThrow();
    });
  });
});
