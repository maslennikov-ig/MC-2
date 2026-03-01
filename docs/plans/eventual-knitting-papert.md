# План: Урок занимает всё свободное пространство страницы

## Контекст

Контент урока ограничен CSS-классами `max-w-*`, из-за чего не использует всю доступную ширину контейнера. Это проявляется в обоих режимах просмотра — обычном (с табами) и фокус-режиме. Нужно убрать искусственные ограничения ширины, чтобы контент заполнял весь доступный контейнер.

## Цепочка ограничений (текущее состояние)

```
CourseViewerEnhanced (flex, min-h-screen)
  └─ motion.div (flex-1) ← OK, заполняет пространство
     └─ div.flex-1.overflow-y-auto ← OK
        └─ LessonView
           ├─ Focus mode: max-w-6xl (1152px) ← ОГРАНИЧЕНИЕ
           │  └─ LessonContent: max-w-7xl / xl:max-w-[90rem] ← ОГРАНИЧЕНИЕ
           └─ Normal mode: Tabs (w-full) ← OK
              └─ ContentFormatSwitcher
                 └─ LessonContent: max-w-7xl / xl:max-w-[90rem] ← ОГРАНИЧЕНИЕ
```

## Изменения

### 1. `packages/web/components/common/lesson-content.tsx` (строка 111)

**Было:** `mx-auto max-w-7xl px-6 py-8 lg:px-10 xl:max-w-[90rem]`
**Стало:** `px-6 py-8 lg:px-10`

Убираем `mx-auto`, `max-w-7xl` и `xl:max-w-[90rem]` — контент заполнит всю ширину родителя.

### 2. `packages/web/components/course/viewer/components/LessonView.tsx` (строка 199)

**Было:** `relative mx-auto max-w-6xl px-6 py-12`
**Стало:** `relative px-6 py-12`

Убираем `mx-auto` и `max-w-6xl` в фокус-режиме.

### 3. `packages/web/components/course/viewer/components/LessonView.tsx` (строка 139)

**Было:** `mx-auto flex max-w-7xl items-center justify-between px-6 py-3`
**Стало:** `flex items-center justify-between px-6 py-3`

Шапка фокус-режима тоже должна быть на всю ширину.

### 4. `packages/web/components/common/content-format-switcher.tsx`

Три контейнера с ограничениями:

- Строка ~323: `mx-auto max-w-7xl px-6 py-8` → `px-6 py-8`
- Строка ~472: `mx-auto max-w-4xl px-6 py-8` → `px-6 py-8`
- Строка ~608: `mx-auto max-w-6xl px-6 py-8` → `px-6 py-8`

## Файлы для изменения

1. `packages/web/components/common/lesson-content.tsx`
2. `packages/web/components/course/viewer/components/LessonView.tsx`
3. `packages/web/components/common/content-format-switcher.tsx`

## Верификация

1. `pnpm --filter web type-check` — проверка типов
2. `pnpm --filter web build` — сборка
3. Визуальная проверка через Playwright: открыть страницу курса, убедиться что контент занимает всю ширину в обоих режимах
