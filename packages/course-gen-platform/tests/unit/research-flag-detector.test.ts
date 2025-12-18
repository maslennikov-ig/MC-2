/**
 * Unit tests for Research Flag Detector Utility
 *
 * Tests conservative LLM-based detection for time-sensitive content
 * that requires web research.
 *
 * Coverage:
 * - Conservative flagging logic (<5% false positive rate)
 * - Legal/regulatory content detection
 * - Technology version detection
 * - Non-flaggable timeless content
 * - Error handling and validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectResearchFlags,
  type ResearchFlagInput,
} from '../../src/orchestrator/services/analysis/research-flag-detector';
import type { ResearchFlag } from '@megacampus/shared-types/analysis-result';

// Import the modules before mocking
import { getModelForPhase } from '../../src/orchestrator/services/analysis/langchain-models';
import { trackPhaseExecution } from '../../src/orchestrator/services/analysis/langchain-observability';

// Mock the langchain-models module
vi.mock('../../src/orchestrator/services/analysis/langchain-models', () => ({
  getModelForPhase: vi.fn(),
}));

// Mock the langchain-observability module
vi.mock('../../src/orchestrator/services/analysis/langchain-observability', () => ({
  trackPhaseExecution: vi.fn(async (phaseName, courseId, modelId, callback) => {
    // Execute the callback and extract just the result (mimicking real behavior)
    const { result } = await callback();
    return result;
  }),
}));

describe('Research Flag Detector', () => {
  let mockModel: {
    invoke: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Create mock model with invoke method
    mockModel = {
      invoke: vi.fn(),
    };

    // Setup getModelForPhase to return our mock
    vi.mocked(getModelForPhase).mockResolvedValue(mockModel as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Conservative flagging logic', () => {
    it('should flag legal/regulatory content', async () => {
      const input: ResearchFlagInput = {
        topic: 'Постановление 1875 о закупках',
        course_category: 'professional',
      };

      // Mock LLM response with legal flag
      mockModel.invoke.mockResolvedValue({
        content: JSON.stringify([
          {
            topic: 'Постановление 1875',
            reason: 'regulation_updates',
            context:
              'Russian procurement law subject to frequent amendments and requires current version verification',
          },
        ]),
        usage_metadata: {
          input_tokens: 500,
          output_tokens: 150,
        },
      });

      const flags = await detectResearchFlags(input);

      expect(flags.length).toBeGreaterThan(0);
      expect(flags[0].reason).toContain('regulation');
      expect(flags[0].topic).toContain('Постановление 1875');
      expect(flags[0].context.length).toBeGreaterThanOrEqual(50);
      expect(flags[0].context.length).toBeLessThanOrEqual(200);
    });

    it('should NOT flag timeless programming concepts', async () => {
      const input: ResearchFlagInput = {
        topic: 'JavaScript Functions and Loops',
        course_category: 'professional',
      };

      // Mock LLM response with no flags (conservative approach)
      mockModel.invoke.mockResolvedValue({
        content: JSON.stringify([]),
        usage_metadata: {
          input_tokens: 480,
          output_tokens: 10,
        },
      });

      const flags = await detectResearchFlags(input);

      expect(flags.length).toBe(0);
      expect(mockModel.invoke).toHaveBeenCalledTimes(1);
    });

    it('should flag version-specific technology', async () => {
      const input: ResearchFlagInput = {
        topic: 'React 19 New Features',
        course_category: 'professional',
      };

      // Mock LLM response with technology flag
      mockModel.invoke.mockResolvedValue({
        content: JSON.stringify([
          {
            topic: 'React 19',
            reason: 'technology_trends',
            context:
              'React 19 introduces breaking changes and new concurrent features requiring current documentation',
          },
        ]),
        usage_metadata: {
          input_tokens: 490,
          output_tokens: 145,
        },
      });

      const flags = await detectResearchFlags(input);

      expect(flags.length).toBeGreaterThan(0);
      expect(flags[0].topic).toContain('React 19');
      expect(flags[0].reason).toBe('technology_trends');
      expect(flags[0].context).toContain('React 19');
    });

    it('should NOT flag creative or spiritual content', async () => {
      const input: ResearchFlagInput = {
        topic: 'Watercolor Painting Techniques',
        course_category: 'creative',
      };

      // Mock LLM response with no flags
      mockModel.invoke.mockResolvedValue({
        content: JSON.stringify([]),
        usage_metadata: {
          input_tokens: 470,
          output_tokens: 10,
        },
      });

      const flags = await detectResearchFlags(input);

      expect(flags.length).toBe(0);
    });
  });

  describe('Additional flaggable content types', () => {
    it('should flag current events content', async () => {
      const input: ResearchFlagInput = {
        topic: '2024 Market Trends in AI',
        course_category: 'professional',
      };

      mockModel.invoke.mockResolvedValue({
        content: JSON.stringify([
          {
            topic: '2024 market trends',
            reason: 'current_events',
            context: 'Market trends for 2024 require up-to-date analysis and current economic data',
          },
        ]),
        usage_metadata: {
          input_tokens: 495,
          output_tokens: 140,
        },
      });

      const flags = await detectResearchFlags(input);

      expect(flags.length).toBeGreaterThan(0);
      expect(flags[0].reason).toBe('current_events');
      expect(flags[0].topic).toContain('2024');
    });

    it('should flag compliance regulations', async () => {
      const input: ResearchFlagInput = {
        topic: 'GDPR Compliance 2024',
        course_category: 'professional',
      };

      mockModel.invoke.mockResolvedValue({
        content: JSON.stringify([
          {
            topic: 'GDPR compliance',
            reason: 'regulation_updates',
            context:
              'GDPR regulations and enforcement practices evolve frequently requiring current interpretation',
          },
        ]),
        usage_metadata: {
          input_tokens: 485,
          output_tokens: 135,
        },
      });

      const flags = await detectResearchFlags(input);

      expect(flags.length).toBeGreaterThan(0);
      expect(flags[0].topic).toContain('GDPR');
    });

    it('should flag Node.js version-specific content', async () => {
      const input: ResearchFlagInput = {
        topic: 'Node.js 22 Breaking Changes',
        course_category: 'professional',
      };

      mockModel.invoke.mockResolvedValue({
        content: JSON.stringify([
          {
            topic: 'Node.js 22',
            reason: 'technology_trends',
            context:
              'Node.js 22 introduces API changes and deprecations requiring latest documentation',
          },
        ]),
        usage_metadata: {
          input_tokens: 492,
          output_tokens: 138,
        },
      });

      const flags = await detectResearchFlags(input);

      expect(flags.length).toBeGreaterThan(0);
      expect(flags[0].topic).toContain('Node.js');
    });
  });

  describe('Non-flaggable timeless content', () => {
    it('should NOT flag general OOP principles', async () => {
      const input: ResearchFlagInput = {
        topic: 'Object-Oriented Programming Fundamentals',
        course_category: 'professional',
      };

      mockModel.invoke.mockResolvedValue({
        content: JSON.stringify([]),
        usage_metadata: {
          input_tokens: 475,
          output_tokens: 10,
        },
      });

      const flags = await detectResearchFlags(input);

      expect(flags.length).toBe(0);
    });

    it('should NOT flag design patterns', async () => {
      const input: ResearchFlagInput = {
        topic: 'SOLID Principles and Design Patterns',
        course_category: 'professional',
      };

      mockModel.invoke.mockResolvedValue({
        content: JSON.stringify([]),
        usage_metadata: {
          input_tokens: 478,
          output_tokens: 10,
        },
      });

      const flags = await detectResearchFlags(input);

      expect(flags.length).toBe(0);
    });

    it('should NOT flag timeless soft skills', async () => {
      const input: ResearchFlagInput = {
        topic: 'Leadership and Communication Skills',
        course_category: 'personal',
      };

      mockModel.invoke.mockResolvedValue({
        content: JSON.stringify([]),
        usage_metadata: {
          input_tokens: 472,
          output_tokens: 10,
        },
      });

      const flags = await detectResearchFlags(input);

      expect(flags.length).toBe(0);
    });

    it('should NOT flag meditation practices', async () => {
      const input: ResearchFlagInput = {
        topic: 'Mindfulness Meditation Techniques',
        course_category: 'spiritual',
      };

      mockModel.invoke.mockResolvedValue({
        content: JSON.stringify([]),
        usage_metadata: {
          input_tokens: 468,
          output_tokens: 10,
        },
      });

      const flags = await detectResearchFlags(input);

      expect(flags.length).toBe(0);
    });

    it('should NOT flag REST API design principles', async () => {
      const input: ResearchFlagInput = {
        topic: 'RESTful API Design Best Practices',
        course_category: 'professional',
      };

      mockModel.invoke.mockResolvedValue({
        content: JSON.stringify([]),
        usage_metadata: {
          input_tokens: 480,
          output_tokens: 10,
        },
      });

      const flags = await detectResearchFlags(input);

      expect(flags.length).toBe(0);
    });
  });

  describe('Input validation with document summaries', () => {
    it('should handle input with document summaries', async () => {
      const input: ResearchFlagInput = {
        topic: 'TypeScript 5.5 Updates',
        course_category: 'professional',
        document_summaries: [
          'TypeScript 5.5 release notes summary...',
          'Breaking changes in TypeScript 5.5...',
        ],
      };

      mockModel.invoke.mockResolvedValue({
        content: JSON.stringify([
          {
            topic: 'TypeScript 5.5',
            reason: 'technology_trends',
            context:
              'TypeScript 5.5 includes new type system features and breaking changes requiring latest docs',
          },
        ]),
        usage_metadata: {
          input_tokens: 620,
          output_tokens: 142,
        },
      });

      const flags = await detectResearchFlags(input);

      expect(flags.length).toBeGreaterThan(0);
      expect(flags[0].topic).toContain('TypeScript');
      expect(mockModel.invoke).toHaveBeenCalledTimes(1);

      // Verify document summaries were included in prompt
      const callArgs = mockModel.invoke.mock.calls[0][0];
      expect(callArgs).toContain('DOCUMENT SUMMARIES');
      expect(callArgs).toContain('TypeScript 5.5 release notes');
    });

    it('should handle input without document summaries', async () => {
      const input: ResearchFlagInput = {
        topic: 'Python Basics',
        course_category: 'professional',
      };

      mockModel.invoke.mockResolvedValue({
        content: JSON.stringify([]),
        usage_metadata: {
          input_tokens: 465,
          output_tokens: 10,
        },
      });

      const flags = await detectResearchFlags(input);

      expect(flags.length).toBe(0);

      // Verify no document summaries section in prompt
      const callArgs = mockModel.invoke.mock.calls[0][0];
      expect(callArgs).not.toContain('DOCUMENT SUMMARIES');
    });
  });

  describe('Error handling and validation', () => {
    it('should throw error on invalid JSON response', async () => {
      const input: ResearchFlagInput = {
        topic: 'Test Topic',
        course_category: 'professional',
      };

      // Mock invalid JSON response
      mockModel.invoke.mockResolvedValue({
        content: 'This is not valid JSON',
        usage_metadata: {
          input_tokens: 460,
          output_tokens: 20,
        },
      });

      await expect(detectResearchFlags(input)).rejects.toThrow(
        'Research flag detector returned invalid JSON'
      );
    });

    it('should throw error on schema validation failure - missing fields', async () => {
      const input: ResearchFlagInput = {
        topic: 'Test Topic',
        course_category: 'professional',
      };

      // Mock response missing required fields
      mockModel.invoke.mockResolvedValue({
        content: JSON.stringify([
          {
            topic: 'Test',
            // Missing 'reason' and 'context'
          },
        ]),
        usage_metadata: {
          input_tokens: 460,
          output_tokens: 30,
        },
      });

      await expect(detectResearchFlags(input)).rejects.toThrow(
        'Research flag validation failed'
      );
    });

    it('should throw error on context too short', async () => {
      const input: ResearchFlagInput = {
        topic: 'Test Topic',
        course_category: 'professional',
      };

      // Mock response with context too short (<50 chars)
      mockModel.invoke.mockResolvedValue({
        content: JSON.stringify([
          {
            topic: 'Test',
            reason: 'regulation_updates',
            context: 'Too short', // Only 9 chars, needs 50+
          },
        ]),
        usage_metadata: {
          input_tokens: 460,
          output_tokens: 40,
        },
      });

      await expect(detectResearchFlags(input)).rejects.toThrow(
        'Research flag validation failed'
      );
    });

    it('should throw error on context too long', async () => {
      const input: ResearchFlagInput = {
        topic: 'Test Topic',
        course_category: 'professional',
      };

      // Mock response with context too long (>200 chars)
      mockModel.invoke.mockResolvedValue({
        content: JSON.stringify([
          {
            topic: 'Test',
            reason: 'regulation_updates',
            context:
              'This context is way too long and exceeds the maximum allowed length of 200 characters. It keeps going and going with unnecessary details that should have been condensed into a shorter, more concise explanation that fits within the schema requirements.',
          },
        ]),
        usage_metadata: {
          input_tokens: 460,
          output_tokens: 60,
        },
      });

      await expect(detectResearchFlags(input)).rejects.toThrow(
        'Research flag validation failed'
      );
    });

    it('should handle empty flags array successfully', async () => {
      const input: ResearchFlagInput = {
        topic: 'General Programming',
        course_category: 'professional',
      };

      mockModel.invoke.mockResolvedValue({
        content: JSON.stringify([]),
        usage_metadata: {
          input_tokens: 465,
          output_tokens: 10,
        },
      });

      const flags = await detectResearchFlags(input);

      expect(flags).toEqual([]);
      expect(Array.isArray(flags)).toBe(true);
    });
  });

  describe('Model configuration and observability', () => {
    it('should use 120B model for expert-level judgment', async () => {
      const input: ResearchFlagInput = {
        topic: 'Test Topic',
        course_category: 'professional',
      };

      mockModel.invoke.mockResolvedValue({
        content: JSON.stringify([]),
        usage_metadata: {
          input_tokens: 465,
          output_tokens: 10,
        },
      });

      await detectResearchFlags(input);

      expect(getModelForPhase).toHaveBeenCalledWith('stage_4_expert', 'standalone');
    });

    it('should use custom course_id when provided', async () => {
      const input: ResearchFlagInput = {
        topic: 'Test Topic',
        course_category: 'professional',
      };

      const customCourseId = '550e8400-e29b-41d4-a716-446655440000';

      mockModel.invoke.mockResolvedValue({
        content: JSON.stringify([]),
        usage_metadata: {
          input_tokens: 465,
          output_tokens: 10,
        },
      });

      await detectResearchFlags(input, customCourseId);

      expect(getModelForPhase).toHaveBeenCalledWith('stage_4_expert', customCourseId);
    });

    it('should track phase execution with observability', async () => {
      const input: ResearchFlagInput = {
        topic: 'Test Topic',
        course_category: 'professional',
      };

      mockModel.invoke.mockResolvedValue({
        content: JSON.stringify([]),
        usage_metadata: {
          input_tokens: 465,
          output_tokens: 10,
        },
      });

      await detectResearchFlags(input);

      expect(trackPhaseExecution).toHaveBeenCalledWith(
        'research_flag_detection',
        'standalone',
        'openai/gpt-oss-120b',
        expect.any(Function)
      );
    });
  });

  describe('Prompt construction', () => {
    it('should include topic and category in prompt', async () => {
      const input: ResearchFlagInput = {
        topic: 'React Server Components',
        course_category: 'professional',
      };

      mockModel.invoke.mockResolvedValue({
        content: JSON.stringify([]),
        usage_metadata: {
          input_tokens: 490,
          output_tokens: 10,
        },
      });

      await detectResearchFlags(input);

      const callArgs = mockModel.invoke.mock.calls[0][0];
      expect(callArgs).toContain('React Server Components');
      expect(callArgs).toContain('professional');
      expect(callArgs).toContain('CONSERVATIVE');
    });

    it('should include conservative guidelines in prompt', async () => {
      const input: ResearchFlagInput = {
        topic: 'Test Topic',
        course_category: 'professional',
      };

      mockModel.invoke.mockResolvedValue({
        content: JSON.stringify([]),
        usage_metadata: {
          input_tokens: 465,
          output_tokens: 10,
        },
      });

      await detectResearchFlags(input);

      const callArgs = mockModel.invoke.mock.calls[0][0];
      expect(callArgs).toContain('CONSERVATIVE');
      expect(callArgs).toContain('BOTH conditions');
      expect(callArgs).toContain('6 months');
      expect(callArgs).toContain('under-flag than over-flag');
    });
  });

  describe('Multiple flags handling', () => {
    it('should handle multiple research flags', async () => {
      const input: ResearchFlagInput = {
        topic: 'Modern Web Development with React 19 and Node.js 22',
        course_category: 'professional',
      };

      mockModel.invoke.mockResolvedValue({
        content: JSON.stringify([
          {
            topic: 'React 19',
            reason: 'technology_trends',
            context:
              'React 19 introduces server components and new hooks requiring current documentation',
          },
          {
            topic: 'Node.js 22',
            reason: 'technology_trends',
            context: 'Node.js 22 includes breaking changes and new native modules to document',
          },
        ]),
        usage_metadata: {
          input_tokens: 510,
          output_tokens: 180,
        },
      });

      const flags = await detectResearchFlags(input);

      expect(flags.length).toBe(2);
      expect(flags[0].topic).toContain('React');
      expect(flags[1].topic).toContain('Node.js');
      expect(flags.every((f) => f.context.length >= 50)).toBe(true);
      expect(flags.every((f) => f.context.length <= 200)).toBe(true);
    });
  });
});
