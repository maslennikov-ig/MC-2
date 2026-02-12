# Error Logs Status Report — 2026-02-10

## Context

Проверка текущего состояния ошибок в `/admin/logs` после предыдущих сессий обработки.

## Общий результат

| Метрика                                      | Значение |
| -------------------------------------------- | -------- |
| Новых необработанных ошибок (по fingerprint) | **0**    |
| Новых fingerprint за 3 дня                   | **0**    |
| generation_trace ошибок                      | **0**    |

**Все ошибки обработаны.** Новых типов ошибок не появилось.

## Распределение по статусам (1,431 fingerprint)

| Статус        | Количество | Описание                |
| ------------- | ---------- | ----------------------- |
| resolved      | 1,213      | Исправлены              |
| auto_muted    | 183        | Автоматически заглушены |
| **to_verify** | **31**     | На мониторинге          |
| ignored       | 4          | Игнорируются            |

## to_verify: Детальный разбор (31 fingerprint)

### Активные (есть события за последние 7 дней)

| #   | Ошибка                        | За 7д    | Окружение       | Заметки                               |
| --- | ----------------------------- | -------- | --------------- | ------------------------------------- |
| 1   | Generic job failure           | 20       | dev+stage+local | Разные причины. Мониторинг            |
| 2-5 | Docling MCP timeout (4 fp)    | 8 каждый | dev+stage+local | Fallback работает. Docling недоступен |
| 6-7 | Docling MCP timeout (2 fp)    | 4 каждый | dev+stage       | Старые Docling ошибки                 |
| 8   | Admin logs filter null values | 6        | dev             | Beads задача создана                  |
| 9   | Minor/one-off errors          | 5        | dev+stage+local | Мониторинг                            |
| 10  | Frontend applyProposal race   | 2        | dev             | Нужен UX guard                        |
| 11  | Minor errors on stage         | 1-4      | stage           | One-off, мониторинг                   |

### Неактивные (0 событий или >7 дней назад)

- DB unavailable during phase config (tracking in mc2-3isz) — **0 ошибок**
- Race condition attempts (tracking in mc2-35cg) — **0 ошибок**
- LLM malformed JSON — последняя Jan 30
- Statement timeout grouped logs — последняя Jan 29
- Несколько one-off ошибок stage — 1 Feb 3

### CRITICAL ошибки

1. **Zod validation in phase-0.5-clarifying** (dev, Feb 4) — LLM вернул `suggested_answers` как строки вместо объектов, 20 вариантов вместо max 6. Не повторилась.
2. **LLM malformed JSON** (dev, Jan 30) — не повторилась.

## Рекомендуемые действия

### 1. Резолв неактивных to_verify (12 fingerprints)

Ошибки с 0 событий или >7 дней без повторения можно пометить как resolved:

- 2 fingerprint с 0 ошибок (удалены из error_logs)
- ~10 one-off ошибок, не повторявшихся >7 дней

### 2. Auto-mute Docling timeout (6 fingerprints)

Docling MCP server недоступен, fallback работает. Добавить паттерн в `auto-classification.ts`:

```
/Docling.*(?:timeout|failed|connect)/i → external_service
/Document processing failed/i → graceful_fallback
```

### 3. Исследовать Generic job failure

20 ошибок за 7 дней на dev+stage — самая активная проблема. Нужно посмотреть конкретные error_message.

### 4. Frontend applyProposal race condition

Нужен UX guard — disable кнопку пока analysis_result не готов.

## Verification

- Запустить SQL-запрос `new_or_null_status` — должен вернуть 0
- Проверить `/admin/logs` UI — раздел "Новые" должен быть пуст
- После auto-mute Docling: проверить что новые Docling ошибки автоматически мьютятся
