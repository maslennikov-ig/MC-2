/**
 * Stage 6 Lesson Specification Test Fixtures
 *
 * Mock LessonSpecificationV2 objects for E2E testing of lesson content generation.
 * Each fixture represents a different content archetype and learning scenario.
 *
 * @module tests/fixtures/stage6/lesson-spec-fixtures
 */

import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';

// ============================================================================
// Test UUIDs (deterministic for reproducible tests)
// ============================================================================

/** Course ID for all test lessons */
export const TEST_COURSE_ID = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';

/** Section IDs for organizing lessons */
export const TEST_SECTION_IDS = {
  section1: 'b2c3d4e5-f6a7-5b6c-9d0e-1f2a3b4c5d6e',
  section2: 'c3d4e5f6-a7b8-6c7d-0e1f-2a3b4c5d6e7f',
  section3: 'd4e5f6a7-b8c9-7d8e-1f2a-3b4c5d6e7f8a',
};

/** Document IDs for RAG context */
export const TEST_DOCUMENT_IDS = {
  pythonBasics: 'e5f6a7b8-c9d0-8e9f-2a3b-4c5d6e7f8a9b',
  dataAnalysis: 'f6a7b8c9-d0e1-9f0a-3b4c-5d6e7f8a9b0c',
  mlTheory: 'a7b8c9d0-e1f2-0a1b-4c5d-6e7f8a9b0c1d',
  designThinking: 'b8c9d0e1-f2a3-1b2c-5d6e-7f8a9b0c1d2e',
  caseStudies: 'c9d0e1f2-a3b4-2c3d-6e7f-8a9b0c1d2e3f',
};

// ============================================================================
// ANALYTICAL Archetype: Data Analysis Lesson
// ============================================================================

/**
 * Analytical lesson fixture: Data analysis with pandas
 *
 * Uses concept_explainer archetype for balanced explanation
 * with analytical depth and practical examples.
 */
export const ANALYTICAL_LESSON_SPEC: LessonSpecificationV2 = {
  lesson_id: '1.1',
  title: 'Анализ данных с использованием pandas',
  description:
    'Изучение основных методов анализа данных с использованием библиотеки pandas. ' +
    'Студенты освоят загрузку, очистку и базовый анализ табличных данных.',
  metadata: {
    target_audience: 'practitioner',
    tone: 'conversational-professional',
    compliance_level: 'standard',
    content_archetype: 'concept_explainer',
  },
  learning_objectives: [
    {
      id: 'LO-1.1.1',
      objective: 'Объяснить основные структуры данных pandas (Series и DataFrame)',
      bloom_level: 'understand',
    },
    {
      id: 'LO-1.1.2',
      objective: 'Применить методы фильтрации и агрегации для анализа данных',
      bloom_level: 'apply',
    },
    {
      id: 'LO-1.1.3',
      objective: 'Анализировать качество данных и выявлять аномалии',
      bloom_level: 'analyze',
    },
  ],
  intro_blueprint: {
    hook_strategy: 'statistic',
    hook_topic: '80% времени аналитика уходит на подготовку данных',
    key_learning_objectives:
      'структуры данных pandas, фильтрация и агрегация, анализ качества данных',
  },
  sections: [
    {
      title: 'Структуры данных pandas',
      content_archetype: 'concept_explainer',
      rag_context_id: TEST_DOCUMENT_IDS.dataAnalysis,
      constraints: {
        depth: 'detailed_analysis',
        required_keywords: ['DataFrame', 'Series', 'индекс', 'колонки'],
        prohibited_terms: [],
      },
      key_points_to_cover: [
        'Различия между Series и DataFrame',
        'Создание DataFrame из различных источников',
        'Работа с индексами и колонками',
      ],
    },
    {
      title: 'Фильтрация и выборка данных',
      content_archetype: 'code_tutorial',
      rag_context_id: TEST_DOCUMENT_IDS.dataAnalysis,
      constraints: {
        depth: 'comprehensive',
        required_keywords: ['loc', 'iloc', 'query', 'boolean indexing'],
        prohibited_terms: [],
      },
      key_points_to_cover: [
        'Использование loc и iloc для выборки',
        'Boolean indexing для фильтрации',
        'Метод query для сложных условий',
      ],
      analogies_to_use: 'DataFrame как таблица Excel с суперспособностями',
    },
    {
      title: 'Агрегация и группировка',
      content_archetype: 'concept_explainer',
      rag_context_id: TEST_DOCUMENT_IDS.dataAnalysis,
      constraints: {
        depth: 'detailed_analysis',
        required_keywords: ['groupby', 'agg', 'pivot_table'],
        prohibited_terms: [],
      },
      key_points_to_cover: [
        'Операция groupby и её механизм',
        'Функции агрегации: sum, mean, count',
        'Создание сводных таблиц с pivot_table',
      ],
    },
  ],
  exercises: [
    {
      type: 'coding',
      difficulty: 'medium',
      learning_objective_id: 'LO-1.1.2',
      structure_template:
        'Дан DataFrame с данными о продажах. Отфильтруйте записи за [период] ' +
        'и вычислите [метрику] по каждой категории товаров.',
      rubric_criteria: [
        {
          criteria: [
            'Корректное использование фильтрации по дате',
            'Правильный синтаксис groupby',
          ],
          weight: 60,
        },
        {
          criteria: ['Читаемость кода', 'Использование осмысленных имён переменных'],
          weight: 40,
        },
      ],
    },
    {
      type: 'conceptual',
      difficulty: 'easy',
      learning_objective_id: 'LO-1.1.1',
      structure_template:
        'Объясните, в каких ситуациях предпочтительнее использовать Series, ' +
        'а в каких DataFrame. Приведите по два примера для каждого случая.',
      rubric_criteria: [
        {
          criteria: ['Понимание различий между структурами', 'Релевантность примеров'],
          weight: 70,
        },
        {
          criteria: ['Ясность изложения'],
          weight: 30,
        },
      ],
    },
  ],
  rag_context: {
    primary_documents: [TEST_DOCUMENT_IDS.dataAnalysis, TEST_DOCUMENT_IDS.pythonBasics],
    search_queries: [
      'pandas DataFrame операции',
      'анализ данных Python фильтрация',
      'groupby агрегация pandas',
    ],
    expected_chunks: 8,
  },
  estimated_duration_minutes: 30,
  difficulty_level: 'intermediate',
};

// ============================================================================
// PROCEDURAL Archetype: Step-by-Step Tutorial
// ============================================================================

/**
 * Procedural lesson fixture: API integration tutorial
 *
 * Uses code_tutorial archetype for precise, step-by-step
 * instructions with code examples.
 */
export const PROCEDURAL_LESSON_SPEC: LessonSpecificationV2 = {
  lesson_id: '2.1',
  title: 'Создание REST API с FastAPI',
  description:
    'Пошаговое руководство по созданию REST API с использованием фреймворка FastAPI. ' +
    'Включает настройку проекта, создание эндпоинтов и валидацию данных.',
  metadata: {
    target_audience: 'practitioner',
    tone: 'formal',
    compliance_level: 'strict',
    content_archetype: 'code_tutorial',
  },
  learning_objectives: [
    {
      id: 'LO-2.1.1',
      objective: 'Настроить проект FastAPI с необходимыми зависимостями',
      bloom_level: 'apply',
    },
    {
      id: 'LO-2.1.2',
      objective: 'Создать CRUD эндпоинты для работы с ресурсами',
      bloom_level: 'apply',
    },
    {
      id: 'LO-2.1.3',
      objective: 'Реализовать валидацию входных данных с помощью Pydantic',
      bloom_level: 'apply',
    },
  ],
  intro_blueprint: {
    hook_strategy: 'challenge',
    hook_topic: 'создание production-ready API за 15 минут',
    key_learning_objectives: 'настройка FastAPI, CRUD операции, валидация с Pydantic',
  },
  sections: [
    {
      title: 'Установка и настройка проекта',
      content_archetype: 'code_tutorial',
      rag_context_id: TEST_DOCUMENT_IDS.pythonBasics,
      constraints: {
        depth: 'comprehensive',
        required_keywords: ['pip', 'uvicorn', 'virtualenv', 'requirements.txt'],
        prohibited_terms: [],
      },
      key_points_to_cover: [
        'Создание виртуального окружения',
        'Установка FastAPI и uvicorn',
        'Структура проекта',
      ],
    },
    {
      title: 'Создание первого эндпоинта',
      content_archetype: 'code_tutorial',
      rag_context_id: TEST_DOCUMENT_IDS.pythonBasics,
      constraints: {
        depth: 'comprehensive',
        required_keywords: ['@app.get', '@app.post', 'path parameters', 'query parameters'],
        prohibited_terms: [],
      },
      key_points_to_cover: [
        'Декораторы маршрутов FastAPI',
        'Path и query параметры',
        'Типизация ответов',
      ],
    },
    {
      title: 'Валидация с Pydantic',
      content_archetype: 'code_tutorial',
      rag_context_id: TEST_DOCUMENT_IDS.pythonBasics,
      constraints: {
        depth: 'detailed_analysis',
        required_keywords: ['BaseModel', 'Field', 'validator', 'schema'],
        prohibited_terms: [],
      },
      key_points_to_cover: [
        'Создание Pydantic моделей',
        'Валидаторы полей',
        'Автоматическая документация OpenAPI',
      ],
    },
  ],
  exercises: [
    {
      type: 'coding',
      difficulty: 'medium',
      learning_objective_id: 'LO-2.1.2',
      structure_template:
        'Создайте CRUD API для управления [сущностью]. Реализуйте эндпоинты: ' +
        'GET /items, GET /items/{id}, POST /items, PUT /items/{id}, DELETE /items/{id}.',
      rubric_criteria: [
        {
          criteria: [
            'Все 5 эндпоинтов реализованы корректно',
            'Правильные HTTP методы и статус-коды',
          ],
          weight: 50,
        },
        {
          criteria: ['Валидация входных данных', 'Обработка ошибок'],
          weight: 30,
        },
        {
          criteria: ['Чистота кода', 'Соблюдение REST конвенций'],
          weight: 20,
        },
      ],
    },
    {
      type: 'debugging',
      difficulty: 'easy',
      learning_objective_id: 'LO-2.1.3',
      structure_template:
        'Дан код с Pydantic моделью, содержащей ошибки валидации. ' +
        'Найдите и исправьте [количество] ошибок в определении модели.',
      rubric_criteria: [
        {
          criteria: ['Все ошибки найдены', 'Исправления корректны'],
          weight: 80,
        },
        {
          criteria: ['Объяснение причин ошибок'],
          weight: 20,
        },
      ],
    },
  ],
  rag_context: {
    primary_documents: [TEST_DOCUMENT_IDS.pythonBasics],
    search_queries: [
      'FastAPI REST API создание',
      'Pydantic валидация модели',
      'uvicorn настройка сервера',
    ],
    expected_chunks: 7,
  },
  estimated_duration_minutes: 35,
  difficulty_level: 'intermediate',
};

// ============================================================================
// CONCEPTUAL Archetype: Theory Explanation
// ============================================================================

/**
 * Conceptual lesson fixture: Machine learning theory
 *
 * Uses concept_explainer archetype for deep theoretical
 * understanding with analogies and examples.
 */
export const CONCEPTUAL_LESSON_SPEC: LessonSpecificationV2 = {
  lesson_id: '3.1',
  title: 'Основы машинного обучения: supervised vs unsupervised',
  description:
    'Теоретическое введение в парадигмы машинного обучения. Сравнение обучения ' +
    'с учителем и без учителя, их применение и ограничения.',
  metadata: {
    target_audience: 'novice',
    tone: 'conversational-professional',
    compliance_level: 'standard',
    content_archetype: 'concept_explainer',
  },
  learning_objectives: [
    {
      id: 'LO-3.1.1',
      objective: 'Определить ключевые различия между supervised и unsupervised обучением',
      bloom_level: 'understand',
    },
    {
      id: 'LO-3.1.2',
      objective: 'Классифицировать задачи ML по типу требуемого обучения',
      bloom_level: 'analyze',
    },
    {
      id: 'LO-3.1.3',
      objective: 'Оценить применимость различных подходов ML к бизнес-задачам',
      bloom_level: 'evaluate',
    },
  ],
  intro_blueprint: {
    hook_strategy: 'analogy',
    hook_topic: 'обучение ребёнка vs самостоятельное исследование',
    key_learning_objectives:
      'различия парадигм ML, классификация задач, выбор подхода для бизнеса',
  },
  sections: [
    {
      title: 'Supervised Learning: обучение с учителем',
      content_archetype: 'concept_explainer',
      rag_context_id: TEST_DOCUMENT_IDS.mlTheory,
      constraints: {
        depth: 'comprehensive',
        required_keywords: ['label', 'classification', 'regression', 'training set'],
        prohibited_terms: [],
      },
      key_points_to_cover: [
        'Концепция размеченных данных',
        'Задачи классификации и регрессии',
        'Примеры: спам-фильтры, предсказание цен',
      ],
      analogies_to_use: 'Учитель показывает правильные ответы, ученик запоминает паттерны',
    },
    {
      title: 'Unsupervised Learning: обучение без учителя',
      content_archetype: 'concept_explainer',
      rag_context_id: TEST_DOCUMENT_IDS.mlTheory,
      constraints: {
        depth: 'comprehensive',
        required_keywords: ['clustering', 'dimensionality reduction', 'pattern discovery'],
        prohibited_terms: [],
      },
      key_points_to_cover: [
        'Работа с неразмеченными данными',
        'Кластеризация и снижение размерности',
        'Примеры: сегментация клиентов, обнаружение аномалий',
      ],
      analogies_to_use: 'Исследователь сам находит закономерности в данных',
    },
    {
      title: 'Выбор подхода для вашей задачи',
      content_archetype: 'case_study',
      rag_context_id: TEST_DOCUMENT_IDS.caseStudies,
      constraints: {
        depth: 'detailed_analysis',
        required_keywords: ['decision framework', 'data availability', 'business objective'],
        prohibited_terms: [],
      },
      key_points_to_cover: [
        'Критерии выбора между подходами',
        'Роль наличия размеченных данных',
        'Гибридные подходы: semi-supervised learning',
      ],
    },
  ],
  exercises: [
    {
      type: 'conceptual',
      difficulty: 'medium',
      learning_objective_id: 'LO-3.1.2',
      structure_template:
        'Даны [количество] бизнес-задач. Классифицируйте каждую как задачу ' +
        'supervised или unsupervised learning. Обоснуйте свой выбор.',
      rubric_criteria: [
        {
          criteria: ['Корректная классификация всех задач'],
          weight: 50,
        },
        {
          criteria: ['Качество обоснования выбора'],
          weight: 50,
        },
      ],
    },
    {
      type: 'case_study',
      difficulty: 'hard',
      learning_objective_id: 'LO-3.1.3',
      structure_template:
        'Компания [название] хочет [цель]. Имеющиеся данные: [описание]. ' +
        'Предложите подход ML и обоснуйте его выбор.',
      rubric_criteria: [
        {
          criteria: ['Релевантность предложенного подхода', 'Учёт особенностей данных'],
          weight: 60,
        },
        {
          criteria: ['Глубина анализа', 'Понимание ограничений'],
          weight: 40,
        },
      ],
    },
  ],
  rag_context: {
    primary_documents: [TEST_DOCUMENT_IDS.mlTheory, TEST_DOCUMENT_IDS.caseStudies],
    search_queries: [
      'supervised unsupervised learning различия',
      'машинное обучение выбор алгоритма',
      'classification regression clustering',
    ],
    expected_chunks: 10,
  },
  estimated_duration_minutes: 25,
  difficulty_level: 'beginner',
};

// ============================================================================
// CREATIVE Archetype: Design Thinking Lesson
// ============================================================================

/**
 * Creative lesson fixture: Design thinking methodology
 *
 * Uses case_study archetype for narrative-driven learning
 * with creative problem-solving focus.
 */
export const CREATIVE_LESSON_SPEC: LessonSpecificationV2 = {
  lesson_id: '4.1',
  title: 'Design Thinking: от проблемы к прототипу',
  description:
    'Практическое введение в методологию дизайн-мышления. Освоение этапов ' +
    'эмпатии, определения проблемы, генерации идей и прототипирования.',
  metadata: {
    target_audience: 'executive',
    tone: 'conversational-professional',
    compliance_level: 'standard',
    content_archetype: 'case_study',
  },
  learning_objectives: [
    {
      id: 'LO-4.1.1',
      objective: 'Описать пять этапов процесса Design Thinking',
      bloom_level: 'remember',
    },
    {
      id: 'LO-4.1.2',
      objective: 'Применить техники эмпатии для понимания потребностей пользователей',
      bloom_level: 'apply',
    },
    {
      id: 'LO-4.1.3',
      objective: 'Создать низкоточечный прототип решения',
      bloom_level: 'create',
    },
  ],
  intro_blueprint: {
    hook_strategy: 'question',
    hook_topic: 'Почему 90% стартапов терпят неудачу из-за отсутствия понимания клиента?',
    key_learning_objectives: 'этапы Design Thinking, техники эмпатии, быстрое прототипирование',
  },
  sections: [
    {
      title: 'Эмпатия: понимание пользователя',
      content_archetype: 'case_study',
      rag_context_id: TEST_DOCUMENT_IDS.designThinking,
      constraints: {
        depth: 'detailed_analysis',
        required_keywords: ['интервью', 'наблюдение', 'карта эмпатии', 'persona'],
        prohibited_terms: [],
      },
      key_points_to_cover: [
        'Методы исследования пользователей',
        'Создание карты эмпатии',
        'Формирование персон',
      ],
      analogies_to_use: 'Станьте детективом, расследующим потребности клиента',
    },
    {
      title: 'Определение проблемы и генерация идей',
      content_archetype: 'case_study',
      rag_context_id: TEST_DOCUMENT_IDS.designThinking,
      constraints: {
        depth: 'detailed_analysis',
        required_keywords: ['POV statement', 'How Might We', 'brainstorming', 'SCAMPER'],
        prohibited_terms: [],
      },
      key_points_to_cover: [
        'Формулировка Point of View',
        'Техника How Might We',
        'Методы генерации идей: брейншторм, SCAMPER',
      ],
    },
    {
      title: 'Прототипирование и тестирование',
      content_archetype: 'concept_explainer',
      rag_context_id: TEST_DOCUMENT_IDS.designThinking,
      constraints: {
        depth: 'summary',
        required_keywords: ['MVP', 'low-fidelity', 'итерация', 'feedback'],
        prohibited_terms: [],
      },
      key_points_to_cover: [
        'Принцип fail fast, learn fast',
        'Создание низкоточечных прототипов',
        'Сбор и интеграция обратной связи',
      ],
      analogies_to_use: 'Прототип как черновик письма - не бойтесь переписывать',
    },
  ],
  exercises: [
    {
      type: 'design',
      difficulty: 'medium',
      learning_objective_id: 'LO-4.1.2',
      structure_template:
        'Проведите мини-исследование пользователей для [продукта/сервиса]. ' +
        'Создайте карту эмпатии на основе [источника данных].',
      rubric_criteria: [
        {
          criteria: ['Полнота карты эмпатии (все 4 квадранта)', 'Глубина инсайтов'],
          weight: 60,
        },
        {
          criteria: ['Связь с реальными потребностями', 'Креативность подхода'],
          weight: 40,
        },
      ],
    },
    {
      type: 'design',
      difficulty: 'hard',
      learning_objective_id: 'LO-4.1.3',
      structure_template:
        'Создайте низкоточечный прототип решения для проблемы [описание]. ' +
        'Прототип должен быть готов за [время] минут.',
      rubric_criteria: [
        {
          criteria: ['Соответствие прототипа выявленной проблеме'],
          weight: 40,
        },
        {
          criteria: ['Тестируемость прототипа', 'Возможность получения фидбека'],
          weight: 35,
        },
        {
          criteria: ['Креативность решения'],
          weight: 25,
        },
      ],
    },
  ],
  rag_context: {
    primary_documents: [TEST_DOCUMENT_IDS.designThinking, TEST_DOCUMENT_IDS.caseStudies],
    search_queries: [
      'design thinking этапы методология',
      'карта эмпатии создание',
      'прототипирование MVP быстрое',
    ],
    expected_chunks: 8,
  },
  estimated_duration_minutes: 40,
  difficulty_level: 'intermediate',
};

// ============================================================================
// LEGAL_WARNING Archetype: Compliance Content
// ============================================================================

/**
 * Legal warning lesson fixture: Data privacy compliance
 *
 * Uses legal_warning archetype for precise, compliant
 * content with strict adherence to regulations.
 */
export const LEGAL_LESSON_SPEC: LessonSpecificationV2 = {
  lesson_id: '5.1',
  title: 'Защита персональных данных: требования GDPR и ФЗ-152',
  description:
    'Обзор требований законодательства о защите персональных данных. ' +
    'Практические рекомендации по обеспечению соответствия GDPR и ФЗ-152.',
  metadata: {
    target_audience: 'executive',
    tone: 'formal',
    compliance_level: 'strict',
    content_archetype: 'legal_warning',
  },
  learning_objectives: [
    {
      id: 'LO-5.1.1',
      objective: 'Перечислить основные принципы обработки персональных данных по GDPR',
      bloom_level: 'remember',
    },
    {
      id: 'LO-5.1.2',
      objective: 'Определить требования к согласию субъекта персональных данных',
      bloom_level: 'understand',
    },
    {
      id: 'LO-5.1.3',
      objective: 'Оценить риски несоответствия требованиям законодательства',
      bloom_level: 'evaluate',
    },
  ],
  intro_blueprint: {
    hook_strategy: 'statistic',
    hook_topic: 'штрафы GDPR достигли 1.2 млрд евро в 2023 году',
    key_learning_objectives:
      'принципы GDPR, требования к согласию, оценка рисков несоответствия',
  },
  sections: [
    {
      title: 'Основные принципы GDPR',
      content_archetype: 'legal_warning',
      rag_context_id: TEST_DOCUMENT_IDS.caseStudies,
      constraints: {
        depth: 'comprehensive',
        required_keywords: [
          'законность',
          'минимизация данных',
          'точность',
          'ограничение хранения',
        ],
        prohibited_terms: ['не несёт ответственности', 'гарантируем'],
      },
      key_points_to_cover: [
        'Шесть принципов обработки персональных данных',
        'Права субъектов данных',
        'Обязанности контролёра и процессора',
      ],
    },
    {
      title: 'Требования к получению согласия',
      content_archetype: 'legal_warning',
      rag_context_id: TEST_DOCUMENT_IDS.caseStudies,
      constraints: {
        depth: 'detailed_analysis',
        required_keywords: ['информированное согласие', 'отзыв согласия', 'документирование'],
        prohibited_terms: ['автоматическое согласие'],
      },
      key_points_to_cover: [
        'Критерии действительного согласия',
        'Процедура отзыва согласия',
        'Документирование согласия',
      ],
    },
  ],
  exercises: [
    {
      type: 'conceptual',
      difficulty: 'medium',
      learning_objective_id: 'LO-5.1.2',
      structure_template:
        'Проанализируйте форму согласия [компании]. Определите, соответствует ли она ' +
        'требованиям GDPR. Укажите [количество] нарушений и предложите исправления.',
      rubric_criteria: [
        {
          criteria: ['Точность идентификации нарушений', 'Ссылки на конкретные статьи GDPR'],
          weight: 70,
        },
        {
          criteria: ['Практичность предложенных исправлений'],
          weight: 30,
        },
      ],
    },
  ],
  rag_context: {
    primary_documents: [TEST_DOCUMENT_IDS.caseStudies],
    search_queries: [
      'GDPR принципы обработки данных',
      'согласие персональные данные требования',
      'ФЗ-152 обязанности оператора',
    ],
    expected_chunks: 6,
  },
  estimated_duration_minutes: 20,
  difficulty_level: 'advanced',
};

// ============================================================================
// Collection of All Fixtures
// ============================================================================

/**
 * All lesson specification fixtures for comprehensive testing
 */
export const ALL_LESSON_SPECS: LessonSpecificationV2[] = [
  ANALYTICAL_LESSON_SPEC,
  PROCEDURAL_LESSON_SPEC,
  CONCEPTUAL_LESSON_SPEC,
  CREATIVE_LESSON_SPEC,
  LEGAL_LESSON_SPEC,
];

/**
 * Map of archetypes to their corresponding fixtures
 */
export const LESSON_SPECS_BY_ARCHETYPE: Record<string, LessonSpecificationV2> = {
  concept_explainer: ANALYTICAL_LESSON_SPEC,
  code_tutorial: PROCEDURAL_LESSON_SPEC,
  case_study: CREATIVE_LESSON_SPEC,
  legal_warning: LEGAL_LESSON_SPEC,
};
