# План: Удаление Phase 6 RAG Planning из Stage 4

**Решение:** Вариант 1 — Полностью убрать Phase 6
**Статус:** Ready for implementation
**Связано с:** mc2-zac (Stage 3 elimination)

## Обоснование

**Проблема:** Жёсткая привязка документов к секциям через LLM-маппинг:

- LLM может ошибиться → ошибка распространяется на все уроки секции
- Векторный поиск с priority boosting (mc2-zac) уже находит релевантные чанки

**Прецедент:** Stage 3 LLM Classification была отключена по той же причине (mc2-zac).

---

## Текущая архитектура Phase 6 (будет удалена)

```
Stage 4, Phase 6:
├── Input: sections_breakdown + document_summaries
├── LLM Call: ~5-10 секунд, ~2-5K tokens
└── Output: document_relevance_mapping
    ├── primary_documents: [doc_ids] per section
    ├── search_queries: 3-10 per section
    ├── expected_topics: 2-8 per section
    └── confidence: high | medium

Stage 5/6 "SMART mode":
├── Читает document_relevance_mapping
├── Фильтрует RAG поиск только по primary_documents
└── Использует pre-generated search_queries
```

**Заявленная экономия:** 45x cost savings vs "Planning LLM call"

---

## Варианты решения (от радикального к консервативному)

### Вариант 1: Полностью убрать Phase 6 ⭐ РЕКОМЕНДУЕТСЯ

| Аспект        | Описание                                                          |
| ------------- | ----------------------------------------------------------------- |
| **Суть**      | Удалить Phase 6, довериться векторному поиску с priority boosting |
| **Изменения** | Skip Phase 6 в orchestrator, убрать usage в Stage 5/6             |

**Плюсы:**

- ✅ Исключает ошибки LLM-маппинга (системный риск устранён)
- ✅ Упрощает pipeline (6 фаз → 5 фаз)
- ✅ Экономия LLM tokens (~2-5K на курс)
- ✅ Ускорение Stage 4 на 5-10 секунд
- ✅ Консистентность с решением по Stage 3 (mc2-zac)
- ✅ Priority boosting (mc2-zac) уже обеспечивает приоритизацию документов

**Минусы:**

- ❌ Теряем pre-generated search_queries (модель генерирует свои)
- ❌ Теряем expected_topics (нет валидации покрытия)
- ❌ Stage 5/6 генерирует queries "на лету" — возможно менее оптимальные

**Оценка рисков:**

- Риск потери качества: **НИЗКИЙ** — векторный поиск с priority boosting уже работает
- Риск регрессии: **НИЗКИЙ** — graceful degradation уже есть (NAIVE mode)

---

### Вариант 2: Сделать опциональной (feature flag)

| Аспект        | Описание                                                         |
| ------------- | ---------------------------------------------------------------- |
| **Суть**      | `ENABLE_PHASE6_RAG_PLANNING=false` по умолчанию                  |
| **Изменения** | Добавить flag, отключить по умолчанию, оставить код для rollback |

**Плюсы:**

- ✅ Можно включить обратно если обнаружим регрессию
- ✅ Постепенный rollout (A/B тестирование)
- ✅ Сохраняем код для будущего использования

**Минусы:**

- ❌ Мёртвый код в репозитории
- ❌ Сложность поддержки двух режимов
- ❌ Технический долг

---

### Вариант 3: Убрать primary_documents, оставить search_queries

| Аспект        | Описание                                                                        |
| ------------- | ------------------------------------------------------------------------------- |
| **Суть**      | Phase 6 генерирует только queries, без фильтрации документов                    |
| **Изменения** | Модифицировать Stage 5/6 — использовать queries, игнорировать primary_documents |

**Плюсы:**

- ✅ Сохраняем pre-optimized search queries
- ✅ Убираем жёсткую привязку документов
- ✅ Векторный поиск по всем документам + качественные queries

**Минусы:**

- ❌ LLM call всё ещё нужен (5-10 сек, 2-5K tokens)
- ❌ Частичная мера — не решает проблему полностью
- ❌ Queries могут быть биased к определённым документам

---

### Вариант 4: Hybrid — Phase 6 как soft hints

| Аспект        | Описание                                                             |
| ------------- | -------------------------------------------------------------------- |
| **Суть**      | primary_documents как "boost hints", не фильтр                       |
| **Изменения** | Stage 5/6 ищет по всем документам, но boosting для primary_documents |

**Плюсы:**

- ✅ Сохраняем инвестиции в Phase 6
- ✅ Мягкое влияние, не жёсткая фильтрация
- ✅ Fallback на весь корпус документов

**Минусы:**

- ❌ Сложная логика (уже есть priority boosting из mc2-zac)
- ❌ Два уровня boosting могут конфликтовать
- ❌ Непредсказуемое поведение

---

## Сравнительная таблица

| Критерий               | Вариант 1 (Убрать) | Вариант 2 (Flag)       | Вариант 3 (Queries only) | Вариант 4 (Hints)     |
| ---------------------- | ------------------ | ---------------------- | ------------------------ | --------------------- |
| Риск ошибок маппинга   | ✅ Устранён        | ✅ Устранён (если off) | 🟡 Частично              | 🟡 Снижен             |
| Сложность изменений    | Средняя            | Низкая                 | Средняя                  | Высокая               |
| Технический долг       | ✅ Минимум         | ❌ Мёртвый код         | 🟡 Средний               | ❌ Высокий            |
| Обратная совместимость | 🟡 Breaking        | ✅ Полная              | ✅ Полная                | ✅ Полная             |
| Экономия tokens        | ✅ 2-5K/курс       | ✅ (если off)          | ❌ Нет                   | ❌ Нет                |
| Экономия времени       | ✅ 5-10 сек        | ✅ (если off)          | ❌ Нет                   | ❌ Нет                |
| Качество RAG           | 🟡 Возможно то же  | ✅ Контролируемо       | 🟡 Немного лучше         | 🟡 Сложно предсказать |

---

## План реализации

### Шаг 1: Отключение Phase 6 в orchestrator

**Файл:** `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator.ts`

**Изменение:** Skip запуск Phase 6, сразу возвращать пустой mapping

```typescript
// БЫЛО: запуск Phase 6 параллельно с Phase 3
let phase6Promise: Promise<Phase6Output | null> | null = null;
if (hasDocuments) {
  phase6Promise = executePhaseWithRetry('phase6_rag_planning', ...)
}

// СТАЛО: всегда пустой mapping (Phase 6 deprecated)
const phase6Output: Phase6Output = {
  document_relevance_mapping: {},
  phase_metadata: {
    duration_ms: 0,
    model_used: 'skipped',
    tokens: { input: 0, output: 0, total: 0 },
    quality_score: 0,
    retry_count: 0,
  },
};
orchestrationLogger.info('Phase 6 (RAG Planning) skipped: deprecated in favor of vector search with priority boosting');
```

### Шаг 2: Stage 5 — убрать зависимость от document_relevance_mapping

**Файлы для проверки:**

- `packages/course-gen-platform/src/stages/stage5-generation/utils/qdrant-search.ts`
- `packages/course-gen-platform/src/stages/stage5-generation/phases/`

**Ожидание:** NAIVE mode (поиск без pre-mapping) должен работать. Проверить, что код корректно обрабатывает пустой `document_relevance_mapping`.

### Шаг 3: Stage 6 — убрать зависимость от document_relevance_mapping

**Файлы для проверки:**

- `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/lesson-rag-retriever.ts`

**Ожидание:** RAG retriever должен работать без pre-mapping, используя только priority boosting из mc2-zac.

### Шаг 4: Обновить типы (deprecated annotation)

**Файл:** `packages/shared-types/src/analysis-result.ts`

```typescript
/**
 * @deprecated Phase 6 RAG Planning removed.
 * Vector search with priority boosting (mc2-zac) replaces this functionality.
 * This type kept for backward compatibility with existing data.
 */
export interface Phase6Output { ... }
```

### Шаг 5: Документация

- Обновить `README.md` в stage4-analysis
- Обновить архитектурную документацию

---

## Файлы для изменения

### Backend (course-gen-platform)

| Файл                                                         | Действие   | Описание                                |
| ------------------------------------------------------------ | ---------- | --------------------------------------- |
| `stages/stage4-analysis/orchestrator.ts`                     | **MODIFY** | Skip Phase 6, return empty mapping      |
| `stages/stage5-generation/utils/qdrant-search.ts`            | **VERIFY** | Убедиться что работает с пустым mapping |
| `stages/stage6-lesson-content/utils/lesson-rag-retriever.ts` | **VERIFY** | Убедиться что работает без pre-mapping  |
| `shared-types/src/analysis-result.ts`                        | **MODIFY** | Add @deprecated к Phase6Output          |
| `stages/stage4-analysis/README.md`                           | **MODIFY** | Обновить описание фаз                   |

### Admin Panel (constants.ts) — ВАЖНО!

**Файл:** `packages/course-gen-platform/src/server/routers/pipeline-admin/constants.ts`

**Проблема:** Фазы перечислены некорректно:

- Stage 4 показывает только 4 фазы, а должно быть 5 (без Phase 6)
- Stage 5 показывает `stage_6_rag_planning` (это Phase 6 из Stage 4, а не Stage 5!)

**Исправление:**

```typescript
// Stage 4 — БЫЛО:
linkedPhases: ['stage_4_classification', 'stage_4_scope', 'stage_4_expert', 'stage_4_synthesis'];

// Stage 4 — ДОЛЖНО БЫТЬ (без Phase 6, она удаляется):
linkedPhases: [
  'stage_4_classification', // Phase 1
  'stage_4_scope', // Phase 2
  'stage_4_expert', // Phase 3
  'stage_4_synthesis', // Phase 4
  // Phase 5 (Assembly) — no LLM
  // Phase 6 (RAG Planning) — REMOVED
];

// Stage 5 — БЫЛО:
linkedPhases: [
  'stage_5_metadata',
  'stage_5_sections',
  'stage_6_rag_planning', // <-- ОШИБКА: это Phase 6 из Stage 4!
];

// Stage 5 — ДОЛЖНО БЫТЬ:
linkedPhases: [
  'stage_5_metadata', // Phase 2: Generate Metadata
  'stage_5_sections', // Phase 3: Generate Sections
  // Phase 1 (validate_input) — no LLM
  // Phase 4 (validate_quality) — optional
  // Phase 5 (validate_lessons) — no LLM
];
```

### Также нужно проверить DEFAULT_MODEL_CONFIGS

Убрать или пометить deprecated:

```typescript
stage_6_rag_planning: {  // <-- DEPRECATED: Phase 6 removed
  ...
}
```

---

## Валидация

### Pre-flight checks

1. `pnpm type-check` — компиляция без ошибок
2. `pnpm build` — сборка успешна
3. `pnpm test --filter course-gen-platform` — тесты проходят

### E2E validation

1. Создать курс с документами (через UI или API)
2. Проверить что Stage 4 завершается быстрее (без Phase 6)
3. Проверить что Stage 6 генерирует уроки корректно
4. Проверить что source_documents заполняется из retrieved chunks

### Metrics to compare (before/after)

- Stage 4 duration (должен уменьшиться на 5-10 сек)
- Stage 4 token usage (должен уменьшиться на 2-5K)
- Stage 6 lesson quality (не должен ухудшиться)

---

## Rollback план

Если обнаружим регрессию качества:

1. Вернуть запуск Phase 6 в orchestrator
2. Создать feature flag для постепенного отключения

---

## Ожидаемые результаты

- ✅ Stage 4: 6 фаз → 5 фаз (Phase 6 skipped)
- ✅ Экономия: 5-10 секунд + 2-5K tokens на курс
- ✅ Устранён риск ошибок LLM-маппинга
- ✅ Консистентность с решением mc2-zac (Stage 3 elimination)
