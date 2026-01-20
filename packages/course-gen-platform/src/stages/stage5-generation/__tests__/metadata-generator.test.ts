/**
 * Unit Tests for Metadata Generator (metadata-generator.ts)
 *
 * Tests T023 requirements:
 * 1. generate() with full Analyze results (FR-001)
 * 2. generate() with title-only input (FR-003)
 * 3. generate() with different styles (FR-028)
 * 4. extractLanguage() - Language extraction priority (FR-027)
 * 5. validateMetadataQuality() - Quality metrics calculation (RT-001)
 * 6. UnifiedRegenerator integration with Layers 1-2 (RT-005)
 *
 * @module tests/unit/stage5/metadata-generator.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetadataGenerator } from '@/stages/stage5-generation/utils/metadata-generator';
import type { GenerationJobInput } from '@megacampus/shared-types/generation-job';
import type { CourseStructure } from '@megacampus/shared-types/generation-result';
import { ChatOpenAI } from '@langchain/openai';
import * as stylePromptsModule from '@megacampus/shared-types/style-prompts';
import * as regenerationModule from '@/shared/regeneration';
import { createFullAnalysisResult } from '../../fixtures/analysis-result-fixture';

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

describe('MetadataGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = 'test-api-key';
  });

  it('should throw error when OPENROUTER_API_KEY is missing', async () => {
    delete process.env.OPENROUTER_API_KEY;

    const mockJobInput: GenerationJobInput = {
      course_id: 'course-error',
      organization_id: 'org-error',
      user_id: 'user-error',
      analysis_result: null,
      frontend_parameters: {
        course_title: 'Test',
      },
      vectorized_documents: false,
    };

    const generator = new MetadataGenerator();
    await expect(generator.generate(mockJobInput)).rejects.toThrow(
      'OPENROUTER_API_KEY environment variable is required'
    );
  });

  it('should generate metadata from full Analyze results (FR-001)', async () => {
    const mockMetadata: Partial<CourseStructure> = {
      course_title: 'Machine Learning Basics',
      course_description: 'A comprehensive introduction to machine learning covering supervised and unsupervised techniques',
      course_overview: 'This course provides a comprehensive exploration of fundamental machine learning concepts, algorithms, and practical applications using Python and industry-standard libraries',
      target_audience: 'Developers with Python experience and basic mathematical knowledge',
      estimated_duration_hours: 20,
      difficulty_level: 'intermediate',
      prerequisites: ['Python basics', 'Linear algebra'],
      learning_outcomes: [
        'Design effective supervised classification algorithms',
        'Assess model performance using various metrics',
        'Demonstrate classification techniques on real-world problems',
      ],
      assessment_strategy: {
        quiz_per_section: true,
        final_exam: true,
        practical_projects: 3,
        assessment_description: 'Comprehensive assessment including hands-on coding projects, theoretical quizzes, and a final capstone project',
      },
      course_tags: ['machine-learning', 'python', 'data-science', 'algorithms', 'supervised-learning'],
    };

    vi.mocked(ChatOpenAI).mockImplementation(
      class {
        invoke = vi.fn().mockResolvedValue({
          content: JSON.stringify(mockMetadata),
        })
      } as any
    );

    vi.mocked(regenerationModule.UnifiedRegenerator).mockImplementation(
      class {
        regenerate = vi.fn().mockResolvedValue({
          success: true,
          data: mockMetadata,
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
      analysis_result: createFullAnalysisResult('Machine Learning Fundamentals'),
      frontend_parameters: {
        course_title: 'Machine Learning Basics',
        language: 'en',
        style: 'technical',
      },
      vectorized_documents: false,
    };

    const generator = new MetadataGenerator();
    const result = await generator.generate(mockJobInput);

    expect(result).toBeDefined();
    expect(result.metadata.course_title).toBe('Machine Learning Basics');
    expect(result.modelUsed).toBe('qwen/qwen3-max');
    expect(result.quality.completeness).toBeGreaterThan(0.8);
  });

  it('should generate metadata from title-only input (FR-003)', async () => {
    const mockMetadata: Partial<CourseStructure> = {
      course_title: 'Introduction to Quantum Computing',
      course_description: 'Explore quantum computing fundamentals including qubits, superposition, entanglement, and quantum algorithms',
      course_overview: 'Comprehensive introduction to quantum computing principles covering theoretical foundations, mathematical frameworks, and practical applications in quantum information science',
      target_audience: 'Physics and computer science students with strong mathematical backgrounds',
      estimated_duration_hours: 15,
      difficulty_level: 'advanced',
      prerequisites: ['Linear algebra'],
      learning_outcomes: [
        'Explain quantum superposition and entanglement principles',
        'Execute basic quantum algorithms using quantum gates',
        'Examine quantum circuit complexity and performance',
      ],
      assessment_strategy: {
        quiz_per_section: true,
        final_exam: true,
        practical_projects: 2,
        assessment_description: 'Theory-based examinations and practical quantum circuit implementation assignments',
      },
      course_tags: ['quantum-computing', 'qubits', 'algorithms', 'quantum-gates', 'physics'],
    };

    vi.mocked(ChatOpenAI).mockImplementation(
      class {
        invoke = vi.fn().mockResolvedValue({
          content: JSON.stringify(mockMetadata),
        })
      } as any
    );

    vi.mocked(regenerationModule.UnifiedRegenerator).mockImplementation(
      class {
        regenerate = vi.fn().mockResolvedValue({
          success: true,
          data: mockMetadata,
          metadata: {
            layerUsed: 'auto-repair',
            retryCount: 0,
            qualityPassed: true,
            tokenCost: 0,
          },
        })
      } as any
    );

    vi.mocked(stylePromptsModule.getStylePrompt).mockReturnValue('Academic style prompt');

    const mockJobInput: GenerationJobInput = {
      course_id: 'course-abc',
      organization_id: 'org-def',
      user_id: 'user-ghi',
      analysis_result: null, // Title-only scenario
      frontend_parameters: {
        course_title: 'Introduction to Quantum Computing',
        style: 'academic',
      },
      vectorized_documents: false,
    };

    const generator = new MetadataGenerator();
    const result = await generator.generate(mockJobInput);

    expect(result).toBeDefined();
    expect(result.metadata.course_title).toBe('Introduction to Quantum Computing');
    expect(result.modelUsed).toBe('qwen/qwen3-max'); // FR-003: qwen3-max for title-only
  });

  it('should use correct style prompts (FR-028)', async () => {
    const mockMetadata: Partial<CourseStructure> = {
      course_title: 'Test Course Title',
      course_description: 'Comprehensive course description covering all key topics and learning objectives for beginners',
      course_overview: 'This course provides an overview of fundamental concepts and principles, designed for students with no prior experience in the subject area',
      target_audience: 'Beginners with no prior background or experience required',
      estimated_duration_hours: 5,
      difficulty_level: 'beginner',
      prerequisites: [],
      learning_outcomes: [
        'Explain fundamental concepts and principles',
        'Demonstrate basic techniques on simple problems',
        'Identify key components and relationships',
      ],
      assessment_strategy: {
        quiz_per_section: false,
        final_exam: false,
        practical_projects: 0,
        assessment_description: 'Self-paced learning with optional exercises and practice problems for skill reinforcement',
      },
      course_tags: ['test', 'fundamentals', 'beginner', 'basics', 'introduction'],
    };

    vi.mocked(ChatOpenAI).mockImplementation(
      class {
        invoke = vi.fn().mockResolvedValue({
          content: JSON.stringify(mockMetadata),
        })
      } as any
    );

    vi.mocked(regenerationModule.UnifiedRegenerator).mockImplementation(
      class {
        regenerate = vi.fn().mockResolvedValue({
          success: true,
          data: mockMetadata,
          metadata: {
            layerUsed: 'auto-repair',
            retryCount: 0,
            qualityPassed: true,
            tokenCost: 0,
          },
        })
      } as any
    );

    vi.mocked(stylePromptsModule.getStylePrompt).mockReturnValue('Academic style');

    const mockJobInput: GenerationJobInput = {
      course_id: 'course-style',
      organization_id: 'org-style',
      user_id: 'user-style',
      analysis_result: null,
      frontend_parameters: {
        course_title: 'Test',
        style: 'academic',
      },
      vectorized_documents: false,
    };

    const generator = new MetadataGenerator();
    await generator.generate(mockJobInput);

    expect(stylePromptsModule.getStylePrompt).toHaveBeenCalledWith('academic');
  });

  it('should extract language from frontend_parameters (FR-027)', async () => {
    const mockMetadata: Partial<CourseStructure> = {
      course_title: 'Curso de Prueba',
      course_description: 'Descripción completa del curso cubriendo todos los temas principales y objetivos de aprendizaje',
      course_overview: 'Este curso proporciona una visión general de conceptos fundamentales y principios, diseñado para estudiantes sin experiencia previa en el área',
      target_audience: 'Principiantes sin experiencia previa requerida en el tema',
      estimated_duration_hours: 1,
      difficulty_level: 'beginner',
      prerequisites: [],
      learning_outcomes: [
        'Explicar conceptos básicos y fundamentales',
        'Demostrar técnicas básicas en problemas simples',
        'Identificar componentes clave y relaciones',
      ],
      assessment_strategy: {
        quiz_per_section: false,
        final_exam: false,
        practical_projects: 0,
        assessment_description: 'Aprendizaje autónomo con ejercicios opcionales y problemas de práctica para reforzar habilidades',
      },
      course_tags: ['test', 'fundamentales', 'principiantes', 'basico', 'introduccion'],
    };

    const mockInvoke = vi.fn().mockResolvedValue({
      content: JSON.stringify(mockMetadata),
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
          data: mockMetadata,
          metadata: {
            layerUsed: 'auto-repair',
            retryCount: 0,
            qualityPassed: true,
            tokenCost: 0,
          },
        })
      } as any
    );

    vi.mocked(stylePromptsModule.getStylePrompt).mockReturnValue('Style');

    const mockJobInput: GenerationJobInput = {
      course_id: 'course-lang',
      organization_id: 'org-lang',
      user_id: 'user-lang',
      analysis_result: null,
      frontend_parameters: {
        course_title: 'Test',
        language: 'es', // Should use this
      },
      vectorized_documents: false,
    };

    const generator = new MetadataGenerator();
    await generator.generate(mockJobInput);

    expect(mockInvoke).toHaveBeenCalledWith(expect.stringContaining('Target Language**: es'));
  });

  it('should configure UnifiedRegenerator with Layers 1-2 (RT-005)', async () => {
    const mockMetadata: Partial<CourseStructure> = {
      course_title: 'Test Course Title',
      course_description: 'Comprehensive description of the test course covering fundamental concepts and practical applications',
      course_overview: 'This course provides a complete overview of test methodologies and best practices, designed for beginners seeking to build foundational knowledge',
      target_audience: 'Beginners with no prior testing experience required',
      estimated_duration_hours: 5,
      difficulty_level: 'beginner',
      prerequisites: [],
      learning_outcomes: [
        'Explain fundamental testing concepts and principles',
        'Demonstrate basic testing techniques on real scenarios',
        'Identify common testing patterns and anti-patterns',
      ],
      assessment_strategy: {
        quiz_per_section: false,
        final_exam: false,
        practical_projects: 0,
        assessment_description: 'Self-paced learning with hands-on exercises and practical examples for reinforcement',
      },
      course_tags: ['test', 'fundamentals', 'beginner', 'basics', 'introduction'],
    };

    vi.mocked(ChatOpenAI).mockImplementation(
      class {
        invoke = vi.fn().mockResolvedValue({
          content: JSON.stringify(mockMetadata),
        })
      } as any
    );

    vi.mocked(regenerationModule.UnifiedRegenerator).mockImplementation(
      class {
        regenerate = vi.fn().mockResolvedValue({
          success: true,
          data: mockMetadata,
          metadata: {
            layerUsed: 'auto-repair',
            retryCount: 0,
            qualityPassed: true,
            tokenCost: 0,
          },
        })
      } as any
    );

    vi.mocked(stylePromptsModule.getStylePrompt).mockReturnValue('Style');

    const mockJobInput: GenerationJobInput = {
      course_id: 'course-regen',
      organization_id: 'org-regen',
      user_id: 'user-regen',
      analysis_result: null,
      frontend_parameters: {
        course_title: 'Test',
      },
      vectorized_documents: false,
    };

    const generator = new MetadataGenerator();
    await generator.generate(mockJobInput);

    expect(regenerationModule.UnifiedRegenerator).toHaveBeenCalledWith(
      expect.objectContaining({
        enabledLayers: ['auto-repair', 'critique-revise'],
        maxRetries: 2,
        stage: 'generation',
        courseId: 'course-regen',
        phaseId: 'metadata_generator',
      })
    );
  });
});
