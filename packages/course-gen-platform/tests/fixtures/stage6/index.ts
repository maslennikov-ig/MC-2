/**
 * Stage 6 Test Fixtures Index
 *
 * Centralized exports and helper functions for Stage 6 lesson content generation testing.
 *
 * @module tests/fixtures/stage6
 *
 * @example
 * ```typescript
 * import {
 *   ANALYTICAL_LESSON_SPEC,
 *   DATA_ANALYSIS_CHUNKS,
 *   ANALYTICAL_EXPECTED_OUTPUT,
 *   createTestLessonSpec,
 *   createTestRAGChunks,
 * } from '../fixtures/stage6';
 * ```
 */

import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { RAGChunk, LessonContent } from '@megacampus/shared-types/lesson-content';
import { randomUUID as uuidv4 } from 'crypto';

// ============================================================================
// Re-exports from fixture modules
// ============================================================================

// Lesson Specification Fixtures
export {
  // Test IDs
  TEST_COURSE_ID,
  TEST_SECTION_IDS,
  TEST_DOCUMENT_IDS,
  // Individual fixtures by archetype
  ANALYTICAL_LESSON_SPEC,
  PROCEDURAL_LESSON_SPEC,
  CONCEPTUAL_LESSON_SPEC,
  CREATIVE_LESSON_SPEC,
  LEGAL_LESSON_SPEC,
  // Collections
  ALL_LESSON_SPECS,
  LESSON_SPECS_BY_ARCHETYPE,
} from './lesson-spec-fixtures';

// RAG Chunk Fixtures
export {
  // Chunks by topic
  DATA_ANALYSIS_CHUNKS,
  PYTHON_BASICS_CHUNKS,
  ML_THEORY_CHUNKS,
  DESIGN_THINKING_CHUNKS,
  CASE_STUDY_CHUNKS,
  // Collections
  RAG_CHUNKS_BY_LESSON,
  ALL_RAG_CHUNKS,
} from './rag-chunk-fixtures';

// Expected Output Fixtures
export {
  // Content bodies
  ANALYTICAL_EXPECTED_BODY,
  PROCEDURAL_EXPECTED_BODY,
  CONCEPTUAL_EXPECTED_BODY,
  // Metadata
  ANALYTICAL_EXPECTED_METADATA,
  PROCEDURAL_EXPECTED_METADATA,
  CONCEPTUAL_EXPECTED_METADATA,
  // Complete outputs
  ANALYTICAL_EXPECTED_OUTPUT,
  PROCEDURAL_EXPECTED_OUTPUT,
  CONCEPTUAL_EXPECTED_OUTPUT,
  // Collections
  ALL_EXPECTED_OUTPUTS,
  EXPECTED_OUTPUTS_BY_LESSON,
  // Validation thresholds
  QUALITY_THRESHOLDS,
} from './expected-outputs';

// ============================================================================
// Helper Functions for Test Data Generation
// ============================================================================

/**
 * Create a test LessonSpecificationV2 with optional overrides.
 *
 * Generates a valid lesson spec with sensible defaults that can be
 * customized via the overrides parameter.
 *
 * @param overrides - Partial lesson spec to merge with defaults
 * @returns Complete LessonSpecificationV2 object
 *
 * @example
 * ```typescript
 * // Default lesson spec
 * const spec = createTestLessonSpec();
 *
 * // Custom title and archetype
 * const customSpec = createTestLessonSpec({
 *   title: 'Custom Lesson',
 *   metadata: {
 *     ...createTestLessonSpec().metadata,
 *     content_archetype: 'code_tutorial',
 *   },
 * });
 * ```
 */
export function createTestLessonSpec(
  overrides?: Partial<LessonSpecificationV2>
): LessonSpecificationV2 {
  const defaultSpec: LessonSpecificationV2 = {
    lesson_id: '1.1',
    title: 'Тестовый урок',
    description:
      'Описание тестового урока для проверки генерации контента. ' +
      'Этот урок создан для автоматизированного тестирования.',
    metadata: {
      target_audience: 'practitioner',
      tone: 'conversational-professional',
      compliance_level: 'standard',
      content_archetype: 'concept_explainer',
    },
    learning_objectives: [
      {
        id: 'LO-TEST-1',
        objective: 'Понять основные концепции тестируемой темы',
        bloom_level: 'understand',
      },
      {
        id: 'LO-TEST-2',
        objective: 'Применить полученные знания на практике',
        bloom_level: 'apply',
      },
    ],
    intro_blueprint: {
      hook_strategy: 'question',
      hook_topic: 'Почему это важно?',
      key_learning_objectives: 'основные концепции, практическое применение',
    },
    sections: [
      {
        title: 'Введение в тему',
        content_archetype: 'concept_explainer',
        rag_context_id: uuidv4(),
        constraints: {
          depth: 'detailed_analysis',
          required_keywords: ['ключевое понятие', 'основа'],
          prohibited_terms: [],
        },
        key_points_to_cover: [
          'Определение основных понятий',
          'Связь с реальным миром',
        ],
      },
      {
        title: 'Практическое применение',
        content_archetype: 'code_tutorial',
        rag_context_id: uuidv4(),
        constraints: {
          depth: 'comprehensive',
          required_keywords: ['пример', 'код'],
          prohibited_terms: [],
        },
        key_points_to_cover: [
          'Пошаговая инструкция',
          'Типичные ошибки и их решения',
        ],
      },
    ],
    exercises: [
      {
        type: 'coding',
        difficulty: 'easy',
        learning_objective_id: 'LO-TEST-2',
        structure_template:
          'Реализуйте [функцию], которая [описание требований]. ' +
          'Входные данные: [формат]. Ожидаемый результат: [формат].',
        rubric_criteria: [
          {
            criteria: ['Корректность решения', 'Обработка граничных случаев'],
            weight: 70,
          },
          {
            criteria: ['Читаемость кода'],
            weight: 30,
          },
        ],
      },
    ],
    rag_context: {
      primary_documents: [uuidv4()],
      search_queries: ['тестовый запрос для RAG', 'поиск релевантного контента'],
      expected_chunks: 5,
    },
    estimated_duration_minutes: 20,
    difficulty_level: 'intermediate',
  };

  // Deep merge overrides with defaults
  if (!overrides) {
    return defaultSpec;
  }

  return {
    ...defaultSpec,
    ...overrides,
    metadata: {
      ...defaultSpec.metadata,
      ...(overrides.metadata || {}),
    },
    intro_blueprint: {
      ...defaultSpec.intro_blueprint,
      ...(overrides.intro_blueprint || {}),
    },
    rag_context: {
      ...defaultSpec.rag_context,
      ...(overrides.rag_context || {}),
    },
    learning_objectives: overrides.learning_objectives || defaultSpec.learning_objectives,
    sections: overrides.sections || defaultSpec.sections,
    exercises: overrides.exercises || defaultSpec.exercises,
  };
}

/**
 * Create an array of test RAGChunk objects.
 *
 * Generates realistic RAG chunks with Russian educational content
 * for testing vector search integration.
 *
 * @param count - Number of chunks to generate (default: 5, max: 15)
 * @param documentId - Optional document ID to use for all chunks
 * @returns Array of RAGChunk objects
 *
 * @example
 * ```typescript
 * // Generate 5 default chunks
 * const chunks = createTestRAGChunks(5);
 *
 * // Generate chunks for specific document
 * const docChunks = createTestRAGChunks(3, 'doc-uuid-123');
 * ```
 */
export function createTestRAGChunks(count: number = 5, documentId?: string): RAGChunk[] {
  const effectiveCount = Math.min(Math.max(1, count), 15);
  const docId = documentId || uuidv4();

  const sampleContents = [
    'Основы программирования включают понимание переменных, типов данных и операторов. ' +
      'Переменная - это именованная область памяти для хранения значений. Типы данных ' +
      'определяют, какие операции можно выполнять над значениями.',

    'Функции позволяют группировать код для повторного использования. Функция принимает ' +
      'параметры, выполняет действия и возвращает результат. Это основа модульного программирования.',

    'Структуры данных организуют информацию для эффективного доступа и модификации. ' +
      'Массивы хранят элементы последовательно, словари - по ключам, множества - уникальные значения.',

    'Алгоритмы - это последовательность шагов для решения задачи. Сложность алгоритма ' +
      'измеряется в терминах времени (O-нотация) и памяти. Оптимизация - ключевой навык разработчика.',

    'Объектно-ориентированное программирование моделирует реальный мир через объекты. ' +
      'Класс - это шаблон, объект - экземпляр. Инкапсуляция, наследование, полиморфизм - три столпа ООП.',

    'Тестирование гарантирует качество кода. Unit-тесты проверяют отдельные функции, ' +
      'интеграционные - взаимодействие модулей, E2E - всю систему целиком.',

    'Базы данных хранят структурированную информацию. SQL используется для реляционных БД, ' +
      'NoSQL - для документов, графов, ключ-значение. Выбор зависит от задачи.',

    'API (Application Programming Interface) определяет способ взаимодействия между компонентами. ' +
      'REST использует HTTP методы, GraphQL - единую точку входа с гибкими запросами.',

    'Асинхронное программирование позволяет выполнять операции без блокировки. ' +
      'async/await в Python и JavaScript упрощает работу с асинхронным кодом.',

    'Контроль версий с Git отслеживает изменения в коде. Коммиты фиксируют состояние, ' +
      'ветки позволяют работать параллельно, merge объединяет изменения.',

    'Контейнеризация с Docker изолирует приложения. Образ - это шаблон, контейнер - ' +
      'запущенный экземпляр. Kubernetes оркестрирует контейнеры в production.',

    'CI/CD автоматизирует сборку, тестирование и деплой. Continuous Integration - ' +
      'частая интеграция кода, Continuous Deployment - автоматический выпуск.',

    'Безопасность кода включает валидацию ввода, защиту от SQL-инъекций, XSS, CSRF. ' +
      'OWASP Top 10 - список главных уязвимостей веб-приложений.',

    'Мониторинг отслеживает работу системы в production. Логи, метрики, трейсы - ' +
      'три столпа observability. Prometheus, Grafana, ELK - популярные инструменты.',

    'Архитектура приложений определяет структуру системы. Монолит прост в начале, ' +
      'микросервисы масштабируются лучше. Выбор зависит от размера команды и нагрузки.',
  ];

  const chunks: RAGChunk[] = [];

  for (let i = 0; i < effectiveCount; i++) {
    const contentIndex = i % sampleContents.length;
    const relevanceScore = 0.7 + Math.random() * 0.25; // 0.70 - 0.95

    chunks.push({
      chunk_id: `chunk-test-${String(i + 1).padStart(3, '0')}`,
      document_id: docId,
      document_name: `test_document_${Math.floor(i / 3) + 1}.pdf`,
      content: sampleContents[contentIndex],
      page_or_section: `Раздел ${Math.floor(i / 2) + 1}.${(i % 2) + 1}`,
      relevance_score: Math.round(relevanceScore * 100) / 100,
      metadata: {
        embedding_model: 'jina-embeddings-v3',
        chunk_size: 512,
        overlap: 50,
        test_fixture: true,
      },
    });
  }

  return chunks;
}

/**
 * Create a test LessonContent output with optional overrides.
 *
 * Generates a complete lesson content structure suitable for
 * testing validation and comparison logic.
 *
 * @param lessonId - Lesson ID in format "section.lesson" (e.g., "1.1")
 * @param overrides - Partial content to merge with defaults
 * @returns Complete LessonContent object
 *
 * @example
 * ```typescript
 * const content = createTestLessonContent('1.2', {
 *   status: 'review_required',
 *   metadata: { quality_score: 0.72 },
 * });
 * ```
 */
export function createTestLessonContent(
  lessonId: string = '1.1',
  overrides?: Partial<LessonContent>
): LessonContent {
  const [section, lesson] = lessonId.split('.').map(Number);
  const paddedSection = section.toString().padStart(4, '0');
  const paddedLesson = lesson.toString().padStart(4, '0');
  const lessonUuid = `00000000-0000-0000-${paddedSection}-${paddedLesson}00000000`;

  const defaultContent: LessonContent = {
    lesson_id: lessonUuid,
    course_id: uuidv4(),
    content: {
      intro:
        'Это тестовое введение в урок. В этом уроке мы рассмотрим основные концепции ' +
        'и научимся применять их на практике.',
      sections: [
        {
          title: 'Тестовый раздел 1',
          content:
            '## Введение\n\nЭто тестовый контент раздела. Он содержит достаточно текста ' +
            'для проверки валидации.\n\n### Подраздел\n\nДополнительный контент для теста.',
          citations: [
            { document: 'test_doc.pdf', page_or_section: 'Раздел 1' },
          ],
        },
        {
          title: 'Тестовый раздел 2',
          content:
            '## Практика\n\nЭтот раздел демонстрирует практическое применение.\n\n' +
            '```python\ndef example():\n    return "test"\n```',
        },
      ],
      examples: [
        {
          title: 'Тестовый пример',
          content: 'Описание тестового примера для проверки.',
          code: 'print("Hello, World!")',
          citations: ['test_doc.pdf'],
        },
      ],
      exercises: [
        {
          question: 'Тестовый вопрос для проверки знаний студента.',
          hints: ['Подсказка 1', 'Подсказка 2'],
          solution: 'Тестовое решение задачи.',
          grading_rubric: {
            criteria: 'Корректность решения (100%)',
            points: 100,
          },
        },
      ],
    },
    metadata: {
      total_words: 500,
      total_tokens: 2500,
      cost_usd: 0.025,
      quality_score: 0.80,
      rag_chunks_used: 5,
      generation_duration_ms: 8000,
      model_used: 'gpt-4o-mini',
      archetype_used: 'concept_explainer',
      temperature_used: 0.65,
    },
    status: 'completed',
    created_at: new Date(),
    updated_at: new Date(),
  };

  if (!overrides) {
    return defaultContent;
  }

  return {
    ...defaultContent,
    ...overrides,
    content: {
      ...defaultContent.content,
      ...(overrides.content || {}),
    },
    metadata: {
      ...defaultContent.metadata,
      ...(overrides.metadata || {}),
    },
  };
}

/**
 * Validate that a LessonContent meets quality thresholds.
 *
 * Utility function for test assertions.
 *
 * @param content - LessonContent to validate
 * @param thresholds - Optional custom thresholds (defaults to QUALITY_THRESHOLDS)
 * @returns Object with validation result and any failures
 *
 * @example
 * ```typescript
 * const result = validateLessonQuality(generatedContent);
 * expect(result.isValid).toBe(true);
 * ```
 */
export function validateLessonQuality(
  content: LessonContent,
  thresholds?: Partial<typeof import('./expected-outputs').QUALITY_THRESHOLDS>
): { isValid: boolean; failures: string[] } {
  // Import dynamically to avoid circular dependency
  const { QUALITY_THRESHOLDS } = require('./expected-outputs');
  const effectiveThresholds = { ...QUALITY_THRESHOLDS, ...thresholds };
  const failures: string[] = [];

  if (content.metadata.quality_score < effectiveThresholds.minQualityScore) {
    failures.push(
      `Quality score ${content.metadata.quality_score} below threshold ${effectiveThresholds.minQualityScore}`
    );
  }

  if (content.metadata.cost_usd > effectiveThresholds.maxCostUsd) {
    failures.push(
      `Cost $${content.metadata.cost_usd} exceeds maximum $${effectiveThresholds.maxCostUsd}`
    );
  }

  if (content.metadata.total_words < effectiveThresholds.minWordCount) {
    failures.push(
      `Word count ${content.metadata.total_words} below minimum ${effectiveThresholds.minWordCount}`
    );
  }

  if (content.metadata.generation_duration_ms > effectiveThresholds.maxGenerationTimeMs) {
    failures.push(
      `Generation time ${content.metadata.generation_duration_ms}ms exceeds maximum ${effectiveThresholds.maxGenerationTimeMs}ms`
    );
  }

  if (content.metadata.rag_chunks_used < effectiveThresholds.minRagChunksUsed) {
    failures.push(
      `RAG chunks used ${content.metadata.rag_chunks_used} below minimum ${effectiveThresholds.minRagChunksUsed}`
    );
  }

  return {
    isValid: failures.length === 0,
    failures,
  };
}

/**
 * Get fixture data for a specific lesson by ID.
 *
 * Convenience function to retrieve all related fixtures for a lesson.
 *
 * @param lessonId - Lesson ID in format "section.lesson"
 * @returns Object with spec, chunks, and expected output (if available)
 *
 * @example
 * ```typescript
 * const { spec, chunks, expectedOutput } = getFixturesForLesson('1.1');
 * ```
 */
export function getFixturesForLesson(lessonId: string): {
  spec: LessonSpecificationV2 | undefined;
  chunks: RAGChunk[];
  expectedOutput: LessonContent | undefined;
} {
  const { ALL_LESSON_SPECS } = require('./lesson-spec-fixtures');
  const { RAG_CHUNKS_BY_LESSON } = require('./rag-chunk-fixtures');
  const { EXPECTED_OUTPUTS_BY_LESSON } = require('./expected-outputs');

  return {
    spec: ALL_LESSON_SPECS.find((s: LessonSpecificationV2) => s.lesson_id === lessonId),
    chunks: RAG_CHUNKS_BY_LESSON[lessonId] || [],
    expectedOutput: EXPECTED_OUTPUTS_BY_LESSON[lessonId],
  };
}
