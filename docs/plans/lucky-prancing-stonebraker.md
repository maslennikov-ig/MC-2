# План: Исправление Stage 4 Clarifying Questions

## Проблемы

### Проблема 1: Вопросы не генерируются без файлов

Когда курс создаётся без файлов (этапы 2-3 пропускаются), clarifying questions не генерируются, хотя именно тогда они нужны больше всего — у модели мало информации.

**Причина**: В `orchestrator.ts:335` условие требует `budgetAllocation !== null`:

```typescript
if (clarifyingConfig.enabled && !clarifyingConfig.skipped && budgetAllocation) {
```

Но `budgetAllocation` вычисляется только при наличии документов (строки 280-328).

**Дополнительно**: `phase-0.5-clarifying.ts` требует `budgetAllocation` в схеме Phase05InputSchema (строки 127-130) и использует его в `buildCondensedContext()`.

### Проблема 2: Двойной клик для принятия ответа

При принятии предложенного ответа на открытый вопрос нужно делать два клика:

1. "Принять рекомендацию" — устанавливает локальное состояние
2. "Подтвердить ответ" — сохраняет на сервер

Это избыточно и неудобно.

---

## Решение

### Проблема 1: Генерация вопросов без документов

#### Файл 1: `orchestrator.ts`

**Путь**: `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator.ts`

**Изменение строки 335**:

```typescript
// БЫЛО:
if (clarifyingConfig.enabled && !clarifyingConfig.skipped && budgetAllocation) {

// СТАЛО:
if (clarifyingConfig.enabled && !clarifyingConfig.skipped) {
```

#### Файл 2: `phase-0.5-clarifying.ts`

**Путь**: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts`

**Изменение 1** — схема Phase05InputSchema (строки 126-130):

```typescript
// БЫЛО:
budgetAllocation: z.custom<Stage4BudgetAllocation>(
  val => val !== null && typeof val === 'object' && 'documents' in val,
  { message: 'Invalid budget allocation object' }
),

// СТАЛО:
budgetAllocation: z.custom<Stage4BudgetAllocation | null>(
  val => val === null || (typeof val === 'object' && 'documents' in val),
  { message: 'Invalid budget allocation object' }
).nullable(),
```

**Изменение 2** — функция `buildCondensedContext` (строки 177-197):

```typescript
// БЫЛО:
function buildCondensedContext(budgetAllocation: Stage4BudgetAllocation): string {
  const { documents, breakdown } = budgetAllocation;
  // ...
}

// СТАЛО:
function buildCondensedContext(budgetAllocation: Stage4BudgetAllocation | null): string {
  if (!budgetAllocation) {
    return 'No documents provided. Course will be generated based on title and description only.';
  }
  const { documents, breakdown } = budgetAllocation;
  // ... остальной код без изменений
}
```

**Изменение 3** — logTrace в runPhase05Clarifying (строка 510):

```typescript
// БЫЛО:
documentCount: input.budgetAllocation.documents.length,

// СТАЛО:
documentCount: input.budgetAllocation?.documents.length ?? 0,
```

---

### Проблема 2: Одноклик для принятия ответа

**Файл для изменения:**
`packages/web/components/generation-graph/panels/clarifying/QuestionCard.tsx`

**Подход:** При нажатии "Принять рекомендацию" сразу сохранять ответ на сервер (оптимистичный UI).

**Изменение функции `handleAcceptSuggested`** (строки 186-192):

```typescript
// БЫЛО:
const handleAcceptSuggested = () => {
  if (question.suggestedAnswers.length > 0) {
    setSelectedSuggestionIndex(0);
    setHasCustomInput(false);
    setCustomText('');
  }
};

// СТАЛО:
const handleAcceptSuggested = () => {
  if (question.suggestedAnswers.length > 0 && !isProcessing) {
    // Оптимистично переключаем в answered режим
    setSelectedSuggestionIndex(0);
    setHasCustomInput(false);
    setCustomText('');
    setMode('answered');

    // Сразу сохраняем на сервер
    const answer = question.suggestedAnswers[0].text;
    onAnswer(question.id, answer, 'suggested', 0);
  }
};
```

**Удалить фиолетовый индикатор** (строки 427-437):

```tsx
// УДАЛИТЬ ПОЛНОСТЬЮ:
{
  selectedSuggestionIndex !== null && !hasCustomInput && (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-lg border-2 border-purple-500 bg-purple-50 p-3 dark:bg-purple-950/20"
    >
      <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
        ✓ Выбран рекомендованный ответ
      </p>
    </motion.div>
  );
}
```

**Логика**: После клика на "Принять рекомендацию":

1. UI сразу переходит в `mode: 'answered'` (показывает зелёный блок "Ваш ответ")
2. Ответ отправляется на сервер
3. При ошибке — toast уведомление (уже реализовано в ClarifyingPanel)

---

## Порядок выполнения

1. **Backend**: `phase-0.5-clarifying.ts` — сделать `budgetAllocation` nullable
2. **Backend**: `orchestrator.ts` — убрать `&& budgetAllocation` из условия
3. **Frontend**: `QuestionCard.tsx` — изменить `handleAcceptSuggested`
4. **Frontend**: `QuestionCard.tsx` — удалить фиолетовый индикатор

---

## Файлы для изменения

| Файл                                                                                     | Строки  | Изменение                              |
| ---------------------------------------------------------------------------------------- | ------- | -------------------------------------- |
| `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts` | 127-130 | Nullable схема                         |
| `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts` | 177     | Обработка null в buildCondensedContext |
| `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts` | 510     | Optional chaining в logTrace           |
| `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator.ts`                | 335     | Убрать `&& budgetAllocation`           |
| `packages/web/components/generation-graph/panels/clarifying/QuestionCard.tsx`            | 186-192 | Объединить клики                       |
| `packages/web/components/generation-graph/panels/clarifying/QuestionCard.tsx`            | 427-437 | Удалить индикатор                      |

---

## Верификация

### Тест 1: Курс без файлов

```bash
# 1. Создать курс через UI без загрузки файлов
# 2. Начать генерацию
# 3. Убедиться что на Stage 4 появляются clarifying questions
# 4. Ответить на вопросы
# 5. Убедиться что генерация продолжается в Phase 1
```

### Тест 2: Одноклик принятия

```bash
# 1. Создать курс с файлами в полуавтоматическом режиме
# 2. Дойти до clarifying questions
# 3. На открытом вопросе нажать "Принять рекомендацию"
# 4. Убедиться что:
#    - Сразу показывается зелёный блок "Ваш ответ"
#    - Нет промежуточного фиолетового индикатора
#    - Ответ сохранён на сервере (проверить в БД)
```

### Тест 3: Регрессия

```bash
# 1. Курс С файлами — clarifying questions работают
# 2. single_choice вопросы — один клик = выбор + подтверждение
# 3. multi_choice вопросы — работают как раньше
# 4. Кнопка "Скорректировать" на open вопросах — работает
```

### Type-check

```bash
pnpm type-check
```
