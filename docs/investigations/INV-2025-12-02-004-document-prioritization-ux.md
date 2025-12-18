# INV-2025-12-02-004: Улучшение UX приоритизации документов

## Статус: ГОТОВО К РЕАЛИЗАЦИИ

## Дата: 2025-12-02

---

## Описание проблем

### Проблема 1: Popup-паттерн не соответствует UI/UX пайплайна

**Текущее поведение:**
- После Stage 3 (Classification) появляется всплывающее окно `PrioritizationPanel`
- Это единственное место в пайплайне, где используется popup
- Если закрыть popup, его нельзя открыть заново без обновления страницы
- Нарушает консистентность интерфейса

**Желаемое поведение:**
- Когда приоритизация завершена, автоматически открывается NodeDetailsModal для ноды "Приоритизация документов"
- Приоритеты видны в модальном окне
- Там же можно изменить приоритеты
- Консистентно с остальным UI (все детали через NodeDetailsModal)

### Проблема 2: Модель постоянно выбирает "SUPPLEMENTARY"

**Наблюдение:**
- При тестировании модель классифицирует все документы как "SUPPLEMENTARY" (дополнительные)
- Даже техническое задание на курс по продажам было помечено как дополнительное

**Корневые причины (из исследований):**
1. **RLHF-induced hedging** — модели обучены избегать "уверенных" утверждений, SUPPLEMENTARY воспринимается как "безопасный" выбор
2. **Majority label bias** — в обучающих данных большинство документов не являются "ключевыми"
3. **Recency bias** — если SUPPLEMENTARY идет последним в списке категорий, модель чаще его выбирает
4. **Отсутствие Feature Extraction** — модель не ищет специфические сигналы перед классификацией

---

## Анализ текущей реализации

### Backend: Stage 3 Classification

**Файл:** `packages/course-gen-platform/src/stages/stage3-classification/phases/phase-classification.ts`

#### Что уже реализовано хорошо:

✅ **Comparative/Batch Classification** — один LLM вызов для ВСЕХ документов (не Pointwise!)
```typescript
// Главная функция использует сравнительный подход
async function classifyDocumentsComparatively(
  fileMetadataList: FileMetadata[],
  courseContext: { title: string; description: string }
): Promise<ComparativeClassificationResponse>
```

✅ **Tournament Mode** — для больших курсов (>100K tokens) двухфазная классификация

✅ **Distribution Constraints** — встроены в промт:
```
- Exactly 1 document must be CORE (no more, no less)
- Maximum ${maxImportant} documents can be IMPORTANT (~30%)
- Remaining SUPPLEMENTARY documents
```

✅ **Auto-fix Logic** — если LLM нарушает constraints:
```typescript
// Auto-fix: promote highest ranked to CORE
if (coreCount === 0 && classifications.length > 0) {
  classifications[0].priority = 'CORE';
}
```

✅ **Structured Output** — использует LangChain `withStructuredOutput()` для надежного JSON

✅ **Rationale** — требует объяснение для каждой классификации

#### Что отсутствует:

❌ **Feature Extraction** — нет явного анализа сигналов (learning objectives, grading criteria, etc.)

❌ **"Default UP" правило** — нет инструкции предпочитать более высокий приоритет при неуверенности

❌ **Anti-Conservative-Bias** — нет явных директив против bias к SUPPLEMENTARY

❌ **Confidence Scores** — нет tracking uncertainty для человеческой проверки

❌ **Metadata as Prior** — filename ("Syllabus.pdf") не используется как сильный сигнал

### Текущий промт классификации:

```typescript
const systemMessage = `You are a document classification expert for educational content.

TASK: Classify ALL documents by their importance for course generation using COMPARATIVE ranking.

PRIORITY LEVELS:
- CORE: The single most important document (exactly 1). This is THE primary course material.
- IMPORTANT: Key supporting documents (maximum ${maxImportant} documents, ~30% of total).
- SUPPLEMENTARY: Additional materials (remaining documents).

CONSTRAINTS (MUST FOLLOW):
- Exactly 1 document must be CORE (no more, no less)
- Maximum ${maxImportant} documents can be IMPORTANT
- All remaining documents are SUPPLEMENTARY

CLASSIFICATION STRATEGY:
1. Compare ALL documents against each other
2. Identify the single most important document for the core course content
3. Identify the top ~30% that are critical supporting materials
4. Assign the rest as supplementary

Be decisive and comparative. Don't mark everything as important - truly distinguish which materials are essential versus supplementary.`
```

**Проблема:** Промт не содержит:
- Конкретных сигналов для каждой категории
- Инструкции "default UP not down"
- Использования filename как сильного prior

### Frontend: PrioritizationPanel

**Файл:** `packages/web/components/generation-graph/panels/PrioritizationPanel.tsx`

#### Что реализовано хорошо:

✅ **Редактирование приоритетов** — Select dropdown для каждого документа
✅ **Real-time updates** — изменения сохраняются сразу через `updateDocumentPriority`
✅ **Approve/Cancel** — кнопки для продолжения или отмены генерации
✅ **Priority indicators** — цветовое кодирование (CORE=amber, IMPORTANT=blue, SUPPLEMENTARY=gray)
✅ **Distribution summary** — показывает количество документов по категориям

#### Что нужно исправить:

❌ **Popup вместо Inspector** — отдельный modal, не интегрирован с NodeDetailsModal
❌ **Нельзя переоткрыть** — после закрытия нужно обновить страницу
❌ **Нет в графе** — состояние "awaiting_approval" не отображается визуально на ноде

---

## Выводы из исследований

### UX: Рекомендуемый паттерн — Inspector Panel

**Источник:** `docs/research/UX Patterns for Workflow Data Editing.md`

#### Ключевые выводы:

1. **Дихотомия "Холст — Хром"**: Разделение между Canvas (граф) и Chrome (панели управления). Инспектор свойств — стандарт для сложных редакторов (Unity, Houdini, Figma).

2. **Паттерн Master-Detail**: Граф служит навигацией, детальное редактирование — в боковой панели. Клик на узел → панель показывает детали.

3. **Для Approval Gates**:
   - Узел должен визуально отличаться (ромб, янтарный цвет для "ожидания")
   - Клик открывает **Review Modal/Panel** с артефактом, контекстом и действиями
   - Кнопки "Утвердить" / "Отклонить" с обязательным комментарием

4. **Приоритизация по Linear**:
   - Иконография вместо текста (сигнальные полоски)
   - Цветовое кодирование (красный → оранжевый → желтый → серый)
   - Изменение через Popover в 2 клика
   - Горячие клавиши (1, 2, 3 для быстрой смены)

### ML: Стратегии борьбы с консервативным bias

**Источники:**
- `docs/research/LLM Document Classification Prompting Strategies.md`
- `docs/research/Fixing LLM conservative bias in document classification.md`

#### Что нужно добавить в промт:

##### 1. Feature Extraction перед классификацией (Chain-of-Thought)

```
STEP 1: For each document, identify signals:

CORE SIGNALS (check all present):
□ Learning objectives ("By the end of...", "Students will...")
□ Grading criteria or assessment weights
□ "Required reading" or "required text" language
□ Course schedule with dates
□ Prerequisites listed
□ Filename contains "Syllabus", "ТЗ", "Curriculum"

IMPORTANT SIGNALS:
□ Practice exercises or discussion questions
□ "Case study" or "worked example" labels
□ Lab guides and tutorial content

SUPPLEMENTARY SIGNALS:
□ "Optional", "recommended", "further reading" labels
□ Primarily citation lists (bibliography format)
□ "Appendix", "glossary", or "index" designation

STEP 2: Apply classification rules:
- CORE signals override IMPORTANT
- IMPORTANT overrides SUPPLEMENTARY
```

##### 2. "Default UP" правило

```
CLASSIFICATION RULES:
1. Default UP not down: When uncertain, choose HIGHER priority
2. Instructional content defaults to IMPORTANT minimum (never SUPPLEMENTARY unless explicitly optional)
3. Any document with learning objectives = CORE or IMPORTANT, never SUPPLEMENTARY
4. SUPPLEMENTARY requires explicit "optional" indicators OR pure reference format (bibliography)

CRITICAL: Do NOT classify primary instructional content as SUPPLEMENTARY.
A syllabus is ALWAYS CORE. A textbook chapter is ALWAYS CORE or IMPORTANT.
```

##### 3. Metadata как сильный prior

```
METADATA PRIOR:
Use filename as strong signal:
- If filename contains 'Syllabus', 'ТЗ', 'Curriculum', 'Program' → start with 90% confidence it is CORE
- If filename contains 'Chapter', 'Lecture', 'Module' → likely IMPORTANT
- If filename contains 'Appendix', 'Bibliography', 'Optional' → likely SUPPLEMENTARY
```

##### 4. Confidence Scores

```typescript
// Добавить в схему ответа
const ComparativeDocumentClassificationSchema = z.object({
  id: z.string().uuid(),
  priority: DocumentPriorityLevelSchema,
  rationale: z.string().min(10),
  confidence: z.number().min(0).max(1).describe('Confidence score 0.0-1.0'),
  signals_found: z.object({
    core: z.array(z.string()),
    important: z.array(z.string()),
    supplementary: z.array(z.string()),
  }),
});
```

---

## План реализации

### Блок 1: UX — Интеграция с NodeDetailsModal

**Принцип:** Не создавать отдельную панель, а расширить существующий NodeDetailsModal.

#### Задача 1.1: Добавить PrioritizationSection в NodeDetailsModal

**Файлы:**
- `packages/web/components/generation-graph/panels/NodeDetailsModal/index.tsx`

**Изменения:**
1. При `nodeType === 'stage'` и `stageNumber === 3` показывать секцию приоритизации
2. Переиспользовать логику из `PrioritizationPanel.tsx`:
   - Таблица документов с Select для приоритета
   - Кнопки "Подтвердить" / "Отменить"
3. Данные загружать из `file_catalog` как сейчас

```tsx
// В NodeDetailsModal при stage 3
{nodeType === 'stage' && stageNumber === 3 && (
  <PrioritizationSection
    courseId={courseId}
    onApproved={handleApproved}
  />
)}
```

#### Задача 1.2: Визуальное состояние "awaiting_approval" для Stage 3

**Файлы:**
- `packages/web/components/generation-graph/nodes/StageNode.tsx`

**Изменения:**
1. Добавить состояние `awaiting` (янтарный цвет, пульсирующая анимация)
2. При `courseStatus === 'stage_3_awaiting_approval'` показывать это состояние

#### Задача 1.3: Автоматический выбор Stage 3 после классификации

**Файлы:**
- `packages/web/stores/useGenerationStore.ts`
- `packages/web/components/generation-graph/GraphView.tsx`

**Логика:**
1. Когда приходит trace с `stage: 'stage_3'` и `phase: 'complete'`
2. Автоматически установить `selectedNode = stage_3_node_id`
3. Открыть NodeDetailsModal

#### Задача 1.4: Deprecate PrioritizationPanel

- Удалить `PrioritizationPanel.tsx` после миграции
- Убрать логику показа popup из `GraphView.tsx`

---

### Блок 2: ML — Улучшение промта классификации

#### Задача 2.1: Добавить Feature Extraction в промт

**Файл:** `packages/course-gen-platform/src/stages/stage3-classification/phases/phase-classification.ts`

**Изменения в `buildComparativeClassificationPrompt`:**

```typescript
const systemMessage = new SystemMessage(`You are a document classification expert for educational content.

TASK: Classify ALL documents by their importance for course generation using COMPARATIVE ranking.

PRIORITY LEVELS:
- CORE: The single most important document (exactly 1). Primary course material.
- IMPORTANT: Key supporting documents (maximum ${maxImportant} documents, ~30% of total).
- SUPPLEMENTARY: Additional materials (remaining documents).

=== STEP 1: IDENTIFY SIGNALS FOR EACH DOCUMENT ===

CORE SIGNALS (look for these):
□ Learning objectives ("By the end of...", "Students will...", "Цели обучения")
□ Grading criteria, assessment weights, exam structure
□ Course schedule with dates and deadlines
□ "Required reading" or "обязательная литература"
□ Prerequisites listed
□ Filename contains: Syllabus, ТЗ, Curriculum, Program, Программа

IMPORTANT SIGNALS:
□ Practice exercises, discussion questions
□ Case studies, worked examples
□ Lab guides, tutorial content
□ Chapter or lecture content

SUPPLEMENTARY SIGNALS:
□ "Optional", "recommended", "further reading", "дополнительно"
□ Bibliography, citation lists
□ Appendix, glossary, index

=== STEP 2: APPLY CLASSIFICATION RULES ===

1. DEFAULT UP NOT DOWN: When uncertain, choose the HIGHER priority category
2. Any document with learning objectives = CORE or IMPORTANT, NEVER SUPPLEMENTARY
3. SUPPLEMENTARY requires explicit "optional" indicators OR pure reference format
4. If filename contains syllabus/ТЗ/curriculum keywords → MUST be CORE unless proven otherwise

CRITICAL: Do NOT classify primary instructional content as SUPPLEMENTARY.
A syllabus is ALWAYS CORE. A technical specification (ТЗ) is ALWAYS CORE.

=== CONSTRAINTS (MUST FOLLOW) ===
- Exactly 1 document must be CORE (no more, no less)
- Maximum ${maxImportant} documents can be IMPORTANT
- All remaining documents are SUPPLEMENTARY

OUTPUT FORMAT:
For each document, provide:
- id: UUID
- priority: CORE/IMPORTANT/SUPPLEMENTARY
- signals_found: { core: [...], important: [...], supplementary: [...] }
- confidence: 0.0-1.0
- rationale: Brief explanation referencing the signals found`);
```

#### Задача 2.2: Обновить схему ответа с confidence и signals

**Изменения в схеме:**

```typescript
const ComparativeDocumentClassificationSchema = z.object({
  id: z.string().uuid().describe('Document UUID from database'),
  priority: DocumentPriorityLevelSchema,
  signals_found: z.object({
    core: z.array(z.string()).describe('CORE signals found in document'),
    important: z.array(z.string()).describe('IMPORTANT signals found'),
    supplementary: z.array(z.string()).describe('SUPPLEMENTARY signals found'),
  }),
  confidence: z.number().min(0).max(1).describe('Classification confidence 0.0-1.0'),
  rationale: z.string().min(10).describe('Explanation referencing signals'),
});
```

#### Задача 2.3: Добавить Confidence Gating

**Логика после классификации:**

```typescript
// После получения результатов от LLM
function validateWithConfidenceGating(
  results: ComparativeClassificationResponse
): void {
  for (const classification of results.classifications) {
    // Если core_signals не пусто, но classification = SUPPLEMENTARY → это подозрительно
    if (
      classification.signals_found.core.length > 0 &&
      classification.priority === 'SUPPLEMENTARY'
    ) {
      logger.warn({
        id: classification.id,
        coreSignals: classification.signals_found.core,
        classification: classification.priority,
      }, 'Suspicious classification: document has CORE signals but classified as SUPPLEMENTARY');

      // Auto-fix: promote to at least IMPORTANT
      classification.priority = 'IMPORTANT';
    }

    // Low confidence → flag for human review
    if (classification.confidence < 0.7) {
      logger.info({
        id: classification.id,
        confidence: classification.confidence,
      }, 'Low confidence classification - recommend human review');
    }
  }
}
```

---

## Файлы для изменения

### UX (Блок 1)
| Файл | Изменение |
|------|-----------|
| `packages/web/components/generation-graph/panels/NodeDetailsModal/index.tsx` | Добавить PrioritizationSection для Stage 3 |
| `packages/web/components/generation-graph/nodes/StageNode.tsx` | Добавить визуальное состояние "awaiting" |
| `packages/web/stores/useGenerationStore.ts` | Автоматический выбор Stage 3 после классификации |
| `packages/web/components/generation-graph/panels/PrioritizationPanel.tsx` | Удалить после миграции |

### ML (Блок 2)
| Файл | Изменение |
|------|-----------|
| `packages/course-gen-platform/src/stages/stage3-classification/phases/phase-classification.ts` | Обновить промт, схему, добавить confidence gating |

---

## Критерии успеха

### UX
- [ ] При Stage 3 "awaiting_approval" нода подсвечивается янтарным
- [ ] Клик на Stage 3 ноду открывает NodeDetailsModal с приоритизацией
- [ ] Modal можно открыть/закрыть в любой момент после Stage 3
- [ ] Редактирование приоритетов работает как раньше
- [ ] PrioritizationPanel удален

### ML
- [ ] Промт содержит Feature Extraction (сигналы для каждой категории)
- [ ] Промт содержит "Default UP" правило
- [ ] Схема ответа включает confidence и signals_found
- [ ] Confidence gating логирует подозрительные классификации
- [ ] Хотя бы 1 документ классифицируется как CORE в каждом курсе
- [ ] Syllabus/ТЗ не классифицируется как SUPPLEMENTARY

---

## Оценка сложности

| Задача | Сложность | Время |
|--------|-----------|-------|
| 1.1 PrioritizationSection в NodeDetailsModal | Средняя | 2-3 часа |
| 1.2 Визуальное состояние "awaiting" | Низкая | 30 мин |
| 1.3 Автоматический выбор Stage 3 | Низкая | 1 час |
| 1.4 Удаление PrioritizationPanel | Низкая | 30 мин |
| 2.1 Обновление промта | Низкая | 1 час |
| 2.2 Обновление схемы | Низкая | 30 мин |
| 2.3 Confidence gating | Низкая | 1 час |
| **Тестирование** | Средняя | 2 часа |

**Итого: ~9-10 часов**

---

## Связанные исследования

| Файл | Тема |
|------|------|
| `docs/research/UX Patterns for Workflow Data Editing.md` | UX паттерны для визуальных редакторов |
| `docs/research/LLM Document Classification Prompting Strategies.md` | Стратегии промтинга для классификации |
| `docs/research/Fixing LLM conservative bias in document classification.md` | Борьба с консервативным bias |
| `docs/research/Why LLMs default to low-importance labels.md` | Причины default к низким приоритетам |

---

## Рекомендуемый порядок реализации

1. **ML сначала** — обновить промт (30 мин) и протестировать качество классификации
2. **UX параллельно** — интегрировать приоритизацию в NodeDetailsModal
3. **После обоих** — удалить PrioritizationPanel и провести полное тестирование

ML изменения минимальны и дадут быстрый результат. UX изменения более объемные, но логически независимы.
