# Stage 4 Token Budget Redesign

> Редизайн системы распределения токенов для Stage 4 Analysis

## Проблема

Текущая система использует бинарный приоритет (HIGH/LOW) и сложную категоризацию, которая не используется. Summary нужен ТОЛЬКО для Stage 4 Analysis, где контент документов передаётся в промпт модели.

## Цель

Создать интеллектуальную систему распределения токенов, которая:

1. Максимально сохраняет CORE документ целиком
2. Адаптивно выбирает модель под размер контекста
3. Использует cache-read для экономии на дорогих моделях

---

## Ключевое архитектурное изменение: Новый порядок Pipeline

### Было (текущий порядок Stage 2):

```
Parse (Docling) → Classify (приоритизация) → Chunk → Embed → Summarize
```

### Стало (новый порядок):

```
Parse (Docling) → Chunk → Embed → Summarize → Classify (приоритизация)
```

### Почему меняем:

1. **Summary нужен ДО приоритизации** для расчёта бюджета
2. После summary знаем точные размеры всех документов
3. Приоритизация может учитывать размеры при принятии решений

### Источники контента для Stage 4 Analysis:

| Приоритет                       | Источник контента       | Поле в file_catalog |
| ------------------------------- | ----------------------- | ------------------- |
| **CORE**                        | Полный текст из Docling | `markdown_content`  |
| **IMPORTANT** (если влезает)    | Полный текст из Docling | `markdown_content`  |
| **IMPORTANT** (если не влезает) | Summary                 | `processed_content` |
| **SUPPLEMENTARY**               | Summary (всегда)        | `processed_content` |

### Новая структура данных в file_catalog:

```typescript
{
  markdown_content: string; // Полный текст из Docling (для full_text mode)
  processed_content: string; // Summary (создаётся для ВСЕХ документов)
  token_count: number; // Токены полного текста
  summary_metadata: {
    summary_tokens: number; // Токены summary
    // ... остальные поля
  }
}
```

---

## Архитектура моделей

### Русский язык (RU)

| Контекст      | Primary Model                             | Fallback Model              | Cache                        |
| ------------- | ----------------------------------------- | --------------------------- | ---------------------------- |
| ≤260K токенов | `qwen/qwen3-235b-a22b-2507`               | `moonshotai/kimi-k2-0905`   | —                            |
| >260K токенов | `google/gemini-2.5-flash-preview-09-2025` | `qwen/qwen-plus-2025-07-28` | ✅ cache-read (10x экономия) |

**Примечание:** Fallback `qwen/qwen-plus-2025-07-28` НЕ поддерживает cache-read/write.

### Другие языки (EN, etc.)

| Контекст      | Primary Model             | Fallback Model                            | Cache |
| ------------- | ------------------------- | ----------------------------------------- | ----- |
| ≤260K токенов | `x-ai/grok-4.1-fast:free` | `moonshotai/kimi-k2-0905`                 | —     |
| >260K токенов | `x-ai/grok-4.1-fast:free` | `moonshotai/kimi-linear-48b-a3b-instruct` | —     |

### Полная таблица моделей

| Model ID                                  | Max Context | Язык  | Tier             | Cache         |
| ----------------------------------------- | ----------- | ----- | ---------------- | ------------- |
| `qwen/qwen3-235b-a22b-2507`               | 260K        | RU    | Primary (≤260K)  | —             |
| `moonshotai/kimi-k2-0905`                 | 128K        | RU/EN | Fallback (≤260K) | —             |
| `google/gemini-2.5-flash-preview-09-2025` | 1M          | RU    | Primary (>260K)  | ✅ cache-read |
| `qwen/qwen-plus-2025-07-28`               | 1M          | RU    | Fallback (>260K) | ❌            |
| `x-ai/grok-4.1-fast:free`                 | 260K+       | EN    | Primary (all)    | —             |
| `moonshotai/kimi-linear-48b-a3b-instruct` | 1M+         | EN    | Fallback (>260K) | —             |

### Лимиты

| Параметр                       | Значение        |
| ------------------------------ | --------------- |
| Порог перехода на модель 1M    | 260 000 токенов |
| ЖЁСТКИЙ МАКСИМУМ (даже для 1M) | 700 000 токенов |

---

## Приоритеты документов (упрощённая система)

| Приоритет         | Правило                        | Контент в Analysis                  |
| ----------------- | ------------------------------ | ----------------------------------- |
| **CORE**          | Единственный ключевой документ | **Всегда целиком**                  |
| **IMPORTANT**     | Важные вспомогательные         | Целиком если влезаем, иначе summary |
| **SUPPLEMENTARY** | Дополнительные материалы       | **Всегда summary**                  |

---

## Алгоритм распределения токенов

### Терминология приоритетов

| Код               | Название          | Описание                                    |
| ----------------- | ----------------- | ------------------------------------------- |
| **CORE**          | Ключевой документ | Единственный главный документ курса         |
| **IMPORTANT**     | Важные документы  | Средний приоритет, вспомогательные ключевые |
| **SUPPLEMENTARY** | Вспомогательные   | Низкий приоритет, дополнительные материалы  |

### Этап 1: Подготовка (в Stage 2, после Summarization)

```
ДЛЯ КАЖДОГО документа:
  1. Создать summary (независимо от приоритета)
  2. Сохранить: original_tokens, summary_tokens
```

### Этап 2: Расчёт минимального бюджета

```
CORE_full = размер CORE документа (полный) — ОБЯЗАТЕЛЬНО целиком
IMPORTANT_summary = сумма(summary_tokens всех IMPORTANT)
SUPPLEMENTARY_summary = сумма(summary_tokens всех SUPPLEMENTARY)

МИНИМУМ = CORE_full + IMPORTANT_summary + SUPPLEMENTARY_summary
```

### Этап 3: Выбор модели

```
ЕСЛИ МИНИМУМ ≤ 260K:
  → Используем модель 260K
  → Переходим к оптимизации IMPORTANT (Этап 4)

ИНАЧЕ:
  → Используем модель 1M (Gemini для RU, Grok для EN)
  → Переходим к оптимизации IMPORTANT (Этап 4)
  → ЖЁСТКИЙ ЛИМИТ: 700K токенов максимум
```

### Этап 4: Оптимизация IMPORTANT (жадный алгоритм)

```
available_budget = MAX_CONTEXT - CORE_full - SUPPLEMENTARY_summary
  где MAX_CONTEXT = 260K или 700K в зависимости от модели

// Сортируем IMPORTANT по importance_score DESC
sorted_important = IMPORTANT.sort_by(importance_score, DESC)

result = []
remaining = available_budget

ДЛЯ КАЖДОГО doc В sorted_important:
  ЕСЛИ doc.original_tokens ≤ remaining:
    result.add(doc, mode='full_text')
    remaining -= doc.original_tokens
  ИНАЧЕ:
    result.add(doc, mode='summary')
    remaining -= doc.summary_tokens

// SUPPLEMENTARY всегда summary (уже учтены в бюджете)
```

### Итоговое правило (простыми словами)

```
1. CORE — ВСЕГДА целиком (это главный документ)
2. SUPPLEMENTARY — ВСЕГДА только summary (низкий приоритет)
3. IMPORTANT — целиком СКОЛЬКО ВЛЕЗЕТ, остальные summary
4. Если даже минимум не влезает в 260K → переходим на модель 1M
```

---

## Задачи

### T000: Изменение порядка Pipeline в Stage 2

**Статус:** 🔧 Implementation (КРИТИЧНО - делать первым)

**Текущий порядок фаз Stage 2:**

1. Phase 1: Parse (Docling)
2. Phase 2: Validate
3. Phase 3: Classify (приоритизация) ← сейчас здесь
4. Phase 4: Chunking
5. Phase 5: Embedding

**Новый порядок:**

1. Phase 1: Parse (Docling)
2. Phase 2: Validate
3. Phase 3: Chunking (бывший Phase 4)
4. Phase 4: Embedding (бывший Phase 5)
5. Phase 5: Summarization (перенос из Stage 3!)
6. Phase 6: Classify (приоритизация) ← теперь в конце

**Ключевые изменения:**

- Summarization перемещается из Stage 3 в конец Stage 2
- Classify перемещается в конец (после summary)
- Stage 3 становится пустым или удаляется

**Файлы для изменения:**

- `packages/course-gen-platform/src/stages/stage2-document-processing/orchestrator.ts`
- `packages/course-gen-platform/src/stages/stage2-document-processing/phases/` - переименование фаз
- `packages/course-gen-platform/src/stages/stage3-summarization/` - перенос в Stage 2

---

### T001: Исследование - стратегия распределения токенов

**Статус:** 🔬 Research

**Вопросы для исследования:**

1. Как гарантировать, что summary будет нужного размера? (target ~10K для IMPORTANT, ~5K для SUPPLEMENTARY)
2. Нужно ли делать summary ДО расчёта бюджета или можно по требованию?
3. Как обработать edge case: CORE документ > 260K токенов?
4. Стоит ли кэшировать summary между фазами Stage 4?

**Рекомендуемый подход:**

- Summary делается в Stage 3 для ВСЕХ документов
- Размеры сохраняются в `file_catalog.summary_metadata`
- Stage 4 читает размеры и принимает решение

**Артефакты:**

- [ ] Анализ текущего flow Stage 3 → Stage 4
- [ ] Определение точных формул расчёта

---

### T002: Убрать category из системы

**Статус:** 🔧 Implementation

**Файлы для изменения:**

- `packages/shared-types/src/document-prioritization.ts` - убрать DocumentCategorySchema
- `packages/course-gen-platform/src/stages/stage2-document-processing/phases/phase-classification.ts` - убрать category из output
- Все места использования category (grep показал 3 файла)

**Изменения:**

1. Удалить `DocumentCategorySchema` и `DocumentCategory`
2. Заменить `priority: HIGH | LOW` на `priority: CORE | IMPORTANT | SUPPLEMENTARY`
3. Обновить LLM промпт для классификации
4. Обновить UI (NodeDetailsModal уже использует CORE/IMPORTANT/SUPPLEMENTARY)

---

### T003: Редизайн model-selector.ts для Stage 4

**Статус:** 🔧 Implementation

**Новая структура:**

```typescript
export const STAGE4_MODELS = {
  ru: {
    standard: {
      primary: 'qwen/qwen3-235b-a22b-2507',
      fallback: 'moonshotai/kimi-k2-0905',
      maxContext: 260_000,
    },
    extended: {
      primary: 'google/gemini-2.5-flash-preview-09-2025',
      fallback: 'qwen/qwen-plus-2025-07-28',
      maxContext: 1_000_000,
      cacheRead: true, // Важно для Gemini!
    },
  },
  en: {
    standard: {
      primary: 'x-ai/grok-4.1-fast:free',
      fallback: 'moonshotai/kimi-k2-0905',
      maxContext: 260_000,
    },
    extended: {
      primary: 'x-ai/grok-4.1-fast:free',
      fallback: 'moonshotai/kimi-linear-48b-a3b-instruct',
      maxContext: 1_000_000,
    },
  },
} as const;

export const HARD_TOKEN_LIMIT = 700_000; // Даже для 1M моделей
```

---

### T004: Реализация Token Budget Allocator для Stage 4

**Статус:** 🔧 Implementation

**Новый модуль:** `stage4-budget-allocator.ts`

**Функции:**

```typescript
interface DocumentBudgetInfo {
  file_id: string;
  priority: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
  original_tokens: number;
  summary_tokens: number;
}

interface BudgetAllocationResult {
  selectedModel: string;
  selectedTier: 'standard' | 'extended';
  documents: Array<{
    file_id: string;
    mode: 'full_text' | 'summary';
    tokens: number;
  }>;
  totalTokens: number;
  cacheReadEnabled: boolean;
}

function allocateStage4Budget(
  documents: DocumentBudgetInfo[],
  language: 'ru' | 'en'
): BudgetAllocationResult;
```

---

### T005: Интеграция cache-read для Gemini

**Статус:** 🔧 Implementation

**Требования:**

- Gemini cache-read экономит 10x на входящих токенах
- Stage 4 делает несколько вызовов (Phase 1-6) с одинаковым контекстом документов
- Нужно кэшировать document context между фазами

**Исследовать:**

- Как работает cache-read в OpenRouter API
- Можно ли переиспользовать cache между Phase 1-6
- Нужен ли cache-write или только read

---

### T006: Обновление Stage 4 Orchestrator

**Статус:** 🔧 Implementation

**Изменения в `stage4-analysis/orchestrator.ts`:**

1. Перед Phase 1: вызвать `allocateStage4Budget()`
2. Выбрать модель на основе результата
3. Подготовить document context (full_text или summary для каждого)
4. Передать в каждую Phase

---

### T007: Синхронизация UI с новой системой

**Статус:** 🔧 Implementation

**Изменения:**

1. `NodeDetailsModal` - убрать показ category
2. Показывать priority (CORE/IMPORTANT/SUPPLEMENTARY) из output модели
3. Синхронизировать значение в UI с данными classification

---

## Решённые вопросы

1. **Edge case: CORE > 260K** ✅
   - Решение: автоматически переходим на модель 1M
   - CORE документ ВСЕГДА берётся целиком

2. **Cache-read для Gemini** ✅
   - Используем только для текущей сессии (между Phase 1-6)
   - Курсы разные → документы разные → cache между курсами бесполезен

3. **Лимит токенов** ✅
   - ЖЁСТКИЙ ЛИМИТ: 700 000 токенов даже для модели 1M

4. **Fallback модель kimi-linear** ✅
   - Подтверждено: `moonshotai/kimi-linear-48b-a3b-instruct`
   - https://openrouter.ai/moonshotai/kimi-linear-48b-a3b-instruct

## Открытые вопросы

1. **Summary size control**
   - Как гарантировать что summary будет ~10K для IMPORTANT и ~5K для SUPPLEMENTARY?
   - Текущая система задаёт target, но LLM может отклониться

2. **Fallback стратегия**
   - Если primary модель недоступна, используем fallback
   - Нужно ли пересчитывать бюджет для fallback модели?

---

## Ссылки

- Текущая реализация: `packages/course-gen-platform/src/shared/llm/model-selector.ts`
- Budget allocator Stage 3: `packages/course-gen-platform/src/stages/stage3-summarization/phases/budget-allocator.ts`
- Adaptive strategy: `packages/course-gen-platform/src/stages/stage3-summarization/phases/phase-adaptive-strategy.ts`
- Stage 4 orchestrator: `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator.ts`
