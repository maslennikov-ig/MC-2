/**
 * Unit Tests for Section Batch Generator (section-batch-generator.ts)
 *
 * Tests T024 requirements:
 * 1. generateBatch() returns valid Section[] (verify schema compliance)
 * 2. generateBatch() includes lessons with practical_exercises (3-5 per lesson, FR-010)
 * 3. generateBatch() handles retry on validation failure (2 attempts)
 * 4. buildBatchPrompt() includes style integration (getStylePrompt called)
 * 5. parseSections() handles malformed JSON (json-repair.ts)
 * 6. Tiered model routing (RT-001): OSS 120B → qwen3-max escalation
 * 7. Complexity and criticality scoring for pre-routing
 * 8. UnifiedRegenerator integration with Layers 1-2 (RT-005)
 *
 * @module tests/unit/stage5/section-batch-generator.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SectionBatchGenerator } from '@/stages/stage5-generation/utils/section-batch-generator';
import type { GenerationJobInput, Section } from '@megacampus/shared-types';
import { ChatOpenAI } from '@langchain/openai';
import * as stylePromptsModule from '@megacampus/shared-types/style-prompts';
import * as regenerationModule from '@/shared/regeneration';
import { createFullAnalysisResult, createHighComplexityAnalysisResult, createLowComplexityAnalysisResult } from '../../fixtures/analysis-result-fixture';

// Mock dependencies
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: vi.fn(),
}));
vi.mock('@megacampus/shared-types/style-prompts');
vi.mock('@/shared/regeneration', () => ({
  UnifiedRegenerator: vi.fn(),
}));
vi.mock('@/shared/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

/**
 * Helper function to create RT-006 compliant mock section
 * Ensures all validation passes (min lengths, durations, etc.)
 */
function createValidMockSection(overrides: Partial<Section> = {}): Section {
  return {
    section_number: 1,
    section_title: 'Test Section Title (min 5 chars)',
    section_description: 'This is a comprehensive section description that meets the minimum length requirement of 20 characters',
    learning_objectives: [
      'Test objective text that meets minimum 15 character requirement for schema validation',
    ],
    estimated_duration_minutes: 45,
    lessons: [
      {
        lesson_number: 1,
        lesson_title: 'Lesson 1 Title (min 5 chars)',
        lesson_objectives: [
          'Explain objective concepts that meet minimum 15 character requirements for validation',
        ],
        key_topics: ['topic one', 'topic two'], // min 5 chars each
        estimated_duration_minutes: 20, // RT-006 duration validator
        practical_exercises: [
          {
            exercise_type: 'hands_on',
            exercise_title: 'Exercise 1 Title (min 5 chars)',
            exercise_description: 'Exercise description text that meets minimum 10 character requirement',
          },
          {
            exercise_type: 'quiz',
            exercise_title: 'Exercise 2 Title (min 5 chars)',
            exercise_description: 'Exercise description text that meets minimum 10 character requirement',
          },
          {
            exercise_type: 'case_study',
            exercise_title: 'Exercise 3 Title (min 5 chars)',
            exercise_description: 'Exercise description text that meets minimum 10 character requirement',
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('SectionBatchGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = 'test-api-key';
  });

  /**
   * Test 1: generateBatch() returns valid Section[]
   * Requirement: T024.1 - Verify schema compliance
   */
  describe('generateBatch - valid Section[] output', () => {
    it('should generate valid section with 3-5 lessons', async () => {
      const mockSection: Section = {
        section_number: 1,
        section_title: 'Introduction to Neural Networks',
        section_description: 'Learn the fundamentals of neural networks and deep learning',
        learning_objectives: [
          'Explain the fundamental components of neural network architecture',
        ],
        estimated_duration_minutes: 60,
        lessons: [
          {
            lesson_number: 1,
            lesson_title: 'What is a Neural Network?',
            lesson_objectives: [
              'Define the key components and structure of neural networks',
            ],
            key_topics: ['neurons', 'layers', 'activation functions'],
            estimated_duration_minutes: 20,
            practical_exercises: [
              {
                exercise_type: 'hands_on',
                exercise_title: 'Build a Simple Perceptron',
                exercise_description: 'Implement a perceptron from scratch using NumPy',
              },
              {
                exercise_type: 'quiz',
                exercise_title: 'Neural Network Basics Quiz',
                exercise_description: 'Test your understanding of neural network fundamentals',
              },
              {
                exercise_type: 'case_study',
                exercise_title: 'Real-World Neural Network Applications',
                exercise_description: 'Analyze how neural networks are used in image recognition',
              },
            ],
          },
          {
            lesson_number: 2,
            lesson_title: 'Backpropagation Algorithm',
            lesson_objectives: [
              'Implement the backpropagation algorithm using gradient descent',
            ],
            key_topics: ['chain rule', 'gradients', 'weight updates'],
            estimated_duration_minutes: 25,
            practical_exercises: [
              {
                exercise_type: 'hands_on',
                exercise_title: 'Backpropagation Implementation',
                exercise_description: 'Code backpropagation step by step',
              },
              {
                exercise_type: 'self_assessment',
                exercise_title: 'Gradient Calculation Exercise',
                exercise_description: 'Calculate gradients manually for a simple network',
              },
              {
                exercise_type: 'discussion',
                exercise_title: 'Vanishing Gradient Problem',
                exercise_description: 'Discuss challenges with deep networks',
              },
            ],
          },
          {
            lesson_number: 3,
            lesson_title: 'Activation Functions',
            lesson_objectives: [
              'Compare the performance characteristics of different activation functions',
            ],
            key_topics: ['sigmoid', 'tanh activation', 'ReLU activation', 'softmax'],
            estimated_duration_minutes: 20,
            practical_exercises: [
              {
                exercise_type: 'simulation',
                exercise_title: 'Activation Function Comparison',
                exercise_description: 'Visualize different activation functions',
              },
              {
                exercise_type: 'hands_on',
                exercise_title: 'Implement Custom Activation',
                exercise_description: 'Create a custom activation function',
              },
              {
                exercise_type: 'reflection',
                exercise_title: 'When to Use Which Activation',
                exercise_description: 'Reflect on use cases for each activation function',
              },
            ],
          },
        ],
      };

      vi.mocked(ChatOpenAI).mockImplementation(
        class {
          invoke = vi.fn().mockResolvedValue({
            content: JSON.stringify({ sections: [mockSection] }),
          })
        } as any
      );

      vi.mocked(regenerationModule.UnifiedRegenerator).mockImplementation(
        class {
          regenerate = vi.fn().mockResolvedValue({
            success: true,
            data: { sections: [mockSection] },
            metadata: {
              layerUsed: 'auto-repair',
              retryCount: 0,
              qualityPassed: true,
              tokenCost: 0,
            },
          })
        } as any
      );

      vi.mocked(stylePromptsModule.getStylePrompt).mockReturnValue('Technical style prompt');

      const mockJobInput: GenerationJobInput = {
        course_id: 'course-123',
        organization_id: 'org-456',
        user_id: 'user-789',
        analysis_result: createFullAnalysisResult('Neural Networks Fundamentals'),
        frontend_parameters: {
          course_title: 'Deep Learning Basics',
          language: 'en',
          style: 'technical',
        },
        vectorized_documents: false,
      };

      const generator = new SectionBatchGenerator();
      const result = await generator.generateBatch(0, 0, 1, mockJobInput);

      // Verify result structure
      expect(result).toBeDefined();
      expect(result.sections).toBeInstanceOf(Array);
      expect(result.sections.length).toBe(1);

      // Verify section structure
      const section = result.sections[0];
      expect(section.section_number).toBe(1);
      expect(section.section_title).toBeDefined();
      expect(section.lessons).toBeInstanceOf(Array);
      expect(section.lessons.length).toBeGreaterThanOrEqual(3);
      expect(section.lessons.length).toBeLessThanOrEqual(5);

      // Verify model tier metadata
      expect(result.modelUsed).toBeDefined();
      expect(result.tier).toBeDefined();
      expect(result.complexityScore).toBeGreaterThanOrEqual(0);
      expect(result.complexityScore).toBeLessThanOrEqual(1);
    });

    it('should throw error when batch size is invalid', async () => {
      const mockJobInput: GenerationJobInput = {
        course_id: 'course-123',
        organization_id: 'org-456',
        user_id: 'user-789',
        analysis_result: createFullAnalysisResult('Test Course'),
        frontend_parameters: {
          course_title: 'Test',
        },
        vectorized_documents: false,
      };

      const generator = new SectionBatchGenerator();

      // Invalid batch size: 2 sections instead of 1
      await expect(generator.generateBatch(0, 0, 2, mockJobInput)).rejects.toThrow(
        'Invalid batch size: expected 1 section(s), got 2'
      );
    });

    it('should throw error when section index is out of bounds', async () => {
      const mockJobInput: GenerationJobInput = {
        course_id: 'course-123',
        organization_id: 'org-456',
        user_id: 'user-789',
        analysis_result: createFullAnalysisResult('Test Course'),
        frontend_parameters: {
          course_title: 'Test',
        },
        vectorized_documents: false,
      };

      const generator = new SectionBatchGenerator();

      // Out of bounds: section index 5 when only 1 section exists
      await expect(generator.generateBatch(0, 5, 6, mockJobInput)).rejects.toThrow(
        'Section index 5 out of bounds'
      );
    });
  });

  /**
   * Test 2: generateBatch() includes practical_exercises (3-5 per lesson, FR-010)
   * Requirement: T024.2 - Verify FR-010 compliance
   */
  describe('generateBatch - practical_exercises validation', () => {
    it('should include 3-5 practical exercises per lesson (FR-010)', async () => {
      const mockSection = createValidMockSection();

      vi.mocked(ChatOpenAI).mockImplementation(
        class {
          invoke = vi.fn().mockResolvedValue({
            content: JSON.stringify({ sections: [mockSection] }),
          })
        } as any
      );

      vi.mocked(regenerationModule.UnifiedRegenerator).mockImplementation(
        class {
          regenerate = vi.fn().mockResolvedValue({
            success: true,
            data: { sections: [mockSection] },
            metadata: {
              layerUsed: 'auto-repair',
              retryCount: 0,
              qualityPassed: true,
              tokenCost: 0,
            },
          })
        } as any
      );

      vi.mocked(stylePromptsModule.getStylePrompt).mockReturnValue('Style prompt');

      const mockJobInput: GenerationJobInput = {
        course_id: 'course-123',
        organization_id: 'org-456',
        user_id: 'user-789',
        analysis_result: createFullAnalysisResult('Test Course'),
        frontend_parameters: {
          course_title: 'Test',
        },
        vectorized_documents: false,
      };

      const generator = new SectionBatchGenerator();
      const result = await generator.generateBatch(0, 0, 1, mockJobInput);

      // Verify each lesson has 3-5 practical exercises (FR-010)
      for (const lesson of result.sections[0].lessons) {
        expect(lesson.practical_exercises).toBeDefined();
        expect(lesson.practical_exercises.length).toBeGreaterThanOrEqual(3);
        expect(lesson.practical_exercises.length).toBeLessThanOrEqual(5);

        // Verify exercise structure
        for (const exercise of lesson.practical_exercises) {
          expect(exercise.exercise_type).toBeDefined();
          expect(['self_assessment', 'case_study', 'hands_on', 'discussion', 'quiz', 'simulation', 'reflection']).toContain(
            exercise.exercise_type
          );
          expect(exercise.exercise_title).toBeDefined();
          expect(exercise.exercise_description).toBeDefined();
        }
      }
    });
  });

  /**
   * Test 3: generateBatch() handles retry on validation failure (2 attempts)
   * Requirement: T024.3 - Verify retry logic
   */
  describe('generateBatch - retry logic', () => {
    it('should retry on validation failure (max 2 attempts)', async () => {
      const invalidSection = {
        section_number: 1,
        section_title: 'Invalid Section',
        // Missing required fields
      };

      const validSection = createValidMockSection({ section_title: 'Valid Section' });

      const mockInvoke = vi.fn()
        // Both calls: returns content for regenerator
        .mockResolvedValue({
          content: JSON.stringify({ sections: [validSection] }),
        });

      vi.mocked(ChatOpenAI).mockImplementation(
        class {
          invoke = mockInvoke
        } as any
      );

      // First call fails, second call succeeds
      const mockRegenerate = vi.fn()
        .mockRejectedValueOnce(new Error('Validation failed'))
        .mockResolvedValueOnce({
          success: true,
          data: { sections: [validSection] },
          metadata: {
            layerUsed: 'auto-repair',
            retryCount: 1,
            qualityPassed: true,
            tokenCost: 0,
          },
        });

      vi.mocked(regenerationModule.UnifiedRegenerator).mockImplementation(
        class {
          regenerate = mockRegenerate
        } as any
      );

      vi.mocked(stylePromptsModule.getStylePrompt).mockReturnValue('Style prompt');

      const mockJobInput: GenerationJobInput = {
        course_id: 'course-123',
        organization_id: 'org-456',
        user_id: 'user-789',
        analysis_result: createFullAnalysisResult('Test Course'),
        frontend_parameters: {
          course_title: 'Test',
        },
        vectorized_documents: false,
      };

      const generator = new SectionBatchGenerator();
      const result = await generator.generateBatch(0, 0, 1, mockJobInput);

      // Verify retry was successful
      expect(result.retryCount).toBe(1);
      expect(result.sections[0].section_title).toBe('Valid Section');

      // Verify ChatOpenAI was called twice (initial + 1 retry)
      expect(mockInvoke).toHaveBeenCalledTimes(2);
    });

    it('should escalate from Tier 1 (OSS 120B) to Tier 2 (qwen3-max) on failure', async () => {
      const validSection: Section = {
        section_number: 1,
        section_title: 'Valid Section',
        section_description: 'Comprehensive coverage of essential topics and applications',
        learning_objectives: [
          'Explain the fundamental concepts and principles of the subject',
        ],
        estimated_duration_minutes: 45,
        lessons: [
          {
            lesson_number: 1,
            lesson_title: 'Lesson 1',
            lesson_objectives: [
              'Define the core principles and fundamental concepts',
            ],
            key_topics: ['fundamentals', 'principles'],
            estimated_duration_minutes: 15,
            practical_exercises: [
              {
                exercise_type: 'hands_on',
                exercise_title: 'Exercise 1',
                exercise_description: 'Description 1',
              },
              {
                exercise_type: 'quiz',
                exercise_title: 'Exercise 2',
                exercise_description: 'Description 2',
              },
              {
                exercise_type: 'case_study',
                exercise_title: 'Exercise 3',
                exercise_description: 'Description 3',
              },
            ],
          },
        ],
      };

      const mockInvoke = vi.fn().mockResolvedValue({
        content: JSON.stringify({ sections: [validSection] }),
      });

      vi.mocked(ChatOpenAI).mockImplementation(
        class {
          invoke = mockInvoke
        } as any
      );

      // First call fails (Tier 1), second call succeeds (Tier 2)
      const mockRegenerate = vi.fn()
        .mockRejectedValueOnce(new Error('Tier 1 quality gate failed'))
        .mockResolvedValueOnce({
          success: true,
          data: { sections: [validSection] },
          metadata: {
            layerUsed: 'auto-repair',
            retryCount: 1,
            qualityPassed: true,
            tokenCost: 0,
          },
        });

      vi.mocked(regenerationModule.UnifiedRegenerator).mockImplementation(
        class {
          regenerate = mockRegenerate
        } as any
      );

      vi.mocked(stylePromptsModule.getStylePrompt).mockReturnValue('Style prompt');

      // Low complexity section -> should start with Tier 1 (OSS 120B)
      const mockJobInput: GenerationJobInput = {
        course_id: 'course-123',
        organization_id: 'org-456',
        user_id: 'user-789',
        analysis_result: createFullAnalysisResult('Tier 1 Test'),
        frontend_parameters: {
          course_title: 'Test',
        },
        vectorized_documents: false,
      };

      const generator = new SectionBatchGenerator();
      const result = await generator.generateBatch(0, 0, 1, mockJobInput);

      // Verify escalation happened
      expect(result.tier).toBe('tier2_qwen3Max');
      expect(result.modelUsed).toBe('qwen/qwen3-max');
      expect(result.retryCount).toBe(1);
    });

    it('should throw error after max retries exceeded', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        content: 'invalid json',
      });

      vi.mocked(ChatOpenAI).mockImplementation(
        class {
          invoke = mockInvoke
        } as any
      );

      // All attempts fail
      vi.mocked(regenerationModule.UnifiedRegenerator).mockImplementation(
        class {
          regenerate = vi.fn().mockRejectedValue(new Error('Validation failed'))
        } as any
      );

      vi.mocked(stylePromptsModule.getStylePrompt).mockReturnValue('Style prompt');

      const mockJobInput: GenerationJobInput = {
        course_id: 'course-123',
        organization_id: 'org-456',
        user_id: 'user-789',
        analysis_result: createFullAnalysisResult('Test Course'),
        frontend_parameters: {
          course_title: 'Test',
        },
        vectorized_documents: false,
      };

      const generator = new SectionBatchGenerator();

      await expect(generator.generateBatch(0, 0, 1, mockJobInput)).rejects.toThrow(
        'Failed to generate section batch'
      );

      // Verify max attempts (2) were made
      expect(mockInvoke).toHaveBeenCalledTimes(2);
    });
  });

  /**
   * Test 4: buildBatchPrompt() includes style integration
   * Requirement: T024.4 - Verify getStylePrompt called
   */
  describe('buildBatchPrompt - style integration', () => {
    it('should integrate style prompts via getStylePrompt (FR-028)', async () => {
      const mockSection: Section = {
        section_number: 1,
        section_title: 'Test Section',
        section_description: 'Comprehensive introduction to test concepts and methodologies',
        learning_objectives: [
          'Explain the fundamental concepts and principles of the subject',
        ],
        estimated_duration_minutes: 45,
        lessons: [
          {
            lesson_number: 1,
            lesson_title: 'Lesson 1',
            lesson_objectives: [
              'Define the core principles and fundamental concepts',
            ],
            key_topics: ['fundamentals', 'principles'],
            estimated_duration_minutes: 15,
            practical_exercises: [
              {
                exercise_type: 'hands_on',
                exercise_title: 'Exercise 1',
                exercise_description: 'Description 1',
              },
              {
                exercise_type: 'quiz',
                exercise_title: 'Exercise 2',
                exercise_description: 'Description 2',
              },
              {
                exercise_type: 'case_study',
                exercise_title: 'Exercise 3',
                exercise_description: 'Description 3',
              },
            ],
          },
        ],
      };

      const mockInvoke = vi.fn().mockResolvedValue({
        content: JSON.stringify({ sections: [mockSection] }),
      });

      vi.mocked(ChatOpenAI).mockImplementation(
        class {
          invoke = mockInvoke
        } as any
      );

      vi.mocked(regenerationModule.UnifiedRegenerator).mockImplementation(
        class {
          regenerate = vi.fn().mockResolvedValue({
            success: true,
            data: { sections: [mockSection] },
            metadata: {
              layerUsed: 'auto-repair',
              retryCount: 0,
              qualityPassed: true,
              tokenCost: 0,
            },
          })
        } as any
      );

      vi.mocked(stylePromptsModule.getStylePrompt).mockReturnValue('Storytelling style: Use narrative structure');

      const mockJobInput: GenerationJobInput = {
        course_id: 'course-123',
        organization_id: 'org-456',
        user_id: 'user-789',
        analysis_result: createFullAnalysisResult('Creative Writing'),
        frontend_parameters: {
          course_title: 'Creative Writing',
          style: 'storytelling',
        },
        vectorized_documents: false,
      };

      const generator = new SectionBatchGenerator();
      await generator.generateBatch(0, 0, 1, mockJobInput);

      // Verify getStylePrompt was called with correct style
      expect(stylePromptsModule.getStylePrompt).toHaveBeenCalledWith('storytelling');

      // Verify style prompt is included in ChatOpenAI invocation
      expect(mockInvoke).toHaveBeenCalledWith(
        expect.stringContaining('Storytelling style: Use narrative structure')
      );
    });

    it('should use default style when not provided', async () => {
      const mockSection: Section = {
        section_number: 1,
        section_title: 'Test Section',
        section_description: 'Comprehensive introduction to test concepts and methodologies',
        learning_objectives: [
          'Explain the fundamental concepts and principles of the subject',
        ],
        estimated_duration_minutes: 45,
        lessons: [
          {
            lesson_number: 1,
            lesson_title: 'Lesson 1',
            lesson_objectives: [
              'Define the core principles and fundamental concepts',
            ],
            key_topics: ['fundamentals', 'principles'],
            estimated_duration_minutes: 15,
            practical_exercises: [
              {
                exercise_type: 'hands_on',
                exercise_title: 'Exercise 1',
                exercise_description: 'Description 1',
              },
              {
                exercise_type: 'quiz',
                exercise_title: 'Exercise 2',
                exercise_description: 'Description 2',
              },
              {
                exercise_type: 'case_study',
                exercise_title: 'Exercise 3',
                exercise_description: 'Description 3',
              },
            ],
          },
        ],
      };

      vi.mocked(ChatOpenAI).mockImplementation(
        class {
          invoke = vi.fn().mockResolvedValue({
            content: JSON.stringify({ sections: [mockSection] }),
          })
        } as any
      );

      vi.mocked(regenerationModule.UnifiedRegenerator).mockImplementation(
        class {
          regenerate = vi.fn().mockResolvedValue({
            success: true,
            data: { sections: [mockSection] },
            metadata: {
              layerUsed: 'auto-repair',
              retryCount: 0,
              qualityPassed: true,
              tokenCost: 0,
            },
          })
        } as any
      );

      vi.mocked(stylePromptsModule.getStylePrompt).mockReturnValue('Conversational style');

      const mockJobInput: GenerationJobInput = {
        course_id: 'course-123',
        organization_id: 'org-456',
        user_id: 'user-789',
        analysis_result: createFullAnalysisResult('Default Style Course'),
        frontend_parameters: {
          course_title: 'Test',
          // No style provided
        },
        vectorized_documents: false,
      };

      const generator = new SectionBatchGenerator();
      await generator.generateBatch(0, 0, 1, mockJobInput);

      // Verify default style 'conversational' is used
      expect(stylePromptsModule.getStylePrompt).toHaveBeenCalledWith('conversational');
    });
  });

  /**
   * Test 5: parseSections() handles malformed JSON
   * Requirement: T024.5 - Verify json-repair.ts integration
   */
  describe('parseSections - malformed JSON handling', () => {
    it('should handle malformed JSON via UnifiedRegenerator (RT-005)', async () => {
      const validSection: Section = {
        section_number: 1,
        section_title: 'Test Section',
        section_description: 'Comprehensive introduction to test concepts and methodologies',
        learning_objectives: [
          'Explain the fundamental concepts and principles of the subject',
        ],
        estimated_duration_minutes: 45,
        lessons: [
          {
            lesson_number: 1,
            lesson_title: 'Lesson 1',
            lesson_objectives: [
              'Define the core principles and fundamental concepts',
            ],
            key_topics: ['fundamentals', 'principles'],
            estimated_duration_minutes: 15,
            practical_exercises: [
              {
                exercise_type: 'hands_on',
                exercise_title: 'Exercise 1',
                exercise_description: 'Description 1',
              },
              {
                exercise_type: 'quiz',
                exercise_title: 'Exercise 2',
                exercise_description: 'Description 2',
              },
              {
                exercise_type: 'case_study',
                exercise_title: 'Exercise 3',
                exercise_description: 'Description 3',
              },
            ],
          },
        ],
      };

      // LLM returns malformed JSON with markdown code blocks
      const malformedJSON = `\`\`\`json
{
  "sections": [
    {
      "section_number": 1,
      "section_title": "Test Section",
      "section_description": "Test description",
    }
  ]
}
\`\`\``;

      vi.mocked(ChatOpenAI).mockImplementation(
        class {
          invoke = vi.fn().mockResolvedValue({
            content: malformedJSON,
          })
        } as any
      );

      // UnifiedRegenerator's auto-repair layer fixes the malformed JSON
      vi.mocked(regenerationModule.UnifiedRegenerator).mockImplementation(
        class {
          regenerate = vi.fn().mockResolvedValue({
            success: true,
            data: { sections: [validSection] },
            metadata: {
              layerUsed: 'auto-repair',
              retryCount: 0,
              qualityPassed: true,
              tokenCost: 0,
            },
          })
        } as any
      );

      vi.mocked(stylePromptsModule.getStylePrompt).mockReturnValue('Style prompt');

      const mockJobInput: GenerationJobInput = {
        course_id: 'course-123',
        organization_id: 'org-456',
        user_id: 'user-789',
        analysis_result: createFullAnalysisResult('Test Course'),
        frontend_parameters: {
          course_title: 'Test',
        },
        vectorized_documents: false,
      };

      const generator = new SectionBatchGenerator();
      const result = await generator.generateBatch(0, 0, 1, mockJobInput);

      // Verify UnifiedRegenerator was called
      expect(regenerationModule.UnifiedRegenerator).toHaveBeenCalledWith(
        expect.objectContaining({
          enabledLayers: ['auto-repair', 'critique-revise'],
          maxRetries: 2,
        })
      );

      // Verify result is valid despite malformed input
      expect(result.sections).toBeDefined();
      expect(result.sections[0].section_title).toBe('Test Section');

      // Verify regeneration metrics
      expect(result.regenerationMetrics).toBeDefined();
      expect(result.regenerationMetrics?.layerUsed).toBe('auto-repair');
    });
  });

  /**
   * Test 6: Tiered model routing (RT-001)
   * Requirement: Verify OSS 120B → qwen3-max escalation
   */
  describe('Tiered model routing (RT-001)', () => {
    it('should use Tier 1 (OSS 120B) for low complexity sections', async () => {
      const mockSection: Section = {
        section_number: 1,
        section_title: 'Simple Section',
        section_description: 'Introduction to foundational concepts and basic principles',
        learning_objectives: [
          'Explain the fundamental concepts and principles of the subject',
        ],
        estimated_duration_minutes: 30,
        lessons: [
          {
            lesson_number: 1,
            lesson_title: 'Lesson 1',
            lesson_objectives: [
              'Define the core principles and fundamental concepts',
            ],
            key_topics: ['fundamentals', 'principles'],
            estimated_duration_minutes: 15,
            practical_exercises: [
              {
                exercise_type: 'hands_on',
                exercise_title: 'Exercise 1',
                exercise_description: 'Description 1',
              },
              {
                exercise_type: 'quiz',
                exercise_title: 'Exercise 2',
                exercise_description: 'Description 2',
              },
              {
                exercise_type: 'case_study',
                exercise_title: 'Exercise 3',
                exercise_description: 'Description 3',
              },
            ],
          },
        ],
      };

      vi.mocked(ChatOpenAI).mockImplementation(
        class {
          invoke = vi.fn().mockResolvedValue({
            content: JSON.stringify({ sections: [mockSection] }),
          })
        } as any
      );

      vi.mocked(regenerationModule.UnifiedRegenerator).mockImplementation(
        class {
          regenerate = vi.fn().mockResolvedValue({
            success: true,
            data: { sections: [mockSection] },
            metadata: {
              layerUsed: 'auto-repair',
              retryCount: 0,
              qualityPassed: true,
              tokenCost: 0,
            },
          })
        } as any
      );

      vi.mocked(stylePromptsModule.getStylePrompt).mockReturnValue('Style prompt');

      // Low complexity: few topics, few objectives, few lessons, optional importance
      const mockJobInput: GenerationJobInput = {
        course_id: 'course-123',
        organization_id: 'org-456',
        user_id: 'user-789',
        analysis_result: createLowComplexityAnalysisResult('Simple Course'),
        frontend_parameters: {
          course_title: 'Simple Course',
        },
        vectorized_documents: false,
      };

      const generator = new SectionBatchGenerator();
      const result = await generator.generateBatch(0, 0, 1, mockJobInput);

      // Verify Tier 1 (OSS 120B) was used
      expect(result.tier).toBe('tier1_oss120b');
      expect(result.modelUsed).toBe('openai/gpt-oss-120b');
      expect(result.complexityScore).toBeLessThan(0.75);
    });

    it('should use Tier 2 (qwen3-max) for high complexity sections', async () => {
      const mockSection: Section = {
        section_number: 1,
        section_title: 'Complex Section',
        section_description: 'Advanced exploration of complex topics and methodologies',
        learning_objectives: [
          'Explain the fundamental concepts and principles of the subject',
        ],
        estimated_duration_minutes: 90,
        lessons: [
          {
            lesson_number: 1,
            lesson_title: 'Lesson 1',
            lesson_objectives: [
              'Define the core principles and fundamental concepts',
            ],
            key_topics: ['fundamentals', 'principles'],
            estimated_duration_minutes: 20,
            practical_exercises: [
              {
                exercise_type: 'hands_on',
                exercise_title: 'Exercise 1',
                exercise_description: 'Description 1',
              },
              {
                exercise_type: 'quiz',
                exercise_title: 'Exercise 2',
                exercise_description: 'Description 2',
              },
              {
                exercise_type: 'case_study',
                exercise_title: 'Exercise 3',
                exercise_description: 'Description 3',
              },
            ],
          },
        ],
      };

      vi.mocked(ChatOpenAI).mockImplementation(
        class {
          invoke = vi.fn().mockResolvedValue({
            content: JSON.stringify({ sections: [mockSection] }),
          })
        } as any
      );

      vi.mocked(regenerationModule.UnifiedRegenerator).mockImplementation(
        class {
          regenerate = vi.fn().mockResolvedValue({
            success: true,
            data: { sections: [mockSection] },
            metadata: {
              layerUsed: 'auto-repair',
              retryCount: 0,
              qualityPassed: true,
              tokenCost: 0,
            },
          })
        } as any
      );

      vi.mocked(stylePromptsModule.getStylePrompt).mockReturnValue('Style prompt');

      // High complexity: many topics, many objectives, many lessons, core importance
      const mockJobInput: GenerationJobInput = {
        course_id: 'course-123',
        organization_id: 'org-456',
        user_id: 'user-789',
        analysis_result: createHighComplexityAnalysisResult('Advanced'),
        frontend_parameters: {
          course_title: 'Advanced Course',
        },
        vectorized_documents: false,
      };

      const generator = new SectionBatchGenerator();
      const result = await generator.generateBatch(0, 0, 1, mockJobInput);

      // Verify Tier 2 (qwen3-max) was used due to high complexity
      expect(result.tier).toBe('tier2_qwen3Max');
      expect(result.modelUsed).toBe('qwen/qwen3-max');
      expect(result.complexityScore).toBeGreaterThanOrEqual(0.75);
    });

    it('should use Tier 2 (qwen3-max) for high criticality sections', async () => {
      const mockSection: Section = {
        section_number: 1,
        section_title: 'Introduction to Fundamentals',
        section_description: 'Fundamental principles and core concepts for beginners',
        learning_objectives: [
          'Explain the fundamental concepts and principles of the subject',
        ],
        estimated_duration_minutes: 45,
        lessons: [
          {
            lesson_number: 1,
            lesson_title: 'Lesson 1',
            lesson_objectives: [
              'Define the core principles and fundamental concepts',
            ],
            key_topics: ['fundamentals', 'principles'],
            estimated_duration_minutes: 15,
            practical_exercises: [
              {
                exercise_type: 'hands_on',
                exercise_title: 'Exercise 1',
                exercise_description: 'Description 1',
              },
              {
                exercise_type: 'quiz',
                exercise_title: 'Exercise 2',
                exercise_description: 'Description 2',
              },
              {
                exercise_type: 'case_study',
                exercise_title: 'Exercise 3',
                exercise_description: 'Description 3',
              },
            ],
          },
        ],
      };

      vi.mocked(ChatOpenAI).mockImplementation(
        class {
          invoke = vi.fn().mockResolvedValue({
            content: JSON.stringify({ sections: [mockSection] }),
          })
        } as any
      );

      vi.mocked(regenerationModule.UnifiedRegenerator).mockImplementation(
        class {
          regenerate = vi.fn().mockResolvedValue({
            success: true,
            data: { sections: [mockSection] },
            metadata: {
              layerUsed: 'auto-repair',
              retryCount: 0,
              qualityPassed: true,
              tokenCost: 0,
            },
          })
        } as any
      );

      vi.mocked(stylePromptsModule.getStylePrompt).mockReturnValue('Style prompt');

      // High criticality: core importance + foundational keywords
      const mockJobInput: GenerationJobInput = {
        course_id: 'course-123',
        organization_id: 'org-456',
        user_id: 'user-789',
        analysis_result: createFullAnalysisResult('Fundamentals'),
        frontend_parameters: {
          course_title: 'Fundamentals Course',
        },
        vectorized_documents: false,
      };

      const generator = new SectionBatchGenerator();
      const result = await generator.generateBatch(0, 0, 1, mockJobInput);

      // Verify Tier 2 (qwen3-max) was used due to high criticality
      expect(result.tier).toBe('tier2_qwen3Max');
      expect(result.modelUsed).toBe('qwen/qwen3-max');
      expect(result.criticalityScore).toBeGreaterThanOrEqual(0.80);
    });
  });

  /**
   * Test 7: Complexity and criticality scoring
   * Requirement: Verify pre-routing calculations
   */
  describe('Complexity and criticality scoring', () => {
    it('should calculate complexity score based on topics, objectives, lessons', async () => {
      const mockSection: Section = {
        section_number: 1,
        section_title: 'Test Section',
        section_description: 'Comprehensive introduction to test concepts and methodologies',
        learning_objectives: [
          'Explain the fundamental concepts and principles of the subject',
        ],
        estimated_duration_minutes: 45,
        lessons: [
          {
            lesson_number: 1,
            lesson_title: 'Lesson 1',
            lesson_objectives: [
              'Define the core principles and fundamental concepts',
            ],
            key_topics: ['fundamentals', 'principles'],
            estimated_duration_minutes: 15,
            practical_exercises: [
              {
                exercise_type: 'hands_on',
                exercise_title: 'Exercise 1',
                exercise_description: 'Description 1',
              },
              {
                exercise_type: 'quiz',
                exercise_title: 'Exercise 2',
                exercise_description: 'Description 2',
              },
              {
                exercise_type: 'case_study',
                exercise_title: 'Exercise 3',
                exercise_description: 'Description 3',
              },
            ],
          },
        ],
      };

      vi.mocked(ChatOpenAI).mockImplementation(
        class {
          invoke = vi.fn().mockResolvedValue({
            content: JSON.stringify({ sections: [mockSection] }),
          })
        } as any
      );

      vi.mocked(regenerationModule.UnifiedRegenerator).mockImplementation(
        class {
          regenerate = vi.fn().mockResolvedValue({
            success: true,
            data: { sections: [mockSection] },
            metadata: {
              layerUsed: 'auto-repair',
              retryCount: 0,
              qualityPassed: true,
              tokenCost: 0,
            },
          })
        } as any
      );

      vi.mocked(stylePromptsModule.getStylePrompt).mockReturnValue('Style prompt');

      const mockJobInput: GenerationJobInput = {
        course_id: 'course-123',
        organization_id: 'org-456',
        user_id: 'user-789',
        analysis_result: createFullAnalysisResult('Test Course'),
        frontend_parameters: {
          course_title: 'Test',
        },
        vectorized_documents: false,
      };

      const generator = new SectionBatchGenerator();
      const result = await generator.generateBatch(0, 0, 1, mockJobInput);

      // Verify complexity score is calculated
      expect(result.complexityScore).toBeDefined();
      expect(result.complexityScore).toBeGreaterThanOrEqual(0);
      expect(result.complexityScore).toBeLessThanOrEqual(1);

      // Verify criticality score is calculated
      expect(result.criticalityScore).toBeDefined();
      expect(result.criticalityScore).toBeGreaterThanOrEqual(0);
      expect(result.criticalityScore).toBeLessThanOrEqual(1);
    });
  });

  /**
   * Test 8: UnifiedRegenerator integration (RT-005)
   * Requirement: Verify Layers 1-2 configuration
   */
  describe('UnifiedRegenerator integration (RT-005)', () => {
    it('should configure UnifiedRegenerator with Layers 1-2 (auto-repair, critique-revise)', async () => {
      const mockSection: Section = {
        section_number: 1,
        section_title: 'Test Section',
        section_description: 'Comprehensive introduction to test concepts and methodologies',
        learning_objectives: [
          'Explain the fundamental concepts and principles of the subject',
        ],
        estimated_duration_minutes: 45,
        lessons: [
          {
            lesson_number: 1,
            lesson_title: 'Lesson 1',
            lesson_objectives: [
              'Define the core principles and fundamental concepts',
            ],
            key_topics: ['fundamentals', 'principles'],
            estimated_duration_minutes: 15,
            practical_exercises: [
              {
                exercise_type: 'hands_on',
                exercise_title: 'Exercise 1',
                exercise_description: 'Description 1',
              },
              {
                exercise_type: 'quiz',
                exercise_title: 'Exercise 2',
                exercise_description: 'Description 2',
              },
              {
                exercise_type: 'case_study',
                exercise_title: 'Exercise 3',
                exercise_description: 'Description 3',
              },
            ],
          },
        ],
      };

      vi.mocked(ChatOpenAI).mockImplementation(
        class {
          invoke = vi.fn().mockResolvedValue({
            content: JSON.stringify({ sections: [mockSection] }),
          })
        } as any
      );

      vi.mocked(regenerationModule.UnifiedRegenerator).mockImplementation(
        class {
          regenerate = vi.fn().mockResolvedValue({
            success: true,
            data: { sections: [mockSection] },
            metadata: {
              layerUsed: 'auto-repair',
              retryCount: 0,
              qualityPassed: true,
              tokenCost: 0,
            },
          })
        } as any
      );

      vi.mocked(stylePromptsModule.getStylePrompt).mockReturnValue('Style prompt');

      const mockJobInput: GenerationJobInput = {
        course_id: 'course-regen',
        organization_id: 'org-regen',
        user_id: 'user-regen',
        analysis_result: createFullAnalysisResult('Test Course'),
        frontend_parameters: {
          course_title: 'Test',
        },
        vectorized_documents: false,
      };

      const generator = new SectionBatchGenerator();
      await generator.generateBatch(0, 0, 1, mockJobInput);

      // Verify UnifiedRegenerator was configured correctly
      expect(regenerationModule.UnifiedRegenerator).toHaveBeenCalledWith(
        expect.objectContaining({
          enabledLayers: ['auto-repair', 'critique-revise'],
          maxRetries: 2,
          metricsTracking: true,
          stage: 'generation',
          courseId: 'course-regen',
          phaseId: 'section_batch_0',
        })
      );
    });

    it('should return regeneration metrics with token savings', async () => {
      const mockSection: Section = {
        section_number: 1,
        section_title: 'Test Section',
        section_description: 'Comprehensive introduction to test concepts and methodologies',
        learning_objectives: [
          'Explain the fundamental concepts and principles of the subject',
        ],
        estimated_duration_minutes: 45,
        lessons: [
          {
            lesson_number: 1,
            lesson_title: 'Lesson 1',
            lesson_objectives: [
              'Define the core principles and fundamental concepts',
            ],
            key_topics: ['fundamentals', 'principles'],
            estimated_duration_minutes: 15,
            practical_exercises: [
              {
                exercise_type: 'hands_on',
                exercise_title: 'Exercise 1',
                exercise_description: 'Description 1',
              },
              {
                exercise_type: 'quiz',
                exercise_title: 'Exercise 2',
                exercise_description: 'Description 2',
              },
              {
                exercise_type: 'case_study',
                exercise_title: 'Exercise 3',
                exercise_description: 'Description 3',
              },
            ],
          },
        ],
      };

      vi.mocked(ChatOpenAI).mockImplementation(
        class {
          invoke = vi.fn().mockResolvedValue({
            content: JSON.stringify({ sections: [mockSection] }),
          })
        } as any
      );

      // UnifiedRegenerator uses auto-repair (Layer 1) -> 30% token savings
      vi.mocked(regenerationModule.UnifiedRegenerator).mockImplementation(
        class {
          regenerate = vi.fn().mockResolvedValue({
            success: true,
            data: { sections: [mockSection] },
            metadata: {
              layerUsed: 'auto-repair',
              retryCount: 0,
              qualityPassed: true,
              tokenCost: 0,
            },
          })
        } as any
      );

      vi.mocked(stylePromptsModule.getStylePrompt).mockReturnValue('Style prompt');

      const mockJobInput: GenerationJobInput = {
        course_id: 'course-123',
        organization_id: 'org-456',
        user_id: 'user-789',
        analysis_result: createFullAnalysisResult('Test Course'),
        frontend_parameters: {
          course_title: 'Test',
        },
        vectorized_documents: false,
      };

      const generator = new SectionBatchGenerator();
      const result = await generator.generateBatch(0, 0, 1, mockJobInput);

      // Verify regeneration metrics are returned
      expect(result.regenerationMetrics).toBeDefined();
      expect(result.regenerationMetrics?.layerUsed).toBe('auto-repair');
      expect(result.regenerationMetrics?.repairSuccessRate).toBe(1);
      expect(result.regenerationMetrics?.tokensSaved).toBeGreaterThan(0); // 30% savings for Layer 1
      expect(result.regenerationMetrics?.qualityPassed).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should throw error when OPENROUTER_API_KEY is missing', async () => {
      delete process.env.OPENROUTER_API_KEY;

      const mockJobInput: GenerationJobInput = {
        course_id: 'course-error',
        organization_id: 'org-error',
        user_id: 'user-error',
        analysis_result: createFullAnalysisResult('Test Course'),
        frontend_parameters: {
          course_title: 'Test',
        },
        vectorized_documents: false,
      };

      const generator = new SectionBatchGenerator();
      await expect(generator.generateBatch(0, 0, 1, mockJobInput)).rejects.toThrow(
        'OPENROUTER_API_KEY environment variable is required'
      );
    });

    it('should throw error when analysis_result is null', async () => {
      const mockJobInput: GenerationJobInput = {
        course_id: 'course-error',
        organization_id: 'org-error',
        user_id: 'user-error',
        analysis_result: null, // Title-only not supported for section generation
        frontend_parameters: {
          course_title: 'Test',
        },
        vectorized_documents: false,
      };

      const generator = new SectionBatchGenerator();
      await expect(generator.generateBatch(0, 0, 1, mockJobInput)).rejects.toThrow(
        'Cannot generate sections: analysis_result is null'
      );
    });
  });
});
