/**
 * CJK Character Detection and Handling Tests for Self-Reviewer Node
 * @module stages/stage6-lesson-content/nodes/__tests__/self-reviewer-cjk.test.ts
 *
 * Tests the CJK (Chinese-Japanese-Korean) character detection and partial/full
 * regeneration logic in the self-reviewer node.
 *
 * Key Features Tested:
 * 1. findSectionsWithForeignCharacters() - section-level CJK detection
 * 2. Partial regeneration (CJK < 50% sections)
 * 3. Full regeneration (CJK >= 50% sections)
 * 4. Model fallback on retry (retryCount > 0)
 * 5. Code block exclusion from CJK detection
 *
 * Reference:
 * - self-reviewer-node.ts (lines 133-214, 1107-1227)
 * - config/index.ts (MODEL_FALLBACK, SELF_REVIEW_CONFIG)
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { selfReviewerNode, SELF_REVIEW_CONFIG } from '@/stages/stage6-lesson-content/nodes/self-reviewer-node';
import type { LessonGraphStateType } from '@/stages/stage6-lesson-content/state';
import { MODEL_FALLBACK } from '@/stages/stage6-lesson-content/config';
import type { SelfReviewResult } from '@megacampus/shared-types/judge-types';

// ============================================================================
// MOCKS
// ============================================================================

// Mock logger
vi.mock('@/shared/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock trace logger
vi.mock('@/shared/trace-logger', () => ({
  logTrace: vi.fn().mockResolvedValue(undefined),
}));

// Mock LLMClient
vi.mock('@/shared/llm', () => ({
  LLMClient: vi.fn().mockImplementation(() => ({
    generateObject: vi.fn().mockResolvedValue({
      status: 'PASS',
      reasoning: 'Content looks good',
      issues: [],
    }),
  })),
}));

// Mock ModelConfigService
vi.mock('@/shared/llm/model-config-service', () => ({
  createModelConfigService: vi.fn().mockReturnValue({
    getModelForStage: vi.fn().mockResolvedValue({
      modelId: 'xiaomi/mimo-v2-flash:free',
      maxTokens: 8000,
      temperature: 0.7,
    }),
  }),
}));

// ============================================================================
// TEST FIXTURES
// ============================================================================

const cleanContent = `
## Введение

Это чистый контент без иностранных символов.

## Основные концепции

Здесь мы рассмотрим основные принципы экономики.

## Практические примеры

Примеры применения теории на практике.

## Упражнения

Задания для закрепления материала.

## Заключение

Подведем итоги урока.
`;

const singleSectionCJK = `
## Введение

Это чистое введение без проблем.

## Основные концепции

Это концепция 稀 в экономике. Термин 缺 означает дефицит. Понятие 稀缺性 является ключевым.

## Практические примеры

Чистые примеры без CJK символов.

## Упражнения

Чистые упражнения.

## Заключение

Чистое заключение.
`;

const multiSectionCJK = `
## Введение

Введение с 稀 символами и 缺 проблемами.

## Основные концепции

Концепции с 缺 символами и 性 тоже. Множество 稀缺性 проблем.

## Практические примеры

Примеры с 稀缺性 множеством символов. Еще 市场 и 价格.

## Упражнения

Чистые упражнения без проблем.

## Заключение

Чистое заключение.
`;

const cjkInCodeOnly = `
## Введение

Чистое введение без проблем.

## Пример кода

В этом примере показан код с китайскими комментариями:

\`\`\`python
# Chinese comment: 这是注释
def scarcity():
    print("稀缺性")
    return "市场价格"
\`\`\`

Объяснение кода выше совершенно чистое.

Также inline код: \`value = "稀缺性"\` не должен влиять.

## Заключение

Чистое заключение.
`;

const cjkExactly50Percent = `
## Введение

Введение с 稀 символами.

## Основные концепции

Концепции с 缺 символами.

## Практические примеры

Чистые примеры.

## Упражнения

Чистые упражнения.

## Заключение

Чистое заключение.
`;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create mock state for testing
 */
function createMockState(overrides: Partial<LessonGraphStateType> = {}): LessonGraphStateType {
  return {
    lessonSpec: {
      lesson_id: '1.1',
      title: 'Test Lesson',
      sections: [
        { section_id: 'section_1', title: 'Основные концепции', learning_objectives: [] },
        { section_id: 'section_2', title: 'Практические примеры', learning_objectives: [] },
        { section_id: 'section_3', title: 'Упражнения', learning_objectives: [] },
      ],
      learning_objectives: [],
      rag_context: null,
      metadata: {},
    },
    courseId: 'test-course-uuid',
    language: 'ru',
    generatedContent: cleanContent,
    retryCount: 0,
    modelOverride: null,
    progressSummary: null,
    lessonUuid: 'test-lesson-uuid',
    ragChunks: [],
    ragContextId: null,
    userRefinementPrompt: null,
    sectionProgress: 0,
    selfReviewResult: null,
    sectionRegenerationResult: null,
    lessonContent: null,
    currentNode: 'selfReviewer',
    errors: [],
    modelUsed: null,
    tokensUsed: 0,
    durationMs: 0,
    totalCostUsd: 0,
    nodeCosts: [],
    temperature: 0.7,
    qualityScore: null,
    judgeVerdict: null,
    judgeRecommendation: null,
    needsRegeneration: false,
    needsHumanReview: false,
    previousScores: [],
    refinementIterationCount: 0,
    targetedRefinementMode: 'full-auto',
    arbiterOutput: null,
    targetedRefinementStatus: null,
    lockedSections: [],
    sectionEditCount: {},
    targetedRefinementTokensUsed: 0,
    ...overrides,
  };
}

// ============================================================================
// UNIT TESTS: findSectionsWithForeignCharacters()
// ============================================================================

describe('findSectionsWithForeignCharacters (unit)', () => {
  // We'll test this indirectly through selfReviewerNode since it's not exported
  // Instead, we'll test the behavior through the node's output

  it('should detect no CJK in clean content', async () => {
    const state = createMockState({ generatedContent: cleanContent });
    const result = await selfReviewerNode(state);

    const languageIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'LANGUAGE') ?? [];
    expect(languageIssues).toHaveLength(0);
  });

  it('should detect CJK in single section', async () => {
    const state = createMockState({ generatedContent: singleSectionCJK });
    const result = await selfReviewerNode(state);

    const languageIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'LANGUAGE') ?? [];

    // Should have COMPLEX severity issues (partial regeneration)
    expect(languageIssues.length).toBeGreaterThan(0);

    // At least one should be COMPLEX (for partial regeneration)
    const complexIssues = languageIssues.filter(i => i.severity === 'COMPLEX');
    expect(complexIssues.length).toBeGreaterThan(0);

    // Should target section_1 (Основные концепции)
    const section1Issue = languageIssues.find(i => i.location === 'section_1');
    expect(section1Issue).toBeDefined();
  });

  it('should exclude CJK in code blocks only', async () => {
    const state = createMockState({ generatedContent: cjkInCodeOnly });
    const result = await selfReviewerNode(state);

    const languageIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'LANGUAGE') ?? [];

    // Should NOT flag CJK in code blocks
    expect(languageIssues).toHaveLength(0);
  });

  it('should detect introduction and summary sections correctly', async () => {
    const contentWithIntroAndSummary = `
## Введение

Введение с 稀 символами.

## Основные концепции

Чистая секция.

## Заключение

Заключение с 缺 символами.
`;

    const state = createMockState({
      generatedContent: contentWithIntroAndSummary,
      lessonSpec: {
        lesson_id: '1.1',
        title: 'Test',
        sections: [
          { section_id: 'section_1', title: 'Основные концепции', learning_objectives: [] },
        ],
        learning_objectives: [],
        rag_context: null,
        metadata: {},
      },
    });

    const result = await selfReviewerNode(state);

    const languageIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'LANGUAGE') ?? [];

    // Should detect introduction and summary
    const locations = languageIssues.map(i => i.location);
    expect(locations).toContain('introduction');
    expect(locations).toContain('summary');
  });
});

// ============================================================================
// SCENARIO 1: First Attempt - Partial Regeneration (CJK < 50% sections)
// ============================================================================

describe('Scenario 1: First Attempt - Partial Regeneration', () => {
  it('should trigger partial regeneration when CJK in < 50% sections', async () => {
    const state = createMockState({
      generatedContent: singleSectionCJK,
      retryCount: 0,
    });

    const result = await selfReviewerNode(state);

    // Should have COMPLEX severity issues (one per affected section)
    const languageIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'LANGUAGE') ?? [];
    const complexIssues = languageIssues.filter(i => i.severity === 'COMPLEX');

    expect(complexIssues.length).toBeGreaterThan(0);

    // Should NOT set modelOverride (using primary model)
    expect(result.modelOverride).toBeNull();

    // Should have status REGENERATE (to trigger section regenerator)
    expect(result.selfReviewResult?.status).toBe('REGENERATE');

    // Should target specific section
    expect(complexIssues[0].location).toBe('section_1');
  });

  it('should identify all affected sections for partial regeneration', async () => {
    const twoSectionCJK = `
## Введение

Чистое введение.

## Основные концепции

Концепции с 稀 символами.

## Практические примеры

Примеры с 缺 символами.

## Упражнения

Чистые упражнения.

## Дополнительные материалы

Чистые материалы.

## Заключение

Чистое заключение.
`;

    const state = createMockState({
      generatedContent: twoSectionCJK,
      retryCount: 0,
      lessonSpec: {
        lesson_id: '1.1',
        title: 'Test',
        sections: [
          { section_id: 'section_1', title: 'Основные концепции', learning_objectives: [] },
          { section_id: 'section_2', title: 'Практические примеры', learning_objectives: [] },
          { section_id: 'section_3', title: 'Упражнения', learning_objectives: [] },
          { section_id: 'section_4', title: 'Дополнительные материалы', learning_objectives: [] },
        ],
        learning_objectives: [],
        rag_context: null,
        metadata: {},
      },
    });

    const result = await selfReviewerNode(state);

    const complexIssues = result.selfReviewResult?.issues?.filter(
      i => i.type === 'LANGUAGE' && i.severity === 'COMPLEX'
    ) ?? [];

    // Should have 2 COMPLEX issues (one per affected section)
    expect(complexIssues).toHaveLength(2);

    // Should target section_1 and section_2
    const locations = complexIssues.map(i => i.location).sort();
    expect(locations).toEqual(['section_1', 'section_2']);
  });
});

// ============================================================================
// SCENARIO 2: First Attempt - Full Regeneration (CJK >= 50% sections)
// ============================================================================

describe('Scenario 2: First Attempt - Full Regeneration', () => {
  it('should trigger full regeneration when CJK in >= 50% sections', async () => {
    const state = createMockState({
      generatedContent: multiSectionCJK,
      retryCount: 0,
    });

    const result = await selfReviewerNode(state);

    const languageIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'LANGUAGE') ?? [];

    // Should have at least one CRITICAL issue with location='global'
    const criticalGlobal = languageIssues.find(
      i => i.severity === 'CRITICAL' && i.location === 'global'
    );

    expect(criticalGlobal).toBeDefined();
    expect(criticalGlobal?.description).toContain('Full regeneration required');

    // Should NOT set modelOverride on first attempt
    expect(result.modelOverride).toBeNull();

    // Should have status REGENERATE
    expect(result.selfReviewResult?.status).toBe('REGENERATE');
  });

  it('should handle exactly 50% threshold correctly', async () => {
    // 5 total sections (intro + 3 spec sections + summary)
    // 2.5 affected = 50% threshold
    // >= 50% should trigger full regeneration
    const state = createMockState({
      generatedContent: cjkExactly50Percent,
      retryCount: 0,
    });

    const result = await selfReviewerNode(state);

    const languageIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'LANGUAGE') ?? [];

    // Should trigger full regeneration (>= 50%)
    const criticalGlobal = languageIssues.find(
      i => i.severity === 'CRITICAL' && i.location === 'global'
    );

    expect(criticalGlobal).toBeDefined();
  });
});

// ============================================================================
// SCENARIO 3: Retry Attempt - Model Fallback
// ============================================================================

describe('Scenario 3: Retry Attempt - Model Fallback', () => {
  it('should switch to fallback model on retry with persistent CJK', async () => {
    const state = createMockState({
      generatedContent: singleSectionCJK,
      retryCount: 1, // Second attempt
    });

    const result = await selfReviewerNode(state);

    // Should have CRITICAL issue with persistent CJK message
    const languageIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'LANGUAGE') ?? [];
    const criticalIssue = languageIssues.find(i => i.severity === 'CRITICAL');

    expect(criticalIssue).toBeDefined();
    expect(criticalIssue?.description).toContain('Persistent CJK');
    expect(criticalIssue?.description).toContain(MODEL_FALLBACK.fallback);

    // Should set modelOverride to fallback model
    expect(result.modelOverride).toBe(MODEL_FALLBACK.fallback);

    // Should increment retryCount
    expect(result.retryCount).toBe(2);

    // Should have status REGENERATE
    expect(result.selfReviewResult?.status).toBe('REGENERATE');
  });

  it('should use fallback model on second retry (retryCount=2)', async () => {
    const state = createMockState({
      generatedContent: multiSectionCJK,
      retryCount: 2, // Third attempt
    });

    const result = await selfReviewerNode(state);

    // Should still use fallback model
    expect(result.modelOverride).toBe(MODEL_FALLBACK.fallback);
    expect(result.retryCount).toBe(3);
  });

  it('should include retry count in reasoning', async () => {
    const state = createMockState({
      generatedContent: singleSectionCJK,
      retryCount: 1,
    });

    const result = await selfReviewerNode(state);

    expect(result.selfReviewResult?.reasoning).toContain('retry');
    expect(result.selfReviewResult?.reasoning).toContain(MODEL_FALLBACK.fallback);
  });
});

// ============================================================================
// SCENARIO 4: No CJK - Normal Flow
// ============================================================================

describe('Scenario 4: No CJK - Normal Flow', () => {
  it('should pass when no CJK characters found', async () => {
    const state = createMockState({
      generatedContent: cleanContent,
      retryCount: 0,
    });

    const result = await selfReviewerNode(state);

    const languageIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'LANGUAGE') ?? [];

    // Should have NO language issues
    expect(languageIssues).toHaveLength(0);

    // Should NOT set modelOverride
    expect(result.modelOverride).toBeNull();

    // Should NOT increment retryCount
    expect(result.retryCount).toBe(0);
  });

  it('should pass when CJK count <= threshold (10 chars)', async () => {
    const minimalCJK = `
## Введение

Чистое введение.

## Основные концепции

Термин 稀 встречается редко. Всего ${SELF_REVIEW_CONFIG.criticalLanguageThreshold} символов.

## Заключение

Чистое заключение.
`;

    const state = createMockState({
      generatedContent: minimalCJK,
      retryCount: 0,
    });

    const result = await selfReviewerNode(state);

    const languageIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'LANGUAGE') ?? [];

    // Should have NO critical language issues (below threshold)
    expect(languageIssues).toHaveLength(0);
  });
});

// ============================================================================
// SCENARIO 5: CJK in Code Blocks Only
// ============================================================================

describe('Scenario 5: CJK in Code Blocks Only', () => {
  it('should ignore CJK in markdown code blocks', async () => {
    const state = createMockState({
      generatedContent: cjkInCodeOnly,
      retryCount: 0,
    });

    const result = await selfReviewerNode(state);

    const languageIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'LANGUAGE') ?? [];

    // Should have NO language issues (CJK in code blocks excluded)
    expect(languageIssues).toHaveLength(0);

    // Should NOT trigger regeneration
    expect(result.selfReviewResult?.status).not.toBe('REGENERATE');
  });

  it('should ignore CJK in inline code backticks', async () => {
    const inlineCodeCJK = `
## Введение

Чистое введение.

## Основные концепции

В коде используется переменная \`稀缺性\` и функция \`市场价格()\`.

Также можно написать \`const value = "稀缺性";\` в JavaScript.

## Заключение

Чистое заключение.
`;

    const state = createMockState({
      generatedContent: inlineCodeCJK,
      retryCount: 0,
    });

    const result = await selfReviewerNode(state);

    const languageIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'LANGUAGE') ?? [];

    // Should have NO language issues
    expect(languageIssues).toHaveLength(0);
  });

  it('should detect CJK in prose even when code blocks present', async () => {
    const mixedCJK = `
## Введение

Чистое введение.

## Пример кода

\`\`\`python
# Chinese comment: 这是注释
print("稀缺性")
\`\`\`

Но в тексте есть 稀缺性 проблема вне кода. Еще 市场 и 价格 символы.

## Заключение

Чистое заключение.
`;

    const state = createMockState({
      generatedContent: mixedCJK,
      retryCount: 0,
    });

    const result = await selfReviewerNode(state);

    const languageIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'LANGUAGE') ?? [];

    // Should detect CJK in prose (not in code blocks)
    expect(languageIssues.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty content gracefully', async () => {
    const state = createMockState({
      generatedContent: '',
      retryCount: 0,
    });

    const result = await selfReviewerNode(state);

    // Should not crash, may have EMPTY issue
    expect(result.selfReviewResult).toBeDefined();
  });

  it('should handle content with no sections', async () => {
    const noSections = 'Just plain text without any headers.';

    const state = createMockState({
      generatedContent: noSections,
      retryCount: 0,
    });

    const result = await selfReviewerNode(state);

    // Should not crash
    expect(result.selfReviewResult).toBeDefined();
  });

  it('should handle CJK in introduction before first ## header', async () => {
    const cjkBeforeHeader = `
Введение с 稀缺性 символами до первого заголовка.

## Основные концепции

Чистая секция.

## Заключение

Чистое заключение.
`;

    const state = createMockState({
      generatedContent: cjkBeforeHeader,
      retryCount: 0,
    });

    const result = await selfReviewerNode(state);

    const languageIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'LANGUAGE') ?? [];

    // Should detect CJK in introduction
    const introIssue = languageIssues.find(i => i.location === 'introduction');
    expect(introIssue).toBeDefined();
  });

  it('should deduplicate section IDs in affected sections', async () => {
    // This tests internal deduplication in findSectionsWithForeignCharacters
    const duplicatePatterns = `
## Введение

Введение с 稀 и 缺 символами.

## Основные концепции

Чистая секция.

## Заключение

Чистое заключение.
`;

    const state = createMockState({
      generatedContent: duplicatePatterns,
      retryCount: 0,
      lessonSpec: {
        lesson_id: '1.1',
        title: 'Test',
        sections: [
          { section_id: 'section_1', title: 'Основные концепции', learning_objectives: [] },
        ],
        learning_objectives: [],
        rag_context: null,
        metadata: {},
      },
    });

    const result = await selfReviewerNode(state);

    const languageIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'LANGUAGE') ?? [];

    // Should have unique section IDs (introduction counted once)
    const locations = languageIssues.map(i => i.location);
    const uniqueLocations = [...new Set(locations)];
    expect(locations.length).toBe(uniqueLocations.length);
  });

  it('should handle multiple script types (CJK + ARABIC)', async () => {
    const multiScript = `
## Введение

Введение с 稀缺性 китайскими и مرحبا арабскими символами.

## Основные концепции

Чистая секция.

## Заключение

Чистое заключение.
`;

    const state = createMockState({
      generatedContent: multiScript,
      retryCount: 0,
    });

    const result = await selfReviewerNode(state);

    const languageIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'LANGUAGE') ?? [];

    // Should detect multiple scripts
    expect(languageIssues.length).toBeGreaterThan(0);

    // Description should mention detected scripts
    const issueDesc = languageIssues[0]?.description ?? '';
    expect(issueDesc.toLowerCase()).toMatch(/cjk|arabic|scripts/);
  });
});

// ============================================================================
// INTEGRATION: CJK Handling with Other Issues
// ============================================================================

describe('Integration: CJK with Other Issues', () => {
  it('should handle CJK + truncation issues together', async () => {
    const cjkAndTruncation = `
## Введение

Введение с 稀缺性 символами.

## Основные концепции

Концепция обрывается на полуслове и
`;

    const state = createMockState({
      generatedContent: cjkAndTruncation,
      retryCount: 0,
    });

    const result = await selfReviewerNode(state);

    // Should have both LANGUAGE and TRUNCATION issues
    const languageIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'LANGUAGE') ?? [];
    const truncationIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'TRUNCATION') ?? [];

    expect(languageIssues.length).toBeGreaterThan(0);
    expect(truncationIssues.length).toBeGreaterThan(0);

    // Should still trigger REGENERATE
    expect(result.selfReviewResult?.status).toBe('REGENERATE');
  });

  it('should prioritize model fallback on retry even with multiple issue types', async () => {
    const multipleIssues = `
## Введение

Введение с 稀缺性 символами.

## Основные концепции

Концепция обрывается
`;

    const state = createMockState({
      generatedContent: multipleIssues,
      retryCount: 1, // Retry
    });

    const result = await selfReviewerNode(state);

    // Should set modelOverride despite having truncation issues too
    expect(result.modelOverride).toBe(MODEL_FALLBACK.fallback);
  });
});
