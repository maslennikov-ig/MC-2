# План: mc2-v90d (close) + mc2-z8uf (tRPC mutations для ModuleDashboard)

**Дата**: 2026-02-02
**Задачи**:

- mc2-v90d — закрыть (не воспроизводится)
- mc2-z8uf — реализовать tRPC mutations

---

## Задача 1: mc2-v90d — Закрыть

### Статус

Проблема Fast Refresh **не воспроизводится**. 187 коммитов с момента создания (2026-01-22), dev сервер стартует без ошибок.

### Действие

```bash
bd close mc2-v90d --reason="Cannot reproduce. 187 commits since task creation, likely fixed in cleanup commits."
```

---

## Задача 2: mc2-z8uf — tRPC mutations для ModuleDashboard

### Проблема

4 TODO в `/packages/web/components/generation-graph/panels/module/ModuleDashboard.tsx`:

| Строка | TODO                           | Текущее состояние         |
| ------ | ------------------------------ | ------------------------- |
| 131    | retry, pause, play actions     | Только логирует в console |
| 137    | aggregate tokens from lessons  | `undefined`               |
| 152    | regenerateAll via tRPC         | Только вызывает callback  |
| 169    | modelTier from course settings | Хардкод `"standard"`      |

### Существующая инфраструктура

**Server Actions** (уже готовы):

- `pauseGeneration(courseId)` — `/app/actions/admin-generation.ts:115`
- `resumeGeneration(courseId)` — `/app/actions/admin-generation.ts:157`
- `retryLessonGeneration(courseId, lessonId)` — `/app/actions/lesson-actions.ts:82`

**Hooks** (нужно создать/использовать):

- Нет hooks для pause/resume/retry в контексте ModuleDashboard

### Решение

**Шаг 1**: Создать hook `useLessonActions` в `/packages/web/components/generation-graph/hooks/useLessonActions.ts`:

```typescript
'use client';

import { useState, useCallback } from 'react';
import { retryLessonGeneration } from '@/app/actions/lesson-actions';
import { pauseGeneration, resumeGeneration } from '@/app/actions/admin-generation';
import { toast } from 'sonner';

interface UseLessonActionsOptions {
  courseId: string;
  onSuccess?: () => void;
}

export function useLessonActions({ courseId, onSuccess }: UseLessonActionsOptions) {
  const [isLoading, setIsLoading] = useState(false);

  const retryLesson = useCallback(
    async (lessonId: string) => {
      setIsLoading(true);
      try {
        await retryLessonGeneration(courseId, lessonId);
        toast.success('Урок добавлен в очередь на повторную генерацию');
        onSuccess?.();
      } catch (error) {
        toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Unknown'}`);
      } finally {
        setIsLoading(false);
      }
    },
    [courseId, onSuccess]
  );

  const pause = useCallback(async () => {
    setIsLoading(true);
    try {
      await pauseGeneration(courseId);
      toast.success('Генерация приостановлена');
      onSuccess?.();
    } catch (error) {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Unknown'}`);
    } finally {
      setIsLoading(false);
    }
  }, [courseId, onSuccess]);

  const resume = useCallback(async () => {
    setIsLoading(true);
    try {
      await resumeGeneration(courseId);
      toast.success('Генерация возобновлена');
      onSuccess?.();
    } catch (error) {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Unknown'}`);
    } finally {
      setIsLoading(false);
    }
  }, [courseId, onSuccess]);

  return { retryLesson, pause, resume, isLoading };
}
```

**Шаг 2**: Обновить `ModuleDashboard.tsx`:

1. Добавить props:

```typescript
interface ModuleDashboardProps {
  // ... existing
  courseId: string; // NEW: для server actions
  isPaused?: boolean; // NEW: для кнопок pause/play
}
```

2. Использовать hook:

```typescript
const {
  retryLesson,
  pause,
  resume,
  isLoading: isActionsLoading,
} = useLessonActions({
  courseId,
  onSuccess: () => {
    /* refetch data if needed */
  },
});
```

3. Обновить `handleLessonAction`:

```typescript
const handleLessonAction = async (
  lessonId: string,
  action: 'view' | 'retry' | 'pause' | 'play'
) => {
  switch (action) {
    case 'view':
      selectNode(toNodeId(lessonId));
      break;
    case 'retry':
      await retryLesson(lessonId);
      break;
    case 'pause':
      await pause();
      break;
    case 'play':
      await resume();
      break;
  }
};
```

4. Для `modelTier` — оставить TODO или получать из `course.settings?.model_tier`

**Шаг 3**: Обновить `NodeDetailsDrawer.tsx` (строка 918):

```tsx
<ModuleDashboard
  data={moduleDashboardData}
  courseId={courseInfo.id} // ADD THIS
  isPaused={!!courseInfo.generation_paused_at} // ADD THIS (if available)
  // ... rest
/>
```

`courseInfo.id` уже доступен в контексте (используется для LessonPanelWithTabs на строке 942).

### Файлы для изменения

| Файл                        | Действие                  |
| --------------------------- | ------------------------- |
| `hooks/useLessonActions.ts` | Создать новый             |
| `ModuleDashboard.tsx`       | Обновить props и handlers |
| `NodeDetailsDrawer.tsx:918` | Добавить `courseId` prop  |

### Верификация

```bash
pnpm type-check
pnpm --filter web build
```

### Тестирование

1. Открыть ModuleDashboard в UI
2. Проверить кнопки retry/pause/resume
3. Убедиться что toast сообщения показываются

---

## Порядок выполнения

1. Закрыть mc2-v90d
2. Взять mc2-z8uf в работу (`bd update mc2-z8uf --status in_progress`)
3. Создать `useLessonActions.ts`
4. Обновить `ModuleDashboard.tsx`
5. Найти и обновить родительские компоненты
6. Запустить type-check и build
7. Закрыть mc2-z8uf

---

## Чеклист

- [ ] mc2-v90d закрыта
- [ ] `useLessonActions.ts` создан
- [ ] `ModuleDashboard.tsx` обновлён
- [ ] Родительские компоненты обновлены
- [ ] `pnpm type-check` passes
- [ ] `pnpm build` passes
- [ ] mc2-z8uf закрыта
- [ ] `git commit && git push`
