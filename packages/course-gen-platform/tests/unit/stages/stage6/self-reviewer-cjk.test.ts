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
 * 4. Model fallback after maxPrimaryAttempts (retryCount >= 2)
 * 5. Code block exclusion from CJK detection
 *
 * Reference:
 * - self-reviewer-node.ts (lines 133-214, 1107-1227)
 * - config/index.ts (MODEL_FALLBACK, SELF_REVIEW_CONFIG)
 */

import { describe, it, expect, vi } from 'vitest';
import { selfReviewerNode, SELF_REVIEW_CONFIG } from '@/stages/stage6-lesson-content/nodes/self-reviewer-node';
import type { LessonGraphStateType } from '@/stages/stage6-lesson-content/state';
import { MODEL_FALLBACK } from '@/stages/stage6-lesson-content/config';
import type { SelfReviewResult } from '@megacampus/shared-types/judge-types';

// ============================================================================
// MOCKS
// ============================================================================

// Mock logger with child method (must be inline due to hoisting)
vi.mock('@/shared/logger', () => {
  const mockChild = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(() => mockChild),
    },
  };
});

// Mock trace logger
vi.mock('@/shared/trace-logger', () => ({
  logTrace: vi.fn().mockResolvedValue(undefined),
}));

// Hoisted mock for LLM client (must be hoisted for proper module mocking)
const { mockGenerateCompletion, MockLLMClient } = vi.hoisted(() => {
  const mockFn = vi.fn();
  return {
    mockGenerateCompletion: mockFn,
    MockLLMClient: class {
      generateCompletion = mockFn;
    },
  };
});

// Set default mock implementation
mockGenerateCompletion.mockResolvedValue({
  content: JSON.stringify({
    status: 'PASS',
    reasoning: 'Content looks good',
    issues: [],
  }),
  totalTokens: 500,
  model: 'xiaomi/mimo-v2-flash:free',
  finishReason: 'stop',
});

vi.mock('@/shared/llm', () => ({
  LLMClient: MockLLMClient,
}));

// Mock ModelConfigService
vi.mock('@/shared/llm/model-config-service', () => ({
  createModelConfigService: vi.fn().mockReturnValue({
    getModelForPhase: vi.fn().mockResolvedValue({
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

Это чистое введение без каких-либо проблем вообще. Всё прекрасно.

## Основные концепции

Это концепция 稀缺性资源分配问题分析市场经济供给需求价格机制 в экономике. Термин 缺乏资源稀缺性经济学基础 означает дефицит. Понятие 稀缺性资源分配机制市场经济基本原理 является ключевым.

## Практические примеры

Чистые примеры без CJK символов, только русский текст для изучения.

## Упражнения

Чистые упражнения для закрепления материала урока.

## Заключение

Чистое заключение урока без посторонних символов.
`;

const multiSectionCJK = `
## Введение

Введение с 稀缺性资源 символами и 缺乏问题 проблемами текста урока.

## Основные концепции

Концепции с 缺乏资源 символами и 性质特点 тоже. Множество 稀缺性问题分析 проблем в экономике.

## Практические примеры

Примеры с 稀缺性资源 множеством символов. Еще 市场价格调节 и 供给需求 в практике.

## Упражнения

Чистые упражнения без проблем.

## Заключение

Чистое заключение.
`;

const cjkInCodeOnly = `
## Введение

Чистое введение без каких-либо проблем. В этом уроке мы рассмотрим примеры кода на Python. Это очень важная тема для программистов и разработчиков программного обеспечения.

## Пример кода

В этом примере показан код с китайскими комментариями. Обратите внимание на синтаксис:

\`\`\`python
# Chinese comment: 这是注释稀缺性资源分配问题分析市场经济供给需求
def scarcity():
    print("稀缺性资源分配问题")
    return "市场价格机制经济学"
\`\`\`

Объяснение кода выше совершенно чистое. Мы видим использование функций и комментариев. Этот пример демонстрирует базовые концепции программирования на языке Python для начинающих.

Также inline код: \`value = "稀缺性资源"\` не должен влиять на проверку, потому что код блоки исключаются из анализа языка.

## Практическое применение

Здесь мы рассмотрим как применять эти знания на практике. Это очень полезно для понимания материала.

## Заключение

Чистое заключение урока. Мы изучили основы работы с кодом и комментариями.
`;

const cjkExactly50Percent = `
## Введение

Введение с 稀缺性资源分配问题分析市场经济供给需求 символами урока по экономике для студентов.

## Основные концепции

Концепции с 缺乏问题分析市场经济价格机制资源分配 символами и текстом обучения материала курса.

## Практические примеры

Примеры с 供给需求平衡市场经济基础原理应用 практическими заданиями для студентов.

## Упражнения

Чистые упражнения для закрепления материала.

## Заключение

Чистое заключение урока по экономике.
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

Введение с 稀缺性资源分配问题分析市场经济供给需求价格机制 символами урока по теме экономики для студентов высших учебных заведений.

## Основные концепции

Чистая секция без китайских символов. Здесь изложены основные принципы экономики.

## Практические примеры

Чистые примеры для закрепления материала.

## Заключение

Заключение с 缺乏供给需求平衡市场经济价格机制资源分配 символами и выводами материала урока.
`;

    const state = createMockState({
      generatedContent: contentWithIntroAndSummary,
      lessonSpec: {
        lesson_id: '1.1',
        title: 'Test',
        sections: [
          { section_id: 'section_1', title: 'Основные концепции', learning_objectives: [] },
          { section_id: 'section_2', title: 'Практические примеры', learning_objectives: [] },
        ],
        learning_objectives: [],
        rag_context: null,
        metadata: {},
      },
    });

    const result = await selfReviewerNode(state);

    const languageIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'LANGUAGE') ?? [];

    // 2 sections with CJK (intro + summary) out of 4 total = 50% -> triggers CRITICAL global
    // So we check for global issue containing both affected areas
    expect(languageIssues.length).toBeGreaterThan(0);
    const criticalIssue = languageIssues.find(i => i.severity === 'CRITICAL');
    expect(criticalIssue).toBeDefined();
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
    expect(result.modelOverride).toBeUndefined();

    // COMPLEX issues don't override LLM status (only CRITICAL do)
    // But issues array should contain the LANGUAGE issue for section regenerator
    expect(result.selfReviewResult?.issues?.length).toBeGreaterThan(0);

    // Should target specific section
    expect(complexIssues[0].location).toBe('section_1');
  });

  it('should identify all affected sections for partial regeneration', async () => {
    const twoSectionCJK = `
## Введение

Чистое введение без каких-либо проблем. Это очень важный урок для изучения экономических принципов.

## Основные концепции

Концепции с 稀缺性资源分配问题分析市场经济供给需求价格机制经济学基础 символами и теорией урока экономики.

## Практические примеры

Примеры с 缺乏供给需求市场经济价格机制资源分配问题分析基础理论 символами в упражнениях для студентов.

## Упражнения

Чистые упражнения для закрепления материала урока по экономике и финансам.

## Дополнительные материалы

Чистые материалы для дополнительного изучения темы урока.

## Заключение

Чистое заключение урока. Мы изучили важные экономические концепции.
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
    // Note: 2 sections with CJK out of 6 total (intro + 4 spec + summary) = 33% < 50%
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
    expect(result.modelOverride).toBeUndefined();

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
  // Based on MODEL_FALLBACK.maxPrimaryAttempts = 2:
  // - retryCount=0: 1st attempt with primary model
  // - retryCount=1: 2nd attempt with primary model (still within maxPrimaryAttempts)
  // - retryCount=2: 3rd attempt - switch to fallback model

  it('should respect maxPrimaryAttempts before switching to fallback', async () => {
    // Test escalation logic for retryCount 0, 1, 2, 3
    // maxPrimaryAttempts = 2 means: switch to fallback at retryCount >= 2
    for (const retryCount of [0, 1, 2, 3]) {
      const state = createMockState({
        generatedContent: singleSectionCJK,
        retryCount,
      });
      const result = await selfReviewerNode(state);

      const languageIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'LANGUAGE') || [];
      const hasCritical = languageIssues.some(i => i.severity === 'CRITICAL');
      const hasComplex = languageIssues.some(i => i.severity === 'COMPLEX');

      if (retryCount < MODEL_FALLBACK.maxPrimaryAttempts) {
        // Still within primary attempts - use primary model, COMPLEX issues
        expect(result.modelOverride).toBeUndefined();
        expect(hasComplex).toBe(true);
        expect(hasCritical).toBe(false);
      } else {
        // Exceeded maxPrimaryAttempts - switch to fallback, CRITICAL issue
        expect(result.modelOverride).toBe(MODEL_FALLBACK.fallback);
        expect(hasCritical).toBe(true);
        expect(result.selfReviewResult?.status).toBe('REGENERATE');
      }
    }
  });

  it('should NOT switch to fallback on first retry (retryCount=1, still within maxPrimaryAttempts)', async () => {
    const state = createMockState({
      generatedContent: singleSectionCJK,
      retryCount: 1, // Second attempt - still within maxPrimaryAttempts=2
    });

    const result = await selfReviewerNode(state);

    // Should NOT set modelOverride yet (still using primary model)
    expect(result.modelOverride).toBeUndefined();

    // Should have COMPLEX issues for partial regeneration (not CRITICAL for fallback)
    const languageIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'LANGUAGE') ?? [];
    const complexIssues = languageIssues.filter(i => i.severity === 'COMPLEX');
    expect(complexIssues.length).toBeGreaterThan(0);
  });

  it('should switch to fallback model after maxPrimaryAttempts (retryCount=2)', async () => {
    const state = createMockState({
      generatedContent: singleSectionCJK,
      retryCount: 2, // Third attempt - exceeds maxPrimaryAttempts=2
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
    expect(result.retryCount).toBe(3);

    // Should have status REGENERATE
    expect(result.selfReviewResult?.status).toBe('REGENERATE');
  });

  it('should continue using fallback model on subsequent retries (retryCount=3)', async () => {
    const state = createMockState({
      generatedContent: multiSectionCJK,
      retryCount: 3, // Fourth attempt
    });

    const result = await selfReviewerNode(state);

    // Should still use fallback model
    expect(result.modelOverride).toBe(MODEL_FALLBACK.fallback);
    expect(result.retryCount).toBe(4);
  });

  it('should include retry info and fallback model in issue description', async () => {
    const state = createMockState({
      generatedContent: singleSectionCJK,
      retryCount: 2, // Triggers fallback (>= maxPrimaryAttempts)
    });

    const result = await selfReviewerNode(state);

    // The fallback model info should be in the CRITICAL issue description
    const languageIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'LANGUAGE') ?? [];
    const criticalIssue = languageIssues.find(i => i.severity === 'CRITICAL');

    expect(criticalIssue).toBeDefined();
    expect(criticalIssue?.description).toContain(MODEL_FALLBACK.fallback);
    expect(criticalIssue?.description).toContain('2'); // retry count
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

    // Should NOT set modelOverride (undefined means not set)
    expect(result.modelOverride).toBeUndefined();

    // Should NOT increment retryCount (undefined means not changed)
    expect(result.retryCount).toBeUndefined();
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

    // modelOverride should NOT be set (no CJK outside code blocks)
    expect(result.modelOverride).toBeUndefined();
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

Чистое введение без проблем в тексте урока экономики.

## Пример кода

\`\`\`python
# Chinese comment: 这是注释稀缺性资源
print("稀缺性资源分配")
\`\`\`

Но в тексте есть 稀缺性资源分配问题分析市场经济供给需求 проблема вне кода. Еще 市场价格调节供给需求平衡机制 символы в материале урока.

## Практические примеры

Чистые примеры для закрепления материала урока.

## Заключение

Чистое заключение урока по экономике.
`;

    const state = createMockState({
      generatedContent: mixedCJK,
      retryCount: 0,
      lessonSpec: {
        lesson_id: '1.1',
        title: 'Test',
        sections: [
          { section_id: 'section_1', title: 'Пример кода', learning_objectives: [] },
          { section_id: 'section_2', title: 'Практические примеры', learning_objectives: [] },
        ],
        learning_objectives: [],
        rag_context: null,
        metadata: {},
      },
    });

    const result = await selfReviewerNode(state);

    const languageIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'LANGUAGE') ?? [];

    // Should detect CJK in prose (not in code blocks)
    // CJK in section_1 prose, 1 out of 4 = 25% < 50% = partial regeneration
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
Введение с 稀缺性资源分配问题供给需求市场经济价格机制基础理论 символами до первого заголовка в уроке экономики.

## Основные концепции

Чистая секция без китайских символов. Здесь изложены основные принципы экономики.

## Практические примеры

Чистые примеры для закрепления материала урока.

## Заключение

Чистое заключение урока по экономике без китайских символов.
`;

    const state = createMockState({
      generatedContent: cjkBeforeHeader,
      retryCount: 0,
      lessonSpec: {
        lesson_id: '1.1',
        title: 'Test',
        sections: [
          { section_id: 'section_1', title: 'Основные концепции', learning_objectives: [] },
          { section_id: 'section_2', title: 'Практические примеры', learning_objectives: [] },
        ],
        learning_objectives: [],
        rag_context: null,
        metadata: {},
      },
    });

    const result = await selfReviewerNode(state);

    const languageIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'LANGUAGE') ?? [];

    // Should detect CJK - 1 section out of 4 = 25% < 50% = partial regeneration (COMPLEX)
    expect(languageIssues.length).toBeGreaterThan(0);
    const complexIssue = languageIssues.find(i => i.severity === 'COMPLEX');
    expect(complexIssue).toBeDefined();
    expect(complexIssue?.location).toBe('introduction');
  });

  it('should deduplicate section IDs in affected sections', async () => {
    // This tests internal deduplication in findSectionsWithForeignCharacters
    const duplicatePatterns = `
## Введение

Введение с 稀缺性资源分配问题供给需求市场 символами в учебном материале.

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

Введение с 稀缺性资源分配问题分析市场经济供给需求价格 китайскими и مرحبا أهلا وسهلا بكم في درس الاقتصاد арабскими символами в тексте урока экономики.

## Основные концепции

Чистая секция без посторонних символов. Здесь изложены основные концепции экономики.

## Практические примеры

Чистые примеры для закрепления материала урока.

## Заключение

Чистое заключение урока по экономике.
`;

    const state = createMockState({
      generatedContent: multiScript,
      retryCount: 0,
      lessonSpec: {
        lesson_id: '1.1',
        title: 'Test',
        sections: [
          { section_id: 'section_1', title: 'Основные концепции', learning_objectives: [] },
          { section_id: 'section_2', title: 'Практические примеры', learning_objectives: [] },
        ],
        learning_objectives: [],
        rag_context: null,
        metadata: {},
      },
    });

    const result = await selfReviewerNode(state);

    const languageIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'LANGUAGE') ?? [];

    // Should detect foreign scripts - CJK + Arabic in intro = 1 section out of 4 = 25% = partial
    expect(languageIssues.length).toBeGreaterThan(0);

    // Description should mention detected foreign characters
    const issue = languageIssues[0];
    expect(issue).toBeDefined();
  });
});

// ============================================================================
// INTEGRATION: CJK Handling with Other Issues
// ============================================================================

describe('Integration: CJK with Other Issues', () => {
  it('should handle CJK + truncation issues together', async () => {
    const cjkAndTruncation = `
## Введение

Введение с 稀缺性资源分配问题供给需求市场经济价格机制基础 символами в учебном материале экономики.

## Основные концепции

Концепция экономики обрывается на полуслове и
`;

    const state = createMockState({
      generatedContent: cjkAndTruncation,
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

    // Should have LANGUAGE issues (CJK detected)
    const languageIssues = result.selfReviewResult?.issues?.filter(i => i.type === 'LANGUAGE') ?? [];

    // CJK in intro, 1 section out of 3 (intro + section_1 + summary) = 33% < 50%
    // This triggers COMPLEX issues (partial regeneration) not CRITICAL (full regeneration)
    expect(languageIssues.length).toBeGreaterThan(0);

    // COMPLEX issues create sectionsToRegenerate for partial regeneration
    // but don't override LLM status (which returns PASS from mock)
    const complexIssues = languageIssues.filter(i => i.severity === 'COMPLEX');
    expect(complexIssues.length).toBeGreaterThan(0);
    expect(result.selfReviewResult?.sectionsToRegenerate?.length).toBeGreaterThan(0);
  });

  it('should prioritize model fallback on retry even with multiple issue types', async () => {
    const multipleIssues = `
## Введение

Введение с 稀缺性资源分配问题供给需求市场经济价格机制 символами в уроке материала экономики.

## Основные концепции

Концепция экономики обрывается на полуслове и
`;

    const state = createMockState({
      generatedContent: multipleIssues,
      retryCount: 2, // Exceeds maxPrimaryAttempts=2, triggers fallback
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

    // Should set modelOverride on retry with CJK issues (after maxPrimaryAttempts)
    expect(result.modelOverride).toBe(MODEL_FALLBACK.fallback);
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

describe('Error Handling', () => {
  it('should handle LLM timeout gracefully by falling back to heuristics', async () => {
    // Mock all retry attempts (3 retries) to reject with timeout
    const timeoutError = new Error('Request timeout after 30000ms');
    mockGenerateCompletion
      .mockRejectedValueOnce(timeoutError)
      .mockRejectedValueOnce(timeoutError)
      .mockRejectedValueOnce(timeoutError);

    const state = createMockState({
      generatedContent: cleanContent,
      retryCount: 0,
    });

    const result = await selfReviewerNode(state);

    // Should handle timeout without crashing
    expect(result.selfReviewResult).toBeDefined();

    // Falls back to heuristic-only result - clean content returns PASS
    expect(result.selfReviewResult?.status).toBe('PASS');

    // Should indicate LLM review was skipped
    expect(result.selfReviewResult?.reasoning).toContain('LLM review skipped');

    // Should use 0 tokens (heuristic-only)
    expect(result.selfReviewResult?.tokensUsed).toBe(0);

    // Restore default mock for other tests
    mockGenerateCompletion.mockResolvedValue({
      content: JSON.stringify({
        status: 'PASS',
        reasoning: 'Content looks good',
        issues: [],
      }),
      totalTokens: 500,
      model: 'xiaomi/mimo-v2-flash:free',
      finishReason: 'stop',
    });
  });

  it('should handle JSON parse error gracefully by falling back to heuristics', async () => {
    // Mock all retry attempts (3 retries) to return malformed JSON
    const malformedResponse = {
      content: 'not valid json {broken',
      totalTokens: 100,
      model: 'xiaomi/mimo-v2-flash:free',
      finishReason: 'stop' as const,
    };
    mockGenerateCompletion
      .mockResolvedValueOnce(malformedResponse)
      .mockResolvedValueOnce(malformedResponse)
      .mockResolvedValueOnce(malformedResponse);

    const state = createMockState({
      generatedContent: cleanContent,
      retryCount: 0,
    });

    const result = await selfReviewerNode(state);

    // Should handle malformed JSON without crashing
    expect(result.selfReviewResult).toBeDefined();

    // Falls back to heuristic-only result after parse failure
    expect(result.selfReviewResult?.status).toBe('PASS');

    // Should indicate LLM review failed (different message for parse failure)
    expect(result.selfReviewResult?.reasoning).toMatch(/LLM review failed|invalid response format/);

    // Restore default mock for other tests
    mockGenerateCompletion.mockResolvedValue({
      content: JSON.stringify({
        status: 'PASS',
        reasoning: 'Content looks good',
        issues: [],
      }),
      totalTokens: 500,
      model: 'xiaomi/mimo-v2-flash:free',
      finishReason: 'stop',
    });
  });
});
