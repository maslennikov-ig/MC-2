# План: Self-Reflection в автоматическом режиме Phase 0.5

> **Статус**: Готов к реализации
> **Дата**: 2026-01-26
> **Выбранный вариант**: B) Self-Reflection + UI нода

---

## Цель

1. В `automatic` режиме генерировать clarifying questions и автоматически выбирать suggested answers
2. Показывать Clarifying Node в UI графе **в обоих режимах** (semi_automatic и automatic)
3. Пользователь всегда видит "какие вопросы система задала и какие ответы дала"

**Поведение по режимам:**
| Режим | Вопросы | Ответы | UI Node |
|-------|---------|--------|---------|
| semi_automatic | Генерируются | User выбирает | ✅ Видна (кликабельна для ввода) |
| automatic | Генерируются | Auto-select | ✅ Видна (read-only, badge "Авто") |

---

## Текущее состояние

| Компонент           | Статус                             |
| ------------------- | ---------------------------------- |
| ClarifyingNode.tsx  | ✅ Существует, зарегистрирован     |
| ClarifyingPanel.tsx | ✅ Существует, полнофункциональный |
| Нода в графе        | ❌ **НЕ создаётся** в buildGraph   |
| Auto-answer backend | ❌ Не реализовано                  |

---

## Архитектура решения

```
                    ┌─────────────────┐
                    │    Stage 4      │
                    │   (Analysis)    │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
    ┌─────────────────┐           ┌─────────────────┐
    │  Clarifying     │           │   Phase 1-4     │
    │  Questions Node │◄──────────│   (Analysis)    │
    │  (ответвление)  │  context  │                 │
    └─────────────────┘           └─────────────────┘
```

Clarifying Node — визуальное ответвление от Stage 4, показывает:

- Количество вопросов (3-7)
- Прогресс ответов
- При клике — ClarifyingPanel с деталями

---

## Часть 1: Backend (Self-Reflection)

### 1.1 Новая функция: `autoAnswerAllQuestions`

**Файл**: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts`

```typescript
/**
 * Auto-answer all pending questions with first suggested answer
 * Used in automatic mode for self-reflection without user input
 */
export async function autoAnswerAllQuestions(courseId: string): Promise<number> {
  const supabase = getSupabaseAdmin();

  const { data: questions, error } = await supabase
    .from('clarifying_questions')
    .select('id, suggested_answers')
    .eq('course_id', courseId)
    .eq('status', 'pending');

  if (error || !questions?.length) return 0;

  let answeredCount = 0;

  for (const question of questions) {
    const suggestions = question.suggested_answers as Array<{ text: string }> | null;
    const firstAnswer = suggestions?.[0]?.text || 'Auto-selected by system';

    const { error: updateError } = await supabase
      .from('clarifying_questions')
      .update({
        user_answer: firstAnswer,
        answer_source: 'suggested',
        selected_suggestion_index: 0,
        status: 'answered',
        answered_at: new Date().toISOString(),
      })
      .eq('id', question.id);

    if (!updateError) answeredCount++;
  }

  logger.info({ courseId, answeredCount }, 'Auto-answered clarifying questions');
  return answeredCount;
}
```

### 1.2 Изменение `getClarifyingConfig`

**Файл**: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-0.5-clarifying.ts` (строки 592-617)

Добавить поле `isAutomatic`:

```typescript
export async function getClarifyingConfig(
  courseId: string
): Promise<{ enabled: boolean; skipped: boolean; isAutomatic: boolean }> {
  // ... select settings, generation_mode ...
  const isAutomatic = course?.generation_mode === 'automatic';
  return { enabled, skipped, isAutomatic };
}
```

### 1.3 Изменение orchestrator

**Файл**: `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator.ts` (строки 328-388)

После генерации вопросов:

```typescript
if (clarifyingConfig.isAutomatic) {
  // Auto-answer and continue without pause
  const answeredCount = await autoAnswerAllQuestions(courseId);
  orchestrationLogger.info({ answeredCount }, 'Auto-answered, proceeding to Phase 1');
} else {
  // Semi-automatic: pause for user input
  throw new Error('AWAITING_CLARIFYING_ANSWERS');
}
```

---

## Часть 2: Frontend (UI Node)

### 2.1 Источник данных для ноды

**Файл**: `packages/web/components/generation-graph/hooks/use-graph-data/index.ts`

Добавить запрос clarifying данных:

```typescript
// Fetch clarifying questions summary
const { data: clarifyingData } = trpc.clarifying.getProgress.useQuery(
  { courseId: courseInfo?.id ?? '' },
  { enabled: !!courseInfo?.id }
);
```

### 2.2 Добавление ноды в buildGraph

**Файл**: `packages/web/components/generation-graph/hooks/use-graph-data/utils/graph-builders.ts`

После создания Stage 4 ноды, добавить Clarifying node:

```typescript
// Special handling for Stage 4: Add Clarifying Questions branch
if (i === 4 && clarifyingData && clarifyingData.total > 0) {
  const clarifyingNodeId = 'stage_4_clarifying';

  newNodes.push({
    id: clarifyingNodeId,
    type: 'clarifying',
    position: getExistingPos(clarifyingNodeId),
    data: {
      label: 'Уточняющие вопросы',
      status: clarifyingData.canProceed ? 'completed' : 'active',
      stageNumber: 4,
      questionsCount: clarifyingData.total,
      answeredCount: clarifyingData.answered,
      isAutomatic: clarifyingData.isAutomatic, // new field
    },
  });

  // Edge from Stage 4 to Clarifying (branch)
  newEdges.push({
    id: `e${stageKey}-${clarifyingNodeId}`,
    source: stageKey,
    target: clarifyingNodeId,
    type: 'animated',
    data: { status: 'idle', animated: false },
  });
}
```

### 2.3 Обновление ClarifyingNode визуала

**Файл**: `packages/web/components/generation-graph/nodes/ClarifyingNode.tsx`

Добавить индикатор "auto-answered":

```typescript
{nodeData.isAutomatic && (
  <Badge variant="secondary" className="text-xs">
    Авто-ответы
  </Badge>
)}
```

### 2.4 Обновление API (getProgress)

**Файл**: `packages/course-gen-platform/src/server/routers/clarifying.router.ts`

Добавить `isAutomatic` в ответ `getProgress`:

```typescript
return {
  // ... existing fields
  isAutomatic: course.generation_mode === 'automatic',
};
```

---

## Критические файлы

### Backend

| Файл                             | Строки      | Изменение                  |
| -------------------------------- | ----------- | -------------------------- |
| `phases/phase-0.5-clarifying.ts` | ~580        | + `autoAnswerAllQuestions` |
| `phases/phase-0.5-clarifying.ts` | 592-617     | + `isAutomatic` в config   |
| `orchestrator.ts`                | 328-388     | Auto-answer логика         |
| `clarifying.router.ts`           | getProgress | + `isAutomatic`            |

### Frontend

| Файл                         | Изменение                  |
| ---------------------------- | -------------------------- |
| `use-graph-data/index.ts`    | + clarifying query         |
| `graph-builders.ts`          | + clarifying node creation |
| `ClarifyingNode.tsx`         | + isAutomatic badge        |
| `BuildGraphParams` interface | + clarifyingData param     |

---

## Verification

### 1. Type-check & Build

```bash
pnpm type-check && pnpm build
```

### 2. Backend test (automatic mode)

```sql
-- Set course to automatic mode with clarifying enabled
UPDATE courses
SET generation_mode = 'automatic',
    settings = jsonb_set(COALESCE(settings, '{}'), '{clarifying_questions_enabled}', 'true')
WHERE id = '<test-course-id>';

-- After Stage 4 runs, verify auto-answered questions
SELECT id, question_text, user_answer, answer_source, status
FROM clarifying_questions
WHERE course_id = '<test-course-id>';
-- Expected: status='answered', answer_source='suggested'
```

### 3. Frontend test

- Открыть граф генерации курса
- Должна появиться Clarifying нода как ответвление от Stage 4
- При клике — открывается панель с вопросами/ответами
- В automatic mode — badge "Авто-ответы"

---

## Оценка сложности

| Часть    | Файлов | Сложность |
| -------- | ------ | --------- |
| Backend  | 3      | Низкая    |
| Frontend | 4      | Средняя   |

**Рекомендация**: Реализовать сначала Backend (Часть 1), затем Frontend (Часть 2).
