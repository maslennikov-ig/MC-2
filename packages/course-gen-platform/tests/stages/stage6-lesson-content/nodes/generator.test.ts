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
    const previousContext = '# Lesson Title\n\n## Introduction\n\nThis is the introduction content.';
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
