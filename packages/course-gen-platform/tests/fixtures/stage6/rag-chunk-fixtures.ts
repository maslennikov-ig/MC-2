/**
 * Stage 6 RAG Chunk Test Fixtures
 *
 * Mock RAGChunk arrays for E2E testing of lesson content generation.
 * Contains realistic educational content in Russian for authentic testing.
 *
 * @module tests/fixtures/stage6/rag-chunk-fixtures
 */

import type { RAGChunk } from '@megacampus/shared-types/lesson-content';
import { TEST_DOCUMENT_IDS } from './lesson-spec-fixtures';

// ============================================================================
// Data Analysis RAG Chunks (for ANALYTICAL lesson)
// ============================================================================

/**
 * RAG chunks for pandas data analysis lesson
 */
export const DATA_ANALYSIS_CHUNKS: RAGChunk[] = [
  {
    chunk_id: 'chunk-da-001',
    document_id: TEST_DOCUMENT_IDS.dataAnalysis,
    document_name: 'pandas_fundamentals.pdf',
    content:
      'DataFrame - это двумерная структура данных с размеченными осями (строками и столбцами). ' +
      'Он похож на электронную таблицу или SQL-таблицу. DataFrame может содержать данные ' +
      'различных типов: числа, строки, даты. Каждый столбец представляет собой Series. ' +
      'Индекс строк позволяет быстро находить и извлекать данные.',
    page_or_section: 'Глава 2.1',
    relevance_score: 0.92,
    metadata: {
      embedding_model: 'jina-embeddings-v3',
      chunk_size: 512,
      overlap: 50,
    },
  },
  {
    chunk_id: 'chunk-da-002',
    document_id: TEST_DOCUMENT_IDS.dataAnalysis,
    document_name: 'pandas_fundamentals.pdf',
    content:
      'Series - это одномерный массив с метками (индексами). Можно представить как ' +
      'один столбец DataFrame. Series поддерживает векторные операции и автоматическое ' +
      'выравнивание данных по индексу. Создать Series можно из списка, словаря или массива NumPy.',
    page_or_section: 'Глава 2.2',
    relevance_score: 0.89,
    metadata: {
      embedding_model: 'jina-embeddings-v3',
      chunk_size: 512,
      overlap: 50,
    },
  },
  {
    chunk_id: 'chunk-da-003',
    document_id: TEST_DOCUMENT_IDS.dataAnalysis,
    document_name: 'pandas_filtering.pdf',
    content:
      'Метод loc используется для выборки данных по меткам. Синтаксис: df.loc[строки, столбцы]. ' +
      'Можно использовать одиночные метки, списки меток или срезы. Метод iloc работает ' +
      'аналогично, но использует целочисленные позиции вместо меток. Это важно понимать ' +
      'при работе с индексами, отличными от целых чисел.',
    page_or_section: 'Глава 3.1',
    relevance_score: 0.95,
    metadata: {
      embedding_model: 'jina-embeddings-v3',
      chunk_size: 512,
      overlap: 50,
    },
  },
  {
    chunk_id: 'chunk-da-004',
    document_id: TEST_DOCUMENT_IDS.dataAnalysis,
    document_name: 'pandas_filtering.pdf',
    content:
      'Boolean indexing позволяет фильтровать данные с помощью логических условий. ' +
      'Выражение df[df["column"] > value] возвращает строки, где условие истинно. ' +
      'Можно комбинировать условия с помощью операторов & (и), | (или), ~ (не). ' +
      'Важно заключать каждое условие в скобки при комбинировании.',
    page_or_section: 'Глава 3.2',
    relevance_score: 0.93,
    metadata: {
      embedding_model: 'jina-embeddings-v3',
      chunk_size: 512,
      overlap: 50,
    },
  },
  {
    chunk_id: 'chunk-da-005',
    document_id: TEST_DOCUMENT_IDS.dataAnalysis,
    document_name: 'pandas_aggregation.pdf',
    content:
      'Операция groupby разбивает данные на группы по значениям указанного столбца. ' +
      'После группировки можно применить агрегирующие функции: sum(), mean(), count(), ' +
      'max(), min(), std(). Метод agg() позволяет применить несколько функций одновременно ' +
      'или разные функции к разным столбцам.',
    page_or_section: 'Глава 4.1',
    relevance_score: 0.91,
    metadata: {
      embedding_model: 'jina-embeddings-v3',
      chunk_size: 512,
      overlap: 50,
    },
  },
];

// ============================================================================
// Python Basics RAG Chunks (for PROCEDURAL lesson)
// ============================================================================

/**
 * RAG chunks for FastAPI tutorial lesson
 */
export const PYTHON_BASICS_CHUNKS: RAGChunk[] = [
  {
    chunk_id: 'chunk-py-001',
    document_id: TEST_DOCUMENT_IDS.pythonBasics,
    document_name: 'fastapi_quickstart.pdf',
    content:
      'FastAPI - современный веб-фреймворк для создания API на Python. Основные преимущества: ' +
      'автоматическая валидация данных, генерация OpenAPI документации, высокая производительность. ' +
      'Установка: pip install fastapi uvicorn. Uvicorn - ASGI сервер для запуска приложения.',
    page_or_section: 'Введение',
    relevance_score: 0.94,
    metadata: {
      embedding_model: 'jina-embeddings-v3',
      chunk_size: 512,
      overlap: 50,
    },
  },
  {
    chunk_id: 'chunk-py-002',
    document_id: TEST_DOCUMENT_IDS.pythonBasics,
    document_name: 'fastapi_quickstart.pdf',
    content:
      'Создание первого эндпоинта: используйте декоратор @app.get("/") для GET-запросов. ' +
      'Функция-обработчик может быть async или обычной. Path параметры объявляются в пути: ' +
      '@app.get("/items/{item_id}"). Query параметры - как аргументы функции с значениями по умолчанию.',
    page_or_section: 'Глава 1.1',
    relevance_score: 0.96,
    metadata: {
      embedding_model: 'jina-embeddings-v3',
      chunk_size: 512,
      overlap: 50,
    },
  },
  {
    chunk_id: 'chunk-py-003',
    document_id: TEST_DOCUMENT_IDS.pythonBasics,
    document_name: 'pydantic_validation.pdf',
    content:
      'Pydantic используется для валидации данных через Python type hints. Создайте класс, ' +
      'наследующий BaseModel, и определите поля с типами. При создании экземпляра данные ' +
      'автоматически валидируются и преобразуются. Ошибки валидации возвращают детальные сообщения.',
    page_or_section: 'Глава 2.1',
    relevance_score: 0.93,
    metadata: {
      embedding_model: 'jina-embeddings-v3',
      chunk_size: 512,
      overlap: 50,
    },
  },
  {
    chunk_id: 'chunk-py-004',
    document_id: TEST_DOCUMENT_IDS.pythonBasics,
    document_name: 'pydantic_validation.pdf',
    content:
      'Field() позволяет добавить ограничения и метаданные к полям модели: минимальное/максимальное ' +
      'значение, regex паттерн, описание для документации. Декоратор @validator создаёт ' +
      'кастомные валидаторы для сложной логики проверки.',
    page_or_section: 'Глава 2.2',
    relevance_score: 0.88,
    metadata: {
      embedding_model: 'jina-embeddings-v3',
      chunk_size: 512,
      overlap: 50,
    },
  },
];

// ============================================================================
// Machine Learning Theory RAG Chunks (for CONCEPTUAL lesson)
// ============================================================================

/**
 * RAG chunks for ML theory lesson
 */
export const ML_THEORY_CHUNKS: RAGChunk[] = [
  {
    chunk_id: 'chunk-ml-001',
    document_id: TEST_DOCUMENT_IDS.mlTheory,
    document_name: 'ml_fundamentals.pdf',
    content:
      'Supervised Learning (обучение с учителем) - парадигма машинного обучения, где модель ' +
      'обучается на размеченных данных. Каждый пример в обучающем наборе содержит входные ' +
      'признаки и правильный ответ (метку). Модель учится предсказывать метки для новых данных.',
    page_or_section: 'Глава 1.1',
    relevance_score: 0.95,
    metadata: {
      embedding_model: 'jina-embeddings-v3',
      chunk_size: 512,
      overlap: 50,
    },
  },
  {
    chunk_id: 'chunk-ml-002',
    document_id: TEST_DOCUMENT_IDS.mlTheory,
    document_name: 'ml_fundamentals.pdf',
    content:
      'Задачи supervised learning делятся на классификацию и регрессию. Классификация - ' +
      'предсказание дискретной категории (спам/не спам, тип животного). Регрессия - ' +
      'предсказание непрерывного значения (цена квартиры, температура завтра).',
    page_or_section: 'Глава 1.2',
    relevance_score: 0.92,
    metadata: {
      embedding_model: 'jina-embeddings-v3',
      chunk_size: 512,
      overlap: 50,
    },
  },
  {
    chunk_id: 'chunk-ml-003',
    document_id: TEST_DOCUMENT_IDS.mlTheory,
    document_name: 'ml_fundamentals.pdf',
    content:
      'Unsupervised Learning (обучение без учителя) работает с неразмеченными данными. ' +
      'Алгоритм самостоятельно находит структуры и паттерны. Основные задачи: кластеризация ' +
      '(группировка похожих объектов), снижение размерности, обнаружение аномалий.',
    page_or_section: 'Глава 2.1',
    relevance_score: 0.94,
    metadata: {
      embedding_model: 'jina-embeddings-v3',
      chunk_size: 512,
      overlap: 50,
    },
  },
  {
    chunk_id: 'chunk-ml-004',
    document_id: TEST_DOCUMENT_IDS.mlTheory,
    document_name: 'ml_fundamentals.pdf',
    content:
      'Кластеризация группирует данные по сходству без заранее известных категорий. ' +
      'K-means - один из популярных алгоритмов. Применение: сегментация клиентов, ' +
      'группировка документов, анализ социальных сетей. Важно выбрать правильное число кластеров.',
    page_or_section: 'Глава 2.2',
    relevance_score: 0.89,
    metadata: {
      embedding_model: 'jina-embeddings-v3',
      chunk_size: 512,
      overlap: 50,
    },
  },
  {
    chunk_id: 'chunk-ml-005',
    document_id: TEST_DOCUMENT_IDS.mlTheory,
    document_name: 'ml_decision_guide.pdf',
    content:
      'Выбор между supervised и unsupervised зависит от наличия размеченных данных и цели задачи. ' +
      'Если есть исторические данные с известными результатами - supervised. Если нужно ' +
      'исследовать данные и найти скрытые паттерны - unsupervised. Semi-supervised использует ' +
      'небольшое количество размеченных данных с большим объёмом неразмеченных.',
    page_or_section: 'Глава 3.1',
    relevance_score: 0.91,
    metadata: {
      embedding_model: 'jina-embeddings-v3',
      chunk_size: 512,
      overlap: 50,
    },
  },
];

// ============================================================================
// Design Thinking RAG Chunks (for CREATIVE lesson)
// ============================================================================

/**
 * RAG chunks for design thinking lesson
 */
export const DESIGN_THINKING_CHUNKS: RAGChunk[] = [
  {
    chunk_id: 'chunk-dt-001',
    document_id: TEST_DOCUMENT_IDS.designThinking,
    document_name: 'design_thinking_guide.pdf',
    content:
      'Design Thinking - человекоцентричный подход к инновациям. Пять этапов: Эмпатия ' +
      '(понимание пользователя), Определение (формулировка проблемы), Генерация идей, ' +
      'Прототипирование, Тестирование. Процесс итеративный - можно возвращаться к предыдущим этапам.',
    page_or_section: 'Введение',
    relevance_score: 0.95,
    metadata: {
      embedding_model: 'jina-embeddings-v3',
      chunk_size: 512,
      overlap: 50,
    },
  },
  {
    chunk_id: 'chunk-dt-002',
    document_id: TEST_DOCUMENT_IDS.designThinking,
    document_name: 'design_thinking_guide.pdf',
    content:
      'Этап эмпатии включает наблюдение за пользователями, интервью, погружение в их контекст. ' +
      'Цель - понять не только что люди говорят, но и что делают, думают, чувствуют. ' +
      'Карта эмпатии визуализирует эти четыре аспекта для формирования глубокого понимания.',
    page_or_section: 'Глава 1.1',
    relevance_score: 0.93,
    metadata: {
      embedding_model: 'jina-embeddings-v3',
      chunk_size: 512,
      overlap: 50,
    },
  },
  {
    chunk_id: 'chunk-dt-003',
    document_id: TEST_DOCUMENT_IDS.designThinking,
    document_name: 'design_thinking_guide.pdf',
    content:
      'Point of View (POV) формулирует проблему с точки зрения пользователя. Формат: ' +
      '[Пользователь] нуждается в [потребность], потому что [инсайт]. How Might We (HMW) - ' +
      'техника переформулирования проблемы в форме вопроса для стимуляции креативности.',
    page_or_section: 'Глава 2.1',
    relevance_score: 0.90,
    metadata: {
      embedding_model: 'jina-embeddings-v3',
      chunk_size: 512,
      overlap: 50,
    },
  },
  {
    chunk_id: 'chunk-dt-004',
    document_id: TEST_DOCUMENT_IDS.designThinking,
    document_name: 'prototyping_methods.pdf',
    content:
      'Low-fidelity прототипы создаются быстро и дёшево: бумажные макеты, картонные модели, ' +
      'простые скетчи. Цель - быстро получить обратную связь и итерировать. Принцип ' +
      '"fail fast, learn fast" - лучше обнаружить проблемы на раннем этапе.',
    page_or_section: 'Глава 3.1',
    relevance_score: 0.88,
    metadata: {
      embedding_model: 'jina-embeddings-v3',
      chunk_size: 512,
      overlap: 50,
    },
  },
];

// ============================================================================
// Case Studies RAG Chunks (for multiple lessons)
// ============================================================================

/**
 * RAG chunks with case studies and examples
 */
export const CASE_STUDY_CHUNKS: RAGChunk[] = [
  {
    chunk_id: 'chunk-cs-001',
    document_id: TEST_DOCUMENT_IDS.caseStudies,
    document_name: 'business_cases.pdf',
    content:
      'Кейс Netflix: компания использует supervised learning для персонализации рекомендаций. ' +
      'Модель обучается на истории просмотров и рейтингов пользователей. Результат - ' +
      '80% контента смотрят по рекомендациям. Экономия на привлечении новых подписчиков.',
    page_or_section: 'Кейс 1',
    relevance_score: 0.87,
    metadata: {
      embedding_model: 'jina-embeddings-v3',
      chunk_size: 512,
      overlap: 50,
    },
  },
  {
    chunk_id: 'chunk-cs-002',
    document_id: TEST_DOCUMENT_IDS.caseStudies,
    document_name: 'business_cases.pdf',
    content:
      'Кейс Airbnb: Design Thinking помог переосмыслить пользовательский опыт. Основатели ' +
      'лично посетили хозяев квартир, провели интервью, поняли болевые точки. Результат - ' +
      'профессиональная фотосъёмка жилья, что увеличило бронирования в 2.5 раза.',
    page_or_section: 'Кейс 2',
    relevance_score: 0.85,
    metadata: {
      embedding_model: 'jina-embeddings-v3',
      chunk_size: 512,
      overlap: 50,
    },
  },
  {
    chunk_id: 'chunk-cs-003',
    document_id: TEST_DOCUMENT_IDS.caseStudies,
    document_name: 'gdpr_compliance.pdf',
    content:
      'GDPR определяет шесть принципов обработки персональных данных: законность, ' +
      'справедливость и прозрачность; ограничение целью; минимизация данных; точность; ' +
      'ограничение хранения; целостность и конфиденциальность. Нарушение влечёт штраф ' +
      'до 4% годового оборота или 20 млн евро.',
    page_or_section: 'Раздел 1.1',
    relevance_score: 0.94,
    metadata: {
      embedding_model: 'jina-embeddings-v3',
      chunk_size: 512,
      overlap: 50,
    },
  },
  {
    chunk_id: 'chunk-cs-004',
    document_id: TEST_DOCUMENT_IDS.caseStudies,
    document_name: 'gdpr_compliance.pdf',
    content:
      'Согласие по GDPR должно быть: свободным (без принуждения), конкретным (для определённой ' +
      'цели), информированным (субъект понимает, на что соглашается), однозначным ' +
      '(активное действие, а не молчание). Отзыв согласия должен быть таким же простым, как его предоставление.',
    page_or_section: 'Раздел 2.1',
    relevance_score: 0.92,
    metadata: {
      embedding_model: 'jina-embeddings-v3',
      chunk_size: 512,
      overlap: 50,
    },
  },
];

// ============================================================================
// Combined Chunks by Lesson
// ============================================================================

/**
 * All chunks organized by lesson ID for easy test access
 */
export const RAG_CHUNKS_BY_LESSON: Record<string, RAGChunk[]> = {
  '1.1': [...DATA_ANALYSIS_CHUNKS],
  '2.1': [...PYTHON_BASICS_CHUNKS],
  '3.1': [...ML_THEORY_CHUNKS, CASE_STUDY_CHUNKS[0]],
  '4.1': [...DESIGN_THINKING_CHUNKS, CASE_STUDY_CHUNKS[1]],
  '5.1': [CASE_STUDY_CHUNKS[2], CASE_STUDY_CHUNKS[3]],
};

/**
 * All RAG chunks combined for general testing
 */
export const ALL_RAG_CHUNKS: RAGChunk[] = [
  ...DATA_ANALYSIS_CHUNKS,
  ...PYTHON_BASICS_CHUNKS,
  ...ML_THEORY_CHUNKS,
  ...DESIGN_THINKING_CHUNKS,
  ...CASE_STUDY_CHUNKS,
];
