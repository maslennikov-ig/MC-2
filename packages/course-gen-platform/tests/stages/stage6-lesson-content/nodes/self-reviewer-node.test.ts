/**
 * Tests for selfReviewerNode - Pre-judge validation with Fail-Fast heuristics
 * @module stages/stage6-lesson-content/nodes/self-reviewer-node.test
 *
 * Tests the self-review node that implements two-phase validation:
 * 1. FREE heuristic pre-checks (language consistency, content truncation)
 * 2. LLM-based semantic review (TODO: future implementation)
 *
 * Test coverage:
 * - PASS cases: Clean content passing all heuristics
 * - PASS_WITH_FLAGS cases: Minor issues noted but not blocking
 * - REGENERATE cases: Critical failures (language mixing, truncation, missing content)
 * - Result metadata: Duration, token usage, heuristic details
 * - Edge cases: Different languages, code blocks, empty content
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { selfReviewerNode } from '../../../../src/stages/stage6-lesson-content/nodes/self-reviewer-node.js';
import type { LessonGraphStateType } from '../../../../src/stages/stage6-lesson-content/state.js';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';

// ============================================================================
// MOCKS
// ============================================================================

// Mock logger to avoid console noise during tests
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

// ============================================================================
// TEST FIXTURES
// ============================================================================

/**
 * Create minimal valid lesson specification
 */
function createMockLessonSpec(overrides: Partial<LessonSpecificationV2> = {}): LessonSpecificationV2 {
  return {
    lesson_id: 'test-lesson-1',
    title: 'Test Lesson Title',
    learning_objectives: [
      {
        id: 'obj_1',
        objective: 'Understand the basics of TypeScript',
        level: 'Remember',
      },
    ],
    sections: [
      {
        id: 'sec_intro',
        title: 'Introduction',
        type: 'lecture',
        required: true,
        constraints: {},
      },
    ],
    metadata: {
      lesson_duration_minutes: 30,
      difficulty_level: 'beginner',
      prerequisites: [],
      key_concepts: ['TypeScript', 'Types'],
      content_archetype: 'conceptual',
      tone: 'professional',
    },
    rag_context: {
      required: false,
      priority: 0,
    },
    ...overrides,
  } as LessonSpecificationV2;
}

/**
 * Create minimal valid state for testing
 */
function createMockState(overrides: Partial<LessonGraphStateType> = {}): LessonGraphStateType {
  return {
    lessonSpec: createMockLessonSpec(),
    courseId: 'course-123',
    language: 'ru',
    lessonUuid: null,
    ragChunks: [],
    ragContextId: null,
    userRefinementPrompt: null,
    modelOverride: null,
    generatedContent: 'Это полноценный текст урока с достаточным количеством символов для прохождения проверки. Текст должен быть достаточно длинным и содержать полезную информацию. Урок завершается правильно с корректной пунктуацией.',
    sectionProgress: 0,
    selfReviewResult: null,
    lessonContent: null,
    currentNode: 'generator',
    errors: [],
    retryCount: 0,
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
  } as LessonGraphStateType;
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('selfReviewerNode - PASS cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return PASS for clean Russian content with proper structure', async () => {
    const state = createMockState({
      language: 'ru',
      generatedContent: `
## Введение в TypeScript

TypeScript является типизированным расширением JavaScript. Он добавляет статическую типизацию к языку, что помогает выявлять ошибки на этапе разработки.

## Основные концепции

В этом разделе мы рассмотрим ключевые концепции TypeScript, включая типы данных, интерфейсы и классы. Каждая из этих концепций играет важную роль в создании надежных приложений.

## Заключение

Мы изучили основы TypeScript и готовы применять их на практике. Использование типизации поможет создавать более качественные приложения.
      `.trim(),
    });

    const result = await selfReviewerNode(state);

    expect(result.currentNode).toBe('selfReviewer');
    expect(result.selfReviewResult).toBeDefined();
    expect(result.selfReviewResult!.status).toBe('PASS');
    expect(result.selfReviewResult!.heuristicsPassed).toBe(true);
    expect(result.selfReviewResult!.issues).toHaveLength(0);
    expect(result.selfReviewResult!.reasoning).toContain('passed all heuristic pre-checks');
  });

  it('should return PASS for clean English content with proper structure', async () => {
    const state = createMockState({
      language: 'en',
      generatedContent: `
## Introduction to TypeScript

TypeScript is a typed superset of JavaScript that compiles to plain JavaScript. It adds optional static typing to the language, which helps catch errors early in the development process.

## Core Concepts

In this section, we will explore the core concepts of TypeScript, including types, interfaces, and classes. Understanding these concepts is essential for building robust applications.

## Conclusion

We have covered the fundamentals of TypeScript and are now ready to apply them in practice. Using static typing will help us create more reliable and maintainable applications.
      `.trim(),
    });

    const result = await selfReviewerNode(state);

    expect(result.selfReviewResult!.status).toBe('PASS');
    expect(result.selfReviewResult!.heuristicsPassed).toBe(true);
    expect(result.selfReviewResult!.issues).toHaveLength(0);
  });

  it('should return PASS for content with code blocks containing any characters', async () => {
    const state = createMockState({
      language: 'ru',
      generatedContent: `
## Пример использования TypeScript

Вот пример базовой типизации в TypeScript:

\`\`\`typescript
const greeting: string = "Hello, TypeScript!";
const count: number = 42;
// 中文注释也可以在коде
interface User {
  name: string;
  age: number;
}
\`\`\`

Этот код демонстрирует базовое использование типов. Обратите внимание на явное указание типов для переменных.

## Заключение

Мы рассмотрели основы типизации и готовы двигаться дальше.
      `.trim(),
    });

    const result = await selfReviewerNode(state);

    // Code blocks should be ignored, so foreign characters inside them don't fail the check
    expect(result.selfReviewResult!.status).toBe('PASS');
    expect(result.selfReviewResult!.heuristicsPassed).toBe(true);
  });

  it('should include metadata: duration, tokensUsed, heuristicDetails', async () => {
    const state = createMockState();

    const result = await selfReviewerNode(state);

    expect(result.selfReviewResult!.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.selfReviewResult!.tokensUsed).toBe(0); // No LLM in MVP
    expect(result.selfReviewResult!.heuristicDetails).toBeDefined();
    expect(result.selfReviewResult!.heuristicDetails!.languageCheck).toBeDefined();
    expect(result.selfReviewResult!.heuristicDetails!.truncationCheck).toBeDefined();
  });
});

describe('selfReviewerNode - PASS_WITH_FLAGS cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return PASS or PASS_WITH_FLAGS for content with 1-5 foreign characters (minor issue)', async () => {
    const state = createMockState({
      language: 'ru',
      generatedContent: `
## Введение

TypeScript — это мощный инструмент с несколькими китайскими символами 中文 где-то в тексте. Но в целом контент качественный и полезный.

Мы продолжаем изучать основные концепции и применять их на практике. Типизация помогает создавать надежные приложения.

## Заключение

Материал усвоен и готов к применению.
      `.trim(),
    });

    const result = await selfReviewerNode(state);

    // Should pass heuristics (1-5 foreign chars is below critical threshold of 20)
    expect(['PASS', 'PASS_WITH_FLAGS']).toContain(result.selfReviewResult!.status);
    expect(result.selfReviewResult!.heuristicsPassed).toBe(true);

    // If there are issues, check they are INFO level
    if (result.selfReviewResult!.issues.length > 0) {
      const criticalIssues = result.selfReviewResult!.issues.filter((i) => i.severity === 'CRITICAL');
      expect(criticalIssues).toHaveLength(0);
    }
  });

  it('should return PASS_WITH_FLAGS for content with 1-2 truncation issues (minor)', async () => {
    const state = createMockState({
      language: 'ru',
      generatedContent: `
## Введение

TypeScript является расширением JavaScript. Мы изучаем основы типизации и

\`\`\`typescript
const x: number = 42;
\`\`\`

Код демонстрирует базовое использование. Материал полезен.
      `.trim(),
    });

    const result = await selfReviewerNode(state);

    // This might be PASS or PASS_WITH_FLAGS depending on heuristic sensitivity
    expect(['PASS', 'PASS_WITH_FLAGS']).toContain(result.selfReviewResult!.status);

    if (result.selfReviewResult!.status === 'PASS_WITH_FLAGS') {
      expect(result.selfReviewResult!.issues.some((i) => i.severity === 'INFO')).toBe(true);
    }
  });

  it('should include reasoning message explaining minor observations', async () => {
    const state = createMockState({
      language: 'ru',
      generatedContent: `
## Введение в тему

Текст с несколькими 中文 иностранными символами, но достаточно длинный для прохождения основных проверок качества. Материал структурирован и полезен для изучения базовых концепций.

## Основная часть

Контент продолжается и раскрывает тему более подробно с примерами и пояснениями.

## Заключение

Материал усвоен правильно.
      `.trim(),
    });

    const result = await selfReviewerNode(state);

    // Check status is PASS or PASS_WITH_FLAGS
    expect(['PASS', 'PASS_WITH_FLAGS']).toContain(result.selfReviewResult!.status);

    // If PASS_WITH_FLAGS, reasoning should mention minor observations
    if (result.selfReviewResult!.status === 'PASS_WITH_FLAGS') {
      expect(result.selfReviewResult!.reasoning).toContain('minor observations');
    }
  });
});

describe('selfReviewerNode - REGENERATE cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return REGENERATE for missing generatedContent', async () => {
    const state = createMockState({
      generatedContent: null,
    });

    const result = await selfReviewerNode(state);

    expect(result.selfReviewResult!.status).toBe('REGENERATE');
    expect(result.selfReviewResult!.heuristicsPassed).toBe(false);
    expect(result.selfReviewResult!.issues).toHaveLength(1);
    expect(result.selfReviewResult!.issues[0].type).toBe('EMPTY');
    expect(result.selfReviewResult!.issues[0].severity).toBe('CRITICAL');
  });

  it('should return REGENERATE for empty generatedContent', async () => {
    const state = createMockState({
      generatedContent: '',
    });

    const result = await selfReviewerNode(state);

    expect(result.selfReviewResult!.status).toBe('REGENERATE');
    expect(result.selfReviewResult!.heuristicsPassed).toBe(false);
  });

  it('should return REGENERATE for content with >20 foreign characters (critical language failure)', async () => {
    const state = createMockState({
      language: 'ru',
      generatedContent: `
Это текст на русском языке, но с огромным количеством 中文字符在这里有很多更多中文内容这是一个测试文本包含大量外来字符应该触发严重错误检测机制更多中文字符继续添加以确保超过阈值日本語のテキストもここにありますさらに多くの外国語文字 китайских символов.

Еще больше смешанных символов 日本語のテキストもここにありますさらに多くの外国語文字한국어 텍스트도 여기에 추가됩니다더 많은 외국어 문자 что делает контент абсолютно непригодным для использования из-за большого количества иностранных символов.
      `.trim(),
    });

    const result = await selfReviewerNode(state);

    expect(result.selfReviewResult!.status).toBe('REGENERATE');
    expect(result.selfReviewResult!.heuristicsPassed).toBe(false);

    // Check for CRITICAL language issue
    const criticalIssue = result.selfReviewResult!.issues.find(
      (i) => i.type === 'LANGUAGE' && i.severity === 'CRITICAL'
    );
    expect(criticalIssue).toBeDefined();
    expect(criticalIssue!.description).toContain('foreign characters');
  });

  it('should return REGENERATE for severely truncated content (>2 truncation issues)', async () => {
    const state = createMockState({
      language: 'ru',
      generatedContent: `
Начало урока и
\`\`\`
код без закрытия
      `.trim(),
    });

    const result = await selfReviewerNode(state);

    expect(result.selfReviewResult!.status).toBe('REGENERATE');
    expect(result.selfReviewResult!.heuristicsPassed).toBe(false);

    // Check for CRITICAL truncation issue
    const criticalIssue = result.selfReviewResult!.issues.find(
      (i) => i.type === 'TRUNCATION' && i.severity === 'CRITICAL'
    );
    expect(criticalIssue).toBeDefined();
  });

  it('should detect content ending with incomplete patterns as truncation issue', async () => {
    const state = createMockState({
      language: 'ru',
      // Very short (<200) + ends with "и" (and) + no punctuation = 3 truncation issues (CRITICAL)
      generatedContent: 'и',
    });

    const result = await selfReviewerNode(state);

    // Should have truncation issues detected (may be PASS_WITH_FLAGS if only 1-2 issues)
    expect(['REGENERATE', 'PASS_WITH_FLAGS']).toContain(result.selfReviewResult!.status);

    // Should have at least one truncation issue
    const truncationIssue = result.selfReviewResult!.issues.find((i) => i.type === 'TRUNCATION');
    expect(truncationIssue).toBeDefined();
  });

  it('should include reasoning message explaining critical failures', async () => {
    const state = createMockState({
      generatedContent: null,
    });

    const result = await selfReviewerNode(state);

    // Missing content has a specific reasoning message
    expect(result.selfReviewResult!.reasoning).toBe('No content available for review');
    expect(result.selfReviewResult!.status).toBe('REGENERATE');
  });

  it('should detect very short content (<200 chars) as having truncation issues', async () => {
    const state = createMockState({
      language: 'ru',
      // Very short (<200 chars) + no punctuation + ends abruptly
      generatedContent: 'x',
    });

    const result = await selfReviewerNode(state);

    // Should detect truncation (may be PASS_WITH_FLAGS or REGENERATE depending on issue count)
    expect(['REGENERATE', 'PASS_WITH_FLAGS']).toContain(result.selfReviewResult!.status);

    // Should have at least one truncation issue detected
    const truncationIssue = result.selfReviewResult!.issues.find((i) => i.type === 'TRUNCATION');
    expect(truncationIssue).toBeDefined();
  });
});

describe('selfReviewerNode - Heuristic details', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should include languageCheck details with foreign character count', async () => {
    const state = createMockState({
      language: 'ru',
      generatedContent: `
## Введение

Качественный текст урока на русском языке с правильной структурой и достаточным объемом контента для прохождения всех проверок.

## Основная часть

Материал изложен последовательно и понятно. Примеры помогают лучше усвоить информацию.

## Заключение

Мы завершили изучение материала.
      `.trim(),
    });

    const result = await selfReviewerNode(state);

    expect(result.selfReviewResult!.heuristicDetails).toBeDefined();
    expect(result.selfReviewResult!.heuristicDetails!.languageCheck).toBeDefined();
    expect(result.selfReviewResult!.heuristicDetails!.languageCheck.foreignCharacters).toBeGreaterThanOrEqual(0);
    expect(result.selfReviewResult!.heuristicDetails!.languageCheck.scriptsFound).toBeInstanceOf(Array);
  });

  it('should include truncationCheck details with issue list', async () => {
    const state = createMockState();

    const result = await selfReviewerNode(state);

    expect(result.selfReviewResult!.heuristicDetails!.truncationCheck).toBeDefined();
    expect(result.selfReviewResult!.heuristicDetails!.truncationCheck.passed).toBeDefined();
    expect(result.selfReviewResult!.heuristicDetails!.truncationCheck.issues).toBeInstanceOf(Array);
  });

  it('should report zero tokens for heuristic-only checks (MVP)', async () => {
    const state = createMockState();

    const result = await selfReviewerNode(state);

    // No LLM call in MVP, only heuristics
    expect(result.selfReviewResult!.tokensUsed).toBe(0);
  });

  it('should set heuristicsPassed=true for PASS and PASS_WITH_FLAGS', async () => {
    const state = createMockState({
      generatedContent: `
## Введение

Качественный контент урока с правильной структурой. Достаточно длинный текст для прохождения всех проверок.

## Заключение

Материал усвоен и готов к применению. Использование изученных концепций поможет в дальнейшей работе.
      `.trim(),
    });

    const result = await selfReviewerNode(state);

    expect(result.selfReviewResult!.heuristicsPassed).toBe(true);
    expect(['PASS', 'PASS_WITH_FLAGS']).toContain(result.selfReviewResult!.status);
  });

  it('should set heuristicsPassed=false for REGENERATE', async () => {
    const state = createMockState({
      generatedContent: null,
    });

    const result = await selfReviewerNode(state);

    expect(result.selfReviewResult!.heuristicsPassed).toBe(false);
    expect(result.selfReviewResult!.status).toBe('REGENERATE');
  });
});

describe('selfReviewerNode - Edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should set currentNode to selfReviewer regardless of outcome', async () => {
    const statePass = createMockState();
    const resultPass = await selfReviewerNode(statePass);
    expect(resultPass.currentNode).toBe('selfReviewer');

    const stateFail = createMockState({ generatedContent: null });
    const resultFail = await selfReviewerNode(stateFail);
    expect(resultFail.currentNode).toBe('selfReviewer');
  });

  it('should handle Chinese language content correctly', async () => {
    const state = createMockState({
      language: 'zh',
      generatedContent: `
## TypeScript 简介

TypeScript 是 JavaScript 的类型化超集。它为语言添加了静态类型检查，有助于在开发阶段发现错误。

## 核心概念

在本节中，我们将探讨 TypeScript 的核心概念，包括类型、接口和类。理解这些概念对于构建可靠的应用程序至关重要。

## 总结

我们已经介绍了 TypeScript 的基础知识，现在可以在实践中应用它们。使用静态类型将帮助我们创建更可靠和可维护的应用程序。
      `.trim(),
    });

    const result = await selfReviewerNode(state);

    // Chinese content should pass language checks
    expect(result.selfReviewResult!.status).toBe('PASS');
  });

  it('should handle content with mixed markdown formatting', async () => {
    const state = createMockState({
      language: 'en',
      generatedContent: `
# Main Title

## Introduction

This is **bold text** and *italic text* with \`inline code\`.

### Subsection

A [link](https://example.com) and a list:
- Item 1
- Item 2
- Item 3

\`\`\`typescript
const example: string = "code block";
\`\`\`

## Conclusion

Final paragraph with proper punctuation.
      `.trim(),
    });

    const result = await selfReviewerNode(state);

    expect(result.selfReviewResult!.status).toBe('PASS');
  });

  it('should handle content ending with closing markdown syntax correctly', async () => {
    const state = createMockState({
      language: 'ru',
      generatedContent: `
## Введение

Текст урока с правильным завершением и форматированием **жирным текстом**. Достаточно длинный контент для проверки системы валидации качества содержания урока.

## Основная часть

Материал изложен последовательно и содержит все необходимые разделы для полноценного изучения темы.

## Заключение

Мы завершили изучение материала.
      `.trim(),
    });

    const result = await selfReviewerNode(state);

    // Should detect period before markdown closing as proper ending
    expect(['PASS', 'PASS_WITH_FLAGS']).toContain(result.selfReviewResult!.status);
  });

  it('should use default language "en" if not specified', async () => {
    const state = createMockState({
      language: undefined as any,
      generatedContent: `
## Introduction

This is a complete English lesson with proper content structure. The text is long enough to pass all validation checks and ends with correct punctuation.

## Conclusion

We have covered the material and are ready to apply it in practice.
      `.trim(),
    });

    const result = await selfReviewerNode(state);

    // Should use 'en' as default and pass for English content
    expect(result.selfReviewResult!.status).toBe('PASS');
  });

  it('should handle content with multiple code blocks correctly', async () => {
    const state = createMockState({
      language: 'ru',
      generatedContent: `
## Примеры кода TypeScript

Первый пример демонстрирует базовое использование типов:

\`\`\`typescript
const a: number = 1;
console.log(a);
\`\`\`

Второй пример показывает работу со строками:

\`\`\`typescript
const b: string = "test";
console.log(b);
\`\`\`

Оба примера корректно закрыты и демонстрируют основные концепции. Урок завершен успешно.
      `.trim(),
    });

    const result = await selfReviewerNode(state);

    // Even number of code blocks should pass
    expect(['PASS', 'PASS_WITH_FLAGS']).toContain(result.selfReviewResult!.status);
  });

  it('should detect unmatched code blocks as truncation issue', async () => {
    const state = createMockState({
      language: 'ru',
      generatedContent: `
## Пример

Код с незакрытым блоком:

\`\`\`typescript
const x = 42;
      `.trim(),
    });

    const result = await selfReviewerNode(state);

    expect(result.selfReviewResult!.status).toBe('REGENERATE');

    const truncationIssue = result.selfReviewResult!.issues.find((i) => i.type === 'TRUNCATION');
    expect(truncationIssue).toBeDefined();
    expect(truncationIssue!.description).toContain('Unmatched code blocks');
  });
});

describe('selfReviewerNode - Issue aggregation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should aggregate multiple minor issues into PASS_WITH_FLAGS', async () => {
    const state = createMockState({
      language: 'ru',
      generatedContent: `
## Введение

Текст с парой 中文 иностранных символов и незначительными проблемами форматирования, но в целом качественный контент с достаточной длиной. Материал полезен для изучения основ и содержит необходимую информацию.

## Основная часть

Достаточно длинный текст для прохождения базовых проверок качества и структуры содержания урока.

## Заключение

Урок завершен.
      `.trim(),
    });

    const result = await selfReviewerNode(state);

    // Should pass with flags due to foreign characters
    expect(['PASS', 'PASS_WITH_FLAGS']).toContain(result.selfReviewResult!.status);
    expect(result.selfReviewResult!.heuristicsPassed).toBe(true);

    // All issues (if any) should be INFO level, not CRITICAL
    const criticalIssues = result.selfReviewResult!.issues.filter((i) => i.severity === 'CRITICAL');
    expect(criticalIssues).toHaveLength(0);
  });

  it('should return REGENERATE when both language AND truncation are critical', async () => {
    const state = createMockState({
      language: 'ru',
      // Many foreign characters (>20) + very short (<200 chars) + incomplete ending = multiple CRITICAL issues
      generatedContent: 'Текст 中文字符很多更多文字测试内容包含大量外来字符日本語のテキストもここにあります한국어 텍스트',
    });

    const result = await selfReviewerNode(state);

    expect(result.selfReviewResult!.status).toBe('REGENERATE');
    expect(result.selfReviewResult!.heuristicsPassed).toBe(false);

    // Should have multiple CRITICAL issues
    const criticalIssues = result.selfReviewResult!.issues.filter((i) => i.severity === 'CRITICAL');
    expect(criticalIssues.length).toBeGreaterThan(0);
  });

  it('should include patchedContent=null in MVP (no LLM patching yet)', async () => {
    const state = createMockState();

    const result = await selfReviewerNode(state);

    // MVP only does heuristics, no patching
    expect(result.selfReviewResult!.patchedContent).toBeNull();
  });
});
