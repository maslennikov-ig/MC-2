import { GraphTranslations } from '@megacampus/shared-types';

// Extended with analysisResult section for Stage 4 UI Redesign and courseStructure for Stage 5
export const GRAPH_TRANSLATIONS: GraphTranslations & {
  analysisResult?: Record<string, { ru: string; en: string }>;
  courseStructure?: Record<string, { ru: string; en: string }>;
  restart?: Record<string, { ru: string; en: string }>;
  stage1?: Record<string, { ru: string; en: string }>;
  stage2?: Record<string, { ru: string; en: string }>;
  stage3?: Record<string, { ru: string; en: string }>;
  stage4?: Record<string, { ru: string; en: string }>;
  stage5?: Record<string, { ru: string; en: string }>;
  stage6?: Record<string, Record<string, { ru: string; en: string }>>;
  stageDescriptions?: Record<string, { ru: string; en: string }>;
  enrichments?: {
    types: Record<string, { ru: string; en: string }>;
    status: Record<string, { ru: string; en: string }>;
    actions: Record<string, { ru: string; en: string }>;
    assetDock: Record<string, { ru: string; en: string }>;
  };
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
  stageDescriptions: {
    stage_1: {
      ru: 'Паспорт курса — ваши исходные данные и параметры, которые определяют весь процесс генерации.',
      en: 'Course passport — your source data and parameters that define the entire generation process.',
    },
    stage_2: {
      ru: 'Извлечение и структурирование контента из загруженных документов с помощью AI.',
      en: 'Extracting and structuring content from uploaded documents using AI.',
    },
    stage_3: {
      ru: 'Классификация и приоритизация документов по важности для курса.',
      en: 'Classifying and prioritizing documents by importance for the course.',
    },
    stage_4: {
      ru: 'Глубокий анализ темы, определение ключевых концепций и связей между ними.',
      en: 'Deep analysis of the topic, identifying key concepts and relationships between them.',
    },
    stage_5: {
      ru: 'Формирование оптимальной структуры курса: модули, уроки, последовательность.',
      en: 'Creating optimal course structure: modules, lessons, and sequence.',
    },
    stage_6: {
      ru: 'Генерация контента уроков на основе структуры и материалов курса.',
      en: 'Generating lesson content based on course structure and materials.',
    },
    default: {
      ru: 'Просмотр данных и метрик выполнения этапа.',
      en: 'View stage data and execution metrics.',
    },
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
  stage1: {
    // Input Tab - Identity Card
    identity: { ru: 'Идентификация', en: 'Identity' },
    topic: { ru: 'Тема курса', en: 'Course Topic' },
    description: { ru: 'Описание', en: 'Description' },
    showMore: { ru: 'Читать далее', en: 'Show more' },
    showLess: { ru: 'Свернуть', en: 'Show less' },

    // Input Tab - Strategy Card
    strategyAndLogistics: { ru: 'Стратегия и параметры', en: 'Strategy & Parameters' },
    strategy: { ru: 'Стратегия', en: 'Strategy' },
    strategyAuto: { ru: 'Авто', en: 'Auto' },
    strategyFromScratch: { ru: 'С нуля', en: 'From Scratch' },
    strategyExpand: { ru: 'Расширение', en: 'Expand' },
    audience: { ru: 'Аудитория', en: 'Audience' },
    style: { ru: 'Стиль', en: 'Style' },
    lessonsCount: { ru: 'Уроков', en: 'Lessons' },
    formats: { ru: 'Форматы', en: 'Formats' },
    prerequisites: { ru: 'Предварительные требования', en: 'Prerequisites' },
    learningOutcomes: { ru: 'Ожидаемые результаты', en: 'Learning Outcomes' },

    // Input Tab - Files Card
    knowledgeBase: { ru: 'База знаний', en: 'Knowledge Base' },
    files: { ru: 'Файлы', en: 'Files' },
    filesCount: { ru: 'файлов', en: 'files' },
    noFiles: { ru: 'Без файлов', en: 'No files' },
    notSpecified: { ru: 'Не указано', en: 'Not specified' },

    // Format icons labels
    formatText: { ru: 'Текст', en: 'Text' },
    formatAudio: { ru: 'Аудио', en: 'Audio' },
    formatVideo: { ru: 'Видео', en: 'Video' },
    formatPresentation: { ru: 'Презентация', en: 'Presentation' },
    formatTest: { ru: 'Тест', en: 'Test' },

    // Process Tab - Validation Receipt
    validationReceipt: { ru: 'Чек валидации', en: 'Validation Receipt' },
    validation: { ru: 'Валидация данных', en: 'Input Validation' },
    validationDesc: { ru: 'Проверка обязательных полей', en: 'Checking required fields' },
    securityScan: { ru: 'Проверка безопасности', en: 'Security Scan' },
    securityScanDesc: { ru: 'Сканирование файлов', en: 'Scanning files' },
    storageUpload: { ru: 'Загрузка в облако', en: 'Storage Upload' },
    storageUploadDesc: { ru: 'Сохранение файлов в хранилище', en: 'Saving files to storage' },
    registry: { ru: 'Регистрация курса', en: 'Course Registry' },
    registryDesc: { ru: 'Создание записи в базе данных', en: 'Creating database record' },
    totalLatency: { ru: 'Общее время', en: 'Total Latency' },
    stepSkipped: { ru: 'Пропущено', en: 'Skipped' },

    // Output Tab - Course Passport
    coursePassport: { ru: 'Паспорт курса', en: 'Course Passport' },
    courseId: { ru: 'ID курса', en: 'Course ID' },
    owner: { ru: 'Владелец', en: 'Owner' },
    createdAt: { ru: 'Создан', en: 'Created' },
    status: { ru: 'Статус', en: 'Status' },
    readyForStage2: { ru: 'Готов к Этапу 2', en: 'Ready for Stage 2' },
    initializationError: { ru: 'Ошибка инициализации', en: 'Initialization Error' },
    copied: { ru: 'Скопировано', en: 'Copied' },
    copyToClipboard: { ru: 'Копировать в буфер', en: 'Copy to clipboard' },
    copyFailed: { ru: 'Ошибка копирования', en: 'Failed to copy' },
    dateUnknown: { ru: 'Дата неизвестна', en: 'Date unknown' },
    outputEmptyState: { ru: 'Паспорт курса появится здесь после завершения инициализации', en: 'Course passport will appear here after initialization completes' },

    // Output Tab - Asset Map
    assetMap: { ru: 'Карта файлов', en: 'Asset Map' },
    storagePath: { ru: 'Путь в хранилище', en: 'Storage Path' },
    noAssets: { ru: 'Нет загруженных файлов', en: 'No uploaded files' },

    // Output Tab - Next Step
    nextStep: { ru: 'Следующий этап', en: 'Next Step' },
    documentClassification: { ru: 'Классификация документов', en: 'Document Classification' },
    deepAnalysis: { ru: 'Глубокий анализ', en: 'Deep Analysis' },

    // Activity Tab
    activityLog: { ru: 'Журнал действий', en: 'Activity Log' },
    userAction: { ru: 'Пользователь', en: 'User' },
    systemAction: { ru: 'Система', en: 'System' },
    courseCreated: { ru: 'Курс создан', en: 'Course created' },
    topicUpdated: { ru: 'Тема обновлена', en: 'Topic updated' },
    filesUploaded: { ru: 'Файлы загружены', en: 'Files uploaded' },
    validationPassed: { ru: 'Валидация пройдена', en: 'Validation passed' },
    validationFailed: { ru: 'Валидация не пройдена', en: 'Validation failed' },
    triggeredStage2: { ru: 'Запущен Этап 2', en: 'Triggered Stage 2' },
    noActivity: { ru: 'Нет активности', en: 'No activity recorded' },
  },
  stage2: {
    // === INPUT TAB ===
    // File DNA Card
    fileDNA: { ru: 'Паспорт файла', en: 'File DNA' },
    fileName: { ru: 'Имя файла', en: 'Filename' },
    fileSize: { ru: 'Размер', en: 'Size' },
    fileType: { ru: 'Тип', en: 'Type' },
    pageCount: { ru: 'Страниц', en: 'Pages' },
    heavyPayload: { ru: 'Большой файл', en: 'Heavy Payload' },
    heavyPayloadHint: { ru: 'Обработка может занять больше времени', en: 'Processing may take longer' },

    // Tier Card
    tierCapabilities: { ru: 'Возможности обработки', en: 'Processing Capabilities' },
    tierBasic: { ru: 'Базовый', en: 'Basic' },
    tierStandard: { ru: 'Стандартный', en: 'Standard' },
    tierPremium: { ru: 'Премиум', en: 'Premium' },
    featureActive: { ru: 'Активно', en: 'Active' },
    featureLocked: { ru: 'Заблокировано', en: 'Locked' },
    featureDocling: { ru: 'Умное чтение', en: 'Smart Reading' },
    featureOCR: { ru: 'Распознавание текста', en: 'Text Recognition' },
    featureVisuals: { ru: 'Анализ медиа', en: 'Visual Analysis' },
    featureEnhanced: { ru: 'Улучшенная обработка', en: 'Enhanced Processing' },
    upgradeHint: { ru: 'Требуется Premium', en: 'Requires Premium' },

    // Metadata Card
    metadata: { ru: 'Метаданные', en: 'Metadata' },
    uploadedBy: { ru: 'Загружен', en: 'Uploaded by' },
    organization: { ru: 'Организация', en: 'Organization' },
    pipelineId: { ru: 'ID обработки', en: 'Pipeline ID' },

    // === PROCESS TAB ===
    // Pipeline Header
    pipeline: { ru: 'Конвейер обработки', en: 'Processing Pipeline' },
    pipelineDesc: { ru: 'Превращаем документ в знания', en: 'Transforming document into knowledge' },

    // Phase Names (User-friendly translations)
    phaseDocling: { ru: 'Оцифровка', en: 'Digitization' },
    phaseDoclingDesc: { ru: 'Умное чтение структуры документа', en: 'Smart document structure reading' },
    phaseMarkdown: { ru: 'Очистка', en: 'Cleanup' },
    phaseMarkdownDesc: { ru: 'Форматирование и очистка текста', en: 'Text formatting and cleanup' },
    phaseImages: { ru: 'Анализ медиа', en: 'Visual Analysis' },
    phaseImagesDesc: { ru: 'Распознавание изображений и таблиц', en: 'Image and table recognition' },
    phaseChunking: { ru: 'Сегментация', en: 'Segmentation' },
    phaseChunkingDesc: { ru: 'Разбиение на смысловые блоки', en: 'Splitting into semantic blocks' },
    phaseEmbedding: { ru: 'Векторизация', en: 'AI Encoding' },
    phaseEmbeddingDesc: { ru: 'Создание цифровых отпечатков смысла', en: 'Creating semantic fingerprints' },
    phaseQdrant: { ru: 'Индексация', en: 'Knowledge Save' },
    phaseQdrantDesc: { ru: 'Сохранение в базу знаний', en: 'Saving to knowledge base' },
    phaseSummarization: { ru: 'Синтез', en: 'Insight Generation' },
    phaseSummarizationDesc: { ru: 'Создание краткого резюме', en: 'Creating executive summary' },

    // Phase Status
    statusPending: { ru: 'Ожидание', en: 'Pending' },
    statusActive: { ru: 'Выполняется', en: 'Processing' },
    statusCompleted: { ru: 'Завершено', en: 'Completed' },
    statusSkipped: { ru: 'Пропущено', en: 'Skipped' },
    statusError: { ru: 'Ошибка', en: 'Error' },

    // Terminal Footer
    terminal: { ru: 'Журнал системы', en: 'System Log' },

    // === OUTPUT TAB ===
    // Summary Section
    executiveSummary: { ru: 'Краткое резюме', en: 'Executive Summary' },
    summaryEmpty: { ru: 'Файл успешно индексирован (слишком короткий для резюме)', en: 'File successfully indexed (too short for summary)' },

    // Knowledge Atoms Grid
    knowledgeAtoms: { ru: 'Извлечённые знания', en: 'Knowledge Atoms' },
    atomPages: { ru: 'Страниц', en: 'Pages' },
    atomChunks: { ru: 'Блоков', en: 'Chunks' },
    atomVisuals: { ru: 'Медиа', en: 'Visuals' },
    atomTokens: { ru: 'Токенов', en: 'Tokens' },

    // Quality Section
    qualityHealth: { ru: 'Качество обработки', en: 'Processing Quality' },
    qualityHigh: { ru: 'Отличное качество', en: 'High fidelity' },
    qualityHighDesc: { ru: 'Отлично для поиска', en: 'Excellent for search' },
    qualityMedium: { ru: 'Хорошее качество', en: 'Good fidelity' },
    qualityMediumDesc: { ru: 'Подходит для поиска', en: 'Suitable for search' },
    qualityLow: { ru: 'Низкое качество', en: 'Low fidelity' },
    qualityLowDesc: { ru: 'Рекомендуется загрузить более чёткий файл', en: 'Consider uploading a clearer file' },

    // Actions
    inspectMarkdown: { ru: 'Просмотреть текст', en: 'Inspect Markdown' },
    vectorStatus: { ru: 'Статус индексации', en: 'Index Status' },
    vectorIndexed: { ru: 'Проиндексирован', en: 'Indexed' },
    vectorPending: { ru: 'Ожидает индексации', en: 'Pending Indexing' },
    vectorFailed: { ru: 'Ошибка индексации', en: 'Indexing Failed' },

    // === ACTIVITY TAB ===
    activityLog: { ru: 'Журнал обработки', en: 'Processing Log' },
    phaseGroup: { ru: 'Фаза', en: 'Phase' },
    eventsCount: { ru: 'событий', en: 'events' },
    actorUser: { ru: 'Пользователь', en: 'User' },
    actorSystem: { ru: 'Система', en: 'System' },
    actorAI: { ru: 'ИИ модель', en: 'AI Model' },
    noActivity: { ru: 'Нет событий', en: 'No events recorded' },

    // Tooltips for technical terms
    tooltipChunks: { ru: 'Смысловые кусочки текста. Мы нарезаем документ, чтобы ИИ находил точный ответ, а не читал всю книгу целиком.', en: 'Semantic text fragments. We slice the document so AI finds precise answers instead of reading the whole book.' },
    tooltipEmbeddings: { ru: 'Цифровой отпечаток смысла. Позволяет искать информацию не по ключевым словам, а по смыслу.', en: 'Semantic fingerprint. Enables searching by meaning, not just keywords.' },
    tooltipDocling: { ru: 'Технология умного чтения, которая понимает не только буквы, но и структуру (таблицы, заголовки).', en: 'Smart reading technology that understands not just text, but structure (tables, headings).' },

    // Missing i18n keys for Stage 2 UI
    contentTruncated: { ru: 'Содержимое обрезано (превышает 100KB)', en: 'Content truncated (exceeds 100KB)' },
    dbConnectionError: { ru: 'Ошибка подключения к базе', en: 'Database connection failed' },
    noDataAvailable: { ru: 'Данные недоступны', en: 'No data available' },
    processingEvent: { ru: 'Обработка события', en: 'Processing event' },
    systemUser: { ru: 'Система', en: 'System' },
    waitingForEvents: { ru: 'Ожидание событий...', en: 'Waiting for events...' },
    waitingToStart: { ru: 'Ожидание запуска', en: 'Waiting to start' },

    // === STAGE 2 DASHBOARD (container) ===
    dashboardTitle: { ru: 'Обработка документов', en: 'Document Processing' },
    dashboardDesc: { ru: 'Обзор загруженных файлов и их обработки', en: 'Overview of uploaded files and their processing' },
    totalDocs: { ru: 'Всего файлов', en: 'Total Files' },
    completed: { ru: 'Обработано', en: 'Completed' },
    processing: { ru: 'Обрабатывается', en: 'Processing' },
    failed: { ru: 'С ошибками', en: 'Failed' },
    noDocuments: { ru: 'Документы не загружены', en: 'No documents uploaded' },
    retryFailed: { ru: 'Повторить ошибочные', en: 'Retry Failed' },
    sortByPriority: { ru: 'По приоритету', en: 'By Priority' },
    sortByName: { ru: 'По имени', en: 'By Name' },
    sortByStatus: { ru: 'По статусу', en: 'By Status' },
    stagesProgress: { ru: 'этапов', en: 'stages' },
    expandContainer: { ru: 'Развернуть контейнер', en: 'Expand container' },
    collapseContainer: { ru: 'Свернуть контейнер', en: 'Collapse container' },

    // Dashboard table headers
    tableDocument: { ru: 'Документ', en: 'Document' },
    tablePriority: { ru: 'Приоритет', en: 'Priority' },
    tableProgress: { ru: 'Прогресс', en: 'Progress' },
    tableStatus: { ru: 'Статус', en: 'Status' },
    tableTime: { ru: 'Время', en: 'Time' },
    tableAction: { ru: 'Действие', en: 'Action' },

    // Priority labels
    // @deprecated Use PRIORITY_CONFIG from '@/lib/generation-graph/priority-config' instead (SSOT)
    priorityCore: { ru: 'Ключевой', en: 'Core' },
    priorityImportant: { ru: 'Важный', en: 'Important' },
    prioritySupplementary: { ru: 'Дополнительный', en: 'Supplementary' },

    // Status labels
    statusAwaiting: { ru: 'Ожидает', en: 'Awaiting' },
    requiresAttention: { ru: 'Требует внимания', en: 'Requires attention' },

    // Dashboard metrics
    totalLabel: { ru: 'Всего', en: 'Total' },
    readyLabel: { ru: 'Готово', en: 'Ready' },
    inProgressLabel: { ru: 'В работе', en: 'In progress' },
    errorsLabel: { ru: 'Ошибки', en: 'Errors' },
    overallProgress: { ru: 'Общий прогресс', en: 'Overall progress' },
    pagesLabel: { ru: 'страниц', en: 'pages' },
    chunksLabel: { ru: 'чанков', en: 'chunks' },
    retryErrors: { ru: 'Повторить ошибки', en: 'Retry errors' },
    totalDocumentsCount: { ru: 'Всего: {count} документов', en: 'Total: {count} documents' },

    // Actions
    retryAction: { ru: 'Повторить', en: 'Retry' },
    viewAction: { ru: 'Просмотр', en: 'View' },
    openDocument: { ru: 'Открыть документ', en: 'Open document' },

    // Error messages
    displayError: { ru: 'Ошибка отображения документов', en: 'Display error' },
    loadingError: { ru: 'Ошибка загрузки', en: 'Loading error' },
    documentsNotFound: { ru: 'Документы не найдены', en: 'Documents not found' },
    documentsNotFoundHint: { ru: 'Загрузите документы на Этапе 1, чтобы начать обработку', en: 'Upload documents in Stage 1 to start processing' },
    noDocumentsToProcess: { ru: 'Нет документов для обработки', en: 'No documents to process' },
    noDocumentsHint: { ru: 'Этот курс был создан без загруженных документов. Вернитесь к Этапу 1, чтобы добавить файлы.', en: 'This course was created without uploaded documents. Return to Stage 1 to add files.' },
    loadingDocuments: { ru: 'Загрузка данных документов...', en: 'Loading document data...' },
    tryAgain: { ru: 'Попробовать снова', en: 'Try again' },
    headerLoadError: { ru: 'Ошибка загрузки заголовка', en: 'Header load error' },
    tableLoadError: { ru: 'Ошибка загрузки таблицы документов', en: 'Document table load error' },
    statsLoadError: { ru: 'Ошибка загрузки статистики', en: 'Statistics load error' },

    // Time formatting
    milliseconds: { ru: 'мс', en: 'ms' },
    seconds: { ru: 'с', en: 's' },
    minutes: { ru: 'м', en: 'm' },
    perDoc: { ru: '/док', en: '/doc' },

    // === STAGE 2 GROUP NODE ===
    groupTitle: { ru: 'Обработка документов', en: 'Document Processing' },
    stageLabel: { ru: 'Этап 2', en: 'Stage 2' },
    documentsLabel: { ru: 'Документы', en: 'Documents' },
    documentsCount: { ru: 'документов', en: 'documents' },
    documentsCountShort: { ru: 'док', en: 'docs' },
    documentsWithErrors: { ru: 'документ(ов) с ошибками', en: 'document(s) with errors' },
    documentProcessingExpanded: { ru: 'Обработка документов развернуто', en: 'Document processing expanded' },
    clickToExpand: { ru: 'Клик: развернуть/свернуть, двойной клик: открыть детали', en: 'Click: expand/collapse, double click: open details' },
    clickToCollapse: { ru: 'Клик: свернуть, двойной клик: открыть детали', en: 'Click: collapse, double click: open details' },
    statusReady: { ru: 'Готово', en: 'Ready' },
    statusProcessing: { ru: 'Обработка', en: 'Processing' },
    unknownError: { ru: 'Неизвестная ошибка', en: 'Unknown error' },
  },
  stage3: {
    // Tab names
    inputTab: { ru: 'Контекст', en: 'Context' },
    processTab: { ru: 'Оценка', en: 'Evaluation' },
    outputTab: { ru: 'Иерархия', en: 'Hierarchy' },
    activityTab: { ru: 'Протокол', en: 'Protocol' },

    // Input Tab - Course Context
    courseContext: { ru: 'Критерии курса', en: 'Course Criteria' },
    courseContextDesc: { ru: 'Цель и направление определяют приоритеты', en: 'Goal and direction determine priorities' },
    candidates: { ru: 'Кандидаты на оценку', en: 'Candidates' },
    candidatesCount: { ru: 'документов', en: 'documents' },
    strategyEngine: { ru: 'Режим оценки', en: 'Evaluation Mode' },
    tokenBudget: { ru: 'Бюджет токенов', en: 'Token Budget' },
    strategySinglePass: { ru: 'Единый проход', en: 'Single Pass' },
    strategySinglePassDesc: { ru: 'Все документы оцениваются за один вызов', en: 'All documents evaluated in one call' },
    strategyTournament: { ru: 'Турнирный режим', en: 'Tournament Mode' },
    strategyTournamentDesc: { ru: 'Документы сравниваются попарно', en: 'Documents compared pairwise' },
    summaryPreview: { ru: 'Резюме', en: 'Summary' },
    heavyDocument: { ru: 'Большой документ', en: 'Heavy Document' },
    sortedByTokens: { ru: 'Сортировка по весу (токенам)', en: 'Sorted by weight (tokens)' },

    // Process Tab - Execution Audit
    executionAudit: { ru: 'Аудит выполнения', en: 'Execution Audit' },
    executionAuditDesc: { ru: 'Протокол работы системы классификации', en: 'Classification system execution log' },
    phaseContextLoading: { ru: 'Загрузка контекста', en: 'Context Loading' },
    phaseContextLoadingDesc: { ru: 'Загрузка темы и целей курса', en: 'Loading course topic and objectives' },
    phaseStrategySelection: { ru: 'Выбор стратегии', en: 'Strategy Selection' },
    phaseStrategySelectionDesc: { ru: 'Определение режима классификации', en: 'Determining classification mode' },
    phaseComparativeAnalysis: { ru: 'Сравнительный анализ', en: 'Comparative Analysis' },
    phaseComparativeAnalysisDesc: { ru: 'Оценка релевантности документов', en: 'Evaluating document relevance' },
    phaseRationaleGeneration: { ru: 'Генерация обоснований', en: 'Rationale Generation' },
    phaseRationaleGenerationDesc: { ru: 'Объяснение решений ИИ', en: 'Explaining AI decisions' },
    phaseHierarchyFinalization: { ru: 'Финализация иерархии', en: 'Hierarchy Finalization' },
    phaseHierarchyFinalizationDesc: { ru: 'Применение правила единственного CORE', en: 'Enforcing single CORE rule' },
    telemetry: { ru: 'Телеметрия', en: 'Telemetry' },
    processingTime: { ru: 'Время', en: 'Time' },
    tokenLoad: { ru: 'Токены', en: 'Tokens' },
    filesProcessed: { ru: 'Файлы', en: 'Files' },
    modelUsed: { ru: 'Модель', en: 'Model' },

    // Output Tab - Hierarchy Dashboard
    hierarchyDashboard: { ru: 'Иерархия документов', en: 'Document Hierarchy' },
    priorityDistribution: { ru: 'Распределение', en: 'Distribution' },
    rank: { ru: 'Ранг', en: 'Rank' },
    score: { ru: 'Оценка', en: 'Score' },
    rationale: { ru: 'Обоснование', en: 'Rationale' },
    showRationale: { ru: 'Показать обоснование', en: 'Show rationale' },
    hideRationale: { ru: 'Скрыть', en: 'Hide' },
    coreDocument: { ru: 'Ключевой', en: 'Core' },
    coreDocumentDesc: { ru: 'Самый важный документ курса (только 1)', en: 'Most important course document (only 1)' },
    importantDocument: { ru: 'Важный', en: 'Important' },
    importantDocumentDesc: { ru: 'Основные материалы курса (до 30%)', en: 'Key course materials (up to 30%)' },
    supplementaryDocument: { ru: 'Дополнительный', en: 'Supplementary' },
    supplementaryDocumentDesc: { ru: 'Вспомогательные материалы', en: 'Supporting materials' },
    validationError: { ru: 'Выберите ровно 1 ключевой документ', en: 'Select exactly 1 CORE document' },
    approveStructure: { ru: 'Подтвердить структуру', en: 'Approve Structure' },
    changeCoreWarning: { ru: 'Сделать этот документ ключевым?', en: 'Make this document CORE?' },
    changeCoreDesc: { ru: 'Текущий ключевой документ будет понижен до "Важный"', en: 'Current CORE document will be demoted to IMPORTANT' },

    // Activity Tab - Decision Protocol
    decisionProtocol: { ru: 'Протокол решений', en: 'Decision Protocol' },
    phaseSetup: { ru: 'Подготовка', en: 'Setup' },
    phaseJudgment: { ru: 'Оценка ИИ', en: 'AI Judgment' },
    phaseOverrides: { ru: 'Изменения пользователя', en: 'User Overrides' },
    aiClassified: { ru: 'ИИ классифицировал', en: 'AI classified' },
    documentsClassified: { ru: 'документов', en: 'documents' },
    selectedAsCore: { ru: 'Выбран как ключевой', en: 'Selected as CORE' },
    promotedToImportant: { ru: 'Повышен до важного', en: 'Promoted to IMPORTANT' },
    demotedToSupplementary: { ru: 'Понижен до дополнительного', en: 'Demoted to SUPPLEMENTARY' },
    userChangedPriority: { ru: 'Пользователь изменил приоритет', en: 'User changed priority' },
    structureApproved: { ru: 'Структура утверждена', en: 'Structure approved' },
    contextLoaded: { ru: 'Контекст курса загружен', en: 'Course context loaded' },
    strategySelected: { ru: 'Выбрана стратегия', en: 'Strategy selected' },
    classificationComplete: { ru: 'Классификация завершена', en: 'Classification complete' },

    // Empty states
    emptyInput: { ru: 'Ожидание документов из Этапа 2...', en: 'Waiting for Stage 2 documents...' },
    emptyProcess: { ru: 'Классификация ещё не начата', en: 'Classification not started yet' },
    emptyOutput: { ru: 'Результаты классификации появятся здесь', en: 'Classification results will appear here' },
    emptyActivity: { ru: 'Решения ещё не записаны', en: 'No decisions recorded yet' },

    // Error states
    errorClassification: { ru: 'Ошибка классификации', en: 'Classification Error' },
    errorTokenLimit: { ru: 'Превышен лимит токенов', en: 'Token Limit Exceeded' },
    noDocumentsToClassify: { ru: 'Нет документов для классификации', en: 'No documents to classify' },

    // Output Tab - Hierarchy Distribution (missing from code review)
    hierarchyDistribution: { ru: 'Распределение документов', en: 'Document Hierarchy' },
    priorityTable: { ru: 'Приоритеты документов', en: 'Document Priorities' },

    // Activity Tab - Event messages (missing from code review)
    noEventsInPhase: { ru: 'Нет событий в этой фазе', en: 'No events in this phase' },
    eventContextLoaded: { ru: 'Контекст курса загружен', en: 'Course context loaded' },
    eventStrategySelected: { ru: 'Стратегия классификации: единый проход', en: 'Classification strategy: single pass' },
    eventClassificationComplete: { ru: 'Документы классифицированы', en: 'Documents classified' },
    eventRationalesGenerated: { ru: 'Обоснования сгенерированы для всех документов', en: 'Rationales generated for all documents' },
  },
  stage4: {
    // Tab names (consistent with other stages)
    inputTab: { ru: 'Бриф', en: 'Brief' },
    processTab: { ru: 'Анализ', en: 'Analysis' },
    outputTab: { ru: 'Чертёж', en: 'Blueprint' },
    activityTab: { ru: 'Журнал', en: 'Journal' },

    // === INPUT TAB ===
    // Card A: Course Context
    courseBrief: { ru: 'Бриф курса', en: 'Course Brief' },
    courseBriefDesc: { ru: 'Условия задачи от заказчика', en: 'Project requirements from client' },
    topicLabel: { ru: 'Тема', en: 'Topic' },
    audienceLabel: { ru: 'Аудитория', en: 'Audience' },
    styleLabel: { ru: 'Стиль', en: 'Style' },
    lessonsRangeLabel: { ru: 'Уроков', en: 'Lessons' },
    descriptionLabel: { ru: 'Описание', en: 'Description' },

    // Card B: Knowledge Foundation
    knowledgeFoundation: { ru: 'Фундамент знаний', en: 'Knowledge Foundation' },
    knowledgeFoundationDesc: { ru: 'Отобранные материалы из Stage 3', en: 'Selected materials from Stage 3' },
    coreSource: { ru: 'Ядро курса', en: 'Core Source' },
    coreSourceHint: { ru: 'Главный документ, определяющий курс', en: 'Main document defining the course' },
    importantSources: { ru: 'Ключевые материалы', en: 'Key Materials' },
    supplementarySources: { ru: 'Дополнительные', en: 'Supporting' },
    moreFiles: { ru: 'ещё файлов', en: 'more files' },
    noDocumentsClassified: { ru: 'Нет классифицированных документов', en: 'No classified documents' },

    // Card C: Technical Constraints
    technicalConstraints: { ru: 'Технические параметры', en: 'Technical Parameters' },
    tokenBudget: { ru: 'Бюджет токенов', en: 'Token Budget' },
    modelUsed: { ru: 'Модель', en: 'Model' },

    // === PROCESS TAB ===
    // Pipeline header
    analysisPipeline: { ru: 'Конвейер анализа', en: 'Analysis Pipeline' },
    analysisPipelineDesc: { ru: 'Превращаем материалы в чертёж курса', en: 'Transforming materials into course blueprint' },

    // Phase names (7 phases)
    phaseAudit: { ru: 'Аудит данных', en: 'Data Audit' },
    phaseAuditDesc: { ru: 'Проверка целостности входных данных', en: 'Input data integrity check' },
    phaseClassify: { ru: 'Классификация', en: 'Classification' },
    phaseClassifyDesc: { ru: 'Определение домена и категории курса', en: 'Determining course domain and category' },
    phaseScoping: { ru: 'Планирование объёма', en: 'Scope Planning' },
    phaseScopingDesc: { ru: 'Расчёт оптимального количества уроков', en: 'Calculating optimal lesson count' },
    phaseStrategy: { ru: 'Педагогическая стратегия', en: 'Pedagogical Strategy' },
    phaseStrategyDesc: { ru: 'Выбор стиля обучения и методов', en: 'Selecting teaching style and methods' },
    phaseSynthesis: { ru: 'Синтез контента', en: 'Content Synthesis' },
    phaseSynthesisDesc: { ru: 'Извлечение ключевых концепций', en: 'Extracting key concepts' },
    phaseBlueprint: { ru: 'Сборка плана', en: 'Blueprint Assembly' },
    phaseBlueprintDesc: { ru: 'Формирование итогового результата', en: 'Assembling final result' },
    phaseMapping: { ru: 'RAG-планирование', en: 'RAG Mapping' },
    phaseMappingDesc: { ru: 'Связывание документов с модулями', en: 'Mapping documents to modules' },

    // Telemetry
    telemetry: { ru: 'Телеметрия', en: 'Telemetry' },
    processingTime: { ru: 'Время', en: 'Time' },
    tokensUsed: { ru: 'Токены', en: 'Tokens' },
    confidenceLevel: { ru: 'Уверенность', en: 'Confidence' },
    complexityLevel: { ru: 'Сложность', en: 'Complexity' },

    // Insight Terminal
    insightTerminal: { ru: 'Поток решений AI', en: 'AI Decision Stream' },
    insightDecision: { ru: 'Решение', en: 'Decision' },
    insightInfo: { ru: 'Информация', en: 'Info' },
    insightWarning: { ru: 'Предупреждение', en: 'Warning' },

    // === OUTPUT TAB ===
    // Hero card
    analysisHero: { ru: 'Результат анализа', en: 'Analysis Result' },
    categoryLabel: { ru: 'Категория', en: 'Category' },
    lessonsLabel: { ru: 'Уроков', en: 'Lessons' },
    modulesLabel: { ru: 'Модулей', en: 'Modules' },
    durationLabel: { ru: 'Длительность', en: 'Duration' },
    hoursShort: { ru: 'ч', en: 'h' },
    minutesShort: { ru: 'мин', en: 'min' },

    // Category names (for display)
    categoryProfessional: { ru: 'Профессиональный', en: 'Professional' },
    categoryPersonal: { ru: 'Личностный', en: 'Personal' },
    categoryCreative: { ru: 'Творческий', en: 'Creative' },
    categoryHobby: { ru: 'Хобби', en: 'Hobby' },
    categorySpiritual: { ru: 'Духовный', en: 'Spiritual' },
    categoryAcademic: { ru: 'Академический', en: 'Academic' },

    // Teaching styles
    styleHandsOn: { ru: 'Практико-ориентированный', en: 'Hands-on' },
    styleTheoryFirst: { ru: 'Теория сначала', en: 'Theory-first' },
    styleProjectBased: { ru: 'Проектный', en: 'Project-based' },
    styleMixed: { ru: 'Смешанный', en: 'Mixed' },

    // === ACTIVITY TAB ===
    decisionJournal: { ru: 'Журнал решений', en: 'Decision Journal' },
    phasePreparation: { ru: 'Подготовка', en: 'Preparation' },
    phaseClassificationGroup: { ru: 'Классификация', en: 'Classification' },
    phasePlanningGroup: { ru: 'Планирование', en: 'Planning' },
    phaseSynthesisGroup: { ru: 'Синтез', en: 'Synthesis' },
    phaseMappingGroup: { ru: 'Картирование', en: 'Mapping' },
    actorSystem: { ru: 'Система', en: 'System' },
    actorAI: { ru: 'AI', en: 'AI' },
    actorUser: { ru: 'Пользователь', en: 'User' },
    noEventsInPhase: { ru: 'Нет событий', en: 'No events' },

    // Synthetic insight messages (templates)
    insightDetectedTone: { ru: 'Обнаружен {tone} тон. Адаптирую стиль.', en: 'Detected {tone} tone. Adapting style.' },
    insightContentDensity: { ru: 'Высокая плотность контента. Увеличиваю количество уроков до {count}.', en: 'High content density. Increasing lesson count to {count}.' },
    insightCategorySelected: { ru: 'Определена категория: {category} (уверенность {confidence}%)', en: 'Category determined: {category} (confidence {confidence}%)' },
    insightStrategySelected: { ru: 'Выбрана стратегия: {strategy}', en: 'Strategy selected: {strategy}' },
    insightStructureRecommended: { ru: 'Рекомендована структура: {sections} модулей, {lessons} уроков', en: 'Recommended structure: {sections} modules, {lessons} lessons' },

    // Empty states
    emptyInput: { ru: 'Ожидание данных из Stage 3...', en: 'Waiting for Stage 3 data...' },
    emptyProcess: { ru: 'Анализ ещё не начат', en: 'Analysis not started yet' },
    emptyOutput: { ru: 'Результаты анализа появятся здесь', en: 'Analysis results will appear here' },
    emptyActivity: { ru: 'События ещё не записаны', en: 'No events recorded yet' },

    // Error states
    errorAnalysis: { ru: 'Ошибка анализа', en: 'Analysis Error' },
    retryAnalysis: { ru: 'Повторить анализ', en: 'Retry Analysis' },
  },
  stage5: {
    // Tab names
    inputTab: { ru: 'Чертёж', en: 'Blueprint' },
    processTab: { ru: 'Сборка', en: 'Assembly' },
    outputTab: { ru: 'Структура', en: 'Structure' },
    activityTab: { ru: 'Журнал', en: 'Journal' },

    // === INPUT TAB ===
    blueprintReview: { ru: 'Ревизия чертежа', en: 'Blueprint Review' },
    blueprintReviewDesc: { ru: 'Исходные данные из Stage 4', en: 'Source data from Stage 4' },

    // Analysis summary
    analysisCategory: { ru: 'Категория', en: 'Category' },
    analysisConfidence: { ru: 'Уверенность', en: 'Confidence' },
    analysisLessons: { ru: 'Уроков', en: 'Lessons' },
    analysisComplexity: { ru: 'Сложность', en: 'Complexity' },
    analysisStyle: { ru: 'Стиль обучения', en: 'Teaching Style' },

    // Frontend parameters
    frontendParams: { ru: 'Параметры курса', en: 'Course Parameters' },
    courseTitle: { ru: 'Название курса', en: 'Course Title' },
    courseLanguage: { ru: 'Язык', en: 'Language' },
    userInstructions: { ru: 'Инструкции', en: 'Instructions' },

    // Model info
    modelInfo: { ru: 'Модель', en: 'Model' },
    modelTier: { ru: 'AI Модель', en: 'AI Model' },

    // === PROCESS TAB ===
    forgePipeline: { ru: 'Конвейер сборки', en: 'Assembly Pipeline' },
    forgePipelineDesc: { ru: 'Превращаем чертёж в структуру курса', en: 'Transforming blueprint into course structure' },

    // Phase names (5 phases)
    phaseValidateInput: { ru: 'Валидация входных данных', en: 'Input Validation' },
    phaseValidateInputDesc: { ru: 'Проверка схемы данных', en: 'Schema validation' },
    phaseGenerateMetadata: { ru: 'Генерация метаданных', en: 'Metadata Generation' },
    phaseGenerateMetadataDesc: { ru: 'Название, описание, цели обучения', en: 'Title, description, learning outcomes' },
    phaseGenerateSections: { ru: 'Генерация секций', en: 'Section Generation' },
    phaseGenerateSectionsDesc: { ru: 'Модули и уроки (параллельно)', en: 'Modules and lessons (parallel)' },
    phaseValidateQuality: { ru: 'Проверка качества', en: 'Quality Validation' },
    phaseValidateQualityDesc: { ru: 'Семантическое сходство', en: 'Semantic similarity check' },
    phaseValidateLessons: { ru: 'Проверка уроков', en: 'Lesson Validation' },
    phaseValidateLessonsDesc: { ru: 'Минимум 10 уроков', en: 'Minimum 10 lessons' },

    // Batch progress
    batchProgress: { ru: 'Прогресс генерации', en: 'Generation Progress' },
    batchOf: { ru: 'Батч {current} из {total}', en: 'Batch {current} of {total}' },
    sectionsGenerated: { ru: 'Секций сгенерировано', en: 'Sections generated' },
    parallelProcessing: { ru: 'Параллельная обработка', en: 'Parallel processing' },

    // Telemetry
    telemetry: { ru: 'Телеметрия', en: 'Telemetry' },
    processingTime: { ru: 'Время', en: 'Time' },
    tokensUsed: { ru: 'Токены', en: 'Tokens' },
    costLabel: { ru: 'Стоимость', en: 'Cost' },
    qualityScore: { ru: 'Качество', en: 'Quality' },
    sectionsCount: { ru: 'Секций', en: 'Sections' },
    lessonsCount: { ru: 'Уроков', en: 'Lessons' },

    // === OUTPUT TAB ===
    structurePreview: { ru: 'Структура курса', en: 'Course Structure' },
    structurePreviewDesc: { ru: 'Сгенерированные модули и уроки', en: 'Generated modules and lessons' },
    structureDesc: { ru: 'Модули и уроки', en: 'Modules and lessons' },

    // Difficulty levels (for OutputTab)
    beginner: { ru: 'Начальный', en: 'Beginner' },
    intermediate: { ru: 'Средний', en: 'Intermediate' },
    advanced: { ru: 'Продвинутый', en: 'Advanced' },

    // Metadata card
    metadataCard: { ru: 'Метаданные курса', en: 'Course Metadata' },
    learningOutcomes: { ru: 'Цели обучения', en: 'Learning Outcomes' },
    prerequisites: { ru: 'Предварительные знания', en: 'Prerequisites' },
    difficulty: { ru: 'Сложность', en: 'Difficulty' },
    duration: { ru: 'Длительность', en: 'Duration' },
    tags: { ru: 'Теги', en: 'Tags' },

    // Structure tree
    sectionLabel: { ru: 'Модуль', en: 'Module' },
    lessonLabel: { ru: 'Урок', en: 'Lesson' },
    lessonsInSection: { ru: 'уроков в модуле', en: 'lessons in module' },
    totalDuration: { ru: 'Общая длительность', en: 'Total duration' },
    hoursShort: { ru: 'ч', en: 'h' },
    minutesShort: { ru: 'мин', en: 'min' },

    // Lesson types
    lessonTypeTheory: { ru: 'Теория', en: 'Theory' },
    lessonTypePractice: { ru: 'Практика', en: 'Practice' },
    lessonTypeQuiz: { ru: 'Тест', en: 'Quiz' },
    lessonTypeProject: { ru: 'Проект', en: 'Project' },

    // === ACTIVITY TAB ===
    assemblyJournal: { ru: 'Журнал сборки', en: 'Assembly Journal' },
    phaseValidation: { ru: 'Валидация', en: 'Validation' },
    phaseMetadata: { ru: 'Метаданные', en: 'Metadata' },
    phaseSections: { ru: 'Секции', en: 'Sections' },
    phaseQuality: { ru: 'Качество', en: 'Quality' },
    phaseFinalization: { ru: 'Финализация', en: 'Finalization' },

    // Synthetic insight messages
    insightValidationPassed: { ru: 'Валидация пройдена', en: 'Validation passed' },
    insightMetadataGenerated: { ru: 'Метаданные сгенерированы: {outcomes} целей обучения', en: 'Metadata generated: {outcomes} learning outcomes' },
    insightBatchStarted: { ru: 'Запущен батч {batch}: {sections} секций', en: 'Batch {batch} started: {sections} sections' },
    insightBatchCompleted: { ru: 'Батч {batch} завершён за {time}с', en: 'Batch {batch} completed in {time}s' },
    insightQualityScore: { ru: 'Оценка качества: {score}% (порог: {threshold}%)', en: 'Quality score: {score}% (threshold: {threshold}%)' },
    insightLessonsValidated: { ru: 'Проверено {count} уроков (минимум: {min})', en: 'Validated {count} lessons (minimum: {min})' },

    // Empty states
    emptyInput: { ru: 'Ожидание данных из Stage 4...', en: 'Waiting for Stage 4 data...' },
    emptyProcess: { ru: 'Генерация ещё не начата', en: 'Generation not started yet' },
    emptyOutput: { ru: 'Структура курса появится здесь', en: 'Course structure will appear here' },
    emptyActivity: { ru: 'События ещё не записаны', en: 'No events recorded yet' },

    // Error states
    errorGeneration: { ru: 'Ошибка генерации', en: 'Generation Error' },
    retryGeneration: { ru: 'Повторить генерацию', en: 'Retry Generation' },
  },
  // === STAGE 7: ENRICHMENTS ===
  enrichments: {
    types: {
      video: { ru: 'Видео', en: 'Video' },
      audio: { ru: 'Аудио', en: 'Audio' },
      presentation: { ru: 'Презентация', en: 'Presentation' },
      quiz: { ru: 'Тест', en: 'Quiz' },
      document: { ru: 'Документ', en: 'Document' },
    },
    status: {
      pending: { ru: 'В очереди', en: 'Pending' },
      draft_generating: { ru: 'Черновик...', en: 'Draft...' },
      draft_ready: { ru: 'Черновик готов', en: 'Draft Ready' },
      generating: { ru: 'Генерация...', en: 'Generating...' },
      completed: { ru: 'Готово', en: 'Completed' },
      failed: { ru: 'Ошибка', en: 'Failed' },
      cancelled: { ru: 'Отменено', en: 'Cancelled' },
    },
    actions: {
      add: { ru: 'Добавить', en: 'Add' },
      delete: { ru: 'Удалить', en: 'Delete' },
      regenerate: { ru: 'Перегенерировать', en: 'Regenerate' },
      approve: { ru: 'Одобрить', en: 'Approve' },
      preview: { ru: 'Просмотр', en: 'Preview' },
    },
    assetDock: {
      title: { ru: 'Дополнения', en: 'Enrichments' },
      empty: { ru: 'Нет дополнений', en: 'No enrichments' },
      generating: { ru: 'генерируется', en: 'generating' },
      error: { ru: 'с ошибкой', en: 'with error' },
    },
  },

  stage6: {
    // === CONTROL TOWER ===
    controlTower: {
      title: { ru: 'Модуль', en: 'Module' },
      tokensUsed: { ru: 'Токены', en: 'Tokens' },
      costUsed: { ru: 'Стоимость', en: 'Cost' },
      avgQuality: { ru: 'Качество', en: 'Quality' },
      quality: { ru: 'Качество', en: 'Quality' },
      time: { ru: 'Время', en: 'Time' },
      timeElapsed: { ru: 'Время', en: 'Time' },
      ready: { ru: 'готово', en: 'ready' },
      lessonsReady: { ru: 'Готово', en: 'Ready' },
      remaining: { ru: 'осталось', en: 'left' },
      improvement: { ru: '+3%', en: '+3%' },
      regenerateAll: { ru: 'Перегенерировать всё', en: 'Regenerate All' },
      exportAll: { ru: 'Экспорт', en: 'Export' },
    },

    // === LESSON CARD ===
    lessonCard: {
      stepProgress: { ru: 'Шаг', en: 'Step' },
      tokens: { ru: 'Т', en: 'T' },
    },

    // === INSPECTOR TABS ===
    tabs: {
      preview: { ru: 'Просмотр', en: 'Preview' },
      quality: { ru: 'Качество', en: 'Quality' },
      blueprint: { ru: 'Спецификация', en: 'Blueprint' },
      trace: { ru: 'Трейс', en: 'Trace' },
    },

    // === STATS STRIP ===
    statsStrip: {
      tokens: { ru: 'Токены', en: 'Tokens' },
      time: { ru: 'Время', en: 'Time' },
      quality: { ru: 'Качество', en: 'Quality' },
      tier: { ru: 'Модель', en: 'Model' },
    },

    // === PIPELINE NODES ===
    // New 3-node pipeline: generator, selfReviewer, judge
    // Legacy nodes kept for backward compatibility with old logs
    nodes: {
      generator: { ru: 'Генератор', en: 'Generator' },
      selfReviewer: { ru: 'Самопроверка', en: 'Self-Review' },
      judge: { ru: 'Арбитр', en: 'Judge' },
      // Legacy nodes for backward compatibility
      planner: { ru: 'Планировщик', en: 'Planner' },
      expander: { ru: 'Расширитель', en: 'Expander' },
      assembler: { ru: 'Сборщик', en: 'Assembler' },
      smoother: { ru: 'Шлифовщик', en: 'Smoother' },
    },

    // === QUALITY TAB - GATE 1 (SELF-REVIEW) ===
    selfReview: {
      gateTitle: { ru: 'Автокоррекция', en: 'Auto-Correction' },
      passed: { ru: 'Проверка пройдена', en: 'Review Passed' },
      noIssues: { ru: 'Проблем не найдено', en: 'No issues found' },
      fixed: { ru: 'Исправлено автоматически', en: 'Auto-Fixed' },
      issuesFixed: { ru: 'исправлено', en: 'issues corrected' },
      viewDiff: { ru: 'Показать изменения', en: 'View Changes' },
      flagged: { ru: 'Требует внимания', en: 'Needs Review' },
      regenerate: { ru: 'Требуется перегенерация', en: 'Regeneration Required' },
    },

    // === QUALITY TAB - GATE 2 (JUDGE) ===
    judge: {
      gateTitle: { ru: 'Финальная оценка', en: 'Final Assessment' },
      depth: { ru: 'Глубина', en: 'Depth' },
      clarity: { ru: 'Ясность', en: 'Clarity' },
      style: { ru: 'Стиль', en: 'Style' },
      critique: { ru: 'Комментарий', en: 'Critique' },
    },

    // === BLUEPRINT TAB ===
    blueprint: {
      learningObjectives: { ru: 'Цели обучения', en: 'Learning Objectives' },
      prerequisites: { ru: 'Пререквизиты', en: 'Prerequisites' },
      targetAudience: { ru: 'Целевая аудитория', en: 'Target Audience' },
      estimatedDuration: { ru: 'Длительность', en: 'Duration' },
      lessonType: { ru: 'Тип урока', en: 'Lesson Type' },
    },

    // === ACTIONS ===
    actions: {
      approve: { ru: 'Одобрить', en: 'Approve' },
      approving: { ru: 'Одобрение...', en: 'Approving...' },
      regenerate: { ru: 'Пересоздать', en: 'Regenerate' },
      regenerating: { ru: 'Пересоздание...', en: 'Regenerating...' },
      edit: { ru: 'Редактировать', en: 'Edit' },
    },

    // === STATUS ===
    status: {
      completed: { ru: 'готово', en: 'completed' },
      active: { ru: 'в работе', en: 'active' },
      pending: { ru: 'ожидает', en: 'pending' },
      failed: { ru: 'ошибка', en: 'failed' },
    },
  },
};