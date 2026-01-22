# План: Раздел просмотра курса с карточками уроков

## Цель

Создать раздел просмотра курса с карточками всех уроков, показывающий:

- Прогресс прохождения (какие пройдены, какие нет)
- Информацию о медиа-контенте (video, audio, presentation, quiz)
- Badges/chips для статусов и типов контента

## Исследование

### Существующие компоненты для переиспользования

| Компонент            | Путь                                                                         | Использование                 |
| -------------------- | ---------------------------------------------------------------------------- | ----------------------------- |
| `CourseCard`         | `packages/web/app/[locale]/courses/_components/course-card.tsx`              | Базовый шаблон для LessonCard |
| `Badge`              | `packages/web/components/ui/badge.tsx`                                       | Статусы, типы контента        |
| `StatusBadge`        | `packages/web/components/generation-graph/components/shared/StatusBadge.tsx` | Статусы генерации             |
| `SmoothProgress`     | `packages/web/components/ui/smooth-progress.tsx`                             | Прогресс-бары                 |
| `LessonProgressCard` | `packages/web/components/common/lesson-progress-card.tsx`                    | Общий прогресс курса          |
| `CourseGrid`         | `packages/web/app/[locale]/courses/_components/course-grid.tsx`              | Сетка карточек                |

### Структуры данных

- `Lesson` — основная сущность урока с `video_status`, `audio_status`, `presentation_status`
- `LessonEnrichment` — медиа-обогащение (video, audio, quiz, presentation)
- `EnrichmentStatus` — pending, generating, completed, failed

### Лучшие практики конкурентов

- **Coursera**: Вертикальный список с чекбоксами прохождения, время на урок, тип контента (video/reading/quiz)
- **Udemy**: Аккордеон секций → уроки внутри, прогресс-бар сверху, иконки типа контента
- **Skillshare**: Горизонтальные карточки с превью, длительность, статус просмотра
- **LearnDash**: Course Dashboard с grid уроков, progress indicators, completion checkmarks

---

## Топ-3 варианта реализации

### Вариант 1: Вложенная страница `/courses/[slug]/lessons`

**Структура:**

```
/courses/[slug]/
  page.tsx          — обзор курса (существующая)
  lessons/
    page.tsx        — НОВАЯ страница со всеми уроками
    [lessonId]/
      page.tsx      — детальный просмотр урока
```

**UI:**

- Header с общим прогрессом (LessonProgressCard)
- Фильтры: все / пройденные / не пройденные / с медиа
- Grid карточек уроков (переиспользуем паттерн CourseGrid)
- Каждая карточка: название, длительность, badges медиа, статус прохождения

**Плюсы:**

- Чистая архитектура URL (SEO-friendly)
- Изолированная страница — легко кэшировать и оптимизировать
- Соответствует Next.js App Router best practices (nested routes)
- Легко добавить loading.tsx для skeleton states

**Минусы:**

- Дополнительный переход от страницы курса
- Два клика до списка уроков (courses → course → lessons)
- Нужна навигация "назад к курсу"

---

### Вариант 2: Табы на странице курса `/courses/[slug]`

**Структура:**

```
/courses/[slug]/
  page.tsx          — с табами
  @overview/        — parallel route: обзор
  @lessons/         — parallel route: уроки
  @progress/        — parallel route: статистика
```

**UI:**

- Tabs: "Обзор" | "Уроки" | "Прогресс"
- Tab "Уроки" содержит grid карточек
- Сохранение состояния табов в URL query (?tab=lessons)

**Плюсы:**

- Всё в одном месте — меньше переходов
- Parallel routes позволяют независимую загрузку
- Пользователь видит контекст курса при просмотре уроков
- Современный UX (как Notion, Linear)

**Минусы:**

- Сложнее архитектура (parallel routes)
- Может перегрузить страницу при большом количестве уроков
- Сложнее deep linking на конкретный урок
- Больший bundle size страницы

---

### Вариант 3: Отдельный раздел "Мое обучение" `/learning/[slug]`

**Структура:**

```
/learning/
  page.tsx          — dashboard всех активных курсов
  [slug]/
    page.tsx        — курс с фокусом на прохождении
    lessons/
      page.tsx      — все уроки
```

**UI:**

- Отдельный раздел в навигации "Мое обучение"
- Focus на прогрессе, не на описании курса
- Continue learning widget
- Streak/achievements система

**Плюсы:**

- Разделение контекстов: каталог vs обучение
- Персонализированный experience
- Можно показывать рекомендации, streaks
- Лучше для геймификации

**Минусы:**

- Дублирование логики курсов
- Путаница: где искать курс — в каталоге или в "Моем обучении"
- Больше работы по поддержке двух разделов
- Требует системы "записи на курс"

---

## Выбранный вариант

**Вариант 1: `/courses/[slug]/lessons`** + **Автоматический tracking** + **Геймификация**

---

## Дизайн-концепция LessonCard

> Детальный дизайн: `docs/plans/parallel-drifting-reddy-agent-aab98ed.md`

### Визуальная структура (Compact Grid Variant)

```
┌─────────────────────────────────┐
│ [🎬] [🎧] [📊]                  │ ← Media badges (top-2 left-2)
│                                 │
│        [Icon: Play/Book]        │ ← Lesson type icon (center)
│                                 │ ← min-h-[160px]
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ Название урока (line-clamp-2)   │
│ ═══════════════════ 60%         │ ← Progress bar (SmoothProgress)
│ [В процессе] [15мин]            │ ← StatusBadge + Duration
└─────────────────────────────────┘
```

### Сравнение с CourseCard

| Параметр      | CourseCard      | LessonCard             |
| ------------- | --------------- | ---------------------- |
| Высота        | min-h-[480px]   | min-h-[280px] ✅       |
| Hover panel   | AnimatePresence | **Нет** (компактно) ✅ |
| Padding       | p-4             | p-3 ✅                 |
| Border radius | rounded-2xl     | rounded-xl ✅          |
| Hover         | y: -4           | y: -2 (subtle) ✅      |

### Цветовая схема статусов

| Статус        | Цвет  | Icon         |
| ------------- | ----- | ------------ |
| `not_started` | Gray  | BookOpen     |
| `in_progress` | Blue  | Play         |
| `completed`   | Green | CheckCircle2 |

### Media Badges

| Тип    | Emoji | Цвет          |
| ------ | ----- | ------------- |
| Video  | 🎬    | purple-500/10 |
| Audio  | 🎧    | blue-500/10   |
| Slides | 📊    | indigo-500/10 |
| Quiz   | ❓    | amber-500/10  |

### Dark/Light mode

- **Light**: `border-gray-200 bg-white`
- **Dark**: `dark:border-slate-800 dark:bg-slate-900`
- **Hover**: `hover:border-purple-300/60 dark:hover:border-purple-600/50`

### i18n (next-intl)

Namespace: `lesson`

```json
{
  "status.not_started": "Не начат" / "Not started",
  "status.in_progress": "В процессе" / "In progress",
  "status.completed": "Завершён" / "Completed",
  "media.video": "Видео" / "Video",
  "duration.minutes": "мин" / "min"
}
```

---

## План реализации

### Новые файлы

```
packages/web/app/[locale]/courses/[slug]/lessons/
  page.tsx              — серверный компонент
  _components/
    lessons-content.tsx — клиентский контент
    lesson-card.tsx     — карточка урока (на базе CourseCard)
    lesson-grid.tsx     — сетка уроков
    lessons-filters.tsx — фильтры
    lessons-header.tsx  — header с прогрессом
```

### LessonCard компонент

```tsx
// Переиспользуем структуру CourseCard
interface LessonCardProps {
  lesson: Lesson;
  isCompleted: boolean;
  enrichments: LessonEnrichment[];
  onComplete?: () => void;
}

// Badges для медиа:
// 🎬 Video (completed/generating/pending)
// 🎧 Audio
// 📊 Presentation
// ❓ Quiz
// ✅ Completed indicator
```

### Автоматический tracking прогресса

**Триггеры завершения урока:**

- Просмотр видео ≥80% длительности
- Scroll до конца текстового контента
- Прохождение quiz (любой результат)
- Открытие presentation (≥50% слайдов)

**Таблица БД:**

```sql
CREATE TABLE lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  lesson_id UUID REFERENCES lessons NOT NULL,
  course_id UUID REFERENCES courses NOT NULL,
  status TEXT DEFAULT 'not_started', -- not_started, in_progress, completed
  progress_percent INT DEFAULT 0,
  completed_at TIMESTAMPTZ,
  video_watched_percent INT DEFAULT 0,
  content_read_percent INT DEFAULT 0,
  quiz_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, lesson_id)
);
```

### Геймификация

**Элементы:**

1. **Milestones** (уже есть в `LessonProgressCard`):
   - "Отличное начало!" — первый урок
   - "Половина пройдена!" — 50%
   - "Финишная прямая!" — 75%
   - "Курс завершён!" — 100%

2. **Streak счётчик**:
   - Дни подряд с активностью
   - Визуальный индикатор 🔥

3. **Badges достижений** (будущее расширение):
   - "Ранняя пташка" — первый урок до 8 утра
   - "Марафонец" — 5 уроков за день
   - "Перфекционист" — 100% на quiz

### API endpoints

```
GET  /api/courses/[slug]/lessons          — список уроков с enrichments и прогрессом
POST /api/courses/[slug]/lessons/[id]/progress — обновить прогресс (автоматически)
GET  /api/courses/[slug]/progress         — общий прогресс курса (существующий)
GET  /api/user/streak                     — текущий streak пользователя
```

### Этапы реализации

**Этап 1: LessonCard компонент**

1. Создать `lesson-card.tsx` с grid variant
2. Реализовать status badges (not_started/in_progress/completed)
3. Добавить media badges (🎬🎧📊❓)
4. Интегрировать SmoothProgress для прогресса
5. Добавить Framer Motion анимации (hover: y=-2, icon scale)
6. Поддержка Dark/Light mode

**Этап 2: Страница и Grid** 7. Создать `page.tsx` серверный компонент 8. Создать `lessons-content.tsx` клиентский контент 9. Создать `lesson-grid.tsx` с responsive breakpoints (1-2-3 колонки) 10. Создать `lessons-filters.tsx` (все/пройденные/не пройденные/с видео) 11. Добавить `loading.tsx` со скелетонами

**Этап 3: i18n** 12. Создать `messages/ru/lesson.json` 13. Создать `messages/en/lesson.json` 14. Интегрировать useTranslations в компоненты

**Этап 4: Прогресс и tracking** 15. Создать миграцию `lesson_progress` в Supabase 16. Реализовать API endpoint `POST /api/courses/[slug]/lessons/[id]/progress` 17. Интегрировать автоматический tracking (video 80%, scroll, quiz)

**Этап 5: Header с геймификацией** 18. Интегрировать `LessonProgressCard` в header (уже с milestones!) 19. Добавить streak счётчик 🔥 20. Toast уведомления при достижении milestones (sonner)

### Стратегия переиспользования

| Что нужно           | Существующий компонент   | Действие                                                       |
| ------------------- | ------------------------ | -------------------------------------------------------------- |
| Карточка урока      | `CourseCard`             | Создать `LessonCard` с той же структурой, адаптировать props   |
| Сетка карточек      | `CourseGrid`             | Переиспользовать напрямую или создать `LessonGrid` на его базе |
| Header с прогрессом | `LessonProgressCard`     | **Переиспользовать напрямую** — уже есть milestones!           |
| Badges статусов     | `Badge`, `StatusBadge`   | **Переиспользовать напрямую**                                  |
| Progress bar        | `SmoothProgress`         | **Переиспользовать напрямую**                                  |
| Skeleton loading    | `CourseCardSkeleton`     | Адаптировать для `LessonCardSkeleton`                          |
| Фильтры             | `CoursesFiltersImproved` | Создать `LessonsFilters` на его базе                           |
| Toast уведомления   | `sonner` (уже в проекте) | **Переиспользовать напрямую**                                  |

**Итого:**

- ✅ 5 компонентов переиспользуются напрямую
- 🔄 3 компонента адаптируются из существующих
- ➕ 1 страница создаётся (page.tsx)

### Файлы для создания/изменения

```
НОВЫЕ ФАЙЛЫ:
packages/web/app/[locale]/courses/[slug]/lessons/
  page.tsx                    — серверный компонент
  loading.tsx                 — skeleton (на базе CourseCardSkeleton)
  _components/
    lessons-content.tsx       — клиентский контент
    lesson-card.tsx           — карточка урока (см. дизайн выше)
    lesson-grid.tsx           — grid с анимациями Framer Motion
    lessons-filters.tsx       — фильтры (на базе CoursesFiltersImproved)
    lessons-header.tsx        — LessonProgressCard + streak

messages/ru/lesson.json       — i18n ключи (RU)
messages/en/lesson.json       — i18n ключи (EN)

packages/course-gen-platform/supabase/migrations/
  YYYYMMDD_lesson_progress.sql — таблица прогресса

ПЕРЕИСПОЛЬЗУЕМ БЕЗ ИЗМЕНЕНИЙ:
  components/common/lesson-progress-card.tsx  — header с milestones ✅
  components/ui/badge.tsx                     — badges ✅
  components/ui/smooth-progress.tsx           — progress bars ✅
  lib/utils.ts (cn)                           — class merge ✅
  lucide-react                                — иконки ✅
  framer-motion                               — анимации ✅
```

### Верификация

**UI/UX:**

1. Страница `/courses/test-course/lessons` отображает карточки
2. LessonCard выглядит компактно (280px) и согласованно с CourseCard
3. Badges медиа показывают корректные статусы (🎬✓, 🎧○, ❓✗)
4. Hover эффекты работают (y=-2, border glow, icon scale)
5. Dark mode корректно переключается

**Функционал:** 6. Фильтры: все / пройденные / не пройденные / с видео 7. Progress header показывает общий % и streak 🔥 8. Milestone toast появляется при достижении 50% 9. Прогресс автоматически трекается

**Качество:** 10. Mobile responsive (1-2-3 колонки) 11. i18n работает (RU/EN переключение) 12. `pnpm type-check && pnpm build` проходят 13. RLS политики на `lesson_progress` корректны

---

## Ссылки

- **Детальный дизайн**: `docs/plans/parallel-drifting-reddy-agent-aab98ed.md`
  - JSX mockup LessonCard
  - Полная цветовая схема
  - TypeScript интерфейсы
  - Accessibility guidelines
