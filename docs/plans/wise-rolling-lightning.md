# План: Улучшение UX кнопок в Clarifying Questions

## Проблема

На экране уточняющих вопросов (Stage 4) одновременно показываются две яркие кнопки:

1. **"Подтвердить ответ"** (внутри карточки вопроса) — primary purple
2. **"Продолжить генерацию"** (внизу страницы) — primary purple

**Проблемы:**

- Две яркие кнопки отвлекают внимание
- "Продолжить генерацию" вводит в заблуждение — пользователь может думать, что генерация продолжится без ответов
- На самом деле "Продолжить генерацию" означает "пропустить необязательные вопросы"

## Текущая логика

```tsx
// WizardNavigation.tsx — большая кнопка показывается когда все critical отвечены
canContinue = allCriticalAnswered;

// QuestionCard.tsx:171 — пропустить можно ТОЛЬКО nice_to_have (серые)
const canSkip = question.priority === 'nice_to_have' && onSkip;
```

**Проблема:** Кнопка "Пропустить" НЕ показывается для important (жёлтых) вопросов!

## Выбранное решение

### Новый UX:

1. **Убрать большую кнопку "Продолжить генерацию"** из нижней части (пока не все отвечены)
2. **Переместить кнопку "Пропустить"** в навигацию (рядом с "Далее"):
   - Показывать **только для nice_to_have** (серые) вопросов — как сейчас
   - Маленькая ghost кнопка
3. **Когда все вопросы отвечены**:
   - Убрать "Далее" и "Пропустить"
   - Показать одну кнопку "Продолжить генерацию"
4. **Автоматическое продолжение**: НЕ добавляем — пользователь должен явно подтвердить

### Визуальный результат:

**Не все отвечены, текущий вопрос можно пропустить:**

```
[Подтвердить ответ]
< Назад        [Пропустить]  Далее >
```

**Все вопросы отвечены:**

```
✓ Все вопросы отвечены
[Продолжить генерацию]
```

## Файлы для изменения

1. **`packages/web/components/generation-graph/panels/clarifying/wizard/WizardNavigation.tsx`**
2. **`packages/web/components/generation-graph/panels/clarifying/ClarifyingPanel.tsx`**
3. **`packages/web/components/generation-graph/panels/clarifying/QuestionCard.tsx`** (убрать кнопку Пропустить из карточки)

## План реализации

### Шаг 1: Обновить WizardNavigation.tsx

```tsx
interface WizardNavigationProps {
  // ... existing props
  canSkipCurrent?: boolean      // Можно ли пропустить текущий вопрос
  onSkip?: () => void           // Handler для пропуска
  isComplete?: boolean          // Все вопросы отвечены
}

// Новая структура:
{isComplete ? (
  // Все отвечены — показать только "Продолжить генерацию"
  <Button onClick={onContinue} className="w-full bg-purple-600">
    Продолжить генерацию
  </Button>
) : (
  // Не все отвечены — навигация с опциональным "Пропустить"
  <div className="flex items-center justify-between">
    <Button variant="outline" onClick={onPrev}>
      < Назад
    </Button>

    <div className="flex items-center gap-2">
      {canSkipCurrent && (
        <Button variant="ghost" size="sm" onClick={onSkip}>
          Пропустить
        </Button>
      )}
      <Button variant="outline" onClick={onNext}>
        Далее >
      </Button>
    </div>
  </div>
)}
```

### Шаг 2: Обновить ClarifyingPanel.tsx

```tsx
// Определить, можно ли пропустить текущий вопрос (только nice_to_have)
const canSkipCurrent = currentQuestion?.priority === 'nice_to_have' &&
                       !answeredQuestions.has(currentQuestion?.id)

// Передать новые props
<WizardNavigation
  // ... existing props
  canSkipCurrent={canSkipCurrent}
  onSkip={() => handleSkip(currentQuestion.id)}
  isComplete={isComplete}
  onContinue={handleContinue}
  isProcessing={approveAndProceedMutation.isPending}
  // Убрать: canContinue={allCriticalAnswered}
/>
```

### Шаг 3: Убрать кнопку "Пропустить" из QuestionCard.tsx

Удалить блок (строки 740-750):

```tsx
{canSkip && !isEditing && (
  <Button ... onClick={() => onSkip(question.id)}>
    Пропустить
  </Button>
)}
```

## Проверка

1. Запустить DEV сервер: `pnpm dev`
2. Открыть курс на этапе Stage 4 clarifying
3. Проверить:
   - На critical (красный) — нет кнопки "Пропустить"
   - На important (жёлтый) — нет кнопки "Пропустить"
   - На nice_to_have (серый) — есть кнопка "Пропустить" рядом с "Далее"
   - При всех отвеченных — только кнопка "Продолжить генерацию"
   - Большая кнопка "Продолжить генерацию" НЕ показывается до завершения всех вопросов
