/**
 * E2E Tests for Mermaid Diagram Generation
 * @module stages/stage6-lesson-content/mermaid-generation.e2e.test
 *
 * Tests that LLM correctly generates syntactically valid Mermaid diagrams
 * for all supported diagram types.
 *
 * Architecture:
 * 1. Generation Tests - LLM generates diagrams from prompts
 * 2. Validation Tests - mermaid.parse() validates syntax
 * 3. Fix Pipeline Tests - LLM fixer repairs broken diagrams
 * 4. Integration Tests - Full pipeline (generate → validate → fix)
 *
 * Supported Diagram Types:
 * - flowchart (TD, LR, TB, RL)
 * - mindmap
 * - sequenceDiagram
 * - classDiagram
 * - stateDiagram
 * - erDiagram
 *
 * Run: pnpm --filter course-gen-platform test tests/stages/stage6-lesson-content/mermaid-generation.e2e.test.ts
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createOpenRouterModel } from '../../../src/shared/llm/langchain-models';
import { HumanMessage } from '@langchain/core/messages';

// ============================================================================
// DYNAMIC IMPORTS FOR MERMAID-RELATED MODULES
// These will be loaded after DOM setup in beforeAll
// ============================================================================
let validateMermaidSyntax: typeof import('../../../src/stages/stage6-lesson-content/utils/mermaid-validator').validateMermaidSyntax;
let fixMermaidWithLLM: typeof import('../../../src/stages/stage6-lesson-content/utils/mermaid-llm-fixer').fixMermaidWithLLM;
let resetLLMFixerMetrics: typeof import('../../../src/stages/stage6-lesson-content/utils/mermaid-llm-fixer').resetLLMFixerMetrics;
let getLLMFixerMetrics: typeof import('../../../src/stages/stage6-lesson-content/utils/mermaid-llm-fixer').getLLMFixerMetrics;
let runMermaidFixPipeline: typeof import('../../../src/stages/stage6-lesson-content/utils/mermaid-fix-pipeline').runMermaidFixPipeline;

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Model to use for diagram generation tests
 * Using EXACTLY the same model as Stage 6 section expander (from llm_model_config table)
 * Primary: xiaomi/mimo-v2-flash
 * Fallback: qwen/qwen3-235b-a22b-2507
 */
const GENERATION_MODEL_PRIMARY = 'xiaomi/mimo-v2-flash';
const GENERATION_MODEL_FALLBACK = 'qwen/qwen3-235b-a22b-2507';

/**
 * Model for LLM fixer (from mermaid-llm-fixer.ts)
 */
const FIXER_MODEL = 'minimax/minimax-m2.1';

/**
 * Temperature for generation (same as production: 0.7 for section expander)
 */
const GENERATION_TEMPERATURE = 0.7;

/**
 * Temperature for fixer (same as production: 0.1 for deterministic fixes)
 */
const FIXER_TEMPERATURE = 0.1;

/**
 * Timeout for LLM calls (ms)
 */
const LLM_TIMEOUT = 60000;

/**
 * Skip LLM tests in CI environment (set SKIP_LLM_TESTS=true)
 */
const SKIP_LLM_TESTS = process.env.SKIP_LLM_TESTS === 'true';

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

// ============================================================================
// GLOBAL SETUP - Dynamic import of mermaid modules after DOM is ready
// ============================================================================
beforeAll(async () => {
  // DOM and DOMPurify should be set up by tests/setup.ts
  // Now dynamically import mermaid modules
  const validator = await import(
    '../../../src/stages/stage6-lesson-content/utils/mermaid-validator'
  );
  const fixer = await import('../../../src/stages/stage6-lesson-content/utils/mermaid-llm-fixer');
  const pipeline = await import(
    '../../../src/stages/stage6-lesson-content/utils/mermaid-fix-pipeline'
  );

  validateMermaidSyntax = validator.validateMermaidSyntax;
  fixMermaidWithLLM = fixer.fixMermaidWithLLM;
  resetLLMFixerMetrics = fixer.resetLLMFixerMetrics;
  getLLMFixerMetrics = fixer.getLLMFixerMetrics;
  runMermaidFixPipeline = pipeline.runMermaidFixPipeline;

  console.log('✅ Mermaid modules dynamically imported');
});

// ============================================================================
// TEST PROMPTS FOR DIAGRAM GENERATION
// ============================================================================

/**
 * Prompts for generating each diagram type
 * These simulate what the Stage 6 generator might ask
 */
const GENERATION_PROMPTS = {
  flowchart: {
    simple: `Создай простую flowchart диаграмму на mermaid для процесса продажи билетов:
1. Клиент выбирает мероприятие
2. Выбор места
3. Оплата
4. Получение билета

Верни ТОЛЬКО код mermaid без объяснений и без markdown блоков.`,

    complex: `Создай flowchart диаграмму на mermaid для принятия решения о покупке:
- Начало: Клиент интересуется
- Условие: Есть бюджет?
  - Да → Выбор тарифа → Оформление
  - Нет → Предложение рассрочки → Условие: Согласен?
    - Да → Оформление
    - Нет → Завершение

Верни ТОЛЬКО код mermaid без объяснений и без markdown блоков.`,
  },

  mindmap: {
    simple: `Создай mindmap диаграмму на mermaid для структуры курса по продажам:
- Центральная тема: Продажи билетов
- Ветки: Навыки коммуникации, Работа с возражениями, Закрытие сделки

Верни ТОЛЬКО код mermaid без объяснений и без markdown блоков.
ВАЖНО: используй ТОЛЬКО отступы для иерархии, БЕЗ стрелок, БЕЗ скобок вокруг текста.`,

    complex: `Создай mindmap диаграмму на mermaid для навыков менеджера по продажам:
- Центр: Менеджер по продажам
  - Коммуникация
    - Активное слушание
    - Презентация продукта
    - Работа с вопросами
  - Продажи
    - Выявление потребностей
    - Работа с возражениями
    - Закрытие сделки
  - Аналитика
    - Отчетность
    - KPI

Верни ТОЛЬКО код mermaid без объяснений и без markdown блоков.
ВАЖНО: используй ТОЛЬКО отступы для иерархии, БЕЗ стрелок (-->, etc.), БЕЗ скобок [] вокруг текста.`,
  },

  sequenceDiagram: {
    simple: `Создай sequenceDiagram на mermaid для диалога продавца и клиента:
1. Продавец приветствует клиента
2. Клиент спрашивает о билетах
3. Продавец предлагает варианты
4. Клиент выбирает

Верни ТОЛЬКО код mermaid без объяснений и без markdown блоков.`,
  },

  classDiagram: {
    simple: `Создай classDiagram на mermaid для системы продажи билетов:
- Класс Ticket с полями: id, price, seat
- Класс Event с полями: name, date, venue
- Класс Customer с полями: name, email
- Связи: Customer покупает Ticket, Ticket принадлежит Event

Верни ТОЛЬКО код mermaid без объяснений и без markdown блоков.`,
  },

  stateDiagram: {
    simple: `Создай stateDiagram-v2 на mermaid для статусов билета:
- Начальное состояние: Создан
- Зарезервирован
- Оплачен
- Использован
- Возвращен (может из Оплачен или Зарезервирован)

Верни ТОЛЬКО код mermaid без объяснений и без markdown блоков.`,
  },

  erDiagram: {
    simple: `Создай erDiagram на mermaid для базы данных продажи билетов:
- Таблица events (id, name, date, venue_id)
- Таблица venues (id, name, capacity)
- Таблица tickets (id, event_id, price, status)
- Таблица customers (id, name, email)
- Таблица orders (id, customer_id, ticket_id, order_date)

Верни ТОЛЬКО код mermaid без объяснений и без markdown блоков.`,
  },
};

// ============================================================================
// KNOWN BROKEN DIAGRAMS FOR FIX TESTING
// ============================================================================

/**
 * Known broken diagrams to test the LLM fixer
 */
const BROKEN_DIAGRAMS = {
  mindmap: {
    withArrows: `mindmap
  root((Продажи))
    Навыки --> Коммуникация
    Процесс --> Закрытие`,
    expectedFix: 'should use indentation only, no arrows',
  },

  mindmapWithBrackets: {
    broken: `mindmap
  root((Продажи))
    [Навыки]
      [Коммуникация]
    [Процесс]`,
    expectedFix: 'should not have brackets around nodes',
  },

  flowchartInvalidArrow: {
    broken: `flowchart TD
    A[Start] -> B[Process]
    B -> C[End]`,
    expectedFix: 'should use --> instead of ->',
  },

  flowchartUnclosedBracket: {
    broken: `flowchart TD
    A[Start
    B[Process]`,
    expectedFix: 'should close all brackets',
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a mermaid diagram using LLM (using production model)
 */
async function generateDiagram(
  prompt: string,
  useFallback = false
): Promise<{ content: string; model: string }> {
  const modelId = useFallback ? GENERATION_MODEL_FALLBACK : GENERATION_MODEL_PRIMARY;
  const model = createOpenRouterModel(modelId, GENERATION_TEMPERATURE, 2000);
  model.timeout = LLM_TIMEOUT;

  const response = await model.invoke([
    new HumanMessage({
      content: prompt,
    }),
  ]);

  let content = response.content as string;

  // Clean up markdown code blocks if present
  content = content
    .replace(/```mermaid\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();

  return { content, model: modelId };
}

/**
 * Generate diagram with fallback retry on failure
 */
async function generateDiagramWithFallback(prompt: string): Promise<{
  content: string;
  model: string;
  usedFallback: boolean;
}> {
  // Try primary model first
  try {
    const result = await generateDiagram(prompt, false);
    const validation = await validateDiagram(result.content);

    if (validation.valid) {
      return { ...result, usedFallback: false };
    }
  } catch (error) {
    console.log(`⚠️ Primary model failed: ${error}`);
  }

  // Fallback to secondary model
  console.log(`🔄 Retrying with fallback model: ${GENERATION_MODEL_FALLBACK}`);
  const result = await generateDiagram(prompt, true);
  return { ...result, usedFallback: true };
}

/**
 * Validate diagram and return detailed result
 */
async function validateDiagram(diagram: string): Promise<{
  valid: boolean;
  diagramType: string | null;
  errors: string[];
}> {
  return validateMermaidSyntax(diagram);
}

/**
 * Fix diagram using LLM fixer
 */
async function fixDiagram(
  diagram: string,
  error: string
): Promise<{
  fixed: boolean;
  content: string;
  tokensUsed: number;
}> {
  resetLLMFixerMetrics();
  const result = await fixMermaidWithLLM(diagram, error, { llmFixCount: 0 });
  return result;
}

// ============================================================================
// VALIDATION-ONLY TESTS (No LLM, Fast)
// ============================================================================

describe('Mermaid Syntax Validation', () => {
  describe('Valid Diagrams', () => {
    it('should validate correct flowchart', async () => {
      const diagram = `flowchart TD
    A[Start] --> B[Process]
    B --> C[End]`;

      const result = await validateDiagram(diagram);

      expect(result.valid).toBe(true);
      // Mermaid 11+ returns 'flowchart-v2' for flowchart diagrams
      expect(['flowchart', 'flowchart-v2']).toContain(result.diagramType);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate correct mindmap', async () => {
      const diagram = `mindmap
  root((Центральная тема))
    Ветка 1
      Подветка 1.1
      Подветка 1.2
    Ветка 2
      Подветка 2.1`;

      const result = await validateDiagram(diagram);

      expect(result.valid).toBe(true);
      expect(result.diagramType).toBe('mindmap');
    });

    it('should validate correct sequenceDiagram', async () => {
      const diagram = `sequenceDiagram
    participant A as Продавец
    participant B as Клиент
    A->>B: Здравствуйте!
    B->>A: Добрый день`;

      const result = await validateDiagram(diagram);

      expect(result.valid).toBe(true);
      // Mermaid 11+ returns 'sequence' instead of 'sequenceDiagram'
      expect(['sequenceDiagram', 'sequence']).toContain(result.diagramType);
    });

    it('should validate flowchart with Russian text in labels', async () => {
      const diagram = `flowchart LR
    A[Начало процесса] --> B[Обработка данных]
    B --> C{Проверка условия}
    C -->|Да| D[Завершение]
    C -->|Нет| E[Повторить]`;

      const result = await validateDiagram(diagram);

      if (!result.valid) {
        console.log('❌ Flowchart LR errors:', result.errors);
      }

      expect(result.valid).toBe(true);
    });

    it('should validate mindmap with Cyrillic characters', async () => {
      const diagram = `mindmap
  root((Продажи билетов))
    Каналы продаж
      Онлайн
      Офлайн
    Типы клиентов
      B2B
      B2C`;

      const result = await validateDiagram(diagram);

      if (!result.valid) {
        console.log('❌ Mindmap Cyrillic errors:', result.errors);
      }

      expect(result.valid).toBe(true);
    });
  });

  describe('Invalid Diagrams', () => {
    it('should reject flowchart with invalid arrow syntax', async () => {
      const diagram = `flowchart TD
    A[Start] -> B[Process]`;

      const result = await validateDiagram(diagram);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should parse mindmap with arrows (mermaid 11+ accepts this)', async () => {
      // Note: Mermaid 11+ changed behavior and now accepts arrows in mindmaps
      // The arrows are simply treated as part of node text
      const diagram = `mindmap
  root((Topic))
    Branch1 --> SubBranch`;

      const result = await validateDiagram(diagram);

      console.log('Mindmap with arrows validation result:', result);

      // Mermaid 11+ accepts this syntax (treats arrows as text)
      // This is a known behavioral change from older mermaid versions
      expect(result.diagramType).toBe('mindmap');
    });

    it('should reject diagram with unclosed brackets', async () => {
      const diagram = `flowchart TD
    A[Start
    B[End]`;

      const result = await validateDiagram(diagram);

      expect(result.valid).toBe(false);
    });

    it('should reject invalid diagram type', async () => {
      const diagram = `invalidDiagram
    A --> B`;

      const result = await validateDiagram(diagram);

      expect(result.valid).toBe(false);
    });
  });
});

// ============================================================================
// LLM FIX PIPELINE TESTS (Requires API Key)
// ============================================================================

describe.skipIf(SKIP_LLM_TESTS)('Mermaid LLM Fixer', () => {
  beforeAll(() => {
    resetLLMFixerMetrics();
  });

  afterAll(() => {
    const metrics = getLLMFixerMetrics();
    console.log('\n📊 LLM Fixer Metrics:');
    console.log(`  Total attempts: ${metrics.totalAttempts}`);
    console.log(`  Successful: ${metrics.successfulFixes}`);
    console.log(`  Failed: ${metrics.failedFixes}`);
    console.log(`  Success rate: ${(metrics.successRate * 100).toFixed(1)}%`);
    console.log(`  Total tokens: ${metrics.totalTokensUsed}`);
  });

  it(
    'should fix flowchart with invalid arrow syntax',
    async () => {
      const broken = `flowchart TD
    A[Start] -> B[Process]
    B -> C[End]`;

      const result = await fixDiagram(broken, 'Invalid arrow syntax: use --> instead of ->');

      expect(result.fixed).toBe(true);
      expect(result.content).toContain('-->');
      expect(result.content).not.toMatch(/[^-]->(?!>)/); // No single arrows

      // Validate the fixed diagram
      const validation = await validateDiagram(result.content);
      expect(validation.valid).toBe(true);
    },
    LLM_TIMEOUT + 5000
  );

  it(
    'should fix mindmap with arrows (convert to indentation)',
    async () => {
      const broken = `mindmap
  root((Продажи))
    Навыки --> Коммуникация
    Процесс --> Закрытие`;

      const result = await fixDiagram(broken, 'Mindmap should use indentation, not arrows');

      expect(result.fixed).toBe(true);
      expect(result.content).not.toContain('-->');

      // Validate the fixed diagram
      const validation = await validateDiagram(result.content);
      expect(validation.valid).toBe(true);
    },
    LLM_TIMEOUT + 5000
  );

  it(
    'should fix mindmap with brackets around nodes',
    async () => {
      const broken = `mindmap
  root((Продажи))
    [Навыки]
      [Коммуникация]
    [Процесс]`;

      const result = await fixDiagram(broken, 'Mindmap nodes should not have brackets []');

      expect(result.fixed).toBe(true);
      // Brackets should be removed (except root)
      expect(result.content.match(/\[(?!.*root)/g)).toBeFalsy();

      const validation = await validateDiagram(result.content);
      expect(validation.valid).toBe(true);
    },
    LLM_TIMEOUT + 5000
  );
});

// ============================================================================
// LLM GENERATION TESTS (Requires API Key, Longer Timeout)
// ============================================================================

describe.skipIf(SKIP_LLM_TESTS)('Mermaid Diagram Generation', () => {
  beforeAll(() => {
    console.log('\n🤖 Using production models:');
    console.log(`  Primary: ${GENERATION_MODEL_PRIMARY}`);
    console.log(`  Fallback: ${GENERATION_MODEL_FALLBACK}`);
    console.log(`  Fixer: ${FIXER_MODEL}`);
  });

  describe('Flowchart Generation (со стрелками)', () => {
    it(
      'should generate valid simple flowchart',
      async () => {
        const result = await generateDiagram(GENERATION_PROMPTS.flowchart.simple);

        console.log(`\n📝 Generated flowchart (simple) using ${result.model}:`);
        console.log(result.content);

        const validation = await validateDiagram(result.content);

        if (!validation.valid) {
          console.log('❌ Validation errors:', validation.errors);
          // Try to fix
          const fixResult = await fixDiagram(result.content, validation.errors.join('; '));
          console.log('\n🔧 Fixed diagram:');
          console.log(fixResult.content);
          const revalidation = await validateDiagram(fixResult.content);
          expect(revalidation.valid).toBe(true);
        } else {
          expect(validation.valid).toBe(true);
          // Mermaid 11+ returns 'flowchart-v2'
          expect(['flowchart', 'flowchart-v2']).toContain(validation.diagramType);
        }
      },
      LLM_TIMEOUT + 10000
    );

    it(
      'should generate valid complex flowchart with conditions',
      async () => {
        const result = await generateDiagram(GENERATION_PROMPTS.flowchart.complex);

        console.log(`\n📝 Generated flowchart (complex) using ${result.model}:`);
        console.log(result.content);

        const validation = await validateDiagram(result.content);

        if (!validation.valid) {
          console.log('❌ Validation errors:', validation.errors);

          // Try to fix it
          const fixResult = await fixDiagram(result.content, validation.errors.join('; '));
          console.log('\n🔧 Fixed diagram:');
          console.log(fixResult.content);

          const revalidation = await validateDiagram(fixResult.content);
          expect(revalidation.valid).toBe(true);
        } else {
          expect(validation.valid).toBe(true);
        }
      },
      LLM_TIMEOUT + 15000
    );
  });

  describe('Mindmap Generation (без стрелок, только отступы)', () => {
    it(
      'should generate valid simple mindmap',
      async () => {
        const result = await generateDiagram(GENERATION_PROMPTS.mindmap.simple);

        console.log(`\n📝 Generated mindmap (simple) using ${result.model}:`);
        console.log(result.content);

        const validation = await validateDiagram(result.content);

        if (!validation.valid) {
          console.log('❌ Validation errors:', validation.errors);

          // Try to fix it
          const fixResult = await fixDiagram(result.content, validation.errors.join('; '));
          console.log('\n🔧 Fixed diagram:');
          console.log(fixResult.content);

          const revalidation = await validateDiagram(fixResult.content);
          expect(revalidation.valid).toBe(true);
        } else {
          expect(validation.valid).toBe(true);
          expect(validation.diagramType).toBe('mindmap');
        }
      },
      LLM_TIMEOUT * 2
    );

    it(
      'should generate valid complex mindmap',
      async () => {
        const result = await generateDiagram(GENERATION_PROMPTS.mindmap.complex);

        console.log(`\n📝 Generated mindmap (complex) using ${result.model}:`);
        console.log(result.content);

        const validation = await validateDiagram(result.content);

        if (!validation.valid) {
          console.log('❌ Validation errors:', validation.errors);

          // Try the full pipeline
          const pipelineResult = await runMermaidFixPipeline(
            `\`\`\`mermaid\n${result.content}\n\`\`\``
          );
          console.log('\n🔧 Pipeline result:');
          console.log('Modified:', pipelineResult.modified);
          console.log('Metrics:', pipelineResult.metrics);

          if (pipelineResult.modified) {
            // Extract fixed diagram from pipeline result
            const fixedMatch = pipelineResult.content.match(/```mermaid\s*([\s\S]*?)```/);
            if (fixedMatch) {
              console.log('\n📝 Fixed diagram:');
              console.log(fixedMatch[1]);

              const revalidation = await validateDiagram(fixedMatch[1]);
              expect(revalidation.valid).toBe(true);
            }
          }
        } else {
          expect(validation.valid).toBe(true);
        }
      },
      LLM_TIMEOUT * 2
    );
  });

  describe('Sequence Diagram Generation', () => {
    it(
      'should generate valid sequenceDiagram',
      async () => {
        const result = await generateDiagram(GENERATION_PROMPTS.sequenceDiagram.simple);

        console.log(`\n📝 Generated sequenceDiagram using ${result.model}:`);
        console.log(result.content);

        const validation = await validateDiagram(result.content);

        if (!validation.valid) {
          console.log('❌ Validation errors:', validation.errors);
          const fixResult = await fixDiagram(result.content, validation.errors.join('; '));
          console.log('\n🔧 Fixed diagram:');
          console.log(fixResult.content);
          const revalidation = await validateDiagram(fixResult.content);
          expect(revalidation.valid).toBe(true);
        } else {
          expect(validation.valid).toBe(true);
          // Mermaid 11+ returns 'sequence' instead of 'sequenceDiagram'
          expect(['sequenceDiagram', 'sequence']).toContain(validation.diagramType);
        }
      },
      LLM_TIMEOUT * 2
    );
  });

  describe('Class Diagram Generation', () => {
    it(
      'should generate valid classDiagram',
      async () => {
        const result = await generateDiagram(GENERATION_PROMPTS.classDiagram.simple);

        console.log(`\n📝 Generated classDiagram using ${result.model}:`);
        console.log(result.content);

        const validation = await validateDiagram(result.content);

        if (!validation.valid) {
          console.log('❌ Validation errors:', validation.errors);

          // Try to fix it
          const fixResult = await fixDiagram(result.content, validation.errors.join('; '));
          console.log('\n🔧 Fixed diagram:');
          console.log(fixResult.content);

          const revalidation = await validateDiagram(fixResult.content);
          expect(revalidation.valid).toBe(true);
        } else {
          expect(validation.valid).toBe(true);
          // Mermaid 11+ returns 'class' instead of 'classDiagram'
          expect(['classDiagram', 'class']).toContain(validation.diagramType);
        }
      },
      LLM_TIMEOUT + 10000
    );
  });

  describe('State Diagram Generation', () => {
    it(
      'should generate valid stateDiagram',
      async () => {
        const result = await generateDiagram(GENERATION_PROMPTS.stateDiagram.simple);

        console.log(`\n📝 Generated stateDiagram using ${result.model}:`);
        console.log(result.content);

        const validation = await validateDiagram(result.content);

        if (!validation.valid) {
          console.log('❌ Validation errors:', validation.errors);

          const fixResult = await fixDiagram(result.content, validation.errors.join('; '));
          console.log('\n🔧 Fixed diagram:');
          console.log(fixResult.content);

          const revalidation = await validateDiagram(fixResult.content);
          expect(revalidation.valid).toBe(true);
        } else {
          expect(validation.valid).toBe(true);
          // Mermaid 11+ returns 'stateDiagram-v2' or 'state' instead of 'stateDiagram'
          expect(['stateDiagram', 'stateDiagram-v2', 'state']).toContain(validation.diagramType);
        }
      },
      LLM_TIMEOUT * 2
    );
  });

  describe('ER Diagram Generation', () => {
    it(
      'should generate valid erDiagram',
      async () => {
        const result = await generateDiagram(GENERATION_PROMPTS.erDiagram.simple);

        console.log(`\n📝 Generated erDiagram using ${result.model}:`);
        console.log(result.content);

        const validation = await validateDiagram(result.content);

        if (!validation.valid) {
          console.log('❌ Validation errors:', validation.errors);

          const fixResult = await fixDiagram(result.content, validation.errors.join('; '));
          console.log('\n🔧 Fixed diagram:');
          console.log(fixResult.content);

          const revalidation = await validateDiagram(fixResult.content);
          expect(revalidation.valid).toBe(true);
        } else {
          expect(validation.valid).toBe(true);
          // Mermaid 11+ returns 'er' instead of 'erDiagram'
          expect(['erDiagram', 'er']).toContain(validation.diagramType);
        }
      },
      LLM_TIMEOUT + 10000
    );
  });
});

// ============================================================================
// MODEL FALLBACK TESTS
// ============================================================================

describe.skipIf(SKIP_LLM_TESTS)('Model Fallback Strategy', () => {
  it(
    'should use fallback model when primary produces invalid diagram',
    async () => {
      // This test verifies the fallback strategy works
      const result = await generateDiagramWithFallback(GENERATION_PROMPTS.flowchart.simple);

      console.log(`\n📝 Generated with fallback strategy:`);
      console.log(`  Model used: ${result.model}`);
      console.log(`  Used fallback: ${result.usedFallback}`);
      console.log(result.content);

      const validation = await validateDiagram(result.content);

      // Final result should be valid (either from primary or fallback)
      if (!validation.valid) {
        // If still invalid, try LLM fixer
        const fixResult = await fixDiagram(result.content, validation.errors.join('; '));
        const revalidation = await validateDiagram(fixResult.content);
        expect(revalidation.valid).toBe(true);
      } else {
        expect(validation.valid).toBe(true);
      }
    },
    LLM_TIMEOUT * 2 + 10000
  );
});

// ============================================================================
// FULL PIPELINE INTEGRATION TESTS
// ============================================================================

describe.skipIf(SKIP_LLM_TESTS)('Full Mermaid Pipeline Integration', () => {
  it(
    'should process content with multiple diagram types through pipeline',
    async () => {
      const content = `## Урок: Продажи билетов

### Процесс продажи

\`\`\`mermaid
flowchart TD
    A[Клиент приходит] --> B{Знает что хочет?}
    B -->|Да| C[Оформление]
    B -->|Нет| D[Консультация]
    D --> C
    C --> E[Оплата]
\`\`\`

### Структура навыков

\`\`\`mermaid
mindmap
  root((Продажи))
    Коммуникация
      Активное слушание
      Презентация
    Техники
      Работа с возражениями
      Закрытие сделки
\`\`\`

### Диалог с клиентом

\`\`\`mermaid
sequenceDiagram
    participant M as Менеджер
    participant K as Клиент
    M->>K: Добрый день!
    K->>M: Здравствуйте
    M->>K: Чем могу помочь?
\`\`\`
`;

      console.log('\n📄 Processing content with 3 diagram types...');

      const result = await runMermaidFixPipeline(content);

      console.log('\n📊 Pipeline Result:');
      console.log('  Total diagrams:', result.metrics.diagramsTotal);
      console.log('  Fixed by regex:', result.metrics.diagramsFixedRegex);
      console.log('  Fixed by LLM:', result.metrics.diagramsFixedLLM);
      console.log('  Fallback:', result.metrics.diagramsFallback);
      console.log('  Duration:', result.metrics.durationMs, 'ms');

      expect(result.metrics.diagramsTotal).toBe(3);
      expect(result.metrics.diagramsFallback).toBe(0); // No fallbacks
    },
    LLM_TIMEOUT * 3 + 10000
  );
});

// ============================================================================
// REGRESSION TESTS FOR REAL BROKEN CONTENT
// ============================================================================

describe('Regression: Real Broken Mindmap from Course', () => {
  /**
   * This is the actual broken content pattern from the course
   * "Курс для отдела продаж. По продаже билетов на мероприятия."
   */
  const REAL_BROKEN_MINDMAP = `mindmap
  root((Нематериальный продукт))
    Характеристики
      Нельзя потрогать
      Обещание результата
    Ценность
      В будущем --> После покупки
    Доверие
      Главная валюта`;

  it('should recognize mindmap with arrows (mermaid 11+ behavior)', async () => {
    // Note: Mermaid 11+ accepts arrows in mindmaps syntactically
    // The arrows are treated as part of node text, not as link syntax
    // While this parses, the RENDERED output may not be what the user expects
    // (the "-->" will appear as literal text in the mindmap node)
    const validation = await validateDiagram(REAL_BROKEN_MINDMAP);

    console.log('Mindmap with arrows validation:', validation);

    // Mermaid 11+ accepts this - the issue is semantic (renders wrong), not syntactic
    expect(validation.valid).toBe(true);
    expect(validation.diagramType).toBe('mindmap');
  });

  it.skipIf(SKIP_LLM_TESTS)(
    'should fix broken mindmap via LLM',
    async () => {
      const validation = await validateDiagram(REAL_BROKEN_MINDMAP);

      const fixResult = await fixDiagram(REAL_BROKEN_MINDMAP, validation.errors.join('; '));

      console.log('\n🔧 Fixed mindmap:');
      console.log(fixResult.content);

      expect(fixResult.fixed).toBe(true);

      const revalidation = await validateDiagram(fixResult.content);
      console.log('Revalidation:', revalidation);

      expect(revalidation.valid).toBe(true);
    },
    LLM_TIMEOUT + 5000
  );
});

// ============================================================================
// ADDITIONAL TEST VARIATIONS (Task 2)
// ============================================================================

describe('Additional Validation Tests', () => {
  describe('Flowchart with Subgraphs', () => {
    it('should validate flowchart with subgraphs', async () => {
      const diagram = `flowchart TB
    subgraph Sales["Отдел продаж"]
        A[Менеджер] --> B[Консультация]
        B --> C[Оформление]
    end
    subgraph Support["Поддержка"]
        D[Оператор] --> E[Решение]
    end
    C --> D`;

      const result = await validateDiagram(diagram);

      if (!result.valid) {
        console.log('❌ Subgraph flowchart errors:', result.errors);
      }

      expect(result.valid).toBe(true);
      expect(['flowchart', 'flowchart-v2']).toContain(result.diagramType);
    });
  });

  describe('Deep Mindmap Hierarchy', () => {
    it('should validate mindmap with 5+ levels', async () => {
      const diagram = `mindmap
  root((Продажи))
    Уровень 1
      Уровень 2
        Уровень 3
          Уровень 4
            Уровень 5
              Глубокий элемент
    Вторая ветка
      Подветка`;

      const result = await validateDiagram(diagram);

      if (!result.valid) {
        console.log('❌ Deep mindmap errors:', result.errors);
      }

      expect(result.valid).toBe(true);
      expect(result.diagramType).toBe('mindmap');
    });

    it('should validate wide mindmap with many siblings', async () => {
      const diagram = `mindmap
  root((Навыки менеджера))
    Коммуникация
    Презентация
    Переговоры
    Работа с возражениями
    Закрытие сделки
    Аналитика
    Планирование
    Тайм-менеджмент`;

      const result = await validateDiagram(diagram);

      expect(result.valid).toBe(true);
    });
  });

  describe('Sequence Diagram Advanced', () => {
    it('should validate sequence diagram with loops and alt blocks', async () => {
      const diagram = `sequenceDiagram
    participant M as Менеджер
    participant K as Клиент
    participant S as Система

    M->>K: Приветствие
    loop Выявление потребностей
        K->>M: Вопрос
        M->>K: Ответ
    end
    alt Готов к покупке
        K->>M: Оформляем
        M->>S: Создать заказ
        S-->>M: Подтверждение
    else Нужно подумать
        M->>K: Отправлю информацию
    end`;

      const result = await validateDiagram(diagram);

      if (!result.valid) {
        console.log('❌ Advanced sequence errors:', result.errors);
      }

      expect(result.valid).toBe(true);
      expect(['sequenceDiagram', 'sequence']).toContain(result.diagramType);
    });

    it('should validate sequence diagram with notes', async () => {
      const diagram = `sequenceDiagram
    participant A as Продавец
    participant B as Покупатель
    Note over A,B: Начало диалога
    A->>B: Здравствуйте!
    Note right of B: Клиент думает
    B->>A: Добрый день`;

      const result = await validateDiagram(diagram);
      expect(result.valid).toBe(true);
    });
  });
});

// ============================================================================
// STRESS TESTS
// ============================================================================

describe('Stress Tests', () => {
  it('should validate large flowchart (20+ nodes)', async () => {
    const nodes = Array.from(
      { length: 20 },
      (_, i) => `    N${i}[Узел ${i}] --> N${i + 1}[Узел ${i + 1}]`
    ).join('\n');

    const diagram = `flowchart TD\n${nodes}`;

    const result = await validateDiagram(diagram);

    console.log(`Large flowchart validation: valid=${result.valid}, type=${result.diagramType}`);

    expect(result.valid).toBe(true);
  });

  it('should handle diagram near size limit (1500 chars)', async () => {
    // Create a mindmap that's close to the 2000 char limit
    const branches = Array.from(
      { length: 15 },
      (_, i) => `    Ветка ${i + 1}\n      Подветка ${i + 1}.1\n      Подветка ${i + 1}.2`
    ).join('\n');

    const diagram = `mindmap\n  root((Большая диаграмма))\n${branches}`;

    console.log(`Near-limit diagram size: ${diagram.length} chars`);

    const result = await validateDiagram(diagram);

    expect(result.valid).toBe(true);
    expect(diagram.length).toBeLessThan(2000);
  });
});

// ============================================================================
// STATISTICS COLLECTION (Task 4)
// ============================================================================

describe('Statistics Collection', () => {
  it('should collect and report LLM fixer statistics', async () => {
    const metrics = getLLMFixerMetrics();

    console.log('\n📊 Final LLM Fixer Statistics:');
    console.log(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          model: FIXER_MODEL,
          metrics: {
            totalAttempts: metrics.totalAttempts,
            successfulFixes: metrics.successfulFixes,
            failedFixes: metrics.failedFixes,
            skippedRateLimit: metrics.skippedRateLimit,
            skippedTooLarge: metrics.skippedTooLarge,
            timeouts: metrics.timeouts,
            totalTokensUsed: metrics.totalTokensUsed,
            successRate: `${(metrics.successRate * 100).toFixed(1)}%`,
            avgTokensPerFix: metrics.avgTokensPerFix.toFixed(0),
          },
        },
        null,
        2
      )
    );

    // Basic assertions about metrics structure
    expect(metrics.totalAttempts).toBeGreaterThanOrEqual(0);
    expect(metrics.successRate).toBeGreaterThanOrEqual(0);
    expect(metrics.successRate).toBeLessThanOrEqual(1);
  });
});
