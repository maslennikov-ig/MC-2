# План: Мгновенный переход при нажатии кнопки "Открыть курс"

## Найденная задача в Beads

**mc2-zksu** (закрыта) - "Fix: Link+Button invalid HTML nesting blocks navigation"

- Исправление от 2026-01-20: использован `asChild` паттерн для корректного рендеринга
- Коммиты: ca96b58, 5ac8d5f

## Диагностика проблемы

Кнопка сама по себе работает без задержки (Link). Проблема в:

1. **Долгая загрузка страницы курса** - каскадные последовательные запросы
2. **2-секундные setTimeout** в auto-redirect (generation-progress.tsx)

## План реализации

### Часть 1: Открытие в новой вкладке (все места)

**Все кнопки/ссылки перехода на курс из workflow:**

| #   | Файл                                      | Строка | Тип            | Описание                               |
| --- | ----------------------------------------- | ------ | -------------- | -------------------------------------- |
| 1   | `EndNodePanel.tsx`                        | 216    | Link           | Кнопка "Открыть курс" в боковой панели |
| 2   | `GenerationProgressContainerEnhanced.tsx` | 911    | Link           | Ссылка в модалке успеха                |
| 3   | `generation-progress.tsx`                 | 746    | Button onClick | Кнопка "Перейти к курсу"               |

**Изменения:**

```tsx
// 1. EndNodePanel.tsx:216 - добавить target="_blank"
<Link href={`/courses/${courseSlug}`} target="_blank" rel="noopener noreferrer">

// 2. GenerationProgressContainerEnhanced.tsx:911 - добавить target="_blank"
<Link href={`/courses/${slug}`} target="_blank" rel="noopener noreferrer">

// 3. generation-progress.tsx:746 - заменить router.push на window.open
onClick={() => window.open(`/courses/${slug}`, '_blank', 'noopener,noreferrer')}
```

### Часть 2: Оптимизация загрузки страницы курса

**Файл**: `packages/web/app/[locale]/courses/[slug]/page.tsx`

**Текущая структура** (последовательная):

```
1. sections (зависит от course.id) → await
2. lessons (зависит от sections) → await
3. assets (зависит от lessons) → await
4. enrichments (зависит от lessons) → await
5. lessonContents (зависит от lessons) → await
```

**Оптимизированная структура** (параллельная где возможно):

```
1. sections → await
2. lessons → await
3. Promise.all([assets, enrichments, lessonContents]) → await параллельно
```

**Изменения в page.tsx** (строки 183-265):

```tsx
// Было: 3 последовательных запроса
const assetsResult = await adminSupabase.from('assets')...
const enrichmentsResult = await adminSupabase.from('lesson_enrichments')...
const lessonContentsResult = await adminSupabase.from('lesson_contents')...

// Станет: 1 параллельный запрос
if (lessons && lessons.length > 0) {
  const lessonIds = lessons.map((l: LessonRow) => l.id)

  const [assetsResult, enrichmentsResult, lessonContentsResult] = await Promise.all([
    adminSupabase.from('assets').select('*').in('lesson_id', lessonIds),
    adminSupabase.from('lesson_enrichments').select('*').in('lesson_id', lessonIds).eq('status', 'completed').order('order_index'),
    adminSupabase.from('lesson_contents').select('*').in('lesson_id', lessonIds).eq('status', 'completed').order('created_at', { ascending: false }),
  ])

  assets = assetsResult.data
  enrichments = enrichmentsResult.data
  lessonContents = lessonContentsResult.data
  // ... error handling
}
```

### Часть 3: Убрать 2-секундные задержки auto-redirect (опционально)

**Auto-redirect места** (срабатывают автоматически после завершения):

| #   | Файл                                      | Строки  | Задержка         |
| --- | ----------------------------------------- | ------- | ---------------- |
| 1   | `generation-progress.tsx`                 | 166-168 | 2 сек (realtime) |
| 2   | `generation-progress.tsx`                 | 322-324 | 2 сек (polling)  |
| 3   | `GenerationProgressContainerEnhanced.tsx` | 608-610 | 3 сек (disabled) |

**Изменения** (если нужно убрать задержку):

```tsx
// generation-progress.tsx:166-168
// Было:
setTimeout(() => {
  router.replace(`/courses/${slug}`);
}, 2000);
// Станет:
router.replace(`/courses/${slug}`);

// generation-progress.tsx:322-324
// Было:
setTimeout(() => {
  router.push(`/courses/${slug}`);
}, 2000);
// Станет:
router.push(`/courses/${slug}`);
```

**Примечание**: Auto-redirect срабатывает только когда пользователь находится на странице workflow и курс завершается. Основная проблема - это клик по кнопке, поэтому Часть 1 приоритетнее.

## Порядок выполнения

1. **EndNodePanel.tsx:216** - добавить `target="_blank"` на Link
2. **GenerationProgressContainerEnhanced.tsx:911** - добавить `target="_blank"` на Link
3. **generation-progress.tsx:746** - заменить `router.push` на `window.open`
4. **page.tsx** - параллелизировать запросы с Promise.all
5. **generation-progress.tsx:166-168, 322-324** - убрать setTimeout (опционально)

## Проверка

1. Создать тестовый курс
2. Дождаться завершения генерации
3. Нажать "Открыть курс" → должна мгновенно открыться новая вкладка
4. Измерить время загрузки страницы курса (должно уменьшиться)
5. `pnpm type-check && pnpm build` - проверить сборку
