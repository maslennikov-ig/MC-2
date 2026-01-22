# Дизайн-концепция LessonCard

## Анализ существующих компонентов

### CourseCard (базовый стиль)

- **Размер**: min-h-[480px], адаптивная высота
- **Структура**: Обложка (280px) + контент (p-4) + hover panel (AnimatePresence)
- **Анимации**:
  - Framer Motion: whileHover (y: -4), transition 0.3s
  - Hover reveal panel: y: 100% → y: 0, transition 0.35s easeOut
  - Image scale на hover: scale-105 (light), scale-110 (dark)
- **Эффекты**:
  - Gradient overlay снизу изображения: from-black/40 (light), from-black/60 (dark)
  - Backdrop-blur-md на hover panel
  - Shadow: md → xl на hover
  - Border: border-gray-200 (light), border-slate-800 (dark)
  - Rounded: rounded-2xl
- **Badges**:
  - Абсолютное позиционирование (top-4 left-4)
  - Backdrop-blur-sm, цветовая кодировка статусов
  - Pulse animation для processing/generating
- **Progress bar**: Radix Progress, h-1.5, показывается только при isGenerating

### LessonProgressCard (стиль прогресса)

- **Цветовая схема**:
  - Gradient background: from-purple-500/10 via-blue-500/5 to-indigo-500/10
  - Dark: from-purple-900/30 via-blue-900/20 to-indigo-900/30
  - Border: purple-200/50 (light), purple-700/40 (dark)
- **SmoothProgress**:
  - Spring animation (stiffness: 100, damping: 30, mass: 0.5)
  - Варианты: default, gradient, striped
  - Размеры: sm (h-1), md (h-2), lg (h-3)
- **Achievements**:
  - 0%: null
  - 25%: Sparkles, green-500
  - 50%: Target, blue-500
  - 75%: TrendingUp, purple-500
  - 100%: Award, yellow-500 (с ping animation)

### StatusBadge (используется в generation-graph)

- **Статусы курсов** (из CourseCard):
  - draft: gray-500/10, gray-400, BookOpen
  - generating: blue-500/10, blue-400, Zap, pulse
  - processing: yellow-500/10, yellow-400, Settings, pulse
  - structure_ready: purple-500/10, purple-400, ClipboardList
  - completed: green-500/10, green-400, CheckCircle
  - failed: red-500/10, red-400, AlertCircle
  - mixed: orange-500/10, orange-400, Settings

### Цветовая система проекта (globals.css)

- **Purple brand**: 500 (#8b5cf6), 600 (#7c3aed), 700 (#6d28d9)
- **Status colors**:
  - Success: 160 84% 39% (green)
  - Warning: 43 96% 56% (amber)
  - Info: 217 91% 60% (blue)
  - Danger: 0 84% 60% (red)
- **Typography scale**: xs (12px), sm (14px), base (16px), lg (18px), xl (20px)
- **Spacing**: 4px base grid
- **Border radius**: sm (0.25rem), md (0.5rem), lg (0.75rem), xl (1rem), 2xl (1.5rem)
- **Shadows**: xs, sm, md, lg, xl, 2xl
- **Animations**: fade-in (0.5s), slide-up (0.3s), shimmer (2s)

---

## Дизайн-концепция LessonCard

### Общая философия

LessonCard должна быть **компактнее** CourseCard (уроков больше, чем курсов), но сохранять общий визуальный язык:

- Тот же purple brand accent
- Похожие hover эффекты
- Консистентные badges
- Framer Motion анимации

### Структура компонента

#### Вариант 1: Compact Card (рекомендуемый для grid)

```
┌─────────────────────────────────┐
│ [Badge: Video] [Badge: Quiz]   │ <- Media badges (absolute, top-2 left-2)
│                                 │
│     [Icon: Video/Book/etc]      │ <- Lesson type icon (center)
│                                 │ <- min-h-[200px] для компактности
│                                 │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ Название урока (line-clamp-2)   │
│ ────────────────────────────    │ <- Progress bar (SmoothProgress)
│ [Status] [Duration: 15мин]      │ <- StatusBadge + Clock icon
└─────────────────────────────────┘
```

**Размеры**:

- **Card**: min-h-[280px] (vs CourseCard 480px)
- **Icon area**: min-h-[160px] (background area)
- **Content**: p-3 (vs CourseCard p-4)
- **Border radius**: rounded-xl (vs CourseCard rounded-2xl)

**Hover behavior**:

- **NO hover reveal panel** (слишком много карточек)
- **Simple effects**:
  - Scale icon: scale-110
  - Border glow: border-purple-400/50
  - Shadow: md → lg

---

#### Вариант 2: List View (для course detail page)

```
┌──────────────────────────────────────────────────────────────┐
│ [Icon] Название урока                      [Status] [15мин]  │
│        ────────────────── 60%                                 │ <- Progress inline
│        [Video] [Quiz]                                         │ <- Media badges
└──────────────────────────────────────────────────────────────┘
```

**Размеры**:

- Height: h-auto, py-3 px-4
- Icon: h-10 w-10
- Progress: h-1.5 (inline, width: 120px)

---

### Цветовая схема для статусов уроков

#### Статусы прохождения (Lesson Completion Status)

| Статус          | Цвет  | Icon         | Background                           | Text                               | Border                                       |
| --------------- | ----- | ------------ | ------------------------------------ | ---------------------------------- | -------------------------------------------- |
| **not_started** | Gray  | BookOpen     | bg-gray-100 dark:bg-slate-800        | text-gray-600 dark:text-slate-400  | border-gray-200/50 dark:border-slate-700/50  |
| **in_progress** | Blue  | Play         | bg-blue-500/10 dark:bg-blue-900/30   | text-blue-600 dark:text-blue-400   | border-blue-200/50 dark:border-blue-700/50   |
| **completed**   | Green | CheckCircle2 | bg-green-500/10 dark:bg-green-900/30 | text-green-600 dark:text-green-400 | border-green-200/50 dark:border-green-700/50 |

**Reasoning**:

- Gray для not_started (нейтральный, ожидающий)
- Blue для in_progress (активный, в работе) - консистентен с statusConfig.processing
- Green для completed (успех, завершено) - консистентен с statusConfig.completed

#### Media Content Badges

Badges показывают **наличие** контента (не кликабельные, информационные):

| Type         | Emoji | Label RU    | Label EN | Color                          |
| ------------ | ----- | ----------- | -------- | ------------------------------ |
| Video        | 🎬    | Видео       | Video    | purple-500/10, purple-600 text |
| Audio        | 🎧    | Аудио       | Audio    | blue-500/10, blue-600 text     |
| Presentation | 📊    | Презентация | Slides   | indigo-500/10, indigo-600 text |
| Quiz         | ❓    | Тест        | Quiz     | amber-500/10, amber-600 text   |

**Styling**:

```tsx
<Badge className="text-xs px-2 py-0.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200/30 dark:border-purple-700/30">
  🎬 Видео
</Badge>
```

**Positioning**:

- Compact card: absolute top-2 left-2, flex gap-1, flex-wrap
- List view: inline after progress, flex gap-1

---

### Прогресс просмотра (Progress Bar)

**SmoothProgress integration**:

```tsx
<SmoothProgress
  value={viewProgressPercentage} // 0-100
  size="sm" // h-1 для compact
  variant="gradient" // from-blue-500 via-purple-500 to-blue-500
  className="mt-2"
/>
```

**Logic**:

- `viewProgressPercentage = (watchedSeconds / totalDurationSeconds) * 100`
- Показывать только если `status === 'in_progress' || status === 'completed'`
- Completed: progress = 100%, показывать CheckCircle2 icon

---

### Hover/Animation эффекты

#### Compact Card (Grid)

**Initial state**:

```tsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3 }}
  whileHover={{ y: -2 }}  // Subtle lift (vs CourseCard -4)
  className="..."
>
```

**Hover effects**:

- Border: `hover:border-purple-300/60 dark:hover:border-purple-600/50`
- Shadow: `shadow-sm hover:shadow-md` (subtle)
- Icon scale: `group-hover:scale-110 transition-transform duration-300`
- Progress glow: `hover:shadow-[0_0_12px_rgba(139,92,246,0.3)]`

**No AnimatePresence panel** (слишком много уроков, избегаем информационной перегрузки)

#### List View

**Hover effects**:

- Background: `hover:bg-gray-50 dark:hover:bg-slate-900/50`
- Border: `hover:border-purple-200/50 dark:hover:border-purple-700/50`
- Transform: `transition-smooth hover:translate-x-1` (slide right)

---

### Layout в Grid (1-2-3 колонки)

#### Tailwind Grid Classes

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
  <LessonCard ... />
  <LessonCard ... />
  <LessonCard ... />
</div>
```

#### Responsive Breakpoints

- **Mobile (< 640px)**: 1 колонка
  - Card width: 100%
  - Min-height: 280px
  - Font: text-sm для названия
  - Badges: text-xs
  - Icon: h-12 w-12

- **Tablet (640px - 1024px)**: 2 колонки
  - Card width: ~48%
  - Min-height: 280px
  - Font: text-base для названия
  - Badges: text-xs
  - Icon: h-14 w-14

- **Desktop (1024px+)**: 3 колонки
  - Card width: ~32%
  - Min-height: 280px
  - Font: text-base для названия
  - Badges: text-xs
  - Icon: h-16 w-16

#### Gap strategy

- Mobile: gap-4 (16px)
- Desktop: gap-6 (24px)
- Consistent with 4px grid system

---

### Структура данных (TypeScript)

```tsx
interface LessonCardProps {
  lesson: {
    id: string;
    title: string;
    duration_minutes: number; // Total lesson duration
    status: 'not_started' | 'in_progress' | 'completed';

    // Media content flags
    has_video: boolean;
    has_audio: boolean;
    has_presentation: boolean;
    has_quiz: boolean;

    // Progress tracking
    watched_seconds?: number; // User's watch progress
    total_duration_seconds?: number;
    view_progress_percentage?: number; // Calculated 0-100
  };

  // Display options
  viewMode?: 'grid' | 'list';
  onClick?: () => void;
  className?: string;
}
```

---

### JSX Mockup (Compact Grid Variant)

```tsx
'use client';

import { motion } from 'framer-motion';
import { BookOpen, Play, CheckCircle2, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SmoothProgress } from '@/components/ui/smooth-progress';
import { cn } from '@/lib/utils';

export function LessonCard({ lesson, viewMode = 'grid', onClick, className }: LessonCardProps) {
  const statusConfig = {
    not_started: {
      color:
        'bg-gray-100 text-gray-600 border-gray-200/50 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700/50',
      label: 'Не начат',
      icon: BookOpen,
    },
    in_progress: {
      color:
        'bg-blue-500/10 text-blue-600 border-blue-200/50 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700/50',
      label: 'В процессе',
      icon: Play,
    },
    completed: {
      color:
        'bg-green-500/10 text-green-600 border-green-200/50 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700/50',
      label: 'Завершён',
      icon: CheckCircle2,
    },
  };

  const mediaContent = [
    {
      flag: lesson.has_video,
      emoji: '🎬',
      label: 'Видео',
      color:
        'bg-purple-500/10 text-purple-600 border-purple-200/30 dark:text-purple-400 dark:border-purple-700/30',
    },
    {
      flag: lesson.has_audio,
      emoji: '🎧',
      label: 'Аудио',
      color:
        'bg-blue-500/10 text-blue-600 border-blue-200/30 dark:text-blue-400 dark:border-blue-700/30',
    },
    {
      flag: lesson.has_presentation,
      emoji: '📊',
      label: 'Слайды',
      color:
        'bg-indigo-500/10 text-indigo-600 border-indigo-200/30 dark:text-indigo-400 dark:border-indigo-700/30',
    },
    {
      flag: lesson.has_quiz,
      emoji: '❓',
      label: 'Тест',
      color:
        'bg-amber-500/10 text-amber-600 border-amber-200/30 dark:text-amber-400 dark:border-amber-700/30',
    },
  ].filter(item => item.flag);

  const statusInfo = statusConfig[lesson.status];
  const progressPercentage = lesson.view_progress_percentage || 0;
  const showProgress = lesson.status !== 'not_started';

  if (viewMode === 'grid') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        whileHover={{ y: -2 }}
        onClick={onClick}
        className={cn(
          'group relative cursor-pointer overflow-hidden',
          'min-h-[280px] flex flex-col',
          'rounded-xl border border-gray-200 bg-white',
          'dark:border-slate-800 dark:bg-slate-900',
          'shadow-sm hover:shadow-md',
          'hover:border-purple-300/60 dark:hover:border-purple-600/50',
          'transition-all duration-300',
          className
        )}
      >
        {/* Icon Background Area */}
        <div className="relative min-h-[160px] flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-slate-800 dark:to-slate-900">
          {/* Media badges */}
          {mediaContent.length > 0 && (
            <div className="absolute top-2 left-2 flex flex-wrap gap-1">
              {mediaContent.map((item, idx) => (
                <Badge key={idx} className={cn('text-xs px-2 py-0.5 border', item.color)}>
                  {item.emoji}
                </Badge>
              ))}
            </div>
          )}

          {/* Lesson type icon */}
          <statusInfo.icon className="h-14 w-14 text-gray-400 dark:text-slate-600 group-hover:scale-110 transition-transform duration-300" />

          {/* Gradient overlay (if completed) */}
          {lesson.status === 'completed' && (
            <div className="absolute inset-0 bg-gradient-to-t from-green-500/10 to-transparent" />
          )}
        </div>

        {/* Content */}
        <div className="p-3 flex-1 flex flex-col">
          {/* Title */}
          <h3 className="text-base font-semibold text-gray-900 dark:text-white line-clamp-2 mb-2">
            {lesson.title}
          </h3>

          {/* Progress bar */}
          {showProgress && (
            <div className="mb-2">
              <SmoothProgress value={progressPercentage} size="sm" variant="gradient" />
            </div>
          )}

          {/* Footer: Status + Duration */}
          <div className="mt-auto flex items-center justify-between">
            <Badge className={cn('text-xs px-2 py-1 border', statusInfo.color)}>
              <statusInfo.icon className="mr-1 h-3 w-3" />
              {statusInfo.label}
            </Badge>

            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400">
              <Clock className="h-3 w-3" />
              {lesson.duration_minutes}мин
            </span>
          </div>
        </div>
      </motion.div>
    );
  }

  // List view (simplified for course detail page)
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-4 p-4 rounded-lg border border-gray-200 dark:border-slate-800',
        'bg-white dark:bg-slate-900',
        'hover:bg-gray-50 dark:hover:bg-slate-900/50',
        'hover:border-purple-200/50 dark:hover:border-purple-700/50',
        'transition-smooth hover:translate-x-1 cursor-pointer',
        className
      )}
    >
      {/* Icon */}
      <div className="shrink-0">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500/10 to-blue-500/10 dark:from-purple-900/30 dark:to-blue-900/30 flex items-center justify-center">
          <statusInfo.icon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white truncate mb-1">
          {lesson.title}
        </h4>

        {/* Progress + Media badges */}
        <div className="flex items-center gap-2">
          {showProgress && (
            <SmoothProgress
              value={progressPercentage}
              size="sm"
              variant="gradient"
              className="w-32"
            />
          )}

          {mediaContent.length > 0 && (
            <div className="flex gap-1">
              {mediaContent.map((item, idx) => (
                <span key={idx} className="text-xs">
                  {item.emoji}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Status + Duration */}
      <div className="shrink-0 flex items-center gap-2">
        <Badge className={cn('text-xs px-2 py-1 border', statusInfo.color)}>
          {statusInfo.label}
        </Badge>

        <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400">
          <Clock className="h-3 w-3" />
          {lesson.duration_minutes}мин
        </span>
      </div>
    </div>
  );
}
```

---

### Интернационализация (next-intl)

**Translation keys** (messages/ru.json, messages/en.json):

```json
{
  "lesson": {
    "status": {
      "not_started": "Не начат",
      "in_progress": "В процессе",
      "completed": "Завершён"
    },
    "media": {
      "video": "Видео",
      "audio": "Аудио",
      "slides": "Слайды",
      "quiz": "Тест"
    },
    "duration": {
      "minutes": "мин",
      "hours": "ч"
    }
  }
}
```

**Usage**:

```tsx
import { useTranslations } from 'next-intl'

const t = useTranslations('lesson')

<Badge>
  {t('status.in_progress')}
</Badge>
```

---

## Рекомендации по реализации

### 1. Компонентная архитектура

```
packages/web/components/lessons/
├── lesson-card.tsx          # Main component (grid + list variants)
├── lesson-media-badges.tsx  # Reusable media badges
└── lesson-status-badge.tsx  # Status badge with i18n
```

### 2. Приоритет features

**Must-have** (MVP):

- Grid variant с compact design
- Status badges (not_started, in_progress, completed)
- Media content badges (video, audio, slides, quiz)
- Duration display
- Basic hover effects

**Nice-to-have** (v2):

- List variant для course detail
- Progress bar с SmoothProgress
- Advanced hover animations
- Accessibility (keyboard navigation, ARIA labels)

### 3. Accessibility

- **Keyboard navigation**: tabIndex={0}, onKeyDown для Enter/Space
- **ARIA labels**: role="article", aria-labelledby для title
- **Focus states**: focus:ring-2 focus:ring-purple-500
- **Screen reader**: sr-only для иконок, alt text для media

### 4. Performance

- **Lazy loading**: React.lazy для grid с >50 карточек
- **Virtualization**: react-window для больших списков
- **Image optimization**: Next.js Image component (если добавим thumbnails)
- **Animation optimization**: GPU acceleration, will-change: transform

### 5. Testing

- **Snapshot tests**: Different states (not_started, in_progress, completed)
- **Interaction tests**: Click, hover, keyboard navigation
- **Responsive tests**: Mobile, tablet, desktop breakpoints
- **Dark mode tests**: Light/dark theme switching

---

## Сравнение с CourseCard

| Aspect            | CourseCard                             | LessonCard (Compact)              |
| ----------------- | -------------------------------------- | --------------------------------- |
| **Height**        | min-h-[480px]                          | min-h-[280px]                     |
| **Image area**    | 280px                                  | 160px (icon area)                 |
| **Padding**       | p-4                                    | p-3                               |
| **Border radius** | rounded-2xl                            | rounded-xl                        |
| **Hover effect**  | y: -4, reveal panel                    | y: -2, no panel                   |
| **Content**       | Description, outcomes, target audience | Title, status, duration only      |
| **Badges**        | Status, difficulty                     | Status, media content             |
| **Progress**      | Only when generating                   | Always (if in_progress/completed) |
| **Animation**     | Complex (AnimatePresence)              | Simple (whileHover)               |

**Reasoning**: LessonCard должна быть визуально легче, т.к. их много на странице. CourseCard - это "hero" компонент, LessonCard - это "list item".

---

## Визуальная иерархия в Grid

```
Course Page Layout:
┌───────────────────────────────────────────────────────┐
│ CourseCard (hero, 1 column, full width)               │ <- min-h-[480px]
└───────────────────────────────────────────────────────┘

Lessons Grid (3 columns):
┌──────────┐ ┌──────────┐ ┌──────────┐
│ Lesson 1 │ │ Lesson 2 │ │ Lesson 3 │  <- min-h-[280px]
└──────────┘ └──────────┘ └──────────┘
┌──────────┐ ┌──────────┐ ┌──────────┐
│ Lesson 4 │ │ Lesson 5 │ │ Lesson 6 │
└──────────┘ └──────────┘ └──────────┘
```

**Visual weight distribution**:

- CourseCard: 40% of viewport height (dominant, detailed)
- LessonCards: 60% combined (grid, compact, scannable)

---

## Итоговые метрики дизайна

### Spacing (4px grid)

- Card padding: 12px (p-3)
- Gap between cards: 16px mobile, 24px desktop
- Badge gap: 4px (gap-1)
- Icon to text: 8px (gap-2)

### Typography

- Title: text-base (16px), font-semibold, line-clamp-2
- Badges: text-xs (12px), font-semibold
- Duration: text-xs (12px), text-gray-500

### Colors (Purple theme)

- Primary accent: purple-600 (#7c3aed)
- Hover border: purple-300/60 (light), purple-600/50 (dark)
- Progress gradient: blue-500 → purple-500 → blue-500

### Animations

- Card entrance: opacity 0→1, y 20→0, 0.3s
- Hover lift: y -2px
- Icon scale: 1 → 1.1, 0.3s
- Progress: spring (stiffness 100, damping 30)

### Shadows

- Rest: shadow-sm (0 1px 3px rgba(0,0,0,0.1))
- Hover: shadow-md (0 4px 6px rgba(0,0,0,0.1))

---

## Next Steps (Implementation Plan)

1. **Phase 1: Base Component** (2h)
   - Create LessonCard.tsx с grid variant
   - Implement status badges
   - Add media content badges
   - Duration display

2. **Phase 2: Styling** (1h)
   - Apply Tailwind classes
   - Dark mode variants
   - Hover effects
   - Responsive breakpoints

3. **Phase 3: Animations** (1h)
   - Framer Motion integration
   - SmoothProgress для progress bar
   - Icon hover scale

4. **Phase 4: Internationalization** (0.5h)
   - Add translation keys
   - useTranslations hook
   - Test RU/EN switching

5. **Phase 5: Accessibility** (0.5h)
   - ARIA labels
   - Keyboard navigation
   - Focus states

6. **Phase 6: Testing** (1h)
   - Snapshot tests
   - Interaction tests
   - Responsive tests

**Total estimate**: ~6 hours for full implementation

---

## Заключение

**LessonCard** получится:

- ✅ Компактнее CourseCard (280px vs 480px)
- ✅ Выдержит общий purple brand стиль
- ✅ Поддержит Light/Dark mode
- ✅ Интернационализирована (RU/EN)
- ✅ Переиспользует Badge, SmoothProgress
- ✅ Адаптивная (1-2-3 колонки)
- ✅ Accessibility-friendly
- ✅ Performance-optimized

**Визуальная согласованность с CourseCard**:

- Same border radius family (rounded-xl)
- Same shadow progression (sm → md)
- Same hover animations (Framer Motion)
- Same color palette (purple accents)
- Same badge styling (backdrop-blur, color-coded)

**Отличия (намеренные)**:

- Более компактная высота (меньше визуального веса)
- Без hover reveal panel (избегаем перегрузки)
- Simpler content (только essential info)
- Меньше анимационных эффектов (performance)
