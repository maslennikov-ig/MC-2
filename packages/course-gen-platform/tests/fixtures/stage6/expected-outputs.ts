/**
 * Stage 6 Expected Output Test Fixtures
 *
 * Expected LessonContent outputs for E2E testing validation.
 * Each fixture matches a corresponding lesson specification.
 *
 * @module tests/fixtures/stage6/expected-outputs
 */

import type {
  LessonContent,
  LessonContentBody,
  LessonContentMetadata,
  ContentSection,
  ContentExample,
  ContentExercise,
} from '@megacampus/shared-types/lesson-content';
import { TEST_COURSE_ID } from './lesson-spec-fixtures';

// ============================================================================
// Helper function for generating UUIDs for lessons
// ============================================================================

/**
 * Generate deterministic lesson UUID from lesson_id
 */
function generateLessonUUID(lessonId: string): string {
  // Convert lesson_id like "1.1" to UUID format
  const [section, lesson] = lessonId.split('.').map(Number);
  const paddedSection = section.toString().padStart(4, '0');
  const paddedLesson = lesson.toString().padStart(4, '0');
  return `00000000-0000-0000-${paddedSection}-${paddedLesson}00000000`;
}

// ============================================================================
// Expected Output: ANALYTICAL Lesson (Data Analysis with pandas)
// ============================================================================

/**
 * Expected content body for analytical lesson
 */
export const ANALYTICAL_EXPECTED_BODY: LessonContentBody = {
  intro:
    'По статистике, 80% времени аналитика данных уходит на подготовку и очистку данных. ' +
    'Библиотека pandas делает эту работу значительно эффективнее, предоставляя мощные ' +
    'инструменты для работы с табличными данными. В этом уроке мы освоим основные ' +
    'структуры данных pandas - Series и DataFrame, научимся фильтровать и агрегировать данные, ' +
    'а также выявлять аномалии в наборах данных.',
  sections: [
    {
      title: 'Структуры данных pandas',
      content:
        '## Series и DataFrame: два столпа pandas\n\n' +
        'Библиотека pandas предоставляет две основные структуры данных:\n\n' +
        '**Series** - одномерный массив с индексами. Представьте его как один столбец ' +
        'таблицы Excel с подписанными строками. Series может содержать данные любого типа: ' +
        'числа, строки, даты.\n\n' +
        '**DataFrame** - двумерная структура, похожая на таблицу. Каждый столбец DataFrame ' +
        'является объектом Series. Индекс строк позволяет быстро находить и извлекать данные.\n\n' +
        '### Создание DataFrame\n\n' +
        'DataFrame можно создать из различных источников:\n' +
        '- Словаря Python\n' +
        '- Списка списков\n' +
        '- CSV-файла\n' +
        '- SQL-запроса\n\n' +
        '```python\nimport pandas as pd\n\n' +
        '# Из словаря\n' +
        "df = pd.DataFrame({'name': ['Alice', 'Bob'], 'age': [25, 30]})\n\n" +
        '# Из CSV\n' +
        "df = pd.read_csv('data.csv')\n```",
      citations: [
        { document: 'pandas_fundamentals.pdf', page_or_section: 'Глава 2.1' },
        { document: 'pandas_fundamentals.pdf', page_or_section: 'Глава 2.2' },
      ],
    },
    {
      title: 'Фильтрация и выборка данных',
      content:
        '## loc, iloc и Boolean indexing\n\n' +
        'Pandas предоставляет несколько способов выборки данных. Представьте DataFrame ' +
        'как таблицу Excel с суперспособностями.\n\n' +
        '### Метод loc\n' +
        'Используется для выборки по меткам:\n\n' +
        "```python\n# Выбрать строку с индексом 'a'\n" +
        "df.loc['a']\n\n" +
        '# Выбрать несколько строк и столбцов\n' +
        "df.loc[['a', 'b'], ['name', 'age']]\n```\n\n" +
        '### Метод iloc\n' +
        'Работает с целочисленными позициями:\n\n' +
        '```python\n# Первая строка\n' +
        'df.iloc[0]\n\n' +
        '# Первые 3 строки, столбцы 0 и 1\n' +
        'df.iloc[:3, [0, 1]]\n```\n\n' +
        '### Boolean indexing\n' +
        'Позволяет фильтровать по условиям:\n\n' +
        "```python\n# Строки где age > 25\n" +
        "df[df['age'] > 25]\n\n" +
        '# Комбинация условий (используйте & и |)\n' +
        "df[(df['age'] > 25) & (df['city'] == 'Moscow')]\n```\n\n" +
        '### Метод query\n' +
        'Более читаемый синтаксис для сложных условий:\n\n' +
        '```python\n' +
        "df.query('age > 25 and city == \"Moscow\"')\n```",
      citations: [
        { document: 'pandas_filtering.pdf', page_or_section: 'Глава 3.1' },
        { document: 'pandas_filtering.pdf', page_or_section: 'Глава 3.2' },
      ],
    },
    {
      title: 'Агрегация и группировка',
      content:
        '## Операция groupby\n\n' +
        'Groupby разбивает данные на группы и позволяет применять агрегирующие функции ' +
        'к каждой группе.\n\n' +
        '### Базовое использование\n\n' +
        '```python\n# Средняя зарплата по отделам\n' +
        "df.groupby('department')['salary'].mean()\n\n" +
        '# Несколько агрегаций\n' +
        "df.groupby('department')['salary'].agg(['mean', 'sum', 'count'])\n```\n\n" +
        '### Метод agg для гибкой агрегации\n\n' +
        '```python\n# Разные функции для разных столбцов\n' +
        "df.groupby('department').agg({\n" +
        "    'salary': 'mean',\n" +
        "    'age': ['min', 'max'],\n" +
        "    'name': 'count'\n})\n```\n\n" +
        '### Сводные таблицы с pivot_table\n\n' +
        '```python\n' +
        'pd.pivot_table(df,\n' +
        "    values='sales',\n" +
        "    index='region',\n" +
        "    columns='product',\n" +
        "    aggfunc='sum')\n```",
      citations: [{ document: 'pandas_aggregation.pdf', page_or_section: 'Глава 4.1' }],
    },
  ],
  examples: [
    {
      title: 'Анализ данных о продажах',
      content:
        'Рассмотрим типичный сценарий анализа данных о продажах магазина за год.',
      code:
        "import pandas as pd\n\n" +
        "# Загрузка данных\n" +
        "sales = pd.read_csv('sales_2023.csv')\n\n" +
        "# Фильтрация: только продажи > 1000\n" +
        "high_sales = sales[sales['amount'] > 1000]\n\n" +
        "# Группировка по месяцам\n" +
        "monthly = sales.groupby('month')['amount'].agg(['sum', 'mean', 'count'])\n\n" +
        "print(monthly)",
      citations: ['pandas_aggregation.pdf'],
    },
  ],
  exercises: [
    {
      question:
        'Дан DataFrame с данными о продажах: столбцы "date", "category", "amount", "region". ' +
        'Отфильтруйте записи за первый квартал 2023 года и вычислите общую сумму продаж ' +
        'по каждой категории товаров.',
      hints: [
        'Используйте pd.to_datetime для работы с датами',
        'Для фильтрации по диапазону дат используйте boolean indexing',
        'Для группировки используйте groupby',
      ],
      solution:
        "import pandas as pd\n\n" +
        "# Преобразование даты\n" +
        "df['date'] = pd.to_datetime(df['date'])\n\n" +
        "# Фильтрация Q1 2023\n" +
        "q1_data = df[(df['date'] >= '2023-01-01') & (df['date'] <= '2023-03-31')]\n\n" +
        "# Группировка и агрегация\n" +
        "result = q1_data.groupby('category')['amount'].sum()\n" +
        "print(result)",
      grading_rubric: {
        criteria:
          'Корректное использование фильтрации по дате (30%), правильный синтаксис groupby (30%), ' +
          'читаемость кода (20%), использование осмысленных имён переменных (20%)',
        points: 100,
      },
    },
    {
      question:
        'Объясните, в каких ситуациях предпочтительнее использовать Series, ' +
        'а в каких DataFrame. Приведите по два примера для каждого случая.',
      hints: [
        'Подумайте о размерности данных',
        'Рассмотрите типичные операции с данными',
      ],
      solution:
        'Series предпочтительнее когда:\n' +
        '1. Работаем с одномерными данными (например, временной ряд цен акции)\n' +
        '2. Нужен результат агрегации (df.groupby(...).sum() возвращает Series)\n\n' +
        'DataFrame предпочтительнее когда:\n' +
        '1. Данные имеют несколько атрибутов (таблица клиентов с именем, возрастом, городом)\n' +
        '2. Нужно сохранить связь между столбцами (результат JOIN операций)',
      grading_rubric: {
        criteria:
          'Понимание различий между структурами (40%), релевантность примеров (30%), ясность изложения (30%)',
        points: 100,
      },
    },
  ],
};

/**
 * Expected metadata for analytical lesson
 */
export const ANALYTICAL_EXPECTED_METADATA: LessonContentMetadata = {
  total_words: 850,
  total_tokens: 4200,
  cost_usd: 0.042,
  quality_score: 0.85,
  rag_chunks_used: 5,
  generation_duration_ms: 12500,
  model_used: 'gpt-4o-mini',
  archetype_used: 'concept_explainer',
  temperature_used: 0.65,
};

/**
 * Complete expected output for analytical lesson
 */
export const ANALYTICAL_EXPECTED_OUTPUT: LessonContent = {
  lesson_id: generateLessonUUID('1.1'),
  course_id: TEST_COURSE_ID,
  content: ANALYTICAL_EXPECTED_BODY,
  metadata: ANALYTICAL_EXPECTED_METADATA,
  status: 'completed',
  created_at: new Date('2024-01-15T10:00:00Z'),
  updated_at: new Date('2024-01-15T10:00:00Z'),
};

// ============================================================================
// Expected Output: PROCEDURAL Lesson (FastAPI Tutorial)
// ============================================================================

/**
 * Expected content body for procedural lesson
 */
export const PROCEDURAL_EXPECTED_BODY: LessonContentBody = {
  intro:
    'Создание production-ready API за 15 минут - это не маркетинговый трюк, а реальность ' +
    'с FastAPI. Этот современный Python-фреймворк сочетает скорость разработки с высокой ' +
    'производительностью. В этом уроке мы пошагово создадим REST API: от настройки проекта ' +
    'до валидации данных с Pydantic.',
  sections: [
    {
      title: 'Установка и настройка проекта',
      content:
        '## Шаг 1: Создание окружения\n\n' +
        '```bash\n# Создаём виртуальное окружение\n' +
        'python -m venv venv\n\n' +
        '# Активируем (Linux/Mac)\n' +
        'source venv/bin/activate\n\n' +
        '# Активируем (Windows)\n' +
        'venv\\Scripts\\activate\n```\n\n' +
        '## Шаг 2: Установка зависимостей\n\n' +
        '```bash\npip install fastapi uvicorn\n```\n\n' +
        'Создайте файл requirements.txt:\n' +
        '```\nfastapi>=0.100.0\nuvicorn>=0.23.0\n```\n\n' +
        '## Шаг 3: Структура проекта\n\n' +
        '```\nproject/\n├── main.py\n├── requirements.txt\n└── venv/\n```',
      citations: [{ document: 'fastapi_quickstart.pdf', page_or_section: 'Введение' }],
    },
    {
      title: 'Создание первого эндпоинта',
      content:
        '## Базовое приложение\n\n' +
        '```python\nfrom fastapi import FastAPI\n\n' +
        'app = FastAPI()\n\n' +
        '@app.get("/")\n' +
        'def root():\n' +
        '    return {"message": "Hello World"}\n```\n\n' +
        '## Запуск сервера\n\n' +
        '```bash\nuvicorn main:app --reload\n```\n\n' +
        '## Path параметры\n\n' +
        '```python\n@app.get("/items/{item_id}")\n' +
        'def get_item(item_id: int):\n' +
        '    return {"item_id": item_id}\n```\n\n' +
        '## Query параметры\n\n' +
        '```python\n@app.get("/items/")\n' +
        'def list_items(skip: int = 0, limit: int = 10):\n' +
        '    return {"skip": skip, "limit": limit}\n```',
      citations: [{ document: 'fastapi_quickstart.pdf', page_or_section: 'Глава 1.1' }],
    },
    {
      title: 'Валидация с Pydantic',
      content:
        '## Создание моделей\n\n' +
        '```python\nfrom pydantic import BaseModel, Field\n\n' +
        'class Item(BaseModel):\n' +
        '    name: str = Field(..., min_length=1, max_length=100)\n' +
        '    price: float = Field(..., gt=0)\n' +
        '    description: str | None = None\n```\n\n' +
        '## Использование в эндпоинтах\n\n' +
        '```python\n@app.post("/items/")\n' +
        'def create_item(item: Item):\n' +
        '    return item\n```\n\n' +
        '## Автодокументация\n\n' +
        'FastAPI автоматически генерирует OpenAPI схему. Откройте `/docs` для интерактивной документации.',
      citations: [
        { document: 'pydantic_validation.pdf', page_or_section: 'Глава 2.1' },
        { document: 'pydantic_validation.pdf', page_or_section: 'Глава 2.2' },
      ],
    },
  ],
  examples: [
    {
      title: 'Полный CRUD пример',
      content: 'Минимальный пример CRUD API для управления задачами.',
      code:
        'from fastapi import FastAPI, HTTPException\n' +
        'from pydantic import BaseModel\n\n' +
        'app = FastAPI()\n' +
        'tasks = {}\n\n' +
        'class Task(BaseModel):\n' +
        '    title: str\n' +
        '    done: bool = False\n\n' +
        '@app.post("/tasks/", status_code=201)\n' +
        'def create_task(task: Task):\n' +
        '    task_id = len(tasks) + 1\n' +
        '    tasks[task_id] = task\n' +
        '    return {"id": task_id, **task.dict()}\n\n' +
        '@app.get("/tasks/{task_id}")\n' +
        'def get_task(task_id: int):\n' +
        '    if task_id not in tasks:\n' +
        '        raise HTTPException(404, "Task not found")\n' +
        '    return tasks[task_id]',
      citations: ['fastapi_quickstart.pdf'],
    },
  ],
  exercises: [
    {
      question:
        'Создайте CRUD API для управления книгами. Реализуйте эндпоинты: ' +
        'GET /books, GET /books/{id}, POST /books, PUT /books/{id}, DELETE /books/{id}. ' +
        'Модель Book должна содержать: title (str), author (str), year (int), isbn (str).',
      hints: [
        'Используйте словарь для хранения данных в памяти',
        'Не забудьте про валидацию с Pydantic',
        'Используйте HTTPException для обработки ошибок',
      ],
      solution:
        'from fastapi import FastAPI, HTTPException\n' +
        'from pydantic import BaseModel, Field\n\n' +
        'app = FastAPI()\n' +
        'books = {}\n\n' +
        'class Book(BaseModel):\n' +
        '    title: str = Field(..., min_length=1)\n' +
        '    author: str\n' +
        '    year: int = Field(..., ge=1000, le=2100)\n' +
        '    isbn: str\n\n' +
        '@app.get("/books")\n' +
        'def list_books():\n' +
        '    return list(books.values())\n\n' +
        '@app.get("/books/{book_id}")\n' +
        'def get_book(book_id: int):\n' +
        '    if book_id not in books:\n' +
        '        raise HTTPException(404)\n' +
        '    return books[book_id]\n\n' +
        '@app.post("/books", status_code=201)\n' +
        'def create_book(book: Book):\n' +
        '    book_id = len(books) + 1\n' +
        '    books[book_id] = book\n' +
        '    return {"id": book_id}\n\n' +
        '@app.put("/books/{book_id}")\n' +
        'def update_book(book_id: int, book: Book):\n' +
        '    if book_id not in books:\n' +
        '        raise HTTPException(404)\n' +
        '    books[book_id] = book\n' +
        '    return book\n\n' +
        '@app.delete("/books/{book_id}", status_code=204)\n' +
        'def delete_book(book_id: int):\n' +
        '    if book_id not in books:\n' +
        '        raise HTTPException(404)\n' +
        '    del books[book_id]',
      grading_rubric: {
        criteria:
          'Все 5 эндпоинтов реализованы (50%), валидация и обработка ошибок (30%), чистота кода (20%)',
        points: 100,
      },
    },
  ],
};

/**
 * Expected metadata for procedural lesson
 */
export const PROCEDURAL_EXPECTED_METADATA: LessonContentMetadata = {
  total_words: 720,
  total_tokens: 3800,
  cost_usd: 0.038,
  quality_score: 0.88,
  rag_chunks_used: 4,
  generation_duration_ms: 11200,
  model_used: 'gpt-4o-mini',
  archetype_used: 'code_tutorial',
  temperature_used: 0.25,
};

/**
 * Complete expected output for procedural lesson
 */
export const PROCEDURAL_EXPECTED_OUTPUT: LessonContent = {
  lesson_id: generateLessonUUID('2.1'),
  course_id: TEST_COURSE_ID,
  content: PROCEDURAL_EXPECTED_BODY,
  metadata: PROCEDURAL_EXPECTED_METADATA,
  status: 'completed',
  created_at: new Date('2024-01-15T11:00:00Z'),
  updated_at: new Date('2024-01-15T11:00:00Z'),
};

// ============================================================================
// Expected Output: CONCEPTUAL Lesson (ML Theory)
// ============================================================================

/**
 * Expected content body for conceptual lesson
 */
export const CONCEPTUAL_EXPECTED_BODY: LessonContentBody = {
  intro:
    'Представьте, что вы учите ребёнка различать животных. Вы показываете картинки и говорите: ' +
    '"Это кошка, это собака". Ребёнок запоминает паттерны и потом сам определяет животных. ' +
    'Это supervised learning. А теперь представьте исследователя, который сам группирует ' +
    'древние артефакты по сходству, без подсказок. Это unsupervised learning. В этом уроке ' +
    'мы разберём обе парадигмы и научимся выбирать подходящий метод для бизнес-задач.',
  sections: [
    {
      title: 'Supervised Learning: обучение с учителем',
      content:
        '## Концепция размеченных данных\n\n' +
        'Supervised learning работает как обучение с репетитором. Модель получает примеры ' +
        'с правильными ответами (метками) и учится предсказывать метки для новых данных.\n\n' +
        '**Необходимо:**\n' +
        '- Обучающий набор с входными данными и метками\n' +
        '- Достаточное количество примеров каждого класса\n' +
        '- Качественная разметка данных\n\n' +
        '## Задачи классификации и регрессии\n\n' +
        '**Классификация** - предсказание категории:\n' +
        '- Спам-фильтр: спам / не спам\n' +
        '- Диагностика: болен / здоров\n' +
        '- Кредитный скоринг: одобрить / отказать\n\n' +
        '**Регрессия** - предсказание числа:\n' +
        '- Цена квартиры\n' +
        '- Прогноз продаж\n' +
        '- Оценка времени доставки',
      citations: [
        { document: 'ml_fundamentals.pdf', page_or_section: 'Глава 1.1' },
        { document: 'ml_fundamentals.pdf', page_or_section: 'Глава 1.2' },
      ],
    },
    {
      title: 'Unsupervised Learning: обучение без учителя',
      content:
        '## Работа с неразмеченными данными\n\n' +
        'Unsupervised learning - это исследователь, который сам находит закономерности. ' +
        'Нет правильных ответов - алгоритм ищет структуры в данных.\n\n' +
        '## Основные задачи\n\n' +
        '**Кластеризация** - группировка похожих объектов:\n' +
        '- Сегментация клиентов по поведению\n' +
        '- Группировка документов по темам\n' +
        '- Выявление сообществ в социальных сетях\n\n' +
        '**Снижение размерности** - упрощение данных:\n' +
        '- Визуализация многомерных данных\n' +
        '- Удаление шума\n' +
        '- Ускорение обучения других моделей\n\n' +
        '**Обнаружение аномалий:**\n' +
        '- Выявление мошенничества\n' +
        '- Поиск дефектов на производстве',
      citations: [
        { document: 'ml_fundamentals.pdf', page_or_section: 'Глава 2.1' },
        { document: 'ml_fundamentals.pdf', page_or_section: 'Глава 2.2' },
      ],
    },
    {
      title: 'Выбор подхода для вашей задачи',
      content:
        '## Критерии выбора\n\n' +
        '| Критерий | Supervised | Unsupervised |\n' +
        '|----------|------------|---------------|\n' +
        '| Размеченные данные | Необходимы | Не нужны |\n' +
        '| Чёткая цель | Да (предсказание) | Не обязательно |\n' +
        '| Оценка качества | Метрики на тесте | Субъективная |\n\n' +
        '## Гибридный подход: Semi-supervised\n\n' +
        'Когда размеченных данных мало, но неразмеченных много:\n' +
        '1. Обучите модель на малом размеченном наборе\n' +
        '2. Предскажите метки для неразмеченных\n' +
        '3. Добавьте уверенные предсказания в обучение\n' +
        '4. Повторите',
      citations: [{ document: 'ml_decision_guide.pdf', page_or_section: 'Глава 3.1' }],
    },
  ],
  examples: [
    {
      title: 'Кейс Netflix: рекомендации',
      content:
        'Netflix использует supervised learning для персонализации. Модель обучается ' +
        'на истории просмотров и рейтингов. Результат: 80% контента смотрят по рекомендациям.',
      citations: ['business_cases.pdf'],
    },
  ],
  exercises: [
    {
      question:
        'Классифицируйте следующие задачи как supervised или unsupervised:\n' +
        '1. Определение тональности отзывов (позитивный/негативный)\n' +
        '2. Группировка новостей по темам\n' +
        '3. Предсказание оттока клиентов\n' +
        '4. Выявление необычных транзакций в банке',
      hints: [
        'Подумайте, есть ли у задачи "правильный ответ"',
        'Аномалии можно искать без разметки',
      ],
      solution:
        '1. Supervised (классификация) - есть размеченные отзывы\n' +
        '2. Unsupervised (кластеризация) - группировка без заданных категорий\n' +
        '3. Supervised (классификация) - предсказываем метку "ушёл/остался"\n' +
        '4. Unsupervised (обнаружение аномалий) - ищем отклонения от нормы без разметки',
      grading_rubric: {
        criteria: 'Корректная классификация (50%), качество обоснования (50%)',
        points: 100,
      },
    },
  ],
};

/**
 * Expected metadata for conceptual lesson
 */
export const CONCEPTUAL_EXPECTED_METADATA: LessonContentMetadata = {
  total_words: 680,
  total_tokens: 3500,
  cost_usd: 0.035,
  quality_score: 0.82,
  rag_chunks_used: 6,
  generation_duration_ms: 10800,
  model_used: 'gpt-4o-mini',
  archetype_used: 'concept_explainer',
  temperature_used: 0.65,
};

/**
 * Complete expected output for conceptual lesson
 */
export const CONCEPTUAL_EXPECTED_OUTPUT: LessonContent = {
  lesson_id: generateLessonUUID('3.1'),
  course_id: TEST_COURSE_ID,
  content: CONCEPTUAL_EXPECTED_BODY,
  metadata: CONCEPTUAL_EXPECTED_METADATA,
  status: 'completed',
  created_at: new Date('2024-01-15T12:00:00Z'),
  updated_at: new Date('2024-01-15T12:00:00Z'),
};

// ============================================================================
// Collection of All Expected Outputs
// ============================================================================

/**
 * All expected outputs for comprehensive testing
 */
export const ALL_EXPECTED_OUTPUTS: LessonContent[] = [
  ANALYTICAL_EXPECTED_OUTPUT,
  PROCEDURAL_EXPECTED_OUTPUT,
  CONCEPTUAL_EXPECTED_OUTPUT,
];

/**
 * Map of lesson IDs to expected outputs
 */
export const EXPECTED_OUTPUTS_BY_LESSON: Record<string, LessonContent> = {
  '1.1': ANALYTICAL_EXPECTED_OUTPUT,
  '2.1': PROCEDURAL_EXPECTED_OUTPUT,
  '3.1': CONCEPTUAL_EXPECTED_OUTPUT,
};

/**
 * Minimum quality thresholds for test validation
 */
export const QUALITY_THRESHOLDS = {
  /** Minimum acceptable quality score */
  minQualityScore: 0.75,
  /** Maximum acceptable cost per lesson (USD) */
  maxCostUsd: 0.10,
  /** Minimum word count for lesson content */
  minWordCount: 500,
  /** Maximum generation time (ms) */
  maxGenerationTimeMs: 30000,
  /** Minimum RAG chunks that should be used */
  minRagChunksUsed: 3,
};
