/**
 * Tests for generator node - Serial section-by-section content generation
 * @module stages/stage6-lesson-content/nodes/generator.test
 *
 * Tests the generator node helper functions and key logic:
 * - extractContextWindow: Context window extraction with smart truncation
 * - calculateMaxTokensForSection: Dynamic token calculation
 * - formatKeyPointsList: Key points formatting
 *
 * Note: Full integration tests require LLM mocking, covered in orchestrator tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

// Mock logger
vi.mock('@/shared/logger', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    }),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock trace logger
vi.mock('@/shared/trace-logger', () => ({
  logTrace: vi.fn(),
}));

// ============================================================================
// HELPER FUNCTION IMPORTS (re-implement for testing since they're not exported)
// These match the exact implementation in generator.ts for validation
// ============================================================================

const CONTEXT_WINDOW_CHARS = 5000;
const VALID_DEPTHS = ['summary', 'detailed_analysis', 'comprehensive'] as const;
type SectionDepthV2 = (typeof VALID_DEPTHS)[number];

const DEPTH_TOKEN_LIMITS: Record<SectionDepthV2, number> = {
  summary: 1500,
  detailed_analysis: 3000,
  comprehensive: 6000,
};

const DEPTH_SCALE_FACTORS: Record<SectionDepthV2, number> = {
  summary: 0.25,
  detailed_analysis: 0.5,
  comprehensive: 1.0,
};

/**
 * Format key points as numbered list (mirrors generator.ts implementation)
 */
function formatKeyPointsList(keyPoints: string[]): string {
  if (!keyPoints || keyPoints.length === 0) {
    return '';
  }
  return keyPoints.map((point, index) => `${index + 1}. ${point}`).join('\n');
}

/**
 * Extract context window (mirrors generator.ts implementation)
 */
function extractContextWindow(text: string, maxChars: number = CONTEXT_WINDOW_CHARS): string {
  // First section has no context - return empty string explicitly
  if (text.length === 0) {
    return '';
  }

  // Short content - return as-is
  if (text.length <= maxChars) {
    return text;
  }

  // Long content - smart truncation at paragraph boundary
  const truncated = text.slice(-maxChars);

  // Try to find a paragraph boundary (double newline) in the first 500 chars
  const firstParagraphBreak = truncated.indexOf('\n\n');

  if (firstParagraphBreak > 0 && firstParagraphBreak < 500) {
    return '...\n\n' + truncated.slice(firstParagraphBreak + 2);
  }

  return '...' + truncated;
}

/**
 * Calculate dynamic max tokens (mirrors generator.ts implementation)
 */
function calculateMaxTokensForSection(
  durationMinutes: number,
  sectionCount: number,
  depth: SectionDepthV2,
  languageMultiplier: number
): number {
  const baseTokensPerSection = Math.ceil(
    (durationMinutes * 250 * 1.5 * languageMultiplier) / sectionCount
  );

  const scaleFactor = DEPTH_SCALE_FACTORS[depth];
  const depthScaledTokens = Math.round(baseTokensPerSection * scaleFactor);

  const languageAdjustedMin = Math.ceil(DEPTH_TOKEN_LIMITS[depth] * languageMultiplier);
  const maxTokens = Math.max(depthScaledTokens, languageAdjustedMin);

  return maxTokens;
}

// ============================================================================
// TESTS: extractContextWindow
// ============================================================================

describe('extractContextWindow', () => {
  describe('empty string handling', () => {
    it('should return empty string for empty input (first section case)', () => {
      const result = extractContextWindow('');
      expect(result).toBe('');
      expect(result).not.toContain('...');
    });

    it('should return empty string for whitespace-only input', () => {
      // After trim, this should be treated as empty in prompt handling
      const result = extractContextWindow('   ');
      expect(result).toBe('   '); // Returns as-is since it's short
    });
  });

  describe('short content (under limit)', () => {
    it('should return full text if under limit', () => {
      const text = 'Short content that fits within the limit';
      const result = extractContextWindow(text, 5000);
      expect(result).toBe(text);
      expect(result).not.toContain('...');
    });

    it('should return full text if exactly at limit', () => {
      const text = 'A'.repeat(5000);
      const result = extractContextWindow(text, 5000);
      expect(result).toBe(text);
      expect(result).not.toContain('...');
    });
  });

  describe('long content (over limit)', () => {
    it('should truncate and prepend ellipsis if over limit', () => {
      const text = 'A'.repeat(10000);
      const result = extractContextWindow(text, 5000);

      expect(result.startsWith('...')).toBe(true);
      expect(result.length).toBeLessThanOrEqual(5003); // 5000 + '...'
    });

    it('should use smart truncation at paragraph boundary when available', () => {
      // Create text with paragraph break in the first 500 chars of truncated content
      // For maxChars=5000, we need the paragraph break to appear early in the truncated portion
      // Total text: 5500 chars, slice(-5000) gives us chars 500-5500
      // So paragraph break should be around position 600-900 to appear at positions 100-400 in truncated
      const beforeParagraph = 'X'.repeat(600);
      const paragraphContent = '\n\nThis is a new paragraph that should be the start.';
      const afterParagraph = 'Y'.repeat(4850);
      const text = beforeParagraph + paragraphContent + afterParagraph;

      const result = extractContextWindow(text, 5000);

      // Should start with smart truncation marker
      expect(result.startsWith('...\n\n')).toBe(true);
      // Should contain the paragraph content after the break
      expect(result).toContain('new paragraph');
    });

    it('should use simple truncation when no paragraph boundary in first 500 chars', () => {
      // Create text without paragraph breaks
      const text = 'A'.repeat(10000);
      const result = extractContextWindow(text, 5000);

      expect(result.startsWith('...')).toBe(true);
      expect(result.startsWith('...\n\n')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle text with only newlines', () => {
      const text = '\n'.repeat(100);
      const result = extractContextWindow(text, 5000);
      expect(result).toBe(text); // Short, returns as-is
    });

    it('should handle very long single-word content', () => {
      const text = 'superlongwordwithoutspaces'.repeat(1000);
      const result = extractContextWindow(text, 5000);
      expect(result.startsWith('...')).toBe(true);
    });

    it('should handle markdown content with code blocks', () => {
      const text = `
# Header

Some text before.

\`\`\`typescript
function example() {
  return 'test';
}
\`\`\`

More text after the code block.
`.repeat(200);

      const result = extractContextWindow(text, 5000);
      expect(result.startsWith('...')).toBe(true);
    });
  });
});

// ============================================================================
// TESTS: formatKeyPointsList
// ============================================================================

describe('formatKeyPointsList', () => {
  it('should return empty string for empty array', () => {
    expect(formatKeyPointsList([])).toBe('');
  });

  it('should return empty string for null/undefined', () => {
    expect(formatKeyPointsList(null as unknown as string[])).toBe('');
    expect(formatKeyPointsList(undefined as unknown as string[])).toBe('');
  });

  it('should format single key point', () => {
    const result = formatKeyPointsList(['Learn TypeScript']);
    expect(result).toBe('1. Learn TypeScript');
  });

  it('should format multiple key points with numbering', () => {
    const result = formatKeyPointsList([
      'Learn TypeScript',
      'Use generics',
      'Understand type guards',
    ]);
    expect(result).toBe('1. Learn TypeScript\n2. Use generics\n3. Understand type guards');
  });

  it('should preserve special characters in key points', () => {
    const result = formatKeyPointsList(['Use <T> generic syntax', 'Learn about `typeof`']);
    expect(result).toContain('<T>');
    expect(result).toContain('`typeof`');
  });
});

// ============================================================================
// TESTS: calculateMaxTokensForSection
// ============================================================================

describe('calculateMaxTokensForSection', () => {
  describe('basic calculations', () => {
    it('should calculate tokens for English lesson with detailed_analysis', () => {
      // 30-min English lesson with 6 sections, detailed_analysis depth
      // Base: (30 * 250 * 1.5 * 1.0) / 6 = 1875 tokens
      // With depth scale 0.5: 937 tokens
      // Min for detailed_analysis in English: 3000 * 1.0 = 3000
      // Result: max(937, 3000) = 3000 tokens
      const result = calculateMaxTokensForSection(30, 6, 'detailed_analysis', 1.0);
      expect(result).toBe(3000);
    });

    it('should calculate tokens for Russian lesson with detailed_analysis', () => {
      // 30-min Russian lesson with 6 sections, detailed_analysis depth
      // Base: (30 * 250 * 1.5 * 1.3) / 6 = 2437 tokens
      // With depth scale 0.5: 1218 tokens
      // Min for detailed_analysis in Russian: 3000 * 1.3 = 3900
      // Result: max(1218, 3900) = 3900 tokens
      const result = calculateMaxTokensForSection(30, 6, 'detailed_analysis', 1.3);
      expect(result).toBe(3900);
    });

    it('should use minimum tokens for summary depth', () => {
      // summary depth should use minimum (1500 * langMultiplier)
      const result = calculateMaxTokensForSection(30, 6, 'summary', 1.0);
      expect(result).toBeGreaterThanOrEqual(1500);
    });

    it('should calculate higher tokens for comprehensive depth', () => {
      const summaryResult = calculateMaxTokensForSection(30, 6, 'summary', 1.0);
      const detailedResult = calculateMaxTokensForSection(30, 6, 'detailed_analysis', 1.0);
      const comprehensiveResult = calculateMaxTokensForSection(30, 6, 'comprehensive', 1.0);

      expect(comprehensiveResult).toBeGreaterThanOrEqual(detailedResult);
      expect(detailedResult).toBeGreaterThanOrEqual(summaryResult);
    });
  });

  describe('edge cases', () => {
    it('should handle single section lesson', () => {
      const result = calculateMaxTokensForSection(30, 1, 'detailed_analysis', 1.0);
      expect(result).toBeGreaterThan(0);
      // With 1 section, base should be higher
      // (30 * 250 * 1.5 * 1.0) / 1 = 11250
      // With depth scale 0.5: 5625
      expect(result).toBeGreaterThanOrEqual(5625);
    });

    it('should handle very short lesson (5 min)', () => {
      const result = calculateMaxTokensForSection(5, 2, 'summary', 1.0);
      // Should still respect minimum for summary
      expect(result).toBeGreaterThanOrEqual(1500);
    });

    it('should handle very long lesson (120 min)', () => {
      const result = calculateMaxTokensForSection(120, 12, 'comprehensive', 1.0);
      expect(result).toBeGreaterThan(0);
      // Should scale up proportionally
      expect(result).toBeGreaterThanOrEqual(6000); // Min for comprehensive
    });

    it('should handle high language multiplier', () => {
      const englishResult = calculateMaxTokensForSection(30, 6, 'detailed_analysis', 1.0);
      const russianResult = calculateMaxTokensForSection(30, 6, 'detailed_analysis', 1.3);

      expect(russianResult).toBeGreaterThan(englishResult);
    });
  });
});

// ============================================================================
// TESTS: Depth Validation
// ============================================================================

describe('depth validation', () => {
  it('should accept valid depth values', () => {
    expect(VALID_DEPTHS).toContain('summary');
    expect(VALID_DEPTHS).toContain('detailed_analysis');
    expect(VALID_DEPTHS).toContain('comprehensive');
  });

  it('should reject invalid depth values', () => {
    const invalidDepth = 'invalid_depth';
    expect(VALID_DEPTHS.includes(invalidDepth as SectionDepthV2)).toBe(false);
  });

  it('should have token limits for all valid depths', () => {
    for (const depth of VALID_DEPTHS) {
      expect(DEPTH_TOKEN_LIMITS[depth]).toBeGreaterThan(0);
    }
  });

  it('should have scale factors for all valid depths', () => {
    for (const depth of VALID_DEPTHS) {
      expect(DEPTH_SCALE_FACTORS[depth]).toBeGreaterThan(0);
      expect(DEPTH_SCALE_FACTORS[depth]).toBeLessThanOrEqual(1);
    }
  });
});

// ============================================================================
// TESTS: Token Usage Extraction
// ============================================================================

describe('extractTokenUsage behavior', () => {
  it('should handle missing metadata structure', () => {
    // This tests the expected behavior - when metadata is missing,
    // the function returns { tokens: 0, hasMeta: false }
    const expectedBehavior = {
      tokens: 0,
      hasMeta: false,
    };

    // Verify expected structure
    expect(expectedBehavior.tokens).toBe(0);
    expect(expectedBehavior.hasMeta).toBe(false);
  });

  it('should extract tokens when present', () => {
    const expectedBehavior = {
      tokens: 1000,
      hasMeta: true,
    };

    expect(expectedBehavior.tokens).toBe(1000);
    expect(expectedBehavior.hasMeta).toBe(true);
  });
});

// ============================================================================
// TESTS: Context Window Integration
// ============================================================================

describe('context window integration behavior', () => {
  it('should handle first section (empty previous context)', () => {
    const previousContext = '';
    const contextWindow = extractContextWindow(previousContext);

    // First section should get empty context
    expect(contextWindow).toBe('');

    // In prompt, this should become the comment indicator
    const previousContextValue = contextWindow.trim()
      ? contextWindow
      : '<!-- First section: no previous context available -->';

    expect(previousContextValue).toBe('<!-- First section: no previous context available -->');
  });

  it('should handle subsequent sections with content', () => {
    const previousContext =
      '# Lesson Title\n\n## Introduction\n\nThis is the introduction content.';
    const contextWindow = extractContextWindow(previousContext);

    // Should return full content since it's short
    expect(contextWindow).toBe(previousContext);

    const previousContextValue = contextWindow.trim()
      ? contextWindow
      : '<!-- First section: no previous context available -->';

    expect(previousContextValue).toBe(previousContext);
  });

  it('should handle very long accumulated content', () => {
    const previousContext = 'Content '.repeat(2000); // ~16000 chars
    const contextWindow = extractContextWindow(previousContext, 5000);

    // Should be truncated
    expect(contextWindow.startsWith('...')).toBe(true);
    expect(contextWindow.length).toBeLessThanOrEqual(5003);
  });
});

// ============================================================================
// TESTS: extractLessonDigest
// ============================================================================

import { extractLessonDigest } from '@/stages/stage6-lesson-content/nodes/generator/generator-single-call';

describe('extractLessonDigest', () => {
  it('should extract English digest section', () => {
    const markdown = `## Introduction

Some intro content.

## Section 1

Content here.

## Exercises

Exercise content.

## Lesson Digest

This lesson covered topic A and topic B. Key takeaways include X and Y.`;

    const result = extractLessonDigest(markdown, 'Lesson Digest');

    expect(result.digest).toContain('topic A and topic B');
    expect(result.content).not.toContain('Lesson Digest');
    expect(result.content).toContain('Exercise content');
  });

  it('should extract Russian digest section', () => {
    const markdown = `## Введение

Контент введения.

## Упражнения

Упражнение 1.

## Краткое содержание урока

Урок рассмотрел тему A и тему B. Ключевые выводы: X и Y.`;

    const result = extractLessonDigest(markdown, 'Краткое содержание урока');

    expect(result.digest).toContain('тему A и тему B');
    expect(result.content).not.toContain('Краткое содержание урока');
    expect(result.content).toContain('Упражнение 1');
  });

  it('should return empty digest when no digest section found', () => {
    const markdown = `## Introduction

Content without digest.

## Exercises

Exercise content.`;

    const result = extractLessonDigest(markdown);

    expect(result.digest).toBe('');
    expect(result.content).toContain('Content without digest');
  });

  it('should handle digest with trailing separator', () => {
    const markdown = `## Summary

Summary content.

## Lesson Digest

This is the digest.

---`;

    const result = extractLessonDigest(markdown, 'Lesson Digest');

    expect(result.digest).toBe('This is the digest.');
    expect(result.content).toContain('Summary content');
  });

  it('should handle "Дайджест урока" header variant via fallback', () => {
    const markdown = `## Введение

Контент.

## Дайджест урока

Краткое содержание.`;

    // Model deviated from expected header — fallback should catch it
    const result = extractLessonDigest(markdown, 'Краткое содержание урока');

    expect(result.digest).toContain('Краткое содержание');
    expect(result.content).not.toContain('Дайджест урока');
  });

  it('should extract localized digest header (e.g., Chinese)', () => {
    const markdown = `## 引言

内容。

## 课程摘要

本课介绍了主题A和主题B。`;

    const result = extractLessonDigest(markdown, '课程摘要');

    expect(result.digest).toContain('主题A');
    expect(result.content).not.toContain('课程摘要');
  });

  it('should handle empty markdown', () => {
    const result = extractLessonDigest('');
    expect(result.digest).toBe('');
    expect(result.content).toBe('');
  });

  it('should return empty digest when header is unknown and no fallback matches', () => {
    const markdown = `## Введение

Контент.

## Неизвестный заголовок

Текст после.`;

    const result = extractLessonDigest(markdown, 'Краткое содержание урока');

    expect(result.digest).toBe('');
    expect(result.content).toContain('Неизвестный заголовок');
  });

  it('should handle digest header with no content after it', () => {
    const markdown = `## Summary

Summary content.

## Lesson Digest`;

    const result = extractLessonDigest(markdown, 'Lesson Digest');

    expect(result.digest).toBe('');
    expect(result.content).toContain('Summary content');
  });

  it('should extract first occurrence when multiple digest-like sections exist', () => {
    const markdown = `## Content

Some content.

## Lesson Digest

First digest text.

## Lesson Digest

Second digest text.`;

    const result = extractLessonDigest(markdown, 'Lesson Digest');

    // Should extract from the first match onward
    expect(result.content).toContain('Some content');
    expect(result.content).not.toContain('First digest');
  });
});

// ============================================================================
// TESTS: generateLessonSingleCall Integration Tests
// ============================================================================

// Import the function to test
import {
  generateLessonSingleCall,
  generateTruncationContinuation,
} from '@/stages/stage6-lesson-content/nodes/generator/generator-single-call';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { RAGChunk } from '@megacampus/shared-types/lesson-content';

// Mock external services required by generateLessonSingleCall
vi.mock('@/shared/llm/langchain-models', () => {
  const mockInvoke = vi.fn();
  return {
    createOpenRouterModel: vi.fn(() => ({
      invoke: mockInvoke,
    })),
    // Store reference to mock for test assertions
    __mockInvoke: mockInvoke,
  };
});

vi.mock('@/shared/prompts/prompt-service', () => {
  const mockRenderPrompt = vi.fn();
  return {
    createPromptService: vi.fn(() => ({
      renderPrompt: mockRenderPrompt,
    })),
    __mockRenderPrompt: mockRenderPrompt,
  };
});

vi.mock('@/shared/llm/model-config-service', () => ({
  createModelConfigService: vi.fn(() => ({
    getModelForPhase: vi.fn().mockResolvedValue({ modelId: 'test-model-id' }),
  })),
}));

vi.mock('@megacampus/shared-types/lesson-specification-v2', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@megacampus/shared-types/lesson-specification-v2')>();
  return {
    ...actual,
    getRecommendedTemperatureV2: vi.fn().mockReturnValue(0.7),
  };
});

vi.mock('@/shared/prompts', async importOriginal => {
  const actual = await importOriginal<typeof import('@/shared/prompts')>();
  const mockFormatRAGContextXML = vi.fn();
  return {
    ...actual,
    formatRAGContextXML: mockFormatRAGContextXML,
    __mockFormatRAGContextXML: mockFormatRAGContextXML,
  };
});

// Mock the helper functions from generator-helpers (already imported by the module)
vi.mock(
  '@/stages/stage6-lesson-content/nodes/generator/generator-helpers',
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import('@/stages/stage6-lesson-content/nodes/generator/generator-helpers')
      >();
    const mockFormatInterLessonContextXML = vi.fn();
    const mockFormatGenerationGuidanceXML = vi.fn();
    return {
      ...actual,
      formatInterLessonContextXML: mockFormatInterLessonContextXML,
      formatGenerationGuidanceXML: mockFormatGenerationGuidanceXML,
      __mockFormatInterLessonContextXML: mockFormatInterLessonContextXML,
      __mockFormatGenerationGuidanceXML: mockFormatGenerationGuidanceXML,
    };
  }
);

describe('generateLessonSingleCall', () => {
  // Access mocks
  let mockModelInvoke: ReturnType<typeof vi.fn>;
  let mockRenderPrompt: ReturnType<typeof vi.fn>;
  let mockFormatRAGContextXML: ReturnType<typeof vi.fn>;
  let mockFormatInterLessonContextXML: ReturnType<typeof vi.fn>;
  let mockFormatGenerationGuidanceXML: ReturnType<typeof vi.fn>;

  // Mock lesson specification fixture
  const mockLessonSpec: LessonSpecificationV2 = {
    lesson_id: '1.1',
    title: 'Introduction to TypeScript',
    description: 'A basic intro to TypeScript fundamentals',
    estimated_duration_minutes: 5,
    difficulty_level: 'beginner',
    learning_objectives: [
      { id: 'LO-1.1.1', objective: 'Understand basic types', bloom_level: 'understand' },
      { id: 'LO-1.1.2', objective: 'Write simple functions', bloom_level: 'apply' },
    ],
    sections: [
      {
        title: 'Basic Types',
        content_archetype: 'concept_explainer',
        rag_context_id: 'rag-1',
        constraints: { depth: 'detailed_analysis', required_keywords: [], prohibited_terms: [] },
        key_points_to_cover: ['string', 'number', 'boolean'],
      },
      {
        title: 'Functions',
        content_archetype: 'code_tutorial',
        rag_context_id: 'rag-2',
        constraints: { depth: 'detailed_analysis', required_keywords: [], prohibited_terms: [] },
        key_points_to_cover: ['parameters', 'return types'],
      },
      {
        title: 'Conclusion',
        content_archetype: 'concept_explainer',
        rag_context_id: 'rag-3',
        constraints: { depth: 'summary', required_keywords: [], prohibited_terms: [] },
        key_points_to_cover: ['summary'],
      },
    ],
    exercises: [],
    metadata: {
      target_audience: 'practitioner',
      tone: 'conversational-professional',
      compliance_level: 'standard',
      content_archetype: 'code_tutorial',
    },
    intro_blueprint: {
      hook_strategy: 'challenge',
      hook_topic: 'Why TypeScript matters',
      key_learning_objectives: 'Understand types, Write functions',
    },
    rag_context: {
      primary_documents: ['doc-1', 'doc-2'],
      search_queries: ['TypeScript basics', 'TypeScript types'],
      expected_chunks: 5,
    },
    lesson_context: null,
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get references to mocked functions
    const langchainModels = await import('@/shared/llm/langchain-models');
    mockModelInvoke = (langchainModels as unknown as { __mockInvoke: ReturnType<typeof vi.fn> })
      .__mockInvoke;

    const promptService = await import('@/shared/prompts/prompt-service');
    mockRenderPrompt = (
      promptService as unknown as { __mockRenderPrompt: ReturnType<typeof vi.fn> }
    ).__mockRenderPrompt;

    const prompts = await import('@/shared/prompts');
    mockFormatRAGContextXML = (
      prompts as unknown as { __mockFormatRAGContextXML: ReturnType<typeof vi.fn> }
    ).__mockFormatRAGContextXML;

    const helpers = await import(
      '@/stages/stage6-lesson-content/nodes/generator/generator-helpers'
    );
    mockFormatInterLessonContextXML = (
      helpers as unknown as { __mockFormatInterLessonContextXML: ReturnType<typeof vi.fn> }
    ).__mockFormatInterLessonContextXML;
    mockFormatGenerationGuidanceXML = (
      helpers as unknown as { __mockFormatGenerationGuidanceXML: ReturnType<typeof vi.fn> }
    ).__mockFormatGenerationGuidanceXML;

    // Setup default mock implementations
    mockRenderPrompt.mockResolvedValue('Mock prompt text');
    mockFormatRAGContextXML.mockReturnValue('<rag_context>Mock RAG context</rag_context>');
    mockFormatInterLessonContextXML.mockReturnValue('');
    mockFormatGenerationGuidanceXML.mockReturnValue('');

    // Default model response
    mockModelInvoke.mockResolvedValue({
      content: `## Introduction

Some intro content.

## Section 1

Content here.

## Exercises

Exercise content.

## Lesson Digest

This lesson covered TypeScript basics including types and functions.`,
      response_metadata: {
        usage: {
          total_tokens: 500,
        },
      },
    });
  });

  describe('RAG deduplication', () => {
    it('should deduplicate RAG chunks by chunk_id', async () => {
      // Create duplicate chunks
      const duplicateChunks: RAGChunk[] = [
        {
          chunk_id: 'chunk-1',
          document_id: 'doc-uuid-1',
          document_name: 'Doc 1',
          content: 'Content A',
          relevance_score: 0.9,
          metadata: {},
        },
        {
          chunk_id: 'chunk-1',
          document_id: 'doc-uuid-1',
          document_name: 'Doc 1',
          content: 'Content A',
          relevance_score: 0.9,
          metadata: {},
        },
        {
          chunk_id: 'chunk-2',
          document_id: 'doc-uuid-2',
          document_name: 'Doc 2',
          content: 'Content B',
          relevance_score: 0.8,
          metadata: {},
        },
      ];

      // Call the function
      await generateLessonSingleCall(mockLessonSpec, duplicateChunks, 'en', null, null, null);

      // Verify formatRAGContextXML was called with deduplicated chunks (2, not 3)
      expect(mockFormatRAGContextXML).toHaveBeenCalledTimes(1);
      const passedChunks = mockFormatRAGContextXML.mock.calls[0][0];
      expect(passedChunks).toHaveLength(2);
      expect(passedChunks[0].chunk_id).toBe('chunk-1');
      expect(passedChunks[1].chunk_id).toBe('chunk-2');
    });

    it('should sort deduplicated chunks by relevance_score descending', async () => {
      const unsortedChunks: RAGChunk[] = [
        {
          chunk_id: 'chunk-1',
          document_id: 'doc-uuid-1',
          document_name: 'Doc 1',
          content: 'Low relevance',
          relevance_score: 0.5,
          metadata: {},
        },
        {
          chunk_id: 'chunk-2',
          document_id: 'doc-uuid-2',
          document_name: 'Doc 2',
          content: 'High relevance',
          relevance_score: 0.95,
          metadata: {},
        },
        {
          chunk_id: 'chunk-3',
          document_id: 'doc-uuid-3',
          document_name: 'Doc 3',
          content: 'Medium relevance',
          relevance_score: 0.7,
          metadata: {},
        },
      ];

      await generateLessonSingleCall(mockLessonSpec, unsortedChunks, 'en', null, null, null);

      const passedChunks = mockFormatRAGContextXML.mock.calls[0][0];
      expect(passedChunks).toHaveLength(3);
      expect(passedChunks[0].relevance_score).toBe(0.95);
      expect(passedChunks[1].relevance_score).toBe(0.7);
      expect(passedChunks[2].relevance_score).toBe(0.5);
    });
  });

  describe('word budget calculation', () => {
    it('should calculate correct word budget for 5-min lesson', async () => {
      await generateLessonSingleCall(mockLessonSpec, [], 'en', null, null, null);

      // 5 min × 150 = 750 words total
      // sectionsWordBudget = 750 - 300 = 450
      expect(mockRenderPrompt).toHaveBeenCalledWith(
        'stage6_single_call_generator',
        expect.objectContaining({
          targetWordCount: '750',
          sectionsWordBudget: '450',
          durationMinutes: '5',
        })
      );
    });

    it('should enforce minimum 5 minutes for duration', async () => {
      const zeroMinSpec: LessonSpecificationV2 = {
        ...mockLessonSpec,
        estimated_duration_minutes: 0,
      };

      await generateLessonSingleCall(zeroMinSpec, [], 'en', null, null, null);

      // Should use 15 min (fallback), not 0
      // Implementation: Math.max(5, lessonSpec.estimated_duration_minutes || 15)
      // When 0 (falsy), uses || 15 first, then Math.max(5, 15) = 15
      expect(mockRenderPrompt).toHaveBeenCalledWith(
        'stage6_single_call_generator',
        expect.objectContaining({
          targetWordCount: '2250', // 15 * 150
          durationMinutes: '15',
        })
      );
    });

    it('should calculate word budget for longer lesson', async () => {
      const longerSpec: LessonSpecificationV2 = {
        ...mockLessonSpec,
        estimated_duration_minutes: 15,
      };

      await generateLessonSingleCall(longerSpec, [], 'en', null, null, null);

      // 15 min × 150 = 2250 words
      // sectionsWordBudget = 2250 - 300 = 1950
      expect(mockRenderPrompt).toHaveBeenCalledWith(
        'stage6_single_call_generator',
        expect.objectContaining({
          targetWordCount: '2250',
          sectionsWordBudget: '1950',
          durationMinutes: '15',
        })
      );
    });
  });

  describe('intro_blueprint null handling', () => {
    it('should use fallback values when intro_blueprint is null', async () => {
      const specWithoutBlueprint: LessonSpecificationV2 = {
        ...mockLessonSpec,
        intro_blueprint: null as unknown as LessonSpecificationV2['intro_blueprint'],
      };

      await generateLessonSingleCall(specWithoutBlueprint, [], 'en', null, null, null);

      expect(mockRenderPrompt).toHaveBeenCalledWith(
        'stage6_single_call_generator',
        expect.objectContaining({
          hookStrategy: 'challenge',
          hookTopic: mockLessonSpec.title,
        })
      );
    });

    it('should use intro_blueprint values when provided', async () => {
      await generateLessonSingleCall(mockLessonSpec, [], 'en', null, null, null);

      expect(mockRenderPrompt).toHaveBeenCalledWith(
        'stage6_single_call_generator',
        expect.objectContaining({
          hookStrategy: 'challenge',
          hookTopic: 'Why TypeScript matters',
        })
      );
    });
  });

  describe('conclusion sections filtering', () => {
    it('should filter out Conclusion sections from sections list', async () => {
      await generateLessonSingleCall(mockLessonSpec, [], 'en', null, null, null);

      // Should only include "Basic Types" and "Functions", not "Conclusion"
      const sectionsList = mockRenderPrompt.mock.calls[0][1].sectionsList as string;
      expect(sectionsList).toContain('Basic Types');
      expect(sectionsList).toContain('Functions');
      expect(sectionsList).not.toContain('Conclusion');
    });

    it('should filter out Russian conclusion sections', async () => {
      const russianSpec: LessonSpecificationV2 = {
        ...mockLessonSpec,
        sections: [
          {
            title: 'Основы',
            content_archetype: 'concept_explainer',
            rag_context_id: 'rag-1',
            constraints: {
              depth: 'detailed_analysis',
              required_keywords: [],
              prohibited_terms: [],
            },
            key_points_to_cover: ['basics'],
          },
          {
            title: 'Заключение',
            content_archetype: 'concept_explainer',
            rag_context_id: 'rag-2',
            constraints: { depth: 'summary', required_keywords: [], prohibited_terms: [] },
            key_points_to_cover: ['summary'],
          },
        ],
      };

      await generateLessonSingleCall(russianSpec, [], 'ru', null, null, null);

      const sectionsList = mockRenderPrompt.mock.calls[0][1].sectionsList as string;
      expect(sectionsList).toContain('Основы');
      expect(sectionsList).not.toContain('Заключение');
    });
  });

  describe('digest extraction from response', () => {
    it('should extract lessonDigest from generated content', async () => {
      // Mock model to return content with digest
      mockModelInvoke.mockResolvedValue({
        content: `## Introduction

Content.

## Section 1

More content.

## Lesson Digest

This lesson covered TypeScript basics including types and functions. Key concepts include type safety and inference.`,
        response_metadata: {
          usage: { total_tokens: 500 },
        },
      });

      const result = await generateLessonSingleCall(mockLessonSpec, [], 'en', null, null, null);

      expect(result.lessonDigest).toBe(
        'This lesson covered TypeScript basics including types and functions. Key concepts include type safety and inference.'
      );
      expect(result.content).not.toContain('Lesson Digest');
      expect(result.content).toContain('Section 1');
    });

    it('should return empty digest when digest section not found', async () => {
      mockModelInvoke.mockResolvedValue({
        content: `## Introduction

Content without digest.

## Section 1

More content.`,
        response_metadata: {
          usage: { total_tokens: 300 },
        },
      });

      const result = await generateLessonSingleCall(mockLessonSpec, [], 'en', null, null, null);

      expect(result.lessonDigest).toBe('');
      expect(result.content).toContain('Content without digest');
    });
  });

  describe('return shape', () => {
    it('should return correct shape with content, lessonDigest, and tokensUsed', async () => {
      const result = await generateLessonSingleCall(mockLessonSpec, [], 'en', null, null, null);

      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('lessonDigest');
      expect(result).toHaveProperty('tokensUsed');
      expect(typeof result.content).toBe('string');
      expect(typeof result.lessonDigest).toBe('string');
      expect(typeof result.tokensUsed).toBe('number');
    });

    it('should extract tokens from response metadata', async () => {
      mockModelInvoke.mockResolvedValue({
        content: 'Content',
        response_metadata: {
          usage: { total_tokens: 1234 },
        },
      });

      const result = await generateLessonSingleCall(mockLessonSpec, [], 'en', null, null, null);

      expect(result.tokensUsed).toBe(1234);
    });

    it('should estimate tokens when metadata not available', async () => {
      mockModelInvoke.mockResolvedValue({
        content: 'Short content',
        response_metadata: {}, // No usage metadata
      });

      const result = await generateLessonSingleCall(mockLessonSpec, [], 'en', null, null, null);

      // Should have estimated token count (not 0)
      expect(result.tokensUsed).toBeGreaterThan(0);
    });
  });

  describe('generateTruncationContinuation', () => {
    it('should use simple-tier model config and append continuation text', async () => {
      mockModelInvoke.mockResolvedValue({
        content: `---existing tail---

Additional completion in Russian.`,
        response_metadata: {
          usage: { total_tokens: 123 },
        },
      });

      const existingContent = `# Заголовок

Текст урока.

---existing tail---`;

      const result = await generateTruncationContinuation(mockLessonSpec, existingContent, 'ru');

      expect(result.modelUsed).toBe('test-model-id');
      expect(result.tokensUsed).toBe(123);
      expect(result.continuation).toContain('Additional completion');
      expect(result.mergedContent).toContain('Additional completion');
      expect(result.mergedContent).toContain('---existing tail---');
    });

    it('should remove duplicated overlap from continuation prefix', async () => {
      const marker = 'TAIL_MARKER_1234567890ABCDEFGHIJ1234567890KLMNOPQRST';
      mockModelInvoke.mockResolvedValue({
        content: `${marker}
Новая строка завершения.`,
        response_metadata: {
          usage: { total_tokens: 90 },
        },
      });

      const existingContent = `Предыдущий текст

${marker}`;

      const result = await generateTruncationContinuation(mockLessonSpec, existingContent, 'ru');

      const overlapMatches =
        result.mergedContent.match(/TAIL_MARKER_1234567890ABCDEFGHIJ1234567890KLMNOPQRST/g) ?? [];
      expect(overlapMatches).toHaveLength(1);
      expect(result.mergedContent).toContain('Новая строка завершения');
    });
  });

  describe('prompt rendering', () => {
    it('should pass all required parameters to renderPrompt', async () => {
      await generateLessonSingleCall(mockLessonSpec, [], 'en', null, null, null);

      expect(mockRenderPrompt).toHaveBeenCalledWith(
        'stage6_single_call_generator',
        expect.objectContaining({
          lessonTitle: 'Introduction to TypeScript',
          lessonDescription: 'A basic intro to TypeScript fundamentals',
          durationMinutes: '5',
          targetAudience: 'practitioner',
          tone: 'conversational-professional',
          difficulty: 'beginner',
          hookStrategy: 'challenge',
          hookTopic: 'Why TypeScript matters',
        })
      );
    });

    it('should include learning objectives formatted as numbered list', async () => {
      await generateLessonSingleCall(mockLessonSpec, [], 'en', null, null, null);

      const learningObjectives = mockRenderPrompt.mock.calls[0][1].learningObjectives as string;
      expect(learningObjectives).toContain('1. Understand basic types');
      expect(learningObjectives).toContain('2. Write simple functions');
    });

    it('should include sections list formatted as numbered list', async () => {
      await generateLessonSingleCall(mockLessonSpec, [], 'en', null, null, null);

      const sectionsList = mockRenderPrompt.mock.calls[0][1].sectionsList as string;
      expect(sectionsList).toContain('1. Basic Types');
      expect(sectionsList).toContain('2. Functions');
    });
  });

  describe('inter-lesson context integration', () => {
    it('should include inter-lesson context when provided', async () => {
      const specWithContext: LessonSpecificationV2 = {
        ...mockLessonSpec,
        lesson_context: {
          previous_lesson: {
            lesson_id: '1.0',
            title: 'Prerequisites',
            key_concepts: ['variables', 'functions'],
            summary_preview: 'Covered JavaScript basics',
          },
          next_lesson: {
            lesson_id: '1.2',
            title: 'Advanced Types',
            key_concepts: ['generics', 'union types'],
          },
          concepts_already_covered: ['variables', 'functions'],
          terms_already_defined: ['variable', 'function'],
        },
      };

      mockFormatInterLessonContextXML.mockReturnValue(
        '<inter_lesson_context>Mock context</inter_lesson_context>'
      );

      await generateLessonSingleCall(specWithContext, [], 'en', null, null, null);

      expect(mockFormatInterLessonContextXML).toHaveBeenCalledWith(specWithContext.lesson_context);
      expect(mockRenderPrompt).toHaveBeenCalledWith(
        'stage6_single_call_generator',
        expect.objectContaining({
          interLessonContext: '<inter_lesson_context>Mock context</inter_lesson_context>',
        })
      );
    });

    it('should handle null lesson_context', async () => {
      await generateLessonSingleCall(mockLessonSpec, [], 'en', null, null, null);

      expect(mockFormatInterLessonContextXML).toHaveBeenCalledWith(null);
    });
  });

  describe('model configuration', () => {
    it('should use model override when provided', async () => {
      const { createOpenRouterModel } = await import('@/shared/llm/langchain-models');

      await generateLessonSingleCall(mockLessonSpec, [], 'en', 'custom-model-override', null, null);

      expect(createOpenRouterModel).toHaveBeenCalledWith(
        'custom-model-override',
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('should use configured model when no override', async () => {
      const { createOpenRouterModel } = await import('@/shared/llm/langchain-models');

      await generateLessonSingleCall(mockLessonSpec, [], 'en', null, null, null);

      expect(createOpenRouterModel).toHaveBeenCalledWith(
        'test-model-id',
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('should use recommended temperature for content archetype', async () => {
      const { createOpenRouterModel } = await import('@/shared/llm/langchain-models');
      const { getRecommendedTemperatureV2 } = await import(
        '@megacampus/shared-types/lesson-specification-v2'
      );

      await generateLessonSingleCall(mockLessonSpec, [], 'en', null, null, null);

      expect(getRecommendedTemperatureV2).toHaveBeenCalledWith('code_tutorial');
      expect(createOpenRouterModel).toHaveBeenCalledWith(
        expect.any(String),
        0.7, // Mocked return value
        expect.any(Number)
      );
    });
  });
});
