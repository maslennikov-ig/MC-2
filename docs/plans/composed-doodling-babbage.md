# Plan: LangGraph Upgrade 1.0.5 → 1.1.4

## Context

`@langchain/langgraph` — единственный LangChain-пакет, где мы отстаём от последней версии (1.0.5 vs 1.1.4, 9 релизов). Остальные пакеты (`@langchain/core` 1.1.19, `@langchain/openai` 1.2.5, `@langchain/textsplitters` 1.0.1) уже на последних версиях.

LangGraph 1.1.x добавляет три основных фичи: **Deferred Nodes**, **Node Caching**, **StateSchema**. Пользователь хочет полный апгрейд с внедрением новых возможностей.

## Честная оценка новых фич для нашего проекта

### Deferred Nodes (fan-out / fan-in)

**Вердикт: НЕ ПОДХОДИТ для текущей архитектуры**

Наш Stage 6 — это пайплайн обработки **одного урока**: `generator → selfReviewer → sectionRegenerator → judge`. Параллелизм уже реализован на уровне **BullMQ** (30 concurrent workers обрабатывают разные уроки одновременно). Deferred nodes полезны для fan-out/fan-in ВНУТРИ одного графа, но у нас нет такого паттерна.

Stage 5 — линейный пайплайн из 4 фаз без ветвления.

Для реального использования deferred nodes нужно было бы переделать generator так, чтобы он генерировал секции урока параллельно — но наш generator уже оптимизирован для serial generation с контекстом между секциями (каждая следующая секция учитывает предыдущие).

### Node Caching

**Вердикт: МАРГИНАЛЬНАЯ ПОЛЬЗА**

- При retry после judge REJECT мы **хотим** другой результат (другая температура, другой промпт) — кэш будет мешать
- Дедупликация дублей уже обеспечена BullMQ
- Единственный реальный кейс: cache `validate_input` в Stage 5 (дешёвая операция, экономия ~0ms)

Тем не менее, node caching имеет потенциал для **будущих** сценариев: кэширование RAG-контекста при retry (сейчас RAG-контекст и так кэшируется в `rag_context_cache` таблице).

### StateSchema (Zod-native state)

**Вердикт: КОСМЕТИЧЕСКОЕ УЛУЧШЕНИЕ**

Наш текущий `Annotation.Root` — это стандартный и рекомендуемый паттерн. StateSchema — альтернативный API для тех, кто предпочитает Zod-first. Миграция — чистый рефакторинг без функциональной разницы. Наш Zod 3.25.76 совместим.

## Рекомендация

Выполнить **обновление версии** (безопасное, без breaking changes) + **подготовить инфраструктуру** для node caching (добавить пакет `@langchain/langgraph-checkpoint`, но не внедрять кэширование сейчас). Deferred nodes и StateSchema откладываем — они не дают реальной пользы для текущей архитектуры.

## Фаза 1: Обновление версии (безопасный апгрейд)

### 1.1 Обновить зависимости

**Файл**: `packages/course-gen-platform/package.json`

```
"@langchain/langgraph": "^1.0.5" → "^1.1.4"
```

Новые транзитивные зависимости (устанавливаются автоматически):

- `@langchain/langgraph-sdk`: ~1.3.0 → ~1.6.0
- `@langchain/langgraph-checkpoint`: ^1.0.0 (уже в deps)

Peer dependencies (все удовлетворены):

- `@langchain/core ^1.1.16` — у нас 1.1.19 ✅
- `zod ^3.25.32` — у нас 3.25.76 ✅
- `zod-to-json-schema ^3.x` — потенциально нужно добавить как devDep ⚠️

### 1.2 Проверить совместимость API

Файлы, использующие `@langchain/langgraph`:

| Файл                                           | Что используется                  | Риск                    |
| ---------------------------------------------- | --------------------------------- | ----------------------- |
| `src/stages/stage5-generation/orchestrator.ts` | `StateGraph`, `END`, `Annotation` | Низкий — API не менялся |
| `src/stages/stage6-lesson-content/graph.ts`    | `StateGraph`, `START`, `END`      | Низкий — API не менялся |
| `src/stages/stage6-lesson-content/state.ts`    | `Annotation`                      | Низкий — API не менялся |

Все используемые API (`StateGraph`, `Annotation.Root`, `START`, `END`, `.addNode()`, `.addEdge()`, `.addConditionalEdges()`, `.compile()`, `.invoke()`) остались без изменений в 1.1.x.

### 1.3 Добавить `zod-to-json-schema` (peer dep)

```bash
pnpm --filter course-gen-platform add -D zod-to-json-schema@^3
```

## Фаза 2: Проверка

### 2.1 Type-check

```bash
pnpm type-check
```

### 2.2 Unit tests

```bash
pnpm --filter course-gen-platform test
```

### 2.3 Smoke test Stage 5 + Stage 6

Запустить генерацию курса через UI или API и убедиться, что:

- Stage 5 отрабатывает (4 фазы, JSON сохраняется)
- Stage 6 отрабатывает (уроки генерируются, judge работает)

## Не делаем (и почему)

| Фича                                                     | Почему не сейчас                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------ |
| Deferred Nodes в Stage 6                                 | Параллелизм на уровне BullMQ workers, не внутри графа                    |
| Node Caching                                             | Retry нужен именно для получения другого результата                      |
| StateSchema миграция                                     | Annotation.Root — стандартный паттерн, миграция = рефакторинг без пользы |
| `@langchain/langgraph-checkpoint` как прямая зависимость | Уже приходит транзитивно через langgraph                                 |

## Beads

Создать задачу: `bd create "Upgrade @langchain/langgraph 1.0.5 → 1.1.4" -t chore -p 3 --label dependencies`

## Критические файлы

- `packages/course-gen-platform/package.json` — обновление версии
- `packages/course-gen-platform/src/stages/stage5-generation/orchestrator.ts` — проверить после обновления
- `packages/course-gen-platform/src/stages/stage6-lesson-content/graph.ts` — проверить после обновления
- `packages/course-gen-platform/src/stages/stage6-lesson-content/state.ts` — проверить после обновления
