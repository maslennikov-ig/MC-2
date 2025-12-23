import { GraphTranslations } from '@megacampus/shared-types';

// Extended with analysisResult section for Stage 4 UI Redesign and courseStructure for Stage 5
export const GRAPH_TRANSLATIONS: GraphTranslations & {
  analysisResult?: Record<string, { ru: string; en: string }>;
  courseStructure?: Record<string, { ru: string; en: string }>;
  restart?: Record<string, { ru: string; en: string }>;
  stage1?: Record<string, { ru: string; en: string }>;
  stage2?: Record<string, { ru: string; en: string }>;
  stageDescriptions?: Record<string, { ru: string; en: string }>;
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
    priorityCore: { ru: 'Основной', en: 'Core' },
    priorityImportant: { ru: 'Важный', en: 'Important' },
    prioritySupplementary: { ru: 'Доп.', en: 'Supplementary' },

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
};