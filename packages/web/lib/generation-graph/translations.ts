import { GraphTranslations } from '@megacampus/shared-types';

// Extended with analysisResult section for Stage 4 UI Redesign and courseStructure for Stage 5
export const GRAPH_TRANSLATIONS: GraphTranslations & {
  analysisResult?: Record<string, { ru: string; en: string }>;
  courseStructure?: Record<string, { ru: string; en: string }>;
  restart?: Record<string, { ru: string; en: string }>;
} = {
  stages: {
    stage_1: { ru: 'Инициализация курса', en: 'Course Initialization' },
    stage_2: { ru: 'Обработка документов', en: 'Document Processing' },
    stage_3: { ru: 'Приоритизация документов', en: 'Document Prioritization' },
    stage_4: { ru: 'Глубокий анализ', en: 'Deep Analysis' },
    stage_5: { ru: 'Формирование структуры', en: 'Structure Formation' },
    stage_6: { ru: 'Генерация контента', en: 'Content Generation' },
  },
  status: {
    pending: { ru: 'Ожидание', en: 'Pending' },
    active: { ru: 'Выполняется', en: 'In Progress' },
    completed: { ru: 'Завершено', en: 'Completed' },
    error: { ru: 'Ошибка', en: 'Error' },
    awaiting: { ru: 'Ожидает подтверждения', en: 'Awaiting Approval' },
    skipped: { ru: 'Пропущено', en: 'Skipped' },
    skippedDescription: { ru: 'Этот этап был пропущен, так как курс создан без загруженных документов.', en: 'This stage was skipped because the course was created without uploaded documents.' },
  },
  actions: {
    approve: { ru: 'Подтвердить', en: 'Approve' },
    reject: { ru: 'Отклонить', en: 'Reject' },
    retry: { ru: 'Повторить', en: 'Retry' },
    viewDetails: { ru: 'Подробнее', en: 'View Details' },
    fitView: { ru: 'Вписать', en: 'Fit View' },
    zoomIn: { ru: 'Приблизить', en: 'Zoom In' },
    zoomOut: { ru: 'Отдалить', en: 'Zoom Out' },
    approveAndContinue: { ru: 'Подтвердить и продолжить', en: 'Approve and Continue' },
    approvalFailed: { ru: 'Не удалось подтвердить', en: 'Approval Failed' },
    regenerate: { ru: 'Перегенерировать', en: 'Regenerate' },
    regenerating: { ru: 'Перегенерация...', en: 'Regenerating...' },
    regenerationStarted: { ru: 'Перегенерация запущена', en: 'Regeneration started' },
    regenerationFailed: { ru: 'Ошибка перегенерации', en: 'Regeneration Failed' },
  },
  drawer: {
    input: { ru: 'Входные данные', en: 'Input' },
    process: { ru: 'Процесс', en: 'Process' },
    output: { ru: 'Результат', en: 'Output' },
    attempts: { ru: 'Попытки', en: 'Attempts' },
    awaitingMessage: { en: 'This stage is waiting for your approval', ru: 'Этот этап ожидает вашего подтверждения' },
    activity: { en: 'Activity', ru: 'Активность' },
    expand: { en: 'Expand to full width', ru: 'Развернуть на всю ширину' },
    collapse: { en: 'Collapse to half width', ru: 'Свернуть до половины' },
  },
  refinementChat: {
    buttonTooltip: { ru: 'Скорректировать результат', en: 'Adjust result' },
    panelTitle: { ru: 'Чат с ИИ', en: 'AI Chat' },
    placeholder: { ru: 'Напишите, что изменить или улучшить...', en: 'Describe what to change or improve...' },
    send: { ru: 'Отправить и перегенерировать', en: 'Send & Regenerate' },
    history: { en: 'Chat History', ru: 'История чата' },
    thinking: { en: 'Thinking...', ru: 'Обрабатываю...' },
    quickActions: {
      shorter: { ru: 'Короче', en: 'Shorter' },
      moreExamples: { ru: 'Больше примеров', en: 'More examples' },
      simplify: { ru: 'Упростить', en: 'Simplify' },
      moreDetail: { ru: 'Подробнее', en: 'More detail' },
    },
  },
  errors: {
    connectionLost: { ru: 'Соединение потеряно', en: 'Connection lost' },
    reconnecting: { ru: 'Переподключение...', en: 'Reconnecting...' },
    retryFailed: { ru: 'Не удалось повторить', en: 'Retry failed' },
  },
  // New keys below
  retry: {
    confirmTitle: { en: 'Confirm Retry', ru: 'Подтвердить повтор' },
    confirmDescription: { en: 'Are you sure you want to retry this item?', ru: 'Вы уверены, что хотите повторить этот элемент?' },
    retryButton: { en: 'Retry', ru: 'Повторить' },
    cancelButton: { en: 'Cancel', ru: 'Отмена' },
  },
  mobile: {
    title: { en: 'Generation Progress', ru: 'Прогресс генерации' },
    noStages: { en: 'No stages yet', ru: 'Этапов пока нет' },
    stageProgress: { en: 'Stage {{current}} of {{total}}', ru: 'Этап {{current}} из {{total}}' },
  },
  viewToggle: {
    graphView: { en: 'Graph View', ru: 'Граф' },
    listView: { en: 'List View', ru: 'Список' },
  },
  longRunning: {
    message: { en: 'Taking longer than usual...', ru: 'Занимает больше времени, чем обычно...' },
    emailNotify: { en: 'Notify me by email when complete', ru: 'Уведомить по email, когда завершится' },
    emailPlaceholder: { en: 'Enter your email', ru: 'Введите ваш email' },
    subscribe: { en: 'Subscribe', ru: 'Подписаться' },
  },
  metrics: {
    duration: { en: 'Duration', ru: 'Время' },
    tokens: { en: 'Tokens', ru: 'Токены' },
    cost: { en: 'Cost', ru: 'Стоимость' },
    processing: { en: 'Processing...', ru: 'Обработка...' },
  },
  completionMessages: {
    stage_1: { ru: 'Курс инициализирован', en: 'Course initialized' },
    stage_2: { ru: 'Документы обработаны', en: 'Documents processed' },
    stage_3: { ru: 'Приоритеты установлены', en: 'Priorities assigned' },
    stage_4: { ru: 'Анализ завершён', en: 'Analysis complete' },
    stage_5: { ru: 'Структура сформирована', en: 'Structure generated' },
    stage_6: { ru: 'Контент создан', en: 'Content created' },
  },
  analysisResult: {
    // Section titles
    classification: { ru: 'Классификация курса', en: 'Course Classification' },
    classificationDesc: { ru: 'Категория и контекст курса', en: 'Category and course context' },
    topicAnalysis: { ru: 'Анализ темы', en: 'Topic Analysis' },
    topicAnalysisDesc: { ru: 'Детали темы и ключевые концепции', en: 'Topic details and key concepts' },
    structure: { ru: 'Рекомендуемая структура', en: 'Recommended Structure' },
    structureDesc: { ru: 'Объём и распределение уроков', en: 'Scope and lesson distribution' },
    pedagogy: { ru: 'Педагогическая стратегия', en: 'Pedagogical Strategy' },
    pedagogyDesc: { ru: 'Стиль обучения и подход', en: 'Teaching style and approach' },
    guidance: { ru: 'Рекомендации для генерации', en: 'Generation Guidance' },
    guidanceDesc: { ru: 'Тон, примеры и упражнения', en: 'Tone, examples, and exercises' },
    documents: { ru: 'Связь с документами', en: 'Document Relations' },
    documentsDesc: { ru: 'RAG-планирование по модулям', en: 'RAG planning by module' },

    // Field labels
    category: { ru: 'Категория', en: 'Category' },
    confidence: { ru: 'Уверенность', en: 'Confidence' },
    reasoning: { ru: 'Обоснование', en: 'Reasoning' },
    whyMatters: { ru: 'Почему это важно', en: 'Why it matters' },
    motivators: { ru: 'Мотиваторы', en: 'Motivators' },
    topic: { ru: 'Тема', en: 'Topic' },
    complexity: { ru: 'Сложность', en: 'Complexity' },
    audience: { ru: 'Аудитория', en: 'Audience' },
    keyConcepts: { ru: 'Ключевые концепции', en: 'Key Concepts' },
    keywords: { ru: 'Ключевые слова', en: 'Keywords' },
    totalLessons: { ru: 'Уроков', en: 'Lessons' },
    totalSections: { ru: 'Модулей', en: 'Modules' },
    lessonDuration: { ru: 'Длительность урока', en: 'Lesson Duration' },
    scopeReasoning: { ru: 'Обоснование объёма', en: 'Scope Reasoning' },
    teachingStyle: { ru: 'Стиль', en: 'Style' },
    practicalFocus: { ru: 'Практический фокус', en: 'Practical Focus' },
    interactivity: { ru: 'Интерактивность', en: 'Interactivity' },
    assessmentApproach: { ru: 'Подход к оценке', en: 'Assessment Approach' },
    assessmentTypes: { ru: 'Типы заданий', en: 'Assessment Types' },
    tone: { ru: 'Тон изложения', en: 'Tone' },
    analogies: { ru: 'Аналогии', en: 'Analogies' },
    noAnalogies: { ru: 'Без аналогий', en: 'No analogies' },
    visuals: { ru: 'Визуальные элементы', en: 'Visual Elements' },
    exerciseTypes: { ru: 'Типы упражнений', en: 'Exercise Types' },
    section: { ru: 'Модуль', en: 'Module' },
    noDocuments: { ru: 'Нет связанных документов', en: 'No linked documents' },
  },
  courseStructure: {
    // Main sections
    courseInfo: { ru: 'Информация о курсе', en: 'Course Information' },
    courseInfoDesc: { ru: 'Название, описание и параметры курса', en: 'Title, description, and course parameters' },
    structure: { ru: 'Структура курса', en: 'Course Structure' },
    structureDesc: { ru: 'Модули и уроки', en: 'Modules and lessons' },

    // Metadata labels
    targetAudience: { ru: 'Целевая аудитория', en: 'Target Audience' },
    difficulty: { ru: 'Уровень сложности', en: 'Difficulty Level' },
    duration: { ru: 'Длительность', en: 'Duration' },
    totalDuration: { ru: 'Общая длительность', en: 'Total Duration' },
    prerequisites: { ru: 'Предварительные требования', en: 'Prerequisites' },
    noPrerequisites: { ru: 'Без предварительных требований', en: 'No prerequisites' },
    tags: { ru: 'Теги курса', en: 'Course Tags' },
    overview: { ru: 'Обзор курса', en: 'Course Overview' },
    learningOutcomes: { ru: 'Результаты обучения', en: 'Learning Outcomes' },
    assessmentStrategy: { ru: 'Стратегия оценки', en: 'Assessment Strategy' },

    // Difficulty levels
    beginner: { ru: 'Начинающий', en: 'Beginner' },
    intermediate: { ru: 'Средний', en: 'Intermediate' },
    advanced: { ru: 'Продвинутый', en: 'Advanced' },

    // Module labels (UI shows "Module", code uses "section" for now - see FUTURE-006)
    section: { ru: 'Модуль', en: 'Module' },
    sectionDescription: { ru: 'Описание модуля', en: 'Module Description' },
    sectionObjectives: { ru: 'Цели модуля', en: 'Module Objectives' },

    // Lesson labels
    lesson: { ru: 'Урок', en: 'Lesson' },
    lessons: { ru: 'уроков', en: 'lessons' },
    lessonTitle: { ru: 'Название урока', en: 'Lesson Title' },
    lessonObjectives: { ru: 'Цели урока', en: 'Lesson Objectives' },
    keyTopics: { ru: 'Ключевые темы', en: 'Key Topics' },
    practicalExercises: { ru: 'Практические задания', en: 'Practical Exercises' },
    exerciseType: { ru: 'Тип задания', en: 'Exercise Type' },
    exerciseTitle: { ru: 'Название задания', en: 'Exercise Title' },
    exerciseDescription: { ru: 'Описание задания', en: 'Exercise Description' },

    // Duration formatting
    hours: { ru: 'ч', en: 'h' },
    minutes: { ru: 'мин', en: 'min' },
    hoursLong: { ru: 'часов', en: 'hours' },
    minutesLong: { ru: 'минут', en: 'minutes' },

    // Counts
    lessonsCount: { ru: 'уроков', en: 'lessons' },
    sectionsCount: { ru: 'модулей', en: 'modules' },
    exercisesCount: { ru: 'заданий', en: 'exercises' },
    topicsCount: { ru: 'тем', en: 'topics' },

    // Empty states
    noLessons: { ru: 'Нет уроков', en: 'No lessons' },
    noSections: { ru: 'Нет модулей', en: 'No modules' },
    noTopics: { ru: 'Нет ключевых тем', en: 'No key topics' },
    noExercises: { ru: 'Нет практических заданий', en: 'No practical exercises' },
  },
  restart: {
    confirmTitle: { ru: 'Перезапустить этап?', en: 'Restart Stage?' },
    confirmDescription: {
      ru: 'Вы собираетесь перезапустить генерацию с этапа {{stageNumber}} ({{stageName}}). Все результаты после этого этапа будут пересозданы.',
      en: 'You are about to restart generation from Stage {{stageNumber}} ({{stageName}}). All results after this stage will be regenerated.',
    },
    warningMessage: {
      ru: 'Это действие перезапишет текущие результаты генерации.',
      en: 'This action will overwrite current generation results.',
    },
    restartButton: { ru: 'Перезапустить', en: 'Restart' },
    restartingButton: { ru: 'Перезапуск...', en: 'Restarting...' },
    cancelButton: { ru: 'Отмена', en: 'Cancel' },
    buttonTooltip: { ru: 'Перезапустить с этого этапа', en: 'Restart from this stage' },
    restartFromError: { ru: 'Перезапустить', en: 'Restart' },
    errorDescription: { ru: 'Произошла ошибка на этом этапе', en: 'An error occurred at this stage' },
  },
};