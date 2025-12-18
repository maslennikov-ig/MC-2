# T000: Pipeline Refactoring - Перенос Summarization в Stage 2

> **Статус:** Planning
> **Приоритет:** HIGH
> **Оценка сложности:** L (Large)
> **Дата создания:** 2025-11-30

---

## Содержание

1. [Проблема](#проблема)
2. [Цели рефакторинга](#цели-рефакторинга)
3. [Текущая архитектура](#текущая-архитектура)
4. [Целевая архитектура](#целевая-архитектура)
5. [Ключевые технические решения](#ключевые-технические-решения)
6. [Задачи](#задачи)
7. [Субагенты](#субагенты)
8. [Исследования](#исследования)
9. [Риски и митигации](#риски-и-митигации)
10. [Артефакты](#артефакты)

---

## Проблема

### Текущие ограничения

#### 1. Classification использует только первые 4000 символов
```typescript
// phase-classification.ts:120
const MAX_CONTENT_PREVIEW_LENGTH = 4000;

// phase-classification.ts:425-429
content_preview: truncateContent(
  file.markdown_content || '',
  MAX_CONTENT_PREVIEW_LENGTH
)
```

**Проблема:** Первые 4000 символов часто содержат:
- Оглавление
- Титульную страницу
- Метаинформацию
- НЕ репрезентативный контент документа

**Следствие:** Низкая точность определения приоритетов документов.

#### 2. Summarization отделён от Stage 2
- Stage 3 выполняется ПОСЛЕ Stage 2
- Classification происходит БЕЗ доступа к summary
- Двойная работа: сначала classification с обрезкой, потом summarization

#### 3. Нет учёта языка при расчёте лимитов
- Русский текст: 3.2 символа/токен
- Английский текст: 4.0 символа/токен
- Classification model: 128K контекст (gpt-oss-20b)
- При N документах с summary ~10K токенов каждый — лимит быстро превышается

---

## Цели рефакторинга

### Первичные цели

1. **Повысить точность приоритизации** — использовать ПОЛНЫЕ summary вместо первых 4000 символов
2. **Упростить pipeline** — объединить Summarization и Stage 2
3. **Оптимизировать токен-бюджет** — учитывать язык при расчёте лимитов

### Вторичные цели

4. **Удалить Stage 3** — полностью удалить, не deprecate
5. **Подготовить данные для Stage 4** — summary_tokens, token_count сохранены в file_catalog

---

## Текущая архитектура

### Stage 2: Document Processing (7 фаз)
```
Phase 1: Docling Conversion (PDF/DOCX → Markdown)
Phase 4: Chunking (hierarchical)
Phase 5: Embedding Generation
Phase 6: Qdrant Upload
Phase 7: Classification (приоритизация) ← СЕЙЧАС ЗДЕСЬ
```

### Stage 3: Summarization (4 фазы)
```
Phase 1: Validation + Token Estimation
Phase 2: Hierarchical Summarization (LLM)
Phase 3: Quality Validation (Jina-v3)
Phase 4: Metadata Extraction
```

### Проблемный flow:
```
Document → Stage 2 (Classification с 4000 символами) → Stage 3 (Summary) → Stage 4 (Analysis)
                      ↑                                        ↑
                      └────── НЕТ ДОСТУПА К SUMMARY ───────────┘
```

---

## Целевая архитектура

### Новый Stage 2: Document Processing (8 фаз)
```
Phase 1: Docling Conversion (PDF/DOCX → Markdown)
Phase 2: Validation (не меняется)
Phase 3: Chunking (бывший Phase 4)
Phase 4: Embedding Generation (бывший Phase 5)
Phase 5: Qdrant Upload (бывший Phase 6)
Phase 6: Summarization (ПЕРЕНОС из Stage 3) ← НОВОЕ
Phase 7: Classification (использует Summary!) ← УЛУЧШЕНО
Phase 8: Finalization
```

### Новый flow:
```
Document → Docling → Chunk → Embed → Upload → Summary → Classification → Stage 4
                                               ↑              ↑
                                               └──── SUMMARY ДОСТУПЕН ────┘
```

### Stage 3: Полностью удаляется
- Summarization worker переносится в Stage 2
- Очередь stage3-summarization удаляется
- Весь код Stage 3 удаляется (не deprecate)

---

## Ключевые технические решения

### 1. Token Budget для Classification (130K лимит)

**Модель:** `openai/gpt-oss-20b`
**Max Context:** 128K токенов
**Безопасный лимит:** 100K input + 28K output = 128K

#### Формула расчёта:
```typescript
interface ClassificationBudget {
  totalSummaryTokens: number;     // Сумма всех summary
  availableBudget: number;        // 100_000 (безопасный input)
  fitsAllSummaries: boolean;      // totalSummaryTokens <= availableBudget
  truncationStrategy: 'none' | 'proportional';
}
```

#### Стратегия если summary не влезают: Two-Stage Classification (турнирный подход)

**Принцип:** Разбить документы на группы, СБАЛАНСИРОВАННЫЕ ПО ТОКЕНАМ (не по количеству), классифицировать каждую группу, затем финальная классификация среди "финалистов".

```typescript
interface ClassificationGroup {
  documents: Array<{ file_id: string; summary: string; summary_tokens: number }>;
  totalTokens: number;
}

interface TournamentResult {
  groups: ClassificationGroup[];
  finalistsPerGroup: number;
  requiresTwoStage: boolean;
}

/**
 * Разбивает документы на сбалансированные по токенам группы
 * Пример: 200K токенов → группа A (100K) + группа B (100K)
 * НЕ: 130K + 70K (несбалансированно)
 */
function planTournamentClassification(
  documents: Array<{ file_id: string; summary: string; summary_tokens: number }>,
  availableBudget: number  // 100K для gpt-oss-20b
): TournamentResult {
  const totalTokens = documents.reduce((sum, d) => sum + d.summary_tokens, 0);

  // Если все влезают — одноэтапная классификация
  if (totalTokens <= availableBudget) {
    return {
      groups: [{ documents, totalTokens }],
      finalistsPerGroup: documents.length,  // все проходят
      requiresTwoStage: false,
    };
  }

  // Определяем количество групп (ceil для запаса)
  const numGroups = Math.ceil(totalTokens / availableBudget);
  const targetTokensPerGroup = totalTokens / numGroups;

  // Сортируем по токенам DESC для лучшей балансировки (bin packing)
  const sorted = [...documents].sort((a, b) => b.summary_tokens - a.summary_tokens);

  // Greedy bin packing для балансировки
  const groups: ClassificationGroup[] = Array.from({ length: numGroups }, () => ({
    documents: [],
    totalTokens: 0,
  }));

  for (const doc of sorted) {
    // Находим группу с минимальным текущим весом
    const minGroup = groups.reduce((min, g) =>
      g.totalTokens < min.totalTokens ? g : min
    );
    minGroup.documents.push(doc);
    minGroup.totalTokens += doc.summary_tokens;
  }

  // Рассчитываем финалистов: должны влезть в финальный раунд
  // Финалисты от всех групп должны влезть в availableBudget
  const avgTokensPerDoc = totalTokens / documents.length;
  const maxFinalists = Math.floor(availableBudget / avgTokensPerDoc);
  const finalistsPerGroup = Math.max(2, Math.floor(maxFinalists / numGroups));

  return {
    groups,
    finalistsPerGroup,
    requiresTwoStage: true,
  };
}
```

**Пример работы:**
| Total Tokens | Групп | Токенов/группа | Финалистов/группа | Финальный раунд |
|--------------|-------|----------------|-------------------|-----------------|
| 150K | 2 | ~75K | 3 | 6 документов |
| 200K | 2 | ~100K | 2 | 4 документа |
| 300K | 3 | ~100K | 2 | 6 документов |
| 500K | 5 | ~100K | 2 | 10 документов |

**Важно:** Балансировка по токенам, а не по количеству документов!

### 2. Language-Aware Token Calculation

**Существующий код:** `packages/course-gen-platform/src/shared/llm/token-estimator.ts`

```typescript
const LANGUAGE_RATIOS: Record<string, number> = {
  'rus': 3.2,  // Russian (Cyrillic - denser)
  'eng': 4.0,  // English (baseline)
  'deu': 4.5,  // German (compound words)
  // ...
};
```

**Использование:**
```typescript
import { tokenEstimator } from '../shared/llm/token-estimator';

// Оценка токенов для summary
const summaryTokens = tokenEstimator.estimateTokens(summaryText, language);

// Оценка символов для target budget
const targetChars = targetTokens * tokenEstimator.getLanguageRatio(language);
```

### 3. Model Selection для Classification

**Текущая модель:** `openai/gpt-oss-20b` (128K context)

**Альтернативы если превышен лимит:**
| Модель | Max Context | Использование |
|--------|-------------|---------------|
| `openai/gpt-oss-20b` | 128K | Default (если влезает) |
| `google/gemini-2.5-flash` | 1M | Fallback (если >100K) |

**Решение:**
- Если все summary + prompt <= 100K → gpt-oss-20b
- Если > 100K → gemini-2.5-flash (или proportional truncation)

### 4. Summary Storage

**Текущее хранение:** `file_catalog.processed_content` (summary), `file_catalog.summary_metadata`

**Требуемые поля для Classification:**
```typescript
interface SummaryDataForClassification {
  // Из file_catalog
  file_id: string;
  filename: string;
  processed_content: string;   // Summary text

  // Из summary_metadata
  summary_tokens: number;       // Количество токенов в summary
  original_tokens: number;      // Количество токенов в оригинале
  language: string;             // Язык документа
}
```

---

## Задачи

### Фаза 1: Подготовка (Research & Design)

#### T000.1: Исследование token budget constraints
- **Субагент:** `research-specialist`
- **Описание:** Определить точные лимиты и стратегии обработки
- **Артефакты:**
  - Документ с расчётами токен-бюджетов
  - Тесты на реальных данных
- **Зависимости:** Нет

#### T000.2: Анализ Stage 3 кода для переноса
- **Субагент:** `Explore`
- **Описание:** Определить какие модули переносятся, какие остаются
- **Артефакты:**
  - Список файлов для переноса
  - Список изменений импортов
- **Зависимости:** Нет

### Фаза 2: Перенос Summarization

#### T000.3: Создать Phase 6 Summarization в Stage 2
- **Субагент:** `fullstack-nextjs-specialist`
- **Описание:** Перенести логику summarization из Stage 3 в новую фазу Stage 2
- **Файлы:**
  - Создать: `packages/course-gen-platform/src/stages/stage2-document-processing/phases/phase-6-summarization.ts`
  - Обновить: `packages/course-gen-platform/src/stages/stage2-document-processing/orchestrator.ts`
- **Артефакты:**
  - Новый файл phase-6-summarization.ts
  - Обновлённый orchestrator.ts
- **Зависимости:** T000.1, T000.2

#### T000.4: Обновить Phase 7 Classification для использования Summary
- **Субагент:** `fullstack-nextjs-specialist`
- **Описание:** Переписать classification для работы с полными summary
- **Ключевые изменения:**
  - Убрать `MAX_CONTENT_PREVIEW_LENGTH = 4000`
  - Добавить чтение `processed_content` (summary)
  - Добавить proportional truncation если не влезает
  - Добавить language-aware token calculation
- **Файлы:**
  - Обновить: `packages/course-gen-platform/src/stages/stage2-document-processing/phases/phase-classification.ts`
- **Артефакты:**
  - Обновлённый phase-classification.ts с новой логикой
- **Зависимости:** T000.3

### Фаза 3: Cleanup & Migration

#### T000.5: Обновить Stage 2 Orchestrator
- **Субагент:** `fullstack-nextjs-specialist`
- **Описание:** Интегрировать новые фазы, обновить progress tracking
- **Ключевые изменения:**
  - Добавить вызов Phase 6 (Summarization)
  - Обновить прогресс-бары (%)
  - Добавить логирование
- **Зависимости:** T000.3, T000.4

#### T000.6: Delete Stage 3
- **Субагент:** `fullstack-nextjs-specialist`
- **Описание:** Полностью удалить Stage 3 код и связанные файлы
- **Файлы для удаления:**
  - `packages/course-gen-platform/src/stages/stage3-summarization/` (вся директория)
  - Связанные workers и handlers
  - Ссылки из других частей кодовой базы
- **Зависимости:** T000.5

#### T000.7: Обновить workers и handlers
- **Субагент:** `bullmq-worker-specialist`
- **Описание:** Обновить BullMQ workers для нового flow
- **Ключевые изменения:**
  - Stage 2 worker должен вызывать summarization inline
  - Stage 3 worker становится optional/deprecated
- **Зависимости:** T000.5

### Фаза 4: Testing & Validation

#### T000.8: Unit tests для новых фаз
- **Субагент:** `test-writer`
- **Описание:** Написать тесты для Phase 6 и обновлённого Phase 7
- **Тесты:**
  - Phase 6: summarization integration
  - Phase 7: classification with full summary
  - Proportional truncation logic
  - Language-aware token calculation
- **Зависимости:** T000.4, T000.5

#### T000.9: Integration tests
- **Субагент:** `integration-tester`
- **Описание:** E2E тесты полного pipeline
- **Зависимости:** T000.7

---

## Субагенты

### Назначение по задачам

| Задача | Субагент | Обоснование |
|--------|----------|-------------|
| T000.1 | `research-specialist` | Исследование лимитов, расчёты |
| T000.2 | `Explore` | Анализ кодовой базы |
| T000.3 | `fullstack-nextjs-specialist` | Создание новой фазы |
| T000.4 | `fullstack-nextjs-specialist` | Рефакторинг classification |
| T000.5 | `fullstack-nextjs-specialist` | Интеграция в orchestrator |
| T000.6 | `fullstack-nextjs-specialist` | Deprecation |
| T000.7 | `bullmq-worker-specialist` | Worker updates |
| T000.8 | `test-writer` | Unit tests |
| T000.9 | `integration-tester` | E2E tests |

### Параллельность

```
Фаза 1 (параллельно):
├── T000.1 (research-specialist)
└── T000.2 (Explore)

Фаза 2 (последовательно):
├── T000.3 (depends on T000.1, T000.2)
└── T000.4 (depends on T000.3)

Фаза 3 (последовательно):
├── T000.5 (depends on T000.3, T000.4)
├── T000.6 (depends on T000.5)
└── T000.7 (depends on T000.5)

Фаза 4 (параллельно):
├── T000.8 (depends on T000.5)
└── T000.9 (depends on T000.7)
```

---

## Исследования

### R001: Token Budget Calculation

**Вопрос:** Как распределить токен-бюджет между N документами для classification?

**Параметры:**
- Model context: 128K tokens (gpt-oss-20b)
- Safe input budget: ~100K tokens
- System prompt: ~2K tokens
- Available for summaries: ~98K tokens

**Сценарии:**

| N документов | Avg Summary | Total Tokens | Стратегия |
|--------------|-------------|--------------|-----------|
| 5 | 10K | 50K | Все целиком |
| 10 | 10K | 100K | Все целиком (на границе) |
| 15 | 10K | 150K | Proportional (65% каждого) |
| 20 | 10K | 200K | Proportional (50% каждого) |

**Формула:**
```
allocation_ratio = min(1.0, available_budget / total_summary_tokens)
per_document_chars = summary_chars * allocation_ratio
```

### R002: Language Impact on Tokens

**Вопрос:** Насколько различается токенизация для RU vs EN?

**Данные из token-estimator.ts:**
- Russian: 3.2 chars/token
- English: 4.0 chars/token
- Ratio difference: 25%

**Пример:**
| Текст | Символы | Токены (RU) | Токены (EN) |
|-------|---------|-------------|-------------|
| 10K chars | 10,000 | 3,125 | 2,500 |
| 50K chars | 50,000 | 15,625 | 12,500 |

**Вывод:** Для русского текста нужно на 25% больше токенов.

### R003: Quality Impact of Truncation

**Вопрос:** Как влияет обрезка summary на качество classification?

**Гипотеза:**
- 100% summary → базовая точность
- 70% summary → -5% точности
- 50% summary → -15% точности
- 30% summary → -30% точности

**Требуется тестирование:**
1. Взять 10 реальных курсов
2. Сделать classification с полными summary
3. Повторить с 70%, 50%, 30% truncation
4. Сравнить результаты

---

## Риски и митигации

### Риск 1: Увеличение времени Stage 2
**Описание:** Добавление summarization увеличит время обработки
**Митигация:**
- Summarization уже асинхронный
- Можно параллелить с embedding (Phase 4-5)
- Добавить progress tracking для UX

### Риск 2: Память при больших документах
**Описание:** Хранение summary в памяти для classification
**Митигация:**
- Summary обычно 10K токенов (~32K chars)
- 20 документов × 32K = 640KB — приемлемо
- При необходимости — streaming

### Риск 3: Regression в Classification
**Описание:** Новая логика может давать другие результаты
**Митигация:**
- A/B тестирование на staging
- Сохранить старую логику как fallback
- Метрики качества classification

### Риск 4: Stage 3 dependencies
**Описание:** Другие части системы могут зависеть от Stage 3
**Митигация:**
- Поиск по codebase на использование Stage 3 (T000.2)
- Обновить все ссылки перед удалением
- Полное удаление после миграции

---

## Артефакты

### Создаваемые файлы
- [ ] `packages/course-gen-platform/src/stages/stage2-document-processing/phases/phase-6-summarization.ts`
- [ ] `packages/course-gen-platform/src/stages/stage2-document-processing/utils/classification-budget.ts`
- [ ] `packages/course-gen-platform/src/stages/stage2-document-processing/utils/tournament-classification.ts` (two-stage classification)

### Обновляемые файлы
- [ ] `packages/course-gen-platform/src/stages/stage2-document-processing/orchestrator.ts`
- [ ] `packages/course-gen-platform/src/stages/stage2-document-processing/phases/phase-classification.ts`

### Удаляемые файлы
- [ ] `packages/course-gen-platform/src/stages/stage3-summarization/` (вся директория)

### Документация
- [ ] Обновить `docs/specs/stage4-token-budget-redesign.md`
- [ ] Создать ADR для архитектурного решения

---

## Checklist готовности к выполнению

- [x] Проблема описана
- [x] Цели определены
- [x] Текущая архитектура задокументирована
- [x] Целевая архитектура спроектирована
- [x] Технические решения описаны
- [x] Задачи декомпозированы
- [x] Субагенты назначены
- [x] Зависимости определены
- [x] Риски идентифицированы
- [ ] Исследования завершены (T000.1, T000.2)
- [ ] Тестирование спланировано

---

## Следующие шаги

1. **Запустить T000.1** (research-specialist) — исследование token budget
2. **Запустить T000.2** (Explore) — анализ Stage 3 кода
3. После завершения Research → приступить к T000.3 (создание Phase 6)

---

## История изменений

| Дата | Автор | Изменение |
|------|-------|-----------|
| 2025-11-30 | Claude | Создание документа |
