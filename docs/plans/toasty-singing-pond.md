# Plan: Упрощение Clarifying Questions — 1 раунд, максимум 14 вопросов

## Цель

Упростить систему уточняющих вопросов:

- Убрать поддержку 2 раундов (оставить только 1)
- Увеличить максимум вопросов с 7 до 14

## Файлы для изменения

### 1. `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts`

**Изменения:**

1. **Zod схема** (строка ~90):

   ```typescript
   // БЫЛО:
   questions: z.array(ClarifyingQuestionSchema).min(3).max(7);

   // СТАЛО:
   questions: z.array(ClarifyingQuestionSchema).min(3).max(14);
   ```

2. **Удалить `PreviousAnswerSchema`** (строки ~100-105) — больше не нужен

3. **Упростить `Phase05InputSchema`** (строки ~137-145):

   ```typescript
   // БЫЛО:
   iterationRound: z.union([z.literal(1), z.literal(2)]),
   previousAnswers: z.array(PreviousAnswerSchema).optional(),

   // СТАЛО:
   // Удалить оба поля (или оставить iterationRound: z.literal(1) для совместимости)
   ```

4. **Упростить `buildClarifyingPrompt`** (строки ~215-300):
   - Убрать `iterationRound` и `previousAnswers` из деструктуризации
   - Убрать построение `previousAnswersText`
   - Убрать условие `${iterationRound === 2 ? ...}` из промпта

5. **Обновить JSDoc комментарии** (строки ~1-19):
   - Убрать "Supports 2-round iteration for refinement"
   - Обновить описание: "Generates 3-14 context-aware questions"

6. **Функция `storeQuestions`** — оставить `iteration_round` параметр (для совместимости с БД), но всегда передавать 1

### 2. `packages/course-gen-platform/src/server/routers/clarifying.router.ts`

**Изменения:**

1. **Удалить endpoint `requestMoreQuestions`** (строки ~1680-1790):
   - Это endpoint для запуска round 2
   - Полностью удалить

2. **Упростить `getProgress`** (строки ~640-675):

   ```typescript
   // БЫЛО:
   const currentRound = Math.max(...allQuestions.map(q => q.iteration_round), 1);

   // СТАЛО:
   const currentRound = 1; // Always 1, round 2 removed
   ```

### 3. `packages/shared-types/src/clarifying-questions.ts`

**Изменения:**

1. **Тип `ClarifyingProgress`** (строка ~176-177):
   ```typescript
   // Оставить currentRound для обратной совместимости, но добавить комментарий:
   /** @deprecated Always 1. Round 2 removed. */
   currentRound: number;
   ```

### 4. `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator.ts`

**Проверить** (строка 363):

```typescript
iterationRound: 1, // Уже 1, изменений не требуется
```

## Файлы БЕЗ изменений

- **БД миграция не нужна** — колонка `iteration_round` останется, просто всегда будет 1
- **Frontend (ClarifyingPanel.tsx)** — не зависит от round 2

## Verification

```bash
# 1. Type check
pnpm type-check

# 2. Build
pnpm build

# 3. Проверить что phase-0.5-clarifying.ts компилируется
pnpm -F @megacampus/course-gen-platform build

# 4. Ручная проверка: создать курс и убедиться что генерируется до 14 вопросов
```

## Риски

- **Нет рисков**: `requestMoreQuestions` не используется на frontend (проверено grep).

## Оценка

- Простой рефакторинг
- ~100 строк удаления кода
- ~10 строк изменений
