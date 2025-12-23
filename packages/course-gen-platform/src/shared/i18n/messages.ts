/**
 * Backend translations for BullMQ worker progress messages
 *
 * Format: { section: { key: { ru: 'Russian', en: 'English' } } }
 *
 * These translations are used by workers to send localized progress updates
 * that appear in the UI via Supabase Realtime.
 *
 * Available key paths:
 * - stage2.* - Stage 2 document processing progress
 * - stage3.* - Stage 3 classification progress
 * - stage4.* - Stage 4 structure analysis progress
 * - stage5.* - Stage 5 structure generation progress
 * - stage6.* - Stage 6 lesson content generation progress
 * - steps.{2-5}.{in_progress|completed|failed} - Generic step status messages
 *
 * @example
 * ```typescript
 * import { getTranslator } from '@/shared/i18n';
 *
 * const t = getTranslator('en');
 * t('stage2.docling_start'); // "Converting document..."
 * t('steps.2.completed'); // "Document processing completed"
 * ```
 */
export const BACKEND_TRANSLATIONS = {
  /**
   * Stage 2: Document Processing
   * Phases: Docling conversion → Chunking → Embedding → Qdrant upload → Summarization
   */
  stage2: {
    init: { ru: 'Инициализация обработки документа...', en: 'Initializing document processing...' },
    docling_start: { ru: 'Конвертация документа...', en: 'Converting document...' },
    docling_complete: { ru: 'Документ сконвертирован', en: 'Document converted' },
    storing: { ru: 'Сохранение результатов...', en: 'Saving results...' },
    chunking: { ru: 'Разбиение на фрагменты...', en: 'Splitting into chunks...' },
    embedding: { ru: 'Генерация эмбеддингов...', en: 'Creating embeddings...' },
    qdrant: { ru: 'Индексация в векторной базе...', en: 'Preparing search index...' },
    summarizing: { ru: 'Создание резюме документа...', en: 'Summarizing document...' },
    finalizing: { ru: 'Финализация обработки...', en: 'Finishing up...' },
    complete: { ru: 'Документ обработан', en: 'Document processed' },
  },

  /**
   * Stage 3: Document Classification
   * Classifies documents into CORE, IMPORTANT, SUPPLEMENTARY priorities
   */
  stage3: {
    init: { ru: 'Инициализация классификации...', en: 'Starting classification...' },
    analyzing: { ru: 'Анализ документов...', en: 'Analyzing documents...' },
    classifying: { ru: 'Классификация по приоритетам...', en: 'Classifying by priority...' },
    summarizing: { ru: 'Создание сводок...', en: 'Creating summaries...' },
    finalizing: { ru: 'Финализация классификации...', en: 'Finishing classification...' },
    complete: { ru: 'Классификация завершена', en: 'Classification complete' },
  },

  /**
   * Stage 4: Structure Analysis
   * Analyzes topics and recommends course structure
   */
  stage4: {
    init: { ru: 'Инициализация анализа структуры...', en: 'Starting structure analysis...' },
    loading_context: { ru: 'Загрузка контекста курса...', en: 'Loading course context...' },
    analyzing_topics: { ru: 'Анализ тем курса...', en: 'Analyzing course topics...' },
    generating_structure: { ru: 'Формирование структуры...', en: 'Generating structure...' },
    validating: { ru: 'Проверка результатов...', en: 'Validating results...' },
    finalizing: { ru: 'Финализация анализа...', en: 'Finishing analysis...' },
    complete: { ru: 'Анализ структуры завершен', en: 'Structure analysis complete' },
  },

  /**
   * Stage 5: Structure Generation
   * Generates course outline with sections and lessons
   */
  stage5: {
    init: { ru: 'Инициализация генерации структуры...', en: 'Starting structure generation...' },
    generating_outline: { ru: 'Создание плана курса...', en: 'Creating course outline...' },
    creating_sections: { ru: 'Создание разделов...', en: 'Creating sections...' },
    creating_lessons: { ru: 'Создание уроков...', en: 'Creating lessons...' },
    finalizing: { ru: 'Финализация структуры...', en: 'Finishing structure...' },
    complete: { ru: 'Структура курса создана', en: 'Course structure created' },
  },

  /**
   * Stage 6: Lesson Content Generation
   * Generates content for each lesson using RAG
   */
  stage6: {
    init: { ru: 'Инициализация генерации урока...', en: 'Starting lesson generation...' },
    retrieving_context: { ru: 'Загрузка контекста урока...', en: 'Loading lesson context...' },
    generating_content: { ru: 'Генерация контента...', en: 'Generating content...' },
    validating: { ru: 'Проверка качества...', en: 'Checking quality...' },
    saving: { ru: 'Сохранение урока...', en: 'Saving lesson...' },
    complete: { ru: 'Урок создан', en: 'Lesson created' },
  },

  /**
   * Generic step status messages used by base-handler.ts
   * Keys are step IDs (2-5) with status suffixes
   */
  steps: {
    '2': {
      in_progress: { ru: 'Обработка документов началась', en: 'Processing documents...' },
      completed: { ru: 'Обработка документов завершена', en: 'Documents processed' },
      failed: { ru: 'Ошибка при обработке документов', en: 'Document processing failed' },
    },
    '3': {
      in_progress: { ru: 'Анализ структуры курса', en: 'Analyzing course structure...' },
      completed: { ru: 'Структура курса определена', en: 'Course structure defined' },
      failed: { ru: 'Ошибка при анализе структуры', en: 'Structure analysis failed' },
    },
    '4': {
      in_progress: { ru: 'Генерация контента', en: 'Generating content...' },
      completed: { ru: 'Контент сгенерирован', en: 'Content generated' },
      failed: { ru: 'Ошибка при генерации контента', en: 'Content generation failed' },
    },
    '5': {
      in_progress: { ru: 'Финализация курса', en: 'Finalizing course...' },
      completed: { ru: 'Курс завершен', en: 'Course completed' },
      failed: { ru: 'Ошибка при финализации', en: 'Finalization failed' },
    },
  },
} as const;

/**
 * Type representing the full translation structure
 * Useful for type-checking translation keys
 */
export type BackendTranslations = typeof BACKEND_TRANSLATIONS;
