# План: Оптимизация контекста чата для редактирования курса

## Проблема

При запросе в чат редактирования (chat_node_refinement) отправляется **42,427 input tokens**, что приводит к:

- Достижению лимита output tokens (4096)
- Обрезанию JSON ответа → ошибка парсинга
- Пустому сообщению от бота
- Высокой стоимости и задержке (62 сек)

## Что отправляется

**Stage 5**: `course_structure` (структура, НЕ полный контент уроков):

- course_title, course_description
- sections[] → lessons[] (title, objectives, key_topics)

Для курса с 49 уроками это ~20,000-50,000 символов.

## Причина проблемы (уточнено после анализа)

### Большой контекст + малый лимит output

- `buildRefinementPrompt()` (строка 108): отправляет `JSON.stringify(currentData)` - весь course_structure
- `maxTokens: 4096` (fallback, строка 85) - недостаточно для JSON ответа с 49 уроками
- В config-seed.json НЕТ конфига для chat - всегда используется fallback

### Дублирования НЕТ (проверено)

- `contentContext` (строки 480-491) используется только в else-ветке, когда `!shouldGenerateProposal`
- При proposal generation используется только `buildRefinementPrompt()` без дублирования

## Проверка других мест с LLM вызовами

Проверены все 17 файлов с llmClient:

| Файл                   | maxTokens       | Контекст                  | Статус       |
| ---------------------- | --------------- | ------------------------- | ------------ |
| chat.router.ts         | 4096 (fallback) | Весь course_structure     | **ПРОБЛЕМА** |
| element-crud.router.ts | 2000/4000       | Минимальный (секция/урок) | OK           |
| regeneration.router.ts | 2000            | Tiered context с кэшем    | OK           |
| stage6 workers         | 16384-32768     | По конфигу                | OK           |
| stage7 handlers        | 2000-4000       | Минимальный               | OK           |

**Вывод**: Только chat.router.ts требует исправления.

## Выбранное решение: maxTokens + унификация модели

### Изменение 1: Увеличить maxTokens (обязательно)

**Файл**: `chat.router.ts` строка 85

```typescript
// БЫЛО:
maxTokens: parseInt(process.env.CHAT_FALLBACK_MAX_TOKENS || '4096', 10),

// СТАЛО:
maxTokens: parseInt(process.env.CHAT_FALLBACK_MAX_TOKENS || '8192', 10),
```

### Изменение 2: Унифицировать модель для кэширования (рекомендуется)

**Файл**: `chat.router.ts` строка 83

```typescript
// БЫЛО:
modelId: process.env.CHAT_FALLBACK_MODEL || 'openai/gpt-4o-mini',

// СТАЛО:
modelId: process.env.CHAT_FALLBACK_MODEL || 'xiaomi/mimo-v2-flash',
```

**Почему Xiaomi mimo-v2-flash**:

- Та же модель что для Stage 4/5 генерации
- OpenRouter автоматически кэширует при повторных запросах к тому же провайдеру
- Дешевле чем GPT-4o-mini
- Достаточный context window (128K токенов)

**Про кэширование** (согласно [OpenRouter docs](https://openrouter.ai/docs/guides/best-practices/prompt-caching)):

- OpenRouter делает best-effort роутинг к тому же провайдеру для warm cache
- DeepSeek и Gemini 2.5 имеют автоматическое кэширование
- Для Xiaomi/Qwen - неявное кэширование на уровне провайдера

**Важно**: Кэширование НЕ решит проблему truncated output. maxTokens ОБЯЗАТЕЛЬНО нужно увеличить до 8192.

## Верификация

1. Изменить chat.router.ts:
   - Строка 83: `'openai/gpt-4o-mini'` → `'xiaomi/mimo-v2-flash'`
   - Строка 85: `'4096'` → `'8192'`
2. Перезапустить dev сервер
3. Открыть курс с большой структурой (49 уроков)
4. Написать в чат: "убери раздел Метрики конверсии"
5. Проверить в логах:
   - `finishReason` должен быть "stop", а не "length"
   - `outputTokens` < 8192
   - `model_used` = `xiaomi/mimo-v2-flash`
   - Бот должен ответить с предложением изменения (не пустое)
