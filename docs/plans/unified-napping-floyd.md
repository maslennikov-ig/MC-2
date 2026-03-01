# Fix: Hardcoded Russian strings in UI + update course YTH-0951 title

## Context

Курс YTH-0951 (`language=en`) отображает русский заголовок и множество элементов UI на русском. Предыдущий релиз (v0.31.10) исправил пайплайн Stage 5 — теперь новые курсы будут получать переведённый заголовок. Но остаётся проблема: **многие UI-компоненты содержат хардкоженные русские строки** вместо i18n-ключей. Система i18n (next-intl) работает корректно, переводы существуют — компоненты просто их не используют.

## Part 0: Обновить заголовок YTH-0951 в БД

SQL-запрос для ручного обновления:

```sql
UPDATE courses SET title = 'How to Become Happy' WHERE generation_code = 'YTH-0951';
```

## Part 1: header.tsx — "Каталог", "Создать курс", "Примеры курсов"

**File**: `packages/web/components/layouts/header.tsx`

Добавить `useTranslations` и новые ключи. Заменить:

- `"Каталог"` → `t('catalog')`
- `"Создать курс"` → `t('createCourse')`
- `"Примеры курсов"` → `t('exampleCourses')`
- aria-label строки → `t('catalogAria')`, `t('createCourseAria')`

**Новые ключи** в `messages/en/common.json` и `messages/ru/common.json`:

```json
// common.json → nav section
"nav": {
  "catalog": "Catalog",           // ru: "Каталог"
  "createCourse": "Create Course", // ru: "Создать курс"
  "exampleCourses": "Example Courses", // ru: "Примеры курсов"
  "examples": "Examples",         // ru: "Примеры"
  "catalogAria": "View available courses", // ru: "Просмотреть доступные курсы"
  "createCourseAria": "Create a new course", // ru: "Создать новый курс"
  "examplesAria": "View example courses" // ru: "Посмотреть примеры курсов"
}
```

## Part 2: Sidebar.tsx — "Модуль X", "К каталогу", "мин"

**File**: `packages/web/components/course/viewer/components/Sidebar.tsx`

Уже использует `useTranslations('course')` для некоторых строк. Заменить оставшиеся хардкоды:

- `"Модуль {N}: {title}"` → `t('viewer.section') + ` ` + {N}: {title}` (ключ `viewer.section` уже есть: "Section"/"Модуль")
- `"К каталогу"` → `t('viewer.breadcrumb.backToCourses')` (ключ уже есть)
- `"Конструктор курса"` → `t('viewer.constructorTooltip')` (ключ уже есть)
- `"Скрыть боковую панель"` → новый ключ `viewer.hideSidebar`
- `"{N} мин"` → `t('lesson.duration', { minutes: N })` (ключ уже есть: "{minutes}min"/"{minutes}мин")

**Новые ключи** в `messages/{en,ru}/course.json`:

```json
"viewer": {
  "hideSidebar": "Hide sidebar"  // ru: "Скрыть боковую панель"
}
```

## Part 3: StructurePanel.tsx — "Структура курса", "уроков", "Текущий"

**File**: `packages/web/components/course/viewer/components/StructurePanel.tsx`

Добавить `useTranslations('course')`. Заменить:

- `"Структура курса"` → `t('viewer.tabs.structure')` (ключ уже есть)
- `"Полный обзор всех модулей и уроков курса"` → новый ключ `viewer.structureDescription`
- `"{N}/{M} уроков"` → новый ключ `viewer.lessonsProgress`
- `"Текущий"` → новый ключ `viewer.current`
- `"{N} мин"` → `t('lesson.duration', { minutes: N })`
- `"Общий прогресс курса"` → новый ключ `viewer.overallProgress`
- `"Осталось времени"` → новый ключ `viewer.timeRemaining`
- `"{N} из {M} уроков"` → новый ключ `viewer.lessonsCompleted`

**Новые ключи** в `messages/{en,ru}/course.json`:

```json
"viewer": {
  "structureDescription": "Full overview of all sections and lessons", // ru: "Полный обзор всех модулей и уроков курса"
  "lessonsProgress": "{completed}/{total} lessons",  // ru: "{completed}/{total} уроков"
  "current": "Current",  // ru: "Текущий"
  "overallProgress": "Overall course progress",  // ru: "Общий прогресс курса"
  "timeRemaining": "Time remaining",  // ru: "Осталось времени"
  "lessonsCompleted": "{completed} of {total} lessons" // ru: "{completed} из {total} уроков"
}
```

## Part 4: create-header.tsx — "Главная", "Мои курсы"

**File**: `packages/web/app/[locale]/create/_components/create-header.tsx`

Добавить `useTranslations('common')`. Заменить:

- `"Главная"` → `t('nav.home')` — новый ключ
- `"Мои курсы"` → `t('nav.myCourses')` — новый ключ

**Новые ключи** в `messages/{en,ru}/common.json`:

```json
"nav": {
  "home": "Home",       // ru: "Главная"
  "myCourses": "My Courses" // ru: "Мои курсы"
}
```

## Part 5: course-card.tsx — statusConfig, difficultyConfig, visibilityConfig

**File**: `packages/web/app/[locale]/courses/_components/course-card.tsx`

Добавить `useTranslations`. Заменить хардкоженные объекты конфигурации:

- statusConfig labels → ключи `status.draft`, `status.generating`, etc.
- difficultyConfig labels → ключи `difficulty.beginner`, etc.
- visibilityConfig labels → `common.visibility.*` (ключи уже есть!)
- `"Открыть курс"` → новый ключ
- `"{N} модулей"`, `"{N} уроков"` → ключи с plural
- `"{N}ч"` → новый ключ duration

**Новые ключи** в `messages/{en,ru}/course.json`:

```json
"card": {
  "open": "Open Course",   // ru: "Открыть курс"
  "openAction": "Open",    // ru: "Открыть"
  "draft": "Draft",        // ru: "Черновик"
  "sections": "{count, plural, one {# section} other {# sections}}", // ru: с plural
  "lessons": "{count, plural, one {# lesson} other {# lessons}}",
  "durationHours": "{hours}h", // ru: "{hours}ч"
  "status": {
    "draft": "Draft",
    "generating": "Generating",
    "completed": "Ready",
    "failed": "Error",
    "published": "Published",
    "paused": "Paused"
  },
  "difficulty": {
    "beginner": "Beginner",
    "intermediate": "Intermediate",
    "advanced": "Advanced",
    "expert": "Expert"
  },
  "deleteConfirm": "Are you sure you want to delete this course?",
  "deleteSuccess": "Course deleted",
  "deleteError": "Failed to delete course"
}
```

## Part 6: lesson-progress-card.tsx

**File**: `packages/web/components/common/lesson-progress-card.tsx`

Целиком на русском. Добавить `useTranslations('course')`. Использовать существующие ключи из `course.lessons.milestones.*` и `course.lesson.duration`. Добавить недостающие:

**Новые ключи** в `messages/{en,ru}/course.json`:

```json
"progress": {
  "title": "Course Progress",      // ru: "Прогресс курса"
  "completed": "Completed",        // ru: "Пройдено"
  "of": "{completed} of {total}",  // ru: "{completed} из {total}"
  "timeRemaining": "Time remaining", // ru: "Осталось времени"
  "courseCompleted": "Course completed!" // ru: "Курс завершён!"
}
```

## Files to modify

| #   | File                                                     | Changes                                      |
| --- | -------------------------------------------------------- | -------------------------------------------- |
| 0   | DB (SQL)                                                 | Update YTH-0951 title to English             |
| 1   | `messages/en/common.json`                                | Add `nav.*` keys                             |
| 2   | `messages/ru/common.json`                                | Add `nav.*` keys                             |
| 3   | `messages/en/course.json`                                | Add `viewer.*`, `card.*`, `progress.*` keys  |
| 4   | `messages/ru/course.json`                                | Add `viewer.*`, `card.*`, `progress.*` keys  |
| 5   | `components/layouts/header.tsx`                          | Replace hardcoded → `t('nav.*')`             |
| 6   | `components/course/viewer/components/Sidebar.tsx`        | Replace hardcoded → existing + new i18n keys |
| 7   | `components/course/viewer/components/StructurePanel.tsx` | Replace hardcoded → i18n keys                |
| 8   | `app/[locale]/create/_components/create-header.tsx`      | Replace hardcoded → `t('nav.*')`             |
| 9   | `app/[locale]/courses/_components/course-card.tsx`       | Replace configs → i18n keys                  |
| 10  | `components/common/lesson-progress-card.tsx`             | Replace all hardcoded → i18n keys            |

## Verification

1. `pnpm --filter web type-check` — no type errors
2. `pnpm --filter web build` — builds successfully
3. Визуально проверить на dev-сервере: переключить язык на `/en/...` — все строки на английском
4. Проверить `/ru/...` — все строки на русском (регрессия)
