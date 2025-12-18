# Lesson Content Generation Quality Testing

Скрипт для тестирования качества генерации уроков (Stage 6) различными LLM моделями.

## Цель

Сравнить качество генерации контента уроков между моделями для выбора оптимальной модели для Stage 6 pipeline.

## Тестируемые модели

| Slug | API Name | Описание |
|------|----------|----------|
| nemotron-nano-30b | nvidia/nemotron-3-nano-30b-a3b:free | NVIDIA Nemotron (free) |
| gpt-oss-120b | openai/gpt-oss-120b | OpenAI OSS 120B |
| gpt-oss-20b | openai/gpt-oss-20b | OpenAI OSS 20B |
| qwen3-235b-thinking | qwen/qwen3-235b-a22b-thinking-2507 | Qwen3 235B Thinking |
| devstral-2512 | mistralai/devstral-2512:free | Mistral Devstral (free) |

## Тестовые данные

Используются реальные уроки из структуры курса в Supabase:

### Русский язык
1. **1.1** - Что такое нематериальный продукт: билет как товар
2. **1.2** - Ценообразование на билеты: как работают скидки и тарифы

### Английский язык (переводы)
1. **1.1-en** - What is an Intangible Product: Ticket as a Product
2. **1.2-en** - Ticket Pricing: How Discounts and Tiers Work

## Запуск теста

```bash
# Убедитесь, что API ключ установлен
export OPENROUTER_API_KEY="your-api-key"

# Запустите тест
node docs/lessons-testing/run-lesson-quality-test.mjs
```

## Метрики качества

Скрипт оценивает каждый сгенерированный урок по следующим критериям:

| Критерий | Макс. баллов | Описание |
|----------|--------------|----------|
| Наличие intro | 10 | Введение > 50 символов |
| Наличие sections | 15 | Массив секций непустой |
| Наличие examples | 10 | Примеры присутствуют |
| Наличие exercises | 10 | Упражнения присутствуют |
| Наличие summary | 5 | Итоги урока |
| Количество секций | 20 | До 5 секций (4 балла каждая) |
| Количество примеров | 15 | До 3 примеров (5 баллов каждый) |
| Количество упражнений | 15 | До 3 упражнений (5 баллов каждое) |
| Покрытие целей обучения | 10 | Процент покрытых objectives |
| Покрытие тем | 10 | Процент покрытых topics |
| Бонус за объем | 10 | >500 слов (+5), >1000 слов (+10) |

**Максимум: 100 баллов**

## Структура результатов

```
test-results/
├── summary.json              # Общая статистика
├── nemotron-nano-30b/
│   ├── lesson-1.1.json       # Parsed JSON content
│   ├── lesson-1.1.raw        # Raw API response
│   ├── lesson-1.1-metrics.json
│   ├── lesson-1.2.json
│   └── ...
├── gpt-oss-120b/
│   └── ...
└── ...
```

## Анализ результатов

После запуска проанализируйте `summary.json`:

- **modelSummary** - средние баллы по каждой модели
- **lessonSummary** - средние баллы по каждому уроку
- **results** - детальные метрики каждого теста

## Связанные файлы

- `docs/llm-testing/` - Оригинальные тесты качества LLM (metadata/sections)
- `packages/course-gen-platform/src/stages/stage6-lesson-content/` - Stage 6 implementation
