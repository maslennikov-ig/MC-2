# План: Clarifying Questions v2 — Custom Input для всех типов

## Статус: Доработка (80% завершено)

---

## Что РЕАЛИЗОВАНО ✅

| Компонент                           | Статус | Файл                          |
| ----------------------------------- | ------ | ----------------------------- |
| БД миграция (question_type, JSONB)  | ✅     | `20260127_question_types.sql` |
| Backend: multi_choice поддержка     | ✅     | `clarifying.router.ts`        |
| Frontend: 3 типа рендеринга         | ✅     | `QuestionCard.tsx`            |
| Frontend: двухфазный выбор          | ✅     | `QuestionCard.tsx`            |
| Frontend: редактирование ответов    | ✅     | `QuestionCard.tsx`            |
| Frontend: custom input для **open** | ✅     | `QuestionCard.tsx`            |

---

## Что НЕ РЕАЛИЗОВАНО ❌

### Проблема 1: Custom input для single_choice и multi_choice

**Текущее состояние:**

- `open` — есть Textarea "Свой вариант" ✅
- `single_choice` — только radio buttons, **НЕТ custom input** ❌
- `multi_choice` — только checkboxes, **НЕТ custom input** ❌

**Из скриншота:**
Вопрос "Какие метрики эффективности продаж важны для компании?" — пользователь не может добавить свой вариант метрики, если её нет в списке.

### Проблема 2: LLM неправильно определяет тип

Вопрос о метриках — явно multi_choice (можно выбрать несколько), но LLM выбрал single_choice.

---

## Решение

### Single Choice с custom input

```
┌─────────────────────────────────────────────┐
│ Какой формат курса предпочтителен?          │
│                                             │
│ ○ Видеолекции с практикой (рекомендуем)     │
│ ○ Текстовые модули с заданиями              │
│ ○ Интерактивные тренажёры                   │
│                                             │
│ ─── или ───                                 │
│                                             │
│ ○ Свой вариант:                             │
│   [ __________________________ ]            │
│                                             │
│              [Подтвердить выбор]            │
└─────────────────────────────────────────────┘
```

### Multi Choice с custom input

```
┌─────────────────────────────────────────────┐
│ Какие метрики включить?                     │
│                                             │
│ ☑ Конверсия (рекомендуем)                   │
│ ☐ Средний чек                               │
│ ☑ Время до покупки (рекомендуем)            │
│ ☐ Лояльность клиентов                       │
│                                             │
│ ─── дополнительно ───                       │
│                                             │
│ ☐ Свой вариант:                             │
│   [ __________________________ ]            │
│                                             │
│              [Подтвердить выбор]            │
└─────────────────────────────────────────────┘
```

---

## План реализации

### Этап 1: Frontend — Custom input для single/multi choice

**Файл:** `packages/web/components/generation-graph/panels/clarifying/QuestionCard.tsx`

#### 1.1 Добавить state для custom input

```typescript
const [customText, setCustomText] = useState('');
const [isCustomSelected, setIsCustomSelected] = useState(false);
```

#### 1.2 В `renderSingleChoiceQuestion()`:

- После списка вариантов добавить разделитель "или"
- Добавить radio "Свой вариант" + Textarea
- При выборе custom → setSelectedSuggestionIndex(null), setIsCustomSelected(true)
- При выборе suggestion → setIsCustomSelected(false)

#### 1.3 В `renderMultiChoiceQuestion()`:

- После списка вариантов добавить разделитель "дополнительно"
- Добавить checkbox "Свой вариант" + Textarea
- Custom вариант добавляется к выбранным (не заменяет их)

#### 1.4 Обновить `hasSelection`:

```typescript
const hasSelection = (() => {
  if (question.type === 'open') {
    return selectedSuggestionIndex !== null || customText.trim().length > 0;
  }
  if (question.type === 'single_choice') {
    return selectedSuggestionIndex !== null || (isCustomSelected && customText.trim().length > 0);
  }
  if (question.type === 'multi_choice') {
    return (
      selectedSuggestionIndexes.length > 0 || (isCustomSelected && customText.trim().length > 0)
    );
  }
  return false;
})();
```

#### 1.5 Обновить `handleConfirmAnswer()`:

```typescript
// Для single_choice с custom
if (question.type === 'single_choice') {
  if (isCustomSelected && customText.trim()) {
    onAnswer(question.id, customText.trim(), 'custom');
  } else if (selectedSuggestionIndex !== null) {
    // existing logic
  }
}

// Для multi_choice с custom
if (question.type === 'multi_choice') {
  const answers = selectedSuggestionIndexes.map(idx => question.suggestedAnswers[idx].text);
  if (isCustomSelected && customText.trim()) {
    answers.push(customText.trim());
  }
  if (answers.length > 0) {
    onAnswer(
      question.id,
      answers,
      isCustomSelected ? 'modified' : 'suggested',
      undefined,
      selectedSuggestionIndexes
    );
  }
}
```

### Этап 2: Backend — Обработка custom answers (минимальные изменения)

**Файл:** `packages/course-gen-platform/src/server/routers/clarifying.router.ts`

Backend уже поддерживает:

- `answerSource: 'custom'` для полностью custom ответов
- `answerSource: 'modified'` для смешанных (выбранные + custom)
- Массивы в `answers` для multi_choice

**Проверить:** что custom answer проходит через `sanitizeAnswerText()` на frontend перед отправкой.

### Этап 3: Промпт — Улучшение определения типа

**Файл:** `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts`

В `buildClarifyingPrompt()` добавить после "QUESTION TYPES":

```
QUESTION TYPE SELECTION RULES:

Use "single_choice" when options are MUTUALLY EXCLUSIVE:
- "What difficulty level?" (only one level possible)
- "What format is preferred?" (one format)
- "What language for the course?" (one language)

Use "multi_choice" when user can SELECT MULTIPLE:
- "What topics to include?" (multiple topics)
- "What metrics are important?" (multiple metrics)
- "What tools to use?" (multiple tools)
- HINT: If question uses plural form ("какие", "which ones") → multi_choice

Use "open" when answer requires FREE TEXT:
- "Describe the target audience"
- "What are the specific learning goals?"
```

---

## Критические файлы

| Файл              | Путь                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------- |
| QuestionCard      | `packages/web/components/generation-graph/panels/clarifying/QuestionCard.tsx`            |
| Clarifying Router | `packages/course-gen-platform/src/server/routers/clarifying.router.ts`                   |
| Phase 0.5         | `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts` |

---

## Верификация

```bash
# 1. Type-check
pnpm type-check

# 2. Build
pnpm build

# 3. Ручной тест
# - Открыть Clarifying Questions
# - single_choice: выбрать "Свой вариант", ввести текст, подтвердить
# - single_choice: проверить что custom ответ сохранился в БД
# - multi_choice: выбрать несколько вариантов + добавить свой
# - multi_choice: проверить что все ответы (выбранные + custom) сохранились
# - Проверить редактирование работает для custom ответов

# 4. Проверить промпт
# - Создать новый курс
# - Дойти до clarifying
# - Убедиться что вопросы типа "Какие метрики..." = multi_choice
```

---

---

## Этап 4: UX улучшения — Кнопка "Продолжить" и Stage Info Panel

### Проблема 3: Кнопка "Продолжить генерацию" в ClarifyingPanel

**Текущее состояние:**

- Кнопка использует `sticky bottom-4` — **висит поверх вопросов**, неудобно
- Пользователю сложно видеть, какие вопросы ещё не отвечены

**Решение:**

- Убрать `sticky` позиционирование
- Кнопка остаётся в самом низу списка вопросов
- Disabled пока не отвечены все критические вопросы (уже работает)
- Показать подсказку "Ответьте на все обязательные вопросы" (уже работает)

**Файл:** `ClarifyingPanel.tsx` line 480-508

```diff
- <motion.div className="sticky bottom-4 mt-6">
+ <motion.div className="mt-6">
```

### Проблема 4: Stage Info Panel показывает неправильную информацию

**Текущее состояние:**

- На этапе `stage_4_clarifying` показывается компонент "Анализ: Ожидание"
- Кнопка "Подтвердить и продолжить" доступна
- Но clarifying ещё не завершён!

**Проблема в коде:**
Stage Info Panel (вероятно в `VerticalPipelineStepper.tsx` или GraphView) не различает:

- `stage_4_clarifying` — clarifying в процессе
- `stage_4_awaiting_approval` — stage 4 завершён, ждёт одобрения

**Решение:**

1. **На этапе `stage_4_clarifying` показывать:**

   ```
   ┌─────────────────────────────────────────────┐
   │ ⚡ Уточняющие вопросы                        │
   │                                             │
   │ Ответьте на вопросы для продолжения         │
   │ генерации курса.                            │
   │                                             │
   │ Прогресс: 2/6 отвечено                      │
   │ [▓▓▓░░░░░░░░░░░░░░░░░] 33%                  │
   │                                             │
   │ [Продолжить генерацию] (disabled)           │
   │ ↳ Ответьте на все обязательные вопросы      │
   └─────────────────────────────────────────────┘
   ```

2. **Кнопка "Продолжить генерацию" дублируется:**
   - В ClarifyingPanel (внизу списка вопросов)
   - В Stage Info Panel (в шапке графа)
   - Обе синхронизированы по состоянию

3. **НЕ показывать "Подтвердить и продолжить"** пока не `stage_4_awaiting_approval`

**Файл:** `packages/web/components/generation-graph/GraphView.tsx` (line 1128)

**Текущий код (проблема):**

```javascript
const showBanner = readOnly
  ? !terminalStatuses.includes(pipelineStatus || '')
  : awaitingStage !== null && (awaitingStage !== 2 || areAllDocumentsComplete());
// → Когда pipelineStatus === 'stage_4_clarifying', awaitingStage=4 → showBanner=true
// → MissionControlBanner показывает "Анализ: Ожидание" + "Подтвердить и продолжить"
```

**Исправление:**

```javascript
const isClarifyingPhase = pipelineStatus === 'stage_4_clarifying';

// НЕ показывать MissionControlBanner на этапе clarifying
const showBanner = readOnly
  ? !terminalStatuses.includes(pipelineStatus || '')
  : awaitingStage !== null &&
    !isClarifyingPhase && // <-- ДОБАВИТЬ
    (awaitingStage !== 2 || areAllDocumentsComplete());

// Показать ClarifyingBanner вместо MissionControlBanner
{
  isClarifyingPhase && (
    <ClarifyingBanner courseId={courseId} onContinue={handleClarifyingComplete} isDark={isDark} />
  );
}
```

**Новый компонент ClarifyingBanner:**

```
┌─────────────────────────────────────────────┐
│ ❓ Уточняющие вопросы                        │
│                                             │
│ Ответьте на вопросы для продолжения         │
│                                             │
│ Прогресс: 2/6 отвечено                      │
│ [▓▓▓░░░░░░░░░░░░░░░░░] 33%                  │
│                                             │
│ [Продолжить генерацию] (disabled)           │
│ ↳ Ответьте на все обязательные вопросы      │
└─────────────────────────────────────────────┘
```

**Файлы для изменения:**

- `GraphView.tsx` — условие showBanner + рендер ClarifyingBanner
- Создать `ClarifyingBanner.tsx` в `packages/web/components/generation-celestial/`

---

## Критические файлы (обновлено)

| Файл             | Путь                                                                                     | Изменения                     |
| ---------------- | ---------------------------------------------------------------------------------------- | ----------------------------- |
| QuestionCard     | `packages/web/components/generation-graph/panels/clarifying/QuestionCard.tsx`            | Custom input для single/multi |
| ClarifyingPanel  | `packages/web/components/generation-graph/panels/clarifying/ClarifyingPanel.tsx`         | Убрать sticky у кнопки        |
| GraphView        | `packages/web/components/generation-graph/GraphView.tsx`                                 | Условие для ClarifyingBanner  |
| ClarifyingBanner | `packages/web/components/generation-celestial/ClarifyingBanner.tsx`                      | **НОВЫЙ**                     |
| Phase 0.5        | `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts` | Улучшить промпт               |

---

## Верификация (обновлено)

```bash
# 1. Type-check
pnpm type-check

# 2. Build
pnpm build

# 3. Ручной тест Clarifying Questions
# - Открыть курс на этапе stage_4_clarifying
# - Проверить что кнопка "Продолжить" НЕ висит поверх вопросов
# - Проверить что Stage Info Panel показывает "Уточняющие вопросы", не "Анализ: Ожидание"
# - Проверить что кнопка "Подтвердить и продолжить" НЕ доступна пока не отвечены все вопросы

# 4. Тест Custom Input
# - single_choice: выбрать "Свой вариант", ввести текст, подтвердить
# - multi_choice: выбрать несколько + добавить свой вариант
# - Проверить сохранение в БД

# 5. Тест промпта
# - Создать новый курс
# - Дойти до clarifying
# - Убедиться что вопросы типа "Какие метрики..." = multi_choice
```

---

## Оценка объёма (обновлено)

| Этап                 | Файл                           | Строк          |
| -------------------- | ------------------------------ | -------------- |
| 1. Custom Input      | QuestionCard.tsx               | ~100           |
| 2. Backend           | —                              | 0 (уже готово) |
| 3. Промпт            | phase-0.5-clarifying.ts        | ~20            |
| 4.1 Кнопка sticky    | ClarifyingPanel.tsx            | ~5             |
| 4.2 ClarifyingBanner | **НОВЫЙ** ClarifyingBanner.tsx | ~150           |
| 4.3 Условие баннера  | GraphView.tsx                  | ~10            |

**Общий объём:** ~285 строк, 5 файлов (1 новый)
