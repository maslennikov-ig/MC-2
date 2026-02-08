# План: Исправление обновления UI после изменений данных курса

## Проблема

Две связанные проблемы с одной корневой причиной:

1. **Stage 5**: После применения proposal через чат UI не обновляется — нужно обновлять страницу вручную
2. **Stage 4**: После ответов на clarifying questions показывается бесконечный loader вместо результата

**Корневая причина:** Realtime subscription слушает только `generation_status`, игнорируя 6 из 7 важных полей:

| Поле                  | Слушается? | Используется в                  |
| --------------------- | ---------- | ------------------------------- |
| `generation_status`   | ✅ ДА      | Статус генерации                |
| `analysis_result`     | ❌ НЕТ     | Stage4OutputTab, Stage5InputTab |
| `course_structure`    | ❌ НЕТ     | Stage5OutputTab, GraphView      |
| `visual_style`        | ❌ НЕТ     | Stage4OutputTab, GraphView      |
| `style`               | ❌ НЕТ     | GraphView                       |
| `generation_progress` | ❌ НЕТ     | Progress tracking               |
| `error_message`       | ❌ НЕТ     | Error display                   |
| `error_details`       | ❌ НЕТ     | Error details                   |

## Затронутые файлы

| Файл                                                                  | Роль                           |
| --------------------------------------------------------------------- | ------------------------------ |
| `packages/web/components/generation-monitoring/realtime-provider.tsx` | Realtime subscription          |
| `packages/web/components/generation-graph/hooks/useRefinement.ts`     | Диспатчит event, но не слушает |
| `packages/web/components/generation-graph/GraphView.tsx`              | Основной компонент графа       |
| `packages/web/components/generation-graph/panels/Stage4OutputTab.tsx` | Показывает spinner             |

## Решение

### Подход: Расширить реактивность через invalidation + refetch

Вместо прямой передачи данных через realtime (что требует сложной синхронизации), используем **invalidation pattern**:

1. При UPDATE courses → инвалидировать кэш данных курса
2. Компоненты автоматически refetch через React Query

### Шаг 1: Добавить callback для инвалидации в RealtimeProvider

**Файл:** `packages/web/components/generation-monitoring/realtime-provider.tsx`

```typescript
// Добавить в context type
type GenerationRealtimeContextType = {
  // ... existing
  onCourseDataUpdated?: () => void  // callback для инвалидации
}

// В subscription UPDATE courses:
.on('postgres_changes', {
  event: 'UPDATE',
  table: 'courses',
  filter: `id=eq.${courseId}`,
}, (payload) => {
  const newStatus = payload.new.generation_status;
  if (newStatus) setStatus(newStatus);

  // Вызвать callback при любом UPDATE courses
  onCourseDataUpdated?.()
})
```

### Шаг 2: Передать invalidation callback в RealtimeProvider

**Файл:** `packages/web/app/(dashboard)/generation/[courseId]/page.tsx` или wrapper

```typescript
const utils = trpc.useUtils()

const handleCourseDataUpdated = useCallback(() => {
  // Инвалидировать кэш курса
  utils.courses.getCourse.invalidate({ courseId })
}, [utils, courseId])

<GenerationRealtimeProvider
  courseId={courseId}
  onCourseDataUpdated={handleCourseDataUpdated}
>
```

### Шаг 3: Слушать event 'course-data-updated' в GraphView

**Файл:** `packages/web/components/generation-graph/GraphView.tsx`

```typescript
useEffect(() => {
  const handleCourseDataUpdated = (event: CustomEvent) => {
    if (event.detail?.courseId === courseId) {
      // Refetch данные
      refetchCourseData();
    }
  };

  window.addEventListener('course-data-updated', handleCourseDataUpdated);
  return () => window.removeEventListener('course-data-updated', handleCourseDataUpdated);
}, [courseId, refetchCourseData]);
```

### Шаг 4: Добавить refetch в Stage4OutputTab при получении новых данных

**Файл:** `packages/web/components/generation-graph/panels/Stage4OutputTab.tsx`

Компонент уже использует `persistedAnalysisResult` — нужно убедиться что этот prop обновляется при invalidation.

## Порядок реализации

1. [ ] Обновить `realtime-provider.tsx` — добавить callback `onCourseDataUpdated`
2. [ ] Обновить page wrapper — передать invalidation callback
3. [ ] Обновить `GraphView.tsx` — слушать event 'course-data-updated'
4. [ ] Проверить что `Stage4OutputTab` получает обновлённые данные через props

## Верификация

### Тест 1: Stage 5 apply proposal

1. Открыть курс ZFF-2020 на DEV
2. Перейти на Stage 5
3. Отправить feedback через чат
4. Нажать Accept на proposal
5. **Ожидаемо:** UI обновляется без перезагрузки страницы

### Тест 2: Stage 4 clarifying questions

1. Создать новый курс
2. Дойти до Stage 4 clarifying
3. Ответить на все вопросы
4. Нажать Continue
5. **Ожидаемо:** Результат Stage 4 отображается без бесконечного loader

### Команды для проверки

```bash
# Type-check
pnpm type-check

# Build
pnpm build

# Dev server
pnpm dev
```

## Создать Beads задачу

```bash
bd create --title="UI не обновляется после изменений данных курса (Stage 4/5)" \
  --type=bug \
  --priority=2 \
  --files packages/web/components/generation-monitoring/realtime-provider.tsx \
  --files packages/web/components/generation-graph/GraphView.tsx \
  --description="Две связанные проблемы:
1. Stage 5: После apply proposal через чат UI не обновляется
2. Stage 4: Бесконечный loader после ответов на clarifying questions

Корневая причина: Realtime subscription слушает только generation_status, игнорируя analysis_result и course_structure.

Решение: Добавить invalidation callback при UPDATE courses."
```
