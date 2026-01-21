# План: Применение стиля Hover Reveal к основной карточке курса

## Цель

Адаптировать стиль Hover Reveal из демо к основной карточке курсов, сохранив всю функциональность.

---

## Анализ различий

| Аспект    | Текущая карточка         | Hover Reveal (цель)         |
| --------- | ------------------------ | --------------------------- |
| Обложка   | Фон + glassmorphism blur | Основное изображение сверху |
| Структура | Всё показано сразу       | Базовое + детали при hover  |
| Анимации  | Минимальные              | Framer Motion, плавные      |
| Высота    | min-h-[420-460px]        | min-h-[480px]               |
| Hover     | Только тени              | Выезжающая панель снизу     |

---

## Файл для изменения

```
app/[locale]/courses/_components/course-card.tsx
```

---

## План реализации

### 1. Новая структура Grid View

**Было:**

```
┌─────────────────────────────┐
│ [Cover как фон с blur]      │
│ ┌─────────────────────────┐ │
│ │ Badges, Title, Desc...  │ │
│ │ Stats grid 2x2          │ │
│ │ [Открыть курс]          │ │
│ └─────────────────────────┘ │
│ Footer: actions             │
└─────────────────────────────┘
```

**Станет:**

```
NORMAL STATE:
┌─────────────────────────────┐
│                             │
│      Cover Image            │
│      (flex-1, min-h-280px)  │
│   [Badges поверх]           │
│                             │
├─────────────────────────────┤
│  Title (2 строки max)       │
│  📚 N модулей  •  ⏱ Nч     │
└─────────────────────────────┘

HOVER STATE:
┌─────────────────────────────┐
│      Cover (затемнена)      │
│   [Badges]                  │
├─────────────────────────────┤
│  ░░ Выезжающая панель ░░░░  │
│  Title                      │
│  Description                │
│  👥 Target audience         │
│  🎯 Learning outcomes       │
│  [Progress bar если есть]   │
│  [Открыть курс →]           │
│  ─────────────────────────  │
│  ♥ Share Visibility Workflow│
└─────────────────────────────┘
```

### 2. Изменения в коде

#### 2.1 Добавить импорт Framer Motion

```tsx
import { motion, AnimatePresence } from 'framer-motion'
```

#### 2.2 Добавить state для hover

```tsx
const [isHovered, setIsHovered] = useState(false)
```

#### 2.3 Заменить Card на motion.div

- Убрать `<Card>` wrapper
- Использовать `<motion.div>` с `onMouseEnter/onMouseLeave`
- Сохранить `onClick`, keyboard navigation, aria-labels

#### 2.4 Cover Image секция (новая)

```tsx
<div className="relative flex-1 min-h-[280px] overflow-hidden">
  {hasCover ? (
    <Image ... className={cn(
      'object-cover transition-all duration-500',
      isHovered && 'scale-105 brightness-90 dark:scale-110 dark:brightness-75'
    )} />
  ) : (
    <div className="flex h-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-slate-800 dark:to-slate-900">
      <BookOpen className="h-16 w-16 text-gray-400 dark:text-slate-700" />
    </div>
  )}
  {/* Badges поверх */}
  <div className="absolute top-4 left-4 flex flex-wrap gap-2">
    {/* Status + Difficulty badges */}
  </div>
</div>
```

#### 2.5 Base Content (всегда видимый)

```tsx
<div className="p-4">
  <h3 className="line-clamp-2 text-base font-semibold ...">{course.title}</h3>
  <div className="mt-2 flex items-center gap-4 text-sm text-gray-500 dark:text-slate-400">
    <span>📚 {sectionsCount} модулей</span>
    <span>⏱ {duration}ч</span>
  </div>
</div>
```

#### 2.6 Hover Reveal Panel (AnimatePresence)

```tsx
<AnimatePresence>
  {isHovered && (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="absolute inset-x-0 bottom-0 backdrop-blur-md ..."
    >
      {/* Title */}
      {/* Description */}
      {/* Target audience */}
      {/* Learning outcomes (max 2) */}
      {/* Progress bar (если генерируется) */}
      {/* CTA кнопка */}
      {/* Divider */}
      {/* Actions: Favorite, Share, Visibility, Workflow, Delete */}
    </motion.div>
  )}
</AnimatePresence>
```

### 3. Адаптивность темы

Использовать стандартные `dark:` модификаторы Tailwind:

- Light: белый фон панели, серые тени (`shadow-md`)
- Dark: slate-900 фон, глубокие тени (`shadow-lg`)

### 4. Сохранить функциональность

- Все handlers без изменений
- Keyboard navigation (Enter/Space → handleView)
- Accessibility (aria-labels, role="article")
- **List view — НЕ ТРОГАЕМ**

---

## Что НЕ меняем

1. **List view** — оставляем полностью как есть
2. **Props interface** — все пропсы сохраняются
3. **Handlers** — delete, favorite, share, visibility, workflow
4. **Конфиги** — statusConfig, difficultyConfig, visibilityConfig

---

## Верификация

1. `pnpm type-check` — без ошибок
2. Проверить `/courses`:
   - [ ] Обложка как основное изображение (не фон)
   - [ ] Hover показывает выезжающую панель с анимацией
   - [ ] Light/Dark тема работает корректно
   - [ ] Actions работают (favorite, share, visibility, workflow, delete)
   - [ ] Курсы без обложки показывают placeholder
   - [ ] Курсы в генерации показывают progress bar
   - [ ] Keyboard navigation работает
3. Проверить list view — не сломан
4. Mobile: tap на карточку → панель появляется
