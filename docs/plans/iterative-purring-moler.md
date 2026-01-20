# План: Исправление отображения параметров курса на странице прогресса генерации

## Проблема

При создании курса пользователь выбирает параметры, данные корректно сохраняются в БД, но на странице прогресса генерации (Stage1InputTab) они отображаются некорректно.

**Верифицировано на курсе BNM-1906:**

- БД содержит: `course_size: "standard"`, `notify_on_completion: true`, `notify_on_error: true`
- UI показывает: пустой Badge для размера, уведомления не отображаются

## Найденные проблемы

1. **`page.tsx`** (строка 176-200) — не передаёт notification поля в `stage1CourseData.inputData`
2. **`Stage1InputTab.tsx`** (строки 312-320) — проверяет `small/medium/large`, а реальные значения: `auto/micro/mini/compact/standard/comprehensive`
3. **`Stage1InputTab.tsx`** — не отображает notification поля
4. **`types.ts`** — `course_size` типизирован как `string` вместо `CourseSize`

## Файлы для изменения

| Файл                                                                        | Изменения                                                      |
| --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `packages/web/lib/generation-graph/mappers.ts`                              | **НОВЫЙ** — utility function `mapCourseToStage1Data()`         |
| `packages/web/app/[locale]/courses/generating/[slug]/page.tsx`              | Использовать `mapCourseToStage1Data()` вместо ручного маппинга |
| `packages/web/components/generation-graph/panels/stage1/Stage1InputTab.tsx` | Исправить маппинг course_size, добавить уведомления            |
| `packages/web/components/generation-graph/panels/stage1/types.ts`           | Типизировать course_size и notification поля                   |
| `packages/web/lib/generation-graph/translations.ts`                         | Добавить переводы для уведомлений, удалить устаревшие          |

## Детали реализации

### Шаг 0: Создать utility function `mapCourseToStage1Data()` (НОВЫЙ ФАЙЛ)

**Файл:** `packages/web/lib/generation-graph/mappers.ts`

```typescript
import type { CourseSize } from '@megacampus/shared-types';
import type { Stage1CourseData } from '@/components/generation-graph/hooks/use-graph-data/types';

// Type for course from DB (based on Supabase schema)
interface CourseFromDB {
  id: string;
  title: string | null;
  course_description: string | null;
  target_audience: string | null;
  style: string | null;
  output_formats: string[] | null;
  estimated_lessons: number | null;
  estimated_sections: number | null;
  content_strategy: string | null;
  prerequisites: string | null;
  learning_outcomes: string | null;
  has_files: boolean | null;
  language: string | null;
  course_size: string | null;
  generation_mode: string | null;
  notify_on_completion: boolean | null;
  notify_on_error: boolean | null;
  notify_on_stage_complete: boolean | null;
  user_id: string | null;
  created_at: string | null;
  settings: { lesson_duration_minutes?: number } | null;
}

export function mapCourseToStage1Data(course: CourseFromDB): Stage1CourseData {
  return {
    inputData: {
      topic: course.title || '',
      course_description: course.course_description || '',
      target_audience: course.target_audience || undefined,
      style: course.style || undefined,
      output_formats: (course.output_formats as Array<
        'text' | 'audio' | 'video' | 'presentation' | 'test'
      >) || ['text'],
      estimated_lessons: course.estimated_lessons || undefined,
      estimated_sections: course.estimated_sections || undefined,
      content_strategy:
        (course.content_strategy as 'auto' | 'create_from_scratch' | 'expand_and_enhance') ||
        'auto',
      prerequisites: course.prerequisites || undefined,
      learning_outcomes: course.learning_outcomes || undefined,
      has_files: course.has_files || false,
      language: course.language || 'ru',
      course_size: (course.course_size as CourseSize) || undefined,
      lesson_duration_minutes: course.settings?.lesson_duration_minutes || undefined,
      generation_mode: (course.generation_mode as 'automatic' | 'semi_automatic') || 'automatic',
      // Notification preferences (were missing!)
      notify_on_completion: course.notify_on_completion ?? true,
      notify_on_error: course.notify_on_error ?? true,
      notify_on_stage_complete: course.notify_on_stage_complete ?? false,
    },
    outputData: {
      courseId: course.id,
      ownerId: course.user_id || '',
      createdAt: course.created_at || new Date().toISOString(),
      status: 'ready' as const,
    },
  };
}
```

### Шаг 1: Обновить `types.ts` (строка ~42)

```typescript
import type { CourseSize } from '@megacampus/shared-types'

// В интерфейсе Stage1InputData:
course_size?: CourseSize  // было: string
notify_on_completion?: boolean
notify_on_error?: boolean
notify_on_stage_complete?: boolean
```

### Шаг 2: Исправить `Stage1InputTab.tsx` (строки 312-320)

**Было:**

```typescript
{
  data.course_size === 'small' && (t?.sizeSmall?.[locale] || 'Small');
}
{
  data.course_size === 'medium' && (t?.sizeMedium?.[locale] || 'Medium');
}
{
  data.course_size === 'large' && (t?.sizeLarge?.[locale] || 'Large');
}
```

**Стало:**

```typescript
import { getCourseSizeLabels, type CourseSize } from '@megacampus/shared-types'

// В JSX (строки 312-320):
{data.course_size && (
  <div className="flex items-center gap-2">
    <span className="text-muted-foreground text-xs">
      {t?.courseSize?.[locale] || 'Size:'}
    </span>
    <Badge variant="outline">
      {getCourseSizeLabels(locale, data.course_size).title}
    </Badge>
  </div>
)}
```

### Шаг 3: Добавить отображение уведомлений (после generation_mode, ~строка 343)

```typescript
import { Bell } from 'lucide-react'

// После блока generation_mode:
{(data.notify_on_completion || data.notify_on_error || data.notify_on_stage_complete) && (
  <div className="flex flex-wrap items-center gap-2">
    <Bell className="text-muted-foreground h-4 w-4" />
    {data.notify_on_completion && (
      <Badge variant="secondary" className="text-xs">
        {t?.notifyCompletion?.[locale] || 'On completion'}
      </Badge>
    )}
    {data.notify_on_error && (
      <Badge variant="secondary" className="text-xs">
        {t?.notifyError?.[locale] || 'On error'}
      </Badge>
    )}
    {data.notify_on_stage_complete && (
      <Badge variant="secondary" className="text-xs">
        {t?.notifyStage?.[locale] || 'On stage'}
      </Badge>
    )}
  </div>
)}
```

### Шаг 4: Обновить `page.tsx` — использовать utility function

**Файл:** `packages/web/app/[locale]/courses/generating/[slug]/page.tsx`

**Было (строки 176-207):** ~30 строк ручного маппинга

**Стало:**

```typescript
import { mapCourseToStage1Data } from '@/lib/generation-graph/mappers';

// Заменить весь блок stage1CourseData на:
const stage1CourseData = mapCourseToStage1Data(course);
```

### Шаг 5: Обновить `translations.ts`

**Добавить:**

```typescript
courseSize: { ru: 'Размер:', en: 'Size:' },
notifyCompletion: { ru: 'При завершении', en: 'On completion' },
notifyError: { ru: 'При ошибке', en: 'On error' },
notifyStage: { ru: 'По этапам', en: 'By stage' },
```

**Удалить устаревшие:**

```typescript
sizeSmall: { ... },   // удалить
sizeMedium: { ... },  // удалить
sizeLarge: { ... },   // удалить
```

## Верификация

1. `pnpm type-check` — должен пройти без ошибок
2. Создать курс с параметрами:
   - `course_size: standard`
   - `notify_on_completion: true`
   - `notify_on_error: true`
3. Перейти на страницу прогресса генерации
4. В карточке "Стратегия и параметры" проверить:
   - Размер курса: **"Стандартный"** (не пустой Badge)
   - Уведомления отображаются как badges

## Cleanup (опционально)

После фикса удалить debug-логирование из:

- `packages/web/components/forms/create-course/_hooks/useSubmitCourse.ts`
- `packages/web/components/forms/create-course/_hooks/useCreateCourseForm.ts`
