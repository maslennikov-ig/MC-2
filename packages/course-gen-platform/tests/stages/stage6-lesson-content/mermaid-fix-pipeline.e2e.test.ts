/**
 * E2E Tests for Mermaid Fix Pipeline
 * @module stages/stage6-lesson-content/mermaid-fix-pipeline.e2e.test
 *
 * Tests the complete Mermaid fix pipeline using real broken content from database.
 *
 * Pipeline layers tested:
 * 1. Prevention (prompt guidelines) - N/A in test, tested via generator behavior
 * 2. Automatic fix (sanitizer) - sanitizeMermaidBlocks()
 * 3. Detection (heuristic filter) - checkMermaidSyntax()
 * 4. Model-based fix (Judge/Patcher) - mocked for unit tests
 *
 * Real broken content source:
 * - Lesson: "Сценарий 'Дожим' (Closing the Deal)"
 * - content_id: 46fa4955-b4ae-4220-af1f-d0df10a6ff89
 * - Contains Mermaid diagrams with escaped quotes that break rendering
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sanitizeMermaidBlocks,
  hasBrokenMermaidSyntax,
  countMermaidBlocks,
} from '../../../src/stages/stage6-lesson-content/utils/mermaid-sanitizer.js';
import { checkMermaidSyntax } from '../../../src/stages/stage6-lesson-content/judge/heuristic-filter.js';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('@/shared/logger', () => ({
  default: {
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

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// REAL BROKEN CONTENT FROM DATABASE
// ============================================================================

/**
 * Real broken Mermaid content from lesson "Сценарий 'Дожим' (Closing the Deal)"
 * Extracted from lesson_contents.content where content_id = '46fa4955-b4ae-4220-af1f-d0df10a6ff89'
 *
 * These are actual LLM-generated diagrams that contained escaped quotes
 */
const REAL_BROKEN_CONTENT = {
  lesson1: {
    title: "Сценарий 'Дожим' (Closing the Deal)",
    content_id: '46fa4955-b4ae-4220-af1f-d0df10a6ff89',
    brokenMermaid: `## Сценарий "Дожим"

\`\`\`mermaid
flowchart TD
    A[Напоминание: \\"Мы обсуждали сессию по digital-трансформации\\"]
    B[Уточнение статуса: \\"Вы успели рассмотреть наше предложение?\\"]
    C[Создание срочности: \\"До конца месяца действует специальное условие\\"]
    D[Закрытие: \\"Готовы зафиксировать дату?\\"]
    A --> B
    B --> C
    C --> D
\`\`\`

Данный сценарий помогает довести сделку до завершения.`,
    expectedClean: `## Сценарий "Дожим"

\`\`\`mermaid
flowchart TD
    A[Напоминание: Мы обсуждали сессию по digital-трансформации]
    B[Уточнение статуса: Вы успели рассмотреть наше предложение?]
    C[Создание срочности: До конца месяца действует специальное условие]
    D[Закрытие: Готовы зафиксировать дату?]
    A --> B
    B --> C
    C --> D
\`\`\`

Данный сценарий помогает довести сделку до завершения.`,
  },

  lesson2: {
    title: 'Работа со статусами сделки',
    brokenMermaid: `## Схема работы

\`\`\`mermaid
flowchart LR
    A[Последний контакт: \\"Обещал ответ до X\\"]
    B[Сделка в статусе \\"Переговоры\\"]
    C[Следующий шаг: \\"Уточнить бюджет\\"]
    A --> B --> C
\`\`\`

Важно отслеживать каждый этап.`,
    expectedClean: `## Схема работы

\`\`\`mermaid
flowchart LR
    A[Последний контакт: Обещал ответ до X]
    B[Сделка в статусе Переговоры]
    C[Следующий шаг: Уточнить бюджет]
    A --> B --> C
\`\`\`

Важно отслеживать каждый этап.`,
  },

  lesson3: {
    title: 'Сложный сценарий с множественными диаграммами',
    brokenMermaid: `## Первая диаграмма

\`\`\`mermaid
flowchart TD
    A[Шаг 1: \\"Инициация\\"]
    B{Решение: \\"Продолжаем?\\"}
    A --> B
    B -->|Да| C[Шаг 2: \\"Подготовка\\"]
    B -->|Нет| D[Завершение: \\"Отказ\\"]
\`\`\`

## Вторая диаграмма

\`\`\`mermaid
sequenceDiagram
    participant M as Менеджер
    participant K as Клиент
    M->>K: Приветствие: \\"Добрый день!\\"
    K->>M: Ответ: \\"Здравствуйте\\"
    M->>K: Предложение: \\"Рассмотрите наш продукт\\"
\`\`\`

Обе диаграммы иллюстрируют процесс.`,
    expectedClean: `## Первая диаграмма

\`\`\`mermaid
flowchart TD
    A[Шаг 1: Инициация]
    B{Решение: Продолжаем?}
    A --> B
    B -->|Да| C[Шаг 2: Подготовка]
    B -->|Нет| D[Завершение: Отказ]
\`\`\`

## Вторая диаграмма

\`\`\`mermaid
sequenceDiagram
    participant M as Менеджер
    participant K as Клиент
    M->>K: Приветствие: Добрый день!
    K->>M: Ответ: Здравствуйте
    M->>K: Предложение: Рассмотрите наш продукт
\`\`\`

Обе диаграммы иллюстрируют процесс.`,
  },
};

// ============================================================================
// E2E PIPELINE TESTS
// ============================================================================

describe('Mermaid Fix Pipeline E2E', () => {
  describe('Layer 1: Detection (hasBrokenMermaidSyntax)', () => {
    it('should detect broken Mermaid in real lesson 1', () => {
      const result = hasBrokenMermaidSyntax(REAL_BROKEN_CONTENT.lesson1.brokenMermaid);
      expect(result).toBe(true);
    });

    it('should detect broken Mermaid in real lesson 2', () => {
      const result = hasBrokenMermaidSyntax(REAL_BROKEN_CONTENT.lesson2.brokenMermaid);
      expect(result).toBe(true);
    });

    it('should detect broken Mermaid in real lesson 3 (multiple diagrams)', () => {
      const result = hasBrokenMermaidSyntax(REAL_BROKEN_CONTENT.lesson3.brokenMermaid);
      expect(result).toBe(true);
    });

    it('should not detect issues in clean content', () => {
      const result = hasBrokenMermaidSyntax(REAL_BROKEN_CONTENT.lesson1.expectedClean);
      expect(result).toBe(false);
    });
  });

  describe('Layer 2: Automatic Fix (sanitizeMermaidBlocks)', () => {
    it('should fix real lesson 1 - single diagram with 8 escaped quotes', () => {
      const result = sanitizeMermaidBlocks(REAL_BROKEN_CONTENT.lesson1.brokenMermaid);

      expect(result.modified).toBe(true);
      expect(result.blocksProcessed).toBe(1);
      expect(result.fixes.length).toBe(1);
      expect(result.fixes[0].type).toBe('ESCAPED_QUOTE_REMOVED');
      expect(result.fixes[0].count).toBe(8); // 4 pairs of quotes
      expect(result.content).not.toContain('\\"');
      expect(result.content).toContain('Напоминание: Мы обсуждали сессию');
    });

    it('should fix real lesson 2 - single diagram with 6 escaped quotes', () => {
      const result = sanitizeMermaidBlocks(REAL_BROKEN_CONTENT.lesson2.brokenMermaid);

      expect(result.modified).toBe(true);
      expect(result.blocksProcessed).toBe(1);
      expect(result.fixes[0].count).toBe(6); // 3 pairs of quotes
      expect(result.content).not.toContain('\\"');
    });

    it('should fix real lesson 3 - multiple diagrams with total 14 escaped quotes', () => {
      const result = sanitizeMermaidBlocks(REAL_BROKEN_CONTENT.lesson3.brokenMermaid);

      expect(result.modified).toBe(true);
      expect(result.blocksProcessed).toBe(2); // 2 Mermaid blocks
      expect(result.fixes.length).toBe(2);

      const totalQuotesFixed = result.fixes.reduce((sum, fix) => sum + fix.count, 0);
      expect(totalQuotesFixed).toBe(14); // 7 pairs across both diagrams

      expect(result.content).not.toContain('\\"');
    });

    it('should produce content matching expected clean version for lesson 1', () => {
      const result = sanitizeMermaidBlocks(REAL_BROKEN_CONTENT.lesson1.brokenMermaid);
      expect(result.content).toBe(REAL_BROKEN_CONTENT.lesson1.expectedClean);
    });

    it('should produce content matching expected clean version for lesson 2', () => {
      const result = sanitizeMermaidBlocks(REAL_BROKEN_CONTENT.lesson2.brokenMermaid);
      expect(result.content).toBe(REAL_BROKEN_CONTENT.lesson2.expectedClean);
    });

    it('should produce content matching expected clean version for lesson 3', () => {
      const result = sanitizeMermaidBlocks(REAL_BROKEN_CONTENT.lesson3.brokenMermaid);
      expect(result.content).toBe(REAL_BROKEN_CONTENT.lesson3.expectedClean);
    });

    it('should not modify already clean content', () => {
      const result = sanitizeMermaidBlocks(REAL_BROKEN_CONTENT.lesson1.expectedClean);

      expect(result.modified).toBe(false);
      expect(result.fixes.length).toBe(0);
      expect(result.content).toBe(REAL_BROKEN_CONTENT.lesson1.expectedClean);
    });
  });

  describe('Layer 3: Heuristic Filter (checkMermaidSyntax)', () => {
    it('should detect issues in broken lesson 1 before sanitization', () => {
      const result = checkMermaidSyntax(REAL_BROKEN_CONTENT.lesson1.brokenMermaid);

      expect(result.passed).toBe(false);
      expect(result.totalDiagrams).toBe(1);
      expect(result.affectedDiagrams).toBe(1);
      expect(result.mermaidIssues.some(i => i.includes('escaped quotes'))).toBe(true);
    });

    it('should detect issues in broken lesson 3 with multiple diagrams', () => {
      const result = checkMermaidSyntax(REAL_BROKEN_CONTENT.lesson3.brokenMermaid);

      expect(result.passed).toBe(false);
      expect(result.totalDiagrams).toBe(2);
      expect(result.affectedDiagrams).toBe(2); // Both diagrams have issues
    });

    it('should pass after sanitization for lesson 1', () => {
      const sanitized = sanitizeMermaidBlocks(REAL_BROKEN_CONTENT.lesson1.brokenMermaid);
      const result = checkMermaidSyntax(sanitized.content);

      expect(result.passed).toBe(true);
      expect(result.totalDiagrams).toBe(1);
      expect(result.affectedDiagrams).toBe(0);
    });

    it('should pass after sanitization for lesson 3', () => {
      const sanitized = sanitizeMermaidBlocks(REAL_BROKEN_CONTENT.lesson3.brokenMermaid);
      const result = checkMermaidSyntax(sanitized.content);

      expect(result.passed).toBe(true);
      expect(result.totalDiagrams).toBe(2);
      expect(result.affectedDiagrams).toBe(0);
    });
  });

  describe('Full Pipeline: Detection → Fix → Verification', () => {
    it('should complete full pipeline for lesson 1', () => {
      const content = REAL_BROKEN_CONTENT.lesson1.brokenMermaid;

      // Step 1: Detection
      expect(hasBrokenMermaidSyntax(content)).toBe(true);
      const preCheck = checkMermaidSyntax(content);
      expect(preCheck.passed).toBe(false);

      // Step 2: Automatic Fix
      const fixResult = sanitizeMermaidBlocks(content);
      expect(fixResult.modified).toBe(true);

      // Step 3: Verification
      expect(hasBrokenMermaidSyntax(fixResult.content)).toBe(false);
      const postCheck = checkMermaidSyntax(fixResult.content);
      expect(postCheck.passed).toBe(true);

      // Step 4: Content Integrity
      expect(fixResult.content).toContain('flowchart TD');
      expect(fixResult.content).toContain('A --> B');
      expect(fixResult.content).toContain('Сценарий "Дожим"'); // Non-mermaid text preserved
    });

    it('should complete full pipeline for lesson 3 with multiple diagrams', () => {
      const content = REAL_BROKEN_CONTENT.lesson3.brokenMermaid;

      // Step 1: Count diagrams
      expect(countMermaidBlocks(content)).toBe(2);

      // Step 2: Detection
      expect(hasBrokenMermaidSyntax(content)).toBe(true);
      const preCheck = checkMermaidSyntax(content);
      expect(preCheck.passed).toBe(false);
      expect(preCheck.affectedDiagrams).toBe(2);

      // Step 3: Automatic Fix
      const fixResult = sanitizeMermaidBlocks(content);
      expect(fixResult.modified).toBe(true);
      expect(fixResult.blocksProcessed).toBe(2);

      // Step 4: Verification
      expect(hasBrokenMermaidSyntax(fixResult.content)).toBe(false);
      const postCheck = checkMermaidSyntax(fixResult.content);
      expect(postCheck.passed).toBe(true);
      expect(postCheck.affectedDiagrams).toBe(0);

      // Step 5: Content Integrity - both diagram types preserved
      expect(fixResult.content).toContain('flowchart TD');
      expect(fixResult.content).toContain('sequenceDiagram');
      expect(fixResult.content).toContain('participant M as Менеджер');
    });
  });

  describe('Edge Cases from Real Data', () => {
    it('should handle decision diamonds with quotes', () => {
      const content = `\`\`\`mermaid
flowchart TD
    A{Решение: \\"Продолжаем?\\"}
\`\`\``;

      const result = sanitizeMermaidBlocks(content);

      expect(result.modified).toBe(true);
      expect(result.content).toContain('A{Решение: Продолжаем?}');
      expect(result.content).not.toContain('\\"');
    });

    it('should handle conditional edge labels with quotes', () => {
      const content = `\`\`\`mermaid
flowchart TD
    A -->|\\"Да\\"| B
    A -->|\\"Нет\\"| C
\`\`\``;

      const result = sanitizeMermaidBlocks(content);

      expect(result.modified).toBe(true);
      expect(result.content).toContain('A -->|Да| B');
      expect(result.content).toContain('A -->|Нет| C');
    });

    it('should handle sequence diagram messages with quotes', () => {
      const content = `\`\`\`mermaid
sequenceDiagram
    A->>B: Сообщение: \\"Привет\\"
    B->>A: Ответ: \\"Здравствуй\\"
\`\`\``;

      const result = sanitizeMermaidBlocks(content);

      expect(result.modified).toBe(true);
      expect(result.content).toContain('A->>B: Сообщение: Привет');
      expect(result.content).toContain('B->>A: Ответ: Здравствуй');
    });

    it('should preserve non-Mermaid escaped quotes', () => {
      const content = `## Урок о "кавычках"

Обычный текст с \\"escaped quotes\\" вне Mermaid.

\`\`\`mermaid
flowchart TD
    A[Узел: \\"текст\\"]
\`\`\`

Ещё текст с \\"кавычками\\".`;

      const result = sanitizeMermaidBlocks(content);

      // Only Mermaid content should be sanitized
      expect(result.content).toContain('A[Узел: текст]'); // Mermaid fixed
      expect(result.content).toContain('Обычный текст с \\"escaped quotes\\"'); // Non-mermaid preserved
      expect(result.content).toContain('Ещё текст с \\"кавычками\\"'); // Non-mermaid preserved
    });
  });
});

// ============================================================================
// INVALID ARROW SYNTAX DETECTION
// ============================================================================

describe('Invalid Arrow Syntax Detection', () => {
  it('should detect invalid single arrow (->) syntax', () => {
    const content = `\`\`\`mermaid
flowchart TD
    A -> B
    B -> C
\`\`\``;

    const result = checkMermaidSyntax(content);

    expect(result.passed).toBe(false);
    expect(result.mermaidIssues.some(i => i.includes('Invalid arrow syntax'))).toBe(true);
  });

  it('should pass valid double arrow (-->) syntax', () => {
    const content = `\`\`\`mermaid
flowchart TD
    A --> B
    B --> C
\`\`\``;

    const result = checkMermaidSyntax(content);

    expect(result.passed).toBe(true);
    expect(result.mermaidIssues.length).toBe(0);
  });

  it('should pass valid dotted arrow (-.->)', () => {
    const content = `\`\`\`mermaid
flowchart TD
    A -.-> B
    B -.-> C
\`\`\``;

    const result = checkMermaidSyntax(content);

    expect(result.passed).toBe(true);
  });

  it('should detect mixed valid and invalid arrows', () => {
    const content = `\`\`\`mermaid
flowchart TD
    A --> B
    B -> C
    C --> D
\`\`\``;

    const result = checkMermaidSyntax(content);

    expect(result.passed).toBe(false);
    expect(result.mermaidIssues.some(i => i.includes('Invalid arrow syntax'))).toBe(true);
  });

  it('should not flag sequence diagram arrows', () => {
    const content = `\`\`\`mermaid
sequenceDiagram
    A->>B: Message
    B-->>A: Response
\`\`\``;

    const result = checkMermaidSyntax(content);

    // Sequence diagrams use different arrow syntax, should not trigger flowchart arrow check
    expect(result.passed).toBe(true);
  });
});

// ============================================================================
// STATISTICS
// ============================================================================

describe('Real Data Statistics', () => {
  it('should report accurate fix statistics', () => {
    const allContent = [
      REAL_BROKEN_CONTENT.lesson1.brokenMermaid,
      REAL_BROKEN_CONTENT.lesson2.brokenMermaid,
      REAL_BROKEN_CONTENT.lesson3.brokenMermaid,
    ];

    let totalBlocks = 0;
    let totalFixes = 0;
    let totalQuotesRemoved = 0;

    for (const content of allContent) {
      const result = sanitizeMermaidBlocks(content);
      totalBlocks += result.blocksProcessed;
      totalFixes += result.fixes.length;
      totalQuotesRemoved += result.fixes.reduce((sum, fix) => sum + fix.count, 0);
    }

    // Expected: 4 Mermaid blocks total, 4 fixes, 28 quotes removed (8+6+14)
    expect(totalBlocks).toBe(4);
    expect(totalFixes).toBe(4);
    expect(totalQuotesRemoved).toBe(28);
  });
});
